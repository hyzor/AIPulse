import { AlertCircle, Calendar, CheckCircle2, Clock, Gauge, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { stockService } from '../services/stockService';

import type { NextTradingDayInfo, RateLimitStatus } from '../types';

interface StatusBarProps {
  isConnected: boolean;
  apiConfigured: boolean | null;
  error: string | null;
  rateLimit?: RateLimitStatus | null;
}

// US Market hours: 9:30 - 16:00 ET (24-hour format)
const MARKET_OPEN_HOUR = 9;
const MARKET_OPEN_MINUTE = 30;
const MARKET_CLOSE_HOUR = 16;
const MARKET_CLOSE_MINUTE = 0;

/**
 * Convert ET market hours to local timezone hours
 * Returns local hours in 24-hour format
 */
function convertToLocalHour(etHour: number, etMinute: number): { hour: number; minute: number } {
  // Get today's date in ET timezone
  const now = new Date();
  const etDateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = etDateFormatter.formatToParts(now);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;

  // Create the ET time as a string with explicit ET timezone offset
  // We'll use a trial-and-error approach to find the correct UTC time
  // that corresponds to our target ET time
  const targetETTimeStr = `${year}-${month}-${day}T${etHour.toString().padStart(2, '0')}:${etMinute.toString().padStart(2, '0')}:00`;

  // Try different UTC offsets to find the one that gives us the right ET time
  // ET is either UTC-5 (EST) or UTC-4 (EDT)
  const etOffsets = [-4, -5]; // Try EDT first, then EST

  for (const offset of etOffsets) {
    const offsetStr = offset < 0 ? `-0${Math.abs(offset)}:00` : `+0${offset}:00`;
    const utcDateStr = `${targetETTimeStr}${offsetStr}`;
    const testDate = new Date(utcDateStr);

    if (isNaN(testDate.getTime())) { continue; }

    // Check if this UTC time converts back to our target ET time
    const etFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const etParts = etFormatter.formatToParts(testDate);
    const etH = parseInt(etParts.find((p) => p.type === 'hour')?.value || '0', 10);
    const etM = parseInt(etParts.find((p) => p.type === 'minute')?.value || '0', 10);

    if (etH === etHour && etM === etMinute) {
      // Found the correct UTC time - now convert to local
      const localFormatter = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
      });
      const localParts = localFormatter.formatToParts(testDate);
      const localHour = parseInt(localParts.find((p) => p.type === 'hour')?.value || '0', 10);
      const localMinute = parseInt(localParts.find((p) => p.type === 'minute')?.value || '0', 10);
      return { hour: localHour, minute: localMinute };
    }
  }

  // Fallback: assume ET is UTC-4 and calculate
  const fallbackDate = new Date(`${targetETTimeStr}-04:00`);
  const localFormatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const localParts = localFormatter.formatToParts(fallbackDate);
  const localHour = parseInt(localParts.find((p) => p.type === 'hour')?.value || '0', 10);
  const localMinute = parseInt(localParts.find((p) => p.type === 'minute')?.value || '0', 10);
  return { hour: localHour, minute: localMinute };
}

