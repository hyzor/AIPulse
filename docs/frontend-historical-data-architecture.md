# Frontend Historical Data Architecture

**Status:** Approved - Ready for Implementation  
**Date:** 2026-04-12  
**Default View:** 7 days (7D) at 1-hour resolution  

---

## Overview

This document describes the frontend architecture for displaying historical stock data on the AIPulse landing page using Recharts AreaCharts.

**Goal:** Provide users with an instant visual overview of the entire AI market health through interactive mini charts.

---

## Time Range Configuration

### Supported Ranges

| Time Range | Resolution | Data Points | Auto-Refresh | Use Case |
|------------|-----------|-------------|--------------|----------|
| **1D** (1 day) | 1h | ~24 points | ✅ Every 60s | Day trading, intraday moves |
| **7D** (7 days) ⭐ Default | 1h | ~168 points | ❌ | Weekly trend, market overview |
| **30D** (30 days) | 1d | ~30 points | ❌ | Monthly performance, long-term view |

### Why These Resolutions?

- **1D:** Hourly gives good intraday trend without noise (1m would be 1,440 points - too dense)
- **7D:** Hourly still manageable for 7 days (168 points), shows weekly patterns
- **30D:** Daily = clean trend line, not too many points (30 candles)

**Never use 1m resolution** - causes Recharts performance issues and unreadable charts.

---

## API Integration

### Endpoint

```
GET /api/stocks/{symbol}/history?range={range}&resolution={resolution}
```

### Examples

```bash
# 1 day view (intraday)
/api/stocks/NVDA/history?range=1d&resolution=1h

# 7 day view (default)
/api/stocks/NVDA/history?range=7d&resolution=1h

# 30 day view (monthly)
/api/stocks/NVDA/history?range=30d&resolution=1d
```

### Fetch Strategy

```typescript
// Fetch all 12 symbols in parallel
const symbols = ['NVDA', 'AMD', 'AVGO', 'MRVL', 'TSM', 'ASML', 'ARM', 'PLTR', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'];

const promises = symbols.map(symbol => 
  stockService.getHistory(symbol, timeRange, resolution)
);

// Promise.allSettled - wait for all, handle individual failures
const results = await Promise.allSettled(promises);
```

**Why Promise.allSettled:**
- One symbol failing doesn't block others
- User sees partial data immediately
- Failed cards show retry button

---

## State Management

### Global State (React Context)

```typescript
interface MarketState {
  // Global time range (controlled by top toggle)
  timeRange: '1d' | '7d' | '30d';
  
  // Historical data for all symbols
  historicalData: {
    [symbol: string]: {
      [range: string]: {
        candles: CandleData[];
        loading: boolean;
        error: string | null;
        lastUpdated: number; // timestamp
        isLive: boolean; // true when 1D with auto-refresh
      };
    };
  };
  
  // Modal state
  selectedSymbol: string | null;
  isModalOpen: boolean;
}
```

### Context Provides

- `timeRange`: current view ('7d' by default)
- `setTimeRange`: change view (re-fetches all)
- `getSymbolData(symbol, range)`: returns cached data
- `refreshData()`: manual refresh

---

## Component Architecture

### Component Hierarchy

```
App
├── TimeRangeProvider (Context)
│   ├── timeRange: '7d'
│   ├── setTimeRange: (range) => void
│   └── refreshData: () => void
│
├── Header
│   ├── Logo + Title
│   └── TimeRangeToggle [1D] [7D] [30D]
│
├── StockGrid (responsive columns)
│   └── StockCard × 12
│       ├── PriceHeader (current price, change %)
│       ├── MiniAreaChart (80px height, Recharts)
│       ├── CategoryBadge (AI Chips, etc.)
│       └── Click handler → open modal
│
└── ExpandedChartModal (conditional)
    ├── ModalOverlay
    ├── ChartContainer (400-500px height)
    │   └── AreaChart (same data, bigger view)
    ├── StatsPanel (high, low, volume, change)
    └── CloseButton
```

### StockCard Layout

