import { StockQuote, FinnhubQuote, FinnhubProfile } from '../types';
import { cacheService } from './cacheService';
import { redisService } from './redisService';
import { databaseService } from './databaseService';
import { finnhubRateLimiter, profileRateLimiter, UsageStats } from './rateLimiter';

const FINNHUB_API_URL = 'https://finnhub.io/api/v1';

class FinnhubService {
  private baseUrl: string;
  private consecutiveErrors: number = 0;
  private maxConsecutiveErrors: number = 5;
  private backoffMs: number = 1000;

  constructor() {
    this.baseUrl = FINNHUB_API_URL;
  }

  private getApiKey(): string {
    return process.env.FINNHUB_API_KEY || '';
  }

  private async fetchFromApi<T>(endpoint: string, useRateLimiter: boolean = true): Promise<T | null> {
    const apiKey = this.getApiKey();
    
    if (!apiKey) {
      throw new Error('FINNHUB_API_KEY not configured');
    }

    // Apply rate limiting if enabled
    if (useRateLimiter) {
      const limiter = endpoint.includes('profile') ? profileRateLimiter : finnhubRateLimiter;
      
      if (!limiter.canMakeCall()) {
        console.warn(`[Finnhub] Rate limit would be exceeded. Skipping ${endpoint}`);
        throw new Error('Rate limit exceeded - try again later');
      }

      // Log warning if near limit
      if (limiter.isNearLimit()) {
        const stats = limiter.getStats();
        console.warn(`[Finnhub] Approaching rate limit: ${stats.callsInCurrentWindow}/${limiter.getConfig().maxCallsPerMinute} calls used`);
      }
    }

    const url = `${this.baseUrl}${endpoint}${endpoint.includes('?') ? '&' : '?'}token=${apiKey}`;
    
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        if (response.status === 429) {
          this.consecutiveErrors++;
          console.error(`[Finnhub] Rate limit hit (429). Consecutive errors: ${this.consecutiveErrors}`);
          
          // Exponential backoff
          if (this.consecutiveErrors < this.maxConsecutiveErrors) {
            const delay = this.backoffMs * Math.pow(2, this.consecutiveErrors - 1);
            console.log(`[Finnhub] Backing off for ${delay}ms`);
            await this.sleep(delay);
          }
          
          throw new Error('Rate limit exceeded. Please try again later.');
        }
        
        if (response.status === 401) {
          throw new Error('Invalid API key. Please check your FINNHUB_API_KEY.');
        }
        
        throw new Error(`Finnhub API error: ${response.status} - ${response.statusText}`);
      }

      // Reset consecutive errors on success
      this.consecutiveErrors = 0;

