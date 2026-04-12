import { cacheService } from './cacheService';
import { databaseService } from './databaseService';
import { redisService } from './redisService';

import type { StockCandle, LatestQuote } from './databaseService';
import type { RedisCandle, RedisLatestQuote } from './redisService';

export interface CandleBuffer {
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  startTime: number; // Unix timestamp in milliseconds
  updates: number;
}

class CandleBufferService {
  private buffers: Map<string, CandleBuffer> = new Map();
  private l1ToRedisInterval: number;
  private redisToDbInterval: number;
  private maxBufferSize: number;
  private l1ToRedisTimer: NodeJS.Timeout | null = null;
  private redisToDbTimer: NodeJS.Timeout | null = null;

  constructor() {
    const isDev = process.env.NODE_ENV === 'development';

    this.l1ToRedisInterval = parseInt(
      process.env.L1_TO_REDIS_INTERVAL || (isDev ? '15' : '30'),
      10,
    ) * 1000;

    this.redisToDbInterval = parseInt(
      process.env.REDIS_TO_DB_INTERVAL || (isDev ? '60' : '300'),
      10,
    ) * 1000;

    this.maxBufferSize = parseInt(
      process.env.MAX_BUFFER_SIZE || (isDev ? '10' : '100'),
      10,
    );

    console.log(`[CandleBuffer] Initialized with L1→Redis: ${this.l1ToRedisInterval}ms, Redis→DB: ${this.redisToDbInterval}ms, Max buffer: ${this.maxBufferSize}`);
  }

  // Start the persistence timers
  start(): void {
    this.l1ToRedisTimer = setInterval(() => {
      this.flushL1ToRedis();
    }, this.l1ToRedisInterval);

    this.redisToDbTimer = setInterval(() => {
      this.flushRedisToDatabase();
    }, this.redisToDbInterval);

    console.log('[CandleBuffer] Persistence timers started');
  }

  // Stop the persistence timers
  stop(): void {
    if (this.l1ToRedisTimer) {
      clearInterval(this.l1ToRedisTimer);
      this.l1ToRedisTimer = null;
    }
    if (this.redisToDbTimer) {
      clearInterval(this.redisToDbTimer);
      this.redisToDbTimer = null;
    }
    console.log('[CandleBuffer] Persistence timers stopped');
  }

  // Update with a new price tick
  updatePrice(
    symbol: string,
    price: number,
    volume: number = 0,
    timestamp: number = Date.now(),
  ): void {
    // Round timestamp to the minute (1m candles)
    const minuteTimestamp = Math.floor(timestamp / 60000) * 60000;

    let buffer = this.buffers.get(symbol);

    if (buffer?.startTime !== minuteTimestamp) {
      // If we have an existing buffer from a different minute, flush it first
      if (buffer && buffer.startTime !== minuteTimestamp) {
        this.flushBufferToRedis(buffer);
      }

      // Create new buffer for this minute
      buffer = {
        symbol,
        open: price,
        high: price,
        low: price,
        close: price,
        volume,
        startTime: minuteTimestamp,
        updates: 1,
      };
      this.buffers.set(symbol, buffer);
    } else {
      // Update existing buffer
      buffer.high = Math.max(buffer.high, price);
      buffer.low = Math.min(buffer.low, price);
      buffer.close = price;
      buffer.volume += volume;
      buffer.updates++;

      // Check if we should flush due to buffer size
      if (buffer.updates >= this.maxBufferSize) {
        this.flushBufferToRedis(buffer);
        this.buffers.delete(symbol);
      }
    }
  }

  // Flush a single buffer to Redis
  private async flushBufferToRedis(buffer: CandleBuffer): Promise<void> {
    if (buffer.updates === 0) { return; }

    const candle: RedisCandle = {
      time: buffer.startTime,
      symbol: buffer.symbol,
      open: buffer.open,
      high: buffer.high,
      low: buffer.low,
      close: buffer.close,
      volume: buffer.volume,
    };

    try {
      await redisService.addCandle(buffer.symbol, candle);
      console.log(`[CandleBuffer] Flushed 1m candle to Redis: ${buffer.symbol} @ ${new Date(buffer.startTime).toISOString()}`);
    } catch (error) {
      console.error(`[CandleBuffer] Error flushing to Redis: ${buffer.symbol}`, error);
    }
  }

  // Flush all L1 buffers to Redis (called on timer or shutdown)
  async flushL1ToRedis(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const [, buffer] of this.buffers.entries()) {
      if (buffer.updates > 0) {
        promises.push(this.flushBufferToRedis(buffer));
      }
    }

    await Promise.all(promises);

