# AIPulse - Agent Instructions

This document provides comprehensive technical context for AI agents working on the AIPulse project. For user-facing documentation, see `README.md`.

---

## Agent's Role

When working on this codebase:
1. **Preserve the dark theme UI** - Always use Tailwind classes like `bg-dark-900`, `text-white`, `neon-blue/green/red`
2. **Respect rate limits** - Any new API calls must go through the rate limiter
3. **Cache aggressively** - Check cache before external API calls
4. **Maintain type safety** - Use strict TypeScript, no `any` types
5. **Follow existing patterns** - Look at how similar features are implemented

---

## System Architecture

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIENT (Browser)                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │   Header     │  │  StatusBar   │  │  StockCard   │  │    App     │  │
│  │  (UI/Stats)  │  │ (Rate Limit) │  │ (Display)    │  │ (State)    │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘  │
│         │                 │                 │                │        │
│         └─────────────────┴─────────────────┘                │        │
│                               │                              │        │
│                    ┌──────────▼──────────┐                   │        │
│                    │   useWebSocket Hook  │◄──────────────────┘        │
│                    │  (WebSocket Client)  │                           │
│                    └──────────┬──────────┘                           │
└───────────────────────────────│────────────────────────────────────────┘
                                │ WebSocket
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          SERVER (Node.js)                                │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                     Express + WebSocket Server                      │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐ │ │
│  │  │ stockRoutes │  │     WS      │  │      Auto-refresh Loop        │ │ │
│  │  │  (HTTP)     │  │  (Socket)   │  │   (120s interval, batched)   │ │ │
│  │  └──────┬──────┘  └──────┬──────┘  └─────────────┬───────────────┘ │ │
│  │         │                │                       │                 │ │
│  │         └────────────────┴───────────────────────┘                 │ │
│  │                          │                                          │ │
│  │         ┌────────────────▼──────────────────────┐                  │ │
│  │         │         finnhubService                 │                  │ │
│  │         │  ┌──────────────┐  ┌──────────────┐   │                  │ │
│  │         │  │ cacheService │  │ rateLimiter  │   │                  │ │
│  │         │  │   (60s TTL)  │  │(60 calls/min)│   │                  │ │
│  │         │  └──────────────┘  └──────────────┘   │                  │ │
│  │         └────────────────┬──────────────────────┘                  │ │
│  └───────────────────────────│────────────────────────────────────────┘ │
└──────────────────────────────│──────────────────────────────────────────┘
                               │ HTTPS
                               ▼
                    ┌──────────────────────┐
                    │    Finnhub API       │
                    │  (Free: 60/min)      │
                    └──────────────────────┘
```

### Component Relationships

```
App.tsx (Root State Container)
├── State: stocks Map, rateLimit, isLoading, error, lastUpdate
├── useWebSocket() → realtimeQuotes, isConnected
├── stockService.getAllStocks() → Initial fetch
├── stockService.getRateLimitStatus() → Every 15s
│
├── Header.tsx
│   └── Props: isConnected, lastUpdate, onRefresh, isLoading
│   └── Actions: Manual refresh button
│
├── StatusBar.tsx
│   └── Props: totalStocks, apiConfigured, error, rateLimit
│   └── Displays: Category badges, rate limit indicator, warnings
│
└── StockCard.tsx (×12)
    └── Props: quote (StockQuote), isRealtime (boolean)
    └── Displays: Price, change %, high/low/open
```

---

## Service Layer Architecture

### finnhubService

```typescript
// Core API interaction - ALWAYS check cache first
class FinnhubService {
  // Public methods
  async getQuote(symbol: string): Promise<StockQuote | null>
  async getQuotes(symbols: string[], options): Promise<StockQuote[]>
  async getCompanyProfile(symbol: string): Promise<FinnhubProfile | null>
  getRateLimitStatus(): RateLimitStats
  
