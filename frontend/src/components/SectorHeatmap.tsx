import { Flame, ChevronDown, Clock } from 'lucide-react';
import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';

import { Tooltip } from './Tooltip';
import { useMarketStatus } from '../contexts/MarketStatusContext';
import { useTimeRange } from '../contexts/TimeRangeContext';
import { STOCK_CATEGORIES, STOCK_DISPLAY_NAMES, TRACKED_STOCKS } from '../types';

import type { StockQuote, TimeRange, CandleData } from '../types';

interface SectorHeatmapProps {
  stocks: Map<string, StockQuote>;
  onStockClick?: (_symbol: string) => void;
}

interface StockPerformance {
  symbol: string;
  changePercent: number;
  change: number;
  currentPrice: number;
  displayName: string;
}

// ─── Color System ───

function getHeatmapColor(percent: number): string {
  // Extreme positive — vivid, bright green
  if (percent >= 10) { return 'bg-emerald-400'; }
  if (percent >= 7) { return 'bg-emerald-500'; }
  if (percent >= 5) { return 'bg-emerald-600/90'; }
  if (percent >= 3) { return 'bg-emerald-500/70'; }
  if (percent >= 1.5) { return 'bg-emerald-500/50'; }
  if (percent >= 0.5) { return 'bg-emerald-400/35'; }
  if (percent >= 0) { return 'bg-emerald-300/30'; }

  // Extreme negative — vivid, bright red
  if (percent >= -0.5) { return 'bg-red-300/30'; }
  if (percent >= -1.5) { return 'bg-red-400/35'; }
  if (percent >= -3) { return 'bg-red-500/50'; }
  if (percent >= -5) { return 'bg-red-500/70'; }
  if (percent >= -7) { return 'bg-red-600/90'; }
  if (percent >= -10) { return 'bg-red-500'; }
  return 'bg-red-400';
}

function getTextColor(percent: number): string {
  return Math.abs(percent) >= 0.5 ? 'text-white' : 'text-gray-900';
}

// ─── Category Lookup ───

const CATEGORY_BAR_COLORS: Record<string, string> = {
  'AI Chips': 'bg-neon-purple',
  'Semiconductors': 'bg-neon-blue',
  'AI Software': 'bg-neon-green',
  'Tech Giants': 'bg-orange-400',
};

const symbolToCategory = new Map<string, string>();
Object.entries(STOCK_CATEGORIES).forEach(([category, symbols]) => {
  symbols.forEach((symbol) => {
    symbolToCategory.set(symbol, category);
  });
});

// ─── Helpers ───

