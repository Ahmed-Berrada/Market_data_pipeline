-- =============================================================================
-- Market Data Pipeline — TimescaleDB Schema
-- =============================================================================
-- This script runs automatically when the TimescaleDB container starts
-- for the first time (mounted at /docker-entrypoint-initdb.d/).
--
-- Key concept: hypertables
-- A hypertable looks exactly like a normal PostgreSQL table but TimescaleDB
-- automatically partitions it by time under the hood. This makes time-range
-- queries (e.g. "give me all prices for last 30 days") extremely fast.
-- =============================================================================

-- Enable the TimescaleDB extension (pre-installed in the image)
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- =============================================================================
-- 1. Stock prices (OHLCV)
-- =============================================================================
-- One row per symbol per time interval (e.g. one row = AAPL at 9:30am)
-- 'symbol' stores the ticker: 'AAPL', 'MSFT', 'GOOGL', etc.

CREATE TABLE IF NOT EXISTS stock_prices (
    time        TIMESTAMPTZ     NOT NULL,
    symbol      TEXT            NOT NULL,
    open        NUMERIC(18, 6),
    high        NUMERIC(18, 6),
    low         NUMERIC(18, 6),
    close       NUMERIC(18, 6),
    volume      BIGINT,
    source      TEXT            DEFAULT 'yfinance'  -- which API gave us this data
);

-- Convert to hypertable, partitioned by 'time'
SELECT create_hypertable('stock_prices', 'time', if_not_exists => TRUE);

-- Index on symbol so queries like "all AAPL rows" are fast
CREATE INDEX IF NOT EXISTS idx_stock_symbol_time
    ON stock_prices (symbol, time DESC);

-- =============================================================================
-- 2. Crypto prices (OHLCV)
-- =============================================================================
-- Same structure as stocks but volume can be fractional (e.g. 0.5 BTC)

CREATE TABLE IF NOT EXISTS crypto_prices (
    time        TIMESTAMPTZ     NOT NULL,
    symbol      TEXT            NOT NULL,   -- 'BTC', 'ETH', 'SOL', etc.
    open        NUMERIC(18, 6),
    high        NUMERIC(18, 6),
    low         NUMERIC(18, 6),
    close       NUMERIC(18, 6),
    volume      NUMERIC(28, 8), -- larger precision for small coins
    source      TEXT            DEFAULT 'coingecko'
);

SELECT create_hypertable('crypto_prices', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_crypto_symbol_time
    ON crypto_prices (symbol, time DESC);

-- =============================================================================
-- 3. Derived indicators (computed by the transform layer)
-- =============================================================================
-- Instead of recomputing moving averages on every API request,
-- we pre-compute them during the pipeline run and store them here.

CREATE TABLE IF NOT EXISTS price_indicators (
    time            TIMESTAMPTZ     NOT NULL,
    symbol          TEXT            NOT NULL,
    asset_type      TEXT            NOT NULL,   -- 'stock' or 'crypto'
    close           NUMERIC(18, 6),
    sma_20          NUMERIC(18, 6), -- 20-period simple moving average
    sma_50          NUMERIC(18, 6), -- 50-period simple moving average
    daily_return    NUMERIC(10, 6)  -- (close_today - close_yesterday) / close_yesterday
);

SELECT create_hypertable('price_indicators', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_indicators_symbol_time
    ON price_indicators (symbol, time DESC);

-- =============================================================================
-- 4. Pipeline run log
-- =============================================================================
-- Tracks every pipeline execution: when it ran, how many rows it inserted,
-- whether it succeeded. This powers the "pipeline status" card on the dashboard.

CREATE TABLE IF NOT EXISTS pipeline_runs (
    id              SERIAL          PRIMARY KEY,
    run_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    dag_id          TEXT            NOT NULL,   -- e.g. 'stocks_daily', 'crypto_hourly'
    status          TEXT            NOT NULL,   -- 'success' | 'failed' | 'partial'
    rows_inserted   INTEGER         DEFAULT 0,
    error_message   TEXT,
    duration_seconds NUMERIC(8, 2)
);

-- =============================================================================
-- Continuous aggregate: daily OHLCV summary (TimescaleDB feature)
-- =============================================================================
-- This is a materialised view that TimescaleDB keeps up to date automatically.
-- Instead of scanning all tick data for "daily candles", the DB reads this
-- pre-aggregated view — dramatically faster for dashboard chart rendering.

CREATE MATERIALIZED VIEW IF NOT EXISTS stock_daily_summary
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time)  AS bucket,
    symbol,
    FIRST(open, time)           AS open,
    MAX(high)                   AS high,
    MIN(low)                    AS low,
    LAST(close, time)           AS close,
    SUM(volume)                 AS volume
FROM stock_prices
GROUP BY bucket, symbol
WITH NO DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS crypto_daily_summary
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time)  AS bucket,
    symbol,
    FIRST(open, time)           AS open,
    MAX(high)                   AS high,
    MIN(low)                    AS low,
    LAST(close, time)           AS close,
    SUM(volume)                 AS volume
FROM crypto_prices
GROUP BY bucket, symbol
WITH NO DATA;

-- Refresh policies: TimescaleDB will auto-refresh these views
-- whenever data newer than 2 days old is added
SELECT add_continuous_aggregate_policy('stock_daily_summary',
    start_offset => INTERVAL '3 days',
    end_offset   => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

SELECT add_continuous_aggregate_policy('crypto_daily_summary',
    start_offset => INTERVAL '3 days',
    end_offset   => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);
