import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartTooltip } from "@/components/market/ChartParts";
import { SectionLabel, Tab } from "@/components/market/Primitives";
import type { AssetType, ChartRange, OHLCV } from "@/types/market";

const RANGE_OPTIONS: ChartRange[] = ["5m", "15m", "60m", "1d", "1w", "1mo", "3mo", "6mo", "1y"];

const formatXAxis = (iso: string, range: ChartRange, spanMs: number): string => {
  const d = new Date(iso);

  // If points are all in a short span, show time even for larger selected ranges.
  if (spanMs <= 36 * 60 * 60 * 1000 || range === "5m" || range === "15m" || range === "60m" || range === "1d") {
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }

  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export function MarketChartSection({
  symbol,
  assetType,
  range,
  setRange,
  loading,
  ohlcv,
}: {
  symbol: string;
  assetType: AssetType;
  range: ChartRange;
  setRange: (range: ChartRange) => void;
  loading: boolean;
  ohlcv: OHLCV[];
}) {
  const chartData = ohlcv
    .map((d) => ({
      time: d.time,
      ts: new Date(d.time).getTime(),
      close: d.close,
    }))
    .sort((a, b) => a.ts - b.ts);

  const spanMs =
    chartData.length > 1
      ? chartData[chartData.length - 1].ts - chartData[0].ts
      : 0;

  return (
    <div style={{ marginBottom: 48 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <SectionLabel>
          {symbol} · {range.toUpperCase()} · {assetType === "stock" ? "Yahoo Finance" : "CoinGecko"}
        </SectionLabel>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {RANGE_OPTIONS.map((opt) => (
            <Tab key={opt} active={range === opt} onClick={() => setRange(opt)}>
              {opt}
            </Tab>
          ))}
        </div>
      </div>

      <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", padding: "20px", minHeight: 280, position: "relative" }}>
        {loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.3em",
              color: "var(--text-muted)",
            }}
          >
            LOADING PRICE SERIES...
          </div>
        )}

        {!loading && chartData.length === 0 && (
          <div
            style={{
              height: 240,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.15em",
              color: "var(--text-muted)",
            }}
          >
            NO DATA AVAILABLE FOR THIS RANGE
          </div>
        )}

        {!loading && chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 32 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
              <XAxis
                dataKey="time"
                tickFormatter={(iso) => formatXAxis(String(iso), range, spanMs)}
                tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--text-muted)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                minTickGap={18}
              />
              <YAxis
                tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--text-muted)" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(2))}
              />
              <Tooltip content={<ChartTooltip />} labelFormatter={(_, payload) => payload?.[0]?.payload?.time ?? ""} />
              <Line type="monotone" dataKey="close" name="close" stroke="var(--accent)" dot={false} strokeWidth={1.7} />
            </LineChart>
          </ResponsiveContainer>
        )}

        {!loading && chartData.length > 0 && (
          <div style={{ display: "flex", gap: 20, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 20, height: 1.5, background: "var(--accent)" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                Close price (hover to inspect exact value)
              </span>
            </div>
            <div style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
              {assetType === "stock" ? "SOURCE · YAHOO FINANCE" : "SOURCE · COINGECKO"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
