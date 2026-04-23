import { Activity, RefreshCw, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { useState, useEffect } from 'react';

import { TimeRangeToggle } from './TimeRangeToggle';
import { Tooltip } from './Tooltip';
import { useMarketStatus } from '../contexts/MarketStatusContext';
import { formatRelativeTime } from '../utils/format';

interface HeaderProps {
  lastUpdate: Date | null;
  onRefresh: () => Promise<{ freshCount: number; cachedCount: number; failedCount: number }>;
  isLoading: boolean;
}

export function Header({ lastUpdate, onRefresh, isLoading }: HeaderProps) {
  const { isMarketOpen } = useMarketStatus();
  const [refreshStatus, setRefreshStatus] = useState<{
    freshCount: number;
    cachedCount: number;
    failedCount: number;
    isMarketOpen: boolean;
    show: boolean;
  } | null>(null);

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    const result = await onRefresh();
    setRefreshStatus({ ...result, isMarketOpen, show: true });

    // Hide after 3 seconds
    setTimeout(() => {
      setRefreshStatus((prev) => (prev ? { ...prev, show: false } : null));
    }, 3000);
  };

  return (
    <header className="bg-dark-800 border-b border-dark-600 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Tooltip content="AIPulse tracks 15 AI-related stocks in real-time from NYSE/NASDAQ. Data from Finnhub via WebSocket and REST API." position="bottom">
            <div className="flex items-center gap-3 cursor-help">
              <div className="relative">
                <div className="w-10 h-10 bg-gradient-to-br from-neon-blue to-neon-purple rounded-lg flex items-center justify-center">
                  <Activity className="w-6 h-6 text-white" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-neon-green rounded-full border-2 border-dark-800"></div>
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight">
                  AI
                  <span className="text-neon-blue">Pulse</span>
                </h1>
                <p className="text-xs text-gray-400 hidden sm:block">Real-time AI Stock Monitor</p>
              </div>
            </div>
          </Tooltip>

          {/* Status & Controls */}
          <div className="flex items-center gap-4">
            {/* Refresh Feedback Toast */}
            {refreshStatus?.show && (
              <div className={`
                hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium animate-in fade-in slide-in-from-top-2
                ${refreshStatus.freshCount > 0
                ? 'bg-neon-green/10 text-neon-green border border-neon-green/30'
                : refreshStatus.cachedCount > 0
                  ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30'
                  : 'bg-red-500/10 text-red-400 border border-red-500/30'
              }
              `}>
                {refreshStatus.freshCount > 0 ? (
                  <CheckCircle className="w-3.5 h-3.5" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5" />
                )}
                <span>
                  {refreshStatus.freshCount > 0
                    ? refreshStatus.isMarketOpen
                      ? `${refreshStatus.freshCount} live updated`
                      : `${refreshStatus.freshCount} stocks refreshed`
                    : refreshStatus.cachedCount > 0
                      ? 'API limit - cached data'
                      : 'Refresh failed'}
                </span>
              </div>
            )}

            {/* Time Range Toggle */}
            <TimeRangeToggle />

            {/* Live Clock + Data Freshness */}
            <Tooltip content="Local time. Data freshness shows how long since the last successful API fetch from Finnhub. Updates every 60 seconds during market hours." position="bottom">
              <div className="hidden md:flex flex-col items-end cursor-help">
                {/* Clock */}
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-neon-blue" />
                  <p className="text-sm font-mono text-white">
                    {currentTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                  </p>
                </div>
                {/* Data freshness */}
                {lastUpdate && (
                  <p className="text-[11px] text-gray-400 leading-tight">
                    Data: {formatRelativeTime(lastUpdate.getTime())}
                  </p>
                )}
              </div>
            </Tooltip>

            {/* Refresh Button */}
            <Tooltip content={isMarketOpen
              ? 'Fetch live data for all stocks from Finnhub API. Updates cached data with latest prices.'
              : 'Fetch latest available data for all stocks. Markets are closed - data may be from last session.'} position="bottom">
              <button
                onClick={handleRefresh}
                disabled={isLoading}
                className="flex items-center gap-2 px-3 py-2 bg-neon-blue/10 hover:bg-neon-blue/20 text-neon-blue rounded-lg border border-neon-blue/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                <span className="text-sm font-medium hidden sm:inline">
                  {isLoading ? 'Fetching...' : 'Refresh'}
                </span>
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </header>
  );
}
