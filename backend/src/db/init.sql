-- AIPulse Database Initialization Script
-- Creates hypertables and indexes for time-series stock data

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- 1-minute candles table (raw data from Finnhub)
CREATE TABLE IF NOT EXISTS stock_candles_1m (
    time TIMESTAMPTZ NOT NULL,
    symbol TEXT NOT NULL,
    open DOUBLE PRECISION,
    high DOUBLE PRECISION,
    low DOUBLE PRECISION,
    close DOUBLE PRECISION,
    volume BIGINT,
    source TEXT DEFAULT 'finnhub', -- 'finnhub', 'cached', 'interpolated'
    PRIMARY KEY (time, symbol)
);

-- Convert to hypertable partitioned by time
SELECT create_hypertable('stock_candles_1m', 'time', 
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- 1-hour candles (aggregated from 1m)
CREATE TABLE IF NOT EXISTS stock_candles_1h (
    time TIMESTAMPTZ NOT NULL,
    symbol TEXT NOT NULL,
    open DOUBLE PRECISION,
    high DOUBLE PRECISION,
    low DOUBLE PRECISION,
    close DOUBLE PRECISION,
    volume BIGINT,
    source TEXT DEFAULT 'aggregated',
    PRIMARY KEY (time, symbol)
);

SELECT create_hypertable('stock_candles_1h', 'time', 
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

-- 1-day candles (aggregated from 1m or from Finnhub daily)
CREATE TABLE IF NOT EXISTS stock_candles_1d (
    time TIMESTAMPTZ NOT NULL,
    symbol TEXT NOT NULL,
    open DOUBLE PRECISION,
    high DOUBLE PRECISION,
    low DOUBLE PRECISION,
    close DOUBLE PRECISION,
    volume BIGINT,
    source TEXT DEFAULT 'aggregated',
    PRIMARY KEY (time, symbol)
);

SELECT create_hypertable('stock_candles_1d', 'time', 
    chunk_time_interval => INTERVAL '1 month',
    if_not_exists => TRUE
);

-- Latest quotes table (current real-time state)
CREATE TABLE IF NOT EXISTS latest_quotes (
    symbol TEXT PRIMARY KEY,
    current_price DOUBLE PRECISION,
    change DOUBLE PRECISION,
    change_percent DOUBLE PRECISION,
    high_price DOUBLE PRECISION,
    low_price DOUBLE PRECISION,
    open_price DOUBLE PRECISION,
    previous_close DOUBLE PRECISION,
    volume BIGINT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    source TEXT DEFAULT 'api'
);

-- System state for tracking data freshness
CREATE TABLE IF NOT EXISTS system_state (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_candles_1m_symbol_time ON stock_candles_1m (symbol, time DESC);
CREATE INDEX IF NOT EXISTS idx_candles_1h_symbol_time ON stock_candles_1h (symbol, time DESC);
CREATE INDEX IF NOT EXISTS idx_candles_1d_symbol_time ON stock_candles_1d (symbol, time DESC);

-- Compression policy for 1m candles (keep 30 days uncompressed, compress older)
-- Compression improves storage by ~90%
SELECT add_compression_policy('stock_candles_1m', INTERVAL '30 days');

-- Retention policies (disabled - we want unlimited storage)
-- Uncomment if you want to limit storage:
-- SELECT add_retention_policy('stock_candles_1m', INTERVAL '1 year');
-- SELECT add_retention_policy('stock_candles_1h', INTERVAL '2 years');

-- Continuous aggregate policy for 1h candles
CREATE MATERIALIZED VIEW IF NOT EXISTS stock_candles_1h_aggregation
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS time,
    symbol,
    first(open, time) AS open,
    max(high) AS high,
    min(low) AS low,
    last(close, time) AS close,
    sum(volume) AS volume,
    'aggregated'::TEXT AS source
FROM stock_candles_1m
GROUP BY time_bucket('1 hour', time), symbol
WITH NO DATA;

-- Refresh policy for 1h aggregation
SELECT add_continuous_aggregate_policy('stock_candles_1h_aggregation',
    start_offset => INTERVAL '1 month',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour'
);

-- Continuous aggregate policy for 1d candles
CREATE MATERIALIZED VIEW IF NOT EXISTS stock_candles_1d_aggregation
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS time,
    symbol,
    first(open, time) AS open,
    max(high) AS high,
    min(low) AS low,
    last(close, time) AS close,
    sum(volume) AS volume,
    'aggregated'::TEXT AS source
FROM stock_candles_1m
GROUP BY time_bucket('1 day', time), symbol
WITH NO DATA;

-- Refresh policy for 1d aggregation
SELECT add_continuous_aggregate_policy('stock_candles_1d_aggregation',
    start_offset => INTERVAL '3 months',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day'
);

-- Insert initial system state
INSERT INTO system_state (key, value) 
VALUES ('schema_version', '1.0.0'),
       ('last_recovery_check', NOW()::TEXT)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
