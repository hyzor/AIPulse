import { Router } from 'express';

import { TRACKED_STOCKS } from '../constants';
import { getCachedQuote, getAllCachedQuotes } from '../services/cacheLookupService';
import { cacheService } from '../services/cacheService';
import { candleBufferService } from '../services/candleBufferService';
import { databaseService } from '../services/databaseService';
import { finnhubService } from '../services/finnhubService';
import { redisService } from '../services/redisService';
import { isMarketOpen, getMarketStatus, getTradingDayBounds, getPreviousTradingDayBounds } from '../utils/marketHours';

import type { HistoryResponse, CandleData, FlushResult } from '../types';

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
  const clientNow = req.query.now ? new Date(parseInt(req.query.now as string, 10)) : null;
  const now = clientNow || new Date();
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

  try {
    // Check what data range we have in DB
    const dataRange = await databaseService.getDataRange(uppercaseSymbol);

    // Fetch from database first
    // Use smooth query for 1D view with 1h resolution: hourly data with current price appended
    let dbCandles: Awaited<ReturnType<typeof databaseService.getCandles>>;
    if (range === '1d' && resolution === '1h') {
      // Smooth: 1h aggregates with latest real-time price (no jagged minute data)
      dbCandles = await databaseService.getSmooth1DCandles(uppercaseSymbol, from, to);
    } else {
      dbCandles = await databaseService.getCandles(uppercaseSymbol, from, to, resolution);
    }

    // If no data in DB and Finnhub is configured, fetch from API
    // BUT: Only fetch if rate limit allows (save calls for real-time data)
    // NOTE: Historical fetching requires paid Finnhub tier (free tier = 403 Forbidden)
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
          // Fetch from Finnhub
          const apiCandles = await finnhubService.getHistoricalCandles(
            uppercaseSymbol,
            finnhubResolution,
            from.getTime() / 1000,
            now.getTime() / 1000,
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

    // Check if we have recent data in Redis (for the "partial" flag)
    const redisLatest = await redisService.getLatestTimestamp(uppercaseSymbol);
    const dbLatest = dbCandles.length > 0 ? dbCandles[dbCandles.length - 1].time.getTime() : 0;

    // Determine if data is partial (Redis has newer data not yet in DB)
    const isPartial = redisLatest !== null && redisLatest > dbLatest;

    // Convert to response format
    const candles: CandleData[] = dbCandles.map((c) => ({
      t: c.time.getTime(),
      o: c.open,
      h: c.high,
      l: c.low,
      c: c.close,
      v: c.volume,
    }));

    const response: HistoryResponse = {
      symbol: uppercaseSymbol,
      resolution,
      from: from.toISOString(),
      to: to.toISOString(),
      candles,
      cached: !fetchedFromApi, // True if came from DB, false if fetched from API
      partial: isPartial,
    };

    res.json({
      success: true,
      data: response,
      meta: {
        dbRange: dataRange,
        totalCandles: candles.length,
        fetchedFromApi,
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

export default router;