function getMarketStatus() {
  const now = new Date();

  // Get current time in ET
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

  // Get day of week
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

  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
  const isWithinHours = timeDecimal >= openDecimal && timeDecimal < closeDecimal;
  const isOpen = isWeekday && isWithinHours;

  // Calculate next open time (in user's local timezone)
  let daysUntilOpen: number;
  if (isOpen) {
    daysUntilOpen = dayOfWeek === 5 ? 3 : 1;
  } else if (isWeekday && timeDecimal < openDecimal) {
    daysUntilOpen = 0;
  } else if (isWeekday && timeDecimal >= closeDecimal) {
    daysUntilOpen = dayOfWeek === 5 ? 3 : 1;
  } else {
    daysUntilOpen = dayOfWeek === 7 ? 1 : 2;
  }

  // Create the next market open date using proper timezone conversion
  // Find the UTC time that corresponds to 9:30 AM ET on the target day
  const etDateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });

  const etParts = etDateFormatter.formatToParts(now);
  const etYear = parseInt(etParts.find((p) => p.type === 'year')?.value || '0', 10);
  const etMonth = parseInt(etParts.find((p) => p.type === 'month')?.value || '0', 10);
  const etDay = parseInt(etParts.find((p) => p.type === 'day')?.value || '0', 10);

  // Build the target ET date string and find corresponding UTC time
  const targetETDateStr = `${etYear.toString().padStart(4, '0')}-${etMonth.toString().padStart(2, '0')}-${(etDay + daysUntilOpen).toString().padStart(2, '0')}`;
  const targetETTimeStr = `${targetETDateStr}T09:30:00`;

  // Try EDT (UTC-4) first, then EST (UTC-5)
  let nextOpen: Date | null = null;
  for (const offset of [-4, -5]) {
    const offsetStr = offset < 0 ? `-${String(Math.abs(offset)).padStart(2, '0')}:00` : `+${String(offset).padStart(2, '0')}:00`;
    const testDate = new Date(`${targetETTimeStr}${offsetStr}`);

    // Verify this UTC time corresponds to 9:30 AM ET
    const verifyFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const verifyParts = verifyFormatter.formatToParts(testDate);
    const verifyHour = parseInt(verifyParts.find((p) => p.type === 'hour')?.value || '0', 10);
    const verifyMinute = parseInt(verifyParts.find((p) => p.type === 'minute')?.value || '0', 10);

    if (verifyHour === 9 && verifyMinute === 30) {
      nextOpen = testDate;
      break;
    }
  }

  // Fallback if conversion failed
  if (!nextOpen) {
    // Assume EDT (UTC-4) for now
    const targetDay = new Date();
    targetDay.setDate(targetDay.getDate() + daysUntilOpen);
    targetDay.setHours(9 + 4, 30, 0, 0); // ET 9:30 = UTC 13:30 (during EDT)
    nextOpen = targetDay;
  }

  // Convert market hours to local timezone
  const localOpen = convertToLocalHour(MARKET_OPEN_HOUR, MARKET_OPEN_MINUTE);
  const localClose = convertToLocalHour(MARKET_CLOSE_HOUR, MARKET_CLOSE_MINUTE);

  const formatTime = (h: number, m: number): string => `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

  // Format: 9:30 - 16:00 ET (15:30 - 22:00 local)
  const hours = `${formatTime(MARKET_OPEN_HOUR, MARKET_OPEN_MINUTE)} - ${formatTime(MARKET_CLOSE_HOUR, MARKET_CLOSE_MINUTE)} ET (${formatTime(localOpen.hour, localOpen.minute)} - ${formatTime(localClose.hour, localClose.minute)} local)`;

  return { isOpen, nextOpen, hours };
}

export function StatusBar({ isConnected, apiConfigured, error, rateLimit }: StatusBarProps) {
  // Determine rate limit color based on usage
  const getRateLimitColor = (percent: number) => {
    if (percent >= 80) { return 'text-neon-red'; }
    if (percent >= 60) { return 'text-yellow-400'; }
    return 'text-neon-green';
  };

  const marketStatus = useMemo(() => getMarketStatus(), []);

  // Fetch next trading day info for holiday countdown
  const [nextTradingDay, setNextTradingDay] = useState<NextTradingDayInfo | null>(null);

  useEffect(() => {
    const fetchNextTradingDay = async () => {
      try {
        const data = await stockService.getNextTradingDay();
        setNextTradingDay(data);
      } catch (err) {
        // Silently fail - this is non-critical info
        console.log('Failed to fetch next trading day:', err);
      }
    };

    fetchNextTradingDay();
    // Refresh every 5 minutes
    const interval = setInterval(fetchNextTradingDay, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-dark-900 border-b border-dark-600">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        {/* Main Status Row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Market Status - Left side, takes available space */}
          <div className="flex-1 flex items-center gap-3 px-3 py-2 bg-dark-800/50 border border-dark-600 rounded-lg min-w-0">
            <div className="flex items-center gap-2 text-gray-400 shrink-0">
              <Clock className="w-4 h-4" />
              <span className="text-sm">NYSE/NASDAQ:</span>
              <span className="text-sm text-gray-300">{marketStatus.hours}</span>
            </div>
            <div className="h-4 w-px bg-dark-600 shrink-0" />
            {marketStatus.isOpen
              ? (
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-neon-green"></span>
                  </span>
                  <span className="text-sm text-neon-green font-medium">Market Open</span>
                </div>
              )
              : (
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex rounded-full h-2 w-2 bg-gray-500"></span>
                  <span className="text-sm text-gray-400">Market Closed</span>
                  <span className="text-sm text-gray-500">
                    • Opens{' '}
                    {marketStatus.nextOpen.toLocaleString(undefined, {
                      weekday: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })}
                  </span>
                  {/* Holiday/Weekend countdown */}
                  {nextTradingDay && nextTradingDay.daysUntil > 0 && (
                    <span
                      className={`text-sm flex items-center gap-1 ${
                        nextTradingDay.reason === 'holiday'
                          ? 'text-yellow-400'
                          : nextTradingDay.reason === 'weekend'
                            ? 'text-neon-blue'
                            : 'text-gray-500'
                      }`}
                      title={
                        nextTradingDay.reason === 'holiday'
                          ? 'Market closed for holiday'
                          : nextTradingDay.reason === 'weekend'
                            ? 'Weekend - Markets closed'
                            : 'Markets will reopen on next trading day'
                      }
                    >
                      <Calendar className="w-3 h-3" />
                      Next trading: {nextTradingDay.dayOfWeek}
                      {nextTradingDay.daysUntil > 1 && ` (${nextTradingDay.daysUntil} days)`}
                    </span>
                  )}
                </div>
              )}
          </div>

          {/* Connection, API, Rate Limit - Right side, grouped together */}
          <div className="flex items-center gap-2 shrink-0">
            {/* WebSocket Connection */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${isConnected ? 'bg-neon-green/10 border-neon-green/30' : 'bg-neon-red/10 border-neon-red/30'}`}
              title={isConnected ? 'WebSocket connected to server - receiving real-time updates' : 'WebSocket disconnected - updates temporarily paused'}
            >
              {isConnected
                ? (
                  <>
                    <Wifi className="w-3.5 h-3.5 text-neon-green" />
                    <span className="text-xs text-neon-green font-medium">Connected</span>
                  </>
                )
                : (
                  <>
                    <WifiOff className="w-3.5 h-3.5 text-neon-red" />
                    <span className="text-xs text-neon-red font-medium">Disconnected</span>
                  </>
                )}
            </div>

            {/* API Status */}
            {apiConfigured !== null && (
              <>
                {apiConfigured
                  ? (
                    <div
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-neon-green/10 rounded-lg border border-neon-green/30"
                      title="Finnhub API key configured - able to fetch fresh stock data"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-neon-green" />
                      <span className="text-xs text-neon-green font-medium">API</span>
                    </div>
                  )
                  : (
                    <div
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-neon-red/10 rounded-lg border border-neon-red/30"
                      title="Finnhub API key not configured - check FINNHUB_API_KEY environment variable"
                    >
                      <AlertCircle className="w-3.5 h-3.5 text-neon-red" />
                      <span className="text-xs text-neon-red font-medium">No API</span>
                    </div>
                  )}
              </>
            )}

            {/* Rate Limit Indicator */}
            {rateLimit && (
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1.5 bg-dark-700 rounded-lg border border-dark-600 ${getRateLimitColor(rateLimit.percentUsed)}`}
                title={`API calls remaining: ${rateLimit.callsRemaining} of ${rateLimit.maxPerMinute} per minute (Finnhub free tier limit). When exceeded, cached data is served.`}
              >
                <Gauge className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">
                  {rateLimit.callsRemaining}/{rateLimit.maxPerMinute}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-neon-red/10 border border-neon-red/30 rounded-lg">
            <AlertCircle className="w-4 h-4 text-neon-red flex-shrink-0" />
            <p className="text-sm text-neon-red">{error}</p>
          </div>
        )}

        {/* Rate Limit Warning */}
        {rateLimit && rateLimit.percentUsed >= 80 && (
          <div className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
            <p className="text-sm text-yellow-400">
              {rateLimit.percentUsed >= 100
                ? 'Rate limit reached - Using cached data'
                : `Rate limit ${rateLimit.percentUsed}% - Using cache soon`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