function calculateHistoricalChange(candles: CandleData[]): { change: number; changePercent: number; currentPrice: number } | null {
  if (!candles || candles.length < 2) { return null; }
  const first = candles[0];
  const last = candles[candles.length - 1];
  const change = last.c - first.o;
  const changePercent = first.o !== 0 ? (change / first.o) * 100 : 0;
  const currentPrice = changePercent !== 0
    ? Math.abs(change / (changePercent / 100))
    : first.o;
  return { change, changePercent, currentPrice };
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

  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });

  const dayName = dayFormatter.format(now);
  const dayMap: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
  };
  const dayOfWeek = dayMap[dayName] || 0;

  const timeParts = timeFormatter.formatToParts(now);
  const hour = parseInt(timeParts.find((p) => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(timeParts.find((p) => p.type === 'minute')?.value || '0', 10);
  const timeDecimal = hour + minute / 60;
  const marketOpenDecimal = 9.5; // 9:30 AM

  let daysToSubtract = 0;
  if (dayOfWeek === 7) { // Sunday
    daysToSubtract = 2;
  } else if (dayOfWeek === 6) { // Saturday
    daysToSubtract = 1;
  } else if (dayOfWeek === 1) { // Monday before open
    if (timeDecimal < marketOpenDecimal) {
      daysToSubtract = 3;
    }
  } else if (timeDecimal < marketOpenDecimal) {
    daysToSubtract = 1;
  }

  const lastTradingDate = new Date(now);
  lastTradingDate.setDate(lastTradingDate.getDate() - daysToSubtract);

  return etDateFormatter.format(lastTradingDate);
}

function getPeriodLabel(timeRange: TimeRange, marketIsOpen: boolean): string {
  switch (timeRange) {
    case '1d':
      return marketIsOpen ? 'Today (Live)' : getLastTradingDate();
    case '7d':
      return 'Last 7 Days';
    case '30d':
      return 'Last 30 Days';
    default:
      return 'Today';
  }
}

// ─── StockCell (memoized) ───

interface StockCellProps {
  stock: StockPerformance;
  categoryBarColor?: string;
  onClick?: (_symbol: string) => void;
  isFlashing?: boolean;
}

const StockCell = React.memo(function StockCell({ stock, categoryBarColor, onClick, isFlashing }: StockCellProps) {
  const bgClass = getHeatmapColor(stock.changePercent);
  const textClass = getTextColor(stock.changePercent);
  const sign = stock.changePercent >= 0 ? '+' : '';

  return (
    <Tooltip
      content={
        <div className="space-y-1">
          <div className="font-medium text-white">{stock.displayName}</div>
          <div className="text-gray-400">
            {sign}{stock.changePercent.toFixed(2)}% ({sign}${stock.change.toFixed(2)})
          </div>
          <div className="text-gray-500">${stock.currentPrice.toFixed(2)}</div>
        </div>
      }
      position="top"
      delay={200}
    >
      <button
        onClick={() => onClick?.(stock.symbol)}
        className={`
          ${bgClass} ${textClass}
          relative rounded-lg overflow-hidden
          flex flex-col items-center justify-center
          hover:scale-[1.03] hover:shadow-lg
          transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-white/50
          cursor-pointer
          min-h-[72px] md:min-h-[88px]
          w-full
          ${isFlashing ? 'ring-2 ring-white/60' : ''}
        `}
      >
        {categoryBarColor && (
          <div className={`absolute top-0 left-0 right-0 h-[3px] ${categoryBarColor}`} />
        )}
        <span className="font-bold text-xs md:text-sm mt-1">{stock.symbol}</span>
        <span className="text-sm md:text-base font-bold leading-tight">
          {sign}{stock.changePercent.toFixed(2)}%
        </span>
        <span className="text-[10px] md:text-xs opacity-80 leading-tight">
          ${stock.currentPrice.toFixed(2)}
        </span>
      </button>
    </Tooltip>
  );
});

// ─── Main Component ───

export function SectorHeatmap({ stocks, onStockClick }: SectorHeatmapProps): React.ReactElement {
  const {
    timeRange: globalTimeRange,
    setTimeRange: setGlobalTimeRange,
    historicalData,
    isLoading,
  } = useTimeRange();
  const { isMarketOpen } = useMarketStatus();

  const [localTimeRange, setLocalTimeRange] = useState<TimeRange>(globalTimeRange);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [flashingSymbols, setFlashingSymbols] = useState<Set<string>>(new Set());
  const flashTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setLocalTimeRange(globalTimeRange);
  }, [globalTimeRange]);

  const prevStocksRef = useRef<Map<string, StockQuote>>(new Map());
  useEffect(() => {
    const newFlashes = new Set<string>();
    stocks.forEach((quote, symbol) => {
      const prev = prevStocksRef.current.get(symbol);
      if (prev && prev.currentPrice !== quote.currentPrice) {
        newFlashes.add(symbol);
      }
    });

    if (newFlashes.size > 0) {
      setFlashingSymbols(newFlashes);
      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current);
      }
      flashTimeoutRef.current = setTimeout(() => {
        setFlashingSymbols(new Set());
      }, 600);
    }

    prevStocksRef.current = new Map(stocks);
  }, [stocks]);

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current);
      }
    };
  }, []);

  const setTimeRange = useCallback((range: TimeRange) => {
    setLocalTimeRange(range);
    setGlobalTimeRange(range);
    setIsDropdownOpen(false);
  }, [setGlobalTimeRange]);

  const stockList = useMemo((): StockPerformance[] => {
    const data: StockPerformance[] = [];

    TRACKED_STOCKS.forEach((symbol) => {
      let perf: StockPerformance | null = null;

      if (localTimeRange === '1d') {
        const quote = stocks.get(symbol);
        if (quote) {
          perf = {
            symbol,
            changePercent: quote.changePercent,
            change: quote.change,
            currentPrice: quote.currentPrice,
            displayName: STOCK_DISPLAY_NAMES[symbol] || symbol,
          };
        }
      } else {
        const candles = historicalData[symbol]?.[localTimeRange]?.candles;
        if (candles) {
          const hist = calculateHistoricalChange(candles);
          if (hist) {
            perf = {
              symbol,
              changePercent: hist.changePercent,
              change: hist.change,
              currentPrice: hist.currentPrice,
              displayName: STOCK_DISPLAY_NAMES[symbol] || symbol,
            };
          }
        }
      }

      if (perf) {
        data.push(perf);
      }
    });

    // Sort alphabetically by symbol
    return data.sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [stocks, localTimeRange, historicalData]);

  const periodLabel = getPeriodLabel(localTimeRange, isMarketOpen);

  const timeRangeOptions: { value: TimeRange; label: string }[] = [
    { value: '1d', label: isMarketOpen ? 'Today (Live)' : 'Previous Close' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
  ];

  return (
    <div className="bg-dark-800 rounded-xl border border-dark-600 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-4 md:p-5 border-b border-dark-600">
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-orange-400" />
          <h2 className="text-lg font-bold text-white">Sector Heatmap</h2>
        </div>

        {/* Time Range Dropdown */}
        <div className="relative">
          <button
            onClick={() => { setIsDropdownOpen(!isDropdownOpen); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 hover:bg-dark-600 rounded-md border border-dark-600 text-xs text-gray-300 transition-colors whitespace-nowrap"
          >
            {localTimeRange === '1d' && isMarketOpen && (
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-neon-green"></span>
              </span>
            )}
            {localTimeRange === '1d' && !isMarketOpen && <Clock className="w-3 h-3 text-gray-400" />}
            <span>{periodLabel}</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {isDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => { setIsDropdownOpen(false); }}
              />
              <div className="absolute right-0 mt-1 w-44 bg-dark-700 border border-dark-600 rounded-lg shadow-lg z-50 py-1">
                {timeRangeOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => { setTimeRange(option.value); }}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-dark-600 transition-colors ${
                      localTimeRange === option.value ? 'text-neon-blue bg-neon-blue/10' : 'text-gray-300'
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

      {/* Loading State */}
      {isLoading && stockList.length === 0 && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-neon-blue"></div>
          <span className="ml-2 text-sm text-gray-400">Loading heatmap data...</span>
        </div>
      )}

      {/* Stock Grid — alphabetically sorted, no category divisions */}
      <div className="p-4 md:p-5">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 md:gap-3">
          {stockList.map((stock) => {
            const category = symbolToCategory.get(stock.symbol);
            const barColor = category ? CATEGORY_BAR_COLORS[category] : undefined;
            return (
              <StockCell
                key={stock.symbol}
                stock={stock}
                categoryBarColor={barColor}
                onClick={onStockClick}
                isFlashing={flashingSymbols.has(stock.symbol)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
