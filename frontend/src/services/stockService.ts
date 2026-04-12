import { ApiResponse, StockQuote, StockProfile, RateLimitStatus } from '../types';

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
      finnhubConfigured: data.finnhubConfigured,
      cacheStats: data.cacheStats,
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
}

export const stockService = new StockService();
