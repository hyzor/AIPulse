# Persistent Cache & Price History Architecture

**Status:** Approved - Ready for Implementation  
**Date:** 2026-04-12  
**Database:** TimescaleDB (PostgreSQL extension)  
**Context:** Quote history is very valuable - need to track symbol development over 7 days, months, longer time periods. Finnhub free tier is restricted (60 calls/min), so aggressive caching is required.  
**Storage Constraint:** None - plenty of storage available (~35 MB/year estimated).

---

## 1. Storage Architecture (Three-Tier)

```
┌─────────────────────────────────────────────────────────────┐
│  TIER 1: In-Memory (node-cache)                             │
│  • Last 100 quotes per symbol (last ~1-2 hours)             │
│  • Real-time WebSocket updates land here first                │
│  • Sub-10ms access, no serialization overhead                 │
├─────────────────────────────────────────────────────────────┤
│  TIER 2: Redis (Time-Series + Recent Cache)                 │
│  • Sorted Sets per symbol: `quotes:AAPL`                      │
│  • Score = timestamp, Value = serialized OHLC               │
│  • Keep last 7 days in Redis (hot history)                  │
│  • Recent quotes cache: `latest:AAPL` (current price)         │
├─────────────────────────────────────────────────────────────┤
│  TIER 3: TimescaleDB (PostgreSQL extension)                 │
│  • Long-term history: months/years of OHLC data             │
│  • Compressed chunks for older data (auto by TimescaleDB)   │
│  • Fast time-range queries with hypertables                 │
└─────────────────────────────────────────────────────────────┘
```

**Why TimescaleDB over vanilla Redis for long-term:**
- Redis is expensive for multi-month storage (memory)
- TimescaleDB has automatic partitioning, compression, and specialized time-series queries
- You can query "7-day moving average" or "monthly highs" efficiently

---

## 2. Data Model Strategy

**Stop using Finnhub Quote endpoint for history** - it only gives current price. Switch to **Candles/Aggregates**:

| Endpoint | Purpose | Cache Strategy |
|----------|---------|----------------|
| `/stock/candle` | Historical OHLC (1m, 5m, 1h, 1d) | Fetch once, store forever in TimescaleDB |
| `/quote` | Real-time current price | 60s TTL, merge into latest candle |

### TimescaleDB Schema (Hypertable)

```sql
CREATE TABLE stock_candles (
  time TIMESTAMPTZ NOT NULL,
  symbol TEXT NOT NULL,
  open DOUBLE PRECISION,
  high DOUBLE PRECISION,
  low DOUBLE PRECISION,
  close DOUBLE PRECISION,
  volume BIGINT,
  source TEXT -- 'finnhub', 'cached', 'interpolated'
);

-- Partition by symbol + time
SELECT create_hypertable('stock_candles', 'time', chunk_time_interval => INTERVAL '1 day');
CREATE INDEX idx_symbol_time ON stock_candles (symbol, time DESC);
```

### Redis Structure

```
quotes:AAPL (Sorted Set)
  ├─ 1699123456000 → {"o":150.0,"h":151.2,"l":149.8,"c":150.5,"v":1000000}
  ├─ 1699123512000 → {"o":150.5,"h":152.0,"l":150.2,"c":151.8,"v":1200000}
  └─ [score = Unix timestamp ms]

latest:AAPL (Hash)
  ├─ currentPrice: 151.80
  ├─ change: 1.30
  ├─ changePercent: 0.86
  ├─ high: 152.00
  ├─ low: 150.20
  ├─ open: 150.50
  ├─ timestamp: 1699123512000
  └─ source: "websocket" | "api" | "cache"
```

---

## 3. Fetch Strategy (Minimize API Calls)

### The "Gap-Fill" Approach

```
On Server Startup:
  1. For each symbol, query TimescaleDB: "What data do I have?"
  2. Calculate gaps (missing days/hours since last fetch)
  3. Batch fetch ONLY gaps using Finnhub candles
  4. 12 symbols × 1 call each = 12 calls (leaves 48 for real-time)
```

### Aggressive Pre-fetching

- Pre-fetch next day's expected data range during low-traffic hours
- Use Finnhub's daily candles (1 call = 1 symbol's full day history)
- **Trade-off:** Data delayed by 1 day, but zero intraday API calls needed for history

### Real-time Updates (WebSocket/Quote endpoint)

