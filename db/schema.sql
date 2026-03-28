-- =============================================================================
-- Market Data Pipeline — Standard PostgreSQL Schema
-- =============================================================================

-- 1. Stock prices (OHLCV)
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

-- In standard Postgres, we just use a regular B-Tree index for performance
CREATE INDEX IF NOT EXISTS idx_stock_symbol_time ON stock_prices (symbol, time DESC);

-- 2. Crypto prices (OHLCV)
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

CREATE INDEX IF NOT EXISTS idx_crypto_symbol_time ON crypto_prices (symbol, time DESC);

-- 3. Derived indicators
CREATE TABLE IF NOT EXISTS price_indicators (
    time            TIMESTAMPTZ     NOT NULL,
    symbol          TEXT            NOT NULL,
    asset_type      TEXT            NOT NULL,
    close           NUMERIC(18, 6),
    sma_20          NUMERIC(18, 6),
    sma_50          NUMERIC(18, 6),
    daily_return    NUMERIC(10, 6)
);

CREATE INDEX IF NOT EXISTS idx_indicators_symbol_time ON price_indicators (symbol, time DESC);

-- 4. Pipeline run log
CREATE TABLE IF NOT EXISTS pipeline_runs (
    id              SERIAL          PRIMARY KEY,
    run_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    dag_id          TEXT            NOT NULL,
    status          TEXT            NOT NULL,
    rows_inserted   INTEGER         DEFAULT 0,
    error_message   TEXT,
    duration_seconds NUMERIC(8, 2)
);

-- 5. Daily Summaries (Standard Materialized Views)
-- Note: 'time_bucket' is replaced by 'date_trunc'.
-- 'FIRST' and 'LAST' are replaced by standard aggregate logic.

CREATE MATERIALIZED VIEW IF NOT EXISTS stock_daily_summary AS
SELECT
    date_trunc('day', time) AS bucket,
    symbol,
    (ARRAY_AGG(open ORDER BY time ASC))[1]  AS open,
    MAX(high)                               AS high,
    MIN(low)                                AS low,
    (ARRAY_AGG(close ORDER BY time DESC))[1] AS close,
    SUM(volume)                             AS volume
FROM stock_prices
GROUP BY bucket, symbol;

CREATE MATERIALIZED VIEW IF NOT EXISTS crypto_daily_summary AS
SELECT
    date_trunc('day', time) AS bucket,
    symbol,
    (ARRAY_AGG(open ORDER BY time ASC))[1]  AS open,
    MAX(high)                               AS high,
    MIN(low)                                AS low,
    (ARRAY_AGG(close ORDER BY time DESC))[1] AS close,
    SUM(volume)                             AS volume
FROM crypto_prices
GROUP BY bucket, symbol;

-- Indexes on Materialized Views for faster dashboard loading
CREATE INDEX IF NOT EXISTS idx_stock_summary_bucket ON stock_daily_summary (bucket DESC, symbol);
CREATE INDEX IF NOT EXISTS idx_crypto_summary_bucket ON crypto_daily_summary (bucket DESC, symbol);