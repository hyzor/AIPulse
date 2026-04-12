# AIPulse Scripts

Utility scripts for testing, development, and data management.

## Quick Reference

| Script | Purpose | Usage |
|--------|---------|-------|
| `backfill-data.ps1` | Seed historical data for testing | `..\scripts\backfill-data.ps1` |
| `backfill-data.sh` | Seed historical data (Linux/Mac) | `./scripts/backfill-data.sh` |
| `test-persistence.ps1` | Test three-tier caching | `..\scripts\test-persistence.ps1` |
| `test-persistence.sh` | Test caching (Linux/Mac) | `./scripts/test-persistence.sh` |

---

## Backfill Data Script

**Purpose:** Populate TimescaleDB with historical stock data so charts display immediately.

**Why you need this:** When you first start the app, there is no historical data. Charts will show "No data" until the system collects enough candles. This script fetches 7 days and 30 days of history from Finnhub to seed the database.

### Prerequisites

1. Backend running (`cd backend && npm run dev`)
2. Docker containers running (`docker compose -f docker-compose.dev.yml up -d`)
3. Finnhub API configured (`.env` has `FINNHUB_API_KEY`)

### Usage (Windows PowerShell)

```powershell
# From project root
.\scripts\backfill-data.ps1

# Or from scripts folder
cd scripts
.\backfill-data.ps1
```

### Usage (Linux/Mac)

```bash
# Make executable (first time only)
chmod +x scripts/backfill-data.sh

# Run from project root
./scripts/backfill-data.sh
```

### What it does

1. Fetches 7-day history at 1-hour resolution for all 12 symbols (12 API calls)
2. Fetches 30-day history at 1-day resolution for all 12 symbols (12 API calls)
3. Stores data in TimescaleDB via the API
4. Reports success/failure for each symbol
5. Shows total candle count per symbol

### Rate Limit Safety

- **Free tier limit:** 60 calls/minute
- **This script uses:** 24 calls (40% of limit)
- **Duration:** ~30 seconds
- **Safe to run:** Yes, even with free tier

### Sample Output

```
🔍 Checking backend connection...
✅ Backend connected (55 API calls remaining)

📊 Backfill Plan:
  • Symbols: 12 stocks
  • 7-day (1h resolution): 12 API calls
  • 30-day (1d resolution): 12 API calls
  • Total API calls: 24 (max 40% of free tier)
  • Estimated time: ~30 seconds

Continue? (y/n): y

🚀 Starting backfill...

⏳ Fetching 7-day history (1h resolution)...
  Fetching NVDA... ✓ (168 candles)
  Fetching AMD... ✓ (168 candles)
  ...

⏳ Fetching 30-day history (1d resolution)...
  Fetching NVDA... ✓ (30 candles)
  ...

✅ Backfill Complete!

  Duration: 28.5 seconds
  Successful: 24
  Failed: 0

📈 Data Summary:
  ✓ NVDA: 198 candles
  ✓ AMD: 198 candles
  ...

🎉 Total: 2376 candles stored in TimescaleDB

💡 Refresh your browser to see the charts!
```

---

## Test Persistence Script

See [Testing Guide](../docs/testing-guide.md) for full documentation.

### Quick Usage

```powershell
# Windows
.\scripts\test-persistence.ps1

# Linux/Mac
./scripts/test-persistence.sh
```

### Prerequisites

1. Databases running: `docker compose -f docker-compose.dev.yml up -d`
2. Backend running: `cd backend && npm run dev`
3. Wait 10 seconds for connections

---

## Troubleshooting

### "Backend not running" Error

**Cause:** The script can't connect to `http://localhost:3001`

**Fix:**
```bash
cd backend
npm run dev
# Wait for "Server running on port 3001"
```

### "API Not Configured" Error

**Cause:** `FINNHUB_API_KEY` not set in `.env`

**Fix:**
1. Get free API key at https://finnhub.io
2. Add to `.env`: `FINNHUB_API_KEY=your_key_here`
3. Restart backend

### "Only X API calls remaining" Warning

**Cause:** Rate limit is low (you've used many calls recently)

**Fix:** Wait 1 minute for the rate limit window to reset, then retry.

### "No data" Still Showing After Backfill

**Cause:** Browser cached the empty state

**Fix:** Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)

---

## Script Development

All scripts are standalone and can be run independently. They:
- Check prerequisites before running
- Report clear error messages
- Use colors for readability
- Exit with code 1 on failure (for CI/CD integration)

To modify:
1. Edit the `.ps1` (Windows) or `.sh` (Linux/Mac) file
2. Test with your local setup
3. No build step required
