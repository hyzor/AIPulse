import { X, RefreshCw } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

import { useTimeRange } from '../contexts/TimeRangeContext';
import { STOCK_DISPLAY_NAMES } from '../types';
import { StatsPanel } from './StatsPanel';
import { SymbolStatusIndicator } from './SymbolStatus';
import { formatCurrency } from '../utils/format';

import type { StockQuote } from '../types';

interface ExpandedChartModalProps {
  symbol: string | null;
  quote: StockQuote | null;
  onClose: () => void;
}

interface ChartPoint {
  t: number;
  c: number;
  formattedTime: string;
  formattedPrice: string;
}

export function ExpandedChartModal({ symbol, quote, onClose }: ExpandedChartModalProps) {
  const { getSymbolData, timeRange, fetchHistory } = useTimeRange();

  const historicalData = symbol ? getSymbolData(symbol) : undefined;
  const candles = historicalData?.candles || [];
  const isLoading = historicalData?.loading ?? true;
  const hasError = !!historicalData?.error;

  // Refresh data when modal opens
  useEffect(() => {
    if (symbol && !historicalData) {
      fetchHistory(symbol);
    }
  }, [symbol, fetchHistory, historicalData]);

  const chartData = useMemo<ChartPoint[]>(() => {
    if (!candles || candles.length === 0) { return []; }

    return candles.map((candle) => ({
      t: candle.t,
      c: candle.c,
      formattedTime: new Date(candle.t).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
      formattedPrice: `$${candle.c.toFixed(2)}`,
    }));
  }, [candles]);

  const trend = useMemo(() => {
    if (chartData.length < 2) { return 'neutral'; }
    const first = chartData[0].c;
    const last = chartData[chartData.length - 1].c;
    return last >= first ? 'up' : 'down';
  }, [chartData]);

  const color = trend === 'up' ? '#22d3ee' : '#f43f5e';
  const gradientId = `modal-gradient-${symbol}`;

  if (!symbol || !quote) { return null; }

  const displayName = STOCK_DISPLAY_NAMES[symbol] || symbol;
  const isPositive = quote.change >= 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-dark-800 rounded-2xl border border-dark-600 shadow-2xl w-full max-w-4xl mx-4 overflow-hidden"
        onClick={(e) => { e.stopPropagation(); }}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-dark-700 flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-white">{symbol}</h2>
              <span className="text-gray-400">{displayName}</span>
              <SymbolStatusIndicator
                quote={quote}
                candles={candles}
                isRealtime={false}
                showLabel={true}
                size="md"
                useCustomTooltip={true}
              />
            </div>
            <div className="flex items-center gap-4 mt-2">
              <span className="text-3xl font-bold text-white font-mono">
                {formatCurrency(quote.currentPrice)}
              </span>
              <span className={`text-lg font-medium ${isPositive ? 'text-neon-green' : 'text-neon-red'}`}>
                {isPositive ? '+' : ''}
                {quote.change.toFixed(2)}
                {' '}
                (
                {quote.changePercent.toFixed(2)}
                %)
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchHistory(symbol)}
              className="p-2 rounded-lg hover:bg-dark-700 text-gray-400 hover:text-white transition-colors"
              title="Refresh data"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-dark-700 text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Chart */}
        <div className="px-6 py-4">
          <div className="h-80 md:h-96">
            {isLoading
              ? (
                <div className="h-full flex items-center justify-center">
                  <div className="animate-pulse flex flex-col items-center">
                    <div className="h-4 w-32 bg-dark-600 rounded mb-2"></div>
                    <div className="h-3 w-24 bg-dark-600 rounded"></div>
                  </div>
                </div>
              )
              : hasError
                ? (
                  <div className="h-full flex flex-col items-center justify-center">
                    <p className="text-gray-400 mb-4">Failed to load chart data</p>
                    <button
                      onClick={() => fetchHistory(symbol)}
                      className="px-4 py-2 bg-neon-blue text-dark-900 rounded-lg font-medium hover:bg-neon-blue/90 transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                )
                : chartData.length === 0
                  ? (
                    <div className="h-full flex flex-col items-center justify-center">
                      <p className="text-gray-400 mb-2">Collecting data...</p>
                      <p className="text-gray-500 text-xs text-center max-w-md px-4">
                        Historical chart data is collected over time during market hours.
                        Charts require time-series data which can also be fetched via
                        ENABLE_HISTORICAL_FETCH=true with paid Finnhub tier.
                      </p>
                    </div>
                  )
                  : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={chartData}
                        margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
                      >
                        <defs>
                          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={color} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.5} />
                        <XAxis
                          dataKey="t"
                          tickFormatter={(value) => {
                            const date = new Date(value);
                            return timeRange === '30d'
                              ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                              : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' });
                          }}
                          stroke="#6b7280"
                          fontSize={12}
                          tickLine={false}
                        />
                        <YAxis
                          domain={['auto', 'auto']}
                          tickFormatter={(value) => `$${value.toFixed(0)}`}
                          stroke="#6b7280"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                          width={60}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload?.length) {
                              const point = payload[0].payload as ChartPoint;
                              return (
                                <div className="bg-dark-800 px-4 py-3 rounded-lg border border-neon-blue shadow-xl">
                                  <div className="text-white font-bold text-lg mb-1">
                                    {point.formattedPrice}
                                  </div>
                                  <div className="text-gray-400 text-sm">
                                    {point.formattedTime}
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="c"
                          stroke={color}
                          strokeWidth={2}
                          fill={`url(#${gradientId})`}
                          isAnimationActive={true}
                          animationDuration={1000}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
          </div>
        </div>

        {/* Stats */}
        <div className="px-6 pb-6">
          <StatsPanel
            candles={candles}
            currentPrice={quote.currentPrice}
            change={quote.change}
            changePercent={quote.changePercent}
          />
        </div>
      </div>
    </div>
  );
}
