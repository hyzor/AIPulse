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

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: number;
  count?: number;
  error?: string;
  message?: string;
}

export interface WebSocketMessage {
  type: 'quote' | 'error' | 'connected' | 'historicalUpdate';
  data?: StockQuote;
  symbol?: string;
  error?: string;
  message?: string;
  trackedStocks?: string[];
  timestamp?: number;
}

export const TRACKED_STOCKS = [
  'NVDA', 'AMD', 'AVGO', 'TSM', 'ASML', 'ARM', 'MU', 'SNDK',
  'MSFT', 'GOOGL', 'META', 'AMZN', 'AAPL', 'ORCL', 'TSLA',
] as const;

export const STOCK_DISPLAY_NAMES: Record<string, string> = {
  NVDA: 'NVIDIA',
  AMD: 'AMD',
  AVGO: 'Broadcom',
  TSM: 'TSMC',
  ASML: 'ASML',
  ARM: 'ARM Holdings',
  MU: 'Micron',
  SNDK: 'SanDisk',
  MSFT: 'Microsoft',
  GOOGL: 'Alphabet',
  META: 'Meta',
  AMZN: 'Amazon',
  AAPL: 'Apple',
  ORCL: 'Oracle',
  TSLA: 'Tesla',
};

export const STOCK_CATEGORIES: Record<string, string[]> = {
  'AI Chips': ['NVDA', 'AMD'],
  'Semiconductors': ['AVGO', 'TSM', 'ASML', 'ARM', 'MU', 'SNDK'],
  'AI Software': ['MSFT', 'GOOGL', 'META', 'ORCL'],
  'Tech Giants': ['AMZN', 'AAPL', 'TSLA'],
};

// Exchange information - all tracked stocks trade on US markets
export type StockExchange = 'NASDAQ' | 'NYSE';

export const STOCK_EXCHANGES: Record<string, StockExchange> = {
  // NASDAQ
  NVDA: 'NASDAQ',
  AMD: 'NASDAQ',
  AVGO: 'NASDAQ',
  ASML: 'NASDAQ',
  ARM: 'NASDAQ',
  MU: 'NASDAQ',
  SNDK: 'NASDAQ',
  MSFT: 'NASDAQ',
  GOOGL: 'NASDAQ',
  META: 'NASDAQ',
  AMZN: 'NASDAQ',
  AAPL: 'NASDAQ',
  // NYSE
  TSM: 'NYSE',
  ORCL: 'NYSE',
  TSLA: 'NYSE',
};

// Country flags and origins for each stock (where the company was founded/headquartered)
export const STOCK_COUNTRIES: Record<string, {
  country: string;
  flag: string;
  origin: string;
  countryCode: string; // ISO 3166-1 alpha-2 for flag images
}> = {
  NVDA: { country: 'United States', flag: '🇺🇸', origin: 'Santa Clara, CA', countryCode: 'us' },
  AMD: { country: 'United States', flag: '🇺🇸', origin: 'Sunnyvale, CA', countryCode: 'us' },
  AVGO: { country: 'United States', flag: '🇺🇸', origin: 'Palo Alto, CA', countryCode: 'us' },
  TSM: { country: 'Taiwan', flag: '🇹🇼', origin: 'Hsinchu, Taiwan', countryCode: 'tw' },
  ASML: { country: 'Netherlands', flag: '🇳🇱', origin: 'Veldhoven, Netherlands', countryCode: 'nl' },
  ARM: { country: 'United Kingdom', flag: '🇬🇧', origin: 'Cambridge, UK', countryCode: 'gb' },
  MU: { country: 'United States', flag: '🇺🇸', origin: 'Boise, ID', countryCode: 'us' },
  SNDK: { country: 'United States', flag: '🇺🇸', origin: 'Milpitas, CA', countryCode: 'us' },
  MSFT: { country: 'United States', flag: '🇺🇸', origin: 'Redmond, WA', countryCode: 'us' },
  GOOGL: { country: 'United States', flag: '🇺🇸', origin: 'Mountain View, CA', countryCode: 'us' },
  META: { country: 'United States', flag: '🇺🇸', origin: 'Menlo Park, CA', countryCode: 'us' },
  AMZN: { country: 'United States', flag: '🇺🇸', origin: 'Seattle, WA', countryCode: 'us' },
  AAPL: { country: 'United States', flag: '🇺🇸', origin: 'Cupertino, CA', countryCode: 'us' },
  ORCL: { country: 'United States', flag: '🇺🇸', origin: 'Austin, TX', countryCode: 'us' },
  TSLA: { country: 'United States', flag: '🇺🇸', origin: 'Austin, TX', countryCode: 'us' },
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
  resolution: '1m' | '5m' | '10m' | '30m' | '1h' | '4h' | '1d';
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
    [_range in TimeRange]?: SymbolHistoryState;
  };
};
