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
import { CandlestickChart, ChartTooltip } from "@/components/market/ChartParts";
import { SectionLabel, Tab } from "@/components/market/Primitives";
import type { AssetType, ChartRange, Indicator, OHLCV } from "@/types/market";

const RANGE_OPTIONS: ChartRange[] = ["20m", "60m", "1d", "1w", "1mo", "3mo", "6mo", "1y"];

const RANGE_LABEL: Record<ChartRange, string> = {
  "20m": "20 MIN", "60m": "1 HR", "1d": "TODAY",
  "1w": "1 WEEK", "1mo": "1 MONTH", "3mo": "3 MONTHS",
  "6mo": "6 MONTHS", "1y": "1 YEAR",
};
const LONG_DAY_RANGES: ChartRange[] = ["1mo", "3mo", "6mo", "1y"];

const formatXAxis = (iso: string, range: ChartRange, spanMs: number): string => {
  const d = new Date(iso);

  if (range === "20m" || range === "60m" || range === "1d") {
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

// Returns UTC date string "YYYY-MM-DD" for a given ISO timestamp
const toDateKey = (iso: string) => iso.slice(0, 10);

type ChartPoint = {
  time: string;
  ts: number;
  close: number;
  sma_20?: number | null;
  sma_50?: number | null;
  daily_return?: number | null;
};

const buildChartData = (ohlcv: OHLCV[], indicators: Indicator[], range: ChartRange): ChartPoint[] => {
  // Build a lookup: date string → latest indicator for that day
  const indByDate = new Map<string, Indicator>();
  for (const ind of indicators) {
    indByDate.set(toDateKey(ind.time), ind);
  }

  const sorted: ChartPoint[] = ohlcv
    .map((d) => {
      const ind = indByDate.get(toDateKey(d.time));
      return {
        time: d.time,
        ts: new Date(d.time).getTime(),
        close: d.close,
        sma_20: ind?.sma_20 ?? null,
        sma_50: ind?.sma_50 ?? null,
        daily_return: ind?.daily_return ?? null,
      };
    })
    .sort((a, b) => a.ts - b.ts);

  if (!sorted.length) return sorted;

  if (range === "1w") {
    const byHour = new Map<string, ChartPoint>();
    for (const p of sorted) {
      const d = new Date(p.ts);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}`;
      byHour.set(key, p);
    }
    return Array.from(byHour.values()).sort((a, b) => a.ts - b.ts);
  }

  if (LONG_DAY_RANGES.includes(range)) {
    const byDay = new Map<string, ChartPoint>();
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
  indicators,
}: {
  symbol: string;
  assetType: AssetType;
  range: ChartRange;
  setRange: (range: ChartRange) => void;
  loading: boolean;
  ohlcv: OHLCV[];
  indicators: Indicator[];
}) {
  const [isMobile, setIsMobile] = useState(false);
  const [chartMode, setChartMode] = useState<"line" | "candle">("line");
  const [showSma20, setShowSma20] = useState(true);
  const [showSma50, setShowSma50] = useState(true);

  useEffect(() => {
    setIsMobile(typeof window !== "undefined" && window.innerWidth < 768);
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const chartData = buildChartData(ohlcv, indicators, range);

  const firstClose = chartData[0]?.close ?? null;
  const lastClose = chartData[chartData.length - 1]?.close ?? null;
  const rangeReturnPct = firstClose && lastClose ? ((lastClose - firstClose) / firstClose) * 100 : null;
  const rangeReturnAbs = firstClose && lastClose ? lastClose - firstClose : null;
  const rangeUp = (rangeReturnPct ?? 0) >= 0;

  const spanMs =
    chartData.length > 1
      ? chartData[chartData.length - 1].ts - chartData[0].ts
      : 0;

  const hasSma = chartData.some((d) => d.sma_20 != null || d.sma_50 != null);

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

      {/* Chart mode + SMA toggles */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        <Tab active={chartMode === "line"} onClick={() => setChartMode("line")}>LINE</Tab>
        <Tab active={chartMode === "candle"} onClick={() => setChartMode("candle")}>CANDLE</Tab>
        {chartMode === "line" && hasSma && (
          <>
            <span style={{ width: 1, height: 14, background: "var(--border)", margin: "0 2px" }} />
            <Tab active={showSma20} onClick={() => setShowSma20((v) => !v)}>SMA 20</Tab>
            <Tab active={showSma50} onClick={() => setShowSma50((v) => !v)}>SMA 50</Tab>
          </>
        )}
      </div>

      <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", padding: "clamp(14px, 3vw, 20px)", minHeight: "clamp(200px, 60vh, 300px)", position: "relative" }}>
        {!loading && rangeReturnPct !== null && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(7px, 1.5vw, 8px)", letterSpacing: "0.2em", color: "var(--text-muted)", marginBottom: 4 }}>
              {assetType === "stock" ? "RETURN" : "P/L"} · {RANGE_LABEL[range]}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(14px, 3vw, 18px)", fontWeight: 600, color: rangeUp ? "var(--green)" : "var(--red)" }}>
                {rangeUp ? "+" : ""}{rangeReturnPct.toFixed(2)}%
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(9px, 2vw, 11px)", color: "var(--text-muted)" }}>
                {rangeUp ? "+" : ""}{rangeReturnAbs!.toFixed(2)}
              </span>
            </div>
          </div>
        )}

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

        {!loading && chartData.length > 0 && chartMode === "line" && (
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
              {showSma20 && (
                <Line type="monotone" dataKey="sma_20" name="SMA 20" stroke="#f59e0b" dot={false} strokeWidth={1.2} strokeDasharray="4 2" connectNulls />
              )}
              {showSma50 && (
                <Line type="monotone" dataKey="sma_50" name="SMA 50" stroke="#a78bfa" dot={false} strokeWidth={1.2} strokeDasharray="4 2" connectNulls />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}

        {!loading && ohlcv.length > 0 && chartMode === "candle" && (
          <CandlestickChart data={ohlcv} range={range} />
        )}

        {!loading && chartData.length > 0 && (
          <div style={{ display: "flex", gap: "clamp(12px, 4vw, 20px)", marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)", flexWrap: "wrap", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "flex-start" : "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 20, height: 1.5, background: "var(--accent)" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(8px, 2vw, 9px)", color: "var(--text-muted)" }}>Close</span>
            </div>
            {chartMode === "line" && hasSma && showSma20 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 20, height: 1.5, background: "#f59e0b" }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(8px, 2vw, 9px)", color: "var(--text-muted)" }}>SMA 20d</span>
              </div>
            )}
            {chartMode === "line" && hasSma && showSma50 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 20, height: 1.5, background: "#a78bfa" }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(8px, 2vw, 9px)", color: "var(--text-muted)" }}>SMA 50d</span>
              </div>
            )}
            <div style={{ marginLeft: isMobile ? 0 : "auto", fontFamily: "var(--font-mono)", fontSize: "clamp(8px, 2vw, 9px)", color: "var(--text-muted)" }}>
              {assetType === "stock" ? "SOURCE · YAHOO FINANCE" : "SOURCE · COINGECKO"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
