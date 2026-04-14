import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

import { stockService } from '../services/stockService';

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

  // Auto-refresh when in 1D mode
  useEffect(() => {
    if (timeRange === '1d' && symbols.length > 0) {
      const interval = setInterval(() => {
        fetchAllHistory(symbols);
      }, 60000); // Refresh every 60 seconds

      return () => { clearInterval(interval); };
    }
  }, [timeRange, symbols, fetchAllHistory]);

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
