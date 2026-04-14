import { Pool } from 'pg';

export interface StockCandle {
  time: Date;
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source?: string;
}

export interface LatestQuote {
  symbol: string;
  currentPrice: number;
  change: number;
  changePercent: number;
  highPrice: number;
  lowPrice: number;
  openPrice: number;
  previousClose: number;
  volume: number;
  timestamp: Date;
  source: string;
}

class DatabaseService {
  private pool: Pool;
  private isConnected: boolean = false;

  constructor() {
    const connectionString = process.env.DATABASE_URL
      || 'postgresql://postgres:postgres@localhost:5432/aipulse';

    this.pool = new Pool({
      connectionString,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('error', (err) => {
      console.error('[Database] Unexpected error on idle client', err);
      this.isConnected = false;
    });
  }

  async connect(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      this.isConnected = true;
      console.log('[Database] Connected to TimescaleDB');
      return true;
    } catch (error) {
      console.error('[Database] Connection failed:', error);
      this.isConnected = false;
      return false;
    }
  }

  async disconnect(): Promise<void> {
    await this.pool.end();
    this.isConnected = false;
    console.log('[Database] Disconnected from TimescaleDB');
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  // Insert 1-minute candles (batch insert for efficiency)
  async insertCandles1m(candles: StockCandle[]): Promise<number> {
    if (candles.length === 0) { return 0; }

    const values: (string | number | Date)[] = [];
    const placeholders: string[] = [];

    candles.forEach((candle, index) => {
      const offset = index * 8;
      placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`);
      values.push(
        candle.time,
        candle.symbol,
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.volume,
        candle.source || 'finnhub',
      );
    });

    const query = `
      INSERT INTO stock_candles_1m (time, symbol, open, high, low, close, volume, source)
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (time, symbol) DO UPDATE SET
        open = EXCLUDED.open,
        high = EXCLUDED.high,
        low = EXCLUDED.low,
        close = EXCLUDED.close,
        volume = EXCLUDED.volume,
        source = EXCLUDED.source
    `;

    try {
      const result = await this.pool.query(query, values);
      return result.rowCount || 0;
    } catch (error) {
      console.error('[Database] Error inserting candles:', error);
      throw error;
    }
  }

  // Get candles for a symbol in a time range
  async getCandles1m(
    symbol: string,
    from: Date,
    to: Date,
  ): Promise<StockCandle[]> {
    const query = `
      SELECT time, symbol, open, high, low, close, volume, source
      FROM stock_candles_1m
      WHERE symbol = $1 AND time >= $2 AND time <= $3
      ORDER BY time ASC
    `;

    try {
      const result = await this.pool.query(query, [symbol, from, to]);
      return result.rows.map((row) => ({
        time: row.time,
        symbol: row.symbol,
        open: parseFloat(row.open),
        high: parseFloat(row.high),
        low: parseFloat(row.low),
        close: parseFloat(row.close),
        volume: parseInt(row.volume, 10),
        source: row.source,
      }));
    } catch (error) {
      console.error('[Database] Error fetching candles:', error);
      throw error;
    }
  }

  // Get candles with resolution (uses continuous aggregates for 1h and 1d)
  async getCandles(
    symbol: string,
    from: Date,
    to: Date,
    resolution: '1m' | '1h' | '1d',
  ): Promise<StockCandle[]> {
    // Use continuous aggregate views for 1h and 1d, actual table for 1m
    const tableOrView = resolution === '1h'
      ? 'stock_candles_1h_aggregation'
      : resolution === '1d'
        ? 'stock_candles_1d_aggregation'
        : 'stock_candles_1m';

    const query = `
      SELECT time, symbol, open, high, low, close, volume, source
      FROM ${tableOrView}
      WHERE symbol = $1 AND time >= $2 AND time <= $3
      ORDER BY time ASC
    `;

    try {
      const result = await this.pool.query(query, [symbol, from, to]);
      return result.rows.map((row) => ({
        time: row.time,
        symbol: row.symbol,
        open: parseFloat(row.open),
        high: parseFloat(row.high),
        low: parseFloat(row.low),
        close: parseFloat(row.close),
        volume: parseInt(row.volume, 10),
        source: row.source,
      }));
    } catch (error) {
      console.error('[Database] Error fetching candles:', error);
      throw error;
    }
  }

  // Get latest quote for a symbol
  async getLatestQuote(symbol: string): Promise<LatestQuote | null> {
    const query = `
      SELECT symbol, current_price, change, change_percent, high_price, low_price,
             open_price, previous_close, volume, timestamp, source
      FROM latest_quotes
      WHERE symbol = $1
    `;

    try {
      const result = await this.pool.query(query, [symbol]);
      if (result.rows.length === 0) { return null; }

      const row = result.rows[0];
      return {
        symbol: row.symbol,
        currentPrice: parseFloat(row.current_price),
        change: parseFloat(row.change),
        changePercent: parseFloat(row.change_percent),
        highPrice: parseFloat(row.high_price),
        lowPrice: parseFloat(row.low_price),
        openPrice: parseFloat(row.open_price),
        previousClose: parseFloat(row.previous_close),
        volume: parseInt(row.volume, 10),
        timestamp: row.timestamp,
        source: row.source,
      };
    } catch (error) {
      console.error('[Database] Error fetching latest quote:', error);
      throw error;
    }
  }

  // Update latest quote
  async updateLatestQuote(quote: LatestQuote): Promise<void> {
    const query = `
      INSERT INTO latest_quotes (symbol, current_price, change, change_percent, 
                                high_price, low_price, open_price, previous_close, 
                                volume, timestamp, source)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (symbol) DO UPDATE SET
        current_price = EXCLUDED.current_price,
        change = EXCLUDED.change,
        change_percent = EXCLUDED.change_percent,
        high_price = EXCLUDED.high_price,
        low_price = EXCLUDED.low_price,
        open_price = EXCLUDED.open_price,
        previous_close = EXCLUDED.previous_close,
        volume = EXCLUDED.volume,
        timestamp = EXCLUDED.timestamp,
        source = EXCLUDED.source
    `;

    try {
      await this.pool.query(query, [
        quote.symbol,
        quote.currentPrice,
        quote.change,
        quote.changePercent,
        quote.highPrice,
        quote.lowPrice,
        quote.openPrice,
        quote.previousClose,
        quote.volume,
        quote.timestamp,
        quote.source,
      ]);
    } catch (error) {
      console.error('[Database] Error updating latest quote:', error);
      throw error;
    }
  }

  // Get data range for a symbol (earliest and latest data we have)
  async getDataRange(symbol: string): Promise<{ oldest: Date | null; newest: Date | null }> {
    const query = `
      SELECT MIN(time) as oldest, MAX(time) as newest
      FROM stock_candles_1m
      WHERE symbol = $1
    `;

    try {
      const result = await this.pool.query(query, [symbol]);
      if (result.rows.length === 0 || !result.rows[0].oldest) {
        return { oldest: null, newest: null };
      }

      return {
        oldest: result.rows[0].oldest,
        newest: result.rows[0].newest,
      };
    } catch (error) {
      console.error('[Database] Error fetching data range:', error);
      throw error;
    }
  }

  // Check if specific time range exists (for gap detection)
  async hasDataInRange(symbol: string, from: Date, to: Date): Promise<boolean> {
    const query = `
      SELECT EXISTS(
        SELECT 1 FROM stock_candles_1m
        WHERE symbol = $1 AND time >= $2 AND time <= $3
        LIMIT 1
      ) as has_data
    `;

    try {
      const result = await this.pool.query(query, [symbol, from, to]);
      return result.rows[0].has_data;
    } catch (error) {
      console.error('[Database] Error checking data range:', error);
      throw error;
    }
  }

  // Count candles in range (for deduplication/verification)
  async countCandlesInRange(symbol: string, from: Date, to: Date): Promise<number> {
    const query = `
      SELECT COUNT(*) as count
      FROM stock_candles_1m
      WHERE symbol = $1 AND time >= $2 AND time <= $3
    `;

    try {
      const result = await this.pool.query(query, [symbol, from, to]);
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      console.error('[Database] Error counting candles:', error);
      throw error;
    }
  }

  // Get system state value
  async getSystemState(key: string): Promise<string | null> {
    const query = 'SELECT value FROM system_state WHERE key = $1';

    try {
      const result = await this.pool.query(query, [key]);
      return result.rows.length > 0 ? result.rows[0].value : null;
    } catch (error) {
      console.error('[Database] Error fetching system state:', error);
      return null;
    }
  }

  // Set system state value
  async setSystemState(key: string, value: string): Promise<void> {
    const query = `
      INSERT INTO system_state (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = EXCLUDED.updated_at
    `;

    try {
      await this.pool.query(query, [key, value]);
    } catch (error) {
      console.error('[Database] Error setting system state:', error);
    }
  }

  // Get health status
  async getHealthStatus(): Promise<{ connected: boolean; latency: number }> {
    const start = Date.now();

    try {
      await this.pool.query('SELECT 1');
      return {
        connected: true,
        latency: Date.now() - start,
      };
    } catch (error) {
      return {
        connected: false,
        latency: -1,
      };
    }
  }

  // Get database stats
  async getStats(): Promise<{
    total1mCandles: number;
    total1hCandles: number;
    total1dCandles: number;
    symbols: string[];
    symbols1h: string[];
    symbols1d: string[];
  }> {
    try {
      // Query continuous aggregate views for 1h and 1d, actual table for 1m
      const [candles1m, candles1h, candles1d, candleSymbols, latestQuoteSymbols, symbols1h, symbols1d] = await Promise.all([
        this.pool.query('SELECT COUNT(*) FROM stock_candles_1m'),
        this.pool.query('SELECT COUNT(*) FROM stock_candles_1h_aggregation'),
        this.pool.query('SELECT COUNT(*) FROM stock_candles_1d_aggregation'),
        this.pool.query('SELECT DISTINCT symbol FROM stock_candles_1m ORDER BY symbol'),
        this.pool.query('SELECT DISTINCT symbol FROM latest_quotes ORDER BY symbol'),
        this.pool.query('SELECT DISTINCT symbol FROM stock_candles_1h_aggregation ORDER BY symbol'),
        this.pool.query('SELECT DISTINCT symbol FROM stock_candles_1d_aggregation ORDER BY symbol'),
      ]);

      // Merge symbols from both candles and latest_quotes tables
      const symbolsFromCandles = candleSymbols.rows.map((r) => r.symbol);
      const symbolsFromLatest = latestQuoteSymbols.rows.map((r) => r.symbol);
      const allSymbols = [...new Set([...symbolsFromCandles, ...symbolsFromLatest])].sort();

      return {
        total1mCandles: parseInt(candles1m.rows[0].count, 10),
        total1hCandles: parseInt(candles1h.rows[0].count, 10),
        total1dCandles: parseInt(candles1d.rows[0].count, 10),
        symbols: allSymbols,
        symbols1h: symbols1h.rows.map((r) => r.symbol),
        symbols1d: symbols1d.rows.map((r) => r.symbol),
      };
    } catch (error) {
      console.error('[Database] Error fetching stats:', error);
      return {
        total1mCandles: 0,
        total1hCandles: 0,
        total1dCandles: 0,
        symbols: [],
        symbols1h: [],
        symbols1d: [],
      };
    }
  }
}

export const databaseService = new DatabaseService();
