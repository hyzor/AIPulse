# AIPulse Test Scripts

Automated testing scripts for the three-tier caching system.

## ⚠️ Prerequisites (REQUIRED)

The test scripts **require** both databases AND backend to be running.

### 1. Start Databases
```bash
docker-compose -f docker-compose.dev.yml up -d
```

### 2. Start Backend (CRITICAL!)
```bash
cd backend
npm run dev
```

### 3. Wait 5-10 Seconds
For all connections to establish

**If you skip step 2, the test will fail immediately with "BACKEND NOT RUNNING"**

---

## Quick Reference

| Script | Platform | Usage |
|--------|----------|-------|
| `test-persistence.ps1` | Windows PowerShell | `..\scripts\test-persistence.ps1` |
| `test-persistence.sh` | Linux/Mac Bash | `./test-persistence.sh` |

## Usage

### Windows

```powershell
# Run all tests (from project root)
.\scripts\test-persistence.ps1

# Skip crash simulation
.\scripts\test-persistence.ps1 -SkipRecovery

# Longer data collection
.\scripts\test-persistence.ps1 -CollectionTime 60
```

### Linux/Mac

```bash
# Make executable (first time only)
chmod +x scripts/test-persistence.sh

# Run all tests (from project root)
./scripts/test-persistence.sh

# Skip crash simulation
./scripts/test-persistence.sh --skip-recovery

# Verbose output
./scripts/test-persistence.sh --verbose
```

## Test Coverage

The scripts verify 7 critical scenarios:

1. **Health Check** - All services connected (database, redis, API)
2. **Data Collection** - L1 cache populated with quotes
3. **L1 → Redis** - Memory to Redis flush
4. **Database** - Data in TimescaleDB
5. **History API** - Historical data queries work
6. **Restart Recovery** - Crash survival (CRITICAL)
7. **Graceful Shutdown** - Clean exit flushes all data

## Full Documentation

See [Testing Guide](../docs/testing-guide.md) for detailed documentation including troubleshooting.

## Exit Codes

- `0` - All tests passed
- `1` - One or more tests failed

## Color Output

✅ Green = Passed  
❌ Red = Failed  
⚠️  Yellow = Warning  
ℹ️  Blue = Info  
🔴 Red Box = Backend not running (start it first!)
