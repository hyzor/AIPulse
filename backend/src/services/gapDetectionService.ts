import { TRACKED_STOCKS } from '../constants';
import { databaseService } from './databaseService';
import { redisService } from './redisService';
import { isTradingDay, getTradingDayBounds } from '../utils/marketHours';

import type { CollectionGap, GapDetectionResult, GapSummary } from '../types';

/**
 * Calculate the number of expected trading minutes between two timestamps.
 * Only counts minutes during market hours (9:30 AM - 4:00 PM ET) on trading days.
 */
function getExpectedTradingMinutes(from: number, to: number): number {
  if (from >= to) { return 0; }

  let totalMinutes = 0;
  const fromDate = new Date(from);

  // Iterate day by day
  const oneDayMs = 24 * 60 * 60 * 1000;
  let current = new Date(fromDate);
  const maxIterations = 35; // Safety limit for ~1 month ranges

  for (let i = 0; i < maxIterations; i++) {
    // Allow one extra day to ensure we cover the ET day containing 'to'
    if (current.getTime() > to + oneDayMs) {
      break;
    }

    if (isTradingDay(current)) {
      const bounds = getTradingDayBounds(current);
      const dayStart = bounds.from.getTime();
      const dayEnd = bounds.to.getTime();

      // Clip to the query range
      const effectiveStart = Math.max(dayStart, from);
      const effectiveEnd = Math.min(dayEnd, to);

      if (effectiveEnd > effectiveStart) {
        totalMinutes += Math.floor((effectiveEnd - effectiveStart) / 60000);
      }
    }

    // Move to next day
    current = new Date(current.getTime() + oneDayMs);
  }

  return totalMinutes;
}

/**
 * Calculate the actual trading gap bounds for a raw time interval.
 * Returns the first market open and the last market-related time within the gap,
 * so the UI can display "missing trading hours" instead of raw overnight spans.
 */
function getTradingGapBounds(from: number, to: number): {
  tradingStart: number;
  tradingEnd: number;
  tradingDurationMinutes: number;
} {
  if (from >= to) {
    return { tradingStart: from, tradingEnd: to, tradingDurationMinutes: 0 };
  }

  let tradingStart: number | null = null;
  let tradingEnd: number | null = null;

  const oneDayMs = 24 * 60 * 60 * 1000;
  let current = new Date(from);
  const maxIterations = 35;

  for (let i = 0; i < maxIterations; i++) {
    if (current.getTime() > to + oneDayMs) {
      break;
    }

    if (isTradingDay(current)) {
      const bounds = getTradingDayBounds(current);
      const dayOpen = bounds.from.getTime();
      const dayClose = bounds.to.getTime();

      // Clip to the gap interval
      const effectiveStart = Math.max(dayOpen, from);
      const effectiveEnd = Math.min(dayClose, to);

      if (effectiveEnd > effectiveStart) {
        if (tradingStart === null) {
          tradingStart = effectiveStart;
        }
        tradingEnd = effectiveEnd;
      }
    }

    current = new Date(current.getTime() + oneDayMs);
  }

  // Fallback: if no trading overlap found, return raw bounds
  if (tradingStart === null || tradingEnd === null) {
    return { tradingStart: from, tradingEnd: to, tradingDurationMinutes: 0 };
  }

  const tradingDurationMinutes = Math.floor((tradingEnd - tradingStart) / 60000);

  return { tradingStart, tradingEnd, tradingDurationMinutes };
}

/**
 * Detect collection gaps for a single symbol.
 *
 * A gap is defined as a period between two consecutive 1m candles where:
 * - The time difference exceeds `maxGapMinutes`
 * - The gap period overlaps with market hours
 */
