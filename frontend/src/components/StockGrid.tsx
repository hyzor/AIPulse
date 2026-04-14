import { useEffect } from 'react';

import { StockCard } from './StockCard';
import { useTimeRange } from '../contexts/TimeRangeContext';

import type { StockQuote } from '../types';

interface StockGridProps {
  quotes: StockQuote[];
  realtimeQuotes: Map<string, StockQuote>;
  onStockClick: (_symbol: string) => void;
}

export function StockGrid({ quotes, realtimeQuotes, onStockClick }: StockGridProps) {
  const { fetchAllHistory, timeRange } = useTimeRange();

  // Get symbols from the quotes prop (respects category filtering)
  const symbols = quotes.map((q) => q.symbol);

  // Fetch historical data when time range changes
  useEffect(() => {
    if (symbols.length > 0) {
      fetchAllHistory(symbols);
    }
  }, [timeRange, fetchAllHistory, symbols.join(',')]);

  // Create a map for quick lookup
  const quotesMap = new Map(quotes.map((q) => [q.symbol, q]));

  // Merge with real-time updates (only for symbols in this grid)
  const mergedQuotes = symbols.map((symbol) => {
    const realtime = realtimeQuotes.get(symbol);
    const base = quotesMap.get(symbol);
    return realtime || base || {
      symbol,
      currentPrice: 0,
      change: 0,
      changePercent: 0,
      highPrice: 0,
      lowPrice: 0,
      openPrice: 0,
      previousClose: 0,
      timestamp: Math.floor(Date.now() / 1000), // Unix timestamp in seconds
    };
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {mergedQuotes.map((quote) => (
        <StockCard
          key={quote.symbol}
          quote={quote}
          isRealtime={realtimeQuotes.has(quote.symbol)}
          onClick={() => { onStockClick(quote.symbol); }}
        />
      ))}
    </div>
  );
}
