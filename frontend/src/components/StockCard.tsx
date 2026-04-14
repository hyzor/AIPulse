import { TrendingUp, TrendingDown, Activity, Database, Cpu, Code2, Rocket, Zap } from 'lucide-react';

import { STOCK_DISPLAY_NAMES, STOCK_CATEGORIES, STOCK_COUNTRIES } from '../types';
import { FlagIcon } from './FlagIcon';
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
  const displayName = STOCK_DISPLAY_NAMES[quote.symbol] || quote.symbol;
  const { getSymbolData, timeRange } = useTimeRange();

  const historicalData = getSymbolData(quote.symbol);
  const isLoading = historicalData?.loading ?? true;
  const hasError = !!historicalData?.error;

  // Use the most recent price: either from WebSocket quote or chart's latest candle
  // This prevents the main price from lagging behind the chart
  const candles = historicalData?.candles || [];
  const latestCandle = candles.length > 0 ? candles[candles.length - 1] : null;
  const chartPrice = latestCandle?.c ?? null;
  const chartTimestamp = latestCandle?.t ?? null;

  // Determine which price is more recent (chart or WebSocket)
  // Convert quote.timestamp (seconds) to ms for comparison
  const quoteTimestampMs = quote.timestamp * 1000;
  const chartTimestampMs = chartTimestamp ?? 0;

  // Use chart price if it's newer than WebSocket quote
  const displayPrice = (chartTimestampMs > quoteTimestampMs && chartPrice !== null)
    ? chartPrice
    : quote.currentPrice;

  // Calculate change based on display price vs previous close
  const displayChange = displayPrice - quote.previousClose;
  const displayChangePercent = (displayChange / quote.previousClose) * 100;
  const displayIsPositive = displayChange >= 0;

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

  // "LIVE" (green with animation) - Market open, today, WebSocket realtime data
  const showLiveIndicator = isMarketOpen && isFromToday && isRealtime;
  // "LIVE" (small green) - Market open, today, 1D view with HTTP polling
  const show1DLiveIndicator = isMarketOpen && isFromToday && timeRange === '1d' && !isRealtime;
  // "CLOSED" (gray) - Market is closed (consistent, no flickering)
  const showClosedIndicator = !isMarketOpen && isFromToday;

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
      {/* Top-right indicators - z-10 ensures they appear above the chart */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
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

        {/* Rate limit - cached data indicator */}
        {quote.isCached && (
          <div className="flex items-center gap-1.5" title="Rate limit reached - serving cached data">
            <Database className="w-3 h-3 text-yellow-500" />
            <span className="text-xs font-semibold text-yellow-500">CACHED</span>
          </div>
        )}

        {/* Market closed indicator - shows when market is closed (consistent, no flickering) */}
        {showClosedIndicator && (
          <div className="flex items-center gap-1.5" title="Market closed">
            <Database className="w-3 h-3 text-gray-400" />
            <span className="text-xs font-semibold text-gray-400">CLOSED</span>
          </div>
        )}
      </div>

      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <FlagIcon
              countryCode={STOCK_COUNTRIES[quote.symbol]?.countryCode || 'us'}
              size="md"
              title={STOCK_COUNTRIES[quote.symbol]?.country}
            />
            <h3 className="text-xl font-bold text-white tracking-tight">{quote.symbol}</h3>
          </div>
          <p className="text-sm text-gray-400 ml-7">{displayName}</p>
        </div>
        <div className={`flex items-center gap-1 px-3 py-1.5 rounded-lg ${getChangeBgColor(displayChange)}`}>
          {displayIsPositive
            ? (
              <TrendingUp className="w-4 h-4 text-neon-green" />
            )
            : (
              <TrendingDown className="w-4 h-4 text-neon-red" />
            )}
          <span className={`text-sm font-bold ${getChangeColor(displayChange)}`}>
            {formatChange(displayChangePercent)}
          </span>
        </div>
      </div>

      <div className="mb-3">
        <p className="text-2xl font-bold text-white font-mono">
          {formatCurrency(displayPrice)}
        </p>
        <p className={`text-sm font-medium ${getChangeColor(displayChange)}`}>
          {displayChange >= 0 ? '+' : ''}
          {formatCurrency(displayChange)}
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
