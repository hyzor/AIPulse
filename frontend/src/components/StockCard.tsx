import { TrendingUp, TrendingDown, Activity, Cpu, Code2, Rocket, Zap } from 'lucide-react';

import { STOCK_DISPLAY_NAMES, STOCK_CATEGORIES, STOCK_COUNTRIES } from '../types';
import { FlagIcon } from './FlagIcon';
import { LoadingSkeleton } from './LoadingSkeleton';
import { MiniAreaChart } from './MiniAreaChart';
import { SymbolStatusIndicator, getSymbolStatusType } from './SymbolStatus';
import { useTimeRange } from '../contexts/TimeRangeContext';
import { formatCurrency, formatChange, getChangeColor, getChangeBgColor, getChangeLabel, checkMarketOpen, getExchangeForSymbol, formatRelativeTime, getFreshnessColor } from '../utils/format';

import type { StockQuote } from '../types';

interface StockCardProps {
  quote: StockQuote;
  isRealtime?: boolean;
  onClick?: () => void;
}

export function StockCard({ quote, isRealtime = false, onClick }: StockCardProps) {
  const displayName = STOCK_DISPLAY_NAMES[quote.symbol] || quote.symbol;
  const { getSymbolData } = useTimeRange();

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

  // Check market status and data freshness
  const exchange = getExchangeForSymbol(quote.symbol);
  const isMarketOpen = checkMarketOpen(exchange);

  // Calculate data freshness - use the most recent valid timestamp across all sources
  // Filter out invalid timestamps (0, undefined, NaN)
  const validTimestamps = [
    quoteTimestampMs,
    chartTimestampMs,
  ].filter((ts): ts is number => ts > 0 && !Number.isNaN(ts));

  // Only calculate freshness if we have valid timestamps
  const hasValidTimestamp = validTimestamps.length > 0;
  const freshnessTimestamp = hasValidTimestamp ? Math.max(...validTimestamps) : null;

  // Only show freshness warnings when market is open - otherwise show neutral info
  // When market is closed/pre-market, stale data is expected, not a problem
  const freshnessText = freshnessTimestamp ? formatRelativeTime(freshnessTimestamp) : null;
  const freshnessColor = isMarketOpen && freshnessTimestamp
    ? getFreshnessColor(freshnessTimestamp) // Color-coded freshness during market hours
    : 'text-gray-500'; // Neutral gray when market is closed (no expectation of updates)

  // Get status type for conditional styling (ring around card when live)
  const statusType = getSymbolStatusType(quote, candles, isRealtime);
  const isLiveWs = statusType === 'live-ws';

  return (
    <div
      onClick={onClick}
      className={`
        relative bg-dark-700 border border-dark-600 rounded-xl p-5
        transition-all duration-300 hover:border-neon-blue/50 hover:shadow-lg hover:shadow-neon-blue/10
        group cursor-pointer
        ${isLiveWs ? 'ring-2 ring-neon-blue/30' : ''}
      `}
    >
      {/* Top-right status indicator */}
      <div className="absolute top-3 right-3 z-10">
        <SymbolStatusIndicator
          quote={quote}
          candles={candles}
          isRealtime={isRealtime}
          showLabel={true}
          size="md"
        />
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
        {/* Data freshness indicator - only relevant when market is open */}
        {freshnessText && freshnessTimestamp && (
          <p
            className={`text-xs font-medium mt-1 ${freshnessColor}`}
            title={isMarketOpen
              ? `Last update: ${new Date(freshnessTimestamp).toLocaleTimeString()}`
              : `Market closed - Last update from previous session: ${new Date(freshnessTimestamp).toLocaleTimeString()}`}
          >
            {isMarketOpen ? 'Updated ' : 'Last session '}
            {freshnessText}
          </p>
        )}
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
