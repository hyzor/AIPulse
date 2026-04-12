export interface StockQuote {
  symbol: string;
  currentPrice: number;
  change: number;
  changePercent: number;
  highPrice: number;
  lowPrice: number;
  openPrice: number;
  previousClose: number;
  timestamp: number;
  isCached?: boolean; // True if data came from cache due to rate limiting
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

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: number;
  count?: number;
  error?: string;
  message?: string;
}

export interface WebSocketMessage {
  type: 'quote' | 'error' | 'connected';
  data?: StockQuote;
  symbol?: string;
  error?: string;
  message?: string;
  trackedStocks?: string[];
}

export const TRACKED_STOCKS = [
  'NVDA', 'AMD', 'AVGO', 'MRVL', 'TSM', 'ASML', 'ARM', 'MU', 'SNDK',
  'PLTR', 'MSFT', 'GOOGL', 'AMZN', 'TSLA',
] as const;

export const STOCK_DISPLAY_NAMES: Record<string, string> = {
  NVDA: 'NVIDIA',
  AMD: 'AMD',
  AVGO: 'Broadcom',
  MRVL: 'Marvell',
  TSM: 'TSMC',
  ASML: 'ASML',
  ARM: 'ARM Holdings',
  MU: 'Micron',
  SNDK: 'SanDisk',
  PLTR: 'Palantir',
  MSFT: 'Microsoft',
  GOOGL: 'Alphabet',
  AMZN: 'Amazon',
  TSLA: 'Tesla',
};

export const STOCK_CATEGORIES: Record<string, string[]> = {
  'AI Chips': ['NVDA', 'AMD'],
  'Semiconductors': ['AVGO', 'MRVL', 'TSM', 'ASML', 'ARM', 'MU', 'SNDK'],
  'AI Software': ['PLTR', 'MSFT', 'GOOGL'],
  'Tech Giants': ['AMZN', 'TSLA'],
};

// Exchange information - all tracked stocks trade on US markets
export type StockExchange = 'NASDAQ' | 'NYSE';

export const STOCK_EXCHANGES: Record<string, StockExchange> = {
  // NASDAQ
  NVDA: 'NASDAQ',
  AMD: 'NASDAQ',
  AVGO: 'NASDAQ',
  MRVL: 'NASDAQ',
  ASML: 'NASDAQ',
  ARM: 'NASDAQ',
  MU: 'NASDAQ',
  SNDK: 'NASDAQ',
  MSFT: 'NASDAQ',
  GOOGL: 'NASDAQ',
  AMZN: 'NASDAQ',
  // NYSE
  TSM: 'NYSE',
  PLTR: 'NYSE',
  TSLA: 'NYSE',
};

export interface RateLimitStatus {
  callsInCurrentWindow: number;
  windowStart: number;
  totalCalls: number;
  rateLimitedCount: number;
  percentUsed: number;
  callsRemaining: number;
  maxPerMinute: number;
  tier: string;
}

// Historical candle data (OHLCV)
export interface CandleData {
  t: number; // Unix timestamp in milliseconds
  o: number; // Open price
  h: number; // High price
  l: number; // Low price
  c: number; // Close price
  v: number; // Volume
}

// API response for historical data
export interface HistoryResponse {
  symbol: string;
  resolution: '1m' | '1h' | '1d';
  from: string;
  to: string;
  candles: CandleData[];
  cached: boolean;
  partial: boolean;
}

// Time range options
export type TimeRange = '1d' | '7d' | '30d';

// Historical data state for a symbol
export interface SymbolHistoryState {
  candles: CandleData[];
  loading: boolean;
  error: string | null;
  lastUpdated: number;
}

// Historical data cache structure
export type HistoricalDataCache = {
  [symbol: string]: {
    [range in TimeRange]?: SymbolHistoryState;
  };
};
