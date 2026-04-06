"""
dags/crypto_dag.py
===================
Airflow DAG — runs every 20 minutes to fetch crypto prices.

Why every 20 minutes for crypto?
  The CoinGecko demo API key is capped at 10,000 calls/month.
  At 4 symbols and one API call per run, every-20-min gives ~8,640 calls/month
  which stays safely under the limit while still capturing meaningful movements.

Same 4-task pattern as stocks_dag.py:
  extract → transform → load → log_success
"""

from io import StringIO
import logging
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, "/opt/airflow")

from airflow import DAG
from airflow.operators.python import PythonOperator

logger = logging.getLogger(__name__)

default_args = {
    "owner": "ahmed",
    "depends_on_past": False,
    "retries": 3,                        # crypto APIs can be flaky — retry more
    "retry_delay": timedelta(minutes=2),
    "email_on_failure": False,
}

dag = DAG(
    dag_id="crypto_20min",
    description="Fetch crypto prices every 20 minutes and load into TimescaleDB",
    default_args=default_args,
    schedule="*/20 * * * *",              # every 20 minutes (CoinGecko 10k/month budget)
    start_date=datetime(2024, 1, 1),
    catchup=False,
    tags=["crypto", "20min"],
)

SYMBOLS = ["BTC", "ETH", "SOL", "XRP"]


def _read_xcom_json_df(payload: str):
    """Pandas 2.x: wrap JSON string in StringIO to avoid deprecation warnings."""
    import pandas as pd

    return pd.read_json(StringIO(payload))


def task_extract(**context):
    from extractors.coingecko_extractor import fetch_ohlcv

    # Use a rolling UTC datetime window to fetch real intraday points.
    logical_date = context.get("logical_date")
    end_dt = logical_date.astimezone(timezone.utc) if logical_date else datetime.now(timezone.utc)
    start_dt = end_dt - timedelta(hours=24)

    df = fetch_ohlcv(SYMBOLS, start_dt=start_dt, end_dt=end_dt, interval="5min")

    if df.empty:
        raise ValueError("No crypto data fetched")

    context["task_instance"].xcom_push(key="raw_data", value=df.to_json(date_format="iso"))
    logger.info(
        "Extracted %s crypto rows between %s and %s",
        len(df),
        start_dt.isoformat(),
        end_dt.isoformat(),
    )
    return len(df)


def task_transform(**context):
    import pandas as pd
    from transformers.ohlcv_transformer import transform

    raw_json = context["task_instance"].xcom_pull(task_ids="extract", key="raw_data")
    raw_df = _read_xcom_json_df(raw_json)
    raw_df["time"] = pd.to_datetime(raw_df["time"], utc=True)

    clean_df, indicators_df = transform(raw_df, asset_type="crypto")

    context["task_instance"].xcom_push(key="clean_data", value=clean_df.to_json(date_format="iso"))
    context["task_instance"].xcom_push(key="indicators", value=indicators_df.to_json(date_format="iso"))

    logger.info(f"Transformed {len(clean_df)} crypto rows")
    return len(clean_df)


def task_load(**context):
    import pandas as pd
    from loaders.timescale_loader import load_crypto_prices, load_indicators

    ti = context["task_instance"]

    clean_df = _read_xcom_json_df(ti.xcom_pull(task_ids="transform", key="clean_data"))
    indicators_df = _read_xcom_json_df(ti.xcom_pull(task_ids="transform", key="indicators"))

    clean_df["time"] = pd.to_datetime(clean_df["time"], utc=True)
    indicators_df["time"] = pd.to_datetime(indicators_df["time"], utc=True)

    rows_prices = load_crypto_prices(clean_df)
    rows_indicators = load_indicators(indicators_df)

    total = rows_prices + rows_indicators
    ti.xcom_push(key="rows_prices_inserted", value=rows_prices)
    ti.xcom_push(key="rows_indicators_inserted", value=rows_indicators)
    ti.xcom_push(key="rows_inserted", value=total)

    logger.info(
        "Loaded crypto run: %s price rows + %s indicator rows (total=%s)",
        rows_prices,
        rows_indicators,
        total,
    )
    return total


def task_log_success(**context):
    from loaders.timescale_loader import log_pipeline_run

    ti = context["task_instance"]
    rows_inserted = ti.xcom_pull(task_ids="load", key="rows_inserted") or 0
    dag_run = context["dag_run"]

    # dag_run.start_date is timezone-aware in Airflow; keep now aware as well.
    started_at = dag_run.start_date
    now = datetime.now(started_at.tzinfo if started_at and started_at.tzinfo else timezone.utc)
    duration = (now - started_at).total_seconds() if started_at else None

    log_pipeline_run(
        dag_id="crypto_5min",
        status="success",
        rows_inserted=rows_inserted,
        duration_seconds=duration,
    )

    logger.info("Logged crypto_5min success (rows_inserted=%s, duration=%.2fs)", rows_inserted, duration or 0.0)


# Wire up tasks
extract_task = PythonOperator(task_id="extract", python_callable=task_extract, dag=dag)
transform_task = PythonOperator(task_id="transform", python_callable=task_transform, dag=dag)
load_task = PythonOperator(task_id="load", python_callable=task_load, dag=dag)
log_task = PythonOperator(task_id="log_success", python_callable=task_log_success, dag=dag)

extract_task >> transform_task >> load_task >> log_task
