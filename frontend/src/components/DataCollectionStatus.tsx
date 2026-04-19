import { Database } from 'lucide-react';
import { useEffect, useState } from 'react';

import { stockService } from '../services/stockService';
import { TRACKED_STOCKS, STOCK_COUNTRIES } from '../types';
import { FlagIcon } from './FlagIcon';
import { Tooltip } from './Tooltip';

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

  // Calculate estimated trading days based on 1h aggregate candles
  // This is more accurate and stable than 1m-based calculation because:
  // 1. New symbols without 1h data don't affect the count until they have enough data
  // 2. Untracked symbols are excluded (symbolsWith1hData is filtered to tracked symbols)
  // 3. 1h aggregates represent "chart-ready" hours, not raw collection time
  const estimatedTradingDays = (totalCandles1h > 0 && symbolsWith1hData > 0)
    ? Math.floor((totalCandles1h / symbolsWith1hData) / 6.5)
    : 0;

  // Define milestones for data collection progress
  // Clear progression: Data → Today → Week → Multi-week
  type Milestone = {
    label: string;
    completed: boolean;
    inProgress: boolean;
    progressPercent: number;
    description: string;
  };

  const milestones: Milestone[] = [
    {
      label: 'Data',
      completed: has1mData,
      inProgress: !has1mData,
      progressPercent: 20,
      description: 'Collecting 1-minute price ticks',
    },
    {
      label: 'Today',
      completed: chartsReady,
      inProgress: has1mData && !chartsReady,
      progressPercent: 40,
      description: '1-hour charts ready for current day',
    },
    {
      label: '2 Days',
      completed: chartsReady && estimatedTradingDays >= 2,
      inProgress: chartsReady && estimatedTradingDays >= 1 && estimatedTradingDays < 2,
      progressPercent: 60,
      description: '2+ days for 1D view comparison',
    },
    {
      label: '7 Days',
      completed: chartsReady && estimatedTradingDays >= 7,
      inProgress: chartsReady && estimatedTradingDays >= 2 && estimatedTradingDays < 7,
      progressPercent: 80,
      description: '7 trading days for 7D view',
    },
    {
      label: '30 Days',
      completed: has1dData && estimatedTradingDays >= 30,
      inProgress: chartsReady && estimatedTradingDays >= 7 && estimatedTradingDays < 30,
      progressPercent: 100,
      description: '30 trading days for 30D view',
    },
  ];

  // Calculate progress based on actual data state
  let progress: number;

  if (!has1mData) {
    // Stage 1: Data (0-20%)
    progress = 10;
  } else if (!chartsReady) {
    // Stage 2: Today (20-40%)
    progress = 30;
  } else if (estimatedTradingDays < 2) {
    // Stage 3: Week milestone not yet reached (40-60%)
    // Only advance within this range as we collect the first day's data
    // With <1 day, we're still early in this range
    const dayFraction = Math.max(0, estimatedTradingDays - 1); // 0 if <1 day, approaching 1 as we near 2 days
    progress = 40 + (dayFraction * 20);
  } else if (estimatedTradingDays < 7) {
    // Stage 4: 7 Day milestone (60-80%)
    const dayProgress = (estimatedTradingDays / 7) * 20;
    progress = 60 + dayProgress;
  } else if (estimatedTradingDays < 30) {
    // Stage 5: 30 Day milestone (80-100%)
    const dayProgress = ((estimatedTradingDays - 7) / 23) * 20;
    progress = 80 + dayProgress;
  } else {
    // Complete
    progress = 100;
  }

  // Status text based on current stage - clear and actionable
  let status: string;
  let statusColor: string;
  let statusDetail: string;

  if (!has1mData) {
    status = 'Waiting for market data...';
    statusColor = 'text-gray-400';
    statusDetail = 'Collection starts when markets open (9:30 AM ET)';
  } else if (!chartsReady) {
    status = 'Preparing charts...';
    statusColor = 'text-yellow-400';
    statusDetail = `Processing ${totalCandles1m.toLocaleString()} price points into hourly charts`;
  } else if (estimatedTradingDays < 2) {
    status = '1D charts ready';
    statusColor = 'text-neon-blue';
    statusDetail = `Showing today's ${symbolsWith1hData} stocks. Collecting more days for 7D view...`;
  } else if (estimatedTradingDays < 7) {
    status = 'Building 7D charts...';
    statusColor = 'text-neon-blue';
    statusDetail = `${estimatedTradingDays} of 7 trading days collected. 7D view unlocks at 7 trading days.`;
  } else if (estimatedTradingDays < 30) {
    status = 'Building 30D charts...';
    statusColor = 'text-neon-green';
    statusDetail = `${estimatedTradingDays} of 30 trading days collected. 30D view unlocks at 30 trading days.`;
  } else {
    status = 'All charts ready';
    statusColor = 'text-neon-green';
    statusDetail = `${estimatedTradingDays}+ trading days of history. All views (1D, 7D, 30D) available.`;
  }

  return (
    <div className="bg-dark-800 border border-dark-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <Tooltip content="Shows data collection progress from Finnhub API. Collects 1-minute ticks during market hours and aggregates into hourly/daily candles for charts." position="right">
          <div className="flex items-center gap-2 cursor-help">
            <Database className="w-4 h-4 text-neon-blue" />
            <span className="text-sm font-medium text-white">Data Collection</span>
          </div>
        </Tooltip>
        <Tooltip content={statusDetail} position="left">
          <span className={`text-xs font-medium cursor-help ${statusColor}`}>
            {status}
          </span>
        </Tooltip>
      </div>

      {/* Status detail */}
      {statusDetail && (
        <p className="text-xs text-gray-400 mt-1 mb-2">{statusDetail}</p>
      )}

      {/* Progress bar with milestones */}
      <div className="mb-3">
        <div className="flex justify-between text-[10px] mb-1">
          {milestones.map((milestone) => {
            // Completed = green, In Progress = blue/active, Future = gray
            const labelClass = milestone.completed
              ? 'text-neon-green cursor-help' // Completed
              : milestone.inProgress
                ? 'text-neon-blue font-medium cursor-help' // Currently in progress
                : 'text-gray-600 cursor-help'; // Future/not reached
            return (
              <Tooltip key={milestone.label} content={milestone.description} position="top">
                <span className={labelClass}>
                  {milestone.label}
                </span>
              </Tooltip>
            );
          })}
        </div>
        <Tooltip content={`${Math.round(progress)}% complete - ${estimatedTradingDays} trading days collected`} position="bottom">
          <div className="w-full bg-dark-700 rounded-full h-2 cursor-help">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${
                progress === 100 ? 'bg-neon-green' : progress === 0 ? 'bg-gray-600' : 'bg-neon-blue'
              }`}
              style={{ width: `${progress}%` }}
            >
            </div>
          </div>
        </Tooltip>
      </div>

      {/* Stats by resolution */}
      <div className="grid grid-cols-3 gap-2 text-sm mb-3">
        <Tooltip content="Raw 1-minute price ticks collected from Finnhub API. Used for real-time quotes and processed into hourly candles for charts." position="top">
          <div className={`flex flex-col p-2 rounded cursor-help ${has1mData ? 'bg-dark-700/50' : 'bg-dark-800/30'}`}>
            <span className="text-xs text-gray-500">1-Minute Points</span>
            <span className={`font-mono font-medium ${has1mData ? 'text-white' : 'text-gray-600'}`}>
              {totalCandles1m.toLocaleString()}
            </span>
            <span className="text-[10px] text-gray-500">{symbolsWith1mData} symbols</span>
          </div>
        </Tooltip>
        <Tooltip content="1-hour OHLC candles processed from minute data by TimescaleDB continuous aggregates. Used for intraday charts." position="top">
          <div className={`flex flex-col p-2 rounded cursor-help ${has1hData ? 'bg-dark-700/50' : 'bg-dark-800/30'}`}>
            <span className="text-xs text-gray-500">Hourly Candles</span>
            <span className={`font-mono font-medium ${has1hData ? 'text-neon-blue' : 'text-gray-600'}`}>
              {totalCandles1h.toLocaleString()}
            </span>
            <span className="text-[10px] text-gray-500">{symbolsWith1hData} symbols</span>
          </div>
        </Tooltip>
        <Tooltip content="Daily OHLC candles aggregated from hourly data. Used for 7D and 30D historical views and trading day calculations." position="top">
          <div className={`flex flex-col p-2 rounded cursor-help ${has1dData ? 'bg-dark-700/50' : 'bg-dark-800/30'}`}>
            <span className="text-xs text-gray-500">Daily Candles</span>
            <span className={`font-mono font-medium ${has1dData ? 'text-neon-green' : 'text-gray-600'}`}>
              {totalCandles1d.toLocaleString()}
            </span>
            <span className="text-[10px] text-gray-500">{symbolsWith1dData} symbols</span>
          </div>
        </Tooltip>
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

            const tooltipContent = symbolStatus === 'chart-ready'
              ? `${symbol}: Chart-ready with hourly candles. ${STOCK_COUNTRIES[symbol]?.country || ''}`
              : symbolStatus === 'data-only'
                ? `${symbol}: Raw data collected, processing into hourly candles. ${STOCK_COUNTRIES[symbol]?.country || ''}`
                : `${symbol}: Waiting for first data collection. ${STOCK_COUNTRIES[symbol]?.country || ''}`;

            return (
              <Tooltip key={symbol} content={tooltipContent} position="top">
                <span
                  className={`text-xs px-2 py-1 rounded flex items-center gap-1 cursor-help ${
                    symbolStatus === 'chart-ready'
                      ? 'bg-neon-green/20 text-neon-green border border-neon-green/30'
                      : symbolStatus === 'data-only'
                        ? 'bg-neon-blue/20 text-neon-blue border border-neon-blue/30'
                        : 'bg-dark-700 text-gray-500 border border-dark-600'
                  }`}
                >
                  <FlagIcon
                    countryCode={STOCK_COUNTRIES[symbol]?.countryCode || 'us'}
                    size="sm"
                  />
                  <span className="font-medium">{symbol}</span>
                  {has1dData && estimatedTradingDays >= 7 && <span className="text-[8px]">7D</span>}
                </span>
              </Tooltip>
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

      {/* Help text - explains current stage in plain language */}
      <div className="mt-3 pt-3 border-t border-dark-700">
        <p className="text-xs text-gray-500">
          {!has1mData && (
            'Markets are closed or data collection is starting. Charts will appear when trading begins.'
          )}
          {has1mData && !chartsReady && (
            'Raw price data is being processed into hourly chart candles. This happens automatically every hour.'
          )}
          {chartsReady && estimatedTradingDays < 2 && (
            '1D view shows intraday charts for current trading day. Come back tomorrow to compare days.'
          )}
          {chartsReady && estimatedTradingDays >= 2 && estimatedTradingDays < 7 && (
            `You can view ${estimatedTradingDays} trading days of history. Keep collecting to unlock 7D view (shows week trends).`
          )}
          {chartsReady && estimatedTradingDays >= 7 && estimatedTradingDays < 30 && (
            `7D view is now available! Keep collecting to unlock 30D view (shows monthly trends). Currently at ${estimatedTradingDays} trading days.`
          )}
          {chartsReady && estimatedTradingDays >= 30 && (
            'All time range views are available: 1D (today), 7D (week), 30D (month).'
          )}
        </p>
      </div>
    </div>
  );
}
