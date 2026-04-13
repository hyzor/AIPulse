import { TrendingUp, TrendingDown, Activity, Database, Cpu, Code2, Rocket, Zap } from 'lucide-react';

import { STOCK_DISPLAY_NAMES, STOCK_CATEGORIES, STOCK_COUNTRIES } from '../types';
import { LoadingSkeleton } from './LoadingSkeleton';
import { MiniAreaChart } from './MiniAreaChart';
import { useTimeRange } from '../contexts/TimeRangeContext';
import { formatCurrency, formatChange, getChangeColor, getChangeBgColor, getChangeLabel, checkMarketOpen, getExchangeForSymbol, isSameTradingDay } from '../utils/format';

import type { StockQuote } from '../types';

interface StockCardProps {
  quote: StockQuote;
  isRealtime?: boolean;
  onClick?: () => void;
}

export function StockCard({ quote, isRealtime = false, onClick }: StockCardProps) {
  const isPositive = quote.change >= 0;
  const displayName = STOCK_DISPLAY_NAMES[quote.symbol] || quote.symbol;
  const { getSymbolData, timeRange } = useTimeRange();

  const historicalData = getSymbolData(quote.symbol);
  const isLoading = historicalData?.loading ?? true;
  const hasError = !!historicalData?.error;

  // Find category for this stock
  const category = Object.entries(STOCK_CATEGORIES).find(([_, symbols]) =>
    symbols.includes(quote.symbol),
  )?.[0] || 'Other';

  // Category icon mapping
  const categoryIcons: Record<string, React.ReactNode> = {
    'AI Chips': <Zap className="w-3 h-3 text-neon-purple" />,
    'Semiconductors': <Cpu className="w-3 h-3 text-neon-blue" />,
    'AI Software': <Code2 className="w-3 h-3 text-neon-green" />,
    'Tech Giants': <Rocket className="w-3 h-3 text-orange-400" />,
  };

  // Check if market is currently open AND the quote is from today
  const exchange = getExchangeForSymbol(quote.symbol);
  const isMarketOpen = checkMarketOpen(exchange);
  const isFromToday = isSameTradingDay(exchange, quote.timestamp);

  // "LIVE" only when market is open, quote is from today, AND we have realtime data
  const showLiveIndicator = isMarketOpen && isFromToday && isRealtime;
  // "UPDATED" when WebSocket delivers data but market is closed (avoids misleading "LIVE" when not trading)
  const showUpdatedIndicator = !isMarketOpen && isFromToday && isRealtime;
  // 1D realtime indicator only when market is open
  const show1DLiveIndicator = isMarketOpen && isFromToday && timeRange === '1d' && !isRealtime;

  return (
    <div
      onClick={onClick}
      className={`
        relative bg-dark-700 border border-dark-600 rounded-xl p-5
        transition-all duration-300 hover:border-neon-blue/50 hover:shadow-lg hover:shadow-neon-blue/10
        group cursor-pointer
        ${showLiveIndicator ? 'ring-2 ring-neon-blue/30' : ''}
      `}
    >
      {/* Top-right indicators */}
      <div className="absolute top-3 right-3 flex items-center gap-2">
        {/* LIVE indicator - only when market is actually open and trading */}
        {showLiveIndicator && (
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-neon-green"></span>
            </span>
            <span className="text-xs text-neon-green font-mono">LIVE</span>
          </div>
        )}

        {/* UPDATED indicator - WebSocket connected but market closed (avoids misleading LIVE) */}
        {showUpdatedIndicator && (
          <div className="flex items-center gap-1.5" title="Real-time data (market closed)">
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400"></span>
            </span>
            <span className="text-xs font-medium text-blue-400">UPDATED</span>
          </div>
        )}

        {/* LIVE indicator for 1D view - only show when market is open */}
        {show1DLiveIndicator && (
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <span className="text-xs font-semibold text-green-500">LIVE</span>
          </div>
        )}

        {/* Cached data indicator */}
        {quote.isCached && (
          <div className="flex items-center gap-1.5" title="Data from cache (rate limit reached)">
            <Database className="w-3 h-3 text-yellow-500" />
            <span className="text-xs font-semibold text-yellow-500">CACHED</span>
          </div>
        )}
      </div>

      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flag-emoji" title={STOCK_COUNTRIES[quote.symbol]?.country || ''}>
              {STOCK_COUNTRIES[quote.symbol]?.flag || '🌐'}
            </span>
            <h3 className="text-xl font-bold text-white tracking-tight">{quote.symbol}</h3>
          </div>
          <p className="text-sm text-gray-400 ml-7">{displayName}</p>
        </div>
        <div className={`flex items-center gap-1 px-3 py-1.5 rounded-lg ${getChangeBgColor(quote.change)}`}>
          {isPositive
            ? (
              <TrendingUp className="w-4 h-4 text-neon-green" />
            )
            : (
              <TrendingDown className="w-4 h-4 text-neon-red" />
            )}
          <span className={`text-sm font-bold ${getChangeColor(quote.change)}`}>
            {formatChange(quote.changePercent)}
          </span>
        </div>
      </div>

      <div className="mb-3">
        <p className="text-2xl font-bold text-white font-mono">
          {formatCurrency(quote.currentPrice)}
        </p>
        <p className={`text-sm font-medium ${getChangeColor(quote.change)}`}>
          {quote.change >= 0 ? '+' : ''}
          {formatCurrency(quote.change)}
          {' '}
          {getChangeLabel(quote.symbol, quote.timestamp)}
        </p>
      </div>

      {/* Chart Area */}
      <div className="mb-3 h-20">
        {isLoading
          ? (
            <LoadingSkeleton width={280} height={80} />
          )
          : hasError
            ? (
              <div className="h-full flex items-center justify-center bg-dark-800/50 rounded">
                <span className="text-gray-500 text-xs">Chart unavailable</span>
              </div>
            )
            : (
              <MiniAreaChart
                data={historicalData?.candles || []}
                symbol={quote.symbol}
                width={280}
                height={80}
              />
            )}
      </div>

      <div className="pt-3 border-t border-dark-600">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 px-2 py-1 rounded bg-dark-800 flex items-center gap-1.5">
              {categoryIcons[category]}
              {category}
            </span>
            <span className="text-xs text-gray-600">
              {exchange}
            </span>
          </div>
          <Activity className="w-4 h-4 text-gray-600 group-hover:text-neon-blue transition-colors" />
        </div>
      </div>
    </div>
  );
}
