import { TrendingUp, TrendingDown, Zap, Cpu, Code2, Rocket, Clock } from 'lucide-react';
import { useMemo } from 'react';

import type { StockQuote } from '../types';
import { STOCK_CATEGORIES } from '../types';

// US Market hours: 9:30 AM - 4:00 PM ET
const MARKET_OPEN_HOUR = 9;
const MARKET_OPEN_MINUTE = 30;
const MARKET_CLOSE_HOUR = 16;
const MARKET_CLOSE_MINUTE = 0;

function isMarketOpen(): boolean {
  const now = new Date();

  const etOptions: Intl.DateTimeFormatOptions = {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  };

  const formatter = new Intl.DateTimeFormat('en-US', etOptions);
  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);

  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
  });
  const dayName = dayFormatter.format(now);
  const dayMap: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
  };
  const dayOfWeek = dayMap[dayName] || 0;

  const timeDecimal = hour + minute / 60;
  const openDecimal = MARKET_OPEN_HOUR + MARKET_OPEN_MINUTE / 60;
  const closeDecimal = MARKET_CLOSE_HOUR + MARKET_CLOSE_MINUTE / 60;

  return dayOfWeek >= 1 && dayOfWeek <= 5 && timeDecimal >= openDecimal && timeDecimal < closeDecimal;
}

function getLastTradingDate(): string {
  const now = new Date();

  const etDateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
  });

  const dayName = dayFormatter.format(now);
  const dayMap: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
  };
  const dayOfWeek = dayMap[dayName] || 0;

  let daysToSubtract = 0;
  if (dayOfWeek === 7) {
    daysToSubtract = 2; // Sunday → Friday
  } else if (dayOfWeek === 6) {
    daysToSubtract = 1; // Saturday → Friday
  } else if (dayOfWeek === 1) {
    daysToSubtract = 3; // Monday → Friday (but Monday data is from Friday close)
  }

  const lastTradingDate = new Date(now);
  lastTradingDate.setDate(lastTradingDate.getDate() - daysToSubtract);

  return etDateFormatter.format(lastTradingDate);
}

interface CategoryPerformanceProps {
  stocks: Map<string, StockQuote>;
}

interface CategoryStats {
  name: string;
  icon: React.ReactNode;
  color: string;
  avgChange: number;
  avgChangePercent: number;
  stockCount: number;
  upStocks: number;
  downStocks: number;
}

export function CategoryPerformance({ stocks }: CategoryPerformanceProps) {
  const marketIsOpen = useMemo(() => isMarketOpen(), []);
  const lastTradingDate = useMemo(() => getLastTradingDate(), []);

  // Calculate stats for each category
  const calculateCategoryStats = (categoryName: string, symbols: string[]): CategoryStats => {
    let totalChange = 0;
    let totalChangePercent = 0;
    let upStocks = 0;
    let downStocks = 0;
    let count = 0;

    symbols.forEach((symbol) => {
      const quote = stocks.get(symbol);
      if (quote) {
        totalChange += quote.change;
        totalChangePercent += quote.changePercent;
        count++;
        if (quote.change >= 0) {
          upStocks++;
        } else {
          downStocks++;
        }
      }
    });

    return {
      name: categoryName,
      icon: getCategoryIcon(categoryName),
      color: getCategoryColor(categoryName),
      avgChange: count > 0 ? totalChange / count : 0,
      avgChangePercent: count > 0 ? totalChangePercent / count : 0,
      stockCount: count,
      upStocks,
      downStocks,
    };
  };

  const getCategoryIcon = (category: string): React.ReactNode => {
    switch (category) {
      case 'AI Chips': return <Zap className="w-5 h-5" />;
      case 'Semiconductors': return <Cpu className="w-5 h-5" />;
      case 'AI Software': return <Code2 className="w-5 h-5" />;
      case 'Tech Giants': return <Rocket className="w-5 h-5" />;
      default: return null;
    }
  };

  const getCategoryColor = (category: string): string => {
    switch (category) {
      case 'AI Chips': return 'text-neon-purple';
      case 'Semiconductors': return 'text-neon-blue';
      case 'AI Software': return 'text-neon-green';
      case 'Tech Giants': return 'text-orange-400';
      default: return 'text-gray-400';
    }
  };

  const categoryStats = Object.entries(STOCK_CATEGORIES).map(([name, symbols]) =>
    calculateCategoryStats(name, symbols),
  );

  const formatPercent = (value: number): string => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  const formatCurrency = (value: number): string => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}$${value.toFixed(2)}`;
  };

  return (
    <div className="bg-dark-800 border-b border-dark-600">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-400">Category Performance</h3>
          {marketIsOpen ? (
            <span className="flex items-center gap-1 text-xs text-neon-green" title="Live market data - updates in real-time during trading hours">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-neon-green"></span>
              </span>
              Live Today
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-gray-500" title={`Market closed - showing data from last trading session (${lastTradingDate})`}>
              <Clock className="w-3 h-3" />
              {lastTradingDate}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {categoryStats.map((category) => (
            <div
              key={category.name}
              className="bg-dark-700 rounded-lg border border-dark-600 p-3 hover:border-dark-500 transition-colors"
              title={`${category.name}: Average performance across ${category.stockCount} stocks. ${category.upStocks} up, ${category.downStocks} down ${marketIsOpen ? 'today' : `on ${lastTradingDate}`}.`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={category.color}>{category.icon}</span>
                <span className="text-sm font-medium text-white">{category.name}</span>
              </div>

              <div className="flex items-baseline gap-1 mb-1">
                <span className={`text-lg font-bold ${category.avgChangePercent >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>
                  {formatPercent(category.avgChangePercent)}
                </span>
                <span className={`text-xs ${category.avgChange >= 0 ? 'text-neon-green/70' : 'text-neon-red/70'}`}>
                  {formatCurrency(category.avgChange)}
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  {category.avgChangePercent >= 0
                    ? <TrendingUp className="w-3 h-3 text-neon-green" />
                    : <TrendingDown className="w-3 h-3 text-neon-red" />
                  }
                  {category.upStocks}/{category.stockCount} up
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
