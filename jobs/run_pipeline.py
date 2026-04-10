"""
jobs/run_pipeline.py
====================
Standalone ETL runner for Cloud Run Jobs.

Replaces Airflow for cloud deployment — runs the same extract → transform → load
pipeline as the DAGs but without any Airflow dependency.

Usage:
    python -m jobs.run_pipeline --pipeline stocks
    python -m jobs.run_pipeline --pipeline crypto

Environment variables required:
    DATABASE_URL        — TimescaleDB connection string
    X_CG_DEMO_API_KEY  — CoinGecko demo API key (crypto only)
"""

import argparse
import logging
import sys
import time
from datetime import datetime, timedelta, timezone, date
from io import StringIO

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("pipeline-job")

# ---------------------------------------------------------------------------
# Ensure project root is importable
# ---------------------------------------------------------------------------
sys.path.insert(0, "/app")          # inside Cloud Run container
sys.path.insert(0, ".")             # local dev


def run_stocks():
    """Run the full stocks ETL pipeline (same logic as stock_dag.py)."""
    import pandas as pd
    from extractors.yfinance_extractor import fetch_ohlcv
    from transformers.ohlcv_transformer import transform
    from loaders.timescale_loader import (
        load_stock_prices,
        load_indicators,
        log_pipeline_run,
        refresh_continuous_aggregates,
    )

    symbols = ["SPY", "NVDA", "MSFT", "SIE.DE", "GOOGL", "PLTR", "URTH"]

    # ── Extract ───────────────────────────────────────────────────────────
    end_date = date.today()
    start_date = end_date - timedelta(days=7)

    logger.info("Extracting stocks %s  [%s → %s]", symbols, start_date, end_date)
    raw_df = fetch_ohlcv(symbols, start_date=start_date, end_date=end_date, interval="1m")

    if raw_df.empty:
        logger.warning("No stock data fetched (market closed?). Skipping.")
        log_pipeline_run("stocks_1min", "skipped", rows_inserted=0, duration_seconds=0)
        return

    # ── Transform ─────────────────────────────────────────────────────────
    raw_df["time"] = pd.to_datetime(raw_df["time"], utc=True)
    clean_df, indicators_df = transform(raw_df, asset_type="stock")
    logger.info("Transformed: %d clean rows, %d indicator rows", len(clean_df), len(indicators_df))

    # ── Load ──────────────────────────────────────────────────────────────
    rows_prices = load_stock_prices(clean_df)
    rows_indicators = load_indicators(indicators_df)
    total = rows_prices + rows_indicators
    logger.info("Loaded: %d price + %d indicator = %d total", rows_prices, rows_indicators, total)

    # ── Post-load ─────────────────────────────────────────────────────────
    refresh_continuous_aggregates()
    return total


def run_crypto():
    """Run the full crypto ETL pipeline (same logic as crypto_dag.py)."""
    import pandas as pd
    from extractors.coingecko_extractor import fetch_ohlcv
    from transformers.ohlcv_transformer import transform
    from loaders.timescale_loader import (
        load_crypto_prices,
        load_indicators,
        log_pipeline_run,
        refresh_continuous_aggregates,
    )

    symbols = ["BTC", "ETH", "SOL", "XRP"]

    # ── Extract ───────────────────────────────────────────────────────────
    end_dt = datetime.now(timezone.utc)
    start_dt = end_dt - timedelta(hours=24)

    logger.info("Extracting crypto %s  [%s → %s]", symbols, start_dt.isoformat(), end_dt.isoformat())
    raw_df = fetch_ohlcv(symbols, start_dt=start_dt, end_dt=end_dt, interval="5min")

    if raw_df.empty:
        logger.warning("No crypto data fetched. Skipping.")
        log_pipeline_run("crypto_5min", "skipped", rows_inserted=0, duration_seconds=0)
        return

    # ── Transform ─────────────────────────────────────────────────────────
    raw_df["time"] = pd.to_datetime(raw_df["time"], utc=True)
    clean_df, indicators_df = transform(raw_df, asset_type="crypto")
    logger.info("Transformed: %d clean rows, %d indicator rows", len(clean_df), len(indicators_df))

    # ── Load ──────────────────────────────────────────────────────────────
    rows_prices = load_crypto_prices(clean_df)
    rows_indicators = load_indicators(indicators_df)
    total = rows_prices + rows_indicators
    logger.info("Loaded: %d price + %d indicator = %d total", rows_prices, rows_indicators, total)

    # ── Post-load ─────────────────────────────────────────────────────────
    refresh_continuous_aggregates()
    return total


def main():
    parser = argparse.ArgumentParser(description="Market Data Pipeline — Cloud Run Job")
    parser.add_argument(
        "--pipeline",
        required=True,
        choices=["stocks", "crypto"],
        help="Which pipeline to run",
    )
    args = parser.parse_args()

    t0 = time.time()
    pipeline_name = "stocks_1min" if args.pipeline == "stocks" else "crypto_5min"

    try:
        if args.pipeline == "stocks":
            total = run_stocks()
        else:
            total = run_crypto()

        duration = time.time() - t0
        from loaders.timescale_loader import log_pipeline_run
        log_pipeline_run(pipeline_name, "success", rows_inserted=total or 0, duration_seconds=duration)
        logger.info("✓ %s finished in %.1fs", pipeline_name, duration)

    except Exception:
        duration = time.time() - t0
        logger.exception("✗ %s FAILED after %.1fs", pipeline_name, duration)
        try:
            from loaders.timescale_loader import log_pipeline_run
            log_pipeline_run(pipeline_name, "failed", rows_inserted=0, duration_seconds=duration)
        except Exception:
            pass
        sys.exit(1)


if __name__ == "__main__":
    main()
