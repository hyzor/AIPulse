import { Activity, RefreshCw } from 'lucide-react';

import { TimeRangeToggle } from './TimeRangeToggle';

interface HeaderProps {
  lastUpdate: Date | null;
  onRefresh: () => void;
  isLoading: boolean;
}

export function Header({ lastUpdate, onRefresh, isLoading }: HeaderProps) {
  return (
    <header className="bg-dark-800 border-b border-dark-600 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
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
              <p className="text-xs text-gray-400">Real-time AI Stock Monitor</p>
            </div>
          </div>

          {/* Status & Controls */}
          <div className="flex items-center gap-4">
            {/* Time Range Toggle */}
            <TimeRangeToggle />

            {/* Last Update */}
            {lastUpdate && (
              <div className="hidden md:block text-right">
                <p className="text-xs text-gray-500">Last Update</p>
                <p className="text-sm font-mono text-gray-300">
                  {lastUpdate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                </p>
              </div>
            )}

            {/* Refresh Button */}
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="flex items-center gap-2 px-3 py-2 bg-neon-blue/10 hover:bg-neon-blue/20 text-neon-blue rounded-lg border border-neon-blue/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title="Manually refresh all stock data from Finnhub API"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="text-sm font-medium hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
