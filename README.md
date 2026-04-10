# Market Data Pipeline

A production-style data engineering project that ingests, transforms, stores, and serves real-time stock and crypto market data — powered by TimescaleDB, orchestrated with Airflow locally and Cloud Run Jobs in production.

**Live demo:** [ahmedberrada.com/marketdatapipeline](https://ahmedberrada.com/marketdatapipeline)
**API docs:** [https://market-data-pipeline-143452331112.europe-west1.run.app/docs](https://market-data-pipeline-143452331112.europe-west1.run.app/docs)

---

## What it does

- Fetches 1-minute OHLCV data for 7 stocks (SPY, NVDA, MSFT, SIE.DE, GOOGL, PLTR, URTH) via Yahoo Finance
- Fetches 5-minute prices for 4 crypto assets (BTC, ETH, SOL, XRP) via CoinGecko
- Cleans and validates the data, computes SMA-20, SMA-50, and daily returns
- Stores everything in **TimescaleDB Cloud** with hypertables, continuous aggregates, and compression
- Schedules pipelines with **Airflow** (local) and **Cloud Run Jobs + Cloud Scheduler** (production)
- Exposes the data via a FastAPI REST API
- Displays interactive candlestick and line charts on a Next.js dashboard

---

## Architecture

```
                            ┌─ Local ──────────────┐
Yahoo Finance API  ──┐      │  Airflow DAGs        │
                     ├──────┤                      ├── TimescaleDB ── FastAPI ── Next.js Dashboard
CoinGecko API      ──┘      │  Cloud Run Jobs +    │     (Cloud)    (Cloud Run)     (Vercel)
                            │  Cloud Scheduler     │
                            └──────────────────────┘
```

**Stack:**
- **Python 3.11** — data fetching, transformation, loading
- **Apache Airflow 2.9** — local scheduling and orchestration (Docker Compose)
- **Google Cloud Run Jobs + Cloud Scheduler** — production scheduling (no Airflow needed)
- **TimescaleDB Cloud** — time-series storage with hypertables, continuous aggregates, compression
- **FastAPI** — REST API layer
- **Docker Compose** — local development (Airflow + API)
- **Google Cloud Run** — API hosting
- **Next.js + Recharts + custom SVG** — interactive dashboard with candlestick charts

---

## Quickstart

### Prerequisites
- Docker + Docker Compose installed
- Python 3.11+ (for running scripts outside Docker)
- A TimescaleDB instance (cloud or self-hosted)

### 1. Clone and configure

```bash
git clone https://github.com/ahmedberrada/market-data-pipeline
cd market-data-pipeline

cp .env.example .env
# Edit .env:
#   DATABASE_URL=postgresql://user:pass@host:port/db?sslmode=require
#   X_CG_DEMO_API_KEY=your-coingecko-demo-key
```

### 2. Initialise the database

```bash
# Run the schema against your TimescaleDB instance
psql "$DATABASE_URL" -f db/schema.sql
```

This creates hypertables, continuous aggregates, and compression policies.

### 3. Start all services

```bash
docker compose up -d
```

This starts:
- **Airflow Webserver** on port 8080 (admin / admin)
- **Airflow Scheduler** (background) — runs the DAGs automatically
- **FastAPI** on port 8000

First startup takes ~2 minutes as Airflow initialises its metadata database.

### 4. Seed historical data

```bash
pip install -r requirements.txt
python scripts/backfill.py --days 365
```

### 5. Verify everything works

```bash
# API health check
curl http://localhost:8000/

# Latest SPY price
curl http://localhost:8000/api/stocks/SPY/latest

# BTC OHLCV history
curl "http://localhost:8000/api/crypto/BTC/ohlcv?from=2024-01-01"

# Pipeline status (includes row counts and hypertable stats)
curl http://localhost:8000/api/pipeline/status
```

Interactive API docs: **http://localhost:8000/docs**
Airflow UI: **http://localhost:8080** (admin / admin)

---

## Project structure

```
├── dags/                      # Airflow DAGs (local scheduling)
│   ├── stock_dag.py           # stocks_1min — every 1 min on weekdays
│   └── crypto_dag.py          # crypto_20min — every 20 min, 24/7
├── jobs/
│   └── run_pipeline.py        # Standalone ETL runner for Cloud Run Jobs
├── extractors/
│   ├── yfinance_extractor.py  # Yahoo Finance → DataFrame
│   └── coingecko_extractor.py # CoinGecko → DataFrame
├── transformers/
│   └── ohlcv_transformer.py   # Clean + compute indicators (SMA-20, SMA-50)
├── loaders/
│   └── timescale_loader.py    # Write to TimescaleDB (chunked upserts)
├── api/
│   ├── main.py
│   └── routes/
│       ├── stocks.py          # /api/stocks/{symbol}/...
│       ├── crypto.py          # /api/crypto/{symbol}/...
│       └── pipeline.py        # /api/pipeline/status (row counts, hypertable stats)
├── db/
│   ├── schema.sql             # TimescaleDB schema (hypertables, aggregates, compression)
│   └── deduplicate_and_constraints.sql  # Migration script from plain PostgreSQL
├── scripts/
│   └── backfill.py            # One-shot historical data seeder (1 year)
├── deploy/
│   └── deploy_jobs.sh         # Cloud Run Jobs + Cloud Scheduler deployment
├── docker-compose.yml         # Local dev: Airflow + API + Postgres (metadata)
├── Dockerfile.api             # FastAPI container (Cloud Run)
├── Dockerfile.jobs            # ETL job container (Cloud Run Jobs)
└── requirements.txt

my-market-dashboard/           # Next.js dashboard (deployed to Vercel)
├── app/                       # App Router pages
├── components/market/         # Charts, ticker cards, pipeline view
├── hooks/                     # useMarketDashboard custom hook
├── lib/market/                # API client, formatting, constants
└── types/                     # TypeScript interfaces
```

---

## API reference

| Endpoint | Description |
|---|---|
| `GET /` | Health check |
| `GET /api/assets/list` | All tracked symbols |
| `GET /api/stocks/{symbol}/ohlcv` | Historical OHLCV. Params: `from`, `to`, `limit` |
| `GET /api/stocks/{symbol}/latest` | Latest price + 1-day change |
| `GET /api/stocks/{symbol}/indicators` | SMA-20, SMA-50, daily returns |
| `GET /api/crypto/{symbol}/ohlcv` | Crypto historical OHLCV |
| `GET /api/crypto/{symbol}/latest` | Latest crypto price |
| `GET /api/crypto/{symbol}/indicators` | Crypto SMA-20, SMA-50, daily returns |
| `GET /api/pipeline/status` | Last run times, row counts, hypertable stats |

Full interactive docs at `/docs`.

---

## Data model

**TimescaleDB hypertables** (7-day chunk intervals, automatic compression after 7 days):

| Table | Description | Unique index |
|---|---|---|
| `stock_prices` | 1-minute OHLCV for stocks | `(time, symbol)` |
| `crypto_prices` | 5-minute OHLCV for crypto | `(time, symbol)` |
| `price_indicators` | SMA-20, SMA-50, daily return | `(time, symbol, asset_type)` |
| `pipeline_runs` | Audit log of every pipeline execution | Regular table |

**Continuous aggregates** (auto-refreshed hourly, 3-day window):
- `stock_daily_summary` — daily OHLCV candles per stock
- `crypto_daily_summary` — daily OHLCV candles per crypto

**Compression:** enabled on `stock_prices` and `crypto_prices`, segmented by `symbol`, ordered by `time DESC`. Automatically compresses chunks older than 7 days.

The loader uses `ON CONFLICT (...) DO NOTHING` — running the same pipeline twice produces identical results.

---

## Scheduling

### Local (Airflow)

```bash
docker compose up -d
```

| DAG | Schedule | Description |
|---|---|---|
| `stocks_1min` | `*/1 * * * 1-5` | Every minute on weekdays |
| `crypto_20min` | `*/20 * * * *` | Every 20 minutes, 24/7 |

Both DAGs follow the same 4-task pattern: **extract → transform → load → log_success**. After loading, they refresh TimescaleDB continuous aggregates.

### Production (Cloud Run Jobs + Cloud Scheduler)

No Airflow required in production. Two Cloud Run Jobs run the same ETL logic:

| Job | Trigger | Schedule |
|---|---|---|
| `stock-pipeline` | `trigger-stock-pipeline` | `*/1 9-16 * * 1-5` (market hours EST) |
| `crypto-pipeline` | `trigger-crypto-pipeline` | `*/20 * * * *` |

**Deploy to production:**

```bash
# Set your GCP project
gcloud config set project YOUR_PROJECT_ID
export REGION=europe-west1

# Enable required APIs
gcloud services enable run.googleapis.com cloudscheduler.googleapis.com artifactregistry.googleapis.com

# Create Artifact Registry repo
gcloud artifacts repositories create market-pipeline \
  --repository-format=docker --location=$REGION

# Build and push the job image
gcloud auth configure-docker ${REGION}-docker.pkg.dev
docker build -f Dockerfile.jobs -t ${REGION}-docker.pkg.dev/$(gcloud config get-value project)/market-pipeline/pipeline-job:latest .
docker push ${REGION}-docker.pkg.dev/$(gcloud config get-value project)/market-pipeline/pipeline-job:latest

# Create Cloud Run Jobs (set env vars from .env)
source <(grep -v '^#' .env | sed 's/^/export /')

gcloud run jobs create stock-pipeline \
  --image=${REGION}-docker.pkg.dev/$(gcloud config get-value project)/market-pipeline/pipeline-job:latest \
  --region=$REGION --task-timeout=300s --max-retries=2 \
  --set-env-vars="DATABASE_URL=${DATABASE_URL}" \
  --args="--pipeline,stocks"

gcloud run jobs create crypto-pipeline \
  --image=${REGION}-docker.pkg.dev/$(gcloud config get-value project)/market-pipeline/pipeline-job:latest \
  --region=$REGION --task-timeout=300s --max-retries=3 \
  --set-env-vars="DATABASE_URL=${DATABASE_URL},X_CG_DEMO_API_KEY=${X_CG_DEMO_API_KEY}" \
  --args="--pipeline,crypto"

# Create Cloud Scheduler triggers
PROJECT_ID=$(gcloud config get-value project)

gcloud scheduler jobs create http trigger-stock-pipeline \
  --location=$REGION --schedule="*/1 9-16 * * 1-5" --time-zone="America/New_York" \
  --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/stock-pipeline:run" \
  --http-method=POST \
  --oauth-service-account-email="${PROJECT_ID}@appspot.gserviceaccount.com"

gcloud scheduler jobs create http trigger-crypto-pipeline \
  --location=$REGION --schedule="*/20 * * * *" --time-zone="UTC" \
  --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/crypto-pipeline:run" \
  --http-method=POST \
  --oauth-service-account-email="${PROJECT_ID}@appspot.gserviceaccount.com"

# Grant invoker permissions
gcloud run jobs add-iam-policy-binding stock-pipeline --region=$REGION \
  --member="serviceAccount:${PROJECT_ID}@appspot.gserviceaccount.com" --role="roles/run.invoker"
gcloud run jobs add-iam-policy-binding crypto-pipeline --region=$REGION \
  --member="serviceAccount:${PROJECT_ID}@appspot.gserviceaccount.com" --role="roles/run.invoker"
```

**Useful commands:**
```bash
# Execute a job manually
gcloud run jobs execute stock-pipeline --region=$REGION --wait

# Check execution history
gcloud run jobs executions list --job=stock-pipeline --region=$REGION

# Pause/resume a scheduler
gcloud scheduler jobs pause trigger-stock-pipeline --location=$REGION
gcloud scheduler jobs resume trigger-stock-pipeline --location=$REGION
```

---

## Deployment

### API (Google Cloud Run)

```bash
gcloud run deploy market-data-pipeline \
  --source . \
  --region europe-west1 \
  --platform managed \
  --allow-unauthenticated
```

Environment variables to set:
- `DATABASE_URL` — TimescaleDB connection string
- `CORS_ALLOWED_ORIGINS` — comma-separated list of allowed frontend origins

### Frontend (Vercel)

```bash
cd my-market-dashboard
vercel deploy
```

Set `NEXT_PUBLIC_API_URL` to your Cloud Run API URL.

---

## What I learned

- **DAGs and orchestration** — how Airflow schedules and retries tasks, and how to replace it with Cloud Run Jobs for production
- **TimescaleDB** — hypertables, continuous aggregates, compression policies, and why they outperform vanilla PostgreSQL for time-series data
- **ETL pattern** — clean separation of Extract, Transform, Load concerns
- **Data quality** — validating freshness, deduplication, handling nulls at the pipeline level
- **Idempotent pipelines** — running the same pipeline twice produces the same result (ON CONFLICT DO NOTHING)
- **OHLCV and financial indicators** — what the data actually means, SMA interpretation
- **Cloud Run Jobs** — serverless batch workloads triggered by Cloud Scheduler — no always-on infra needed
- **GCP IAM** — service account permissions, invoker roles, and how Cloud Scheduler authenticates to Cloud Run

---

## Free APIs used

| API | What for | Limit |
|---|---|---|
| Yahoo Finance (yfinance) | Stock OHLCV (1-min intraday) | No official limit (unofficial API) |
| CoinGecko demo | Crypto OHLCV (5-min candles) | 10,000 req/month |

No paid API keys required to run this project locally.
