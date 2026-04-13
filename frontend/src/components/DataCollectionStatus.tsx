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

  // Calculate estimated hours of market data
  // Each symbol gets ~20 candles per market day (6.5 hours) with 3-minute refresh
  // Average candles per symbol / 3 = approximate market days
  // Market days * 6.5 = market hours
  const symbolsWithData = stats.symbols?.length || 0;
  const avgCandlesPerSymbol = symbolsWithData > 0 ? totalCandles / symbolsWithData : 0;
  // ~3 candles per hour of market time (one every ~3 minutes during market hours only)
  const estimatedHours = hasData ? Math.max(1, Math.floor(avgCandlesPerSymbol / 3)) : 0;

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
            progress === 100 ? 'bg-neon-green' : progress === 0 ? 'bg-gray-600' : 'bg-neon-blue'
          }`}
          style={{ width: `${progress}%` }}
        >
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-gray-500" />
          <span className="text-gray-400">Candles:</span>
          <span className={`font-mono ${totalCandles === 0 ? 'text-gray-500' : 'text-white'}`}>
            {totalCandles.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-500" />
          <span className="text-gray-400">Est. Hours:</span>
          <span className={`font-mono ${estimatedHours === 0 ? 'text-gray-500' : 'text-white'}`}>
            {estimatedHours}h
          </span>
        </div>
      </div>

      {/* No data warning */}
      {totalCandles === 0 && (
        <div className="mt-3 py-2 px-3 bg-dark-700/50 border border-dark-600 rounded text-xs text-gray-400">
          📊 Data collection is initializing. Historical charts will populate as market data is collected over time.
          Chart data requires either: (1) Time for auto-collection to build up candles, or (2) ENABLE_HISTORICAL_FETCH=true with paid Finnhub tier.
        </div>
      )}

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
          {[...TRACKED_STOCKS].sort().map((symbol) => {
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
                <span className="flag-emoji">{STOCK_COUNTRIES[symbol]?.flag || ''}</span>
                <span className="font-medium">{symbol}</span>
              </span>
            );
          })}
        </div>
        {(() => {
          const symbolsWithData = stats.symbols || [];
          const waitingSymbols = TRACKED_STOCKS.filter((s) => !symbolsWithData.includes(s));
          const waitingCount = waitingSymbols.length;

          if (waitingCount > 0) {
            return (
              <p className="text-xs text-gray-500 mt-2">
                {waitingCount} symbol{waitingCount === 1 ? '' : 's'} waiting for first data...
              </p>
            );
          }
          return null;
        })()}
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
