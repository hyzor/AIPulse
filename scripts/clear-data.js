#!/usr/bin/env node

/**
 * Clear AIPulse cached data script
 *
 * Usage:
 *   npm run clear:data        - Clear both Redis and DB
 *   npm run clear:redis       - Clear Redis only
 *   npm run clear:db          - Clear database only
 */

import { createClient } from 'redis';
import { Pool } from 'pg';
import readline from 'readline';

const args = process.argv.slice(2);
const redisOnly = args.includes('--redis-only');
const dbOnly = args.includes('--db-only');
const clearAll = !redisOnly && !dbOnly;

// Colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function confirm(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (yes/no): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

async function clearRedis() {
  log('\n[Redis] Connecting...', 'cyan');

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const client = createClient({ url: redisUrl });

  try {
    await client.connect();

    // Get keys before clearing for reporting
    const allKeys = await client.keys('*');
    const quoteKeys = allKeys.filter((k) => k.startsWith('quote:'));
    const candleKeys = allKeys.filter((k) => k.startsWith('candles:'));
    const latestKeys = allKeys.filter((k) => k.startsWith('latest:'));

    log(`  Found ${allKeys.length} total keys:`, 'blue');
    log(`    - ${quoteKeys.length} quote keys`, 'blue');
    log(`    - ${candleKeys.length} candle keys`, 'blue');
    log(`    - ${latestKeys.length} latest quote keys`, 'blue');

    // Clear all keys
    await client.flushDb();

    log('  ✓ Redis cleared successfully', 'green');
    await client.disconnect();
  } catch (error) {
    log(`  ✗ Redis error: ${error.message}`, 'red');
    throw error;
  }
}

async function clearDatabase() {
  log('\n[Database] Connecting...', 'cyan');

  const connectionString = process.env.DATABASE_URL
    || 'postgresql://postgres:postgres@localhost:5432/aipulse';

  const pool = new Pool({
    connectionString,
    max: 5,
  });

  try {
    // Get counts before clearing
    const quoteCount = await pool.query('SELECT COUNT(*) FROM latest_quotes');
    const candle1mCount = await pool.query('SELECT COUNT(*) FROM stock_candles_1m');
    const candle1hCount = await pool.query('SELECT COUNT(*) FROM stock_candles_1h');
    const candle1dCount = await pool.query('SELECT COUNT(*) FROM stock_candles_1d');

    log(`  Current data:`, 'blue');
    log(`    - ${quoteCount.rows[0].count} latest quotes`, 'blue');
    log(`    - ${candle1mCount.rows[0].count} 1m candles`, 'blue');
    log(`    - ${candle1hCount.rows[0].count} 1h candles`, 'blue');
    log(`    - ${candle1dCount.rows[0].count} 1d candles`, 'blue');

    // Clear latest quotes (preserves historical candle data)
    await pool.query('TRUNCATE TABLE latest_quotes');

    log('  ✓ Database latest_quotes cleared', 'green');
    log('  Note: Historical candle data preserved (1m/1h/1d candles)', 'yellow');

    await pool.end();
  } catch (error) {
    log(`  ✗ Database error: ${error.message}`, 'red');
    throw error;
  }
}

async function main() {
  log('\n╔════════════════════════════════════════════════╗', 'cyan');
  log('║        AIPulse Data Clear Utility              ║', 'cyan');
  log('╚════════════════════════════════════════════════╝', 'cyan');

  if (clearAll) {
    log('\nThis will clear:', 'yellow');
    log('  - Redis cache (all quote data)', 'yellow');
    log('  - Database latest_quotes table', 'yellow');
    log('  - Note: Historical candle data will be preserved\n', 'yellow');
  } else if (redisOnly) {
    log('\nThis will clear Redis cache only\n', 'yellow');
  } else if (dbOnly) {
    log('\nThis will clear database latest_quotes only\n', 'yellow');
  }

  const confirmed = await confirm('Are you sure you want to proceed?');

  if (!confirmed) {
    log('\nOperation cancelled.', 'yellow');
    process.exit(0);
  }

  try {
    if (clearAll || redisOnly) {
      await clearRedis();
    }

    if (clearAll || dbOnly) {
      await clearDatabase();
    }

    log('\n╔════════════════════════════════════════════════╗', 'green');
    log('║           Clear operation complete!            ║', 'green');
    log('╚════════════════════════════════════════════════╝', 'green');
    log('\nNext steps:', 'cyan');
    log('  1. Click "Refresh" on stocks to fetch fresh data', 'blue');
    log('  2. Data will have correct timestamps from Finnhub', 'blue');
    log('  3. Timestamps will be in seconds (Unix format)\n', 'blue');

  } catch (error) {
    log(`\n✗ Operation failed: ${error.message}`, 'red');
    process.exit(1);
  }
}

main();
