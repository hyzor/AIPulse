import { Database } from 'lucide-react';

import { Tooltip } from './Tooltip';
import { useMarketStatus } from '../contexts/MarketStatusContext';
import {
  checkMarketOpen,
  isSameTradingDay,
  isBeforeMarketOpen,
  isAfterMarketClose,
  getExchangeForSymbol,
  isWeekend,
  isFromLastTradingDay,
} from '../utils/format';

import type { StockQuote, CandleData } from '../types';

export type { CandleData };

export type SymbolStatus =
  | 'no-data'
  | 'pre-open'
  | 'delayed'
  | 'cached'
  | 'live-ws'
  | 'live-http'
  | 'closed-complete'
  | 'closed-incomplete';

interface SymbolStatusProps {
  quote: StockQuote;
  candles?: CandleData[];
  isRealtime?: boolean;
  showLabel?: boolean;
  size?: 'sm' | 'md';
  useCustomTooltip?: boolean;
}

interface StatusConfig {
  color: string;
  bgColor: string;
  label: string;
  animate?: boolean;
  icon?: 'database';
  title: string;
}

const statusConfigs: Record<SymbolStatus, StatusConfig> = {
  'no-data': {
    color: 'text-red-500',
    bgColor: 'bg-red-500',
    label: 'NO DATA',
    title: 'No trading data available. Start the server during market hours (9:30 AM - 4:00 PM ET) to collect data.',
  },
  'pre-open': {
    color: 'text-blue-400',
    bgColor: 'bg-blue-400',
    label: 'PRE-OPEN',
    title: 'Before market open - showing yesterday\'s closing data. Market opens at 9:30 AM ET.',
  },
  'delayed': {
    color: 'text-amber-400',
    bgColor: 'bg-amber-400',
    label: 'DELAYED',
    animate: true,
    title: 'Market is open - data collection starting soon.',
  },
  'cached': {
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500',
    label: 'CACHED',
    icon: 'database',
    title: 'Rate limit reached - serving cached data',
  },
  'live-ws': {
    color: 'text-neon-green',
    bgColor: 'bg-neon-green',
    label: 'LIVE',
    animate: true,
    title: 'Real-time data via WebSocket',
  },
  'live-http': {
    color: 'text-green-400',
    bgColor: 'bg-green-400',
    label: 'LIVE',
    title: 'Live data via HTTP polling',
  },
  'closed-complete': {
    color: 'text-gray-400',
    bgColor: 'bg-gray-400',
    label: 'CLOSED',
    icon: 'database',
    title: 'Market closed - showing complete data from today\'s session',
  },
  'closed-incomplete': {
    color: 'text-orange-400',
    bgColor: 'bg-orange-400',
    label: 'INCOMPLETE',
    title: 'Market closed - incomplete data (collection stopped before 4:00 PM ET)',
  },
};

/**
 * Calculate the status of a symbol based on market conditions and data state
 */
export function calculateSymbolStatus(
  quote: StockQuote,
  candles: CandleData[] = [],
  isRealtime = false,
  isMarketOpen?: boolean,
): SymbolStatus {
  const exchange = getExchangeForSymbol(quote.symbol);
  const marketIsOpen = isMarketOpen ?? checkMarketOpen(exchange);
  const isFromToday = isSameTradingDay(exchange, quote.timestamp);
  const beforeMarketOpen = isBeforeMarketOpen(exchange);

  const hasHistoricalData = candles.length > 0;
  const lastCandle = candles.length > 0 ? candles[candles.length - 1] : null;

  // Check data completeness (market closes at 4:00 PM ET)
  // For hourly candles, the 15:00 bucket covers the final trading hour (15:00-16:00),
  // so we consider data complete if the last candle is at or after 15:00 ET.
  let hasCompleteData = false;
  if (lastCandle) {
    const lastCandleDate = new Date(lastCandle.t);
    const timeFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true,
    });
    const timeParts = timeFormatter.formatToParts(lastCandleDate);
    const hourStr = timeParts.find((p) => p.type === 'hour')?.value || '0';
    const dayPeriod = timeParts.find((p) => p.type === 'dayPeriod')?.value || 'AM';
    let lastCandleHourET = parseInt(hourStr);
    const dp = dayPeriod.toUpperCase();
    if ((dp === 'PM' || dp === 'P.M.') && lastCandleHourET !== 12) {
      lastCandleHourET += 12;
    } else if ((dp === 'AM' || dp === 'A.M.') && lastCandleHourET === 12) {
      lastCandleHourET = 0;
    }
    hasCompleteData = lastCandleHourET >= 15;
  }

  // Priority order matters - check from most specific to least specific

  // 1. No data at all
  if (!hasHistoricalData) {
    return 'no-data';
  }

  // 2. Cached takes precedence during market hours
  if (quote.isCached) {
    return 'cached';
  }

  // 3. Market is open
  if (marketIsOpen) {
    // Data not from today = delayed (collection starting)
    if (!isFromToday) {
      return 'delayed';
    }
    // From today and real-time
    if (isRealtime) {
      return 'live-ws';
    }
    // From today but HTTP polling
    return 'live-http';
  }

  // 4. Market is closed (before open or after-hours)
  // Note: We don't have actual pre-market trading data on free tier,
  // so we show "PRE-OPEN" not "PRE-MARKET" to be accurate
  if (beforeMarketOpen) {
    return 'pre-open';
  }

  // After-hours: check if data is complete
  if (isFromToday) {
    // If the market has already closed for the day (current time >= 4:00 PM ET),
    // consider today's data complete regardless of last candle hour.
    // The last hourly candle (e.g., 15:00) covers the final trading hour.
    const marketHasClosedForDay = isAfterMarketClose(exchange);
    return (marketHasClosedForDay || hasCompleteData) ? 'closed-complete' : 'closed-incomplete';
  }

  // Market is closed (weekend or after-hours) and data is from a previous day
  // Check if it's from the most recent trading day (e.g., Friday data on Saturday)
  const isWeekendNow = isWeekend('America/New_York');
  const isFromLastTradingSession = isFromLastTradingDay(quote.timestamp);

  // On weekends, data from Friday is complete if the session finished (16:00 ET)
  if (isWeekendNow && isFromLastTradingSession && hasCompleteData) {
    return 'closed-complete';
  }

  // Data is from previous day, market closed
  return 'closed-incomplete';
}

