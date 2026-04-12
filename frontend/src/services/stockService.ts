import { ApiResponse, StockQuote, StockProfile, RateLimitStatus, HistoryResponse, TimeRange } from '../types';

const API_URL = import.meta.env.VITE_API_URL || '';

class StockService {
  async getAllStocks(): Promise<StockQuote[]> {
    const response = await fetch(`${API_URL}/api/stocks`);
    const data: ApiResponse<StockQuote[]> = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch stocks');
    }
    
    return data.data;
  }

  async getStock(symbol: string): Promise<StockQuote> {
    const response = await fetch(`${API_URL}/api/stocks/${symbol}`);
    const data: ApiResponse<StockQuote> = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || `Failed to fetch ${symbol}`);
    }
    
    return data.data;
  }

  async getProfile(symbol: string): Promise<StockProfile> {
    const response = await fetch(`${API_URL}/api/profile/${symbol}`);
    const data: ApiResponse<StockProfile> = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || `Failed to fetch profile for ${symbol}`);
    }
    
    return data.data;
  }

  async checkHealth(): Promise<{ finnhubConfigured: boolean; cacheStats: { keys: number } }> {
    const response = await fetch(`${API_URL}/api/health`);
    const data = await response.json();
    return {
      finnhubConfigured: data.services?.finnhub?.configured ?? data.finnhubConfigured ?? false,
      cacheStats: data.cacheStats ?? { keys: 0 },
    };
  }

  async getRateLimitStatus(): Promise<RateLimitStatus> {
    const response = await fetch(`${API_URL}/api/rate-limit`);
    const data: ApiResponse<RateLimitStatus> = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch rate limit status');
    }
    
    return data.data;
  }

  async getHistory(symbol: string, range: TimeRange, resolution?: '1m' | '1h' | '1d'): Promise<HistoryResponse> {
    // Auto-determine resolution if not provided
    if (!resolution) {
      resolution = range === '30d' ? '1d' : '1h';
    }
    
    const response = await fetch(
      `${API_URL}/api/stocks/${symbol}/history?range=${range}&resolution=${resolution}`
    );
    const data: ApiResponse<HistoryResponse> = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || `Failed to fetch history for ${symbol}`);
    }
    
    return data.data;
  }
}

export const stockService = new StockService();
