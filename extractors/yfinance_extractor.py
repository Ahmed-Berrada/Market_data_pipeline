"""
extractors/yfinance_extractor.py
=================================
Fetches historical and recent OHLCV data from Yahoo Finance.

Why yfinance?
- Completely free, no API key required
- Daily OHLCV for any stock going back years
- Simple Python interface on top of Yahoo's undocumented API

What this module does:
- Takes a list of symbols and a date range
- Returns a clean pandas DataFrame with one row per symbol per day
- Handles errors gracefully (bad symbols, network issues)

This is the EXTRACT step of our ETL pipeline.
"""

import logging
from datetime import date, timedelta
from typing import Optional

import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

# Symbols we track by default — easily extended
DEFAULT_SYMBOLS = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"] 
# Note: yfinance can fetch any symbol, but these are popular stocks with good liquidity and data quality.  


def fetch_ohlcv(
    symbols: list[str],
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> pd.DataFrame:
    """
    Fetch daily OHLCV data for a list of stock symbols.

    Args:
        symbols:    List of ticker symbols e.g. ['AAPL', 'MSFT']
        start_date: Start of the date range (default: 90 days ago)
        end_date:   End of the date range (default: today)

    Returns:
        DataFrame with columns: [time, symbol, open, high, low, close, volume, source]
        One row per symbol per trading day.
    """
    # Default to last 90 days if no dates given
    if end_date is None:
        end_date = date.today()
    if start_date is None:
        start_date = end_date - timedelta(days=90)

    logger.info(
        f"Fetching OHLCV for {len(symbols)} symbols "
        f"from {start_date} to {end_date}"
    )

    all_rows = []

    for symbol in symbols:
        try:
            rows = _fetch_single_symbol(symbol, start_date, end_date)
            all_rows.append(rows)
            logger.info(f"  {symbol}: {len(rows)} rows fetched")
        except Exception as e:
            # Log the error but don't crash the whole pipeline.
            # If AAPL fails, we still want MSFT, GOOGL etc.
            logger.error(f"  {symbol}: FAILED — {e}")
            continue

    if not all_rows:
        logger.warning("No data fetched for any symbol")
        return pd.DataFrame()

    # Combine all symbols into one DataFrame
    result = pd.concat(all_rows, ignore_index=True)
    logger.info(f"Total rows fetched: {len(result)}")
    return result


def _fetch_single_symbol(
    symbol: str,
    start_date: date,
    end_date: date,
) -> pd.DataFrame:
    """
    Fetch OHLCV for a single symbol and normalise the column names
    to match our database schema.
    """
    ticker = yf.Ticker(symbol)

    # yfinance returns a DataFrame indexed by date
    # auto_adjust=True adjusts prices for stock splits and dividends —
    # important for accurate historical analysis
    raw = ticker.history(
        start=start_date.isoformat(),
        end=end_date.isoformat(),
        auto_adjust=True,
    )

    if raw.empty:
        raise ValueError(f"No data returned for {symbol}")

    # Rename columns to match our schema (lowercase, no spaces)
    df = raw.rename(columns={
        "Open":   "open",
        "High":   "high",
        "Low":    "low",
        "Close":  "close",
        "Volume": "volume",
    })

    # Keep only the columns we care about
    df = df[["open", "high", "low", "close", "volume"]].copy()

    # The index is the date — move it to a column called 'time'
    df.index.name = "time"
    df = df.reset_index()

    # Make sure 'time' is timezone-aware (UTC)
    # TimescaleDB stores TIMESTAMPTZ which requires a timezone
    df["time"] = pd.to_datetime(df["time"], utc=True)

    # Add metadata columns
    df["symbol"] = symbol.upper()
    df["source"] = "yfinance"

    # Drop any rows where close price is null (market holidays can cause this)
    df = df.dropna(subset=["close"])

    return df[["time", "symbol", "open", "high", "low", "close", "volume", "source"]]


def fetch_latest_price(symbol: str) -> dict:
    """
    Fetch the most recent price for a single symbol.
    Used for the 'latest price' card on the dashboard.

    Returns a dict with: symbol, price, change, change_pct, volume
    """
    ticker = yf.Ticker(symbol)
    info = ticker.fast_info  # faster than .info — fetches only what we need

    return {
        "symbol": symbol.upper(),
        "price": round(float(info.last_price), 2),
        "previous_close": round(float(info.previous_close), 2),
        "change": round(float(info.last_price - info.previous_close), 2),
        "change_pct": round(
            float((info.last_price - info.previous_close) / info.previous_close * 100), 2
        ),
        "volume": int(info.last_volume) if info.last_volume else None,
    }


# ── Quick test ─────────────────────────────────────────────────────────────────
# Run this file directly to verify the extractor works:
#   python -m extractors.yfinance_extractor
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    print("Testing yfinance extractor...")
    df = fetch_ohlcv(["AAPL", "MSFT"], start_date=date(2024, 1, 1))
    print(df.head(10))
    print(f"\nShape: {df.shape}")
    print(f"Dtypes:\n{df.dtypes}")

    print("\nFetching latest price for AAPL...")
    latest = fetch_latest_price("AAPL")
    print(latest)
