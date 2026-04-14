import { cacheService } from './cacheService';
import { databaseService } from './databaseService';
import { redisService } from './redisService';

import type { StockQuote } from '../types';

export interface CachedQuoteResult {
  quote: StockQuote;
  source: 'l1' | 'l2' | 'l3' | 'api';
}

/**
 * Get cached quote from L1, L2, or L3 cache (no API calls)
 * This function checks all cache layers in order: memory → Redis → database
 *
 * @param symbol - Stock symbol to lookup
 * @returns Cached quote with source information, or null if not found
 */
export async function getCachedQuote(symbol: string): Promise<CachedQuoteResult | null> {
  const cacheKey = `quote:${symbol}`;

  // Check L1 cache (memory)
  const l1Cached = cacheService.get<StockQuote>(cacheKey);
  if (l1Cached) {
    return { quote: { ...l1Cached, isCached: true }, source: 'l1' };
  }

  // Check L2 cache (Redis)
  try {
    const redisQuote = await redisService.getLatestQuote(symbol);
    if (redisQuote) {
      const quote: StockQuote = {
        symbol,
        currentPrice: redisQuote.currentPrice,
        change: redisQuote.change,
        changePercent: redisQuote.changePercent,
        highPrice: redisQuote.high,
        lowPrice: redisQuote.low,
        openPrice: redisQuote.open,
        previousClose: redisQuote.previousClose,
        timestamp: Math.floor(redisQuote.timestamp / 1000), // Convert ms to seconds
        isCached: true,
      };
      // Also cache in memory for faster access
      cacheService.set(cacheKey, quote, 60);
      return { quote, source: 'l2' };
    }
  } catch (error) {
    console.error(`[CacheLookup] Redis error for ${symbol}:`, error);
    // Continue to L3
  }

  // Check L3 cache (TimescaleDB)
  try {
    const dbQuote = await databaseService.getLatestQuote(symbol);
    if (dbQuote) {
      const quote: StockQuote = {
        symbol,
        currentPrice: dbQuote.currentPrice,
        change: dbQuote.change,
        changePercent: dbQuote.changePercent,
        highPrice: dbQuote.highPrice || 0,
        lowPrice: dbQuote.lowPrice || 0,
        openPrice: dbQuote.openPrice || 0,
        previousClose: dbQuote.previousClose || 0,
        timestamp: new Date(dbQuote.timestamp).getTime() / 1000,
        isCached: true,
      };
      cacheService.set(cacheKey, quote, 60);
      return { quote, source: 'l3' };
    }
  } catch (error) {
    console.error(`[CacheLookup] Database error for ${symbol}:`, error);
    // Continue - no data available
  }

  return null;
}

/**
 * Get all cached quotes for tracked stocks without making API calls
 *
 * @param symbols - Array of stock symbols to lookup
 * @returns Array of cached quotes with source information
 */
export async function getAllCachedQuotes(symbols: readonly string[]): Promise<CachedQuoteResult[]> {
  const results: CachedQuoteResult[] = [];

  for (const symbol of symbols) {
    const result = await getCachedQuote(symbol);
    if (result) {
      results.push(result);
    }
  }

  return results;
}
