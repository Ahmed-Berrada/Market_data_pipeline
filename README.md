# Market Data Pipeline

A production-style data engineering project that ingests, transforms, stores, and serves real-time stock and crypto market data.

**Live demo:** [ahmedberrada.com/marketdatapipeline](https://ahmedberrada.com/marketdatapipeline)
**API docs:** [https://market-data-pipeline-143452331112.europe-west1.run.app/docs](https://market-data-pipeline-143452331112.europe-west1.run.app/docs)

---

## What it does

- Fetches 5-minute OHLCV data for 7 stocks (AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA) via Yahoo Finance
- Fetches 20-minute prices for 4 crypto assets (BTC, ETH, SOL, BNB) via CoinGecko
- Cleans and validates the data, computes SMA-20, SMA-50, and daily returns
- Stores everything in PostgreSQL (Supabase) with time-series optimised schema
- Schedules and orchestrates all of this with Apache Airflow
- Exposes the data via a FastAPI REST API
- Displays live charts on a Next.js dashboard deployed to Vercel

---

## Architecture

```
Yahoo Finance API  ──┐
                     ├── Airflow DAGs ── Python ETL ── PostgreSQL ── FastAPI ── Next.js Dashboard
CoinGecko API      ──┘                                (Supabase)  (Cloud Run)   (Vercel)
```

**Stack:**
- Python 3.11 — data fetching, transformation, loading
- Apache Airflow 2.9 — scheduling and orchestration
- PostgreSQL (Supabase) — time-series data storage
- FastAPI — REST API layer
- Docker Compose — local development
- Google Cloud Run — API hosting
- Next.js + Recharts — portfolio dashboard

---

## Quickstart

### Prerequisites
- Docker + Docker Compose installed
- Python 3.11+ (for running scripts outside Docker)

### 1. Clone and configure

```bash
git clone https://github.com/ahmedberrada/market-data-pipeline
cd market-data-pipeline

cp .env.example .env
# Edit .env — set DATABASE_URL and optionally x_cg_demo_api_key
```

### 2. Start all services

```bash
docker compose up -d
```

This starts:
- **Airflow Webserver** on port 8080 (admin / admin)
- **Airflow Scheduler** (background)
- **FastAPI** on port 8000

First startup takes ~2 minutes as Airflow initialises its database.

### 3. Seed historical data

```bash
# Install deps locally (for the backfill script)
pip install -r requirements.txt

# Backfill 1 year of data
python scripts/backfill.py --days 365
```

This takes ~3 minutes and inserts ~2,500 rows per stock symbol.

### 4. Verify everything works

```bash
# API health check
curl http://localhost:8000/

# Latest AAPL price
curl http://localhost:8000/api/stocks/AAPL/latest

# BTC OHLCV history
curl "http://localhost:8000/api/crypto/BTC/ohlcv?from=2024-01-01"

# Pipeline status
curl http://localhost:8000/api/pipeline/status
```

Interactive API docs: **http://localhost:8000/docs**
Airflow UI: **http://localhost:8080** (admin / admin)

---

## Running the tests

```bash
pip install -r requirements.txt
pytest tests/ -v
```

---

## Project structure

```
├── dags/                     # Airflow DAGs (scheduled jobs)
│   ├── stocks_dag.py         # Runs weekdays every 5 min (intraday)
│   └── crypto_dag.py         # Runs every 20 minutes (24/7)
├── extractors/               # API fetching logic
│   ├── yfinance_extractor.py # Yahoo Finance → DataFrame
│   └── coingecko_extractor.py# CoinGecko → DataFrame
├── transformers/
│   └── ohlcv_transformer.py  # Clean + compute indicators
├── loaders/
│   └── timescale_loader.py   # Write to PostgreSQL
├── api/                      # FastAPI REST API
│   ├── main.py
│   └── routes/
│       ├── stocks.py
│       ├── crypto.py
│       └── pipeline.py
├── db/
│   └── schema.sql            # Table definitions (auto-runs on first start)
├── scripts/
│   └── backfill.py           # One-shot historical data seeder
├── docker-compose.yml
├── Dockerfile.api
└── requirements.txt

my-market-dashboard/          # Next.js dashboard (deployed to Vercel)
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
| `GET /api/pipeline/status` | Last run times, row counts |

Full interactive docs at `/docs`.

---

## Data model

**PostgreSQL tables** (auto-partitioned by time index):

- `stock_prices` — raw OHLCV for stocks
- `crypto_prices` — raw OHLCV for crypto
- `price_indicators` — pre-computed SMA-20, SMA-50, daily return
- `pipeline_runs` — audit log of every pipeline execution

**Materialised views** (pre-aggregated for fast dashboard queries):
- `stock_daily_summary` — daily candles
- `crypto_daily_summary`

---

## Deployment

### Backend (Google Cloud Run)

The API is containerised and deployed to Google Cloud Run (europe-west1).

```bash
gcloud run deploy market-data-pipeline \
  --source . \
  --region europe-west1 \
  --platform managed \
  --allow-unauthenticated
```

Set the following environment variables in the Cloud Run console:
- `DATABASE_URL` — your Supabase connection string
- `CORS_ALLOWED_ORIGINS` — comma-separated list of allowed frontend origins

### Frontend (Vercel)

```bash
cd my-market-dashboard
vercel deploy
```

Set `NEXT_PUBLIC_API_URL` to your Cloud Run API URL.

---

## What I learned

- **DAGs and orchestration** — how Airflow schedules and retries tasks
- **Time-series schemas** — optimised indexes, materialised views, and why partitioning matters
- **ETL pattern** — clean separation of Extract, Transform, Load concerns
- **Data quality** — validating freshness, deduplication, handling nulls at the pipeline level
- **Idempotent pipelines** — running the same pipeline twice produces the same result (ON CONFLICT DO NOTHING)
- **OHLCV and financial indicators** — what the data actually means, SMA interpretation
- **Cloud Run deployment** — containerising a FastAPI app and deploying to GCP

---

## Free APIs used

| API | What for | Limit |
|---|---|---|
| Yahoo Finance (yfinance) | Stock OHLCV (5-min intraday) | No official limit (unofficial API) |
| CoinGecko public | Crypto OHLCV (20-min candles) | 10,000 req/month |

No paid API keys required to run this project locally.

---

## Scheduler

Airflow is the primary orchestrator for this project.

- **Stocks DAG** (`stocks_1min`): every 5 minutes on weekdays — fetches the last 7 days of 5-min bars, deduplicates on insert
- **Crypto DAG** (`crypto_5min`): every 20 minutes 24/7 — respects the 10k/month CoinGecko budget (≈8,640 calls/month at 4 symbols)

The loader uses `ON CONFLICT (...) DO NOTHING` and the schema enforces unique indexes:
- `stock_prices (time, symbol)`
- `crypto_prices (time, symbol)`
- `price_indicators (time, symbol, asset_type)`

This prevents duplicates when the same backfill window runs multiple times.
