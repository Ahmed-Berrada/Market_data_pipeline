"""
loaders/timescale_loader.py
==============================
The LOAD step of our ETL pipeline.

Takes a clean DataFrame and writes it to TimescaleDB.

Key concepts:
  - We use INSERT ... ON CONFLICT DO NOTHING (upsert)
    This means running the pipeline twice won't create duplicate rows.
    The (time, symbol) pair is our unique key.

  - We write in batches (not row by row) using pandas .to_sql()
    with a chunked approach — much faster than individual inserts.

  - We log every run to the pipeline_runs table so the dashboard
    can show "last updated X minutes ago".
"""

import logging
import os
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Optional

import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


def get_engine() -> Engine:
    """
    Create a SQLAlchemy engine from the DATABASE_URL environment variable.

    SQLAlchemy is a Python SQL toolkit. An "engine" is the connection
    pool to the database — we create it once and reuse it.
    """
    db_url = os.environ.get("DATABASE_URL") or os.environ.get("PIPELINE_DB_CONN")
    if not db_url:
        raise RuntimeError(
            "DATABASE_URL not set. "
            "Set it in your .env file or Docker environment."
        )

    # pool_pre_ping=True checks the connection is alive before using it
    # This prevents errors when the DB restarts or the connection times out
    return create_engine(db_url, pool_pre_ping=True)


@contextmanager
def get_connection(engine: Optional[Engine] = None):
    """Context manager for DB connections — ensures they're always closed."""
    eng = engine or get_engine()
    with eng.connect() as conn:
        yield conn


def load_stock_prices(df: pd.DataFrame, engine: Optional[Engine] = None) -> int:
    """
    Write stock OHLCV data to the stock_prices hypertable.

    Returns the number of rows successfully inserted.
    """
    return _load_ohlcv(df, table="stock_prices", engine=engine)


def load_crypto_prices(df: pd.DataFrame, engine: Optional[Engine] = None) -> int:
    """
    Write crypto OHLCV data to the crypto_prices hypertable.
    """
    return _load_ohlcv(df, table="crypto_prices", engine=engine)


def load_indicators(df: pd.DataFrame, engine: Optional[Engine] = None) -> int:
    """
    Write pre-computed indicators to the price_indicators table.
    """
    return _load_ohlcv(df, table="price_indicators", engine=engine)


def _load_ohlcv(df: pd.DataFrame, table: str, engine: Optional[Engine] = None) -> int:
    """
    Generic loader that writes a DataFrame to any of our tables.

    Strategy: write to a temp table first, then INSERT ... ON CONFLICT DO NOTHING
    into the real table. This is the safest way to do idempotent inserts.
    """
    if df.empty:
        logger.warning(f"Empty DataFrame — nothing to load into {table}")
        return 0

    eng = engine or get_engine()

    # Ensure time column is UTC and properly formatted
    df = df.copy()
    df["time"] = pd.to_datetime(df["time"], utc=True)

    logger.info(f"Loading {len(df)} rows into {table}...")
    start = time.time()

    # Create a unique name for the temporary staging table
    temp_table = f"_temp_{table}_{int(time.time())}"

    try:
        # 1. Write to the staging table using the ENGINE
        # Pandas handles its own connection lifecycle here
        df.to_sql(
            name=temp_table,
            con=eng,
            if_exists="replace",
            index=False,
            method="multi",   # batch insert — much faster
            chunksize=1000,
        )

        # 2. Move data to the final table using a TRANSACTION (eng.begin)
        # This will auto-commit if successful or auto-rollback if it fails
        with eng.begin() as conn:
            # Insert from staging into real table, skipping duplicates
            # Note: Requires a UNIQUE constraint on (time, symbol) in the DB
            result = conn.execute(text(f"""
                INSERT INTO {table}
                SELECT * FROM "{temp_table}"
                ON CONFLICT DO NOTHING
            """))

            rows_inserted = result.rowcount

            # Clean up the staging table
            conn.execute(text(f'DROP TABLE IF EXISTS "{temp_table}"'))

        elapsed = time.time() - start
        logger.info(
            f"  Loaded {rows_inserted} new rows into {table} "
            f"in {elapsed:.2f}s ({len(df) - rows_inserted} skipped as duplicates)"
        )

        return rows_inserted

    except Exception as e:
        logger.error(f"Failed to load data into {table}: {e}")
        # Ensure temp table is dropped even if the insert fails
        with eng.begin() as conn:
            conn.execute(text(f'DROP TABLE IF EXISTS "{temp_table}"'))
        raise

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

    with eng.connect() as conn:
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
        conn.commit()

    logger.info(f"Logged pipeline run: {dag_id} → {status} ({rows_inserted} rows)")


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
