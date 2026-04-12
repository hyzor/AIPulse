import { Database, Clock, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';

import { stockService } from '../services/stockService';
import { TRACKED_STOCKS, STOCK_COUNTRIES } from '../types';

interface DataStats {
  total1mCandles: number;
  total1hCandles: number;
  total1dCandles: number;
  symbols: string[];
}

export function DataCollectionStatus() {
  const [stats, setStats] = useState<DataStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const health = await stockService.checkHealth();
        // The health endpoint now returns extended stats
        if (health && 'dataStats' in health) {
          setStats((health as any).dataStats);
        }
        setLoading(false);
      } catch (_err) {
        setError('Failed to load stats');
        setLoading(false);
      }
    };

    fetchStats();
    // Refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => { clearInterval(interval); };
  }, []);

  if (loading) {
    return (
      <div className="bg-dark-800 border border-dark-700 rounded-lg p-4 animate-pulse">
        <div className="h-4 bg-dark-700 rounded w-1/2 mb-2"></div>
        <div className="h-3 bg-dark-700 rounded w-1/3"></div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="bg-dark-800 border border-dark-700 rounded-lg p-4">
        <p className="text-sm text-gray-500">Collection status unavailable</p>
      </div>
    );
  }

  const totalCandles = stats.total1mCandles;
  const hasData = totalCandles > 0;
  const symbolCount = stats.symbols?.length || 0;

  // Estimate hours of data (assuming 12 symbols, ~5 candles per hour per symbol)
  const estimatedHours = Math.floor(totalCandles / 12 / 5);

  // Determine status
  let status = 'Collecting...';
  let statusColor = 'text-yellow-400';
  let progress = 0;

  if (!hasData) {
    status = 'Starting collection...';
    statusColor = 'text-gray-400';
    progress = 0;
  } else if (estimatedHours < 6) {
    status = 'Building 1D view...';
    statusColor = 'text-neon-blue';
    progress = 25;
  } else if (estimatedHours < 24) {
    status = '1D view ready';
    statusColor = 'text-neon-green';
    progress = 50;
  } else if (estimatedHours < 72) {
    status = 'Building 7D view...';
    statusColor = 'text-neon-blue';
    progress = 75;
  } else {
    status = 'Data collection complete';
    statusColor = 'text-neon-green';
    progress = 100;
  }

  return (
    <div className="bg-dark-800 border border-dark-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-neon-blue" />
          <span className="text-sm font-medium text-white">Data Collection</span>
        </div>
        <span className={`text-xs font-medium ${statusColor}`}>
          {status}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-dark-700 rounded-full h-2 mb-3">
        <div
          className={`h-2 rounded-full transition-all duration-500 ${
            progress === 100 ? 'bg-neon-green' : 'bg-neon-blue'
          }`}
          style={{ width: `${Math.max(progress, 5)}%` }}
        >
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-gray-500" />
          <span className="text-gray-400">Candles:</span>
          <span className="text-white font-mono">{totalCandles.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-500" />
          <span className="text-gray-400">Est. Hours:</span>
          <span className="text-white font-mono">
            {estimatedHours}
            h
          </span>
        </div>
      </div>

      {/* Symbol indicators - All tracked symbols */}
      <div className="mt-3 pt-3 border-t border-dark-700">
        <p className="text-xs text-gray-500 mb-2">
          Tracking
          {' '}
          {TRACKED_STOCKS.length}
          {' '}
          AI stocks
        </p>
        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
          {TRACKED_STOCKS.map((symbol) => {
            const hasDataForSymbol = stats.symbols?.includes(symbol);
            return (
              <span
                key={symbol}
                className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${
                  hasDataForSymbol
                    ? 'bg-neon-blue/20 text-neon-blue border border-neon-blue/30'
                    : 'bg-dark-700 text-gray-500 border border-dark-600'
                }`}
                title={STOCK_COUNTRIES[symbol]?.country || ''}
              >
                <span>{STOCK_COUNTRIES[symbol]?.flag || ''}</span>
                <span className="font-medium">{symbol}</span>
              </span>
            );
          })}
        </div>
        {stats.symbols && stats.symbols.length < TRACKED_STOCKS.length && (
          <p className="text-xs text-gray-500 mt-2">
            {TRACKED_STOCKS.length - stats.symbols.length} symbols waiting for first data...
          </p>
        )}
      </div>

      {/* Help text */}
      <div className="mt-3 pt-3 border-t border-dark-700">
        <p className="text-xs text-gray-500">
          {!hasData
            ? (
              'Data collection starts automatically. Charts will appear as data is collected.'
            )
            : estimatedHours < 24
              ? (
                '1D view needs 24 hours to complete. Check back tomorrow for full charts!'
              )
              : estimatedHours < 168
                ? (
                  '1D view complete! 7D view needs 7 days for full history.'
                )
                : (
                  'All time ranges have complete data! Charts are fully populated.'
                )}
        </p>
      </div>
    </div>
  );
}