- Use WebSocket for price updates (if Finnhub offers WS for your tier)
- OR poll `/quote` every 60s (12 calls/min) and append to current candle
- Merge into Redis `latest:AAPL` immediately
- Flush to TimescaleDB at candle close (end of minute/hour/day)

---

## 4. Time Granularity Strategy

Store multiple resolutions to optimize queries:

| Resolution | Retention | Source | Use Case |
|------------|-----------|--------|----------|
| 1-minute | 7 days in Redis, 30 days in TimescaleDB | Finnhub candles | Intraday charts |
| 1-hour | 90 days | Aggregated from 1m | Weekly trends |
| 1-day | Indefinite | Finnhub candles | Monthly/yearly analysis |

### Aggregation Pipeline

```
1m candles (raw from Finnhub)
  → Rollup job → 1h candles (stored in TimescaleDB)
    → Rollup job → 1d candles (compressed, long-term)
```

---

## 5. Backfill & Sync Logic

### Smart Fetching Algorithm

```typescript
// Pseudocode for fetching with minimal API calls
async function ensureHistory(symbol: string, days: number) {
  const existingRange = await timescaleDb.getDataRange(symbol);
  const now = Date.now();
  const neededStart = now - (days * 24 * 60 * 60 * 1000);
  
  // Only fetch what's missing
  if (existingRange.oldest > neededStart) {
    const missingDays = Math.ceil((existingRange.oldest - neededStart) / MS_PER_DAY);
    // Fetch from Finnhub in batches (respecting rate limit)
    await fetchCandlesInBatches(symbol, missingDays);
  }
  
  // Fill recent gap if needed (last candle might be incomplete)
  if (existingRange.newest < now - CANDLE_INTERVAL) {
    await fetchRecentCandles(symbol);
  }
}
```

### Rate Limit Budget Allocation

| Purpose | Calls/Min | Notes |
|---------|-----------|-------|
| Backfill/historical | 20 | Batch during startup/low traffic |
| Real-time quote updates | 30 | Every ~2 min for 12 symbols |
| Buffer/manual refreshes | 10 | Error recovery, user requests |

---

## 6. Query Patterns & API Design

### History Endpoint

```typescript
// GET /api/stocks/AAPL/history?range=7d&resolution=1h
// Returns:
{
  symbol: "AAPL",
  resolution: "1h",
  from: "2024-01-01T00:00:00Z",
  to: "2024-01-07T00:00:00Z",
  candles: [
    { t: 1699123200, o: 150.0, h: 151.2, l: 149.8, c: 150.5, v: 1000000 },
    // ...
  ],
  cached: true,   // All data came from DB (no API calls made)
  partial: false  // If true, some data was missing from DB/cache
}
```

### Data Flow for History Request

```
1. Check Redis (hot cache) for requested time range
2. If full hit → return immediately
3. If partial/miss → query TimescaleDB
4. If TimescaleDB has data → populate Redis, return
5. If gap detected → queue background fetch (don't block user)
6. Return available data with `partial: true` flag
```

---

## 7. WebSocket Integration

**WebSocket updates should maintain the timeline:**

```
Finnhub WebSocket (or polled quote)
  ↓
Update Redis `latest:AAPL` (real-time price)
  ↓
Check if current minute candle exists in Redis
  ├─ Yes: Update high/low/close/volume
  └─ No: Create new candle with open=current price
  ↓
Broadcast to clients
  ↓
Every 5 minutes: Persist Redis candles to TimescaleDB (async, batch insert)
```

---

## 8. Key Implementation Considerations

### Redis Memory Management

- Use `ZREMRANGEBYSCORE` to trim old data (keep only 7 days in Redis)
- Enable Redis AOF for durability (everysec setting is good balance)
- Consider Redis Streams instead of Sorted Sets if you want consumer groups

### TimescaleDB Compression

- Enable automatic compression on chunks older than 7 days
- Compression ratio typically 90%+ for financial time-series
- Keeps long-term storage costs manageable

### Handling Market Hours

- Don't fetch/poll outside market hours (reduces API calls by ~70%)
- Store market schedule in DB to know when to expect new data
- Pre-market and after-hours: Reduce poll frequency significantly

### Data Integrity

- Store `source` field to distinguish Finnhub vs interpolated data
- If gap detected in history, mark subsequent data as `needs_backfill`
- Background job runs nightly to fill any gaps discovered during the day

### Storage Policy (Unlimited Storage Available)

