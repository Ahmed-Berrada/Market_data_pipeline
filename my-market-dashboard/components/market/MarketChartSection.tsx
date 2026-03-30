import { useEffect, useState } from "react";
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
const LONG_DAY_RANGES: ChartRange[] = ["1mo", "3mo", "6mo", "1y"];

const formatXAxis = (iso: string, range: ChartRange, spanMs: number): string => {
  const d = new Date(iso);

  if (range === "5m" || range === "15m" || range === "60m" || range === "1d") {
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }

  if (range === "1w") {
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit" });
  }

  if (spanMs <= 36 * 60 * 60 * 1000) {
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }

  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const normalizeForRange = (ohlcv: OHLCV[], range: ChartRange) => {
  const sorted = ohlcv
    .map((d) => ({ time: d.time, ts: new Date(d.time).getTime(), close: d.close }))
    .sort((a, b) => a.ts - b.ts);

  if (!sorted.length) return sorted;

  // For 1w and above, keep one representative point per bucket so today intraday
  // points do not visually drown older days.
  if (range === "1w") {
    const byHour = new Map<string, { time: string; ts: number; close: number }>();
    for (const p of sorted) {
      const d = new Date(p.ts);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}`;
      byHour.set(key, p);
    }
    return Array.from(byHour.values()).sort((a, b) => a.ts - b.ts);
  }

  if (LONG_DAY_RANGES.includes(range)) {
    const byDay = new Map<string, { time: string; ts: number; close: number }>();
    for (const p of sorted) {
      const d = new Date(p.ts);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
      byDay.set(key, p);
    }
    return Array.from(byDay.values()).sort((a, b) => a.ts - b.ts);
  }

  return sorted;
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
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Set initial state
    setIsMobile(typeof window !== "undefined" && window.innerWidth < 768);

    // Handle window resize
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const chartData = normalizeForRange(ohlcv, range);

  const spanMs =
    chartData.length > 1
      ? chartData[chartData.length - 1].ts - chartData[0].ts
      : 0;

  const chartHeight = isMobile ? 200 : 260;
  const chartMarginLeft = isMobile ? 24 : 32;
  const chartMarginRight = isMobile ? 8 : 8;
  const xAxisFontSize = isMobile ? 7 : 9;
  const xAxisMinTickGap = isMobile ? 24 : 18;
  const yAxisFontSize = isMobile ? 7 : 9;
  const yAxisWidth = isMobile ? 30 : 40;
  const yAxisDecimalPlaces = isMobile ? 0 : 2;

  return (
    <div style={{ marginBottom: "clamp(32px, 8vw, 48px)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: "clamp(8px, 2vw, 12px)" }}>
        <SectionLabel>
          {symbol} · {range.toUpperCase()} · {assetType === "stock" ? "Yahoo Finance" : "CoinGecko"}
        </SectionLabel>
        <div style={{ display: "flex", gap: "clamp(4px, 1.5vw, 6px)", flexWrap: "wrap" }}>
          {RANGE_OPTIONS.map((opt) => (
            <Tab key={opt} active={range === opt} onClick={() => setRange(opt)}>
              {opt}
            </Tab>
          ))}
        </div>
      </div>

      <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", padding: "clamp(14px, 3vw, 20px)", minHeight: "clamp(200px, 60vh, 300px)", position: "relative" }}>
        {loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-mono)",
              fontSize: "clamp(9px, 2vw, 10px)",
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
              height: "clamp(160px, 50vh, 240px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-mono)",
              fontSize: "clamp(8px, 2vw, 10px)",
              letterSpacing: "0.15em",
              color: "var(--text-muted)",
              textAlign: "center",
              padding: 12,
            }}
          >
            NO DATA AVAILABLE FOR THIS RANGE
          </div>
        )}

        {!loading && chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <LineChart data={chartData} margin={{ top: 8, right: chartMarginRight, bottom: 8, left: chartMarginLeft }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
              <XAxis
                dataKey="time"
                tickFormatter={(iso) => formatXAxis(String(iso), range, spanMs)}
                tick={{ fontFamily: "var(--font-mono)", fontSize: xAxisFontSize, fill: "var(--text-muted)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                minTickGap={xAxisMinTickGap}
              />
              <YAxis
                tick={{ fontFamily: "var(--font-mono)", fontSize: yAxisFontSize, fill: "var(--text-muted)" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(yAxisDecimalPlaces))}
                width={yAxisWidth}
              />
              <Tooltip content={<ChartTooltip />} labelFormatter={(_, payload) => payload?.[0]?.payload?.time ?? ""} />
              <Line type="monotone" dataKey="close" name="close" stroke="var(--accent)" dot={false} strokeWidth={1.7} />
            </LineChart>
          </ResponsiveContainer>
        )}

        {!loading && chartData.length > 0 && (
          <div style={{ display: "flex", gap: "clamp(12px, 4vw, 20px)", marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)", flexWrap: "wrap", flexDirection: isMobile ? "column" : "row" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 20, height: 1.5, background: "var(--accent)" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(8px, 2vw, 9px)", color: "var(--text-muted)" }}>
                Close price (hover to inspect exact value)
              </span>
            </div>
            <div style={{ marginLeft: isMobile ? 0 : "auto", fontFamily: "var(--font-mono)", fontSize: "clamp(8px, 2vw, 9px)", color: "var(--text-muted)" }}>
              {assetType === "stock" ? "SOURCE · YAHOO FINANCE" : "SOURCE · COINGECKO"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
