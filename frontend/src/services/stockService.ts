import type { ApiResponse, StockQuote, StockProfile, RateLimitStatus, HistoryResponse, TimeRange } from '../types';

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

  async checkHealth(): Promise<{ finnhubConfigured: boolean; cacheStats: { keys: number }; dataStats?: any }> {
    const response = await fetch(`${API_URL}/api/health`);
    const data = await response.json();
    return {
      finnhubConfigured: data.services?.finnhub?.configured ?? data.finnhubConfigured ?? false,
      cacheStats: data.cacheStats ?? { keys: 0 },
      dataStats: data.dataStats,
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

  async getHistory(symbol: string, range: TimeRange, resolution?: '1m' | '10m' | '1h' | '4h' | '1d'): Promise<HistoryResponse> {
    // Send client's current timestamp so server calculates range from user's timezone
    const now = Date.now();

    // Build query params - only include resolution if explicitly provided
    // Let backend decide default resolution for best data availability
    const resolutionParam = resolution ? `&resolution=${resolution}` : '';

    const response = await fetch(
      `${API_URL}/api/stocks/${symbol}/history?range=${range}${resolutionParam}&now=${now}`,
    );
    const data: ApiResponse<HistoryResponse> = await response.json();

    if (!data.success) {
      throw new Error(data.error || `Failed to fetch history for ${symbol}`);
    }

    return data.data;
  }

  /**
   * Manual refresh - fetches live data from API if capacity available
   * Background collector has priority, so this may return cached data
   */
  async refreshStock(symbol: string): Promise<{
    success: boolean;
    cached: boolean;
    symbol: string;
    data: StockQuote;
    message: string;
    rateLimit?: RateLimitStatus;
  }> {
    const response = await fetch(`${API_URL}/api/stocks/${symbol}/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Failed to refresh ${symbol}`);
    }

    return data;
  }
}

export const stockService = new StockService();