  // Internal
  private fetchFromApi<T>(): Promise<T | null>  // Rate-limited fetch
  private getApiKey(): string  // Lazy env var read
}
```

**Key behaviors:**
- Returns `null` on failure (never throws to caller)
- Falls back to cached data on rate limit
- Batches requests (6 stocks/batch, 500ms delay)
- Exponential backoff on 429 errors

### cacheService

```typescript
// Wrapper around node-cache
class CacheService {
  get<T>(key: string): T | undefined
  set<T>(key: string, value: T, ttl?: number): boolean
  del(key: string): number
  flush(): void
  getStats(): { hits, misses, keys }
}
```

**TTL Strategy:**
| Data Type | TTL | Rationale |
|-----------|-----|-----------|
| Stock quotes | 60s | Prices change frequently |
| Company profiles | 3600s | Rarely change |
| Rate limit status | 0 (no cache) | Must be real-time |

### rateLimiter

```typescript
// Sliding window rate limiter
class RateLimiter {
  canMakeCall(): boolean        // Check before API call
  getStats(): RateLimitStats    // Current usage
  throttle(): Promise<void>     // Wait if needed
}
```

**Important:** Default config is 55 calls/min (buffer under 60).

---

## State Management Patterns

### Frontend State Flow

```
Initial Load:
  App mounts → fetchStocks() → stockService.getAllStocks()
           → setStocks(Map) → render StockCards
           → subscribeToWebSocket() for each symbol

Real-time Updates:
  Server pushes quote via WS → useWebSocket hook
                           → updates realtimeQuotes Map
                           → merged with stocks Map in App
                           → triggers re-render of specific StockCard
                           → shows "LIVE" indicator

Rate Limit Polling:
  useAutoRefresh(fetchRateLimit, 15000) → stockService.getRateLimitStatus()
                                     → updates rateLimit state
                                     → StatusBar displays indicator
```

### State Merging Strategy

```typescript
// In App.tsx
const mergedStocks = new Map(stocks);        // Polled data
realtimeQuotes.forEach((quote, symbol) => {
  mergedStocks.set(symbol, quote);           // Override with real-time
});
```

**Why this works:**
- `stocks` = baseline from HTTP API (fetched every 60s)
- `realtimeQuotes` = WebSocket updates (immediate)
- WebSocket data always takes precedence
- If WS disconnects, falls back to polled data

---

## Custom Hooks Reference

### useWebSocket

```typescript
interface UseWebSocketReturn {
  quotes: Map<string, StockQuote>;  // Real-time updates
  isConnected: boolean;
  error: string | null;
  subscribe: (symbol: string) => void;
  unsubscribe: (symbol: string) => void;
}
```

**Features:**
- Auto-reconnect with 3s delay
- Resubscribes to previous symbols on reconnect
- Lazy subscription (only connects when symbols added)

### useAutoRefresh

```typescript
function useAutoRefresh(
  fetchFn: () => Promise<void>,
  intervalMs: number,
  enabled: boolean
): void
```

**Usage:**
```typescript
useAutoRefresh(fetchStocks, 120000, true);      // Stocks every 120s (conservative)
useAutoRefresh(fetchRateLimit, 15000, true);   // Rate limit every 15s
```

---

## Error Handling Patterns

### Backend Error Strategy

```typescript
// Service methods return null on failure
async getQuote(symbol: string): Promise<StockQuote | null> {
  try {
    // ... fetch logic
  } catch (error) {
    // Rate limit? Return cached
    if (isRateLimit(error)) {
      return cacheService.get(cacheKey) || null;
    }
    // Other errors? Log and return null
    console.error(`[Finnhub] Error: ${error}`);
    return null;
  }
}
```

### Frontend Error Strategy

```typescript
// Components show error state
const [error, setError] = useState<string | null>(null);

try {
  await fetchStocks();
} catch (err) {
  setError(err.message);  // Display in StatusBar
}

// In render
{error && <StatusBar error={error} />}
```

---

## TypeScript Conventions

### Interfaces (Backend)

```typescript
// backend/src/types/index.ts
interface StockQuote {
  symbol: string;
  currentPrice: number;  // Not 'c' (Finnhub raw)
  change: number;
  changePercent: number; // Not 'dp'
  // ... camelCase throughout
}

