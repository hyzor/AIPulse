/**
 * Rate Limiter for Finnhub API
 * Free tier: 60 calls per minute
 * Tracks usage and enforces limits to prevent hitting quota
 */

interface RateLimitConfig {
  maxCallsPerMinute: number;
  warningThreshold: number;
}

export interface UsageStats {
  callsInCurrentWindow: number;
  windowStart: number;
  totalCalls: number;
  rateLimitedCount: number;
}

class RateLimiter {
  private config: RateLimitConfig;
  private stats: UsageStats;
  private windowMs: number = 60000; // 1 minute window

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = {
      maxCallsPerMinute: config.maxCallsPerMinute || 60,
      warningThreshold: config.warningThreshold || 50,
    };
    this.stats = {
      callsInCurrentWindow: 0,
      windowStart: Date.now(),
      totalCalls: 0,
      rateLimitedCount: 0,
    };
  }

  /**
   * Check if we can make a call, and record it if allowed
   */
  canMakeCall(): boolean {
    this.resetWindowIfNeeded();

    if (this.stats.callsInCurrentWindow >= this.config.maxCallsPerMinute) {
      this.stats.rateLimitedCount++;
      return false;
    }

    this.stats.callsInCurrentWindow++;
    this.stats.totalCalls++;
    return true;
  }

  /**
   * Get current usage stats
   */
  getStats(): UsageStats & { percentUsed: number; callsRemaining: number } {
    this.resetWindowIfNeeded();

    return {
      ...this.stats,
      percentUsed: Math.round((this.stats.callsInCurrentWindow / this.config.maxCallsPerMinute) * 100),
      callsRemaining: Math.max(0, this.config.maxCallsPerMinute - this.stats.callsInCurrentWindow),
    };
  }

  /**
   * Check if we're approaching the limit
   */
  isNearLimit(): boolean {
    this.resetWindowIfNeeded();
    return this.stats.callsInCurrentWindow >= this.config.warningThreshold;
  }

  /**
   * Calculate delay needed before next call to stay under limit
   */
  getRecommendedDelayMs(): number {
    this.resetWindowIfNeeded();

    if (this.stats.callsInCurrentWindow < this.config.maxCallsPerMinute) {
      return 0;
    }

    const elapsed = Date.now() - this.stats.windowStart;
    return Math.max(0, this.windowMs - elapsed);
  }

  /**
   * Wait until we can make a call (respects rate limit)
   */
  async throttle(): Promise<void> {
    const delay = this.getRecommendedDelayMs();
    if (delay > 0) {
      console.log(`[RateLimiter] Throttling for ${delay}ms to respect rate limit`);
      await this.sleep(delay);
      this.resetWindowIfNeeded();
    }
  }

  private resetWindowIfNeeded(): void {
    const now = Date.now();
    if (now - this.stats.windowStart >= this.windowMs) {
      // Log window stats before reset
      if (this.stats.callsInCurrentWindow > 0) {
        console.log(`[RateLimiter] Window reset. Used ${this.stats.callsInCurrentWindow}/${this.config.maxCallsPerMinute} calls`);
      }
      
      this.stats.callsInCurrentWindow = 0;
      this.stats.windowStart = now;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get configuration
   */
  getConfig(): RateLimitConfig {
    return { ...this.config };
  }
}

// Default rate limiter for Finnhub free tier (60 calls/min)
export const finnhubRateLimiter = new RateLimiter({
  maxCallsPerMinute: 55, // Stay under 60 to be safe
  warningThreshold: 45,
});

// For profile data which changes less frequently
export const profileRateLimiter = new RateLimiter({
  maxCallsPerMinute: 10, // Very conservative for profile data
  warningThreshold: 8,
});
