"""
dags/crypto_dag.py
===================
Airflow DAG — runs every 5 minutes to fetch crypto prices.

Why every 5 minutes for crypto?
  Crypto markets run 24/7. This schedule fetches data frequently enough
  to capture market movements while demonstrating the pipeline's capability
  to handle different cadences — good for the portfolio.

Same 4-task pattern as stocks_dag.py:
  extract → transform → load → log_success
"""

import logging
import sys
from datetime import datetime, timedelta

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
    dag_id="crypto_5min",
    description="Fetch crypto prices every 5 minutes and load into TimescaleDB",
    default_args=default_args,
    schedule="*/5 * * * *",               # every 5 minutes
    start_date=datetime(2024, 1, 1),
    catchup=False,
    tags=["crypto", "5min"],
)

SYMBOLS = ["BTC", "ETH", "SOL", "BNB"]


def task_extract(**context):
    from extractors.coingecko_extractor import fetch_ohlcv
    from datetime import date

    # For frequent runs we just want the last 2 days
    # The ON CONFLICT DO NOTHING in the loader handles any duplicates
    end_date = date.today()
    start_date = end_date - timedelta(days=2)

    df = fetch_ohlcv(SYMBOLS, start_date=start_date, end_date=end_date)

    if df.empty:
        raise ValueError("No crypto data fetched")

    context["task_instance"].xcom_push(key="raw_data", value=df.to_json(date_format="iso"))
    logger.info(f"Extracted {len(df)} crypto rows")
    return len(df)


def task_transform(**context):
    import pandas as pd
    from transformers.ohlcv_transformer import transform

    raw_json = context["task_instance"].xcom_pull(task_ids="extract", key="raw_data")
    raw_df = pd.read_json(raw_json)
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

    clean_df = pd.read_json(ti.xcom_pull(task_ids="transform", key="clean_data"))
    indicators_df = pd.read_json(ti.xcom_pull(task_ids="transform", key="indicators"))

    clean_df["time"] = pd.to_datetime(clean_df["time"], utc=True)
    indicators_df["time"] = pd.to_datetime(indicators_df["time"], utc=True)

    rows_prices = load_crypto_prices(clean_df)
    rows_indicators = load_indicators(indicators_df)

    total = rows_prices + rows_indicators
    context["task_instance"].xcom_push(key="rows_inserted", value=total)
    return total


def task_log_success(**context):
    from loaders.timescale_loader import log_pipeline_run

    rows_inserted = context["task_instance"].xcom_pull(task_ids="load", key="rows_inserted") or 0
    dag_run = context["dag_run"]
    duration = (datetime.utcnow() - dag_run.start_date).total_seconds()

    log_pipeline_run(
        dag_id="crypto_5min",
        status="success",
        rows_inserted=rows_inserted,
        duration_seconds=duration,
    )


# Wire up tasks
extract_task = PythonOperator(task_id="extract", python_callable=task_extract, dag=dag)
transform_task = PythonOperator(task_id="transform", python_callable=task_transform, dag=dag)
load_task = PythonOperator(task_id="load", python_callable=task_load, dag=dag)
log_task = PythonOperator(task_id="log_success", python_callable=task_log_success, dag=dag)

extract_task >> transform_task >> load_task >> log_task