// Raw Finnhub response
interface FinnhubQuote {
  c: number;  // Raw API field names
  d: number;
  dp: number;
  // ...
}
```

**Pattern:** Transform raw API types to app types in service layer.

### Type Safety Rules

- ✅ Strict mode enabled (`strict: true` in tsconfig)
- ✅ No `any` types (use `unknown` with type guards if needed)
- ✅ Explicit return types on exported functions
- ✅ Props interfaces for all components
- ✅ Generic constraints for reusable types

---

## Testing Approach

### Unit Test Targets (Priority Order)

1. **cacheService** - Cache hit/miss logic, TTL expiration
2. **rateLimiter** - Window reset, throttling behavior
3. **finnhubService** - Rate limit fallback, batch processing
4. **useWebSocket** - Reconnect logic, message parsing
5. **format utils** - Currency formatting, number display

### Integration Test Scenarios

```typescript
// Example test cases
- "Fetching 12 stocks stays under rate limit"
- "WebSocket reconnect resubscribes to symbols"
- "Rate limit hit serves cached data"
- "Cache expires after TTL"
```

### Manual Testing Checklist

```markdown
- [ ] Server starts, no "API key not configured" warning
- [ ] GET /api/stocks returns 12 valid StockQuote objects
- [ ] GET /api/rate-limit shows callsRemaining < 60
- [ ] WebSocket connects (browser console: "Connected to AIPulse")
- [ ] Rate limit indicator shows in StatusBar ("XX/60 calls")
- [ ] Stock cards show correct colors (green=up, red=down)
- [ ] "LIVE" indicator appears on cards receiving WS updates
- [ ] Manual refresh button works and updates timestamp
- [ ] Cache hit logs appear in backend console
```

---

## Known Limitations & Considerations

### Current Constraints

1. **Rate Limit**: Hard ceiling at 60 calls/min (Finnhub free tier)
   - Adding more stocks requires longer refresh intervals
   - Consider tier upgrade or multiple API keys if scaling

2. **WebSocket Scalability**: Single server instance
   - No horizontal scaling support currently
   - Redis/WebSocket adapter needed for multi-server

3. **No Persistent Storage**: In-memory cache only
   - Cache lost on server restart
   - Consider Redis for distributed caching

4. **Frontend State**: No global state manager
   - Currently prop drilling + React Context not needed
   - Zustand/Redux only if app grows significantly

### Performance Bottlenecks

1. **Batch Size**: Currently 6 stocks/batch
   - Could increase if API allows
   - Monitor rate limit usage

2. **Re-renders**: All StockCards re-render on any quote update
   - React.memo() could help if performance degrades
   - Currently fine with 12 stocks

3. **WebSocket Message Volume**: One message per quote update
   - Could batch WS messages if needed
   - Currently fine for 12 stocks × 120s refresh

---

## Adding New Features

### Checklist for New Features

Before implementing:
- [ ] Does it require new API calls? → Check rate limit impact
- [ ] Does it need real-time updates? → WebSocket integration needed
- [ ] Does it store data? → Cache strategy defined
- [ ] Are there similar features? → Copy existing patterns

### Example: Adding Historical Data

```typescript
// 1. Add to backend/src/types/index.ts
interface StockHistory {
  symbol: string;
  candles: { date: string; open: number; close: number }[];
}

// 2. Add to finnhubService
async getHistory(symbol: string, days: number): Promise<StockHistory> {
  // Check rate limit first!
  if (!rateLimiter.canMakeCall()) {
    throw new Error('Rate limit exceeded');
  }
  // Fetch from Finnhub
  // Cache with longer TTL (1 day)
}

// 3. Add endpoint in stockRoutes.ts
router.get('/history/:symbol', async (req, res) => {
  // Implementation
});

// 4. Add frontend service method
async getHistory(symbol: string): Promise<StockHistory>

// 5. Add component
// HistoryChart.tsx with recharts
```

---

## Refactoring Guidelines

### When to Refactor

- **Duplicated logic** appears in 3+ places
- **Component exceeds 200 lines** (consider splitting)
- **Function has 4+ parameters** (use options object)
- **Type definitions scattered** (consolidate to types/)

### Safe Refactoring Patterns

```typescript
// Extract helper
// Before: Inline in component
// After: utils/stockHelpers.ts

// Extract hook
// Before: useEffect + useState in component
// After: hooks/useStockData.ts

// Extract component
// Before: Conditional render inline
// After: components/EmptyState.tsx
```

### Testing After Refactor

1. Run TypeScript check: `npm run typecheck`
2. Test affected endpoints with curl
3. Verify UI still renders correctly
4. Check console for errors/warnings

---

## Debugging Tips

### Backend Debugging

```bash
# Enable verbose logging
# In server.ts, set: console.log('[Debug]', variable)

# Check rate limit status
curl http://localhost:3001/api/rate-limit

# Test specific endpoint
curl http://localhost:3001/api/stocks/NVDA

# Clear cache to test fresh fetch
curl -X POST http://localhost:3001/api/cache/clear
```

### Frontend Debugging

```typescript
// Add to component for debugging
useEffect(() => {
  console.log('[Debug] Component mounted', props);
  return () => console.log('[Debug] Component unmounted');
}, []);

// Check WebSocket connection
// Browser DevTools → Network → WS tab

