import { Database } from 'lucide-react';
import { useEffect, useState } from 'react';

import { stockService } from '../services/stockService';
import { TRACKED_STOCKS, STOCK_COUNTRIES } from '../types';
import { FlagIcon } from './FlagIcon';

interface DataStats {
  total1mCandles: number;
  total1hCandles: number;
  total1dCandles: number;
  symbols: string[];
  symbols1h?: string[];
  symbols1d?: string[];
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

  // Check data availability for different resolutions
  const totalCandles1m = stats.total1mCandles;
  const totalCandles1h = stats.total1hCandles;
  const totalCandles1d = stats.total1dCandles;

  // Filter to only count symbols that are currently being tracked
  const trackedSymbolsSet = new Set(TRACKED_STOCKS);
  const symbolsWith1mData = stats.symbols?.filter((s) => trackedSymbolsSet.has(s as typeof TRACKED_STOCKS[number])).length || 0;
  const symbolsWith1hData = stats.symbols1h?.filter((s) => trackedSymbolsSet.has(s as typeof TRACKED_STOCKS[number])).length || 0;
  const symbolsWith1dData = stats.symbols1d?.filter((s) => trackedSymbolsSet.has(s as typeof TRACKED_STOCKS[number])).length || 0;

  const has1mData = totalCandles1m > 0;
  const has1hData = totalCandles1h > 0;
  const has1dData = totalCandles1d > 0;

  // Charts need 1h data for 1D view and 1d data for longer views
  const chartsReady = has1hData && symbolsWith1hData > 0;

  // Calculate estimated hours of market data (based on 1m data)
  const avgCandlesPerSymbol = symbolsWith1mData > 0 ? totalCandles1m / symbolsWith1mData : 0;
  const estimatedHours = has1mData ? Math.max(1, Math.floor(avgCandlesPerSymbol / 3)) : 0;

  // Define milestones for data collection progress
  // Stage 1: Raw data collection (1m candles)
  // Stage 2: Charts displaying (1h aggregates ready)
  // Stage 3: Building 1D view (in progress 6-24 hours)
  // Stage 4: Full 1D view (24+ hours)
  // Stage 5: 7D+ views (72+ hours with 1d aggregates)
  type Milestone = {
    label: string;
    completed: boolean;
    inProgress: boolean;
    progressPercent: number;
    description: string;
  };

  const milestones: Milestone[] = [
    {
      label: 'Raw Data',
      completed: has1mData,
      inProgress: false,
      progressPercent: 25,
      description: 'Collecting price ticks',
    },
    {
      label: 'Charts',
      completed: chartsReady,
      inProgress: false,
      progressPercent: 50,
      description: '1-hour aggregates ready',
    },
    {
      label: 'Building 1D',
      completed: chartsReady && estimatedHours >= 24, // Complete once Full 1D is reached
      inProgress: chartsReady && estimatedHours >= 6 && estimatedHours < 24,
      progressPercent: 50 + Math.min(25, (estimatedHours / 24) * 25), // 50-75% based on hours
      description: 'Collecting 24h of data',
    },
    {
      label: 'Full 1D',
      completed: chartsReady && estimatedHours >= 24,
      inProgress: false,
      progressPercent: 75,
      description: '24 hours of market data',
    },
    {
      label: '7D+ Views',
      completed: has1dData && estimatedHours >= 72,
      inProgress: false,
      progressPercent: 100,
      description: '72+ hours for 7D view',
    },
  ];

  // Find current milestone (one that's in progress, or first incomplete)
  const inProgressIndex = milestones.findIndex((m) => m.inProgress);
  const currentMilestoneIndex = inProgressIndex >= 0
    ? inProgressIndex
    : milestones.findIndex((m) => !m.completed);

  // Calculate progress - use in-progress milestone's percent, or next incomplete
  let progress: number;
  if (currentMilestoneIndex >= 0 && milestones[currentMilestoneIndex]?.inProgress) {
    progress = milestones[currentMilestoneIndex].progressPercent;
  } else {
    progress = currentMilestoneIndex === -1
      ? 100
      : milestones[currentMilestoneIndex]?.progressPercent ?? 0;
  }

