export type AssetType = "stock" | "crypto";
export type ChartRange = "20m" | "60m" | "1d" | "1w" | "1mo" | "3mo" | "6mo" | "1y";

export interface OHLCV {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Indicator {
  time: string;
  close: number;
  sma_20: number | null;
  sma_50: number | null;
  daily_return: number | null;
}

export interface Latest {
  symbol: string;
  price: number;
  change: number;
  change_pct: number;
  volume?: number;
}

export interface PipelineRun {
  dag_id: string;
  last_run: string;
  status: string;
  rows_inserted: number;
  duration_seconds: number;
}

export interface PipelineStatus {
  pipelines: PipelineRun[];
  row_counts: Record<string, number>;
}

export interface OhlcvResponse {
  data?: OHLCV[];
}

export interface IndicatorsResponse {
  data?: Indicator[];
}
