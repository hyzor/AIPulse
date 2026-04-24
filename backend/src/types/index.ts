export interface StockQuote {
  symbol: string;
  currentPrice: number;
  change: number;
  changePercent: number;
  highPrice: number;
  lowPrice: number;
  openPrice: number;
  previousClose: number;
  volume: number;
  timestamp: number;
  isCached?: boolean; // True if data came from cache due to rate limiting
  isMarketClosed?: boolean; // True if market is closed and we're serving last known data
}

export interface StockProfile {
  symbol: string;
  name: string;
  industry: string;
  sector: string;
  marketCap: number;
  website: string;
  logo: string;
}

export interface FinnhubQuote {
  c: number; // Current price
  d: number; // Change
  dp: number; // Change percent
  h: number; // High price
  l: number; // Low price
  o: number; // Open price
  pc: number; // Previous close
  t: number; // Timestamp
  v: number; // Volume
}

export interface FinnhubProfile {
  name: string;
  industry: string;
  sector: string;
  marketCapitalization: number;
  weburl: string;
  logo: string;
}

export interface WebSocketMessage {
  type: 'quote' | 'error' | 'connected' | 'historicalUpdate';
  data?: StockQuote;
  symbol?: string;
  error?: string;
  message?: string;
  timestamp?: number;
}

// Historical candle data (OHLCV)
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

// API response for historical data
export interface HistoryResponse {
  symbol: string;
  resolution: '1m' | '5m' | '10m' | '30m' | '1h' | '4h' | '1d';
  from: string;
  to: string;
  candles: CandleData[];
  cached: boolean;
  partial: boolean;
}

// Individual candle data point (for JSON serialization)
export interface CandleData {
  t: number; // Unix timestamp
  o: number; // Open
  h: number; // High
  l: number; // Low
  c: number; // Close
  v: number; // Volume
}

// System health status
export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  services: {
    database: { connected: boolean; latency: number };
    redis: { connected: boolean; latency: number };
    finnhub: { configured: boolean; rateLimitRemaining: number };
  };
  dataStats: {
    total1mCandles: number;
    total1hCandles: number;
    total1dCandles: number;
    symbols: string[];
  };
}

// Flush operation result
export interface FlushResult {
  l1ToRedis: number;
  redisToDb: number;
  timestamp: string;
  message: string;
}

// Earnings calendar event
export interface EarningsEvent {
  symbol: string;
  date: string; // YYYY-MM-DD
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  hour: 'bmo' | 'amc' | null; // Before Market Open / After Market Close
}

// Raw Finnhub earnings calendar response
export interface FinnhubEarningsCalendar {
  symbol: string;
  date: string;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  hour: string;
}
