#!/usr/bin/env bash
#
# AIPulse Persistence Test Script for Linux/Mac (Bash)
#
# Comprehensive test suite for the three-tier caching system:
# L1 (Memory) → L2 (Redis AOF) → L3 (TimescaleDB)
#
# Usage:
#   ./test-persistence.sh
#   ./test-persistence.sh --verbose
#   ./test-persistence.sh --skip-recovery
#

set -e

# Configuration
BASE_URL="${BASE_URL:-http://localhost:3001}"
COLLECTION_TIME="${COLLECTION_TIME:-30}"
DOCKER_DB="aipulse-db-dev"
DOCKER_REDIS="aipulse-redis-dev"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Parse arguments
SKIP_RECOVERY=false
SKIP_SHUTDOWN=false
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-recovery)
            SKIP_RECOVERY=true
            shift
            ;;
        --skip-shutdown)
            SKIP_SHUTDOWN=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_header() {
    echo -e "\n${CYAN}=== $1 ===${NC}"
}

# API helper function
api_call() {
    local endpoint="$1"
    local method="${2:-GET}"
    local url="${BASE_URL}${endpoint}"
    
    if [ "$VERBOSE" = true ]; then
        echo "  API: $method $url" >&2
    fi
    
    if [ "$method" = "POST" ]; then
        curl -s -X POST "$url" --max-time 10 2>/dev/null || echo "null"
    else
        curl -s "$url" --max-time 10 2>/dev/null || echo "null"
    fi
}

# Docker helper
docker_exec() {
    docker "$@" 2>/dev/null
}

# Test 1: Health Check
test_health() {
    log_header "Test 1: Health Check"
    
    log_info "Checking connection to $BASE_URL..."
    
    health=$(api_call "/api/health")
    
    if [ "$health" = "null" ] || [ -z "$health" ]; then
        log_error "Cannot connect to API at $BASE_URL"
        echo ""
        echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${RED}║  BACKEND NOT RUNNING                                       ║${NC}"
        echo -e "${RED}╠════════════════════════════════════════════════════════════╣${NC}"
        echo -e "${YELLOW}║  The test script requires the backend to be running.       ║${NC}"
        echo -e "${YELLOW}║                                                            ║${NC}"
        echo -e "${YELLOW}║  Start the backend first:                                  ║${NC}"
        echo -e "${CYAN}║    cd backend                                              ${NC}"
        echo -e "${CYAN}║    npm run dev                                             ${NC}"
        echo -e "${YELLOW}║                                                            ║${NC}"
        echo -e "${YELLOW}║  Then wait 5-10 seconds and re-run this test script.       ║${NC}"
        echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        return 1
    fi
    
    log_info "Status: $(echo "$health" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)"
    
    # Check services
    all_ok=true
    
    if echo "$health" | grep -q '"connected":true'; then
        db_latency=$(echo "$health" | grep -o '"database":{[^}]*}' | grep -o '"latency":[0-9]*' | cut -d':' -f2)
        log_success "TimescaleDB connected (latency: ${db_latency}ms)"
    else
        log_error "TimescaleDB not connected"
        all_ok=false
    fi
    
    if echo "$health" | grep -q '"connected":true.*"redis"'; then
        redis_latency=$(echo "$health" | grep -o '"redis":{[^}]*}' | grep -o '"latency":[0-9]*' | cut -d':' -f2)
        log_success "Redis connected (latency: ${redis_latency}ms)"
    else
        log_error "Redis not connected"
        all_ok=false
    fi
    
    if echo "$health" | grep -q '"configured":true'; then
        remaining=$(echo "$health" | grep -o '"rateLimitRemaining":[0-9]*' | cut -d':' -f2)
        log_success "Finnhub configured (rate limit: ${remaining}/60)"
    else
        log_error "Finnhub not configured - check FINNHUB_API_KEY"
        all_ok=false
    fi
    
    candles_1m=$(echo "$health" | grep -o '"total1mCandles":[0-9]*' | cut -d':' -f2)
    candles_1h=$(echo "$health" | grep -o '"total1hCandles":[0-9]*' | cut -d':' -f2)
    candles_1d=$(echo "$health" | grep -o '"total1dCandles":[0-9]*' | cut -d':' -f2)
    log_info "Data stats: $candles_1m 1m candles, $candles_1h 1h candles, $candles_1d 1d candles"
    
    if [ "$all_ok" = true ]; then
        return 0
    else
        return 1
    fi
}

