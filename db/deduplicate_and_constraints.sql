-- =============================================================================
-- Migrate existing PostgreSQL tables → TimescaleDB hypertables
-- =============================================================================
-- Run this ONCE on an existing database that was created with the old
-- plain-PostgreSQL schema.  It:
--   1. Enables the TimescaleDB extension
--   2. Deduplicates any existing rows (keeps the newest per unique key)
--   3. Drops old B-Tree indexes (hypertables create their own)
--   4. Converts each table to a hypertable with automatic time partitioning
--   5. Enables compression policies on older chunks
--   6. Creates continuous aggregates to replace the old materialized views
--
-- ⚠  Steps 4-6 CANNOT run inside a transaction, so they are placed after
--    the COMMIT.  Run the full file in one shot from the Supabase SQL Editor.
-- =============================================================================

-- 0. Enable TimescaleDB
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

BEGIN;

-- ── 1. Deduplicate existing data (keep newest physical row per unique key) ──

DELETE FROM stock_prices a
USING stock_prices b
WHERE a.ctid < b.ctid
  AND a.time   = b.time
  AND a.symbol = b.symbol;

DELETE FROM crypto_prices a
USING crypto_prices b
WHERE a.ctid < b.ctid
  AND a.time   = b.time
  AND a.symbol = b.symbol;

DELETE FROM price_indicators a
USING price_indicators b
WHERE a.ctid < b.ctid
  AND a.time       = b.time
  AND a.symbol     = b.symbol
  AND a.asset_type = b.asset_type;

-- ── 2. Drop old indexes (will be recreated by the hypertable) ───────────────

DROP INDEX IF EXISTS idx_stock_symbol_time;
DROP INDEX IF EXISTS idx_crypto_symbol_time;
DROP INDEX IF EXISTS idx_indicators_symbol_time;
DROP INDEX IF EXISTS uq_stock_time_symbol;
DROP INDEX IF EXISTS uq_crypto_time_symbol;
DROP INDEX IF EXISTS uq_indicators_time_symbol_asset;

-- ── 3. Re-create unique indexes (required for ON CONFLICT, must include time)

CREATE UNIQUE INDEX uq_stock_time_symbol
    ON stock_prices (time, symbol);

CREATE UNIQUE INDEX uq_crypto_time_symbol
    ON crypto_prices (time, symbol);

CREATE UNIQUE INDEX uq_indicators_time_symbol_asset
    ON price_indicators (time, symbol, asset_type);

-- ── 4. Drop old materialized views (replaced by continuous aggregates) ──────

DROP MATERIALIZED VIEW IF EXISTS stock_daily_summary;
DROP MATERIALIZED VIEW IF EXISTS crypto_daily_summary;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- The statements below run OUTSIDE the transaction because
-- create_hypertable / ALTER SET / continuous aggregates cannot be transactional.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 5. Convert tables to hypertables ────────────────────────────────────────

SELECT create_hypertable('stock_prices', 'time',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists       => TRUE,
    migrate_data        => TRUE
);

SELECT create_hypertable('crypto_prices', 'time',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists       => TRUE,
    migrate_data        => TRUE
);

SELECT create_hypertable('price_indicators', 'time',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists       => TRUE,
    migrate_data        => TRUE
);

-- ── 6. Enable compression ───────────────────────────────────────────────────

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

-- ── 7. Continuous aggregates (replace old materialized views) ───────────────

CREATE MATERIALIZED VIEW stock_daily_summary
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

CREATE MATERIALIZED VIEW crypto_daily_summary
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

-- Auto-refresh policies
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

-- Indexes on continuous aggregates
CREATE INDEX IF NOT EXISTS idx_stock_summary_bucket
    ON stock_daily_summary (bucket DESC, symbol);
CREATE INDEX IF NOT EXISTS idx_crypto_summary_bucket
    ON crypto_daily_summary (bucket DESC, symbol);

-- ── 8. Back-fill the continuous aggregates with existing data ────────────────
CALL refresh_continuous_aggregate('stock_daily_summary',  NULL, NOW());
CALL refresh_continuous_aggregate('crypto_daily_summary', NULL, NOW());