// Check React renders
// React DevTools Profiler
```

---

## Dependencies to Know

### Backend

| Package | Purpose | When to Update |
|---------|---------|----------------|
| `express` | Web framework | Security patches only |
| `ws` | WebSocket server | Security patches only |
| `node-cache` | In-memory caching | Feature updates OK |
| `dotenv` | Environment variables | Security patches only |
| `cors` | CORS handling | Security patches only |

### Frontend

| Package | Purpose | When to Update |
|---------|---------|----------------|
| `react` | UI library | Major versions carefully |
| `lucide-react` | Icons | Any time |
| `recharts` | Charts (future) | Feature updates OK |
| `tailwindcss` | Styling | Any time |

---

## Resources for Agents

### Internal Documentation
- `README.md` - User setup guide
- `DEPLOYMENT.md` - Server deployment details
- `AGENTS.md` - This file (technical context)

### External References
- [Finnhub API Docs](https://finnhub.io/docs/api)
- [Express Best Practices](https://expressjs.com/en/advanced/best-practice-performance.html)
- [React Patterns](https://react.dev/learn/thinking-in-react)
- [Tailwind Dark Mode](https://tailwindcss.com/docs/dark-mode)

---

## Questions to Ask Before Coding

1. **Does this feature impact rate limits?**
   - If yes: Can we batch, cache, or defer?

2. **Does this need real-time updates?**
   - If yes: WebSocket integration needed
   - If no: HTTP polling with useAutoRefresh

3. **Where does the data live?**
   - External API → Service layer + cache
   - User input → React state
   - Server state → HTTP/WebSocket

4. **What happens on error?**
   - Fallback to cached data?
   - Show error message?
   - Retry with backoff?

5. **Is there a similar feature?**
   - Copy patterns from existing code
   - Consistency > novelty

---

## Code Quality Requirements

### Mandatory Linting

**ALL code changes MUST pass ESLint before being committed.**

#### Required Workflow

1. **After making ANY code changes**, run:
   ```bash
   npm run lint
   ```

2. **If errors exist, fix them immediately.** Common fixes:
   ```bash
   npm run lint:fix    # Auto-fix formatting and simple issues
   ```

3. **Verify clean status** before committing:
   ```bash
   npm run lint        # Should show 0 errors
   npm run typecheck   # Should pass
   ```

#### Current ESLint Status

| Severity | Count | Action |
|----------|-------|--------|
| **Errors** | 0 ✅ | Maintain - never introduce new errors |
| **Warnings** | ~10 ⚠️ | Acceptable (mostly unused interface params) |

#### Critical Rules (Never Disable)

- `no-undef` - Prevents using undefined variables
- `@typescript-eslint/no-floating-promises` - Prevents unhandled async
- `no-debugger` - Prevents debugger statements in production
- `import/no-unresolved` - Ensures imports exist

#### Commonly Relaxed Rules (Already Configured)

- `@typescript-eslint/no-explicit-any` - Set to 'off' (use `unknown` instead)
- `no-console` - Allow console.log/warn/error (needed for backend logging)
- `@typescript-eslint/no-unused-vars` - Warnings only for unused catch blocks

### Pre-Commit Checklist

```bash
# Before every commit, run:
npm run lint && npm run typecheck

# If both pass, proceed with commit
# If either fails, fix issues first
```

---

## Quick Reference

### File Purposes

| File | Responsibility |
|------|----------------|
| `backend/src/server.ts` | Express setup, WebSocket server, auto-refresh loops |
| `backend/src/routes/stockRoutes.ts` | HTTP endpoint definitions |
| `backend/src/services/*.ts` | Business logic, external API calls, caching |
| `backend/src/constants.ts` | Configuration (stocks, display names) |
| `frontend/src/App.tsx` | Root component, state management |
| `frontend/src/components/*.tsx` | Presentational components |
| `frontend/src/hooks/*.ts` | Custom React hooks |
| `frontend/src/services/*.ts` | API client functions |

### Common Tasks

```bash
# Add new stock
# 1. Edit backend/src/constants.ts → TRACKED_STOCKS
# 2. Edit backend/src/constants.ts → STOCK_DISPLAY_NAMES
# 3. Edit frontend/src/types/index.ts → TRACKED_STOCKS
# 4. Restart servers

# Add new endpoint
# 1. Add to stockRoutes.ts
# 2. Add service method if needed
# 3. Add frontend service method
# 4. Add types to both backend and frontend

# Debug WebSocket
# 1. Check browser DevTools → Network → WS
# 2. Look for "Connected to AIPulse" message
# 3. Watch for incoming quote messages
```

---

Last Updated: 2026-04-12
Version: 1.0.0
