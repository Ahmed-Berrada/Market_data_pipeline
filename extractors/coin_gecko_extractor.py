"""
extractors/coingecko_extractor.py
===================================
Fetches historical OHLCV data from the CoinGecko public API.

Why CoinGecko?
- Free tier, no API key required for basic historical data
- Reliable, well-documented REST API
- Covers thousands of crypto assets

CoinGecko free tier limits:
- ~30 calls/minute on the public API
- We stay well under this by fetching one coin at a time with small delays

Important: CoinGecko uses coin IDs not symbols.
  - Bitcoin  → 'bitcoin'  (not 'BTC')
  - Ethereum → 'ethereum' (not 'ETH')
  The SYMBOL_TO_ID map below handles this translation.

This is the EXTRACT step of our ETL pipeline.
"""

import logging
import time
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from os import getenv

import pandas as pd
import requests

logger = logging.getLogger(__name__)

# Prefer uppercase env var, fall back to lowercase for compatibility.
COINGECKO_API_KEY = getenv("X_CG_DEMO_API_KEY") or getenv("x_cg_demo_api_key")
COINGECKO_BASE = "https://api.coingecko.com/api/v3"

# Map from the short symbol we use internally → CoinGecko's coin ID
SYMBOL_TO_ID = {
    "BTC":  "bitcoin",
    "ETH":  "ethereum",
    "SOL":  "solana",
    "BNB":  "binancecoin",
    "XRP":  "ripple",
    "ADA":  "cardano",
    "AVAX": "avalanche-2",
    "DOT":  "polkadot",
    "MATIC": "matic-network",
    "LINK": "chainlink",
}

DEFAULT_SYMBOLS = ["BTC", "ETH", "SOL", "BNB"]
SUPPORTED_OHLC_DAYS = [1, 7, 14, 30, 90, 180, 365]


def fetch_ohlcv(
    symbols: list[str],
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    vs_currency: str = "usd",
) -> pd.DataFrame:
    """
    Fetch daily OHLCV for a list of crypto symbols.

    Args:
        symbols:     List of symbols e.g. ['BTC', 'ETH']
        start_date:  Start of range (default: 90 days ago)
        end_date:    End of range (default: today)
        vs_currency: Quote currency (default: 'usd')

    Returns:
        DataFrame with columns: [time, symbol, open, high, low, close, volume, source]
    """
    if end_date is None:
        end_date = date.today()
    if start_date is None:
        start_date = end_date - timedelta(days=90)

    logger.info(
        f"Fetching crypto OHLCV for {symbols} from {start_date} to {end_date}"
    )

    all_rows = []

    for symbol in symbols:
        coin_id = SYMBOL_TO_ID.get(symbol.upper())
        if not coin_id:
            logger.warning(f"  {symbol}: No CoinGecko ID mapped — skipping")
            continue

        try:
            rows = _fetch_single_coin(symbol, coin_id, start_date, end_date, vs_currency)
            all_rows.append(rows)
            logger.info(f"  {symbol}: {len(rows)} rows fetched")

            # Be polite to the free API — avoid rate limiting
            time.sleep(1.5)

        except Exception as e:
            logger.error(f"  {symbol}: FAILED — {e}")
            continue

    if not all_rows:
        return pd.DataFrame()

    result = pd.concat(all_rows, ignore_index=True)
    logger.info(f"Total crypto rows fetched: {len(result)}")
    return result


