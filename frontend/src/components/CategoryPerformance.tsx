import { TrendingUp, TrendingDown, Zap, Cpu, Code2, Rocket } from 'lucide-react';

import type { StockQuote } from '../types';
import { STOCK_CATEGORIES } from '../types';

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
        <h3 className="text-sm font-medium text-gray-400 mb-3">Category Performance</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {categoryStats.map((category) => (
            <div
              key={category.name}
              className="bg-dark-700 rounded-lg border border-dark-600 p-3 hover:border-dark-500 transition-colors"
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
