import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

import { stockService } from '../services/stockService';
import { TRACKED_STOCKS } from '../types';
import { useMarketStatus } from './MarketStatusContext';

import type { TimeRange, HistoricalDataCache, SymbolHistoryState } from '../types';

interface DataAvailabilityInfo {
  availableTradingDays: number;
  hasEnoughDataFor7D: boolean;
  hasEnoughDataFor30D: boolean;
  warning: string | null;
}

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
  dataAvailability: DataAvailabilityInfo;
}

const TimeRangeContext = createContext<TimeRangeContextType | undefined>(undefined);

interface TimeRangeProviderProps {
  children: React.ReactNode;
  historicalUpdates?: Map<string, number>; // Map of symbol -> timestamp of last update
}

export function TimeRangeProvider({ children, historicalUpdates }: TimeRangeProviderProps) {
  const { isMarketOpen } = useMarketStatus();
  const [timeRange, setTimeRangeState] = useState<TimeRange>('1d');
  const [historicalData, setHistoricalData] = useState<HistoricalDataCache>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [dataAvailability, setDataAvailability] = useState<DataAvailabilityInfo>({
    availableTradingDays: 0,
    hasEnoughDataFor7D: false,
    hasEnoughDataFor30D: false,
    warning: null,
  });

  const isLive = timeRange === '1d';

  // Fetch data stats - only gets trading days, warning is calculated on demand
  const fetchDataStats = useCallback(async () => {
    try {
      const health = await stockService.checkHealth();
      if (health && 'dataStats' in health) {
        const stats = health.dataStats as {
          total1hCandles: number;
          symbols1h: string[];
        };

        // Filter to only tracked symbols (consistent with DataCollectionStatus)
        const trackedSymbolsSet = new Set(TRACKED_STOCKS);
        const symbolsWith1h = stats.symbols1h?.filter((s) =>
          trackedSymbolsSet.has(s as typeof TRACKED_STOCKS[number]),
        ).length || 0;

        // Calculate trading days from 1h candles (consistent with DataCollectionStatus)
        const tradingDays = (stats.total1hCandles > 0 && symbolsWith1h > 0)
          ? Math.floor((stats.total1hCandles / symbolsWith1h) / 6.5)
          : 0;

        setDataAvailability((prev) => ({
          ...prev,
          availableTradingDays: tradingDays,
          hasEnoughDataFor7D: tradingDays >= 7,
          hasEnoughDataFor30D: tradingDays >= 30,
        }));
      }
    } catch (err) {
      console.error('[TimeRange] Failed to fetch data stats:', err);
    }
  }, []);

  // Initial fetch and periodic refresh of data stats
  useEffect(() => {
    fetchDataStats();
    const interval = setInterval(fetchDataStats, 30000); // Refresh every 30 seconds
    return () => { clearInterval(interval); };
  }, [fetchDataStats]);

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

      return () => {
        if (interval) { clearInterval(interval); }
      };
    }
  }, [timeRange, symbols, fetchAllHistory, isMarketOpen]);

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

  // External refresh for updated symbols (from WebSocket historical updates)
  // Process ALL symbols that have been updated, not just the last one
  const processedUpdates = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!historicalUpdates || timeRange !== '1d') { return; }

    // Find symbols that haven't been processed yet
    const symbolsToUpdate: string[] = [];
    historicalUpdates.forEach((timestamp, symbol) => {
      const key = `${symbol}-${timestamp}`;
      if (!processedUpdates.current.has(key)) {
        processedUpdates.current.add(key);
        symbolsToUpdate.push(symbol);
      }
    });

    // Clean up old entries (keep only last 50 to prevent memory leak)
    if (processedUpdates.current.size > 100) {
      const entries = Array.from(processedUpdates.current);
      processedUpdates.current = new Set(entries.slice(-50));
    }

    // Refresh all updated symbols
    if (symbolsToUpdate.length > 0) {
      console.log(`[TimeRange] Refreshing ${symbolsToUpdate.length} updated symbols: ${symbolsToUpdate.join(', ')}`);
      symbolsToUpdate.forEach((symbol) => { fetchHistory(symbol); });
    }
  }, [historicalUpdates, timeRange, fetchHistory]);

  const getSymbolData = useCallback((symbol: string): SymbolHistoryState | undefined => {
    return historicalData[symbol]?.[timeRange];
  }, [historicalData, timeRange]);

  const refreshData = useCallback(async () => {
    const symbols = Object.keys(historicalData);
    if (symbols.length > 0) {
      await fetchAllHistory(symbols);
    }
  }, [fetchAllHistory, historicalData]);

  // Calculate warning based on current timeRange and available data
  const getDataWarning = useCallback((): string | null => {
    const tradingDays = dataAvailability.availableTradingDays;

    // Show warning for 7D view when insufficient data
    if (timeRange === '7d') {
      if (tradingDays === 0) {
        return 'Need 7 trading days of history. Data collection in progress.';
      }
      if (tradingDays < 7) {
        return `Need 7 trading days of history. Currently have ${tradingDays}.`;
      }
    }

    // Show warning for 30D view when insufficient data
    if (timeRange === '30d') {
      if (tradingDays === 0) {
        return 'Need 30 trading days of history. Data collection in progress.';
      }
      if (tradingDays < 30) {
        return `Need 30 trading days of history. Currently have ${tradingDays}.`;
      }
    }

    return null;
  }, [timeRange, dataAvailability.availableTradingDays]);

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
        dataAvailability: {
          ...dataAvailability,
          warning: getDataWarning(),
        },
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
