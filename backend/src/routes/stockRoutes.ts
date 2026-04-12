import { Router } from 'express';
import { finnhubService } from '../services/finnhubService';
import { cacheService } from '../services/cacheService';
import { TRACKED_STOCKS } from '../constants';
import type { StockQuote } from '../types';

const router = Router();

// Get all tracked stocks quotes
router.get('/stocks', async (req, res) => {
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
    
    res.json({
      success: true,
      data: {
        symbol: uppercaseSymbol,
        ...profile,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error(`[API] Error fetching profile for ${uppercaseSymbol}:`, error);
    res.status(500).json({
      success: false,
      error: `Failed to fetch profile for ${uppercaseSymbol}`,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Health check
router.get('/health', (req, res) => {
  const stats = cacheService.getStats();
  
  res.json({
    success: true,
    status: 'healthy',
    finnhubConfigured: finnhubService.isConfigured(),
    cacheStats: {
      keys: cacheService.keys().length,
      hits: stats.hits,
      misses: stats.misses,
    },
    timestamp: Date.now(),
  });
});

// Clear cache (admin endpoint)
router.post('/cache/clear', (req, res) => {
  cacheService.flush();
  
  res.json({
    success: true,
    message: 'Cache cleared successfully',
    timestamp: Date.now(),
  });
});

// Rate limit status
router.get('/rate-limit', (req, res) => {
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

export default router;
