import { TrendingUp, TrendingDown, Zap, Cpu, Code2, Rocket, Clock, ChevronDown } from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';

import type { StockQuote, TimeRange } from '../types';
import { STOCK_CATEGORIES, TRACKED_STOCKS } from '../types';
import { useTimeRange } from '../contexts/TimeRangeContext';

interface CategoryPerformanceProps {
  stocks: Map<string, StockQuote>;
}

interface CategoryStats {
  name: string;
  icon: React.ReactNode;
  color: string;
  avgChange: number;
  avgChangePercent: number;
  stockCount: number;
  upStocks: number;
  downStocks: number;
  hasData: boolean;
  dataPoints: number;
}

interface HistoricalChange {
  symbol: string;
  change: number;
  changePercent: number;
}

// US Market hours: 9:30 AM - 4:00 PM ET
const MARKET_OPEN_HOUR = 9;
const MARKET_OPEN_MINUTE = 30;
const MARKET_CLOSE_HOUR = 16;
const MARKET_CLOSE_MINUTE = 0;

function isMarketOpen(): boolean {
  const now = new Date();

  const etOptions: Intl.DateTimeFormatOptions = {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  };

  const formatter = new Intl.DateTimeFormat('en-US', etOptions);
  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);

  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
  });
  const dayName = dayFormatter.format(now);
  const dayMap: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
  };
  const dayOfWeek = dayMap[dayName] || 0;

  const timeDecimal = hour + minute / 60;
  const openDecimal = MARKET_OPEN_HOUR + MARKET_OPEN_MINUTE / 60;
  const closeDecimal = MARKET_CLOSE_HOUR + MARKET_CLOSE_MINUTE / 60;

  return dayOfWeek >= 1 && dayOfWeek <= 5 && timeDecimal >= openDecimal && timeDecimal < closeDecimal;
}

function getLastTradingDate(): string {
  const now = new Date();

  const etDateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
  });

  const dayName = dayFormatter.format(now);
  const dayMap: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
  };
  const dayOfWeek = dayMap[dayName] || 0;

  let daysToSubtract = 0;
  if (dayOfWeek === 7) {
    daysToSubtract = 2;
  } else if (dayOfWeek === 6) {
    daysToSubtract = 1;
  } else if (dayOfWeek === 1) {
    daysToSubtract = 3;
  }

  const lastTradingDate = new Date(now);
  lastTradingDate.setDate(lastTradingDate.getDate() - daysToSubtract);

  return etDateFormatter.format(lastTradingDate);
}

function getPeriodLabel(timeRange: TimeRange, marketIsOpen: boolean): string {
  switch (timeRange) {
    case '1d':
      return marketIsOpen ? 'Today' : getLastTradingDate();
    case '7d':
      return '7 Days';
    case '30d':
      return '30 Days';
    default:
      return 'Today';
  }
}

