import { API_BASE } from "@/lib/market/constants";
import type {
  AssetType,
  ChartRange,
  IndicatorsResponse,
  Latest,
  OhlcvResponse,
  PipelineStatus,
} from "@/types/market";

const pathFor = (type: AssetType): string => (type === "stock" ? "stocks" : "crypto");

const rangeToMs: Record<ChartRange, number> = {
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "60m": 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
  "1mo": 30 * 24 * 60 * 60 * 1000,
  "3mo": 90 * 24 * 60 * 60 * 1000,
  "6mo": 180 * 24 * 60 * 60 * 1000,
  "1y": 365 * 24 * 60 * 60 * 1000,
};

const rangeToLimit: Record<ChartRange, number> = {
  "5m": 600,
  "15m": 1200,
  "60m": 2000,
  "1d": 4000,
  "1w": 6000,
  "1mo": 10000,
  "3mo": 12000,
  "6mo": 15000,
  "1y": 20000,
};

const fromForRange = (range: ChartRange): string => new Date(Date.now() - rangeToMs[range]).toISOString();

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}) for ${path}`);
  }
  return (await res.json()) as T;
}

export async function fetchChartData(symbol: string, type: AssetType, range: ChartRange): Promise<{
  ohlcv: OhlcvResponse;
  indicators: IndicatorsResponse | null;
}> {
  const from = encodeURIComponent(fromForRange(range));
  const limit = rangeToLimit[range];
  const basePath = `/api/${pathFor(type)}/${symbol}`;

  const [ohlcvRes, indicatorRes] = await Promise.allSettled([
    fetchJson<OhlcvResponse>(`${basePath}/ohlcv?from=${from}&limit=${limit}`),
    fetchJson<IndicatorsResponse>(`${basePath}/indicators?from=${from}&limit=${limit}`),
  ]);

  if (ohlcvRes.status !== "fulfilled") {
    throw ohlcvRes.reason;
  }

  return {
    ohlcv: ohlcvRes.value,
    indicators: indicatorRes.status === "fulfilled" ? indicatorRes.value : null,
  };
}

export async function fetchLatest(symbol: string, type: AssetType): Promise<Latest> {
  return fetchJson<Latest>(`/api/${pathFor(type)}/${symbol}/latest`);
}

export async function fetchPipelineStatus(): Promise<PipelineStatus> {
  return fetchJson<PipelineStatus>("/api/pipeline/status");
}
