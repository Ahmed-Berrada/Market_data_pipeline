"""
api/routes/crypto.py
======================
Crypto-related API endpoints. Mirrors the stocks routes.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text

from loaders.timescale_loader import get_engine

router = APIRouter()


@router.get("/{symbol}/ohlcv")
def get_crypto_ohlcv(
    symbol: str,
    from_date: Optional[datetime] = Query(default=None, alias="from"),
    to_date: Optional[datetime] = Query(default=None, alias="to"),
    limit: int = Query(default=5000, le=20000),
):
    """
    Get historical OHLCV data for a crypto symbol.
    Example: GET /api/crypto/BTC/ohlcv?from=2024-01-01
    """
    symbol = symbol.upper()

    if to_date is None:
        to_date = datetime.now(timezone.utc)
    if from_date is None:
        from_date = to_date - timedelta(days=365)

    try:
        engine = get_engine()
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT time, symbol, open, high, low, close, volume
                FROM crypto_prices
                WHERE symbol = :symbol
                  AND time >= :from_date
                  AND time <= :to_date
                ORDER BY time ASC
                LIMIT :limit
            """), {"symbol": symbol, "from_date": from_date, "to_date": to_date, "limit": limit}).fetchall()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not rows:
        raise HTTPException(status_code=404, detail=f"No data for {symbol}")

    return {
        "symbol": symbol,
        "from": from_date.isoformat(),
        "to": to_date.isoformat(),
        "count": len(rows),
        "data": [
            {
                "time": row.time.isoformat(),
                "open": float(row.open) if row.open else None,
                "high": float(row.high) if row.high else None,
                "low": float(row.low) if row.low else None,
                "close": float(row.close) if row.close else None,
                "volume": float(row.volume) if row.volume else None,
            }
            for row in rows
        ],
    }


@router.get("/{symbol}/latest")
def get_crypto_latest(symbol: str):
    """
    Get the most recent price for a crypto symbol.
    Example: GET /api/crypto/BTC/latest
    """
    symbol = symbol.upper()

    try:
        engine = get_engine()
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT time, close, volume
                FROM crypto_prices
                WHERE symbol = :symbol
                ORDER BY time DESC
                LIMIT 2
            """), {"symbol": symbol}).fetchall()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not rows:
        raise HTTPException(status_code=404, detail=f"No data for {symbol}")

    latest = rows[0]
    prev = rows[1] if len(rows) > 1 else None

    change = None
    change_pct = None
    if prev and prev.close:
        change = round(float(latest.close) - float(prev.close), 2)
        change_pct = round(change / float(prev.close) * 100, 2)

    return {
        "symbol": symbol,
        "time": latest.time.isoformat(),
        "price": float(latest.close),
        "change": change,
        "change_pct": change_pct,
        "volume": float(latest.volume) if latest.volume else None,
    }


@router.get("/{symbol}/indicators")
def get_crypto_indicators(
    symbol: str,
    from_date: Optional[datetime] = Query(default=None, alias="from"),
    limit: int = Query(default=5000, le=20000),
):
    """
    Get pre-computed technical indicators (SMA-20, SMA-50, daily return) for crypto.

    Example: GET /api/crypto/BTC/indicators?from=2024-01-01
    """
    symbol = symbol.upper()

    if from_date is None:
        from_date = datetime.now(timezone.utc) - timedelta(days=365)

    try:
        engine = get_engine()
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT time, close, sma_20, sma_50, daily_return
                FROM price_indicators
                WHERE symbol = :symbol
                  AND asset_type = 'crypto'
                  AND time >= :from_date
                ORDER BY time ASC
                LIMIT :limit
            """), {"symbol": symbol, "from_date": from_date, "limit": limit}).fetchall()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "symbol": symbol,
        "count": len(rows),
        "from": from_date.isoformat(),
        "data": [
            {
                "time": row.time.isoformat(),
                "close": float(row.close),
                "sma_20": float(row.sma_20) if row.sma_20 else None,
                "sma_50": float(row.sma_50) if row.sma_50 else None,
                "daily_return": float(row.daily_return) if row.daily_return else None,
            }
            for row in rows
        ],
    }
