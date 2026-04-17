import { Router } from 'express';

import { TRACKED_STOCKS } from '../constants';
import { getCachedQuote, getAllCachedQuotes } from '../services/cacheLookupService';
import { cacheService } from '../services/cacheService';
import { candleBufferService } from '../services/candleBufferService';
import { databaseService } from '../services/databaseService';
import { finnhubService } from '../services/finnhubService';
import { redisService, type RedisCandle } from '../services/redisService';
import { isMarketOpen, getMarketStatus, getTradingDayBounds, getPreviousTradingDayBounds, getNextTradingDay } from '../utils/marketHours';

import type { HistoryResponse, CandleData, FlushResult } from '../types';

/**
 * Aggregate 1m candles to a higher resolution (5m, 10m, 30m, 4h)
 * This is used when merging Redis 1m data with DB data for chart freshness
 */
function aggregateCandles(candles: CandleData[], targetResolution: string): CandleData[] {
  const resolutionMs: Record<string, number> = {
    '5m': 5 * 60 * 1000,
    '10m': 10 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
  };

  const bucketSize = resolutionMs[targetResolution];
  if (!bucketSize || candles.length === 0) {
    return candles;
  }

  const buckets = new Map<number, CandleData>();

  for (const candle of candles) {
    // Round timestamp to bucket start
    const bucketTime = Math.floor(candle.t / bucketSize) * bucketSize;

    const existing = buckets.get(bucketTime);
    if (existing) {
      // Aggregate: first open, max high, min low, last close, sum volume
      existing.h = Math.max(existing.h, candle.h);
      existing.l = Math.min(existing.l, candle.l);
      existing.c = candle.c; // Last close wins
      existing.v = (existing.v || 0) + (candle.v || 0);
    } else {
      // First candle in bucket
      buckets.set(bucketTime, {
        t: bucketTime,
        o: candle.o,
        h: candle.h,
        l: candle.l,
        c: candle.c,
        v: candle.v || 0,
      });
    }
  }

  // Convert map to sorted array
  return Array.from(buckets.values()).sort((a, b) => a.t - b.t);
}

const router = Router();

