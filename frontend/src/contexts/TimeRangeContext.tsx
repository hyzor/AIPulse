import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

import { stockService } from '../services/stockService';
import { checkMarketOpen } from '../utils/format';

import type { TimeRange, HistoricalDataCache, SymbolHistoryState } from '../types';

interface TimeRangeContextType {
  timeRange: TimeRange;
  setTimeRange: (_range: TimeRange) => void;
  historicalData: HistoricalDataCache;
  fetchHistory: (_symbol: string) => Promise<void>;
  fetchAllHistory: (_symbols: string[]) => Promise<void>;
  getSymbolData: (_symbol: string) => SymbolHistoryState | undefined;
  isLoading: boolean;
  error: string | null;
  refreshData: () => Promise<void>;
  isLive: boolean;
}

const TimeRangeContext = createContext<TimeRangeContextType | undefined>(undefined);

export function TimeRangeProvider({ children }: { children: React.ReactNode }) {
  const [timeRange, setTimeRangeState] = useState<TimeRange>('1d');
  const [historicalData, setHistoricalData] = useState<HistoricalDataCache>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [symbols, setSymbols] = useState<string[]>([]);

  const isLive = timeRange === '1d';

  const setTimeRange = useCallback((range: TimeRange) => {
    setTimeRangeState(range);
    // Clear error when changing range
    setError(null);
  }, []);

  const fetchHistory = useCallback(async (symbol: string) => {
    try {
      setHistoricalData((prev) => ({
        ...prev,
        [symbol]: {
          ...prev[symbol],
          [timeRange]: {
            candles: prev[symbol]?.[timeRange]?.candles || [],
            loading: true,
            error: null,
            lastUpdated: Date.now(),
          },
        },
      }));

      const data = await stockService.getHistory(symbol, timeRange);

      setHistoricalData((prev) => ({
        ...prev,
        [symbol]: {
          ...prev[symbol],
          [timeRange]: {
            candles: data.candles,
            loading: false,
            error: null,
            lastUpdated: Date.now(),
          },
        },
      }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch history';
      setHistoricalData((prev) => ({
        ...prev,
        [symbol]: {
          ...prev[symbol],
          [timeRange]: {
            candles: prev[symbol]?.[timeRange]?.candles || [],
            loading: false,
            error: errorMessage,
            lastUpdated: Date.now(),
          },
        },
      }));
    }
  }, [timeRange]);

  const fetchAllHistory = useCallback(async (symbolsToFetch: string[]) => {
    setSymbols(symbolsToFetch);
    setIsLoading(true);
    setError(null);

    try {
      const promises = symbolsToFetch.map((symbol) => fetchHistory(symbol));
      await Promise.allSettled(promises);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch historical data');
    } finally {
      setIsLoading(false);
    }
  }, [fetchHistory]);

  // Smart auto-refresh based on market hours
  useEffect(() => {
    if (timeRange === '1d' && symbols.length > 0) {
      let interval: NodeJS.Timeout | null = null;

      const setupRefresh = () => {
        // Check if US market is open (9:30 AM - 4:00 PM ET, Mon-Fri)
        const isMarketOpen = checkMarketOpen('NASDAQ');

        if (isMarketOpen) {
          // Market open: refresh every 60s to match background collector
          console.log('[TimeRange] Market open - refreshing every 60s');
          interval = setInterval(() => {
            fetchAllHistory(symbols);
          }, 60000);
        } else {
          // Market closed: refresh every 5 minutes (for stale data detection)
          // Continuous aggregates update hourly, so this catches new data
          console.log('[TimeRange] Market closed - refreshing every 5min');
          interval = setInterval(() => {
            fetchAllHistory(symbols);
          }, 5 * 60 * 1000);
        }
      };

      // Initial setup
      setupRefresh();

      // Re-check market status every minute (handles market open/close transitions)
      const marketCheckInterval = setInterval(() => {
        if (interval) {
          clearInterval(interval);
        }
        setupRefresh();
      }, 60000);

      return () => {
        if (interval) { clearInterval(interval); }
        clearInterval(marketCheckInterval);
      };
    }
  }, [timeRange, symbols, fetchAllHistory]);

  // Auto-refresh when window regains focus (after dev break, tab switch, etc.)
  useEffect(() => {
    if (timeRange === '1d' && symbols.length > 0) {
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          // Check if data is stale (older than 5 minutes)
          const now = Date.now();
          const staleThreshold = 5 * 60 * 1000; // 5 minutes

          const hasStaleData = symbols.some((symbol) => {
            const lastUpdated = historicalData[symbol]?.[timeRange]?.lastUpdated;
            return !lastUpdated || (now - lastUpdated) > staleThreshold;
          });

          if (hasStaleData) {
            console.log('[TimeRange] Window visible with stale data, refreshing...');
            fetchAllHistory(symbols);
          }
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => { document.removeEventListener('visibilitychange', handleVisibilityChange); };
    }
  }, [timeRange, symbols, fetchAllHistory, historicalData]);

  const getSymbolData = useCallback((symbol: string): SymbolHistoryState | undefined => {
    return historicalData[symbol]?.[timeRange];
  }, [historicalData, timeRange]);

  const refreshData = useCallback(async () => {
    const symbols = Object.keys(historicalData);
    if (symbols.length > 0) {
      await fetchAllHistory(symbols);
    }
  }, [fetchAllHistory, historicalData]);

  return (
    <TimeRangeContext.Provider
      value={{
        timeRange,
        setTimeRange,
        historicalData,
        fetchHistory,
        fetchAllHistory,
        getSymbolData,
        isLoading,
        error,
        refreshData,
        isLive,
      }}
    >
      {children}
    </TimeRangeContext.Provider>
  );
}

export function useTimeRange() {
  const context = useContext(TimeRangeContext);
  if (context === undefined) {
    throw new Error('useTimeRange must be used within a TimeRangeProvider');
  }
  return context;
}
