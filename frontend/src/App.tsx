import { useState, useEffect, useCallback } from 'react';
import { StockCard } from './components/StockCard';
import { Header } from './components/Header';
import { StatusBar } from './components/StatusBar';
import { stockService } from './services/stockService';
import { useWebSocket, useAutoRefresh } from './hooks/useWebSocket';
import { StockQuote, TRACKED_STOCKS, STOCK_CATEGORIES, RateLimitStatus } from './types';

function App() {
  const [stocks, setStocks] = useState<Map<string, StockQuote>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimitStatus | null>(null);

  const { quotes: realtimeQuotes, isConnected, error: wsError, subscribe } = useWebSocket();

  // Fetch rate limit status
  const fetchRateLimit = useCallback(async () => {
    try {
      const status = await stockService.getRateLimitStatus();
      console.log('[Rate Limit] Fetched:', status);
      setRateLimit(status);
    } catch (err) {
      console.error('Failed to fetch rate limit status:', err);
    }
  }, []);

  // Fetch initial stock data
  const fetchStocks = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await stockService.getAllStocks();
      const stocksMap = new Map(data.map(quote => [quote.symbol, quote]));
      setStocks(stocksMap);
      setLastUpdate(new Date());

      // Check API health and rate limit
      const health = await stockService.checkHealth();
      setApiConfigured(health.finnhubConfigured);
      await fetchRateLimit();

      // Subscribe to all stocks via WebSocket
      data.forEach(quote => subscribe(quote.symbol));
    } catch (err) {
      console.error('Failed to fetch stocks:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch stock data');
    } finally {
      setIsLoading(false);
    }
  }, [subscribe, fetchRateLimit]);

  // Auto-refresh stocks every 60 seconds
  useAutoRefresh(fetchStocks, 60000, true);

  // Auto-refresh rate limit every 15 seconds
  useAutoRefresh(fetchRateLimit, 15000, true);

  // Initial fetch
  useEffect(() => {
    fetchStocks();
  }, [fetchStocks]);

  // Merge real-time quotes with polled data
  const mergedStocks = new Map(stocks);
  realtimeQuotes.forEach((quote, symbol) => {
    mergedStocks.set(symbol, quote);
  });

  // Get stocks by category
  const getStocksByCategory = (symbols: string[]) => {
    return symbols
      .map(symbol => mergedStocks.get(symbol))
      .filter((quote): quote is StockQuote => quote !== undefined);
  };

  const allStocks = [...mergedStocks.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));

  return (
    <div className="min-h-screen bg-dark-900 text-white">
      <Header
        isConnected={isConnected}
        lastUpdate={lastUpdate}
        onRefresh={fetchStocks}
        isLoading={isLoading}
      />

      <StatusBar
        totalStocks={allStocks.length}
        apiConfigured={apiConfigured}
        error={error || wsError}
        rateLimit={rateLimit}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* All Stocks Grid */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <span className="w-1 h-6 bg-neon-blue rounded-full"></span>
              All AI Stocks
            </h2>
            <span className="text-sm text-gray-500">
              {isConnected 
                ? `Real-time updates active ${rateLimit ? `(${rateLimit.callsRemaining} calls left)` : ''}` 
                : 'Polling mode (60s refresh)'}
            </span>
          </div>

          {isLoading && stocks.size === 0 ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-neon-blue"></div>
                <span className="text-gray-400">Loading stock data...</span>
              </div>
            </div>
          ) : allStocks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {allStocks.map(quote => (
                <StockCard
                  key={quote.symbol}
                  quote={quote}
                  isRealtime={realtimeQuotes.has(quote.symbol)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-400">No stock data available. Check your API configuration.</p>
            </div>
          )}
        </section>

        {/* Categories */}
        {Object.entries(STOCK_CATEGORIES).map(([category, symbols]) => {
          const categoryStocks = getStocksByCategory(symbols);
          if (categoryStocks.length === 0) return null;

          return (
            <section key={category} className="mb-12">
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <span className="w-1 h-5 bg-neon-purple rounded-full"></span>
                {category}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {categoryStocks.map(quote => (
                  <StockCard
                    key={quote.symbol}
                    quote={quote}
                    isRealtime={realtimeQuotes.has(quote.symbol)}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {/* Info Footer */}
        <footer className="mt-12 pt-8 border-t border-dark-600">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-500">
            <p>Data provided by Finnhub API. Real-time updates via WebSocket.</p>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-neon-green"></span>
                Positive
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-neon-red"></span>
                Negative
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-neon-blue animate-pulse"></span>
                Real-time
              </span>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

export default App;
