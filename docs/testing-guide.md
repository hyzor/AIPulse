# Testing Guide

This document describes how to test the AIPulse three-tier caching system.

## ⚠️ Critical: Three-Step Setup Required

The test scripts **cannot run standalone**. They require a full running environment:

```
┌─────────────────────────────────────────────────────────────┐
│  REQUIRED SETUP                                             │
├─────────────────────────────────────────────────────────────┤
│  1. Docker: TimescaleDB + Redis (database layer)            │
│  2. Node.js: Backend server (API + caching logic)          │
│  3. Test Script: Calls the API to verify everything       │
└─────────────────────────────────────────────────────────────┘
```

**If you run the test script without the backend running, it will fail immediately with a clear error message.**

## Architecture Overview

AIPulse uses a sophisticated three-tier caching architecture:

```
Quotes from Finnhub
        ↓
   L1 (In-Memory)  ←────── Fast, volatile
        ↓ (15s)
   L2 (Redis AOF)   ←────── Persistent, survives restart
        ↓ (60s)
   L3 (TimescaleDB) ←────── Permanent storage
```

To ensure this system works correctly, we provide automated test scripts that verify:

1. **Connectivity** - All services (DB, Redis, API) are reachable
2. **Data Flow** - Quotes flow through all three tiers correctly
3. **Persistence** - Data survives restarts and crashes
4. **Recovery** - Orphaned data in Redis is recovered on startup
5. **Graceful Shutdown** - Clean shutdown flushes all caches

## Quick Start (3 Steps)

### Step 1: Start the Databases

This starts TimescaleDB and Redis in Docker:

```bash
docker-compose -f docker-compose.dev.yml up -d
```

Verify they're running:
```bash
docker-compose -f docker-compose.dev.yml ps
```

### Step 2: Start the Backend (⚠️ CRITICAL!)
   ```bash
   cd backend && npm run dev
   ```

3. **Wait 5-10 seconds** for all connections to establish

### Run Tests

**Windows (PowerShell):**
```powershell
.\scripts\test-persistence.ps1
```

**Linux/Mac (Bash):**
```bash
./scripts/test-persistence.sh
```

## Test Scripts

### `scripts/test-persistence.ps1` (Windows)

A comprehensive PowerShell test suite for Windows developers.

#### Usage

```powershell
# Run all tests (includes crash simulation)
.\scripts\test-persistence.ps1

# Skip the crash/recovery test
.\scripts\test-persistence.ps1 -SkipRecovery

# Skip the graceful shutdown test
.\scripts\test-persistence.ps1 -SkipShutdown

# Collect data for 60 seconds instead of default 30
.\scripts\test-persistence.ps1 -CollectionTime 60

# Use a different API endpoint
.\scripts\test-persistence.ps1 -BaseUrl http://localhost:3001
```

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `-SkipRecovery` | Switch | False | Skip the restart recovery test |
| `-SkipShutdown` | Switch | False | Skip the graceful shutdown test |
| `-CollectionTime` | Int | 30 | Seconds to collect data |
| `-BaseUrl` | String | http://localhost:3001 | API base URL |
| `-Verbose` | Switch | False | Show detailed API calls |

### `scripts/test-persistence.sh` (Linux/Mac)

A comprehensive Bash test suite for Unix-based systems.

#### Usage

```bash
# Run all tests
./scripts/test-persistence.sh

# Skip the crash/recovery test
./scripts/test-persistence.sh --skip-recovery

# Skip the graceful shutdown test
./scripts/test-persistence.sh --skip-shutdown

# Show verbose output
./scripts/test-persistence.sh --verbose
```

#### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | http://localhost:3001 | API base URL |
| `COLLECTION_TIME` | 30 | Seconds to collect data |

## What the Tests Verify

### Test 1: Health Check ✅

**Purpose:** Verify all services are connected

**Checks:**
- TimescaleDB connection and latency
- Redis connection and latency
- Finnhub API configuration
- Data statistics (candle counts)

**Expected Output:**
```
✅ TimescaleDB connected (latency: 5ms)
✅ Redis connected (latency: 2ms)
✅ Finnhub configured (rate limit: 55/60)
```

### Test 2: Data Collection 📊

**Purpose:** Populate L1 cache with real quote data

**Process:**
1. Fetches all tracked stocks via `/api/stocks`
2. Waits for specified collection time (default 30s)
3. Monitors L1 buffer stats every 5 seconds

**Expected Output:**
```
✅ Fetched 12 stocks
✅ Collected 150 updates in L1
```

### Test 3: L1 → Redis Flush 🔄

**Purpose:** Verify data flows from memory to Redis

**Process:**
1. Records Redis memory before flush
2. Calls manual flush endpoint
3. Verifies Redis memory increased
4. Checks for quote keys in Redis

**Expected Output:**
```
✅ Flush complete: 12 L1 buffers, 45 to DB
✅ Redis has 12 quote keys
```

### Test 4: Database Persistence 💾

**Purpose:** Verify data is stored in TimescaleDB

**Checks:**
- Count of 1-minute candles
- Per-symbol candle counts
- Date range of stored data

**Expected Output:**
```
✅ TimescaleDB has 120 1-minute candles
Per-symbol candle counts:
  AAPL | 10 | 2024-04-12 10:00:00 | 2024-04-12 10:09:00
```

