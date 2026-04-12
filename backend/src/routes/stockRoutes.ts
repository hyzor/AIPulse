import { Router } from 'express';
import { finnhubService } from '../services/finnhubService';
import { cacheService } from '../services/cacheService';
import { databaseService } from '../services/databaseService';
import { candleBufferService } from '../services/candleBufferService';
import { redisService } from '../services/redisService';
import { TRACKED_STOCKS } from '../constants';
import type { HistoryResponse, CandleData, FlushResult } from '../types';

const router = Router();

// Get all tracked stocks quotes
router.get('/stocks', async (_req, res) => {
  try {
    const quotes = await finnhubService.getQuotes([...TRACKED_STOCKS]);
    
    res.json({
      success: true,
      data: quotes,
      count: quotes.length,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[API] Error fetching stocks:', error);
    res.status(500).json({
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
    const quote = await finnhubService.getQuote(uppercaseSymbol);
    
    res.json({
      success: true,
      data: quote,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error(`[API] Error fetching ${uppercaseSymbol}:`, error);
    res.status(500).json({
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
  const resolution = (req.query.resolution as '1m' | '1h' | '1d') || '1h';
  
  // Calculate time range
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
    case '90d':
      from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case '1y':
      from = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    default:
      // Try to parse as number of days
      const days = parseInt(range, 10);
      if (!isNaN(days)) {
        from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      } else {
        from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      }
  }

  try {
    // Check what data range we have in DB
    const dataRange = await databaseService.getDataRange(uppercaseSymbol);
    
    // Fetch from database first
    let dbCandles = await databaseService.getCandles(uppercaseSymbol, from, now, resolution);
    
    // If no data in DB and Finnhub is configured, fetch from API
    let fetchedFromApi = false;
    if (dbCandles.length === 0 && finnhubService.isConfigured()) {
      console.log(`[API] No data in DB for ${uppercaseSymbol}, fetching from Finnhub...`);
      
      // Map resolution to Finnhub format
      const finnhubResolution: '60' | 'D' = resolution === '1d' ? 'D' : '60';
      
      // Fetch from Finnhub
      const apiCandles = await finnhubService.getHistoricalCandles(
        uppercaseSymbol,
        finnhubResolution,
        from.getTime() / 1000,
        now.getTime() / 1000
      );
      
      if (apiCandles && apiCandles.length > 0) {
        // Convert to database format and store
        const dbFormatCandles = apiCandles.map(c => ({
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
    }
    
    // Check if we have recent data in Redis (for the "partial" flag)
    const redisLatest = await redisService.getLatestTimestamp(uppercaseSymbol);
    const dbLatest = dbCandles.length > 0 ? dbCandles[dbCandles.length - 1].time.getTime() : 0;
    
    // Determine if data is partial (Redis has newer data not yet in DB)
    const isPartial = redisLatest !== null && redisLatest > dbLatest;
    
    // Convert to response format
    const candles: CandleData[] = dbCandles.map(c => ({
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
      to: now.toISOString(),
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
