"""
api/main.py
============
FastAPI application — the REST API layer of our pipeline.

FastAPI is a modern Python web framework. It's fast, has automatic
API docs (at /docs), and validates request/response types automatically.

Our API serves the pre-computed data from TimescaleDB to the frontend dashboard.
It does NOT fetch live data — it reads what the pipeline already stored.

Endpoints:
  GET /                            → health check
  GET /api/stocks/{symbol}/ohlcv   → historical OHLCV for a stock
  GET /api/stocks/{symbol}/latest  → latest price for a stock
  GET /api/crypto/{symbol}/ohlcv   → historical OHLCV for a crypto
  GET /api/crypto/{symbol}/latest  → latest price for a crypto
  GET /api/pipeline/status         → last pipeline run info
  GET /api/assets/list             → all tracked symbols

API docs automatically generated at: http://localhost:8000/docs
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import stocks, crypto, pipeline


# ── App lifecycle ─────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Runs at startup and shutdown."""
    print("Market Data API starting up...")
    yield
    print("Market Data API shutting down...")


app = FastAPI(
    title="Market Data Pipeline API",
    description="REST API for stock and crypto OHLCV data, powered by TimescaleDB",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# CORS = Cross-Origin Resource Sharing.
# Without this, the browser will block requests from ahmedberrada.com → your API
# because they're on different domains.
# In production, replace "*" with your actual frontend URL.

ALLOWED_ORIGINS = [
    "http://localhost:3000",          # Next.js dev server
    "https://marketdatapipeline.ahmedberrada.com/", # Deployed frontend
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET"],            # read-only API
    allow_headers=["*"],
)

# ── Routes ────────────────────────────────────────────────────────────────────
app.include_router(stocks.router, prefix="/api/stocks", tags=["Stocks"])
app.include_router(crypto.router, prefix="/api/crypto", tags=["Crypto"])
app.include_router(pipeline.router, prefix="/api/pipeline", tags=["Pipeline"])


@app.get("/", tags=["Health"])
def root():
    """Health check endpoint. Railway and Vercel use this to verify the app is running."""
    return {
        "status": "ok",
        "service": "market-data-pipeline-api",
        "docs": "/docs",
    }


@app.get("/api/assets/list", tags=["Assets"])
def list_assets():
    """Returns all symbols currently tracked by the pipeline."""
    return {
        "stocks": ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"],
        "crypto": ["BTC", "ETH", "SOL", "BNB"],
    }