# Test 2: Data Collection
test_data_collection() {
    log_header "Test 2: Data Collection (${COLLECTION_TIME} seconds)"
    
    # Trigger quote fetch
    log_info "Fetching initial quotes..."
    quotes=$(api_call "/api/stocks")
    
    if [ "$quotes" = "null" ] || [ -z "$quotes" ]; then
        log_error "Failed to fetch quotes"
        return 1
    fi
    
    count=$(echo "$quotes" | grep -o '"count":[0-9]*' | cut -d':' -f2)
    log_success "Fetched $count stocks"
    
    # Wait for collection
    log_info "Collecting data for $COLLECTION_TIME seconds..."
    for ((i=COLLECTION_TIME; i>0; i-=5)); do
        sleep 5
        
        # Check buffer stats
        stats=$(api_call "/api/admin/buffer-stats")
        if [ "$stats" != "null" ]; then
            l1_buffers=$(echo "$stats" | grep -o '"l1Buffers":[0-9]*' | cut -d':' -f2)
            l1_updates=$(echo "$stats" | grep -o '"l1TotalUpdates":[0-9]*' | cut -d':' -f2)
            printf "  [%ds] L1 Buffers: %s, Updates: %s\r" "$i" "$l1_buffers" "$l1_updates"
        fi
    done
    echo "" # Newline
    
    # Final stats
    final_stats=$(api_call "/api/admin/buffer-stats")
    final_updates=$(echo "$final_stats" | grep -o '"l1TotalUpdates":[0-9]*' | cut -d':' -f2)
    
    if [ "$final_updates" -eq 0 ] 2>/dev/null; then
        log_warning "No data collected in L1 buffers"
        return 1
    fi
    
    log_success "Collected $final_updates updates in L1"
    return 0
}

