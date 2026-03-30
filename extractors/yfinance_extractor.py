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
import time
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import pandas as pd
import requests
import yfinance as yf

logger = logging.getLogger(__name__)

YAHOO_CHART_BASE = "https://query2.finance.yahoo.com/v8/finance/chart"
YAHOO_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
}

# Symbols we track by default — easily extended
DEFAULT_SYMBOLS = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"] 
# Note: yfinance can fetch any symbol, but these are popular stocks with good liquidity and data quality.  


def fetch_ohlcv(
    symbols: list[str],
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    interval: str = "1d",
) -> pd.DataFrame:
    """
    Fetch OHLCV data for a list of stock symbols.

    Args:
        symbols:    List of ticker symbols e.g. ['AAPL', 'MSFT']
        start_date: Start of the date range (default: 90 days ago)
        end_date:   End of the date range (default: today)
        interval:   Yahoo interval, e.g. 1m, 5m, 15m, 60m, 1d

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
        f"from {start_date} to {end_date} at interval={interval}"
    )

    symbols = [s.upper() for s in symbols]
    all_rows = []

    for symbol in symbols:
        try:
            rows = _fetch_single_symbol(symbol, start_date, end_date, interval)
            all_rows.append(rows)
            logger.info(f"  {symbol}: {len(rows)} rows fetched")
        except Exception as e:
            # Log the error but don't crash the whole pipeline.
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
    interval: str,
) -> pd.DataFrame:
    """
    Fetch OHLCV for a single symbol and normalise the column names
    to match our database schema.
    """
    raw = None
    last_error: Optional[Exception] = None

    # Primary path: Yahoo chart endpoint via requests (more stable than yfinance wrapper).
    for attempt in range(3):
        try:
            raw = _history_from_chart_api(symbol, start_date, end_date, interval)
            if raw is not None and not raw.empty:
                break
        except Exception as e:
            last_error = e

        if attempt < 2:
            time.sleep(1.5 * (attempt + 1))

    # Secondary fallback: yfinance period query
    if raw is None or raw.empty:
        raw = _history_with_period_fallback(symbol, interval)

    if raw is None or raw.empty:
        if last_error:
            raise ValueError(f"No data returned for {symbol} ({last_error})")
        raise ValueError(f"No data returned for {symbol}")

    return _normalise_history_df(raw, symbol)


def _history_from_chart_api(symbol: str, start_date: date, end_date: date, interval: str) -> pd.DataFrame:
    """Fetch history directly from Yahoo chart endpoint."""
    start_dt = datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc)
    # period2 acts like an exclusive upper bound; add one day to include end_date bars.
    end_dt = datetime.combine(end_date + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)

    params = {
        "period1": int(start_dt.timestamp()),
        "period2": int(end_dt.timestamp()),
        "interval": interval,
        "events": "div,splits",
        "includePrePost": "false",
    }

    url = f"{YAHOO_CHART_BASE}/{symbol}"
    resp = requests.get(url, params=params, headers=YAHOO_HEADERS, timeout=20)
    resp.raise_for_status()
    payload = resp.json()

    result = ((payload.get("chart") or {}).get("result") or [])
    if not result:
        return pd.DataFrame()

    node = result[0]
    timestamps = node.get("timestamp") or []
    quote = ((node.get("indicators") or {}).get("quote") or [{}])[0]

    if not timestamps:
        return pd.DataFrame()

    df = pd.DataFrame(
        {
            "time": pd.to_datetime(timestamps, unit="s", utc=True),
            "Open": quote.get("open", []),
            "High": quote.get("high", []),
            "Low": quote.get("low", []),
            "Close": quote.get("close", []),
            "Volume": quote.get("volume", []),
        }
    )

    # Keep bars with a close value only.
    df = df[df["Close"].notna()].copy()
    if df.empty:
        return df

    df = df.set_index("time")
    return df


def _history_with_period_fallback(symbol: str, interval: str) -> pd.DataFrame:
    """
    Fallback Yahoo query using `period` instead of explicit dates.
    Useful when requested dates are out of available market range.
    """
    ticker = yf.Ticker(symbol)

    # 1m is usually capped to recent days; pick a safe period per interval.
    if interval == "1m":
        period = "7d"
    elif interval in {"5m", "15m", "30m", "60m", "90m", "1h"}:
        period = "60d"
    else:
        period = "1y"

    return ticker.history(
        period=period,
        interval=interval,
        auto_adjust=True,
    )


def _normalise_history_df(raw: pd.DataFrame, symbol: str) -> pd.DataFrame:
    """Normalize Yahoo history DataFrame to our DB schema."""

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
