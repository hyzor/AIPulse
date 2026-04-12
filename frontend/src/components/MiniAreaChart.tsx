import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

import type { CandleData } from '../types';

interface MiniAreaChartProps {
  data: CandleData[];
  symbol: string;
  width?: number;
  height?: number;
}

interface ChartPoint {
  t: number;
  c: number;
  formattedTime: string;
  formattedPrice: string;
}

export function MiniAreaChart({
  data,
  symbol,
  width = 300,
  height = 80,
}: MiniAreaChartProps) {
  const chartData = useMemo<ChartPoint[]>(() => {
    if (!data || data.length === 0) { return []; }

    return data.map((candle) => ({
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
  }, [data]);

  const trend = useMemo(() => {
    if (chartData.length < 2) { return 'neutral'; }
    const first = chartData[0].c;
    const last = chartData[chartData.length - 1].c;
    return last >= first ? 'up' : 'down';
  }, [chartData]);

  const color = trend === 'up' ? '#22d3ee' : '#f43f5e'; // neon-blue or neon-red
  const gradientId = `gradient-${symbol}`;

  if (chartData.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-dark-800/50 rounded"
        style={{ width, height }}
      >
        <span className="text-gray-500 text-xs">No data</span>
      </div>
    );
  }

  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="t" hide />
          <YAxis domain={['auto', 'auto']} hide />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload?.length) {
                const point = payload[0].payload as ChartPoint;
                return (
                  <div className="bg-dark-800 px-3 py-2 rounded-lg border border-neon-blue shadow-lg">
                    <div className="text-white font-bold text-sm">
                      {point.formattedPrice}
                    </div>
                    <div className="text-gray-400 text-xs">
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
    </div>
  );
}