**Given:** No storage constraints (~35 MB/year estimated, 700 MB for 5 years aggressive retention)

**Recommended approach:**

```sql
-- Keep 1m uncompressed for 30 days (fast queries for recent intraday)
-- Then compress but keep for 1 year
SELECT add_compression_policy('stock_candles', INTERVAL '30 days');

-- Retention policy: aggressive (keep everything indefinitely)
-- SELECT add_retention_policy('stock_candles', INTERVAL '2 years');  -- SKIP THIS
```

| Resolution | Retention | Storage (1 year) | Notes |
|------------|-----------|------------------|-------|
| 1-minute | **1 year** | ~54 MB | Uncompressed 30d, compressed 335d |
| 1-hour | **2 years** | ~18 MB | Aggregated from 1m |
| 1-day | **Indefinite** | ~2 MB | Long-term trend analysis |

**Storage is NOT a constraint, so we can:**
- Keep 1-minute candles for **full year** instead of 90 days
- Defer compression to 30 days (keep recent data uncompressed = faster queries)
- Skip retention policies (never auto-delete)
- Add intermediate resolutions (15m, 30m) if query patterns require them
- Store raw quote ticks in addition to OHLC (if WebSocket provides sub-minute data)

**Trade-off we accept:**
- Slightly slower queries on 6-12 month data (compressed)
- Much faster queries on 0-30 day data (uncompressed)
- Zero risk of data loss due to retention policies

---

## 9. Development & Restart Safety (Critical)

**Problem:** During active development, the server restarts frequently. In-memory candles (L1) that haven't been flushed to TimescaleDB yet will be lost.

### Solution: Multi-Layer Persistence Strategy

```
┌────────────────────────────────────────────────────────────┐
│  DATA FLOW WITH RESTART PROTECTION                         │
├────────────────────────────────────────────────────────────┤
│  1. WebSocket/Poll → L1 (in-memory)                        │
│     ├─ Update current candle (open/high/low/close/volume)  │
│     └─ Every 30s: Async write to Redis (AOF-enabled)       │
│                                                              │
│  2. Redis (AOF persistence everysec)                         │
│     ├─ Survives process restarts (if Redis container stays)  │
│     └─ Every 5min: Batch flush to TimescaleDB              │
│                                                              │
│  3. TimescaleDB (permanent)                                │
│     └─ Source of truth for all historical data             │
└────────────────────────────────────────────────────────────┘
```

### Graceful Shutdown Handler

```typescript
// In server.ts - critical for data preservation
process.on('SIGTERM', async () => {
  console.log('[Shutdown] Flushing L1 cache to Redis...');
  await candleBuffer.flushToRedis(); // Immediate
  
  console.log('[Shutdown] Flushing Redis to TimescaleDB...');
  await candleBuffer.flushToTimescaleDB(); // Immediate
  
  console.log('[Shutdown] All data persisted. Exiting.');
  process.exit(0);
});

process.on('SIGINT', async () => {
  // Same as SIGTERM (Ctrl+C in dev)
  await gracefulShutdown();
});
```

### Persistent Redis (Docker Compose)

```yaml
# docker-compose.yml - ensure Redis survives restarts
services:
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --appendfsync everysec
    volumes:
      - redis_data:/data  # Named volume persists between restarts
    
  timescaledb:
    image: timescale/timescaledb:latest-pg15
    volumes:
      - timescale_data:/var/lib/postgresql/data

volumes:
  redis_data:
  timescale_data:
```

### Recovery on Startup

```typescript
// On server boot - check for "orphaned" data in Redis
async function recoverFromRestart() {
  const pendingCandles = await redis.get('pending:timescale_flush');
  
  if (pendingCandles && pendingCandles.length > 0) {
    console.log(`[Recovery] Found ${pendingCandles.length} candles in Redis not yet in TimescaleDB`);
    
    // De-duplicate (check if already in TimescaleDB to avoid double-inserts)
    const uniqueCandles = await deduplicateAgainstDB(pendingCandles);
    
    // Batch insert to TimescaleDB
    await timescaleDb.insertCandles(uniqueCandles);
    console.log(`[Recovery] Inserted ${uniqueCandles.length} recovered candles`);
    
    // Clear the pending queue
    await redis.del('pending:timescale_flush');
  }
}
```

### Persistence Intervals (Development-Optimized)

