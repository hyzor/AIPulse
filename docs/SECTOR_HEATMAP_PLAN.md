# Sector Heatmap — Comprehensive Implementation Plan

> **Status:** 📋 Planned | **Priority:** Medium | **Effort:** Medium  
> **Last Updated:** May 2, 2026  
> **Target:** Add a visual treemap-style heatmap showing all 15 tracked stocks colored by performance, giving users an at-a-glance view of sector momentum.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Visual Design Specification](#2-visual-design-specification)
3. [User Experience Flow](#3-user-experience-flow)
4. [Technical Architecture](#4-technical-architecture)
5. [Component Specification](#5-component-specification)
6. [Data Flow & State Management](#6-data-flow--state-management)
7. [Integration Plan](#7-integration-plan)
8. [Responsive Behavior](#8-responsive-behavior)
9. [Color System](#9-color-system)
10. [Implementation Checklist](#10-implementation-checklist)
11. [Files to Create / Modify](#11-files-to-create--modify)
12. [Open Decisions](#12-open-decisions)
13. [Future Enhancements](#13-future-enhancements)

---

## 1. Overview

### What It Is
A treemap-style visual grid that displays all 15 tracked AI stocks grouped by category. Each stock is represented as a colored cell whose background color indicates its performance (green for positive, red for negative), with intensity mapped to the magnitude of the change.

### Why It Matters
- **Instant market story:** One glance tells users which sectors and stocks are hot or cold
- **Sector rotation insight:** Users can see if money is flowing into chips vs. software vs. tech giants
- **Visual differentiation:** Complements the existing list/grid views with a density-rich visualization
- **No API cost:** Uses only existing data; zero additional API calls

### Design Inspiration
- Finviz sector heatmap (simplified, dark-themed)
- TradingView market overview
- Yahoo Finance heatmap (compact variant)

### Constraints
- Must preserve existing dark theme (`bg-dark-900`, neon accent colors)
- Must work with existing `useTimeRange()` context (1D/7D/30D)
- Must be responsive down to 375px mobile width
- Must follow existing component patterns (TypeScript strict, no `any`)
- Must pass `npm run lint && npm run typecheck`

---

## 2. Visual Design Specification

### 2.1 Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  🔥 Sector Heatmap                          [Today ▼] [Layout ▼] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ⚡ AI Chips          (2 stocks, avg +1.11%)                     │
│  ┌──────────┐ ┌──────────┐                                      │
│  │          │ │          │                                      │
│  │   NVDA   │ │   AMD    │                                      │
│  │  +3.42%  │ │  -1.20%  │                                      │
│  │  $138.20 │ │  $98.50  │                                      │
│  │          │ │          │                                      │
│  └──────────┘ └──────────┘                                      │
│                                                                  │
│  🔵 Semiconductors    (6 stocks, avg +0.45%)                    │
│  ┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐  │
│  │  AVGO  ││  TSM   ││  ASML  ││  ARM   ││   MU   ││  SNDK  │  │
│  │ +0.85% ││ -2.10% ││ +1.50% ││ +4.30% ││ +0.20% ││ -0.50% │  │
│  │$225.00 ││$185.30 ││$890.00 ││$175.40 ││$98.20  ││$72.10  │  │
│  └────────┘└────────┘└────────┘└────────┘└────────┘└────────┘  │
│                                                                  │
│  🟢 AI Software       (4 stocks, avg +1.80%)                    │
│  ┌────────┐┌────────┐┌────────┐┌────────┐                      │
│  │  MSFT  ││ GOOGL  ││  META  ││  ORCL  │                      │
│  │ +1.20% ││ +0.90% ││ +3.10% ││ +1.00% │                      │
│  └────────┘└────────┘└────────┘└────────┘                      │
│                                                                  │
│  🚀 Tech Giants       (3 stocks, avg -0.30%)                    │
│  ┌────────┐┌────────┐┌────────┐                                │
│  │  AMZN  ││  AAPL  ││  TSLA  │                                │
│  │ -0.40% ││ +0.20% ││ -0.70% │                                │
│  └────────┘└────────┘└────────┘                                │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│  🔵 Semiconductors leading | 🔴 Tech Giants lagging             │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Section Header

```
┌──────────────────────────────────────────────────────────────┐
│ 🔥 Sector Heatmap                                    Controls │
│                                                               │
│ [Icon + Title]              [TimeRange ▼]  [View: Grid ▼]   │
└──────────────────────────────────────────────────────────────┘
```

- **Icon:** `Flame` from lucide-react (or `LayoutGrid` as fallback)
- **Title:** "Sector Heatmap"
- **Controls (right-aligned):**
  - Time range dropdown: `Today (Live)` / `Last 7 Days` / `Last 30 Days`
  - View mode toggle: `Grid` / `List` (optional — grid is primary)
- **Background:** `bg-dark-800` with `border-b border-dark-600`
- **Padding:** `p-4` mobile, `p-6` desktop

### 2.3 Category Row

Each category is a horizontal section:

```
┌─────────────────────────────────────────────────────────────────┐
│ ⚡ AI Chips                                    avg +1.11%      │
│ ─────────────────────────────────────────────────────────────  │
│ [cell] [cell] [cell] ...                                       │
└─────────────────────────────────────────────────────────────────┘
```

- **Category label:** Icon + name in category color, left-aligned
- **Category avg:** Right-aligned, colored green/red based on avg change
- **Divider:** `border-b border-dark-600/50` between category header and cells
- **Cell container:** `flex flex-wrap gap-2` (desktop), `grid grid-cols-2` (mobile)

### 2.4 Cell Design

Each stock cell:

```
┌────────────────┐
│                │  ← padding: p-3 mobile, p-4 desktop
│     NVDA       │  ← symbol: font-bold text-sm, centered
│    +3.42%      │  ← change%: text-lg font-bold, centered
│    $138.20     │  ← price: text-xs, centered, opacity-80
│                │
└────────────────┘
```

- **Border:** `rounded-lg` (no visible border, color itself defines shape)
- **Hover state:** `hover:scale-[1.02] hover:shadow-lg transition-transform`
- **Text color:** White for strong colors (|change| ≥ 1%), `text-gray-900` for very light shades (|change| < 1%)
- **Aspect ratio:** Approximately square on desktop (`aspect-square`), auto-height on mobile
- **Min width:** `min-w-[80px]` mobile, `min-w-[100px]` desktop

### 2.5 Footer Summary Bar

At the bottom of the heatmap, a compact summary:

```
┌─────────────────────────────────────────────────────────────────┐
│ 🔵 Semiconductors leading  |  🔴 Tech Giants lagging            │
│                                                                 │
│ Top mover: ARM +4.30%     Worst: TSM -2.10%                    │
└─────────────────────────────────────────────────────────────────┘
```

- **Leading/lagging:** Shows best and worst performing category
- **Top mover / worst:** Individual stock extremes
- **Style:** `text-xs text-gray-400`, `bg-dark-800/50`, `border-t border-dark-600`

---

## 3. User Experience Flow

### 3.1 Initial Load

1. User lands on dashboard
2. Heatmap renders immediately using available `stocks` data (1D view)
3. If data is loading, show skeleton cells (gray pulse placeholders)
4. Once data arrives, cells animate in with a subtle fade + scale (`animate-in fade-in duration-300`)

### 3.2 Time Range Change

1. User selects "Last 7 Days" from dropdown
2. Heatmap shows loading spinner overlay (or skeleton cells)
3. `useTimeRange()` fetches historical data
4. Once ready, cells recolor based on 7D historical change
5. Category averages update

### 3.3 Real-time Updates

1. WebSocket pushes new quote for NVDA
2. Cell for NVDA briefly flashes (e.g., `ring-2 ring-white/50`) for 500ms
3. Background color transitions smoothly to new performance tier
4. Category average recalculates

### 3.4 Interaction: Hover

1. User hovers over a cell
2. **Tooltip appears** (reuses existing tooltip system or custom):  
   - Company name (e.g., "NVIDIA Corporation")
   - Exact price with currency
   - Exact change % and $ change
   - Volume (if available)
   - Data freshness indicator ("Updated 2m ago")
3. Cell scales up slightly (`scale-[1.02]`)

### 3.5 Interaction: Click

1. User clicks a cell
2. Same behavior as StockCard click: opens `ExpandedChartModal`
3. Modal shows full chart, stats, and company info

---

## 4. Technical Architecture

### 4.1 Component Hierarchy

```
App.tsx
└── SectorHeatmap (NEW)
    ├── SectorHeatmapHeader
    │   ├── Title + Icon
    │   ├── TimeRangeDropdown (reuses logic, or inline)
    │   └── ViewModeToggle (optional)
    ├── CategoryRow (×4)
    │   ├── CategoryHeader
    │   │   ├── Icon + Name
    │   │   └── Average Performance
    │   └── StockCell (×N)
    │       ├── Symbol
    │       ├── Change%
    │       └── Price
    └── SummaryFooter
        ├── CategoryLeader/Lagger
        └── Top/Worst Performer
```

### 4.2 Data Sources

| View | Data Source | Transform |
|------|-------------|-----------|
| 1D (Today) | `stocks` prop (StockQuote Map) | `changePercent` directly |
| 7D | `historicalData[symbol]['7d'].candles` | `(last.close - first.open) / first.open * 100` |
| 30D | `historicalData[symbol]['30d'].candles` | Same as 7D |

**Note:** The 7D/30D calculation must match exactly what `CategoryPerformance` does to avoid confusing discrepancies.

### 4.3 Performance Considerations

- **Memoization:** Use `React.memo()` on `StockCell` to prevent re-renders of unchanged stocks
- **Category averages:** Memoize with `useMemo()` based on `stocks` + `timeRange`
- **Animation:** Use CSS transitions only (no JS animation libraries) to keep bundle size small
- **No recharts:** This component is pure DOM/CSS; no chart library needed

---

## 5. Component Specification

### 5.1 Main Component: `SectorHeatmap`

```typescript
// frontend/src/components/SectorHeatmap.tsx

import React, { useMemo, useState } from 'react';
import { Flame, LayoutGrid, List } from 'lucide-react';
import { useTimeRange } from '../contexts/TimeRangeContext';
import { STOCK_CATEGORIES, TRACKED_STOCKS } from '../types';

import type { StockQuote, TimeRange } from '../types';

interface SectorHeatmapProps {
  stocks: Map<string, StockQuote>;
  onStockClick?: (symbol: string) => void;
}

interface StockPerformance {
  symbol: string;
  changePercent: number;
  change: number;
  currentPrice: number;
  displayName: string;
}

interface CategoryPerformance {
  name: string;
  icon: React.ReactNode;
  color: string;
  stocks: StockPerformance[];
  avgChangePercent: number;
  avgChange: number;
  upCount: number;
  downCount: number;
}

type ViewMode = 'grid' | 'list';

export function SectorHeatmap({ stocks, onStockClick }: SectorHeatmapProps): React.ReactElement {
  const { timeRange, setTimeRange, historicalData, isLoading } = useTimeRange();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // Compute performance data for all stocks
  const performanceData = useMemo(() => {
    // ... see Section 6
  }, [stocks, timeRange, historicalData]);

  // Compute category stats
  const categoryData = useMemo(() => {
    // ... group by category, calculate averages
  }, [performanceData]);

  // Find extremes for summary footer
  const { topMover, worstPerformer, leadingCategory, laggingCategory } = useMemo(() => {
    // ...
  }, [categoryData]);

  return (
    <div className="bg-dark-800 rounded-xl border border-dark-600 overflow-hidden">
      {/* Header */}
      {/* Category Rows */}
      {/* Summary Footer */}
    </div>
  );
}
```

### 5.2 Sub-Components

#### `StockCell`

```typescript
interface StockCellProps {
  stock: StockPerformance;
  onClick?: (symbol: string) => void;
}

const StockCell = React.memo(function StockCell({ stock, onClick }: StockCellProps) {
  const colorClass = getHeatmapColor(stock.changePercent);
  const textColor = Math.abs(stock.changePercent) >= 1 ? 'text-white' : 'text-gray-900';

  return (
    <button
      onClick={() => onClick?.(stock.symbol)}
      className={`
        ${colorClass} ${textColor}
        relative rounded-lg p-3 md:p-4
        min-w-[80px] md:min-w-[100px]
        flex flex-col items-center justify-center
        hover:scale-[1.02] hover:shadow-lg
        transition-all duration-200
        focus:outline-none focus:ring-2 focus:ring-white/50
        cursor-pointer
      `}
      title={`${stock.displayName}: ${stock.changePercent >= 0 ? '+' : ''}${stock.changePercent.toFixed(2)}% (${stock.change >= 0 ? '+' : ''}$${stock.change.toFixed(2)})`}
    >
      <span className="font-bold text-sm">{stock.symbol}</span>
      <span className="text-lg font-bold">
        {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
      </span>
      <span className="text-xs opacity-80">
        ${stock.currentPrice.toFixed(2)}
      </span>
    </button>
  );
});
```

#### `CategoryRow`

```typescript
interface CategoryRowProps {
  category: CategoryPerformance;
  viewMode: ViewMode;
  onStockClick?: (symbol: string) => void;
}

function CategoryRow({ category, viewMode, onStockClick }: CategoryRowProps) {
  return (
    <div className="py-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <span className={category.color}>{category.icon}</span>
          <span className="text-sm font-medium text-white">{category.name}</span>
          <span className="text-xs text-gray-500">({category.stocks.length})</span>
        </div>
        <span className={`text-sm font-bold ${category.avgChangePercent >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>
          avg {category.avgChangePercent >= 0 ? '+' : ''}{category.avgChangePercent.toFixed(2)}%
        </span>
      </div>

      {/* Cells */}
      <div className={viewMode === 'grid'
        ? 'flex flex-wrap gap-2'
        : 'flex flex-col gap-1'
      }>
        {category.stocks.map((stock) => (
          <StockCell
            key={stock.symbol}
            stock={stock}
            onClick={onStockClick}
          />
        ))}
      </div>
    </div>
  );
}
```

---

## 6. Data Flow & State Management

### 6.1 Performance Calculation

```typescript
// Pseudo-code for the core calculation

function calculateStockPerformance(
  symbol: string,
  timeRange: TimeRange,
  stocks: Map<string, StockQuote>,
  historicalData: HistoricalDataCache
): StockPerformance | null {
  if (timeRange === '1d') {
    const quote = stocks.get(symbol);
    if (!quote) return null;
    return {
      symbol,
      changePercent: quote.changePercent,
      change: quote.change,
      currentPrice: quote.currentPrice,
      displayName: STOCK_DISPLAY_NAMES[symbol] || symbol,
    };
  }

  // 7D or 30D
  const data = historicalData[symbol]?.[timeRange]?.candles;
  if (!data || data.length < 2) return null;

  const first = data[0];
  const last = data[data.length - 1];
  const change = last.c - first.o;
  const changePercent = (change / first.o) * 100;

  // Approximate current price from change (same as CategoryPerformance)
  const currentPrice = changePercent !== 0
    ? Math.abs(change / (changePercent / 100))
    : first.o;

  return {
    symbol,
    changePercent,
    change,
    currentPrice,
    displayName: STOCK_DISPLAY_NAMES[symbol] || symbol,
  };
}
```

### 6.2 Category Average

Must match `CategoryPerformance` exactly:

```typescript
function calculateCategoryAverage(stocks: StockPerformance[]) {
  let totalChange = 0;
  let totalCurrentPrice = 0;
  let count = 0;

  for (const stock of stocks) {
    totalChange += stock.change;
    totalCurrentPrice += stock.currentPrice;
    count++;
  }

  const avgChange = count > 0 ? totalChange / count : 0;
  const avgChangePercent = count > 0 && totalCurrentPrice > 0
    ? (totalChange / totalCurrentPrice) * 100
    : 0;

  return { avgChange, avgChangePercent, upCount, downCount };
}
```

---

## 7. Integration Plan

### 7.1 Placement in App.tsx

The heatmap should be placed as a **full-width section** between the overview StockGrid and the individual category sections.

```tsx
// In App.tsx, inside the main content area:

<main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  <div className="flex flex-col lg:flex-row gap-6 items-start">
    <div className="flex-1 min-w-0 order-last lg:order-first">
      
      {/* 1. Overview StockGrid (existing) */}
      <section className="mb-8">
        <StockGrid ... />
      </section>

      {/* 2. NEW: Sector Heatmap */}
      <section className="mb-12">
        <SectorHeatmap stocks={mergedStocks} onStockClick={handleStockClick} />
      </section>

      {/* 3. Individual Category Sections (existing) */}
      {Object.entries(STOCK_CATEGORIES).map(([category, symbols]) => (
        <section key={category} className="mb-12">...</section>
      ))}

      {/* ... rest of page */}
    </div>

    {/* Sidebar (existing) */}
    <div className="w-full lg:w-72 ...">
      <EarningsCalendar ... />
      <CategoryPerformance ... />
      <TopPerformers ... />
    </div>
  </div>
</main>
```

### 7.2 Interaction with Existing Components

| Existing Component | Relationship |
|--------------------|--------------|
| `StockGrid` | Heatmap is above it; both can trigger `ExpandedChartModal` |
| `CategoryPerformance` | Heatmap shares time range context; averages should match |
| `ExpandedChartModal` | Heatmap cells open the same modal on click |
| `useTimeRange()` | Heatmap consumes `timeRange`, `historicalData`, `isLoading` |
| `useWebSocket()` | Heatmap cells should flash on real-time quote updates |

### 7.3 Prop Drilling

The `onStockClick` handler from `App.tsx` should be passed to `SectorHeatmap`:

```tsx
// App.tsx
<SectorHeatmap
  stocks={mergedStocks}
  onStockClick={handleStockClick}
/>
```

---

## 8. Responsive Behavior

### 8.1 Breakpoints

| Breakpoint | Category Layout | Cell Size | Columns per Category |
|------------|-----------------|-----------|----------------------|
| ≥ 1280px (xl) | Horizontal flex | 120×120px | Auto-fit |
| ≥ 1024px (lg) | Horizontal flex | 100×100px | Auto-fit |
| ≥ 768px (md) | Horizontal flex | 90×90px | 4-6 per row |
| ≥ 640px (sm) | Horizontal flex | 80×80px | 3-4 per row |
| < 640px (xs) | Grid | 80px min | 2 columns |

### 8.2 Mobile Adaptations

- **Header:** Stack title above controls (flex-col on mobile)
- **Category avg:** Hide on very small screens, or show as a small badge
- **Cell text:** Smaller font sizes (`text-xs` for symbol, `text-sm` for change%)
- **Price:** Optionally hide on mobile to reduce clutter (show in tooltip only)
- **Summary footer:** Stack vertically instead of horizontal

### 8.3 CSS Strategy

```css
/* Category cell container */
.cells-container {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

/* Mobile: force 2-column grid for better density */
@media (max-width: 639px) {
  .cells-container {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }
}
```

---

## 9. Color System

### 9.1 8-Tier Performance Scale

| Tier | Change % | Background Class | Text Class | Use Case |
|------|----------|------------------|------------|----------|
| Strong Up | ≥ +5.00% | `bg-emerald-500/90` | `text-white` | Exceptional gain |
| Up | +3.00% to +4.99% | `bg-emerald-400/80` | `text-white` | Strong gain |
| Mod Up | +1.00% to +2.99% | `bg-emerald-300/60` | `text-white` | Moderate gain |
| Slight Up | 0.00% to +0.99% | `bg-emerald-200/40` | `text-gray-900` | Small gain |
| Slight Down | -0.99% to 0.00% | `bg-red-200/40` | `text-gray-900` | Small loss |
| Mod Down | -2.99% to -1.00% | `bg-red-300/60` | `text-white` | Moderate loss |
| Down | -4.99% to -3.00% | `bg-red-400/80` | `text-white` | Strong loss |
| Strong Down | ≤ -5.00% | `bg-red-500/90` | `text-white` | Exceptional loss |

### 9.2 Color Helper Function

```typescript
function getHeatmapColor(percent: number): string {
  if (percent >= 5) return 'bg-emerald-500/90';
  if (percent >= 3) return 'bg-emerald-400/80';
  if (percent >= 1) return 'bg-emerald-300/60';
  if (percent >= 0) return 'bg-emerald-200/40';
  if (percent >= -1) return 'bg-red-200/40';
  if (percent >= -3) return 'bg-red-300/60';
  if (percent >= -5) return 'bg-red-400/80';
  return 'bg-red-500/90';
}

function getTextColor(percent: number): string {
  return Math.abs(percent) >= 1 ? 'text-white' : 'text-gray-900';
}
```

### 9.3 Theme Consistency

- **Emerald** for positive (aligns with `text-neon-green` used elsewhere)
- **Red** for negative (aligns with `text-neon-red` used elsewhere)
- **Opacity** used instead of lighter hex codes to blend with dark background
- **No neon glow** on cells (would be visually overwhelming with 15 cells)

---

## 10. Implementation Checklist

### Phase 1: Core Component (Priority)
- [ ] Create `frontend/src/components/SectorHeatmap.tsx`
- [ ] Implement `getHeatmapColor()` and `getTextColor()` helpers
- [ ] Implement `StockCell` sub-component with `React.memo()`
- [ ] Implement `CategoryRow` sub-component
- [ ] Implement performance calculation logic (1D/7D/30D)
- [ ] Implement category average calculation
- [ ] Add header with title and time range dropdown
- [ ] Add summary footer with extremes
- [ ] Integrate into `App.tsx`
- [ ] Pass `onStockClick` handler from `App.tsx`

### Phase 2: Interactions (Priority)
- [ ] Hover tooltip with detailed info
- [ ] Click to open `ExpandedChartModal`
- [ ] WebSocket flash animation on quote update
- [ ] Loading skeleton state

### Phase 3: Polish (Nice to Have)
- [ ] Cell entrance animation (staggered fade-in)
- [ ] Category average animation on update
- [ ] View mode toggle (grid ↔ list)
- [ ] Legend/explanation of color scale

### Phase 4: Testing & QA
- [ ] Run `npm run lint` — 0 errors
- [ ] Run `npm run typecheck` — passes
- [ ] Test on mobile (375px width)
- [ ] Test time range switching (1D → 7D → 30D)
- [ ] Verify category averages match `CategoryPerformance`
- [ ] Verify click opens correct chart modal
- [ ] Test with missing data (some stocks null)
- [ ] Test WebSocket real-time update flash

---

## 11. Files to Create / Modify

### Create

| File | Description |
|------|-------------|
| `frontend/src/components/SectorHeatmap.tsx` | Main heatmap component |
| `frontend/src/components/heatmap/StockCell.tsx` | Individual stock cell (optional extraction) |
| `frontend/src/components/heatmap/CategoryRow.tsx` | Category row wrapper (optional extraction) |
| `frontend/src/utils/heatmapColors.ts` | Color helper functions (optional, can be inline) |

### Modify

| File | Changes |
|------|---------|
| `frontend/src/App.tsx` | Import `SectorHeatmap`, add `<section>` placement, pass `onStockClick` |

### No Changes Needed

- `backend/` — No API changes required
- `frontend/src/types/index.ts` — No new types needed (uses existing)
- `frontend/src/contexts/TimeRangeContext.tsx` — Already provides what's needed
- `frontend/src/components/CategoryPerformance.tsx` — Reference only, do not modify

---

## 12. Open Decisions

### Decision 1: Sidebar vs. Full-Width Placement

**Option A: Full-width section (RECOMMENDED)**
- Pros: Maximum visual impact, easier to read all 15 stocks at once
- Cons: Takes vertical space, pushes category grids down

**Option B: Sidebar replacement/toggle**
- Pros: Saves vertical space, keeps focus on StockGrid
- Cons: Too cramped for 15 stocks, poor mobile experience

**Option C: Collapsible section**
- Pros: User can hide when not needed
- Cons: Extra complexity, hidden by default loses impact

**Current Recommendation:** Option A — place as a full-width section between overview StockGrid and individual category sections.

### Decision 2: Time Range Sync Strategy

**Option A: Independent dropdown in heatmap header (RECOMMENDED)**
- Pros: Self-contained, clear what data the heatmap shows
- Cons: Two time range controls on page (heatmap + CategoryPerformance)

**Option B: Sync with `useTimeRange()` global context**
- Pros: Single source of truth, consistent across components
- Cons: Less flexible if user wants different views

**Current Recommendation:** Option A with an optional sync flag. The heatmap can have its own local state for time range that defaults to the global context value.

### Decision 3: Cell Content on Mobile

**Option A: Symbol + Change% + Price (RECOMMENDED)**
- Pros: Complete info at a glance
- Cons: Slightly cramped on 375px screens

**Option B: Symbol + Change% only**
- Pros: Cleaner, more readable
- Cons: Less information density

**Option C: Symbol only, color shows direction**
- Pros: Maximum density
- Cons: Users must tap to see any numbers

**Current Recommendation:** Option A with smaller font sizes on mobile. If overcrowding occurs, fallback to Option B.

### Decision 4: View Mode Toggle

**Option A: Grid only (no toggle)**
- Pros: Simpler code, less UI clutter
- Cons: Less flexible

**Option B: Grid + List toggle**
- Pros: List mode might be better for screen readers or dense data
- Cons: Extra complexity, list mode may not add much value

**Current Recommendation:** Option A for MVP. Add toggle later if requested.

---

## 13. Future Enhancements

### Short Term (Post-MVP)
1. **Market cap weighted cells** — Larger companies get proportionally larger cells (true treemap)
2. **Volume intensity overlay** — Border thickness or opacity indicates relative volume
3. **After-hours coloring** — Different color palette for pre/post market (if data available)

### Medium Term
4. **Custom watchlist heatmap** — Allow users to define their own groupings
5. **Historical heatmap replay** — Animate through past trading days
6. **Correlation clustering** — Group stocks by price movement similarity, not just category

### Long Term
7. **Full treemap algorithm** — True area-proportional treemap with squarified algorithm
8. **Sector drill-down** — Click category to expand and see sub-sectors
9. **Comparative heatmap** — Side-by-side heatmaps for two different time ranges

---

## Appendix A: Reference Implementations

### CategoryPerformance Logic (for consistency)
See `frontend/src/components/CategoryPerformance.tsx` lines 168–233 for:
- How to calculate 7D/30D changes from `historicalData`
- How to compute category averages
- How to handle missing data

### TimeRange Context Usage
See `frontend/src/components/CategoryPerformance.tsx` lines 117–166 for:
- How to consume `useTimeRange()`
- How to fetch historical data on time range change
- How to map `historicalData` to change values

### Existing Color Tokens
From the codebase:
- `text-neon-green` → positive
- `text-neon-red` → negative
- `text-neon-blue` → Semiconductors category
- `text-neon-purple` → AI Chips category
- `text-orange-400` → Tech Giants category

---

## Appendix B: Mock Data for Development

If API is unavailable during development, use this mock structure:

```typescript
const MOCK_PERFORMANCE: StockPerformance[] = [
  { symbol: 'NVDA', changePercent: 3.42, change: 4.56, currentPrice: 138.20, displayName: 'NVIDIA' },
  { symbol: 'AMD', changePercent: -1.20, change: -1.18, currentPrice: 98.50, displayName: 'AMD' },
  { symbol: 'AVGO', changePercent: 0.85, change: 1.91, currentPrice: 225.00, displayName: 'Broadcom' },
  { symbol: 'TSM', changePercent: -2.10, change: -3.89, currentPrice: 185.30, displayName: 'TSMC' },
  { symbol: 'ASML', changePercent: 1.50, change: 13.35, currentPrice: 890.00, displayName: 'ASML' },
  { symbol: 'ARM', changePercent: 4.30, change: 6.98, currentPrice: 175.40, displayName: 'ARM Holdings' },
  { symbol: 'MU', changePercent: 0.20, change: 0.19, currentPrice: 98.20, displayName: 'Micron' },
  { symbol: 'SNDK', changePercent: -0.50, change: -0.36, currentPrice: 72.10, displayName: 'SanDisk' },
  { symbol: 'MSFT', changePercent: 1.20, change: 4.68, currentPrice: 395.00, displayName: 'Microsoft' },
  { symbol: 'GOOGL', changePercent: 0.90, change: 1.62, currentPrice: 180.50, displayName: 'Alphabet' },
  { symbol: 'META', changePercent: 3.10, change: 15.23, currentPrice: 506.00, displayName: 'Meta' },
  { symbol: 'ORCL', changePercent: 1.00, change: 1.52, currentPrice: 152.00, displayName: 'Oracle' },
  { symbol: 'AMZN', changePercent: -0.40, change: -0.78, currentPrice: 195.00, displayName: 'Amazon' },
  { symbol: 'AAPL', changePercent: 0.20, change: 0.46, currentPrice: 232.00, displayName: 'Apple' },
  { symbol: 'TSLA', changePercent: -0.70, change: -1.78, currentPrice: 252.00, displayName: 'Tesla' },
];
```

---

*Document maintained in `docs/SECTOR_HEATMAP_PLAN.md`. Update this file when decisions are made or scope changes.*