export function CategoryPerformance({ stocks }: CategoryPerformanceProps) {
  const { timeRange, setTimeRange, fetchAllHistory, historicalData, isLoading } = useTimeRange();
  const [historicalChanges, setHistoricalChanges] = useState<Map<string, HistoricalChange>>(new Map());
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const marketIsOpen = useMemo(() => isMarketOpen(), []);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Fetch historical data when time range changes
  useEffect(() => {
    if (timeRange !== '1d' && !fetchError) {
      const symbols = [...TRACKED_STOCKS];
      fetchAllHistory(symbols)
        .then(() => {
          // Calculate changes from the newly fetched historical data
          // Note: We need to access the context data after the fetch completes
          setFetchError(null);
        })
        .catch((err) => {
          setFetchError(err instanceof Error ? err.message : 'Failed to fetch historical data');
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange, fetchAllHistory]);

  // Calculate changes when historical data updates
  useEffect(() => {
    if (timeRange !== '1d') {
      const changes = new Map<string, HistoricalChange>();
      const symbols = [...TRACKED_STOCKS];

      symbols.forEach((symbol) => {
        const data = historicalData[symbol]?.[timeRange]?.candles;
        if (data && data.length >= 2) {
          const firstCandle = data[0];
          const lastCandle = data[data.length - 1];
          const change = lastCandle.c - firstCandle.o;
          const changePercent = (change / firstCandle.o) * 100;

          changes.set(symbol, {
            symbol,
            change,
            changePercent,
          });
        }
      });

      setHistoricalChanges(changes);
    }
  }, [historicalData, timeRange]);

  // Calculate stats for each category
  const calculateCategoryStats = (categoryName: string, symbols: string[]): CategoryStats => {
    let totalChange = 0;
    let totalChangePercent = 0;
    let upStocks = 0;
    let downStocks = 0;
    let count = 0;

    symbols.forEach((symbol) => {
      let change: number | undefined;
      let changePercent: number | undefined;

      if (timeRange === '1d') {
        // Use current stock data for today
        const quote = stocks.get(symbol);
        if (quote) {
          change = quote.change;
          changePercent = quote.changePercent;
        }
      } else {
        // Use historical data for 7d/30d
        const histChange = historicalChanges.get(symbol);
        if (histChange) {
          change = histChange.change;
          changePercent = histChange.changePercent;
        }
      }

      if (change !== undefined && changePercent !== undefined) {
        totalChange += change;
        totalChangePercent += changePercent;
        count++;
        if (change >= 0) {
          upStocks++;
        } else {
          downStocks++;
        }
      }
    });

    const hasData = count > 0;
    const expectedCount = symbols.length;

    return {
      name: categoryName,
      icon: getCategoryIcon(categoryName),
      color: getCategoryColor(categoryName),
      avgChange: hasData ? totalChange / count : 0,
      avgChangePercent: hasData ? totalChangePercent / count : 0,
      stockCount: count,
      upStocks,
      downStocks,
      hasData,
      dataPoints: expectedCount,
    };
  };

  const getCategoryIcon = (category: string): React.ReactNode => {
    switch (category) {
      case 'AI Chips': return <Zap className="w-5 h-5" />;
      case 'Semiconductors': return <Cpu className="w-5 h-5" />;
      case 'AI Software': return <Code2 className="w-5 h-5" />;
      case 'Tech Giants': return <Rocket className="w-5 h-5" />;
      default: return null;
    }
  };

  const getCategoryColor = (category: string): string => {
    switch (category) {
      case 'AI Chips': return 'text-neon-purple';
      case 'Semiconductors': return 'text-neon-blue';
      case 'AI Software': return 'text-neon-green';
      case 'Tech Giants': return 'text-orange-400';
      default: return 'text-gray-400';
    }
  };

  const categoryStats = Object.entries(STOCK_CATEGORIES).map(([name, symbols]) =>
    calculateCategoryStats(name, symbols),
  );

  const formatPercent = (value: number): string => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  const formatCurrency = (value: number): string => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}$${value.toFixed(2)}`;
  };

  const periodLabel = getPeriodLabel(timeRange, marketIsOpen);

  const timeRangeOptions: { value: TimeRange; label: string }[] = [
    { value: '1d', label: 'Last Trading Day' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
  ];

  return (
    <div className="bg-dark-800 border-b border-dark-600">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-400">Category Performance</h3>

          {/* Time Range Toggle */}
          <div className="relative">
            <button
              onClick={() => { setIsDropdownOpen(!isDropdownOpen); }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-dark-700 hover:bg-dark-600 rounded-lg border border-dark-600 text-xs text-gray-300 transition-colors"
            >
              {timeRange === '1d' && marketIsOpen && (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-neon-green"></span>
                </span>
              )}
              {timeRange === '1d' && !marketIsOpen && <Clock className="w-3 h-3 text-gray-400" />}
              <span>{periodLabel}</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            {isDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => { setIsDropdownOpen(false); }}
                />
                <div className="absolute right-0 mt-1 w-40 bg-dark-700 border border-dark-600 rounded-lg shadow-lg z-50 py-1">
                  {timeRangeOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setTimeRange(option.value);
                        setIsDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-dark-600 transition-colors ${
                        timeRange === option.value ? 'text-neon-blue bg-neon-blue/10' : 'text-gray-300'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-neon-blue"></div>
            <span className="ml-2 text-xs text-gray-400">Loading historical data...</span>
          </div>
        )}

        {/* Insufficient data warning */}
        {timeRange !== '1d' && !isLoading && categoryStats.some((c) => !c.hasData) && (
          <div className="flex items-center gap-2 py-2 px-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg mb-3">
            <span className="text-xs text-yellow-400">
              ⚠️ Insufficient historical data. Showing {categoryStats.filter((c) => c.hasData).length} of {categoryStats.length} categories.
              Charts may display &quot;No data&quot; for some symbols.
            </span>
          </div>
        )}

        {fetchError && (
          <div className="flex items-center justify-center py-3 px-4 bg-neon-red/10 border border-neon-red/30 rounded-lg mb-3">
            <span className="text-xs text-neon-red">{fetchError} - Using daily data</span>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {categoryStats.map((category) => (
            <div
              key={category.name}
              className={`rounded-lg border p-3 transition-colors ${category.hasData ? 'bg-dark-700 border-dark-600 hover:border-dark-500' : 'bg-dark-800 border-dark-700'}`}
              title={category.hasData
                ? `${category.name}: Average performance across ${category.stockCount} stocks. ${category.upStocks} up, ${category.downStocks} down ${timeRange === '1d' ? (marketIsOpen ? 'today' : `on ${periodLabel}`) : `over ${periodLabel.toLowerCase()}`}.`
                : `${category.name}: No historical data available. Try switching to &quot;Last Trading Day&quot; view.`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={category.hasData ? category.color : 'text-gray-600'}>{category.icon}</span>
                <span className={`text-sm font-medium ${category.hasData ? 'text-white' : 'text-gray-500'}`}>{category.name}</span>
              </div>

              {category.hasData ? (
                <>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className={`text-lg font-bold ${category.avgChangePercent >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>
                      {formatPercent(category.avgChangePercent)}
                    </span>
                    <span className={`text-xs ${category.avgChange >= 0 ? 'text-neon-green/70' : 'text-neon-red/70'}`}>
                      {formatCurrency(category.avgChange)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      {category.avgChangePercent >= 0
                        ? <TrendingUp className="w-3 h-3 text-neon-green" />
                        : <TrendingDown className="w-3 h-3 text-neon-red" />
                      }
                      {category.upStocks}/{category.stockCount} up
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-1">
                  <span className="text-lg font-bold text-gray-600">--</span>
                  <span className="text-xs text-gray-500">No data</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
