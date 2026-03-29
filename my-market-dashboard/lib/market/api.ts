import { API_BASE } from "@/lib/market/constants";
import { pastISO } from "@/lib/market/format";
import type {
  AssetType,
  IndicatorsResponse,
  Latest,
  OhlcvResponse,
  PipelineStatus,
} from "@/types/market";

const pathFor = (type: AssetType): string => (type === "stock" ? "stocks" : "crypto");

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}) for ${path}`);
  }
  return (await res.json()) as T;
}

export async function fetchChartData(symbol: string, type: AssetType): Promise<{
  ohlcv: OhlcvResponse;
  indicators: IndicatorsResponse | null;
}> {
  const from = pastISO(180);
  const basePath = `/api/${pathFor(type)}/${symbol}`;

  const [ohlcvRes, indicatorRes] = await Promise.allSettled([
    fetchJson<OhlcvResponse>(`${basePath}/ohlcv?from=${from}`),
    fetchJson<IndicatorsResponse>(`${basePath}/indicators?from=${from}`),
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

