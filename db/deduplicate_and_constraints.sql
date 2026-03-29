-- Run this once on an existing database before enabling frequent schedulers.
-- It removes duplicate rows, then creates uniqueness guarantees used by ON CONFLICT.

BEGIN;

-- Keep the newest physical row per (time, symbol)
DELETE FROM stock_prices a
USING stock_prices b
WHERE a.ctid < b.ctid
  AND a.time = b.time
  AND a.symbol = b.symbol;

DELETE FROM crypto_prices a
USING crypto_prices b
WHERE a.ctid < b.ctid
  AND a.time = b.time
  AND a.symbol = b.symbol;

DELETE FROM price_indicators a
USING price_indicators b
WHERE a.ctid < b.ctid
  AND a.time = b.time
  AND a.symbol = b.symbol
  AND a.asset_type = b.asset_type;

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_time_symbol
  ON stock_prices (time, symbol);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crypto_time_symbol
  ON crypto_prices (time, symbol);

CREATE UNIQUE INDEX IF NOT EXISTS uq_indicators_time_symbol_asset
  ON price_indicators (time, symbol, asset_type);

COMMIT;