```
┌──────────────────────────────┐
│  NVDA              ▲ +2.4%    │  ← Symbol + Change
│  $150.50                     │  ← Current Price
│                              │
│  ┌────────────────────────┐ │
│  │                        │ │
│  │    AreaChart           │ │  ← 80px height
│  │    (sparkline)         │ │
│  │                        │ │
│  └────────────────────────┘ │
│  AI Chips                    │  ← Category
└──────────────────────────────┘
```

### ExpandedChartModal Layout

```
┌───────────────────────────────────────────────────┐
│  NVDA                                    [X]      │
│  NVIDIA Corporation                               │
│  $150.50 USD      ▲ +2.4%                        │
├───────────────────────────────────────────────────┤
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │                                             │ │
│  │         AreaChart (full size)               │ │  ← 400-500px
│  │                                             │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  ┌──────────┬──────────┬──────────┬──────────┐ │
│  │ High     │ Low      │ Volume   │ Change  │ │
│  │ $152.34  │ $148.90  │ 45.2M    │ +2.4%   │ │
│  └──────────┴──────────┴──────────┴──────────┘ │
└───────────────────────────────────────────────────┘
```

---

## Recharts Configuration

### AreaChart Specs

```typescript
<AreaChart 
  width={400} 
  height={80} 
  data={candles}
  margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
>
  {/* No axis labels for mini chart */}
  <XAxis dataKey="t" hide />
  <YAxis domain={['auto', 'auto']} hide />
  
  {/* Gradient fill */}
  <defs>
    <linearGradient id={`gradient-${symbol}`} x1="0" y1="0" x2="0" y2="1">
      <stop 
        offset="5%" 
        stopColor={isUp ? '#22d3ee' : '#f43f5e'} 
        stopOpacity={0.3}
      />
      <stop 
        offset="95%" 
        stopColor={isUp ? '#22d3ee' : '#f43f5e'} 
        stopOpacity={0}
      />
    </linearGradient>
  </defs>
  
  <Area 
    type="monotone" 
    dataKey="c"  // close price
    stroke={isUp ? '#22d3ee' : '#f43f5e'}
    fill={`url(#gradient-${symbol})`}
    strokeWidth={2}
    isAnimationActive={true}
    animationDuration={1000}
  />
  
  <Tooltip 
    content={({ payload }) => (
      <div className="bg-dark-800 p-2 rounded border border-neon-blue">
        <div className="text-white font-bold">
          ${payload?.[0]?.value?.toFixed(2)}
        </div>
        <div className="text-xs text-gray-400">
          {formatTime(payload?.[0]?.payload?.t)}
        </div>
      </div>
    )}
  />
</AreaChart>
```

### Color Logic

```typescript
// Determine trend direction
const firstCandle = candles[0];
const lastCandle = candles[candles.length - 1];
const isUp = lastCandle.c >= firstCandle.o;

// Colors
const strokeColor = isUp ? '#22d3ee' : '#f43f5e';  // neon-blue or neon-red
```

---

## Auto-Refresh Behavior

### When to Auto-Refresh

```typescript
useEffect(() => {
  if (timeRange === '1d') {
    // Only 1D view auto-refreshes
    const interval = setInterval(() => {
      // Fetch latest data
      fetchHistory(symbol, '1d', '1h');
      
      // Also update via WebSocket if connected
      // WebSocket provides real-time price updates
    }, 60000); // Every 60 seconds
    
    return () => clearInterval(interval);
  }
  // 7D and 30D don't auto-refresh (data changes slowly)
}, [timeRange, symbol]);
```

### Visual Indicator

When viewing 1D with auto-refresh active:

```
┌──────────────────────────┐
│  NVDA          ▲ 2.4%    │
│  $150.50      ● LIVE     │  ← Green pulsing dot
│                          │
│  ┌──────────────────┐   │
│  │ AreaChart        │   │
│  └──────────────────┘   │
└──────────────────────────┘
```

**LIVE indicator CSS:**
```css
.live-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #22c55e;
  font-size: 0.75rem;
  font-weight: 600;
}