      return await response.json() as T;
    } catch (error) {
      throw error;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getQuote(symbol: string, skipCache: boolean = false): Promise<StockQuote | null> {
    const cacheKey = `quote:${symbol}`;
    
    // Check cache first (unless skipping)
    if (!skipCache) {
      const cached = cacheService.get<StockQuote>(cacheKey);
      if (cached) {
        return cached;
      }
      
      // Check Redis (L2 cache) - survives server restarts
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
            timestamp: redisQuote.timestamp,
          };
          // Also cache in memory for faster access
          cacheService.set(cacheKey, quote, 60);
          console.log(`[Finnhub] Serving ${symbol} from Redis cache (post-restart recovery)`);
          return quote;
        }
      } catch (error) {
        // Redis error, continue to DB fallback
      }
      
      // Check database (L3 cache) - latest_quotes table
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
          };
          // Also cache in memory
          cacheService.set(cacheKey, quote, 60);
          console.log(`[Finnhub] Serving ${symbol} from database (post-restart recovery)`);
          return quote;
        }
      } catch (error) {
        // DB error, continue to API
      }
    }

    // Check rate limit before making request
    if (!finnhubRateLimiter.canMakeCall()) {
      console.log(`[Finnhub] Rate limit reached, serving cached data for ${symbol}`);
      // Return cached data even if expired, rather than fail
      const expired = cacheService.get<StockQuote>(cacheKey);
      if (expired) {
        // Mark as cached data
        return { ...expired, isCached: true };
      }
      throw new Error('Rate limit exceeded and no cached data available');
    }
    
    try {
      const data = await this.fetchFromApi<FinnhubQuote>(`/quote?symbol=${symbol}`);
      
      if (!data) {
        return null;
      }
      
      const quote: StockQuote = {
        symbol,
        currentPrice: data.c,
        change: data.d,
        changePercent: data.dp,
        highPrice: data.h,
        lowPrice: data.l,
        openPrice: data.o,
        previousClose: data.pc,
        timestamp: data.t,
      };

      // Cache the result
      const ttl = parseInt(process.env.CACHE_TTL_SECONDS || '60', 10);
      cacheService.set(cacheKey, quote, ttl);
      
      return quote;
    } catch (error) {
      // If we hit rate limit, try to return cached data
      if (error instanceof Error && error.message.includes('Rate limit')) {
        const cached = cacheService.get<StockQuote>(cacheKey);
        if (cached) {
          console.log(`[Finnhub] Returning cached data for ${symbol} due to rate limit`);
          // Mark as cached data
          return { ...cached, isCached: true };
        }
      }
      
      console.error(`[Finnhub] Error fetching quote for ${symbol}:`, error);
      return null;
    }
  }

  async getCompanyProfile(symbol: string): Promise<FinnhubProfile | null> {
    const cacheKey = `profile:${symbol}`;
    
    const cached = cacheService.get<FinnhubProfile>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const data = await this.fetchFromApi<FinnhubProfile>(`/stock/profile2?symbol=${symbol}`, true);
      
      if (!data || !data.name) {
        return null;
      }

      cacheService.set(cacheKey, data, 3600); // Profile data changes less frequently
      
      return data;
    } catch (error) {
      console.error(`[Finnhub] Error fetching profile for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get multiple quotes with rate limit awareness and batching
   */
  async getQuotes(symbols: string[], options: { batchSize?: number; delayMs?: number } = {}): Promise<StockQuote[]> {
    const { batchSize = 5, delayMs = 200 } = options;
    const results: StockQuote[] = [];
    let rateLimitReached = false;
    
    // Process in batches to avoid rate limit spikes
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      
      // Check if we can make these calls
      const stats = finnhubRateLimiter.getStats();
      
      if (rateLimitReached || stats.callsRemaining < batch.length) {
        if (!rateLimitReached) {
          console.warn(`[Finnhub] Rate limit reached. Remaining: ${stats.callsRemaining}, Needed for batch: ${batch.length}. Serving cached data for remaining symbols.`);
          rateLimitReached = true;
        }
        
        // Try to get ALL remaining symbols from cache
        const remainingSymbols = symbols.slice(i);
        console.log(`[Finnhub] Fetching ${remainingSymbols.length} symbols from cache...`);
        
        for (const symbol of remainingSymbols) {
          const cached = cacheService.get<StockQuote>(`quote:${symbol}`);
          if (cached) {
            // Mark as cached data due to rate limiting
            results.push({ ...cached, isCached: true });
          } else {
            console.warn(`[Finnhub] No cached data available for ${symbol}`);
          }
        }
        
        break; // Stop processing more batches - we've handled all remaining symbols from cache
      }
      
      // Process this batch normally
      const batchPromises = batch.map(async symbol => {
        const quote = await this.getQuote(symbol);
        return quote;
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter((q): q is StockQuote => q !== null));
      
      // Delay between batches to smooth out requests
      if (i + batchSize < symbols.length && delayMs > 0) {
        await this.sleep(delayMs);
      }
    }
    
    return results;
  }

  /**
   * Get historical candles from Finnhub
   * Used for backfilling when database has no data
   */
  async getHistoricalCandles(
    symbol: string, 
    resolution: '1' | '5' | '15' | '30' | '60' | 'D' | 'W' | 'M',
    from: number,  // Unix timestamp
    to: number     // Unix timestamp
  ): Promise<Array<{ t: number; o: number; h: number; l: number; c: number; v: number }> | null> {
    // Check rate limit first
    if (!finnhubRateLimiter.canMakeCall()) {
      console.log(`[Finnhub] Rate limit reached, skipping historical fetch for ${symbol}`);
      return null;
    }

    try {
      const fromStr = Math.floor(from);
      const toStr = Math.floor(to);
      
      console.log(`[Finnhub] Fetching candles for ${symbol}: ${resolution} from ${new Date(fromStr * 1000).toISOString()} to ${new Date(toStr * 1000).toISOString()}`);
      
      const data = await this.fetchFromApi<{
        c: number[];  // Close prices
        h: number[];  // High prices
        l: number[];  // Low prices
        o: number[];  // Open prices
        t: number[];  // Timestamps
        v: number[];  // Volumes
        s: string;    // Status
      }>(`/stock/candle?symbol=${symbol}&resolution=${resolution}&from=${fromStr}&to=${toStr}`);

      console.log(`[Finnhub] Response for ${symbol}: status=${data?.s}, candles=${data?.c?.length || 0}`);

      if (!data || data.s === 'no_data' || !data.c || data.c.length === 0) {
        console.log(`[Finnhub] No historical data for ${symbol}: ${data?.s || 'null response'}`);
        return [];
      }

      // Transform array format to candle objects
      const candles = data.t.map((timestamp, i) => ({
        t: timestamp * 1000,  // Convert to milliseconds
        o: data.o[i],
        h: data.h[i],
        l: data.l[i],
        c: data.c[i],
        v: data.v[i],
      }));

      console.log(`[Finnhub] Fetched ${candles.length} candles for ${symbol} (date range: ${new Date(candles[0].t).toISOString()} to ${new Date(candles[candles.length - 1].t).toISOString()})`);
      return candles;
    } catch (error) {
      console.error(`[Finnhub] Error fetching historical candles for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(): UsageStats & { percentUsed: number; callsRemaining: number } {
    return finnhubRateLimiter.getStats();
  }

  isConfigured(): boolean {
    const apiKey = this.getApiKey();
    return !!apiKey && apiKey !== 'your_finnhub_api_key_here';
  }
}

export const finnhubService = new FinnhubService();