    // Clear buffers after flush
    this.buffers.clear();
    console.log(`[CandleBuffer] Flushed ${promises.length} buffers to Redis`);
  }

  // Flush Redis candles to TimescaleDB
  async flushRedisToDatabase(): Promise<number> {
    try {
      const symbols = await redisService.getTrackedSymbols();
      let totalFlushed = 0;

      for (const symbol of symbols) {
        const candles = await redisService.getAllCandles(symbol);

        if (candles.length === 0) { continue; }

        // Store in pending first (for recovery safety)
        await redisService.setPendingFlush(symbol, candles);

        // Convert to database format
        const dbCandles: StockCandle[] = candles.map((c) => ({
          time: new Date(c.time),
          symbol: c.symbol,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
          source: 'cached',
        }));

        try {
          const inserted = await databaseService.insertCandles1m(dbCandles);
          totalFlushed += inserted;

          // Clear from Redis after successful insert
          await redisService.clearCandles(symbol);
          await redisService.clearPendingFlush(symbol);

          // Trim old candles (keep last 7 days in Redis)
          await redisService.trimOldCandles(symbol, 7);

          console.log(`[CandleBuffer] Flushed ${inserted} candles to TimescaleDB: ${symbol}`);
        } catch (error) {
          console.error(`[CandleBuffer] Error flushing ${symbol} to DB:`, error);
          // Data remains in pending for recovery
        }
      }

      return totalFlushed;
    } catch (error) {
      console.error('[CandleBuffer] Error in flushRedisToDatabase:', error);
      return 0;
    }
  }

  // Update latest quote (real-time price)
  async updateLatestQuote(
    symbol: string,
    quote: {
      currentPrice: number;
      change: number;
      changePercent: number;
      high: number;
      low: number;
      open: number;
      previousClose: number;
      volume: number;
    },
    source: 'websocket' | 'api' | 'cache' = 'api',
  ): Promise<void> {
    const timestamp = Date.now();

    const redisQuote: RedisLatestQuote = {
      ...quote,
      timestamp,
      source,
    };

    // Update Redis (fast, persistent)
    await redisService.updateLatestQuote(symbol, redisQuote);

    // Update cache (L1, very fast)
    cacheService.set(`latest:${symbol}`, redisQuote, 60);

    // Update TimescaleDB latest_quotes table (async, don't block)
    const dbQuote: LatestQuote = {
      symbol,
      currentPrice: quote.currentPrice,
      change: quote.change,
      changePercent: quote.changePercent,
      highPrice: quote.high,
      lowPrice: quote.low,
      openPrice: quote.open,
      previousClose: quote.previousClose,
      volume: quote.volume,
      timestamp: new Date(timestamp),
      source,
    };

    try {
      await databaseService.updateLatestQuote(dbQuote);
    } catch (error) {
      console.error(`[CandleBuffer] Error updating latest quote in DB: ${symbol}`, error);
    }
  }

  // Recovery: Check for orphaned data in Redis after restart
  async recoverFromRestart(): Promise<number> {
    try {
      const symbols = await redisService.getPendingSymbols();
      let totalRecovered = 0;

      for (const symbol of symbols) {
        const pending = await redisService.getPendingFlush(symbol);

        if (!pending || pending.length === 0) {
          await redisService.clearPendingFlush(symbol);
          continue;
        }

        // Check which candles are already in DB (deduplication)
        const from = new Date(pending[0].time);
        const to = new Date(pending[pending.length - 1].time);
        const existingCount = await databaseService.countCandlesInRange(symbol, from, to);

        if (existingCount >= pending.length) {
          // All candles already in DB
          console.log(`[Recovery] ${symbol}: All ${pending.length} candles already in DB`);
          await redisService.clearPendingFlush(symbol);
          continue;
        }

        // Filter out existing candles (simple timestamp-based dedup)
        const existingTimestamps = new Set<number>();
        const existingCandles = await databaseService.getCandles1m(symbol, from, to);
        existingCandles.forEach((c) => existingTimestamps.add(c.time.getTime()));

        const newCandles = pending.filter((c) => !existingTimestamps.has(c.time));

        if (newCandles.length > 0) {
          const dbCandles: StockCandle[] = newCandles.map((c) => ({
            time: new Date(c.time),
            symbol: c.symbol,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
            source: 'recovered',
          }));

          const inserted = await databaseService.insertCandles1m(dbCandles);
          totalRecovered += inserted;
          console.log(`[Recovery] Recovered ${inserted} candles for ${symbol} (skipped ${existingTimestamps.size})`);
        }

        await redisService.clearPendingFlush(symbol);
      }

      // Also check for candles not in pending but in Redis
      const trackedSymbols = await redisService.getTrackedSymbols();
      for (const symbol of trackedSymbols) {
        if (symbols.includes(symbol)) { continue; } // Already processed

        const candles = await redisService.getAllCandles(symbol);
        if (candles.length === 0) { continue; }

        const from = new Date(candles[0].time);
        const to = new Date(candles[candles.length - 1].time);

        const existingTimestamps = new Set<number>();
        const existingCandles = await databaseService.getCandles1m(symbol, from, to);
        existingCandles.forEach((c) => existingTimestamps.add(c.time.getTime()));

        const newCandles = candles.filter((c) => !existingTimestamps.has(c.time));

        if (newCandles.length > 0) {
          const dbCandles: StockCandle[] = newCandles.map((c) => ({
            time: new Date(c.time),
            symbol: c.symbol,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
            source: 'recovered',
          }));

          const inserted = await databaseService.insertCandles1m(dbCandles);
          totalRecovered += inserted;

          await redisService.clearCandles(symbol);
          console.log(`[Recovery] Recovered ${inserted} orphaned candles for ${symbol}`);
        }
      }

      console.log(`[Recovery] Total recovered: ${totalRecovered} candles`);
      return totalRecovered;
    } catch (error) {
      console.error('[Recovery] Error during recovery:', error);
      return 0;
    }
  }

  // Manual flush for development/emergency
  async manualFlush(): Promise<{ l1ToRedis: number; redisToDb: number }> {
    const l1Buffers = this.buffers.size;
    await this.flushL1ToRedis();
    const dbFlushed = await this.flushRedisToDatabase();

    return {
      l1ToRedis: l1Buffers,
      redisToDb: dbFlushed,
    };
  }

  // Get current buffer stats
  getStats(): {
    l1Buffers: number;
    l1TotalUpdates: number;
  } {
    let totalUpdates = 0;
    for (const buffer of this.buffers.values()) {
      totalUpdates += buffer.updates;
    }

    return {
      l1Buffers: this.buffers.size,
      l1TotalUpdates: totalUpdates,
    };
  }
}

export const candleBufferService = new CandleBufferService();
