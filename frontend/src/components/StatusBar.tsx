import { AlertCircle, CheckCircle2, Brain, Cpu, Code2, Rocket, Gauge, Clock } from 'lucide-react';
import { RateLimitStatus } from '../types';
import { useMemo } from 'react';

interface StatusBarProps {
  totalStocks: number;
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
  
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
  
  // Get day of week using weekday: 'short' (more compatible than 'numeric')
  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
  });
  const dayName = dayFormatter.format(now);
  const dayMap: Record<string, number> = {
    'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6, 'Sun': 7
  };
  const dayOfWeek = dayMap[dayName] || 0;
  
  const timeDecimal = hour + minute / 60;
  const openDecimal = MARKET_OPEN_HOUR + MARKET_OPEN_MINUTE / 60;
  const closeDecimal = MARKET_CLOSE_HOUR + MARKET_CLOSE_MINUTE / 60;
  
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
  const isWithinHours = timeDecimal >= openDecimal && timeDecimal < closeDecimal;
  const isOpen = isWeekday && isWithinHours;
  
  // Calculate next open time (in user's local time)
  let daysUntilOpen: number;
  if (isOpen) {
    // Market is open now, next open is tomorrow (or Monday if Friday)
    daysUntilOpen = dayOfWeek === 5 ? 3 : 1;
  } else if (isWeekday && timeDecimal < openDecimal) {
    // Same day, before open
    daysUntilOpen = 0;
  } else if (isWeekday && timeDecimal >= closeDecimal) {
    // Same day, after close - next open is tomorrow (or Monday if Friday)
    daysUntilOpen = dayOfWeek === 5 ? 3 : 1;
  } else {
    // Weekend - next open is Monday
    daysUntilOpen = dayOfWeek === 7 ? 1 : 2; // Sunday -> 1 day, Saturday -> 2 days
  }
  
  // Create the next market open date in ET
  // We need to find the date in ET when market opens next
  const etDateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  
  const etParts = etDateFormatter.formatToParts(now);
  const etYear = parseInt(etParts.find(p => p.type === 'year')?.value || '0');
  const etMonth = parseInt(etParts.find(p => p.type === 'month')?.value || '0') - 1; // 0-indexed
  const etDay = parseInt(etParts.find(p => p.type === 'day')?.value || '0');
  
  // Calculate the target day in ET
  const targetETDay = etDay + daysUntilOpen;
  
  // Create a date object representing 9:30 AM ET on the target day
  // Convert ET to UTC: ET is UTC-5 (EST) or UTC-4 (EDT), so we add 5 hours to get UTC
  // Note: This is simplified and assumes standard time. DST handling would need more logic.
  const nextOpenUTC = Date.UTC(etYear, etMonth, targetETDay, MARKET_OPEN_HOUR + 5, MARKET_OPEN_MINUTE, 0);
  const nextOpen = new Date(nextOpenUTC);
  
  return {
    isOpen,
    nextOpen,
    hours: '9:30 AM - 4:00 PM ET',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export function StatusBar({ totalStocks, apiConfigured, error, rateLimit }: StatusBarProps) {
  // Determine rate limit color based on usage
  const getRateLimitColor = (percent: number) => {
    if (percent >= 80) return 'text-neon-red';
    if (percent >= 60) return 'text-yellow-400';
    return 'text-neon-green';
  };

  const marketStatus = useMemo(() => getMarketStatus(), []);

  return (
    <div className="bg-dark-900 border-b border-dark-600">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Stock Count */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 rounded-lg border border-dark-600">
              <Brain className="w-4 h-4 text-neon-purple" />
              <span className="text-sm text-gray-300">
                <span className="font-bold text-white">{totalStocks}</span> AI stocks tracked
              </span>
            </div>
          </div>

          {/* Categories */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 rounded-lg border border-dark-600">
              <Cpu className="w-4 h-4 text-neon-blue" />
              <span className="text-sm text-gray-300">Semiconductors</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 rounded-lg border border-dark-600">
              <Code2 className="w-4 h-4 text-neon-green" />
              <span className="text-sm text-gray-300">AI Software</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 rounded-lg border border-dark-600">
              <Rocket className="w-4 h-4 text-orange-400" />
              <span className="text-sm text-gray-300">Tech Giants</span>
            </div>
          </div>

          {/* Rate Limit Indicator */}
          {rateLimit && (
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 rounded-lg border border-dark-600 ${getRateLimitColor(rateLimit.percentUsed)}`}>
                <Gauge className="w-4 h-4" />
                <span className="text-sm font-medium">
                  {rateLimit.callsRemaining}/{rateLimit.maxPerMinute} calls
                </span>
              </div>
            </div>
          )}

          {/* API Status */}
          {apiConfigured !== null && (
            <div className="flex items-center gap-2">
              {apiConfigured ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-neon-green/10 rounded-lg border border-neon-green/30">
                  <CheckCircle2 className="w-4 h-4 text-neon-green" />
                  <span className="text-sm text-neon-green font-medium">API Ready</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-neon-red/10 rounded-lg border border-neon-red/30">
                  <AlertCircle className="w-4 h-4 text-neon-red" />
                  <span className="text-sm text-neon-red font-medium">API Not Configured</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-3 flex items-center gap-2 px-4 py-2 bg-neon-red/10 border border-neon-red/30 rounded-lg">
            <AlertCircle className="w-4 h-4 text-neon-red flex-shrink-0" />
            <p className="text-sm text-neon-red">{error}</p>
          </div>
        )}

          {/* Rate Limit Warning */}
          {rateLimit && rateLimit.percentUsed >= 80 && (
            <div className="mt-3 flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
              <p className="text-sm text-yellow-400">
                {rateLimit.percentUsed >= 100 
                  ? `Rate limit reached! (${rateLimit.percentUsed}% used) - Using cached data`
                  : `Approaching rate limit! (${rateLimit.percentUsed}% used) - Will use cached data`}
              </p>
            </div>
          )}

          {/* Market Hours Status */}
          <div className="mt-3 flex items-center gap-4 px-4 py-2 bg-dark-800/50 border border-dark-600 rounded-lg">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-400">NYSE/NASDAQ:</span>
              <span className="text-sm text-gray-300">{marketStatus.hours}</span>
            </div>
            <div className="h-4 w-px bg-dark-600" />
            {marketStatus.isOpen ? (
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-neon-green"></span>
                </span>
                <span className="text-sm text-neon-green font-medium">Market Open</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="inline-flex rounded-full h-2 w-2 bg-gray-500"></span>
                <span className="text-sm text-gray-400">Market Closed</span>
                <span className="text-sm text-gray-500">• Opens {marketStatus.nextOpen.toLocaleString(undefined, { 
                  weekday: 'short', 
                  hour: 'numeric', 
                  minute: '2-digit',
                  hour12: true 
                })}</span>
              </div>
            )}
          </div>
      </div>
    </div>
  );
}
