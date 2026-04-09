"""
loaders/timescale_loader.py
==============================
The LOAD step of our ETL pipeline.

Key concepts:
  - We use INSERT ... ON CONFLICT DO NOTHING (upsert)
    This means running the pipeline twice won't create duplicate rows.
    The (time, symbol) pair is our unique key.

  - We write in batches of 500 rows using a single persistent connection.
    This avoids the staging-table pattern which breaks with transaction
    poolers (e.g. Supabase port 6543) — those can route the temp-table
    CREATE and the subsequent SELECT to different backend connections,
    making the temp table invisible.

  - We log every run to the pipeline_runs table so the dashboard
    can show "last updated X minutes ago".
"""

import logging
import os
import time
from datetime import datetime, timezone
from typing import Optional

import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

CHUNK_SIZE = 500

# Module-level singleton — avoids creating a new connection pool per request.
_engine: Engine | None = None


def get_engine() -> Engine:
    """
    Return a shared SQLAlchemy engine (singleton).
    pool_pre_ping checks the connection is alive before using it — prevents
    errors when the DB restarts or the connection times out.
    pool_size=3 + max_overflow=2 keeps us well under Supabase's session limit.
    """
    global _engine
    if _engine is not None:
        return _engine

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise RuntimeError(
            "DATABASE_URL not set. "
            "Set it in your .env file or Docker environment."
        )
    _engine = create_engine(
        db_url,
        pool_pre_ping=True,
        pool_size=3,
        max_overflow=2,
        pool_recycle=300,
    )
    return _engine


def load_stock_prices(df: pd.DataFrame, engine: Optional[Engine] = None) -> int:
    return _load_ohlcv(df, table="stock_prices", engine=engine)


def load_crypto_prices(df: pd.DataFrame, engine: Optional[Engine] = None) -> int:
    return _load_ohlcv(df, table="crypto_prices", engine=engine)


def load_indicators(df: pd.DataFrame, engine: Optional[Engine] = None) -> int:
    return _load_ohlcv(df, table="price_indicators", engine=engine)


def _load_ohlcv(df: pd.DataFrame, table: str, engine: Optional[Engine] = None) -> int:
    """
    Write a DataFrame into a table using chunked INSERT ... ON CONFLICT DO NOTHING.

    All chunks are sent over a single connection inside one transaction,
    so this works correctly with Supabase's transaction pooler (port 6543).
    """
    if df.empty:
        logger.warning(f"Empty DataFrame — nothing to load into {table}")
        return 0

    conflict_columns = {
        "stock_prices":    ("time", "symbol"),
        "crypto_prices":   ("time", "symbol"),
        "price_indicators": ("time", "symbol", "asset_type"),
    }
    if table not in conflict_columns:
        raise ValueError(f"Unsupported table for loader: {table}")

    eng = engine or get_engine()

    df = df.copy()
    df["time"] = pd.to_datetime(df["time"], utc=True)

    columns = list(df.columns)
    col_list = ", ".join(columns)
    conflict_target = ", ".join(conflict_columns[table])

    logger.info(f"Loading {len(df)} rows into {table} in chunks of {CHUNK_SIZE}...")
    start = time.time()
    rows_inserted = 0

    records = df.to_dict(orient="records")

    with eng.begin() as conn:
        for i in range(0, len(records), CHUNK_SIZE):
            chunk = records[i : i + CHUNK_SIZE]

            # One multi-row VALUES statement per chunk — single round-trip,
            # avoids executemany() which loops individual INSERTs and hits
            # Supabase's per-statement timeout on large payloads.
            placeholders = ", ".join(
                f"({', '.join(f':{c}_{j}' for c in columns)})"
                for j in range(len(chunk))
            )
            params = {
                f"{col}_{j}": row[col]
                for j, row in enumerate(chunk)
                for col in columns
            }
            result = conn.execute(
                text(f"INSERT INTO {table} ({col_list}) VALUES {placeholders} ON CONFLICT ({conflict_target}) DO NOTHING"),
                params,
            )
            rows_inserted += result.rowcount

    elapsed = time.time() - start
    logger.info(
        f"  Loaded {rows_inserted} new rows into {table} "
        f"in {elapsed:.2f}s ({len(df) - rows_inserted} skipped as duplicates)"
    )
    return rows_inserted


def log_pipeline_run(
    dag_id: str,
    status: str,
    rows_inserted: int = 0,
    error_message: Optional[str] = None,
    duration_seconds: Optional[float] = None,
    engine: Optional[Engine] = None,
) -> None:
    """
    Record a pipeline execution in the pipeline_runs table.
    This powers the "pipeline status" card on the dashboard.
    """
    eng = engine or get_engine()
    with eng.begin() as conn:
        conn.execute(text("""
            INSERT INTO pipeline_runs
                (run_at, dag_id, status, rows_inserted, error_message, duration_seconds)
            VALUES
                (:run_at, :dag_id, :status, :rows_inserted, :error_message, :duration_seconds)
        """), {
            "run_at": datetime.now(timezone.utc),
            "dag_id": dag_id,
            "status": status,
            "rows_inserted": rows_inserted,
            "error_message": error_message,
            "duration_seconds": duration_seconds,
        })
    logger.info(f"Logged pipeline run: {dag_id} -> {status} ({rows_inserted} rows)")


def get_latest_run(dag_id: Optional[str] = None, engine: Optional[Engine] = None) -> dict:
    """
    Fetch the most recent pipeline run from the log.
    Used by the /api/pipeline/status endpoint.
    """
    eng = engine or get_engine()
    with eng.connect() as conn:
        query = """
            SELECT dag_id, run_at, status, rows_inserted, duration_seconds
            FROM pipeline_runs
        """
        if dag_id:
            query += " WHERE dag_id = :dag_id"
        query += " ORDER BY run_at DESC LIMIT 1"

        row = conn.execute(text(query), {"dag_id": dag_id} if dag_id else {}).fetchone()

    if row is None:
        return {}

    return {
        "dag_id": row.dag_id,
        "run_at": row.run_at.isoformat(),
        "status": row.status,
        "rows_inserted": row.rows_inserted,
        "duration_seconds": float(row.duration_seconds) if row.duration_seconds else None,
    }


# ── Quick test ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print("Loader module loaded. Run a DAG to test end-to-end.")
