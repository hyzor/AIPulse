-- Migration: Enable Real-Time Aggregation for Continuous Aggregates
-- This fixes the issue where charts show data lagging by 1 hour
--
-- When: April 2026
-- Why: The continuous aggregate views were configured with materialized_only=true (default),
--      which means they only return pre-computed data and exclude the most recent
--      (incomplete) time bucket. For live charts, we need real-time aggregation that
--      combines materialized data with raw data from the source table.
--
-- How: ALTER MATERIALIZED VIEW with timescaledb.materialized_only = false
--      This enables real-time querying that includes current incomplete hours.
--
-- Apply to container named 'aipulse-db':
--   docker exec -i aipulse-db psql -U postgres -d aipulse < backend/src/db/migrations/001_enable_realtime_aggregation.sql

-- Enable real-time aggregation for 1-hour candles
ALTER MATERIALIZED VIEW stock_candles_1h_aggregation SET (timescaledb.materialized_only = false);

-- Enable real-time aggregation for 1-day candles
ALTER MATERIALIZED VIEW stock_candles_1d_aggregation SET (timescaledb.materialized_only = false);

-- Refresh the views to ensure data is current
CALL refresh_continuous_aggregate('stock_candles_1h_aggregation', NULL, NULL);
CALL refresh_continuous_aggregate('stock_candles_1d_aggregation', NULL, NULL);

-- Verify the change
SELECT view_name, materialized_only
FROM timescaledb_information.continuous_aggregates
WHERE view_name IN ('stock_candles_1h_aggregation', 'stock_candles_1d_aggregation');
