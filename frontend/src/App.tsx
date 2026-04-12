import { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { StatusBar } from './components/StatusBar';
import { StockGrid } from './components/StockGrid';
import { ExpandedChartModal } from './components/ExpandedChartModal';
import { TimeRangeProvider } from './contexts/TimeRangeContext';
import { stockService } from './services/stockService';
import { useWebSocket, useAutoRefresh } from './hooks/useWebSocket';
import { StockQuote, RateLimitStatus } from './types';

function AppContent() {
  const [stocks, setStocks] = useState<Map<string, StockQuote>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimitStatus | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  const { quotes: realtimeQuotes, isConnected, error: wsError, subscribe } = useWebSocket();

  // Fetch rate limit status
  const fetchRateLimit = useCallback(async () => {
    try {
      const status = await stockService.getRateLimitStatus();
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

  const handleStockClick = (symbol: string) => {
    setSelectedSymbol(symbol);
  };

  const handleCloseModal = () => {
    setSelectedSymbol(null);
  };

  const selectedQuote = selectedSymbol ? stocks.get(selectedSymbol) || realtimeQuotes.get(selectedSymbol) || null : null;

  return (
    <div className="min-h-screen bg-dark-900 text-white">
      <Header
        isConnected={isConnected}
        lastUpdate={lastUpdate}
        onRefresh={fetchStocks}
        isLoading={isLoading}
      />

      <StatusBar
        totalStocks={stocks.size}
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
              AI Market Overview
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
          ) : stocks.size > 0 ? (
            <StockGrid
              quotes={[...stocks.values()]}
              realtimeQuotes={realtimeQuotes}
              onStockClick={handleStockClick}
            />
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-400">No stock data available. Check your API configuration.</p>
            </div>
          )}
        </section>

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

      {/* Expanded Chart Modal */}
      <ExpandedChartModal
        symbol={selectedSymbol}
        quote={selectedQuote}
        onClose={handleCloseModal}
      />
    </div>
  );
}

function App() {
  return (
    <TimeRangeProvider>
      <AppContent />
    </TimeRangeProvider>
  );
}

export default App;
