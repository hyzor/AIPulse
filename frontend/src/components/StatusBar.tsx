import { AlertCircle, CheckCircle2, Clock, Gauge, Wifi, WifiOff } from 'lucide-react';
import { useMemo } from 'react';

import type { RateLimitStatus } from '../types';

interface StatusBarProps {
  isConnected: boolean;
  apiConfigured: boolean | null;
  error: string | null;
  rateLimit?: RateLimitStatus | null;
}

// US Market hours: 9:30 AM - 4:00 PM ET
const MARKET_OPEN_HOUR = 9;
const MARKET_OPEN_MINUTE = 30;
const MARKET_CLOSE_HOUR = 16;
const MARKET_CLOSE_MINUTE = 0;

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

  return { isOpen, hours: '9:30 AM - 4:00 PM ET' };
}

export function StatusBar({ isConnected, apiConfigured, error, rateLimit }: StatusBarProps) {
  // Determine rate limit color based on usage
  const getRateLimitColor = (percent: number) => {
    if (percent >= 80) { return 'text-neon-red'; }
    if (percent >= 60) { return 'text-yellow-400'; }
    return 'text-neon-green';
  };

  const marketStatus = useMemo(() => getMarketStatus(), []);

  return (
    <div className="bg-dark-900 border-b border-dark-600">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        {/* Main Status Row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Connection & API Status */}
          <div className="flex items-center gap-2">
            {/* WebSocket Connection */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${isConnected ? 'bg-neon-green/10 border-neon-green/30' : 'bg-neon-red/10 border-neon-red/30'}`}>
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
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-neon-green/10 rounded-lg border border-neon-green/30">
                      <CheckCircle2 className="w-3.5 h-3.5 text-neon-green" />
                      <span className="text-xs text-neon-green font-medium">API</span>
                    </div>
                  )
                  : (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-neon-red/10 rounded-lg border border-neon-red/30">
                      <AlertCircle className="w-3.5 h-3.5 text-neon-red" />
                      <span className="text-xs text-neon-red font-medium">No API</span>
                    </div>
                  )}
              </>
            )}
          </div>

          {/* Rate Limit & Market Status */}
          <div className="flex items-center gap-2">
            {/* Rate Limit Indicator */}
            {rateLimit && (
              <div className={`flex items-center gap-1.5 px-2.5 py-1.5 bg-dark-700 rounded-lg border border-dark-600 ${getRateLimitColor(rateLimit.percentUsed)}`}>
                <Gauge className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">
                  {rateLimit.callsRemaining}/{rateLimit.maxPerMinute}
                </span>
              </div>
            )}

            {/* Market Status */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-dark-700 rounded-lg border border-dark-600">
              <Clock className="w-3.5 h-3.5 text-gray-400" />
              {marketStatus.isOpen
                ? (
                  <span className="flex items-center gap-1.5">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-neon-green"></span>
                    </span>
                    <span className="text-xs text-neon-green font-medium">Market Open</span>
                  </span>
                )
                : (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-flex rounded-full h-1.5 w-1.5 bg-gray-500"></span>
                    <span className="text-xs text-gray-400">Closed</span>
                  </span>
                )}
            </div>
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
