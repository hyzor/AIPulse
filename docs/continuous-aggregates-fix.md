# Continuous Aggregates Fix Documentation

## Problem Summary

The Data Collection panel showed "1D view ready" but stock cards displayed "Collecting data..." instead of charts. This was caused by missing TimescaleDB continuous aggregate views.

**Root Cause:** The backend was querying `stock_candles_1h` and `stock_candles_1d` tables (which were empty) instead of the `*_aggregation` views (which contain the aggregated data).

---

## Fix Commands for Production (Linux)

### Step 1: Initialize Database Schema

Run this once to create the continuous aggregate views:

```bash
# From project root
docker exec -i aipulse-db psql -U postgres -d aipulse < backend/src/db/init.sql
```

**Expected output:**
- `CREATE MATERIALIZED VIEW` for `stock_candles_1h_aggregation`
- `CREATE MATERIALIZED VIEW` for `stock_candles_1d_aggregation`
- `add_continuous_aggregate_policy` confirmation

### Step 2: Refresh Continuous Aggregates

Run this to populate chart data from existing 1m candles:

```bash
# Option A: Using the script (recommended)
node scripts/refresh-aggregates.js

# Option B: Manual SQL refresh
docker exec aipulse-db psql -U postgres -d aipulse \
  -c "CALL refresh_continuous_aggregate('stock_candles_1h_aggregation', NULL, NULL);"
  
docker exec aipulse-db psql -U postgres -d aipulse \
  -c "CALL refresh_continuous_aggregate('stock_candles_1d_aggregation', NULL, NULL);"
```

### Step 3: Deploy Code Changes

The backend code changes are in `backend/src/services/databaseService.ts`. Deploy with:

```bash
# Docker Compose
docker compose up -d --build

# Or direct deploy
cd backend && npm run build && npm start
```

---

## Verification Commands

### Check Data Counts

```bash
# 1m raw candles
docker exec aipulse-db psql -U postgres -d aipulse \
  -c "SELECT COUNT(*) FROM stock_candles_1m;"

# 1h chart candles
docker exec aipulse-db psql -U postgres -d aipulse \
  -c "SELECT COUNT(*) FROM stock_candles_1h_aggregation;"

# 1d chart candles
docker exec aipulse-db psql -U postgres -d aipulse \
  -c "SELECT COUNT(*) FROM stock_candles_1d_aggregation;"
```

### Check Symbols with Chart Data

```bash
# 1h symbols (what charts actually use)
docker exec aipulse-db psql -U postgres -d aipulse \
  -c "SELECT DISTINCT symbol FROM stock_candles_1h_aggregation ORDER BY symbol;"

# 1d symbols (for 7D+ views)
docker exec aipulse-db psql -U postgres -d aipulse \
  -c "SELECT DISTINCT symbol FROM stock_candles_1d_aggregation ORDER BY symbol;"
```

### Check API Health

```bash
# Local check
curl http://localhost:3001/api/health

# Check dataStats in response for symbols1h count
```

---

## What Was Fixed

### Database Layer

| Before | After |
|--------|-------|
| No continuous aggregate views | Created `stock_candles_1h_aggregation` view |
| No continuous aggregate views | Created `stock_candles_1d_aggregation` view |
| Empty `stock_candles_1h` table | Views auto-populate from 1m data |
| Empty `stock_candles_1d` table | Views auto-populate from 1m data |

### Backend Changes

**File:** `backend/src/services/databaseService.ts`

| Method | Change |
|--------|--------|
| `getCandles()` | Now queries `*_aggregation` views for 1h/1d |
| `getStats()` | Now counts from `*_aggregation` views |

Example change:
```typescript
// Before: table = 'stock_candles_1h' (empty)
// After: table = 'stock_candles_1h_aggregation' (populated)
```

### Frontend Changes

**File:** `frontend/src/components/DataCollectionStatus.tsx`

| Before | After |
|--------|-------|
| Single "candles" count | Separate 1m/1h/1d counts |
| Single "symbols" list | Separate symbols lists per resolution |
| "1D view ready" based on 1m data | "1D view ready" only when 1h data exists |
| All badges blue | Green = chart-ready, Blue = raw data only, Gray = waiting |

---

## How Continuous Aggregates Work

### Data Flow

```
Background Collector → 1m candles → TimescaleDB
                                      ↓
                              [Continuous Aggregates]
                              (auto-refresh every hour/day)
                                      ↓
                           1h view    1d view
                              ↓         ↓
                          Chart API   Chart API
                              ↓         ↓
                        Stock Cards  7D+ views
```

### Auto-Refresh Schedule

| View | Refresh Interval | Trigger |
|------|------------------|---------|
| `stock_candles_1h_aggregation` | Every 1 hour | TimescaleDB policy |
| `stock_candles_1d_aggregation` | Every 1 day | TimescaleDB policy |

Manual refresh (via script) is only needed for:
- Initial population
- Forcing immediate chart updates
- Recovery scenarios

---

## Windows vs Linux Commands

| Task | Windows (PowerShell) | Linux |
|------|----------------------|-------|
| Init database | `cmd /c "docker exec -i aipulse-db-dev psql -U postgres -d aipulse < backend/src/db/init.sql"` | `docker exec -i aipulse-db psql -U postgres -d aipulse < backend/src/db/init.sql` |
| Run refresh script | `node scripts/refresh-aggregates.js` | `node scripts/refresh-aggregates.js` |
| Check 1h count | `docker exec aipulse-db-dev psql -U postgres -d aipulse -c "SELECT COUNT(*) FROM stock_candles_1h_aggregation;"` | `docker exec aipulse-db psql -U postgres -d aipulse -c "SELECT COUNT(*) FROM stock_candles_1h_aggregation;"` |

**Note:** Container names may differ:
- Windows dev: `aipulse-db-dev`
- Linux prod: `aipulse-db`

---

## Troubleshooting

### Views exist but no data

```bash
# Force refresh with NULL range (full refresh)
docker exec aipulse-db psql -U postgres -d aipulse \
  -c "CALL refresh_continuous_aggregate('stock_candles_1h_aggregation', NULL, NULL);"
```

### Check view definition

```bash
docker exec aipulse-db psql -U postgres -d aipulse \
  -c "\d+ stock_candles_1h_aggregation"
```

### Reset everything (WARNING: Destroys data)

```bash
# Only if you need to start fresh
docker exec aipulse-db psql -U postgres -d aipulse \
  -c "DROP MATERIALIZED VIEW IF EXISTS stock_candles_1h_aggregation CASCADE;"
docker exec aipulse-db psql -U postgres -d aipulse \
  -c "DROP MATERIALIZED VIEW IF EXISTS stock_candles_1d_aggregation CASCADE;"

# Then re-run init.sql
```

---

## Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `backend/src/services/databaseService.ts` | Modified | Query aggregation views instead of tables |
| `frontend/src/components/DataCollectionStatus.tsx` | Modified | Show per-resolution status |
| `scripts/refresh-aggregates.js` | Created | Manual refresh utility |
| `backend/src/db/init.sql` | Reference | Creates aggregation views |

---

## Related Documentation

- `docs/persistent-cache-architecture.md` - Data flow architecture
- `docs/frontend-historical-data-architecture.md` - Frontend data handling
- `AGENTS.md` - System architecture overview