  // Cap progress at 75% until we actually have 72 hours for 7D+ Views
  // This prevents the bar from jumping to 100% when Full 1D is reached
  if (progress > 75 && estimatedHours < 72) {
    progress = 75;
  }

  // Status text based on current stage
  let status: string;
  let statusColor: string;
  let statusDetail: string;

  if (!has1mData) {
    status = 'Starting collection...';
    statusColor = 'text-gray-400';
    statusDetail = 'Waiting for first price data';
  } else if (!chartsReady) {
    status = 'Processing for charts...';
    statusColor = 'text-yellow-400';
    statusDetail = `1m data: ${totalCandles1m.toLocaleString()} candles. 1h aggregates refresh hourly`;
  } else if (estimatedHours < 6) {
    status = 'Charts displaying';
    statusColor = 'text-neon-blue';
    statusDetail = `${symbolsWith1hData}/${TRACKED_STOCKS.length} symbols showing charts. Building history...`;
  } else if (estimatedHours < 24) {
    status = 'Building 1D view...';
    statusColor = 'text-neon-blue';
    statusDetail = `${estimatedHours}h of market data collected. Need 24h for full 1D view.`;
  } else if (estimatedHours < 72) {
    status = '1D view complete';
    statusColor = 'text-neon-green';
    statusDetail = 'Full 24h 1D view ready. Collecting for 7D view...';
  } else if (!has1dData) {
    status = 'Building 7D view...';
    statusColor = 'text-neon-green';
    statusDetail = '72+ hours collected. 7D aggregates processing...';
  } else {
    status = 'Collection complete';
    statusColor = 'text-neon-green';
    statusDetail = 'All chart time ranges (1D, 7D, 30D+) available';
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

      {/* Status detail */}
      {statusDetail && (
        <p className="text-xs text-gray-400 mt-1 mb-2">{statusDetail}</p>
      )}

      {/* Progress bar with milestones */}
      <div className="mb-3">
        <div className="flex justify-between text-[10px] text-gray-500 mb-1">
          {milestones.map((milestone, index) => {
            // Completed = green, In Progress = white/active, Future = gray
            const labelClass = milestone.completed
              ? 'text-neon-green' // Completed
              : milestone.inProgress
                ? 'text-white font-medium' // Currently in progress
                : index === currentMilestoneIndex
                  ? 'text-white font-medium' // Next target (if none in progress)
                  : 'text-gray-600'; // Future/not reached
            return (
              <span key={milestone.label} className={labelClass}>
                {milestone.label}
              </span>
            );
          })}
        </div>
        <div className="w-full bg-dark-700 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${
              progress === 100 ? 'bg-neon-green' : progress === 0 ? 'bg-gray-600' : 'bg-neon-blue'
            }`}
            style={{ width: `${progress}%` }}
          >
          </div>
        </div>
      </div>

      {/* Stats by resolution */}
      <div className="grid grid-cols-3 gap-2 text-sm mb-3">
        <div className={`flex flex-col p-2 rounded ${has1mData ? 'bg-dark-700/50' : 'bg-dark-800/30'}`}>
          <span className="text-xs text-gray-500">1m Data</span>
          <span className={`font-mono font-medium ${has1mData ? 'text-white' : 'text-gray-600'}`}>
            {totalCandles1m.toLocaleString()}
          </span>
          <span className="text-[10px] text-gray-500">{symbolsWith1mData} symbols</span>
        </div>
        <div className={`flex flex-col p-2 rounded ${has1hData ? 'bg-dark-700/50' : 'bg-dark-800/30'}`}>
          <span className="text-xs text-gray-500">1h Charts</span>
          <span className={`font-mono font-medium ${has1hData ? 'text-neon-blue' : 'text-gray-600'}`}>
            {totalCandles1h.toLocaleString()}
          </span>
          <span className="text-[10px] text-gray-500">{symbolsWith1hData} symbols</span>
        </div>
        <div className={`flex flex-col p-2 rounded ${has1dData ? 'bg-dark-700/50' : 'bg-dark-800/30'}`}>
          <span className="text-xs text-gray-500">1d Charts</span>
          <span className={`font-mono font-medium ${has1dData ? 'text-neon-green' : 'text-gray-600'}`}>
            {totalCandles1d.toLocaleString()}
          </span>
          <span className="text-[10px] text-gray-500">{symbolsWith1dData} symbols</span>
        </div>
      </div>

      {/* No data warning */}
      {totalCandles1m === 0 && (
        <div className="mt-3 py-2 px-3 bg-dark-700/50 border border-dark-600 rounded text-xs text-gray-400">
          📊 Data collection is initializing. Historical charts will populate as market data is collected over time.
          Chart data requires either: (1) Time for auto-collection to build up candles, or (2) ENABLE_HISTORICAL_FETCH=true with paid Finnhub tier.
        </div>
      )}

      {/* Processing warning */}
      {totalCandles1m > 0 && totalCandles1h === 0 && (
        <div className="mt-3 py-2 px-3 bg-dark-700/50 border border-dark-600 rounded text-xs text-gray-400">
          ⏳ 1-minute data is being collected but 1-hour chart data is still processing.
          Continuous aggregates refresh every hour. Charts will appear once processing completes.
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
          {chartsReady && (
            <span className="ml-2 text-neon-green">
              ({symbolsWith1hData}/{TRACKED_STOCKS.length} with charts)
            </span>
          )}
        </p>
        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
          {[...TRACKED_STOCKS].sort().map((symbol) => {
            const has1m = stats.symbols?.includes(symbol);
            const has1h = stats.symbols1h?.includes(symbol);
            // Show different colors based on what's available
            const symbolStatus = has1h
              ? 'chart-ready'
              : has1m
                ? 'data-only'
                : 'waiting';

            return (
              <span
                key={symbol}
                className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${
                  symbolStatus === 'chart-ready'
                    ? 'bg-neon-green/20 text-neon-green border border-neon-green/30'
                    : symbolStatus === 'data-only'
                      ? 'bg-neon-blue/20 text-neon-blue border border-neon-blue/30'
                      : 'bg-dark-700 text-gray-500 border border-dark-600'
                }`}
                title={STOCK_COUNTRIES[symbol]?.country || ''}
              >
                <FlagIcon
                  countryCode={STOCK_COUNTRIES[symbol]?.countryCode || 'us'}
                  size="sm"
                />
                <span className="font-medium">{symbol}</span>
                {has1dData && estimatedHours >= 72 && <span className="text-[8px]">7D</span>}
              </span>
            );
          })}
        </div>
        {(() => {
          const symbolsWith1m = stats.symbols || [];
          const symbolsWith1h = stats.symbols1h || [];
          const waitingSymbols = TRACKED_STOCKS.filter((s) => !symbolsWith1m.includes(s));
          const processingSymbols = TRACKED_STOCKS.filter((s) =>
            symbolsWith1m.includes(s) && !symbolsWith1h.includes(s),
          );
          const waitingCount = waitingSymbols.length;
          const processingCount = processingSymbols.length;

          if (waitingCount > 0 || processingCount > 0) {
            return (
              <div className="text-xs text-gray-500 mt-2 space-y-1">
                {waitingCount > 0 && (
                  <p>{waitingCount} symbol{waitingCount === 1 ? '' : 's'} waiting for first data...</p>
                )}
                {processingCount > 0 && (
                  <p className="text-neon-blue">{processingCount} symbol{processingCount === 1 ? '' : 's'} processing for charts...</p>
                )}
              </div>
            );
          }
          return null;
        })()}
      </div>

      {/* Help text - explains current stage */}
      <div className="mt-3 pt-3 border-t border-dark-700">
        <p className="text-xs text-gray-500">
          {currentMilestoneIndex === 0 && (
            'Collecting 1-minute price data during market hours. Charts will appear once aggregates are processed.'
          )}
          {currentMilestoneIndex === 1 && (
            '1-hour aggregates are being built from raw data. Charts will display once this completes (auto-refreshes hourly).'
          )}
          {currentMilestoneIndex === 2 && (
            'Charts are displaying! Building up 24 hours of market history for complete 1D view.'
          )}
          {currentMilestoneIndex === 3 && (
            '1D view is complete. 7D view needs daily aggregates to finish processing.'
          )}
          {currentMilestoneIndex === -1 && (
            'All stages complete! Raw data, 1D charts, and 7D+ views are fully available.'
          )}
        </p>
      </div>
    </div>
  );
}