| Layer | Flush Interval | Trigger | Safety Mechanism |
|-------|----------------|---------|------------------|
| L1 → Redis | 30 seconds | Timer + graceful shutdown | Redis AOF everysec |
| L1 → Redis | Immediate | Every N updates (e.g., 50) | Max buffer size |
| Redis → TimescaleDB | 5 minutes | Timer + graceful shutdown | Startup recovery check |
| Redis → TimescaleDB | Immediate | Graceful shutdown signal | SIGTERM/SIGINT handler |

### Development Mode Safeguards

```typescript
// Detect development environment, be more aggressive with persistence
const isDev = process.env.NODE_ENV === 'development';

const PERSISTENCE_CONFIG = {
  l1ToRedisInterval: isDev ? 15000 : 30000,  // 15s in dev, 30s prod
  redisToDbInterval: isDev ? 60000 : 300000, // 1min in dev, 5min prod
  maxBufferSize: isDev ? 10 : 100,           // Flush early in dev
  shutdownTimeout: isDev ? 5000 : 30000,      // 5s dev, 30s prod
};
```

### Manual Flush Endpoint (Emergency)

```typescript
// POST /api/admin/flush-cache
// For development: manually trigger persistence to DB
router.post('/admin/flush-cache', async (req, res) => {
  const redisCount = await candleBuffer.flushToTimescaleDB();
  res.json({ 
    flushed: redisCount,
    timestamp: new Date().toISOString(),
    message: "All cached candles persisted to TimescaleDB"
  });
});
```

### Data Loss Scenarios & Mitigation

| Scenario | Data at Risk | Mitigation |
|----------|--------------|------------|
| Server crash (no SIGTERM) | Last 30s of L1 data | Acceptable loss (dev only) |
| Redis container restart | Unflushed candles (last 5min) | AOF persistence file |
| Full Docker restart | Last 5min if not flushed | Startup recovery from Redis |
| TimescaleDB down | Candles queued in Redis | Retry queue with backoff |

### Verification Query (Post-Restart)

```typescript
// Health check endpoint includes data freshness
app.get('/api/health', async (req, res) => {
  const redisStatus = await redis.ping();
  const dbLatest = await timescaleDb.getLatestTimestamp('AAPL');
  const redisLatest = await redis.getLatestTimestamp('AAPL');
  const gapMinutes = (redisLatest - dbLatest) / 60000;
  
  res.json({
    status: 'ok',
    redis: redisStatus === 'PONG',
    timescale: !!dbLatest,
    dataGapMinutes: gapMinutes,  // Should be < 6 in normal operation
    warning: gapMinutes > 10 ? 'Data flush behind' : undefined
  });
});
```

---

## 10. Migration Path

### Phase 1 (Immediate)

- [ ] Add TimescaleDB container/service
- [ ] Start writing candles to DB going forward
- [ ] Redis layer as L2 cache

### Phase 2 (Backfill)

- [ ] Rate-limited backfill of last 30 days for all symbols
- [ ] Spread across multiple days to respect rate limits
- [ ] Verify data integrity, handle splits/dividends

### Phase 3 (Optimization)

- [ ] Implement rollup jobs (1m → 1h → 1d)
- [ ] Add compression policies
- [ ] Tune cache TTLs based on query patterns

---

## 11. Decisions Summary

All key architectural decisions have been made:

| Question | Decision |
|----------|----------|
| **Database** | ✅ **TimescaleDB** - PostgreSQL-based time-series database |
| **Real-time granularity** | ✅ **1-minute** - sufficient for price history analysis |
| **Data freshness** | ✅ **6-hour delayed batch** - acceptable trade-off for minimal API usage |
| **Storage policy** | ✅ **Unlimited retention** - 1m for 1 year, 1h for 2 years, 1d forever |

---

## 12. Benefits of This Architecture

| Benefit | How Achieved |
|---------|--------------|
| **Indefinite price history** | TimescaleDB persistent storage with compression |
| **Minimal API calls** | Gap-fill strategy + aggressive caching |
| **Fast recent queries** | Redis hot cache for last 7 days |
| **Fast real-time updates** | In-memory L1 cache |
| **Survives restarts** | Redis persistence + TimescaleDB durability + graceful shutdown handlers |
| **Development-friendly** | Frequent restarts don't lose data (AOF + recovery logic) |
| **Scalable to more symbols** | Time-series optimized queries, tiered storage |

---

*This architecture provides indefinite price history while keeping Finnhub API calls minimal through aggressive caching and intelligent gap-filling.*
