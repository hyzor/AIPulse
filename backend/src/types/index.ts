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

export interface FinnhubQuote {
  c: number; // Current price
  d: number; // Change
  dp: number; // Change percent
  h: number; // High price
  l: number; // Low price
  o: number; // Open price
  pc: number; // Previous close
  t: number; // Timestamp
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
  type: 'quote' | 'error' | 'connected';
  data?: StockQuote;
  symbol?: string;
  error?: string;
}
