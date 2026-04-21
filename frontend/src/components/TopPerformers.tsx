import { Trophy, TrendingUp, TrendingDown } from 'lucide-react';
import { useMemo } from 'react';

import { useTimeRange } from '../contexts/TimeRangeContext';
import { STOCK_DISPLAY_NAMES, STOCK_CATEGORIES } from '../types';

import type { StockQuote } from '../types';

interface TopPerformersProps {
  stocks: Map<string, StockQuote>;
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

function getCategoryColor(category: string): string {
  switch (category) {
    case 'AI Chips': return 'bg-neon-purple/20 text-neon-purple border-neon-purple/30';
    case 'Semiconductors': return 'bg-neon-blue/20 text-neon-blue border-neon-blue/30';
    case 'AI Software': return 'bg-neon-green/20 text-neon-green border-neon-green/30';
    case 'Tech Giants': return 'bg-orange-400/20 text-orange-400 border-orange-400/30';
    default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  }
}

function getPeriodLabel(timeRange: string): string {
  switch (timeRange) {
    case '1d': return 'Today';
    case '7d': return '7 Days';
    case '30d': return '30 Days';
    default: return 'Today';
  }
}

export function TopPerformers({ stocks }: TopPerformersProps) {
  const { timeRange, historicalData, isLoading } = useTimeRange();

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
          const [firstCandle] = data;
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

  const periodLabel = getPeriodLabel(timeRange);

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
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm text-white">{performer.symbol}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getCategoryColor(performer.category)}`}>
            {performer.category}
          </span>
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
    return (
      <div className="bg-dark-800 border-b border-dark-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-neon-blue"></div>
            <span className="ml-2 text-xs text-gray-400">Loading performance data...</span>
          </div>
        </div>
      </div>
    );
  }

  const hasGainers = topGainers.length > 0;
  const hasLosers = topLosers.length > 0;

  if (!hasGainers && !hasLosers) {
    return null;
  }

  return (
    <div className="bg-dark-800 border-b border-dark-600">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="w-4 h-4 text-yellow-400" />
          <h3 className="text-sm font-medium text-gray-400">Top Performers</h3>
          <span className="text-xs text-gray-500 ml-auto">{periodLabel}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Top Gainers */}
          {hasGainers && (
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
          )}

          {/* Top Losers */}
          {hasLosers && (
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
          )}
        </div>
      </div>
    </div>
  );
}
