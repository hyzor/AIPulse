import { StockQuote, FinnhubQuote, FinnhubProfile } from '../types';
import { cacheService } from './cacheService';
import { finnhubRateLimiter, profileRateLimiter } from './rateLimiter';

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

      return response.json();
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
    }

    // Check rate limit before making request
    if (!finnhubRateLimiter.canMakeCall()) {
      console.log(`[Finnhub] Rate limit reached, serving cached data for ${symbol}`);
      // Return cached data even if expired, rather than fail
      const expired = cacheService.get<StockQuote>(cacheKey);
      if (expired) {
        return expired;
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
          return cached;
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
    
    // Process in batches to avoid rate limit spikes
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      
      // Check if we can make these calls
      const stats = finnhubRateLimiter.getStats();
      if (stats.callsRemaining < batch.length) {
        console.warn(`[Finnhub] Not enough rate limit for full batch. Remaining: ${stats.callsRemaining}, Needed: ${batch.length}`);
        
        // Only process what we can
        const processableBatch = batch.slice(0, stats.callsRemaining);
        
        for (const symbol of processableBatch) {
          const quote = await this.getQuote(symbol);
          if (quote) results.push(quote);
        }
        
        // For remaining, try to get from cache
        const remaining = batch.slice(stats.callsRemaining);
        for (const symbol of remaining) {
          const cached = cacheService.get<StockQuote>(`quote:${symbol}`);
          if (cached) {
            console.log(`[Finnhub] Using cached data for ${symbol} (rate limit)`);
            results.push(cached);
          }
        }
        
        break; // Stop processing more batches
      }
      
      // Process this batch
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
   * Get current rate limit status
   */
  getRateLimitStatus() {
    return finnhubRateLimiter.getStats();
  }

  isConfigured(): boolean {
    const apiKey = this.getApiKey();
    return !!apiKey && apiKey !== 'your_finnhub_api_key_here';
  }
}

export const finnhubService = new FinnhubService();
