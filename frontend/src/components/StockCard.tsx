import { TrendingUp, TrendingDown, Activity, Database, Cpu, Code2, Rocket, Zap } from 'lucide-react';

import { STOCK_DISPLAY_NAMES, STOCK_CATEGORIES, STOCK_COUNTRIES } from '../types';
import { FlagIcon } from './FlagIcon';
import { LoadingSkeleton } from './LoadingSkeleton';
import { MiniAreaChart } from './MiniAreaChart';
import { useTimeRange } from '../contexts/TimeRangeContext';
import { formatCurrency, formatChange, getChangeColor, getChangeBgColor, getChangeLabel, checkMarketOpen, getExchangeForSymbol, isSameTradingDay, isBeforeMarketOpen } from '../utils/format';

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
  const isFromToday = isSameTradingDay(exchange, quote.timestamp);
  const beforeMarketOpen = isBeforeMarketOpen(exchange);

  // Check if we have any historical data (from any day)
  const hasHistoricalData = candles.length > 0;

  // Check data completeness - compare last candle timestamp to expected market close
  // Market closes at 4:00 PM ET = 16:00 = 16 * 60 = 960 minutes from midnight
  const lastCandleTime = candles.length > 0 ? candles[candles.length - 1].t : 0;
  const lastCandleDate = new Date(lastCandleTime);
  const lastCandleHourET = parseInt(lastCandleDate.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }));
  const hasCompleteData = lastCandleHourET >= 16; // 4:00 PM or later

  // All 7 possible states for a symbol:

  // 1. "NO DATA" (red) - No historical data at all
  const showNoDataIndicator = !hasHistoricalData;

  // 2. "PRE-MARKET" (blue) - Before 9:30 AM ET, have yesterday's data
  const showPreMarketIndicator = !isMarketOpen && beforeMarketOpen && hasHistoricalData;

  // 3. "DELAYED" (yellow) - Market open but collection hasn't started yet (first minutes of session)
  const showDelayedIndicator = isMarketOpen && !isFromToday && hasHistoricalData;

  // 4. "CACHED" (orange) - Market open, serving cached data (rate limit reached)
  // This is already handled by quote.isCached

  // 5. "LIVE" (green) - Market open, today's data, real-time WebSocket
  const showLiveIndicator = isMarketOpen && isFromToday && isRealtime;

  // 6. "LIVE HTTP" (light green) - Market open, today's data, HTTP polling
  const showLiveHttpIndicator = isMarketOpen && isFromToday && !isRealtime;

  // 7. "CLOSED COMPLETE" (gray) - Market closed, have today's complete data through 4:00 PM
  const showClosedCompleteIndicator = !isMarketOpen && isFromToday && hasCompleteData;

  // 8. "CLOSED INCOMPLETE" (yellow/amber) - Market closed but data stopped before 4:00 PM
  const showClosedIncompleteIndicator = !isMarketOpen && !beforeMarketOpen && !isFromToday && hasHistoricalData;

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
        {/* 1. NO DATA (red) - No historical data at all */}
        {showNoDataIndicator && (
          <div className="flex items-center gap-1.5" title="No trading data available. Start the server during market hours (9:30 AM - 4:00 PM ET) to collect data.">
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
            <span className="text-xs font-semibold text-red-500">NO DATA</span>
          </div>
        )}

        {/* 2. PRE-MARKET (blue) - Before 9:30 AM ET, have yesterday's data */}
        {showPreMarketIndicator && (
          <div className="flex items-center gap-1.5" title="Pre-market - showing yesterday's closing data. Market opens at 9:30 AM ET.">
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400"></span>
            </span>
            <span className="text-xs font-semibold text-blue-400">PRE-MARKET</span>
          </div>
        )}

        {/* 3. DELAYED (amber) - Market open but collection hasn't started yet */}
        {showDelayedIndicator && (
          <div className="flex items-center gap-1.5" title="Market is open - data collection starting soon.">
            <span className="relative flex h-2 w-2">
              <span className="animate-pulse relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
            </span>
            <span className="text-xs font-semibold text-amber-400">DELAYED</span>
          </div>
        )}

        {/* 4. CACHED (yellow) - Rate limit reached, serving cached data */}
        {quote.isCached && (
          <div className="flex items-center gap-1.5" title="Rate limit reached - serving cached data">
            <Database className="w-3 h-3 text-yellow-500" />
            <span className="text-xs font-semibold text-yellow-500">CACHED</span>
          </div>
        )}

        {/* 5. LIVE WebSocket (green with pulse) - Real-time data via WebSocket */}
        {showLiveIndicator && (
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-neon-green"></span>
            </span>
            <span className="text-xs text-neon-green font-mono">LIVE</span>
          </div>
        )}

        {/* 6. LIVE HTTP (light green) - Market open with HTTP polling data */}
        {showLiveHttpIndicator && (
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400"></span>
            </span>
            <span className="text-xs font-semibold text-green-400">LIVE</span>
          </div>
        )}

        {/* 7. CLOSED COMPLETE (gray) - Market closed, have complete today's data */}
        {showClosedCompleteIndicator && (
          <div className="flex items-center gap-1.5" title="Market closed - showing complete data from today's session">
            <Database className="w-3 h-3 text-gray-400" />
            <span className="text-xs font-semibold text-gray-400">CLOSED</span>
          </div>
        )}

        {/* 8. CLOSED INCOMPLETE (orange) - Market closed but data stopped early */}
        {showClosedIncompleteIndicator && (
          <div className="flex items-center gap-1.5" title="Market closed - incomplete data (collection stopped before 4:00 PM ET)">
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-400"></span>
            </span>
            <span className="text-xs font-semibold text-orange-400">INCOMPLETE</span>
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
