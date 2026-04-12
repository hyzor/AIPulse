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
  'NVDA', 'AMD', 'AVGO', 'MRVL', 'TSM', 'ASML', 'ARM',
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
  PLTR: 'Palantir',
  MSFT: 'Microsoft',
  GOOGL: 'Alphabet',
  AMZN: 'Amazon',
  TSLA: 'Tesla',
};

export const STOCK_CATEGORIES: Record<string, string[]> = {
  'AI Chips': ['NVDA', 'AMD'],
  'Semiconductors': ['AVGO', 'MRVL', 'TSM', 'ASML', 'ARM'],
  'AI Software': ['PLTR', 'MSFT', 'GOOGL'],
  'Tech Giants': ['AMZN', 'TSLA'],
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
