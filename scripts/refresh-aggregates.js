#!/usr/bin/env node
/**
 * Refresh TimescaleDB Continuous Aggregates
 *
 * This script manually refreshes the continuous aggregate views
 * to populate 1h and 1d candles from existing 1m data.
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envPath = path.resolve(__dirname, '../backend/.env');
dotenv.config({ path: envPath });

const connectionString = process.env.DATABASE_URL
  || 'postgresql://postgres:postgres@localhost:5432/aipulse';

const pool = new Pool({
  connectionString,
  max: 5,
  connectionTimeoutMillis: 5000,
});

async function refreshContinuousAggregates() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     Refreshing TimescaleDB Continuous Aggregates            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Check current counts
    console.log('📊 Current data counts:');
    const countsBefore = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM stock_candles_1m) as candles_1m,
        (SELECT COUNT(*) FROM stock_candles_1h) as candles_1h,
        (SELECT COUNT(*) FROM stock_candles_1d) as candles_1d
    `);
    console.log(`   1m candles: ${countsBefore.rows[0].candles_1m}`);
    console.log(`   1h candles: ${countsBefore.rows[0].candles_1h}`);
    console.log(`   1d candles: ${countsBefore.rows[0].candles_1d}`);

    // Refresh 1h continuous aggregate
    console.log('\n🔄 Refreshing 1h continuous aggregate...');
    const start1h = Date.now();
    await pool.query(`
      CALL refresh_continuous_aggregate('stock_candles_1h_aggregation', NULL, NULL);
    `);
    const duration1h = Date.now() - start1h;
    console.log(`   ✓ 1h refresh complete (${duration1h}ms)`);

    // Refresh 1d continuous aggregate
    console.log('\n🔄 Refreshing 1d continuous aggregate...');
    const start1d = Date.now();
    await pool.query(`
      CALL refresh_continuous_aggregate('stock_candles_1d_aggregation', NULL, NULL);
    `);
    const duration1d = Date.now() - start1d;
    console.log(`   ✓ 1d refresh complete (${duration1d}ms)`);

    // Check counts after refresh
    console.log('\n📊 Data counts after refresh:');
    const countsAfter = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM stock_candles_1m) as candles_1m,
        (SELECT COUNT(*) FROM stock_candles_1h) as candles_1h,
        (SELECT COUNT(*) FROM stock_candles_1d) as candles_1d
    `);
    console.log(`   1m candles: ${countsAfter.rows[0].candles_1m}`);
    console.log(`   1h candles: ${countsAfter.rows[0].candles_1h} (+${countsAfter.rows[0].candles_1h - countsBefore.rows[0].candles_1h})`);
    console.log(`   1d candles: ${countsAfter.rows[0].candles_1d} (+${countsAfter.rows[0].candles_1d - countsBefore.rows[0].candles_1d})`);

    // Get symbols with data in each resolution
    console.log('\n📈 Symbols with data:');
    const symbols1m = await pool.query(`SELECT DISTINCT symbol FROM stock_candles_1m ORDER BY symbol`);
    const symbols1h = await pool.query(`SELECT DISTINCT symbol FROM stock_candles_1h ORDER BY symbol`);
    const symbols1d = await pool.query(`SELECT DISTINCT symbol FROM stock_candles_1d ORDER BY symbol`);
    console.log(`   1m: ${symbols1m.rows.map(r => r.symbol).join(', ')}`);
    console.log(`   1h: ${symbols1h.rows.map(r => r.symbol).join(', ')}`);
    console.log(`   1d: ${symbols1d.rows.map(r => r.symbol).join(', ')}`);

    console.log('\n✅ Continuous aggregates refreshed successfully!');
    console.log('   Charts should now display historical data.');
    console.log('\n📝 Note: In production, continuous aggregates auto-refresh every hour.');

  } catch (error) {
    console.error('\n❌ Error refreshing continuous aggregates:', error.message);
    if (error.message.includes('stock_candles_1h_aggregation')) {
      console.error('\n   The continuous aggregate views may not exist.');
      console.error('   Please run the database initialization first:');
      console.error('   psql -d aipulse -f backend/src/db/init.sql');
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
const isMainModule = import.meta.url.startsWith('file:') && process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMainModule) {
  refreshContinuousAggregates().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { refreshContinuousAggregates };
