import { TrendingUp, TrendingDown, BarChart3, Clock } from 'lucide-react';
import { CandleData } from '../types';
import { formatCurrency, formatNumber } from '../utils/format';

interface StatsPanelProps {
  candles: CandleData[];
  currentPrice: number;
  change: number;
  changePercent: number;
}

export function StatsPanel({ candles, currentPrice: _currentPrice, change, changePercent }: StatsPanelProps) {
  if (!candles || candles.length === 0) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-dark-800 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase">High</p>
          <p className="text-lg font-mono text-white">-</p>
        </div>
        <div className="bg-dark-800 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase">Low</p>
          <p className="text-lg font-mono text-white">-</p>
        </div>
        <div className="bg-dark-800 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase">Volume</p>
          <p className="text-lg font-mono text-white">-</p>
        </div>
        <div className="bg-dark-800 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase">Change</p>
          <p className="text-lg font-mono text-white">-</p>
        </div>
      </div>
    );
  }

  const high = Math.max(...candles.map(c => c.h));
  const low = Math.min(...candles.map(c => c.l));
  const totalVolume = candles.reduce((sum, c) => sum + c.v, 0);
  const isPositive = change >= 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="bg-dark-800 rounded-lg p-4 border border-dark-700">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="w-4 h-4 text-neon-green" />
          <p className="text-xs text-gray-500 uppercase">High</p>
        </div>
        <p className="text-lg font-mono text-white">{formatCurrency(high)}</p>
      </div>

      <div className="bg-dark-800 rounded-lg p-4 border border-dark-700">
        <div className="flex items-center gap-2 mb-1">
          <TrendingDown className="w-4 h-4 text-neon-red" />
          <p className="text-xs text-gray-500 uppercase">Low</p>
        </div>
        <p className="text-lg font-mono text-white">{formatCurrency(low)}</p>
      </div>

      <div className="bg-dark-800 rounded-lg p-4 border border-dark-700">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="w-4 h-4 text-neon-blue" />
          <p className="text-xs text-gray-500 uppercase">Volume</p>
        </div>
        <p className="text-lg font-mono text-white">{formatNumber(totalVolume)}</p>
      </div>

      <div className="bg-dark-800 rounded-lg p-4 border border-dark-700">
        <div className="flex items-center gap-2 mb-1">
          <Clock className="w-4 h-4 text-gray-400" />
          <p className="text-xs text-gray-500 uppercase">Change</p>
        </div>
        <p className={`text-lg font-mono ${isPositive ? 'text-neon-green' : 'text-neon-red'}`}>
          {isPositive ? '+' : ''}{changePercent.toFixed(2)}%
        </p>
      </div>
    </div>
  );
}