.live-dot {
  width: 8px;
  height: 8px;
  background: #22c55e;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

---

## Responsive Design

### Breakpoints

| Screen Width | Columns | Card Width | Mini Chart Height | Modal Chart Height |
|-------------|---------|-----------|------------------|-------------------|
| ≥1280px | 3 | ~380px | 80px | 450px |
| 1024-1279px | 3 | ~320px | 80px | 450px |
| 768-1023px | 2 | ~360px | 80px | 400px |
| <768px | 1 | 100% | 100px | 300px |

### Grid Layout (Tailwind)

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {stocks.map(stock => (
    <StockCard key={stock.symbol} data={stock} />
  ))}
</div>
```

---

## Loading & Error States

### Loading State

```
┌──────────────────────────┐
│  ████████░░░░ $150.50    │  ← Shimmer on price
│                          │
│  ┌──────────────────┐   │
│  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │   │  ← Shimmer skeleton
│  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │   │    for chart area
│  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │   │
│  └──────────────────┘   │
└──────────────────────────┘
```

### Error State

```
┌──────────────────────────┐
│  NVDA          ▲ 2.4%    │
│  $150.50                 │
│                          │
│  ┌──────────────────┐   │
│  │     ⚠️           │   │
│  │  Chart failed   │   │
│  │  [Retry]        │   │
│  └──────────────────┘   │
└──────────────────────────┘
```

---

## File Structure

```
frontend/src/
├── components/
│   ├── StockCard.tsx              # Modified existing
│   ├── StockGrid.tsx              # New - grid container
│   ├── MiniAreaChart.tsx          # New - Recharts wrapper
│   ├── ExpandedChartModal.tsx     # New - full chart modal
│   ├── TimeRangeToggle.tsx        # New - [1D] [7D] [30D]
│   ├── StatsPanel.tsx             # New - high/low/volume
│   └── LoadingSkeleton.tsx        # New - shimmer effect
│
├── contexts/
│   └── TimeRangeContext.tsx       # New - global state
│
├── services/
│   └── stockService.ts            # Add getHistory() method
│
├── hooks/
│   ├── useHistoricalData.ts       # New - fetch + cache
│   ├── useAutoRefresh.ts          # New - 1D refresh logic
│   └── useChartData.ts            # New - process candles
│
├── utils/
│   └── chartHelpers.ts            # New - formatters, colors
│
└── types/
    └── index.ts                   # Add CandleData, HistoryResponse
```

---

## Performance Optimizations

### 1. Debounce Time Range Changes

```typescript
const debouncedSetTimeRange = useDebounce((range) => {
  setTimeRange(range);
  fetchAllHistory(range);
}, 300);
```

### 2. Memoize Chart Data

```typescript
const chartData = useMemo(() => {
  return candles.map(c => ({
    t: c.t,
    c: c.c,
    formattedTime: formatTime(c.t),
  }));
}, [candles]);
```

### 3. Lazy Load Off-Screen (Future)

```typescript
// Only render charts visible in viewport
const [isVisible, setIsVisible] = useState(false);

useEffect(() => {
  const observer = new IntersectionObserver(([entry]) => {
    setIsVisible(entry.isIntersecting);
  });
  observer.observe(ref.current);
  return () => observer.disconnect();
}, []);

return isVisible ? <AreaChart ... /> : <Skeleton />;
```

---

## Styling Guide

### Colors

| Element | Light Mode | Dark Mode (Current) |
|---------|-----------|-------------------|
| Up trend stroke | `#0891b2` | `#22d3ee` (neon-blue) |
| Down trend stroke | `#e11d48` | `#f43f5e` (neon-red) |
| Gradient start | 30% opacity | 30% opacity |
| Gradient end | 0% opacity | 0% opacity |
| Card background | `white` | `#1f2937` (dark-800) |
| Card border | `#e5e7eb` | `#374151` (dark-700) |
| Text primary | `#111827` | `white` |
| Text secondary | `#6b7280` | `#9ca3af` (gray-400) |

### Tailwind Classes

```typescript
// StockCard container
"bg-dark-800 rounded-xl border border-dark-700 p-4 
 hover:border-neon-blue/50 transition-colors cursor-pointer"

// Price up
"text-neon-blue font-bold"

// Price down  
"text-neon-red font-bold"

// Category badge
"text-xs px-2 py-1 rounded bg-dark-700 text-gray-400"

// LIVE indicator
"flex items-center gap-1.5 text-xs font-semibold text-green-500"
```

---

## User Flow

### First Visit

1. Page loads
2. Shows current stock prices (existing /api/stocks)
3. Starts fetching 7D historical data for all 12 symbols
4. Shows skeleton shimmer on chart areas
5. As data arrives, charts fade in
6. Default view: 7D trend overview

### Switching Time Range

1. User clicks [1D] or [30D] toggle
2. All charts show loading state
3. New data fetched for selected range
4. Charts update with smooth animation
5. If 1D selected, "● LIVE" indicator appears

### Clicking a Stock

1. User clicks NVDA card
2. ExpandedChartModal opens
3. Shows same 7D data (or whatever is selected)
4. Larger chart, full stats panel
5. Can close via X button or click outside

### Real-Time Updates (1D View)

1. User viewing 1D
2. Every 60s, charts refresh
3. New candle added (if minute rolled over)
4. Last candle updates (current minute)
5. "● LIVE" dot pulses

---

## API Response Format

```typescript
// GET /api/stocks/NVDA/history?range=7d&resolution=1h
interface HistoryResponse {
  symbol: "NVDA";
  resolution: "1h";
  from: "2026-04-05T00:00:00Z";
  to: "2026-04-12T00:00:00Z";
  candles: CandleData[];
  cached: true;
  partial: false;
}

interface CandleData {
  t: number;  // Unix timestamp in milliseconds
  o: number;  // Open price
  h: number;  // High price
  l: number;  // Low price
  c: number;  // Close price
  v: number;  // Volume
}
```

---

## Future Enhancements (v2)

Not in current scope, but consider for later:

- [ ] **Comparison mode:** Select 2-3 stocks, overlay charts
- [ ] **Technical indicators:** Moving averages, RSI, MACD
- [ ] **Volume chart:** Bar chart below price chart
- [ ] **Custom range:** Date picker for arbitrary ranges
- [ ] **Export:** Download chart as PNG or data as CSV
- [ ] **Annotations:** Click to add notes on chart
- [ ] **Fullscreen:** Expand modal to true fullscreen

---

## Implementation Checklist

### Phase 1: Core (MVP)

- [ ] Install Recharts dependency
- [ ] Create TimeRangeContext
- [ ] Create TimeRangeToggle component
- [ ] Create MiniAreaChart component
- [ ] Modify StockCard to include chart area
- [ ] Create StockGrid layout
- [ ] Add getHistory() to stockService
- [ ] Fetch 7D/1h for all symbols on load
- [ ] Loading skeletons

### Phase 2: Modal

- [ ] Create ExpandedChartModal component
- [ ] Add click handler to StockCard
- [ ] Stats panel (high, low, volume)
- [ ] Close button + click outside

### Phase 3: Polish

- [ ] Error states + retry
- [ ] 1D auto-refresh with LIVE indicator
- [ ] Smooth animations (fade in charts)
- [ ] Mobile responsive
- [ ] Hover effects on cards

---

## Key Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Default range** | 7D | Balanced view, good for market overview |
| **Chart library** | Recharts | Pure React, works with dark theme, responsive |
| **Fetch strategy** | Parallel + allSettled | Fast, resilient to individual failures |
| **Grid layout** | 2-3 columns | Shows all 12 without scrolling too much |
| **Card interaction** | Click → Modal | Clear intent, full details available |
| **Auto-refresh** | 1D only | Intraday needs live updates, weekly doesn't |
| **Resolution 1D** | 1h | 24 points, readable |
| **Resolution 7D** | 1h | 168 points, still performant |
| **Resolution 30D** | 1d | 30 points, clean trend |

---

**Architecture complete and ready for implementation!** 🎉