async function detectGapsForSymbol(
  symbol: string,
  from: Date,
  to: Date,
  maxGapMinutes: number = 3,
): Promise<GapDetectionResult> {
  // Fetch candles from DB
  const dbCandles = await databaseService.getCandles1m(symbol, from, to);

  // Fetch candles from Redis
  let redisCandles: Awaited<ReturnType<typeof redisService.getCandles>> = [];
  if (redisService.getConnectionStatus()) {
    try {
      redisCandles = await redisService.getCandles(symbol, from.getTime(), to.getTime());
    } catch (err) {
      console.log(`[GapDetection] Redis fetch failed for ${symbol}:`, err);
    }
  }

  // Merge and deduplicate by timestamp (Redis wins if duplicate)
  const candleMap = new Map<number, { time: number }>();

  for (const c of dbCandles) {
    const t = new Date(c.time).getTime();
    candleMap.set(t, { time: t });
  }

  for (const c of redisCandles) {
    candleMap.set(c.time, { time: c.time });
  }

  // Sort by time ascending
  const sortedCandles = Array.from(candleMap.values()).sort((a, b) => a.time - b.time);

  const rangeFrom = from.getTime();
  const rangeTo = to.getTime();
  const maxGapMs = maxGapMinutes * 60 * 1000;

  const gaps: CollectionGap[] = [];

  // Find gaps between consecutive candles
  for (let i = 1; i < sortedCandles.length; i++) {
    const prev = sortedCandles[i - 1];
    const curr = sortedCandles[i];
    const diff = curr.time - prev.time;

    if (diff > maxGapMs) {
      // Check if this gap overlaps with market hours
      const tradingMinutesInGap = getExpectedTradingMinutes(prev.time, curr.time);

      // Only flag if the missing trading minutes exceed the threshold.
      // This prevents overnight/weekend gaps from being counted — e.g. a gap
      // from 16:00 market close to 09:31 next day has 1,000+ raw minutes but
      // only ~1 min of actual trading time, so it should NOT be flagged.
      if (tradingMinutesInGap >= maxGapMinutes) {
        const { tradingStart, tradingEnd, tradingDurationMinutes } =
          getTradingGapBounds(prev.time, curr.time);

        gaps.push({
          start: prev.time,
          end: curr.time,
          durationMinutes: Math.round(diff / 60000),
          tradingStart,
          tradingEnd,
          tradingDurationMinutes,
        });
      }
    }
  }

  // NOTE: We intentionally do NOT check for gaps from range boundaries to
  // first/last candle. A "gap" should only exist between two actual data
  // points. If the query range extends before collection started (e.g. 30D
  // view when only 19 days of data exist), the missing period is simply
  // "no data yet", not a collection gap.

  // Calculate coverage only for the period where we actually have data
  // (first candle to last candle). This gives a meaningful "how complete
  // was collection during the days we were running" metric rather than
  // penalising the user for days before the app existed.
  const firstCandleTime = sortedCandles.length > 0 ? sortedCandles[0].time : rangeFrom;
  const lastCandleTime = sortedCandles.length > 0 ? sortedCandles[sortedCandles.length - 1].time : rangeTo;
  const expectedMinutes = getExpectedTradingMinutes(firstCandleTime, lastCandleTime);
  const actualPoints = sortedCandles.length;
  const coveragePercent = expectedMinutes > 0
    ? Math.min(100, Math.round((actualPoints / expectedMinutes) * 100))
    : 0;

  return {
    symbol,
    rangeFrom,
    rangeTo,
    totalExpectedMinutes: expectedMinutes,
    actualDataPoints: actualPoints,
    coveragePercent,
    gaps,
    hasSignificantGaps: gaps.length > 0,
  };
}

class GapDetectionService {
  /**
   * Detect collection gaps for a specific symbol.
   */
  async detectGaps(
    symbol: string,
    range: '1d' | '7d' | '30d' = '1d',
    maxGapMinutes: number = 3,
  ): Promise<GapDetectionResult> {
    const now = new Date();
    let from: Date;

    switch (range) {
      case '1d':
        from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    return detectGapsForSymbol(symbol, from, now, maxGapMinutes);
  }

  /**
   * Detect collection gaps for all tracked symbols.
   */
  async detectGapsForAll(
    range: '1d' | '7d' | '30d' = '1d',
    maxGapMinutes: number = 3,
  ): Promise<GapDetectionResult[]> {
    const results: GapDetectionResult[] = [];

    for (const symbol of TRACKED_STOCKS) {
      try {
        const result = await this.detectGaps(symbol, range, maxGapMinutes);
        results.push(result);
      } catch (error) {
        console.error(`[GapDetection] Failed for ${symbol}:`, error);
        // Push a fallback result so the caller knows we tried
        results.push({
          symbol,
          rangeFrom: 0,
          rangeTo: 0,
          totalExpectedMinutes: 0,
          actualDataPoints: 0,
          coveragePercent: 0,
          gaps: [],
          hasSignificantGaps: false,
        });
      }
    }

    return results;
  }

  /**
   * Get a quick summary of gaps across all symbols.
   */
  async getSummary(
    range: '1d' | '7d' | '30d' = '1d',
    maxGapMinutes: number = 3,
  ): Promise<GapSummary> {
    const results = await this.detectGapsForAll(range, maxGapMinutes);

    const symbolsWithGaps = results.filter((r) => r.hasSignificantGaps);
    const totalGaps = results.reduce((sum, r) => sum + r.gaps.length, 0);

    let largestGapMinutes = 0;
    for (const r of results) {
      for (const gap of r.gaps) {
        if (gap.durationMinutes > largestGapMinutes) {
          largestGapMinutes = gap.durationMinutes;
        }
      }
    }

    const averageCoverage = results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + r.coveragePercent, 0) / results.length)
      : 0;

    // Worst symbols = lowest coverage, or those with largest gaps
    const worstSymbols = results
      .filter((r) => r.hasSignificantGaps)
      .sort((a, b) => a.coveragePercent - b.coveragePercent)
      .slice(0, 3)
      .map((r) => r.symbol);

    return {
      totalSymbols: results.length,
      symbolsWithGaps: symbolsWithGaps.length,
      totalGaps,
      largestGapMinutes,
      averageCoveragePercent: averageCoverage,
      worstSymbols,
    };
  }
}

export const gapDetectionService = new GapDetectionService();