### Test 5: Historical Data API 📈

**Purpose:** Test the history endpoint with various resolutions

**Tests:**
- AAPL, MSFT, GOOGL with 1h resolution
- AAPL, MSFT, GOOGL with 1d resolution
- 7-day range by default

**Expected Output:**
```
✅ AAPL @ 1h: candles available (partial: false)
✅ MSFT @ 1d: candles available (partial: false)
```

### Test 6: Restart Recovery 🔄 (CRITICAL)

**Purpose:** Verify no data loss on crash/restart

**This is the most important test.** It simulates a crash:

1. Collects data in L1 cache
2. Kills the Node.js process (simulating a crash)
3. Verifies Redis still has the data
4. Waits for manual backend restart
5. Checks that data was recovered from Redis to TimescaleDB

**Why This Matters:**
- In development, you restart the server frequently
- Without this, you lose all unsaved price data
- The test proves the three-tier system works

**Manual Steps Required:**
```
⚠️  MANUAL ACTION REQUIRED:
   Press Ctrl+C in your backend terminal NOW!
   Then restart with: cd backend && npm run dev

   Press Enter when backend has restarted...
```

**Expected Output:**
```
✅ Redis retained data: 12 keys
✅ Backend restarted
✅ Recovery successful: 45 candles recovered from Redis!
```

### Test 7: Graceful Shutdown 🛑

**Purpose:** Verify clean shutdown flushes all caches

**Process:**
1. Collects data in L1 cache
2. Prompts you to press Ctrl+C
3. Waits for restart
4. Verifies no data was lost

**Expected Output:**
```
✅ L1 has 30 updates to flush
[You press Ctrl+C and see shutdown logs]
✅ Graceful shutdown preserved all data
```

## Interpreting Results

### Success ✅

All tests pass with green checkmarks:

```
════════════════════════════════════════════════════════════
  Total: 7 | Passed: 7 | Failed: 0
  Duration: 02:45
════════════════════════════════════════════════════════════
```

### Failure ❌

If any test fails:

1. Check the specific error message
2. Verify services are running:
   ```bash
   docker-compose -f docker-compose.dev.yml ps
   ```
3. Check backend logs for errors
4. Re-run the specific failing test

Common issues:
- **"Cannot connect to API"** → Backend not running
- **"TimescaleDB not connected"** → DB container not ready (wait 10s)
- **"No data collected"** → Increase `-CollectionTime`
- **"No candles in TimescaleDB"** → Flush may not have run yet

## Continuous Testing

For ongoing development, run these quick checks:

```bash
# Quick health check
curl http://localhost:3001/api/health | jq .

# Check buffer stats
curl http://localhost:3001/api/admin/buffer-stats | jq .

# Quick database count
docker exec aipulse-db-dev psql -U postgres -d aipulse -c "SELECT COUNT(*) FROM stock_candles_1m;"
```

## Manual Testing API Endpoints

```bash
# Health with full system status
curl http://localhost:3001/api/health

# Buffer statistics
curl http://localhost:3001/api/admin/buffer-stats

# Manual flush (forces L1→Redis→DB)
curl -X POST http://localhost:3001/api/admin/flush-cache

# Get historical data
curl "http://localhost:3001/api/stocks/AAPL/history?range=7d&resolution=1h"

# Rate limit status
curl http://localhost:3001/api/rate-limit
```

## Troubleshooting

### "BACKEND NOT RUNNING" Error

**Symptom:** The test script immediately shows a red box saying "BACKEND NOT RUNNING"

**Cause:** You ran the test script without starting the Node.js backend.

**Solution:**
```bash
# Terminal 1: Start backend (KEEP IT RUNNING!)
cd backend
npm run dev

# Terminal 2: Then run tests
../scripts/test-persistence.sh
```

### Test 6 (Recovery) Fails

**Symptom:** "No keys in Redis - data may have already been flushed"

**Cause:** The automatic flush (60s interval) already ran.

**Solution:** Run with shorter collection time or disable auto-flush in `.env`:
```env
REDIS_TO_DB_INTERVAL=3600  # 1 hour, won't auto-flush during test
```

### Redis Memory Doesn't Increase

**Symptom:** Flush succeeds but Redis memory unchanged.

**Cause:** Redis may have already had data, or compression is efficient.

**Solution:** Check key count instead:
```bash
docker exec aipulse-redis-dev redis-cli keys 'quotes:*'
```

### Database Shows 0 Candles

**Symptom:** All tests pass but DB has no candles.

**Cause:** The automatic flush hasn't run yet (every 60s).

**Solution:** Either wait longer or run manual flush test (#3).

## Next Steps

After tests pass:

1. **Start collecting real data** - Let it run for hours/days
2. **Query historical charts** - Test the `/api/stocks/:symbol/history` endpoint
3. **Verify restart recovery** - Kill and restart, check logs for "[Recovery]"
4. **Deploy to production** - Use `docker-compose.prod.yml`

## See Also

- [Persistent Cache Architecture](./persistent-cache-architecture.md) - Full architecture documentation
- [Development Workflow](#) - How to run locally
- [Production Deployment](#) - Docker production setup