def _fetch_single_coin(
    symbol: str,
    coin_id: str,
    start_date: date,
    end_date: date,
    vs_currency: str,
) -> pd.DataFrame:
    """
    Fetch OHLCV for a single coin using CoinGecko's OHLC endpoint.

    CoinGecko's OHLC endpoint returns data in this format:
        [[timestamp_ms, open, high, low, close], ...]

    Note: CoinGecko doesn't return volume in the OHLC endpoint.
    We fetch volume separately from the market_chart endpoint and merge.
    """
    # Convert dates to Unix timestamps (CoinGecko uses seconds)
    start_ts = int(datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc).timestamp())
    end_ts = int(datetime.combine(end_date, datetime.min.time(), tzinfo=timezone.utc).timestamp())

    # ── Fetch OHLC ────────────────────────────────────────────────────────────
    ohlc_url = f"{COINGECKO_BASE}/coins/{coin_id}/ohlc"
    ohlc_params = {"vs_currency": vs_currency, "days": _days_between(start_date, end_date)}

    ohlc_resp = _get(ohlc_url, ohlc_params)
    ohlc_data = ohlc_resp.json()

    if not ohlc_data:
        raise ValueError(f"Empty OHLC response for {coin_id}")

    # ── Fetch volume (separate endpoint) ─────────────────────────────────────
    chart_url = f"{COINGECKO_BASE}/coins/{coin_id}/market_chart/range"
    chart_params = {
        "vs_currency": vs_currency,
        "from": start_ts,
        "to": end_ts,
    }

    chart_resp = _get(chart_url, chart_params)
    chart_data = chart_resp.json()

    # ── Build OHLC DataFrame ──────────────────────────────────────────────────
    ohlc_df = pd.DataFrame(ohlc_data, columns=["timestamp_ms", "open", "high", "low", "close"])
    ohlc_df["time"] = pd.to_datetime(ohlc_df["timestamp_ms"], unit="ms", utc=True)
    ohlc_df = ohlc_df.drop(columns=["timestamp_ms"])

    # Aggregate to daily (CoinGecko OHLC can return 4-hourly candles for short ranges)
    ohlc_df["date"] = ohlc_df["time"].dt.date
    daily_ohlc = ohlc_df.groupby("date").agg(
        open=("open", "first"),
        high=("high", "max"),
        low=("low", "min"),
        close=("close", "last"),
    ).reset_index()

    # ── Build volume DataFrame ────────────────────────────────────────────────
    if "total_volumes" in chart_data and chart_data["total_volumes"]:
        vol_df = pd.DataFrame(chart_data["total_volumes"], columns=["timestamp_ms", "volume"])
        vol_df["date"] = pd.to_datetime(vol_df["timestamp_ms"], unit="ms", utc=True).dt.date
        vol_daily = vol_df.groupby("date")["volume"].sum().reset_index()
        daily_ohlc = daily_ohlc.merge(vol_daily, on="date", how="left")
    else:
        daily_ohlc["volume"] = None

    # ── Final cleanup ─────────────────────────────────────────────────────────
    # OHLC endpoint returns a bucketed window; trim back to exact requested range.
    daily_ohlc = daily_ohlc[
        (daily_ohlc["date"] >= start_date) & (daily_ohlc["date"] <= end_date)
    ].copy()

    daily_ohlc["time"] = pd.to_datetime(daily_ohlc["date"], utc=True)
    daily_ohlc["symbol"] = symbol.upper()
    daily_ohlc["source"] = "coingecko"

    return daily_ohlc[["time", "symbol", "open", "high", "low", "close", "volume", "source"]]


def _get(url: str, params: dict, retries: int = 3) -> requests.Response:
    """
    GET with retry logic.
    If CoinGecko returns 429 (rate limited), we wait and retry.
    """
    request_params = dict(params or {})
    if COINGECKO_API_KEY:
        # CoinGecko demo key as query parameter so callers never append it manually.
        request_params["x_cg_demo_api_key"] = COINGECKO_API_KEY

    for attempt in range(retries):
        resp = requests.get(url, params=request_params, timeout=30)

        if resp.status_code == 429:
            wait = 60 * (attempt + 1)  # back off: 60s, 120s, 180s
            logger.warning(f"Rate limited by CoinGecko. Waiting {wait}s...")
            time.sleep(wait)
            continue

        resp.raise_for_status()
        return resp

    raise RuntimeError(f"Failed after {retries} retries: {url}")


def _days_between(start: date, end: date) -> int | str:
    delta = max(1, (end - start).days)

    # CoinGecko /ohlc accepts only fixed values for "days".
    for allowed in SUPPORTED_OHLC_DAYS:
        if delta <= allowed:
            return allowed

    return "max"


def fetch_latest_price(symbol: str, vs_currency: str = "usd") -> dict:
    """
    Fetch the current price and 24h stats for a single coin.
    Used for the live price card on the dashboard.
    """
    coin_id = SYMBOL_TO_ID.get(symbol.upper())
    if not coin_id:
        raise ValueError(f"Unknown symbol: {symbol}")

    url = f"{COINGECKO_BASE}/simple/price"
    params = {
        "ids": coin_id,
        "vs_currencies": vs_currency,
        "include_24hr_change": "true",
        "include_24hr_vol": "true",
    }
    resp = _get(url, params)
    data = resp.json()[coin_id]

    return {
        "symbol": symbol.upper(),
        "price": data[vs_currency],
        "change_pct_24h": round(data.get(f"{vs_currency}_24h_change", 0), 2),
        "volume_24h": data.get(f"{vs_currency}_24h_vol"),
    }


# ── Quick test ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    print("Testing CoinGecko extractor...")
    df = fetch_ohlcv(["BTC", "ETH"], start_date=date(2026, 1, 1))
    print(df.head(10))
    print(f"\nShape: {df.shape}")

    print("\nFetching latest BTC price...")
    latest = fetch_latest_price("BTC")
    print(latest)