// Get all tracked stocks quotes
router.get('/stocks', async (_req, res) => {
  try {
    // Check if market is closed - if so, serve from cache only
    if (!isMarketOpen()) {
      const marketStatus = getMarketStatus();
      console.log(`[API] Market closed (${marketStatus.message}) - serving all stocks from cache`);

      const cachedResults = await getAllCachedQuotes(TRACKED_STOCKS);

      // If we have cached data for all stocks, return it with market closed flag
      if (cachedResults.length === TRACKED_STOCKS.length) {
        // Add isMarketClosed flag since we're serving from cache when market is closed
        const cachedQuotes = cachedResults.map((r) => ({ ...r.quote, isMarketClosed: true }));
        return res.json({
          success: true,
          data: cachedQuotes,
          count: cachedQuotes.length,
          cached: true,
          marketStatus: marketStatus.message,
          timestamp: Date.now(),
        });
      }

      // Some symbols missing from cache - fall through to API call
      console.log(`[API] Only ${cachedResults.length}/${TRACKED_STOCKS.length} symbols in cache, fetching missing from API`);
    }

    const quotes = await finnhubService.getQuotes([...TRACKED_STOCKS]);

    return res.json({
      success: true,
      data: quotes,
      count: quotes.length,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[API] Error fetching stocks:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch stock data',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get quote for specific symbol
router.get('/stocks/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const uppercaseSymbol = symbol.toUpperCase();

  try {
    // Check if market is closed - if so, try cache first
    if (!isMarketOpen()) {
      const marketStatus = getMarketStatus();
      const cachedResult = await getCachedQuote(uppercaseSymbol);

      if (cachedResult) {
        console.log(`[API] Market closed - serving ${uppercaseSymbol} from cache (${cachedResult.source})`);
        return res.json({
          success: true,
          data: { ...cachedResult.quote, isMarketClosed: true },
          cached: true,
          marketStatus: marketStatus.message,
          timestamp: Date.now(),
        });
      }

      // No cached data - fall through to API call
      console.log(`[API] Market closed but no cache for ${uppercaseSymbol} - fetching from API`);
    }

    const quote = await finnhubService.getQuote(uppercaseSymbol);

    return res.json({
      success: true,
      data: quote,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error(`[API] Error fetching ${uppercaseSymbol}:`, error);
    return res.status(500).json({
      success: false,
      error: `Failed to fetch data for ${uppercaseSymbol}`,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get company profile
router.get('/profile/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const uppercaseSymbol = symbol.toUpperCase();

  try {
    const profile = await finnhubService.getCompanyProfile(uppercaseSymbol);

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: `Profile not found for ${uppercaseSymbol}`,
      });
    }

    return res.json({
      success: true,
      data: {
        symbol: uppercaseSymbol,
        ...profile,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error(`[API] Error fetching profile for ${uppercaseSymbol}:`, error);
    return res.status(500).json({
      success: false,
      error: `Failed to fetch profile for ${uppercaseSymbol}`,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Clear cache (admin endpoint)
router.post('/cache/clear', (_req, res) => {
  cacheService.flush();

  res.json({
    success: true,
    message: 'Cache cleared successfully',
    timestamp: Date.now(),
  });
});

// Rate limit status
router.get('/rate-limit', (_req, res) => {
  const status = finnhubService.getRateLimitStatus();

  res.json({
    success: true,
    data: {
      ...status,
      maxPerMinute: 60,
      tier: 'free',
    },
    timestamp: Date.now(),
  });
});

// Get historical price data for a symbol
router.get('/stocks/:symbol/history', async (req, res) => {
  const { symbol } = req.params;
  const uppercaseSymbol = symbol.toUpperCase();

  // Parse query parameters
  const range = (req.query.range as string) || '7d';
  // Chart resolution strategy (trading-hours focused, not 24h):
  // - 1D: 5m resolution (granular intraday view, ~78 points for 6.5h trading day)
  // - 7D: 30m resolution (30-min buckets, ~91 points for 6.5h × 7 days)
  // - 30D: 1h resolution (hourly candles from aggregates, ~195 points for 30 days)
  // - 90D, 1y: 1d resolution (daily)
  let resolution = (req.query.resolution as '1m' | '5m' | '10m' | '30m' | '1h' | '4h' | '1d');
  if (!resolution) {
    switch (range) {
      case '1d':
        resolution = '5m';
        break;
      case '7d':
        resolution = '30m';
        break;
      case '30d':
        resolution = '1h';
        break;
      case '90d':
      case '1y':
        resolution = '1d';
        break;
      default:
        resolution = '1h';
    }
  }

  // Use client's timestamp if provided (for timezone-aware ranges), otherwise use server time
  // Protect against clients with wrong system time or malicious future dates
  const MAX_TIME_DRIFT_MS = 24 * 60 * 60 * 1000; // 1 day tolerance
  const clientNow = req.query.now ? new Date(parseInt(req.query.now as string, 10)) : null;

  let now: Date;
  if (clientNow) {
    const drift = Math.abs(clientNow.getTime() - Date.now());
    if (drift > MAX_TIME_DRIFT_MS) {
      console.warn(`[API] Rejecting suspicious client time (drift: ${Math.round(drift / 1000 / 60)}min), using server time`);
      now = new Date();
    } else {
      now = clientNow;
    }
  } else {
    now = new Date();
  }
  let from: Date;
  let to: Date = now;

  switch (range) {
    case '1d': {
      // 1D view: Show the last trading day's market hours (9:30 AM - 4:00 PM ET)
      // If market is open, show current trading day from market open
      // If market is closed, show the most recent completed trading day
      if (isMarketOpen(now)) {
        // Market is open - show from today's market open to now
        const bounds = getTradingDayBounds(now);
        ({ from } = bounds);
      } else {
        // Market is closed - show the most recent completed trading day
        const bounds = getPreviousTradingDayBounds(now);
        ({ from } = bounds);
        // When market is closed, also adjust 'to' to market close time
        const prevBounds = getPreviousTradingDayBounds(now);
        ({ to } = prevBounds);
      }
      break;
    }
    case '7d':
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case '1y':
      from = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    default: {
      // Try to parse as number of days
      const days = parseInt(range, 10);
      if (!isNaN(days)) {
        from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      } else {
        from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      }
      break;
    }
  }

  // Resolutions that need to be generated from 1m data
  const generatedResolutions = ['5m', '10m', '30m', '4h'];
  const isGeneratedResolution = generatedResolutions.includes(resolution);

  try {
    // Check what data range we have in DB
    const dataRange = await databaseService.getDataRange(uppercaseSymbol);

    // Fetch from database first
    // Use smooth query for 1D view with 1h resolution: hourly data with current price appended
    let dbCandles: Awaited<ReturnType<typeof databaseService.getCandles>>;
    if (range === '1d' && resolution === '1h') {
      // Smooth: 1h aggregates with latest real-time price (no jagged minute data)
      dbCandles = await databaseService.getSmooth1DCandles(uppercaseSymbol, from, to);
    } else if (isGeneratedResolution) {
      // For generated resolutions (5m, 10m, 30m, 4h), fetch 1m first
      // We'll merge with Redis and aggregate in JS for fresh data
      dbCandles = await databaseService.getCandles(uppercaseSymbol, from, to, '1m');
    } else {
      dbCandles = await databaseService.getCandles(uppercaseSymbol, from, to, resolution);
    }

    // If no data in DB and Finnhub is configured, fetch from API
    // BUT: Only fetch if rate limit allows (save calls for real-time data)
    // NOTE: Historical fetching requires paid Finnhub tier (free tier = 403 Forbidden)
    // This is DISABLED by default - only enabled for users with paid Finnhub tier
    // who want to backfill historical data instead of waiting for collector
    let fetchedFromApi = false;
    const rateLimitStatus = finnhubService.getRateLimitStatus();
    const enableHistoricalFetch = process.env.ENABLE_HISTORICAL_FETCH === 'true';

    if (dbCandles.length === 0 && finnhubService.isConfigured() && enableHistoricalFetch) {
      // Require at least 20 calls remaining to fetch historical (protect rate limit)
      if (rateLimitStatus.callsRemaining < 20) {
        console.log(`[API] Skipping historical fetch for ${uppercaseSymbol} - rate limit too low (${rateLimitStatus.callsRemaining} remaining)`);
      } else {
        console.log(`[API] No data in DB for ${uppercaseSymbol}, fetching from Finnhub...`);

        // Map resolution to Finnhub format
        const finnhubResolution: '60' | 'D' = resolution === '1d' ? 'D' : '60';

        try {
          // Fetch from Finnhub - ALWAYS use server time for API calls
          // Client time is only used for database queries, never external API
          const serverNow = new Date();
          const apiCandles = await finnhubService.getHistoricalCandles(
            uppercaseSymbol,
            finnhubResolution,
            from.getTime() / 1000,
            serverNow.getTime() / 1000,
          );

          if (apiCandles && apiCandles.length > 0) {
            // Convert to database format and store
            const dbFormatCandles = apiCandles.map((c) => ({
              time: new Date(c.t),
              symbol: uppercaseSymbol,
              open: c.o,
              high: c.h,
              low: c.l,
              close: c.c,
              volume: c.v,
              source: 'finnhub' as const,
            }));

            await databaseService.insertCandles1m(dbFormatCandles);

            // Re-fetch from DB to get the stored data
            dbCandles = await databaseService.getCandles(uppercaseSymbol, from, now, resolution);
            fetchedFromApi = true;

            console.log(`[API] Stored ${dbCandles.length} candles for ${uppercaseSymbol}`);
          }
        } catch (error) {
          // Silently fail on 403/429 errors - don't spam logs
          console.log(`[API] Historical fetch failed for ${uppercaseSymbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    } else if (dbCandles.length === 0 && finnhubService.isConfigured() && !enableHistoricalFetch) {
      // Historical fetching disabled (default for free tier)
      console.log(`[API] Historical fetch disabled for ${uppercaseSymbol} (ENABLE_HISTORICAL_FETCH not set)`);
    }

    // Check if we have recent data in Redis and merge it with DB data
    // This ensures charts show the most recent data (Redis is updated every 30s, DB every 5min)
    const dbLatest = dbCandles.length > 0 ? dbCandles[dbCandles.length - 1].time.getTime() : 0;

    // Fetch from Redis for the time range (if Redis has data newer than DB)
    let redisCandles: RedisCandle[] = [];
    if (redisService.getConnectionStatus()) {
      try {
        redisCandles = await redisService.getCandles(uppercaseSymbol, from.getTime(), to.getTime());
      } catch (err) {
        console.log(`[API] Redis fetch failed for ${uppercaseSymbol}:`, err);
      }
    }

    // Merge DB and Redis data:
    // - Use DB data for all candles up to dbLatest
    // - Use Redis data for candles after dbLatest (newer data not yet flushed to DB)
    const mergedCandles: CandleData[] = [];

    // Add all DB candles first
    for (const c of dbCandles) {
      mergedCandles.push({
        t: c.time.getTime(),
        o: c.open,
        h: c.high,
        l: c.low,
        c: c.close,
        v: c.volume,
      });
    }

    // Add Redis candles that are newer than the last DB candle
    const lastDbTimestamp = dbLatest;
    const newRedisCandles = redisCandles.filter((rc) => rc.time > lastDbTimestamp);

    for (const rc of newRedisCandles) {
      mergedCandles.push({
        t: rc.time,
        o: rc.open,
        h: rc.high,
        l: rc.low,
        c: rc.close,
        v: rc.volume,
      });
    }

    // Sort by timestamp to ensure proper order
    mergedCandles.sort((a, b) => a.t - b.t);

    // If we need to aggregate to a higher resolution (5m, 10m, 30m, 4h), do it now
    let finalCandles = mergedCandles;
    if (isGeneratedResolution && mergedCandles.length > 0) {
      finalCandles = aggregateCandles(mergedCandles, resolution);
    }

    // Determine if we have partial data (using fallback to Redis)
    const isPartial = newRedisCandles.length > 0;

    const response: HistoryResponse = {
      symbol: uppercaseSymbol,
      resolution,
      from: from.toISOString(),
      to: to.toISOString(),
      candles: finalCandles,
      cached: !fetchedFromApi, // True if came from DB, false if fetched from API
      partial: isPartial,
    };

    res.json({
      success: true,
      data: response,
      meta: {
        dbRange: dataRange,
        totalCandles: finalCandles.length,
        fetchedFromApi,
        redisAugmented: isPartial, // Indicate that Redis data was merged
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error(`[API] Error fetching history for ${uppercaseSymbol}:`, error);
    res.status(500).json({
      success: false,
      error: `Failed to fetch history for ${uppercaseSymbol}`,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Admin: Manual flush cache to persistent storage (development use)
router.post('/admin/flush-cache', async (_req, res) => {
  try {
    console.log('[Admin] Manual cache flush requested');

    const result = await candleBufferService.manualFlush();

    const response: FlushResult = {
      l1ToRedis: result.l1ToRedis,
      redisToDb: result.redisToDb,
      timestamp: new Date().toISOString(),
      message: `Flushed ${result.l1ToRedis} L1 buffers and ${result.redisToDb} candles to persistent storage`,
    };

    res.json({
      success: true,
      data: response,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[Admin] Error during manual flush:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to flush cache',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Admin: Get candle buffer stats
router.get('/admin/buffer-stats', (_req, res) => {
  const stats = candleBufferService.getStats();

  res.json({
    success: true,
    data: stats,
    timestamp: Date.now(),
  });
});

// Get next trading day information
router.get('/market/next-trading-day', (_req, res) => {
  const nextTradingDay = getNextTradingDay();

  res.json({
    success: true,
    data: nextTradingDay,
    timestamp: Date.now(),
  });
});

export default router;
