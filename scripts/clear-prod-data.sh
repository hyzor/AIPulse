#!/bin/bash
# Clear AIPulse production data (Docker environment)
# Usage: ./clear-prod-data.sh [--redis-only|--db-only]
#
# Options:
#   --redis-only    Clear only Redis cache
#   --db-only       Clear only database latest_quotes
#   (no args)       Clear both Redis and database

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Parse arguments
REDIS_ONLY=false
DB_ONLY=false

for arg in "$@"; do
  case $arg in
    --redis-only)
      REDIS_ONLY=true
      shift
      ;;
    --db-only)
      DB_ONLY=true
      shift
      ;;
    *)
      # Unknown option
      ;;
  esac
done

clear_all=true
if [ "$REDIS_ONLY" = true ] || [ "$DB_ONLY" = true ]; then
  clear_all=false
fi

# Print banner
echo -e "${CYAN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     AIPulse Production Data Clear Utility      ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════╝${NC}"
echo ""

# Confirmation
if [ "$clear_all" = true ]; then
  echo -e "${YELLOW}This will clear:${NC}"
  echo -e "  - Redis cache (container: ${BLUE}aipulse-redis${NC})"
  echo -e "  - Database latest_quotes (container: ${BLUE}aipulse-db${NC})"
  echo -e "  - ${YELLOW}Historical candle data will be preserved${NC}"
else
  if [ "$REDIS_ONLY" = true ]; then
    echo -e "${YELLOW}This will clear Redis cache only${NC}"
  fi
  if [ "$DB_ONLY" = true ]; then
    echo -e "${YELLOW}This will clear database latest_quotes only${NC}"
  fi
fi

echo ""
read -p "Are you sure you want to proceed? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
  echo -e "${YELLOW}Operation cancelled.${NC}"
  exit 0
fi

echo ""

# Clear Redis
if [ "$clear_all" = true ] || [ "$REDIS_ONLY" = true ]; then
  echo -e "${CYAN}[Redis] Connecting to aipulse-redis...${NC}"

  # Get key count before clearing
  key_count=$(docker exec aipulse-redis redis-cli DBSIZE 2>/dev/null || echo "0")
  echo -e "  ${BLUE}Found $key_count keys${NC}"

  # Clear Redis
  if docker exec aipulse-redis redis-cli FLUSHDB > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓ Redis cleared successfully${NC}"
  else
    echo -e "  ${RED}✗ Failed to clear Redis${NC}"
    exit 1
  fi
fi

# Clear Database
if [ "$clear_all" = true ] || [ "$DB_ONLY" = true ]; then
  echo -e "${CYAN}[Database] Connecting to aipulse-db...${NC}"

  # Get count before clearing
  count=$(docker exec aipulse-db psql -U postgres -d aipulse -t -c "SELECT COUNT(*) FROM latest_quotes;" 2>/dev/null | tr -d ' ' || echo "0")
  echo -e "  ${BLUE}Found $count latest quotes${NC}"

  # Truncate table
  if docker exec aipulse-db psql -U postgres -d aipulse -c "TRUNCATE TABLE latest_quotes;" > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓ Database latest_quotes cleared${NC}"
    echo -e "  ${YELLOW}Note: Historical candle data (1m/1h/1d) preserved${NC}"
  else
    echo -e "  ${RED}✗ Failed to clear database${NC}"
    exit 1
  fi
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Clear operation complete!            ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Next steps:${NC}"
echo -e "  ${BLUE}1. Click 'Refresh' on stocks to fetch fresh data${NC}"
echo -e "  ${BLUE}2. Data will have correct timestamps from Finnhub${NC}"
echo -e "  ${BLUE}3. Timestamps will be in seconds (Unix format)${NC}"
echo ""
