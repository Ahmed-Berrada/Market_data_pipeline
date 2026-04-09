"""
scripts/backfill.py
=====================
One-shot script to seed the database with historical data.

Run this ONCE after your pipeline is set up to populate the DB
with a year of historical data. After that, the Airflow DAGs
take over and keep it fresh.

Usage:
  python scripts/backfill.py
  python scripts/backfill.py --days 365
  python scripts/backfill.py --symbols AAPL MSFT --days 180

This is the script you'll run for the first time to see data in the dashboard.
"""

import argparse
import logging
import sys
import os
from datetime import date, timedelta

# Allow imports from the pipeline directory
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


def backfill_stocks(symbols: list[str], start_date: date, end_date: date):
    from extractors.yfinance_extractor import fetch_ohlcv
    from transformers.ohlcv_transformer import transform
    from loaders.timescale_loader import load_stock_prices, load_indicators, log_pipeline_run
    import time

    logger.info(f"=== Backfilling stocks: {symbols} ===")
    start_ts = time.time()

    raw = fetch_ohlcv(symbols, start_date=start_date, end_date=end_date)

    if raw.empty:
        logger.error("No stock data returned — check your internet connection")
        return 0

    clean, indicators = transform(raw, asset_type="stock")

    rows_prices = load_stock_prices(clean)
    rows_indicators = load_indicators(indicators)
    total = rows_prices + rows_indicators

    log_pipeline_run(
        dag_id="backfill_stocks",
        status="success",
        rows_inserted=total,
        duration_seconds=time.time() - start_ts,
    )

    logger.info(f"Stocks backfill complete: {rows_prices} price rows, {rows_indicators} indicator rows")
    return total


def backfill_crypto(symbols: list[str], start_date: date, end_date: date):
    from extractors.coingecko_extractor import fetch_ohlcv
    from transformers.ohlcv_transformer import transform
    from loaders.timescale_loader import load_crypto_prices, load_indicators, log_pipeline_run
    import time

    logger.info(f"=== Backfilling crypto: {symbols} ===")
    start_ts = time.time()

    raw = fetch_ohlcv(symbols, start_date=start_date, end_date=end_date)

    if raw.empty:
        logger.error("No crypto data returned")
        return 0

    clean, indicators = transform(raw, asset_type="crypto")

    rows_prices = load_crypto_prices(clean)
    rows_indicators = load_indicators(indicators)
    total = rows_prices + rows_indicators

    log_pipeline_run(
        dag_id="backfill_crypto",
        status="success",
        rows_inserted=total,
        duration_seconds=time.time() - start_ts,
    )

    logger.info(f"Crypto backfill complete: {rows_prices} price rows, {rows_indicators} indicator rows")
    return total


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill market data pipeline")
    parser.add_argument("--days", type=int, default=365, help="Number of days to backfill")
    parser.add_argument("--stocks", nargs="*", default=["SPY", "NVDA", "MSFT", "SIE.DE", "GOOGL", "PLTR", "URTH"])
    parser.add_argument("--crypto", nargs="*", default=["BTC", "ETH", "SOL", "XRP"])
    parser.add_argument("--skip-stocks", action="store_true")
    parser.add_argument("--skip-crypto", action="store_true")
    args = parser.parse_args()

    end_date = date.today()
    start_date = end_date - timedelta(days=args.days)

    logger.info(f"Backfilling from {start_date} to {end_date} ({args.days} days)")

    total_rows = 0

    if not args.skip_stocks:
        total_rows += backfill_stocks(args.stocks, start_date, end_date)

    if not args.skip_crypto:
        total_rows += backfill_crypto(args.crypto, start_date, end_date)

    # Refresh TimescaleDB continuous aggregates so dashboards see the backfilled data
    try:
        from loaders.timescale_loader import refresh_continuous_aggregates
        logger.info("Refreshing continuous aggregates...")
        refresh_continuous_aggregates()
        logger.info("Continuous aggregates refreshed.")
    except Exception as e:
        logger.warning(f"Could not refresh continuous aggregates: {e}")

    logger.info(f"\nBackfill complete. Total rows inserted: {total_rows}")
    logger.info("Open the Airflow UI at http://localhost:8080 to monitor ongoing runs.")
    logger.info("Hit the API at http://localhost:8000/docs to verify data is available.")
