"""
dags/stocks_dag.py
===================
Airflow DAG — runs every minute on weekdays to fetch intraday stock data.

What is a DAG?
  DAG = Directed Acyclic Graph.
  In Airflow, a DAG is a Python file that defines a set of tasks and the
  order they run in. "Directed" means tasks have a direction (A → B → C).
  "Acyclic" means no loops — tasks can't feed back into themselves.

  Think of it as a recipe: step 1, step 2, step 3 — each step only starts
  when the previous one finishes successfully.

Our DAG has 4 tasks:
  extract → transform → load → log_success

If any task fails, Airflow marks the run as failed and can retry automatically.
You can see all runs in the Airflow UI at http://localhost:8080.
"""

from io import StringIO
import logging
import sys
from datetime import datetime, timedelta, timezone

# Make our modules importable from within the Airflow container
# (Airflow mounts /opt/airflow/dags and siblings — we need to import from siblings)
sys.path.insert(0, "/opt/airflow")

from airflow import DAG
from airflow.operators.python import PythonOperator

logger = logging.getLogger(__name__)


def _read_xcom_json_df(payload: str):
    """Pandas 2.x: wrap JSON string in StringIO to avoid deprecation warnings."""
    import pandas as pd

    return pd.read_json(StringIO(payload))


# ── DAG Configuration ─────────────────────────────────────────────────────────
# These default_args apply to every task in the DAG unless overridden
default_args = {
    "owner": "ahmed",
    "depends_on_past": False,       # don't wait for yesterday's run to succeed
    "email_on_failure": False,      # set to True + add email when in production
    "email_on_retry": False,
    "retries": 2,                   # retry failed tasks twice before giving up
    "retry_delay": timedelta(minutes=5),
}

dag = DAG(
    dag_id="stocks_1min",
    description="Fetch intraday stock OHLCV every minute on weekdays and load into TimescaleDB",
    default_args=default_args,
    # Every minute, weekdays
    schedule="*/1 * * * 1-5",
    start_date=datetime(2024, 1, 1),
    catchup=False,
    tags=["stocks", "intraday", "1min"],
)

# ── Symbols to track ──────────────────────────────────────────────────────────
SYMBOLS = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"]


# ── Task functions ─────────────────────────────────────────────────────────────
# Each function is one task. Airflow calls these functions when the task runs.
# We use XCom (cross-communication) to pass data between tasks via the Airflow DB.
# For large DataFrames, we'd write to disk or S3 — but for our scale, XCom is fine.

def task_extract(**context):
    """
    EXTRACT: Fetch raw intraday OHLCV from Yahoo Finance.
    Pushes the result as a JSON string to XCom.
    """
    from extractors.yfinance_extractor import fetch_ohlcv
    from datetime import date

    # 1m bars are limited by Yahoo; keep a short rolling window.
    end_date = date.today() + timedelta(days=1)
    start_date = end_date - timedelta(days=2)

    df = fetch_ohlcv(
        SYMBOLS,
        start_date=start_date,
        end_date=end_date,
        interval="1m",
    )

    if df.empty:
        raise ValueError("Extraction returned empty DataFrame — no data fetched")

    # Push to XCom — Airflow stores this temporarily so the next task can read it
    # We serialize to JSON since XCom stores strings
    context["task_instance"].xcom_push(
        key="raw_data",
        value=df.to_json(date_format="iso"),
    )

    logger.info(f"Extracted {len(df)} rows for {SYMBOLS}")
    return len(df)


def task_transform(**context):
    """
    TRANSFORM: Clean the raw data and compute indicators.
    Reads from XCom, pushes two results back (clean data + indicators).
    """
    import pandas as pd
    from transformers.ohlcv_transformer import transform, validate_freshness

    # Pull the raw data from the previous task via XCom
    raw_json = context["task_instance"].xcom_pull(
        task_ids="extract",
        key="raw_data",
    )
    raw_df = _read_xcom_json_df(raw_json)
    raw_df["time"] = pd.to_datetime(raw_df["time"], utc=True)

    # Run the transform pipeline
    clean_df, indicators_df = transform(raw_df, asset_type="stock")

    # Freshness check — warn if data seems stale
    if not validate_freshness(clean_df):
        logger.warning("Freshness check failed — data may be stale")
        # We don't raise here — a warning is enough for this check

    # Push both outputs to XCom
    context["task_instance"].xcom_push(key="clean_data", value=clean_df.to_json(date_format="iso"))
    context["task_instance"].xcom_push(key="indicators", value=indicators_df.to_json(date_format="iso"))

    logger.info(f"Transformed: {len(clean_df)} clean rows, {len(indicators_df)} indicator rows")
    return len(clean_df)


def task_load(**context):
    """
    LOAD: Write clean data and indicators to TimescaleDB.
    Returns total rows inserted.
    """
    import pandas as pd
    from loaders.timescale_loader import load_stock_prices, load_indicators

    ti = context["task_instance"]

    clean_json = ti.xcom_pull(task_ids="transform", key="clean_data")
    indicators_json = ti.xcom_pull(task_ids="transform", key="indicators")

    clean_df = _read_xcom_json_df(clean_json)
    clean_df["time"] = pd.to_datetime(clean_df["time"], utc=True)

    indicators_df = _read_xcom_json_df(indicators_json)
    indicators_df["time"] = pd.to_datetime(indicators_df["time"], utc=True)

    rows_prices = load_stock_prices(clean_df)
    rows_indicators = load_indicators(indicators_df)

    total = rows_prices + rows_indicators
    ti.xcom_push(key="rows_prices_inserted", value=rows_prices)
    ti.xcom_push(key="rows_indicators_inserted", value=rows_indicators)
    ti.xcom_push(key="rows_inserted", value=total)

    logger.info(
        "Loaded stocks run: %s price rows + %s indicator rows (total=%s)",
        rows_prices,
        rows_indicators,
        total,
    )
    return total


def task_log_success(**context):
    """
    LOG: Record a successful run in pipeline_runs.
    Always runs last — even if the data volume was 0 (market holidays).
    """
    from loaders.timescale_loader import log_pipeline_run

    ti = context["task_instance"]
    rows_inserted = ti.xcom_pull(task_ids="load", key="rows_inserted") or 0

    # Calculate how long the whole pipeline took using timezone-aware datetimes
    dag_run = context["dag_run"]
    started_at = dag_run.start_date
    now = datetime.now(started_at.tzinfo if started_at and started_at.tzinfo else timezone.utc)
    duration = (now - started_at).total_seconds() if started_at else None

    log_pipeline_run(
        dag_id="stocks_1min",
        status="success",
        rows_inserted=rows_inserted,
        duration_seconds=duration,
    )

    logger.info("Logged stocks_1min success (rows_inserted=%s, duration=%.2fs)", rows_inserted, duration or 0.0)


# ── Wire up the tasks ─────────────────────────────────────────────────────────
# This is the actual DAG definition — tasks and their order

extract_task = PythonOperator(
    task_id="extract",
    python_callable=task_extract,
    dag=dag,
)

transform_task = PythonOperator(
    task_id="transform",
    python_callable=task_transform,
    dag=dag,
)

load_task = PythonOperator(
    task_id="load",
    python_callable=task_load,
    dag=dag,
)

log_task = PythonOperator(
    task_id="log_success",
    python_callable=task_log_success,
    dag=dag,
)

# Define the order: extract → transform → load → log
extract_task >> transform_task >> load_task >> log_task
