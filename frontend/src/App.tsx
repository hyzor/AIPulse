import { Cpu, Code2, Rocket, Zap } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

import { CategoryPerformance } from './components/CategoryPerformance';
import { DataCollectionStatus } from './components/DataCollectionStatus';
import { ExpandedChartModal } from './components/ExpandedChartModal';
import { Header } from './components/Header';
import { StatusBar } from './components/StatusBar';
import { StockGrid } from './components/StockGrid';
import { TimeRangeProvider } from './contexts/TimeRangeContext';
import { useWebSocket, useAutoRefresh } from './hooks/useWebSocket';
import { stockService } from './services/stockService';
import { STOCK_CATEGORIES, TRACKED_STOCKS } from './types';

import type { StockQuote, RateLimitStatus } from './types';

function AppContent({ realtimeQuotes, isConnected, wsError, subscribe }: {
  realtimeQuotes: Map<string, StockQuote>;
  isConnected: boolean;
  wsError: string | null;
  subscribe: (_symbol: string) => void;
}) {
  const [stocks, setStocks] = useState<Map<string, StockQuote>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimitStatus | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

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
      const stocksMap = new Map(data.map((quote) => [quote.symbol, quote]));
      setStocks(stocksMap);
      setLastUpdate(new Date());

      // Check API health and rate limit
      const health = await stockService.checkHealth();
      setApiConfigured(health.finnhubConfigured);
      await fetchRateLimit();

      // Subscribe to all stocks via WebSocket
      data.forEach((quote) => { subscribe(quote.symbol); });
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

  // Live refresh - fetches fresh data for ALL stocks from API (if capacity available)
  const refreshAllStocks = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch fresh data for all stocks via the refresh endpoint
      // This will update all stocks if API capacity is available
      const refreshPromises = [...TRACKED_STOCKS].map(async (symbol) => {
        try {
          const result = await stockService.refreshStock(symbol);
          if (result.success && result.data) {
            return { symbol, data: result.data, cached: result.cached };
          }
          return null;
        } catch {
          return null;
        }
      });

      const results = await Promise.all(refreshPromises);
      const successfulRefreshes = results.filter((r) => r !== null);

      // Update stocks map with refreshed data
      if (successfulRefreshes.length > 0) {
        setStocks((prev) => {
          const newMap = new Map(prev);
          successfulRefreshes.forEach((item) => {
            if (item) {
              newMap.set(item.symbol, item.data);
            }
          });
          return newMap;
        });
        setLastUpdate(new Date());
      }

      // Calculate results
      const freshCount = successfulRefreshes.filter((r) => r && !r.cached).length;
      const cachedCount = successfulRefreshes.length - freshCount;
      const failedCount = TRACKED_STOCKS.length - successfulRefreshes.length;

      console.log(`[Refresh] ${freshCount} live, ${cachedCount} cached, ${failedCount} failed`);

      // Refresh rate limit status
      await fetchRateLimit();

      return { freshCount, cachedCount, failedCount };
    } catch (err) {
      console.error('Failed to refresh stocks:', err);
      return { freshCount: 0, cachedCount: 0, failedCount: TRACKED_STOCKS.length };
    } finally {
      setIsLoading(false);
    }
  }, [fetchRateLimit]);

  const selectedQuote = selectedSymbol ? stocks.get(selectedSymbol) || realtimeQuotes.get(selectedSymbol) || null : null;

  // Merge real-time quotes with polled data
  const mergedStocks = new Map(stocks);
  realtimeQuotes.forEach((quote, symbol) => {
    mergedStocks.set(symbol, quote);
  });

  // Get stocks by category
  const getStocksByCategory = (symbols: string[]) => {
    return symbols
      .map((symbol) => mergedStocks.get(symbol))
      .filter((quote): quote is StockQuote => quote !== undefined);
  };

  // Get all stocks sorted
  const allStocks = [...mergedStocks.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));

  return (
    <div className="min-h-screen bg-dark-900 text-white">
      <Header
        lastUpdate={lastUpdate}
        onRefresh={refreshAllStocks}
        isLoading={isLoading}
      />

      <StatusBar
        isConnected={isConnected}
        apiConfigured={apiConfigured}
        error={error || wsError}
        rateLimit={rateLimit}
      />

      {/* Category Performance Overview */}
      <CategoryPerformance stocks={mergedStocks} />

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
                ? `Background collection active ${rateLimit ? `(${rateLimit.callsRemaining} API calls available)` : ''}`
                : 'Background collection running (WebSocket disconnected)'}
            </span>
          </div>

          {isLoading && stocks.size === 0
            ? (
              <div className="flex items-center justify-center h-64">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-neon-blue"></div>
                  <span className="text-gray-400">Loading stock data...</span>
                </div>
              </div>
            )
            : stocks.size > 0
              ? (
                <StockGrid
                  quotes={allStocks}
                  realtimeQuotes={realtimeQuotes}
                  onStockClick={handleStockClick}
                />
              )
              : (
                <div className="text-center py-12">
                  <p className="text-gray-400">No stock data available. Check your API configuration.</p>
                </div>
              )}
        </section>

        {/* Categories */}
        {Object.entries(STOCK_CATEGORIES).map(([category, symbols]) => {
          const categoryStocks = getStocksByCategory(symbols);
          if (categoryStocks.length === 0) { return null; }

          // Category icon and color mapping
          const categoryConfig: Record<string, { icon: React.ReactNode; color: string; barColor: string }> = {
            'AI Chips': { icon: <Zap className="w-5 h-5" />, color: 'text-neon-purple', barColor: 'bg-neon-purple' },
            'Semiconductors': { icon: <Cpu className="w-5 h-5" />, color: 'text-neon-blue', barColor: 'bg-neon-blue' },
            'AI Software': { icon: <Code2 className="w-5 h-5" />, color: 'text-neon-green', barColor: 'bg-neon-green' },
            'Tech Giants': { icon: <Rocket className="w-5 h-5" />, color: 'text-orange-400', barColor: 'bg-orange-400' },
          };
          const config = categoryConfig[category] || { icon: null, color: 'text-gray-400', barColor: 'bg-gray-400' };

          return (
            <section key={category} className="mb-12">
              <h2 className={`text-xl font-bold mb-4 flex items-center gap-2 ${config.color}`}>
                <span className={`w-1 h-6 ${config.barColor} rounded-full`}></span>
                {config.icon}
                {category}
              </h2>
              <StockGrid
                quotes={categoryStocks}
                realtimeQuotes={realtimeQuotes}
                onStockClick={handleStockClick}
              />
            </section>
          );
        })}

        {/* Data Collection Status - Bottom of page */}
        <section className="mt-12 mb-8">
          <DataCollectionStatus />
        </section>

        {/* Info Footer */}
        <footer className="mt-12 pt-8 border-t border-dark-600">
          <div className="text-center text-sm text-gray-500">
            <p>
              Background data collection during market hours (9:30 AM - 4:00 PM ET).
              Click &quot;Live&quot; button for fresh data (API capacity permitting).
            </p>
            <p className="mt-1">Data provided by Finnhub API.</p>
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
  const { quotes: realtimeQuotes, isConnected, error: wsError, subscribe, historicalUpdates } = useWebSocket();

  return (
    <TimeRangeProvider historicalUpdates={historicalUpdates}>
      <AppContent
        realtimeQuotes={realtimeQuotes}
        isConnected={isConnected}
        wsError={wsError}
        subscribe={subscribe}
      />
    </TimeRangeProvider>
  );
}

export default App;
