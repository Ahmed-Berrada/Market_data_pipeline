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


def fetch_ohlcv(
    symbols: list[str],
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    start_dt: Optional[datetime] = None,
    end_dt: Optional[datetime] = None,
    vs_currency: str = "usd",
    interval: str = "5min",
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
    if end_dt is None:
        if end_date is not None:
            end_dt = datetime.combine(end_date, datetime.max.time(), tzinfo=timezone.utc)
        else:
            end_dt = datetime.now(timezone.utc)
    else:
        end_dt = _ensure_utc(end_dt)

    if start_dt is None:
        if start_date is not None:
            start_dt = datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc)
        else:
            # Keep a short window so CoinGecko returns dense enough intraday points.
            start_dt = end_dt - timedelta(hours=24)
    else:
        start_dt = _ensure_utc(start_dt)

    if start_dt >= end_dt:
        raise ValueError("start_dt must be before end_dt")

    logger.info(
        f"Fetching crypto OHLCV for {symbols} from {start_dt.isoformat()} to {end_dt.isoformat()}"
    )

    all_rows = []

    for symbol in symbols:
        coin_id = SYMBOL_TO_ID.get(symbol.upper())
        if not coin_id:
            logger.warning(f"  {symbol}: No CoinGecko ID mapped — skipping")
            continue

        try:
            rows = _fetch_single_coin(
                symbol,
                coin_id,
                start_dt,
                end_dt,
                vs_currency,
                interval,
            )
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
    start_dt: datetime,
    end_dt: datetime,
    vs_currency: str,
    interval: str,
) -> pd.DataFrame:
    """
    Fetch OHLCV for a single coin from CoinGecko market_chart/range.
    We build true intraday candles by resampling price ticks to the requested interval.
    """
    start_ts = int(start_dt.timestamp())
    end_ts = int(end_dt.timestamp())

    # ── Fetch volume (separate endpoint) ─────────────────────────────────────
    chart_url = f"{COINGECKO_BASE}/coins/{coin_id}/market_chart/range"
    chart_params = {
        "vs_currency": vs_currency,
        "from": start_ts,
        "to": end_ts,
    }

    chart_resp = _get(chart_url, chart_params)
    chart_data = chart_resp.json()

    if "prices" not in chart_data or not chart_data["prices"]:
        raise ValueError(f"Empty price response for {coin_id}")

    price_df = pd.DataFrame(chart_data["prices"], columns=["timestamp_ms", "price"])
    price_df["time"] = pd.to_datetime(price_df["timestamp_ms"], unit="ms", utc=True)
    price_df = price_df.drop(columns=["timestamp_ms"])
    price_df = price_df[
        (price_df["time"] >= start_dt) & (price_df["time"] <= end_dt)
    ].copy()

    if price_df.empty:
        raise ValueError(f"No prices in requested window for {coin_id}")

    candles = (
        price_df
        .set_index("time")["price"]
        .resample(interval, label="right", closed="right")
        .ohlc()
        .dropna()
    )

    # ── Build volume DataFrame ────────────────────────────────────────────────
    if "total_volumes" in chart_data and chart_data["total_volumes"]:
        vol_df = pd.DataFrame(chart_data["total_volumes"], columns=["timestamp_ms", "volume"])
        vol_df["time"] = pd.to_datetime(vol_df["timestamp_ms"], unit="ms", utc=True)
        vol_df = vol_df.drop(columns=["timestamp_ms"])
        vol_df = vol_df[
            (vol_df["time"] >= start_dt) & (vol_df["time"] <= end_dt)
        ].copy()

        volume = (
            vol_df
            .set_index("time")["volume"]
            .resample(interval, label="right", closed="right")
            .sum(min_count=1)
        )
        candles = candles.join(volume.rename("volume"), how="left")
    else:
        candles["volume"] = None

    candles = candles.reset_index()
    candles["volume"] = pd.to_numeric(candles["volume"], errors="coerce").fillna(0)
    candles["symbol"] = symbol.upper()
    candles["source"] = "coingecko"

    return candles[["time", "symbol", "open", "high", "low", "close", "volume", "source"]]


def _ensure_utc(dt: datetime) -> datetime:
    """Return timezone-aware UTC datetime from naive or timezone-aware input."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


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
