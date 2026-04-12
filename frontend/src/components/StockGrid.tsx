import { useEffect } from 'react';
import { StockQuote, TRACKED_STOCKS } from '../types';
import { useTimeRange } from '../contexts/TimeRangeContext';
import { StockCard } from './StockCard';

interface StockGridProps {
  quotes: StockQuote[];
  realtimeQuotes: Map<string, StockQuote>;
  onStockClick: (symbol: string) => void;
}

export function StockGrid({ quotes, realtimeQuotes, onStockClick }: StockGridProps) {
  const { fetchAllHistory, timeRange } = useTimeRange();

  // Fetch historical data when time range changes
  useEffect(() => {
    fetchAllHistory([...TRACKED_STOCKS]);
  }, [timeRange, fetchAllHistory]);

  // Create a map for quick lookup
  const quotesMap = new Map(quotes.map(q => [q.symbol, q]));
  
  // Merge with real-time updates
  const mergedQuotes = [...TRACKED_STOCKS].map(symbol => {
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
      timestamp: Date.now(),
    };
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {mergedQuotes.map((quote) => (
        <StockCard
          key={quote.symbol}
          quote={quote}
          isRealtime={realtimeQuotes.has(quote.symbol)}
          onClick={() => onStockClick(quote.symbol)}
        />
      ))}
    </div>
  );
}
