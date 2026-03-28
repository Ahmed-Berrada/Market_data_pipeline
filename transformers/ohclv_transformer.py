"""
transformers/ohlcv_transformer.py
====================================
The TRANSFORM step of our ETL pipeline.

Takes raw OHLCV DataFrames from the extractors and:
  1. Validates and cleans the data (nulls, outliers, type checking)
  2. Computes financial indicators (SMA, daily returns)
  3. Returns data ready to be written to the DB

Why transform before loading?
- We never want garbage in the database
- Pre-computing indicators is faster than computing them per API request
- This is where "data quality" lives — the most important layer in a real pipeline

Financial concepts you'll learn here:
  SMA (Simple Moving Average): average of the last N closing prices.
    Used to smooth out noise and identify trends.
    SMA-20 = short-term trend, SMA-50 = medium-term trend.

  Daily return: (today's close - yesterday's close) / yesterday's close
    Tells you the percentage change from one day to the next.
    Used to compare performance across assets with different price scales.
"""

import logging
from typing import Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


def transform(df: pd.DataFrame, asset_type: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Full transform pipeline for a raw OHLCV DataFrame.

    Args:
        df:          Raw DataFrame from an extractor
        asset_type:  'stock' or 'crypto'

    Returns:
        Tuple of:
          - cleaned_df:    The cleaned OHLCV data (goes into stock_prices / crypto_prices)
          - indicators_df: The computed indicators (goes into price_indicators)
    """
    logger.info(f"Transforming {len(df)} rows of {asset_type} data")

    # Step 1: Validate the incoming data
    df = _validate(df)

    # Step 2: Clean obvious data issues
    df = _clean(df)

    # Step 3: Compute indicators per symbol
    indicators = _compute_indicators(df, asset_type)

    logger.info(f"  Output: {len(df)} clean rows, {len(indicators)} indicator rows")
    return df, indicators


def _validate(df: pd.DataFrame) -> pd.DataFrame:
    """
    Check that the DataFrame has the columns we expect.
    Raises ValueError early if something is wrong — fail fast.
    """
    required_cols = {"time", "symbol", "open", "high", "low", "close", "volume"}
    missing = required_cols - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    if df.empty:
        raise ValueError("Empty DataFrame — nothing to transform")

    return df


def _clean(df: pd.DataFrame) -> pd.DataFrame:
    """
    Clean the raw OHLCV data.

    Rules:
    - Drop rows where close price is null or zero (unusable)
    - Drop rows where high < low (data corruption)
    - Drop duplicate (time, symbol) pairs — keep the last one
    - Ensure correct dtypes
    - Sort by (symbol, time) so moving averages compute correctly
    """
    original_len = len(df)

    # Drop null or zero close prices
    df = df[df["close"].notna() & (df["close"] > 0)]

    # Drop corrupted OHLC rows (high must be >= low)
    df = df[df["high"] >= df["low"]]

    # Drop duplicates — if the same (symbol, time) appears twice, keep last
    df = df.drop_duplicates(subset=["symbol", "time"], keep="last")

    # Ensure numeric types
    for col in ["open", "high", "low", "close"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df["volume"] = pd.to_numeric(df["volume"], errors="coerce").fillna(0).astype("int64")

    # Ensure time is UTC-aware datetime
    df["time"] = pd.to_datetime(df["time"], utc=True)

    # Sort — critical for rolling calculations below
    df = df.sort_values(["symbol", "time"]).reset_index(drop=True)

    dropped = original_len - len(df)
    if dropped > 0:
        logger.warning(f"  Dropped {dropped} invalid rows during cleaning")

    return df


def _compute_indicators(df: pd.DataFrame, asset_type: str) -> pd.DataFrame:
    """
    Compute per-symbol technical indicators.

    We use pandas groupby to process each symbol independently —
    important because a 20-day SMA should never mix data from AAPL and MSFT.
    """
    results = []

    for symbol, group in df.groupby("symbol"):
        group = group.sort_values("time").copy()

        # SMA-20: rolling average of last 20 closing prices
        # min_periods=1 means we start computing even before we have 20 bars
        group["sma_20"] = group["close"].rolling(window=20, min_periods=1).mean()

        # SMA-50
        group["sma_50"] = group["close"].rolling(window=50, min_periods=1).mean()

        # Daily return: percentage change from previous close
        # .pct_change() handles the (today - yesterday) / yesterday formula
        group["daily_return"] = group["close"].pct_change()

        # First row has no previous close, so daily_return is NaN — set to 0
        group["daily_return"] = group["daily_return"].fillna(0)

        group["asset_type"] = asset_type

        results.append(group[["time", "symbol", "asset_type", "close", "sma_20", "sma_50", "daily_return"]])

    if not results:
        return pd.DataFrame()

    return pd.concat(results, ignore_index=True)


def validate_freshness(df: pd.DataFrame, max_age_hours: int = 26) -> bool:
    """
    Data quality check: is the most recent data fresh enough?

    For daily stock data, we expect data from yesterday at the latest.
    If the newest row is older than max_age_hours, something is wrong
    (e.g. the exchange was closed for a holiday — which is fine,
     or the pipeline silently failed — which is not fine).

    Returns True if data is fresh, False if stale.
    """
    if df.empty:
        return False

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    newest = pd.to_datetime(df["time"]).max()

    age_hours = (now - newest).total_seconds() / 3600
    is_fresh = age_hours <= max_age_hours

    if not is_fresh:
        logger.warning(
            f"Data freshness check FAILED: newest row is {age_hours:.1f}h old "
            f"(max allowed: {max_age_hours}h)"
        )

    return is_fresh


# ── Quick test ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    import sys
    sys.path.insert(0, "..")

    from extractors.yfinance_extractor import fetch_ohlcv
    from datetime import date

    raw = fetch_ohlcv(["AAPL", "MSFT"], start_date=date(2024, 1, 1))
    clean, indicators = transform(raw, asset_type="stock")

    print("Clean data sample:")
    print(clean.tail(5))

    print("\nIndicators sample:")
    print(indicators.tail(5))
