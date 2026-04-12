#!/usr/bin/env bash
#
# Backfill historical stock data from Finnhub API to TimescaleDB
# 
# Fetches 7-day (1h) and 30-day (1d) historical data for all tracked symbols
# and stores it in TimescaleDB for immediate chart visualization.
#
# Rate limit safe: Uses max 24 API calls (40% of free tier 60/min limit)
#
# Usage:
#   ./backfill-data.sh

set -e

# Configuration
API_URL="${API_URL:-http://localhost:3001}"
DOCKER_DB="aipulse-db-dev"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Symbols to backfill
SYMBOLS=("NVDA" "AMD" "AVGO" "MRVL" "TSM" "ASML" "ARM" "PLTR" "MSFT" "GOOGL" "AMZN" "TSLA")

# Helper functions
log_info() {
    echo -e "${BLUE}$1${NC}"
}

log_success() {
    echo -e "${GREEN}$1${NC}"
}

log_error() {
    echo -e "${RED}$1${NC}"
}

log_warning() {
    echo -e "${YELLOW}$1${NC}"
}

# Check if backend is running
log_info "🔍 Checking backend connection..."
HEALTH=$(curl -s "$API_URL/api/health" 2>/dev/null || echo "")

if [ -z "$HEALTH" ]; then
    log_error "❌ Backend not running! Start it first: cd backend && npm run dev"
    exit 1
fi

CALLS_REMAINING=$(echo "$HEALTH" | grep -o '"rateLimitRemaining":[0-9]*' | cut -d':' -f2)
log_success "✅ Backend connected ($CALLS_REMAINING API calls remaining)"

# Check rate limit
if [ "$CALLS_REMAINING" -lt 30 ]; then
    log_warning "⚠️  Warning: Only $CALLS_REMAINING API calls remaining. Wait a few minutes and try again."
    exit 1
fi

NUM_SYMBOLS=${#SYMBOLS[@]}
TOTAL_CALLS=$((NUM_SYMBOLS * 2))

echo ""
log_info "📊 Backfill Plan:"
echo "  • Symbols: $NUM_SYMBOLS stocks"
echo "  • 7-day (1h resolution): $NUM_SYMBOLS API calls"
echo "  • 30-day (1d resolution): $NUM_SYMBOLS API calls"
echo "  • Total API calls: $TOTAL_CALLS (max 40% of free tier)"
echo "  • Estimated time: ~30 seconds"
echo ""

read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_warning "Cancelled."
    exit 0
fi

echo ""
log_info "🚀 Starting backfill..."
echo ""

SUCCESS=0
FAILED=0
START_TIME=$(date +%s)

# Backfill 7-day data (1h resolution)
log_info "⏳ Fetching 7-day history (1h resolution)..."
for SYMBOL in "${SYMBOLS[@]}"; do
    printf "  Fetching $SYMBOL..."
    
    RESULT=$(curl -s "$API_URL/api/stocks/$SYMBOL/history?range=7d&resolution=1h" 2>/dev/null)
    
    if echo "$RESULT" | grep -q '"success":true'; then
        CANDLES=$(echo "$RESULT" | grep -o '"candles":\[' | wc -l)
        log_success " ✓"
        ((SUCCESS++))
    else
        log_error " ✗"
        ((FAILED++))
    fi
    
    sleep 0.1
done

echo ""

# Backfill 30-day data (1d resolution)
log_info "⏳ Fetching 30-day history (1d resolution)..."
for SYMBOL in "${SYMBOLS[@]}"; do
    printf "  Fetching $SYMBOL..."
    
    RESULT=$(curl -s "$API_URL/api/stocks/$SYMBOL/history?range=30d&resolution=1d" 2>/dev/null)
    
    if echo "$RESULT" | grep -q '"success":true'; then
        CANDLES=$(echo "$RESULT" | grep -o '"candles":\[' | wc -l)
        log_success " ✓"
        ((SUCCESS++))
    else
        log_error " ✗"
        ((FAILED++))
    fi
    
    sleep 0.1
done

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
log_success "✅ Backfill Complete!"
echo ""
echo "  Duration: ${DURATION}s"
echo "  Successful: $SUCCESS"
echo "  Failed: $FAILED"
echo ""

# Show final counts
log_info "📈 Data Summary:"
echo ""
TOTAL_CANDLES=0
for SYMBOL in "${SYMBOLS[@]}"; do
    COUNT=$(docker exec $DOCKER_DB psql -U postgres -d aipulse -t -c "SELECT COUNT(*) FROM stock_candles_1m WHERE symbol = '$SYMBOL';" 2>/dev/null | tr -d ' \r')
    COUNT=${COUNT:-0}
    TOTAL_CANDLES=$((TOTAL_CANDLES + COUNT))
    if [ "$COUNT" -gt 0 ]; then
        echo "  ✓ $SYMBOL: $COUNT candles"
    else
        echo "  ○ $SYMBOL: 0 candles"
    fi
done

echo ""
log_success "🎉 Total: $TOTAL_CANDLES candles stored in TimescaleDB"
echo ""
log_info "💡 Refresh your browser to see the charts!"