# Test 3: L1 to Redis Flush
test_l1_to_redis() {
    log_header "Test 3: L1 → Redis Flush"
    
    # Get Redis memory before
    mem_before=$(docker_exec exec "$DOCKER_REDIS" redis-cli info memory 2>/dev/null | grep used_memory_human | cut -d: -f2 | tr -d '\r')
    log_info "Redis memory before: $mem_before"
    
    # Flush L1 to Redis
    flush=$(api_call "/api/admin/flush-cache" "POST")
    
    if [ "$flush" = "null" ] || [ -z "$flush" ]; then
        log_error "Flush failed"
        return 1
    fi
    
    l1_to_redis=$(echo "$flush" | grep -o '"l1ToRedis":[0-9]*' | cut -d':' -f2)
    redis_to_db=$(echo "$flush" | grep -o '"redisToDb":[0-9]*' | cut -d':' -f2)
    
    log_success "Flush complete: $l1_to_redis L1 buffers, $redis_to_db to DB"
    message=$(echo "$flush" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
    log_info "Message: $message"
    
    # Check Redis memory after
    mem_after=$(docker_exec exec "$DOCKER_REDIS" redis-cli info memory 2>/dev/null | grep used_memory_human | cut -d: -f2 | tr -d '\r')
    log_info "Redis memory after: $mem_after"
    
    # Check Redis has keys
    keys=$(docker_exec exec "$DOCKER_REDIS" redis-cli keys 'quotes:*' 2>/dev/null)
    if [ -n "$keys" ]; then
        key_count=$(echo "$keys" | wc -l)
        log_success "Redis has $key_count quote keys"
    else
        log_warning "No quote keys in Redis yet (may need more collection time)"
    fi
    
    return 0
}

# Test 4: TimescaleDB Persistence
test_database() {
    log_header "Test 4: TimescaleDB Persistence"
    
    # Count candles
    count=$(docker_exec exec "$DOCKER_DB" psql -U postgres -d aipulse -t -c "SELECT COUNT(*) FROM stock_candles_1m;" 2>/dev/null | tr -d ' \r')
    
    if [ -z "$count" ]; then
        log_error "Failed to query TimescaleDB"
        return 1
    fi
    
    if [ "$count" -gt 0 ] 2>/dev/null; then
        log_success "TimescaleDB has $count 1-minute candles"
    else
        log_warning "No candles in TimescaleDB yet (may need more time or flush)"
    fi
    
    # Show per-symbol stats
    symbol_stats=$(docker_exec exec "$DOCKER_DB" psql -U postgres -d aipulse -c "SELECT symbol, COUNT(*) as count, MIN(time) as earliest, MAX(time) as latest FROM stock_candles_1m GROUP BY symbol ORDER BY symbol;" 2>/dev/null)
    if [ -n "$symbol_stats" ]; then
        log_info "Per-symbol candle counts:"
        echo "$symbol_stats" | grep -E '^\s+[A-Z]+' | while read line; do
            echo "  $line"
        done
    fi
    
    return 0
}

# Test 5: Historical Data API
test_history_api() {
    log_header "Test 5: Historical Data API"
    
    symbols=("AAPL" "MSFT" "GOOGL")
    resolutions=("1h" "1d")
    
    for symbol in "${symbols[@]}"; do
        for resolution in "${resolutions[@]}"; do
            history=$(api_call "/api/stocks/$symbol/history?range=7d&resolution=$resolution")
            
            if [ "$history" != "null" ]; then
                candle_count=$(echo "$history" | grep -o '"candles":\[' | wc -l)
                partial=$(echo "$history" | grep -o '"partial":(true|false)' | cut -d':' -f2)
                
                if [ "$candle_count" -gt 0 ] 2>/dev/null; then
                    log_success "$symbol @ $resolution: candles available (partial: $partial)"
                else
                    log_warning "$symbol @ $resolution: No data yet"
                fi
            else
                log_warning "$symbol @ $resolution: API error"
            fi
        done
    done
    
    return 0
}

# Test 6: Restart Recovery
test_restart_recovery() {
    if [ "$SKIP_RECOVERY" = true ]; then
        log_header "Test 6: Restart Recovery (SKIPPED)"
        log_warning "Skipped due to --skip-recovery flag"
        return 0
    fi
    
    log_header "Test 6: Restart Recovery (CRITICAL)"
    log_info "This test simulates a crash and verifies data recovery"
    
    # Step 1: Collect some data
    log_info "Step 1: Collecting data..."
    api_call "/api/stocks" > /dev/null
    sleep 15
    
    # Step 2: Check we have L1 data
    stats=$(api_call "/api/admin/buffer-stats")
    l1_updates=$(echo "$stats" | grep -o '"l1TotalUpdates":[0-9]*' | cut -d':' -f2)
    log_info "L1 has $l1_updates updates"
    
    if [ "$l1_updates" -eq 0 ] 2>/dev/null; then
        log_warning "No L1 data to test recovery with"
        return 0
    fi
    
    # Step 3: Get current DB count
    db_count_before=$(docker_exec exec "$DOCKER_DB" psql -U postgres -d aipulse -t -c "SELECT COUNT(*) FROM stock_candles_1m;" 2>/dev/null | tr -d ' \r')
    db_count_before=${db_count_before:-0}
    log_info "DB has $db_count_before candles before restart"
    
    # Step 4: Kill the backend (simulate crash)
    log_info "Step 4: Killing backend process (simulating crash)..."
    
    # Find and kill node processes
    node_pids=$(pgrep -f "tsx watch" || pgrep -f "node.*server" || true)
    if [ -n "$node_pids" ]; then
        echo "$node_pids" | while read pid; do
            if [ -n "$pid" ]; then
                log_info "Killing PID $pid"
                kill -9 "$pid" 2>/dev/null || true
            fi
        done
        log_success "Backend killed"
    else
        log_warning "No Node processes found - may already be stopped"
    fi
    
    # Step 5: Wait and check Redis still has data
    sleep 2
    redis_keys=$(docker_exec exec "$DOCKER_REDIS" redis-cli keys 'quotes:*' 2>/dev/null)
    if [ -n "$redis_keys" ]; then
        key_count=$(echo "$redis_keys" | wc -l)
        log_success "Redis retained data: $key_count keys"
    else
        log_warning "No keys in Redis - data may have already been flushed"
    fi
    
    # Step 6: Restart backend
    log_info "Step 6: Restarting backend..."
    log_info "Please manually restart in another terminal: cd backend && npm run dev"
    log_info "Waiting 10 seconds for startup..."
    sleep 10
    
    # Step 7: Check recovery
    max_attempts=30
    attempt=0
    recovered=false
    
    while [ $attempt -lt $max_attempts ] && [ "$recovered" = false ]; do
        attempt=$((attempt + 1))
        
        health=$(api_call "/api/health")
        if [ "$health" != "null" ] && [ -n "$health" ]; then
            recovered=true
            break
        fi
        
        printf "  Attempt %d: Not ready yet...\r" "$attempt"
        sleep 1
    done
    echo "" # Newline
    
    if [ "$recovered" = false ]; then
        log_error "Backend did not restart within $max_attempts seconds"
        return 1
    fi
    
    log_success "Backend restarted"
    
    # Step 8: Verify DB has more data than before
    sleep 5 # Give recovery time
    db_count_after=$(docker_exec exec "$DOCKER_DB" psql -U postgres -d aipulse -t -c "SELECT COUNT(*) FROM stock_candles_1m;" 2>/dev/null | tr -d ' \r')
    db_count_after=${db_count_after:-0}
    log_info "DB has $db_count_after candles after restart"
    
    if [ "$db_count_after" -gt "$db_count_before" ] 2>/dev/null; then
        diff=$((db_count_after - db_count_before))
        log_success "Recovery successful: $diff candles recovered from Redis!"
    elif [ "$db_count_after" -eq "$db_count_before" ] 2>/dev/null; then
        log_info "No new candles - likely already flushed before restart"
    else
        log_error "Data loss detected!"
        return 1
    fi
    
    return 0
}

# Test 7: Graceful Shutdown
test_graceful_shutdown() {
    if [ "$SKIP_SHUTDOWN" = true ]; then
        log_header "Test 7: Graceful Shutdown (SKIPPED)"
        return 0
    fi
    
    log_header "Test 7: Graceful Shutdown"
    log_info "This test sends Ctrl+C (SIGINT) and verifies clean shutdown"
    
    # Make sure backend is running
    health=$(api_call "/api/health")
    if [ "$health" = "null" ] || [ -z "$health" ]; then
        log_error "Backend not running - start it first: cd backend && npm run dev"
        return 1
    fi
    
    # Collect some data
    log_info "Collecting data..."
    api_call "/api/stocks" > /dev/null
    sleep 10
    
    stats=$(api_call "/api/admin/buffer-stats")
    l1_updates=$(echo "$stats" | grep -o '"l1TotalUpdates":[0-9]*' | cut -d':' -f2)
    log_info "L1 has $l1_updates updates to flush"
    
    # Get DB count before
    db_count_before=$(docker_exec exec "$DOCKER_DB" psql -U postgres -d aipulse -t -c "SELECT COUNT(*) FROM stock_candles_1m;" 2>/dev/null | tr -d ' \r')
    db_count_before=${db_count_before:-0}
    
    echo ""
    log_warning "MANUAL ACTION REQUIRED:"
    log_info "   Press Ctrl+C in your backend terminal NOW!"
    log_info "   You should see shutdown messages..."
    log_info "   Then restart with: cd backend && npm run dev"
    echo ""
    read -p "   Press Enter when backend has restarted..."
    
    # Check backend is back
    max_attempts=10
    for ((i=0; i<max_attempts; i++)); do
        health=$(api_call "/api/health")
        if [ "$health" != "null" ] && [ -n "$health" ]; then
            break
        fi
        sleep 1
    done
    
    if [ "$health" = "null" ] || [ -z "$health" ]; then
        log_error "Backend did not restart"
        return 1
    fi
    
    # Check DB has more data
    sleep 2
    db_count_after=$(docker_exec exec "$DOCKER_DB" psql -U postgres -d aipulse -t -c "SELECT COUNT(*) FROM stock_candles_1m;" 2>/dev/null | tr -d ' \r')
    db_count_after=${db_count_after:-0}
    
    if [ "$db_count_after" -ge "$db_count_before" ] 2>/dev/null; then
        log_success "Graceful shutdown preserved all data"
    else
        log_error "Data loss after shutdown!"
        return 1
    fi
    
    return 0
}

# Main
main() {
    echo -e "${CYAN}"
    cat << "EOF"
╔════════════════════════════════════════════════════════════╗
║           AIPulse Persistence Test Suite                   ║
║                                                            ║
║  Testing three-tier cache architecture:                    ║
║  L1 (Memory) → L2 (Redis AOF) → L3 (TimescaleDB)         ║
╚════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
    
    start_time=$(date +%s)
    
    # Run all tests
    declare -a results
    
    if test_health; then
        results+=("Health Check:PASS")
    else
        results+=("Health Check:FAIL")
    fi
    
    if test_data_collection; then
        results+=("Data Collection:PASS")
    else
        results+=("Data Collection:FAIL")
    fi
    
    if test_l1_to_redis; then
        results+=("L1 to Redis:PASS")
    else
        results+=("L1 to Redis:FAIL")
    fi
    
    if test_database; then
        results+=("Database:PASS")
    else
        results+=("Database:FAIL")
    fi
    
    if test_history_api; then
        results+=("History API:PASS")
    else
        results+=("History API:FAIL")
    fi
    
    if test_restart_recovery; then
        results+=("Restart Recovery:PASS")
    else
        results+=("Restart Recovery:FAIL")
    fi
    
    if test_graceful_shutdown; then
        results+=("Graceful Shutdown:PASS")
    else
        results+=("Graceful Shutdown:FAIL")
    fi
    
    # Summary
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    
    log_header "Test Summary"
    
    passed=0
    failed=0
    
    for result in "${results[@]}"; do
        name=$(echo "$result" | cut -d: -f1)
        status=$(echo "$result" | cut -d: -f2)
        
        if [ "$status" = "PASS" ]; then
            log_success "$name"
            ((passed++))
        else
            log_error "$name"
            ((failed++))
        fi
    done
    
    echo ""
    echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
    if [ $failed -eq 0 ]; then
        echo -e "${GREEN}  Total: ${#results[@]} | Passed: $passed | Failed: $failed${NC}"
    else
        echo -e "${RED}  Total: ${#results[@]} | Passed: $passed | Failed: $failed${NC}"
    fi
    printf "${CYAN}  Duration: %02d:%02d${NC}\n" $((duration/60)) $((duration%60))
    echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
    
    # Return exit code
    if [ $failed -gt 0 ]; then
        exit 1
    fi
}

# Run main
main "$@"
