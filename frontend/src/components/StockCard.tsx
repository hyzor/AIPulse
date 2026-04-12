import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { StockQuote, STOCK_DISPLAY_NAMES } from '../types';
import { formatCurrency, formatChange, getChangeColor, getChangeBgColor } from '../utils/format';

interface StockCardProps {
  quote: StockQuote;
  isRealtime?: boolean;
}

export function StockCard({ quote, isRealtime = false }: StockCardProps) {
  const isPositive = quote.change >= 0;
  const displayName = STOCK_DISPLAY_NAMES[quote.symbol] || quote.symbol;

  return (
    <div className={`relative bg-dark-700 border border-dark-600 rounded-xl p-5 transition-all duration-300 hover:border-neon-blue/50 hover:shadow-lg hover:shadow-neon-blue/10 group ${isRealtime ? 'ring-2 ring-neon-blue/30' : ''}`}>
      {/* Real-time indicator */}
      {isRealtime && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-neon-green"></span>
          </span>
          <span className="text-xs text-neon-green font-mono">LIVE</span>
        </div>
      )}

      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-xl font-bold text-white tracking-tight">{quote.symbol}</h3>
          <p className="text-sm text-gray-400">{displayName}</p>
        </div>
        <div className={`flex items-center gap-1 px-3 py-1.5 rounded-lg ${getChangeBgColor(quote.change)}`}>
          {isPositive ? (
            <TrendingUp className="w-4 h-4 text-neon-green" />
          ) : (
            <TrendingDown className="w-4 h-4 text-neon-red" />
          )}
          <span className={`text-sm font-bold ${getChangeColor(quote.change)}`}>
            {formatChange(quote.changePercent)}
          </span>
        </div>
      </div>

      <div className="mb-4">
        <p className="text-3xl font-bold text-white font-mono">
          {formatCurrency(quote.currentPrice)}
        </p>
        <p className={`text-sm font-medium ${getChangeColor(quote.change)}`}>
          {quote.change >= 0 ? '+' : ''}{formatCurrency(quote.change)} today
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 pt-4 border-t border-dark-600">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider">Open</p>
          <p className="text-sm font-mono text-gray-300">{formatCurrency(quote.openPrice)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider">High</p>
          <p className="text-sm font-mono text-gray-300">{formatCurrency(quote.highPrice)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider">Low</p>
          <p className="text-sm font-mono text-gray-300">{formatCurrency(quote.lowPrice)}</p>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-dark-600/50 flex justify-between items-center">
        <div className="text-xs text-gray-500">
          Prev Close: <span className="font-mono text-gray-400">{formatCurrency(quote.previousClose)}</span>
        </div>
        <Activity className="w-4 h-4 text-gray-600 group-hover:text-neon-blue transition-colors" />
      </div>
    </div>
  );
}