/**
 * SymbolStatusIndicator - A reusable component for displaying symbol status indicators
 *
 * Shows a colored dot (and optional label) representing the current state:
 * - NO DATA (red): No historical data available
 * - PRE-OPEN (blue): Before 9:30 AM ET, showing yesterday's data (no pre-market data on free tier)
 * - DELAYED (amber): Market open but collection starting
 * - CACHED (yellow): Rate limit hit, serving cached data
 * - LIVE (green): Real-time updates (WebSocket or HTTP)
 * - CLOSED (gray): Market closed with complete data
 * - INCOMPLETE (orange): Market closed with incomplete data
 */
export function SymbolStatusIndicator({
  quote,
  candles = [],
  isRealtime = false,
  showLabel = true,
  size = 'md',
  useCustomTooltip = false,
}: SymbolStatusProps) {
  const { isMarketOpen } = useMarketStatus();
  const status = calculateSymbolStatus(quote, candles, isRealtime, isMarketOpen);
  const config = statusConfigs[status];

  const dotSize = size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2';
  const labelSize = size === 'sm' ? 'text-[10px]' : 'text-xs';
  const iconSize = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3';

  const dotClasses = `${config.bgColor} ${dotSize}`;

  const indicator = (
    <div className="flex items-center gap-1.5" title={useCustomTooltip ? undefined : config.title}>
      {config.icon === 'database' ? (
        <Database className={`${iconSize} ${config.color}`} />
      ) : (
        <span className="relative flex">
          {config.animate && (
            <span
              className={`animate-ping absolute inline-flex rounded-full ${dotClasses} opacity-75`}
            ></span>
          )}
          <span
            className={`relative inline-flex rounded-full ${dotClasses}`}
          ></span>
        </span>
      )}
      {showLabel && (
        <span className={`${labelSize} font-semibold ${config.color} font-mono`}>
          {config.label}
        </span>
      )}
    </div>
  );

  if (useCustomTooltip) {
    return (
      <Tooltip content={config.title} position="top">
        {indicator}
      </Tooltip>
    );
  }

  return indicator;
}

/**
 * SymbolStatusBadge - A badge-style variant for lists/grids
 * Shows just the dot without label, or with compact label
 */
export function SymbolStatusBadge({
  quote,
  candles = [],
  isRealtime = false,
  showLabel = false,
  size = 'sm',
  useCustomTooltip = false,
}: SymbolStatusProps) {
  return (
    <SymbolStatusIndicator
      quote={quote}
      candles={candles}
      isRealtime={isRealtime}
      showLabel={showLabel}
      size={size}
      useCustomTooltip={useCustomTooltip}
    />
  );
}

/**
 * Get just the status type without rendering
 * Useful for conditional styling or logic
 */
export function getSymbolStatusType(
  quote: StockQuote,
  candles?: CandleData[],
  isRealtime?: boolean,
  isMarketOpen?: boolean,
): SymbolStatus {
  return calculateSymbolStatus(quote, candles, isRealtime, isMarketOpen);
}
