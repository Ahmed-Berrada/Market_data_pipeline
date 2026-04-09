"""
api/routes/pipeline.py
========================
Pipeline status endpoint — powers the "last updated" card on the dashboard.
Uses TimescaleDB-specific functions for fast approximate row counts and
hypertable size/compression stats.
"""

from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from loaders.timescale_loader import get_engine, get_approximate_row_counts, get_hypertable_stats

router = APIRouter()


@router.get("/status")
def get_pipeline_status():
    """
    Returns last run info for all DAGs, approximate row counts (instant via
    TimescaleDB), and hypertable size/compression stats.
    """
    try:
        engine = get_engine()
        with engine.connect() as conn:

            # Last run per logical DAG (normalize legacy ids)
            runs = conn.execute(text("""
                SELECT DISTINCT ON (normalized_dag_id)
                    normalized_dag_id AS dag_id,
                    run_at,
                    status,
                    rows_inserted,
                    duration_seconds
                FROM (
                    SELECT
                        CASE
                            WHEN dag_id IN ('crypto_hourly', 'crypto_5min') THEN 'crypto_5min'
                            WHEN dag_id IN ('stocks_daily', 'stocks_1min') THEN 'stocks_1min'
                            ELSE dag_id
                        END AS normalized_dag_id,
                        run_at,
                        status,
                        rows_inserted,
                        duration_seconds
                    FROM pipeline_runs
                ) r
                ORDER BY normalized_dag_id, run_at DESC
            """)).fetchall()

        # Approximate row counts — instant via TimescaleDB (no full table scan)
        counts = get_approximate_row_counts(engine)

        # Hypertable storage & compression info
        hypertable_info = get_hypertable_stats(engine)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "pipelines": [
            {
                "dag_id": r.dag_id,
                "last_run": r.run_at.isoformat(),
                "status": r.status,
                "rows_inserted": r.rows_inserted,
                "duration_seconds": float(r.duration_seconds) if r.duration_seconds else None,
            }
            for r in runs
        ],
        "row_counts": counts,
        "hypertables": hypertable_info,
    }
