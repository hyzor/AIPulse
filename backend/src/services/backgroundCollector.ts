import { TRACKED_STOCKS } from '../constants';
import { candleBufferService } from './candleBufferService';
import { finnhubService } from './finnhubService';
import { isMarketOpen, getMarketStatus } from '../utils/marketHours';

/**
 * Background Data Collection Service
 *
 * Continuously collects data for all tracked stocks during market hours.
 * - Runs independently of WebSocket clients
 * - Maximizes API usage within rate limits
 * - Stores data in TimescaleDB for historical charts
 * - Updates Redis for real-time serving
 */

class BackgroundCollector {
  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private lastCollectionTime: number = 0;
  private stats = {
    totalCollections: 0,
    totalCandlesCreated: 0,
    lastCollectionCount: 0,
    errors: 0,
  };

  // Collection interval in milliseconds
  // Default: 60s = 1 minute = ~60 calls/min for 18 stocks = 1,080 calls/hour
  // Well within 60/min = 3,600 calls/hour limit
  private readonly collectionInterval: number;

  // Batch size for API calls (how many stocks per batch)
  private readonly batchSize: number;

  // Delay between batches in milliseconds
  private readonly batchDelayMs: number;

  constructor() {
    // Parse config from environment
    this.collectionInterval = parseInt(
      process.env.BG_COLLECTION_INTERVAL_MS || '60000',
      10,
    );
    this.batchSize = parseInt(process.env.BG_COLLECTION_BATCH_SIZE || '6', 10);
    this.batchDelayMs = parseInt(process.env.BG_COLLECTION_BATCH_DELAY_MS || '1000', 10);

    console.log(`[BackgroundCollector] Config: interval=${this.collectionInterval}ms, batchSize=${this.batchSize}, delay=${this.batchDelayMs}ms`);
  }

  /**
   * Start the background collection loop
   */
  start(): void {
    if (this.isRunning) {
      console.log('[BackgroundCollector] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[BackgroundCollector] Starting background data collection...');

    // Immediate first collection if market is open
    if (isMarketOpen()) {
      console.log('[BackgroundCollector] Market open - starting immediate collection');
      this.collectAll().catch((err) => {
        console.error('[BackgroundCollector] Initial collection failed:', err);
      });
    } else {
      const status = getMarketStatus();
      console.log(`[BackgroundCollector] Market closed (${status.message}) - will resume at market open`);
    }

    // Set up the collection interval
    this.timer = setInterval(() => {
      this.tick();
    }, this.collectionInterval);

    console.log(`[BackgroundCollector] Collection loop started (interval: ${this.collectionInterval}ms)`);
  }

  /**
   * Stop the background collection loop
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    console.log('[BackgroundCollector] Stopped');
  }

  /**
   * Get current stats
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Check if collector is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Main collection tick - called on each interval
   */
  private async tick(): Promise<void> {
    // Skip if market is closed
    if (!isMarketOpen()) {
      return;
    }

    // Check if enough time has passed since last collection
    const now = Date.now();
    const timeSinceLastCollection = now - this.lastCollectionTime;

    if (timeSinceLastCollection < this.collectionInterval * 0.8) {
      // Too soon, skip this tick (prevents double-collection)
      return;
    }

    try {
      await this.collectAll();
    } catch (error) {
      console.error('[BackgroundCollector] Collection failed:', error);
      this.stats.errors++;
    }
  }

  /**
   * Collect data for all tracked stocks
   */
  async collectAll(): Promise<number> {
    const rateLimitStatus = finnhubService.getRateLimitStatus();

    // Check if we have enough API capacity
    // Need at least TRACKED_STOCKS.length calls + small buffer
    const minRequired = TRACKED_STOCKS.length + 5;
    if (rateLimitStatus.callsRemaining < minRequired) {
      console.log(`[BackgroundCollector] Insufficient API capacity (${rateLimitStatus.callsRemaining}/${minRequired}), skipping collection`);
      return 0;
    }

    console.log(`[BackgroundCollector] Collecting ${TRACKED_STOCKS.length} symbols (${rateLimitStatus.callsRemaining} API calls available)`);

    const symbols = [...TRACKED_STOCKS];
    let totalCollected = 0;
    let totalCandles = 0;

    // Process in batches to spread load and respect rate limits
    for (let i = 0; i < symbols.length; i += this.batchSize) {
      const batch = symbols.slice(i, i + this.batchSize);

      // Check rate limit before each batch
      const currentStatus = finnhubService.getRateLimitStatus();
      if (currentStatus.callsRemaining < batch.length) {
        console.log(`[BackgroundCollector] Rate limit low, stopping after ${totalCollected} symbols`);
        break;
      }

      try {
        // Fetch batch
        const quotes = await finnhubService.getQuotes(batch, {
          batchSize: this.batchSize,
          delayMs: 0, // No additional delay, we're managing it here
        });

        // Update candle buffers
        for (const quote of quotes) {
          if (quote) {
            // Mark as fresh data (not cached) since we just fetched it from API
            const freshQuote = { ...quote, isCached: false };

            // Update candle buffer for historical chart data
            candleBufferService.updatePrice(
              freshQuote.symbol,
              freshQuote.currentPrice,
              0, // Volume not available from Finnhub quote
              Date.now(),
            );

            // Also update latest quote for real-time chart endpoint
            await candleBufferService.updateLatestQuote(freshQuote.symbol, {
              currentPrice: freshQuote.currentPrice,
              change: freshQuote.change,
              changePercent: freshQuote.changePercent,
              high: freshQuote.highPrice,
              low: freshQuote.lowPrice,
              open: freshQuote.openPrice,
              previousClose: freshQuote.previousClose,
              volume: 0,
            }, 'api', Date.now());

            totalCandles++;
          }
        }

        totalCollected += quotes.length;

        // Delay between batches
        if (i + this.batchSize < symbols.length) {
          await this.sleep(this.batchDelayMs);
        }
      } catch (error) {
        console.error('[BackgroundCollector] Batch failed:', error);
        this.stats.errors++;
      }
    }

    this.lastCollectionTime = Date.now();
    this.stats.totalCollections++;
    this.stats.totalCandlesCreated += totalCandles;
    this.stats.lastCollectionCount = totalCollected;

    console.log(`[BackgroundCollector] Complete: ${totalCollected}/${TRACKED_STOCKS.length} symbols, ${totalCandles} candles created`);

    return totalCollected;
  }

  /**
   * Force an immediate collection (for manual refresh)
   * Returns the number of symbols collected
   */
  async forceCollect(): Promise<{ collected: number; fromCache: number }> {
    const rateLimitStatus = finnhubService.getRateLimitStatus();
    const symbols = [...TRACKED_STOCKS];

    // Check if we can fetch all
    if (rateLimitStatus.callsRemaining >= symbols.length) {
      const collected = await this.collectAll();
      return { collected, fromCache: 0 };
    }

    // Not enough API capacity - serve from cache
    console.log('[BackgroundCollector] Force collect: insufficient API capacity, serving from cache');
    return { collected: 0, fromCache: symbols.length };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const backgroundCollector = new BackgroundCollector();
