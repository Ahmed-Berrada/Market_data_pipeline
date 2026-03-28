# Market Data Pipeline

A production-style data engineering project that ingests, transforms, stores, and serves real-time stock and crypto market data.

**Live demo:** [ahmedberrada.com/marketdatapipeline](https://ahmedberrada.com/marketdatapipeline)  (Not ready yet mf)
**API docs:** [your-api.railway.app/docs](https://your-api.railway.app/docs)  (Not ready yet mf)

---

## What it does

- Fetches daily OHLCV data for 7 stocks (AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA) via Yahoo Finance
- Fetches hourly prices for 4 crypto assets (BTC, ETH, SOL, BNB) via CoinGecko
- Cleans and validates the data, computes SMA-20, SMA-50, and daily returns
- Stores everything in TimescaleDB (PostgreSQL with time-series optimisation)
- Schedules and orchestrates all of this with Apache Airflow
- Exposes the data via a FastAPI REST API
- Displays live charts on a Next.js dashboard deployed to Vercel

---

## Architecture

```
Yahoo Finance API  ──┐
                     ├── Airflow DAGs ── Python ETL ── TimescaleDB ── FastAPI ── Next.js Dashboard
CoinGecko API      ──┘                                                         (Vercel)
                                        (Railway / VPS)
```

**Stack:**
- Python 3.11 — data fetching, transformation, loading
- Apache Airflow 2.9 — scheduling and orchestration
- TimescaleDB (PostgreSQL 16) — time-series data storage
- FastAPI — REST API layer
- Docker Compose — local development and deployment
- Next.js + Recharts — portfolio dashboard

---

## Quickstart

### Prerequisites
- Docker + Docker Compose installed
- Python 3.11+ (for running scripts outside Docker)

### 1. Clone and configure

```bash
git clone https://github.com/ahmedberrada/market-data-pipeline
cd market-data-pipeline/pipeline

cp .env.example .env
# Edit .env if needed (defaults work for local dev)
```

### 2. Start all services

```bash
docker compose up -d
```

This starts:
- **TimescaleDB** on port 5433
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
│   ├── stocks_dag.py         # Runs weekdays at 6pm UTC
│   └── crypto_dag.py         # Runs every hour
├── extractors/               # API fetching logic
│   ├── yfinance_extractor.py # Yahoo Finance → DataFrame
│   └── coingecko_extractor.py# CoinGecko → DataFrame
├── transformers/
│   └── ohlcv_transformer.py  # Clean + compute indicators
├── loaders/
│   └── timescale_loader.py   # Write to TimescaleDB
├── api/                      # FastAPI REST API
│   ├── main.py
│   └── routes/
│       ├── stocks.py
│       ├── crypto.py
│       └── pipeline.py
├── db/
│   └── schema.sql            # Hypertable definitions (auto-runs on first start)
├── scripts/
│   └── backfill.py           # One-shot historical data seeder
├── tests/
│   └── test_pipeline.py      # Still a question whether to "officially test" the product
├── docker-compose.yml
├── Dockerfile.api
└── requirements.txt

frontend/                     # Next.js dashboard (deployed to Vercel)
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
| `GET /api/pipeline/status` | Last run times, row counts |

Full interactive docs at `/docs`.

---

## Data model

**TimescaleDB hypertables** (auto-partitioned by time):

- `stock_prices` — raw OHLCV for stocks
- `crypto_prices` — raw OHLCV for crypto
- `price_indicators` — pre-computed SMA-20, SMA-50, daily return
- `pipeline_runs` — audit log of every pipeline execution

**Continuous aggregates** (materialised views, auto-refreshed):
- `stock_daily_summary` — daily candles pre-aggregated for fast dashboard queries
- `crypto_daily_summary`

---

## Deployment

### Backend (Railway)

```bash
# Install Railway CLI
npm install -g @railway/cli
railway login
railway init
railway up
```

Set environment variables in the Railway dashboard:
- `DATABASE_URL` — your TimescaleDB connection string

### Frontend (Vercel)

```bash
cd frontend
vercel deploy
```

Set `NEXT_PUBLIC_API_URL` to your Railway API URL.

---

## What I learned

- **DAGs and orchestration** — how Airflow schedules and retries tasks
- **Time-series databases** — why TimescaleDB's hypertables and continuous aggregates are different from regular PostgreSQL tables
- **ETL pattern** — clean separation of Extract, Transform, Load concerns
- **Data quality** — validating freshness, deduplication, handling nulls at the pipeline level
- **Idempotent pipelines** — running the same pipeline twice produces the same result (ON CONFLICT DO NOTHING)
- **OHLCV and financial indicators** — what the data actually means, SMA interpretation

---

## Free APIs used

| API | What for | Limit |
|---|---|---|
| Yahoo Finance (yfinance) | Stock OHLCV | No limit (unofficial) |
| CoinGecko public | Crypto OHLCV | ~30 req/min |

No API keys required to run this project.
