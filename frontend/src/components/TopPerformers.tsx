import { Trophy, TrendingUp, TrendingDown, ChevronDown, Clock, Zap, Cpu, Code2, Rocket } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useMarketStatus } from '../contexts/MarketStatusContext';
import { useTimeRange } from '../contexts/TimeRangeContext';
import { STOCK_DISPLAY_NAMES, STOCK_CATEGORIES } from '../types';

import type { StockQuote } from '../types';

interface TopPerformersProps {
  stocks: Map<string, StockQuote>;
  variant?: 'default' | 'sidebar';
}

interface Performer {
  symbol: string;
  name: string;
  changePercent: number;
  change: number;
  currentPrice: number;
  category: string;
}

function getCategoryForSymbol(symbol: string): string {
  for (const [category, symbols] of Object.entries(STOCK_CATEGORIES)) {
    if (symbols.includes(symbol)) {
      return category;
    }
  }
  return 'Other';
}

function getCategoryIcon(category: string): { icon: React.ReactNode; color: string } {
  const iconClass = 'w-3 h-3';
  switch (category) {
    case 'AI Chips': return { icon: <Zap className={iconClass} />, color: 'text-neon-purple' };
    case 'Semiconductors': return { icon: <Cpu className={iconClass} />, color: 'text-neon-blue' };
    case 'AI Software': return { icon: <Code2 className={iconClass} />, color: 'text-neon-green' };
    case 'Tech Giants': return { icon: <Rocket className={iconClass} />, color: 'text-orange-400' };
    default: return { icon: null, color: 'text-gray-500' };
  }
}

export function TopPerformers({ stocks, variant = 'default' }: TopPerformersProps) {
  const isSidebar = variant === 'sidebar';
  const { isMarketOpen: marketIsOpen } = useMarketStatus();
  const {
    timeRange,
    setTimeRange,
    historicalData,
    isLoading,
  } = useTimeRange();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const performers = useMemo<Performer[]>(() => {
    const results: Performer[] = [];

    stocks.forEach((quote, symbol) => {
      const { changePercent: currentChangePercent, change: currentChange, currentPrice: currentCurrentPrice } = quote;
      let changePercent: number;
      let change: number;
      let currentPrice: number;

      if (timeRange === '1d') {
        // Use current quote data for today's performance
        changePercent = currentChangePercent;
        change = currentChange;
        currentPrice = currentCurrentPrice;
      } else {
        // Use historical data for 7d/30d performance
        const data = historicalData[symbol]?.[timeRange]?.candles;
        if (data && data.length >= 2) {
          const firstCandle = data[0];
          const lastCandle = data[data.length - 1];
          change = lastCandle.c - firstCandle.o;
          changePercent = (change / firstCandle.o) * 100;
          currentPrice = lastCandle.c;
        } else {
          // Fallback to current quote if no historical data
          changePercent = currentChangePercent;
          change = currentChange;
          currentPrice = currentCurrentPrice;
        }
      }

      results.push({
        symbol,
        name: STOCK_DISPLAY_NAMES[symbol] || symbol,
        changePercent,
        change,
        currentPrice,
        category: getCategoryForSymbol(symbol),
      });
    });

    return results;
  }, [stocks, timeRange, historicalData]);

  const sorted = useMemo(() => {
    return [...performers].sort((a, b) => b.changePercent - a.changePercent);
  }, [performers]);

  const topGainers = sorted.filter((p) => p.changePercent > 0).slice(0, 3);
  const topLosers = sorted.filter((p) => p.changePercent < 0).slice(-3).reverse();

  const formatPercent = (value: number): string => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  const formatCurrency = (value: number): string => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}$${value.toFixed(2)}`;
  };

  const getPeriodLabel = (range: typeof timeRange): string => {
    switch (range) {
      case '1d': return marketIsOpen ? 'Today' : 'Previous Close';
      case '7d': return '7 Days';
      case '30d': return '30 Days';
      default: return 'Today';
    }
  };

  const periodLabel = getPeriodLabel(timeRange);

  const timeRangeOptions: { value: typeof timeRange; label: string }[] = [
    { value: '1d', label: marketIsOpen ? 'Today (Live)' : 'Previous Close' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
  ];

  const renderPerformer = (performer: Performer, rank: number, isGainer: boolean) => (
    <div
      key={performer.symbol}
      className="flex items-center gap-3 py-2 px-3 rounded-lg bg-dark-700/50 hover:bg-dark-700 transition-colors"
    >
      {/* Rank */}
      <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
        rank === 1
          ? isGainer
            ? 'bg-neon-green/20 text-neon-green'
            : 'bg-neon-red/20 text-neon-red'
          : 'bg-dark-600 text-gray-400'
      }`}>
        {rank}
      </div>

      {/* Symbol & Name */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-sm text-white">{performer.symbol}</span>
          {(() => {
            const categoryInfo = getCategoryIcon(performer.category);
            return categoryInfo.icon ? (
              <span className={categoryInfo.color}>{categoryInfo.icon}</span>
            ) : null;
          })()}
        </div>
        <span className="text-xs text-gray-400 truncate block">{performer.name}</span>
      </div>

      {/* Change */}
      <div className="text-right flex-shrink-0">
        <div className={`text-sm font-bold ${isGainer ? 'text-neon-green' : 'text-neon-red'}`}>
          {formatPercent(performer.changePercent)}
        </div>
        <div className={`text-xs ${isGainer ? 'text-neon-green/70' : 'text-neon-red/70'}`}>
          {formatCurrency(performer.change)}
        </div>
      </div>
    </div>
  );

  if (isLoading && performers.length === 0) {
    const loader = (
      <div className="flex items-center justify-center py-4">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-neon-blue"></div>
        <span className="ml-2 text-xs text-gray-400">Loading performance data...</span>
      </div>
    );

    if (isSidebar) {
      return (
        <div className="bg-dark-800 rounded-xl border border-dark-600 p-4">
          {loader}
        </div>
      );
    }

    return (
      <div className="bg-dark-800 border-b border-dark-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          {loader}
        </div>
      </div>
    );
  }

  const hasGainers = topGainers.length > 0;
  const hasLosers = topLosers.length > 0;

  if (!hasGainers && !hasLosers) {
    return null;
  }

  const header = (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Trophy className="w-4 h-4 text-yellow-400" />
        <h3 className="text-sm font-medium text-gray-400">Top Performers</h3>
      </div>

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
  );

  const gainersSection = hasGainers && (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <TrendingUp className="w-3.5 h-3.5 text-neon-green" />
        <span className="text-xs font-medium text-neon-green">Top Gainers</span>
      </div>
      <div className="space-y-1.5">
        {topGainers.map((performer, index) =>
          renderPerformer(performer, index + 1, true),
        )}
      </div>
    </div>
  );

  const losersSection = hasLosers && (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <TrendingDown className="w-3.5 h-3.5 text-neon-red" />
        <span className="text-xs font-medium text-neon-red">Top Losers</span>
      </div>
      <div className="space-y-1.5">
        {topLosers.map((performer, index) =>
          renderPerformer(performer, index + 1, false),
        )}
      </div>
    </div>
  );

  if (isSidebar) {
    return (
      <div className="bg-dark-800 rounded-xl border border-dark-600 p-4">
        {header}
        <div className="space-y-4">
          {gainersSection}
          {losersSection}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-dark-800 border-b border-dark-600">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {header}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {gainersSection}
          {losersSection}
        </div>
      </div>
    </div>
  );
}
