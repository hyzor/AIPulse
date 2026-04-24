import { createClient } from 'redis';

import type { RedisClientType } from 'redis';

export interface RedisCandle {
  time: number; // Unix timestamp in milliseconds
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface RedisLatestQuote {
  currentPrice: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  volume: number;
  timestamp: number;
  source: 'websocket' | 'api' | 'cache';
}

class RedisService {
  private client: RedisClientType | null = null;
  private isConnected: boolean = false;

  async connect(): Promise<boolean> {
    try {
      const url = process.env.REDIS_URL || 'redis://localhost:6379';

      this.client = createClient({
        url,
        socket: {
          reconnectStrategy: (retries) => Math.min(retries * 50, 500),
        },
      });

      this.client.on('error', (err) => {
        console.error('[Redis] Client error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('[Redis] Connected to Redis');
        this.isConnected = true;
      });

      this.client.on('disconnect', () => {
        console.log('[Redis] Disconnected from Redis');
        this.isConnected = false;
      });

      await this.client.connect();
      return true;
    } catch (error) {
      console.error('[Redis] Connection failed:', error);
      this.isConnected = false;
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
      console.log('[Redis] Disconnected');
    }
  }

  getConnectionStatus(): boolean {
    return this.isConnected && this.client?.isReady || false;
  }

  // Add a 1m candle to the sorted set for a symbol
  async addCandle(symbol: string, candle: RedisCandle): Promise<void> {
    if (!this.client) { throw new Error('Redis not connected'); }

    const key = `quotes:${symbol}`;
    const value = JSON.stringify({
      o: candle.open,
      h: candle.high,
      l: candle.low,
      c: candle.close,
      v: candle.volume,
    });

    // Remove any existing entries with the same timestamp first (UPSERT behavior)
    // This prevents duplicates when the same minute is flushed multiple times
    await this.client.zRemRangeByScore(key, candle.time, candle.time);

    // Use the timestamp as the score for sorted set ordering
    await this.client.zAdd(key, { score: candle.time, value });
  }

  // Add multiple candles (batch insert)
  async addCandles(symbol: string, candles: RedisCandle[]): Promise<void> {
    if (!this.client) { throw new Error('Redis not connected'); }

    const key = `quotes:${symbol}`;

    // Remove existing entries for timestamps we're about to add (prevent duplicates)
    for (const candle of candles) {
      await this.client.zRemRangeByScore(key, candle.time, candle.time);
    }

    const members = candles.map((candle) => ({
      score: candle.time,
      value: JSON.stringify({
        o: candle.open,
        h: candle.high,
        l: candle.low,
        c: candle.close,
        v: candle.volume,
      }),
    }));

    if (members.length > 0) {
      await this.client.zAdd(key, members);
    }
  }

  // Get candles for a symbol in a time range
  async getCandles(symbol: string, from: number, to: number): Promise<RedisCandle[]> {
    if (!this.client) { throw new Error('Redis not connected'); }

    const key = `quotes:${symbol}`;
    const results = await this.client.zRangeByScoreWithScores(key, from, to);

    return results.map((result) => {
      const data = JSON.parse(result.value);
      return {
        time: result.score,
        symbol,
        open: data.o,
        high: data.h,
        low: data.l,
        close: data.c,
        volume: data.v,
      };
    });
  }

  // Get candles by index range (more efficient for "last N candles" queries)
  async getCandlesByRange(symbol: string, start: number, stop: number): Promise<RedisCandle[]> {
    if (!this.client) { throw new Error('Redis not connected'); }

    const key = `quotes:${symbol}`;
    const results = await this.client.zRangeWithScores(key, start, stop);

    return results.map((result) => {
      const data = JSON.parse(result.value);
      return {
        time: result.score,
        symbol,
        open: data.o,
        high: data.h,
        low: data.l,
        close: data.c,
        volume: data.v,
      };
    });
  }

  // Get the latest candle for a symbol
  async getLatestCandle(symbol: string): Promise<RedisCandle | null> {
    if (!this.client) { throw new Error('Redis not connected'); }

    const key = `quotes:${symbol}`;
    const results = await this.client.zRangeWithScores(key, -1, -1);

    if (results.length === 0) { return null; }

    const result = results[0];
    const data = JSON.parse(result.value);

    return {
      time: result.score,
      symbol,
      open: data.o,
      high: data.h,
      low: data.l,
      close: data.c,
      volume: data.v,
    };
  }

  // Get all candles for a symbol (for flush to DB)
  async getAllCandles(symbol: string): Promise<RedisCandle[]> {
    if (!this.client) { throw new Error('Redis not connected'); }

    const key = `quotes:${symbol}`;
    const results = await this.client.zRangeWithScores(key, 0, -1);

    return results.map((result) => {
      const data = JSON.parse(result.value);
      return {
        time: result.score,
        symbol,
        open: data.o,
        high: data.h,
        low: data.l,
        close: data.c,
        volume: data.v,
      };
    });
  }

  // Trim old candles (keep only last 7 days)
  async trimOldCandles(symbol: string, keepDays: number = 7): Promise<number> {
    if (!this.client) { throw new Error('Redis not connected'); }

    const key = `quotes:${symbol}`;
    const cutoff = Date.now() - (keepDays * 24 * 60 * 60 * 1000);

    // Remove all entries with score < cutoff
    return this.client.zRemRangeByScore(key, 0, cutoff);
  }

  // Update latest quote (real-time price)
  async updateLatestQuote(symbol: string, quote: RedisLatestQuote): Promise<void> {
    if (!this.client) { throw new Error('Redis not connected'); }

    const key = `latest:${symbol}`;
    await this.client.hSet(key, {
      currentPrice: quote.currentPrice.toString(),
      change: quote.change.toString(),
      changePercent: quote.changePercent.toString(),
      high: quote.high.toString(),
      low: quote.low.toString(),
      open: quote.open.toString(),
      previousClose: quote.previousClose.toString(),
      volume: quote.volume.toString(),
      timestamp: quote.timestamp.toString(),
      source: quote.source,
    });
  }

  // Get latest quote
  async getLatestQuote(symbol: string): Promise<RedisLatestQuote | null> {
    if (!this.client) { throw new Error('Redis not connected'); }

    const key = `latest:${symbol}`;
    const data = await this.client.hGetAll(key);

    if (Object.keys(data).length === 0) { return null; }

    return {
      currentPrice: parseFloat(data.currentPrice),
      change: parseFloat(data.change),
      changePercent: parseFloat(data.changePercent),
      high: parseFloat(data.high),
      low: parseFloat(data.low),
      open: parseFloat(data.open),
      previousClose: parseFloat(data.previousClose),
      volume: parseInt(data.volume, 10),
      timestamp: parseInt(data.timestamp, 10),
      source: data.source as 'websocket' | 'api' | 'cache',
    };
  }

  // Store pending candles that need to be flushed to TimescaleDB
  // Used for recovery if the server restarts before flush
  async setPendingFlush(symbol: string, candles: RedisCandle[]): Promise<void> {
    if (!this.client) { throw new Error('Redis not connected'); }

    const key = `pending:timescale_flush:${symbol}`;
    const data = JSON.stringify(candles);
    // Expire after 24 hours (if not recovered by then, data is likely stale)
    await this.client.setEx(key, 24 * 60 * 60, data);
  }

  // Get pending candles for recovery
  async getPendingFlush(symbol: string): Promise<RedisCandle[] | null> {
    if (!this.client) { throw new Error('Redis not connected'); }

    const key = `pending:timescale_flush:${symbol}`;
    const data = await this.client.get(key);

    if (!data) { return null; }

    return JSON.parse(data);
  }

  // Clear pending flush after successful DB write
  async clearPendingFlush(symbol: string): Promise<void> {
    if (!this.client) { throw new Error('Redis not connected'); }

    const key = `pending:timescale_flush:${symbol}`;
    await this.client.del(key);
  }

  // Get all symbols with pending data (for recovery)
  async getPendingSymbols(): Promise<string[]> {
    if (!this.client) { throw new Error('Redis not connected'); }

    const keys = await this.client.keys('pending:timescale_flush:*');
    return keys.map((key) => key.replace('pending:timescale_flush:', ''));
  }

  // Clear all candles for a symbol (after successful DB flush)
  async clearCandles(symbol: string): Promise<void> {
    if (!this.client) { throw new Error('Redis not connected'); }

    const key = `quotes:${symbol}`;
    await this.client.del(key);
  }

  // Get all tracked symbols (any symbol with data in Redis)
  async getTrackedSymbols(): Promise<string[]> {
    if (!this.client) { throw new Error('Redis not connected'); }

    const keys = await this.client.keys('quotes:*');
    return keys.map((key) => key.replace('quotes:', ''));
  }

  // Health check
  async ping(): Promise<boolean> {
    if (!this.client) { return false; }

    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  // Get Redis memory stats
  async getMemoryStats(): Promise<{ used: number; keys: number }> {
    if (!this.client) { throw new Error('Redis not connected'); }

    const info = await this.client.info('memory');
    const usedMatch = info.match(/used_memory:(\d+)/);
    const used = usedMatch ? parseInt(usedMatch[1], 10) : 0;

    const keys = await this.client.dbSize();

    return { used, keys };
  }

  // Get the last timestamp for a symbol (for gap detection)
  async getLatestTimestamp(symbol: string): Promise<number | null> {
    if (!this.client) { throw new Error('Redis not connected'); }

    const key = `quotes:${symbol}`;
    const results = await this.client.zRangeWithScores(key, -1, -1);

    if (results.length === 0) { return null; }

    return results[0].score;
  }

  // Generic JSON get/set for persistent caching across restarts
  async getJson<T>(key: string): Promise<T | null> {
    if (!this.client) { return null; }
    try {
      const data = await this.client.get(key);
      if (!data) { return null; }
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }

  async setJson<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (!this.client) { return; }
    try {
      await this.client.setEx(key, ttlSeconds, JSON.stringify(value));
    } catch (err) {
      console.error(`[Redis] Failed to set ${key}:`, err);
    }
  }

  async delJson(key: string): Promise<void> {
    if (!this.client) { return; }
    try {
      await this.client.del(key);
    } catch {
      // ignore
    }
  }

  // Clear all keys matching a pattern (use carefully)
  async clearPattern(pattern: string): Promise<void> {
    if (!this.client) { return; }
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
    } catch {
      // ignore
    }
  }
}

export const redisService = new RedisService();
