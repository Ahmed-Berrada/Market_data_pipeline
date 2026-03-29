export const API_BASE = "https://marketdatapipeline-production.up.railway.app";

export const STOCKS = ["AAPL", "MSFT", "NVDA", "GOOGL", "TSLA", "META", "AMZN"];
export const CRYPTOS = ["BTC", "ETH", "SOL", "BNB"];

export const TECH_STACK = [
  "Python 3.11",
  "Apache Airflow",
  "PostgreSQL",
  "FastAPI",
  "Docker",
  "Next.js",
  "yfinance",
  "CoinGecko",
];

export const API_ENDPOINTS = [
  { m: "GET", p: "/api/stocks/{symbol}/ohlcv", d: "Historical OHLCV · params: from, to, limit" },
  { m: "GET", p: "/api/stocks/{symbol}/latest", d: "Latest price + 1-day change" },
  { m: "GET", p: "/api/stocks/{symbol}/indicators", d: "SMA-20, SMA-50, daily return" },
  { m: "GET", p: "/api/crypto/{symbol}/ohlcv", d: "Crypto historical OHLCV" },
  { m: "GET", p: "/api/crypto/{symbol}/latest", d: "Latest crypto price" },
  { m: "GET", p: "/api/pipeline/status", d: "Last run times + row counts" },
  { m: "GET", p: "/api/assets/list", d: "All tracked symbols" },
];
