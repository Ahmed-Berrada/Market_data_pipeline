-- =============================================================================
-- Market Data Pipeline — TimescaleDB Schema
-- =============================================================================
--
-- TimescaleDB extends PostgreSQL with time-series superpowers:
--   • Hypertables:            auto-partition by time → fast range queries
--   • Continuous Aggregates:  materialized views that auto-refresh
--   • Compression:            10-20× storage reduction on older chunks
--   • time_bucket() / first() / last(): native time-series functions
--
-- To enable on Supabase: run this file in the SQL Editor.
-- =============================================================================

-- 0. Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- =============================================================================
-- 1. Stock prices (OHLCV)
-- =============================================================================
CREATE TABLE IF NOT EXISTS stock_prices (
    time        TIMESTAMPTZ     NOT NULL,
    symbol      TEXT            NOT NULL,
    open        NUMERIC(18, 6),
    high        NUMERIC(18, 6),
    low         NUMERIC(18, 6),
    close       NUMERIC(18, 6),
    volume      BIGINT,
    source      TEXT            DEFAULT 'yfinance'
);

-- Unique constraint must include the partition column (time) for hypertables
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_time_symbol
    ON stock_prices (time, symbol);

-- Convert to hypertable — auto-partitions data into time-based chunks.
-- chunk_time_interval = 7 days balances query speed vs chunk count.
SELECT create_hypertable('stock_prices', 'time',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists       => TRUE,
    migrate_data        => TRUE
);

-- =============================================================================
-- 2. Crypto prices (OHLCV)
-- =============================================================================
CREATE TABLE IF NOT EXISTS crypto_prices (
    time        TIMESTAMPTZ     NOT NULL,
    symbol      TEXT            NOT NULL,
    open        NUMERIC(18, 6),
    high        NUMERIC(18, 6),
    low         NUMERIC(18, 6),
    close       NUMERIC(18, 6),
    volume      NUMERIC(28, 8),
    source      TEXT            DEFAULT 'coingecko'
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crypto_time_symbol
    ON crypto_prices (time, symbol);

SELECT create_hypertable('crypto_prices', 'time',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists       => TRUE,
    migrate_data        => TRUE
);

-- =============================================================================
-- 3. Derived indicators
-- =============================================================================
CREATE TABLE IF NOT EXISTS price_indicators (
    time            TIMESTAMPTZ     NOT NULL,
    symbol          TEXT            NOT NULL,
    asset_type      TEXT            NOT NULL,
    close           NUMERIC(18, 6),
    sma_20          NUMERIC(18, 6),
    sma_50          NUMERIC(18, 6),
    daily_return    NUMERIC(10, 6)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_indicators_time_symbol_asset
    ON price_indicators (time, symbol, asset_type);

SELECT create_hypertable('price_indicators', 'time',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists       => TRUE,
    migrate_data        => TRUE
);

-- =============================================================================
-- 4. Pipeline run log  (regular table — not time-series)
-- =============================================================================
CREATE TABLE IF NOT EXISTS pipeline_runs (
    id              SERIAL          PRIMARY KEY,
    run_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    dag_id          TEXT            NOT NULL,
    status          TEXT            NOT NULL,
    rows_inserted   INTEGER         DEFAULT 0,
    error_message   TEXT,
    duration_seconds NUMERIC(8, 2)
);

-- =============================================================================
-- 5. Continuous Aggregates — auto-refreshing daily summaries
-- =============================================================================
-- These replace standard MATERIALIZED VIEWs.  Advantages:
--   • Auto-refresh via background policies (no manual REFRESH needed)
--   • Use TimescaleDB's first()/last() for correct OHLC aggregation
--   • Query performance is dramatically better than scanning raw tables
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS stock_daily_summary
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time)  AS bucket,
    symbol,
    first(open, time)           AS open,
    MAX(high)                   AS high,
    MIN(low)                    AS low,
    last(close, time)           AS close,
    SUM(volume)                 AS volume
FROM stock_prices
GROUP BY bucket, symbol
WITH NO DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS crypto_daily_summary
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time)  AS bucket,
    symbol,
    first(open, time)           AS open,
    MAX(high)                   AS high,
    MIN(low)                    AS low,
    last(close, time)           AS close,
    SUM(volume)                 AS volume
FROM crypto_prices
GROUP BY bucket, symbol
WITH NO DATA;

-- Auto-refresh policies: refresh the last 3 days every hour
SELECT add_continuous_aggregate_policy('stock_daily_summary',
    start_offset      => INTERVAL '3 days',
    end_offset        => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists     => TRUE
);

SELECT add_continuous_aggregate_policy('crypto_daily_summary',
    start_offset      => INTERVAL '3 days',
    end_offset        => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists     => TRUE
);

-- Indexes on continuous aggregates for fast dashboard queries
CREATE INDEX IF NOT EXISTS idx_stock_summary_bucket
    ON stock_daily_summary (bucket DESC, symbol);
CREATE INDEX IF NOT EXISTS idx_crypto_summary_bucket
    ON crypto_daily_summary (bucket DESC, symbol);

-- =============================================================================
-- 6. Compression Policies — shrink old data automatically
-- =============================================================================
-- Compression reduces storage 10-20× and speeds up analytical scans.
-- Chunks older than 7 days are compressed (data stays queryable, just read-only).
-- =============================================================================

ALTER TABLE stock_prices SET (
    timescaledb.compress,
    timescaledb.compress_segmentby  = 'symbol',
    timescaledb.compress_orderby    = 'time DESC'
);

ALTER TABLE crypto_prices SET (
    timescaledb.compress,
    timescaledb.compress_segmentby  = 'symbol',
    timescaledb.compress_orderby    = 'time DESC'
);

ALTER TABLE price_indicators SET (
    timescaledb.compress,
    timescaledb.compress_segmentby  = 'symbol, asset_type',
    timescaledb.compress_orderby    = 'time DESC'
);

SELECT add_compression_policy('stock_prices',     INTERVAL '7 days', if_not_exists => TRUE);
SELECT add_compression_policy('crypto_prices',    INTERVAL '7 days', if_not_exists => TRUE);
SELECT add_compression_policy('price_indicators', INTERVAL '7 days', if_not_exists => TRUE);