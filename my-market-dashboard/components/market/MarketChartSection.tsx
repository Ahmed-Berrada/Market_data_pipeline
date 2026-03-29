import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartTooltip, CandlestickChart } from "@/components/market/ChartParts";
import { LegendItem, SectionLabel, Tab } from "@/components/market/Primitives";
import type { AssetType, Indicator, OHLCV } from "@/types/market";

export function MarketChartSection({
  symbol,
  assetType,
  chartTab,
  setChartTab,
  loading,
  ohlcv,
  indicators,
}: {
  symbol: string;
  assetType: AssetType;
  chartTab: "candle" | "sma" | "returns";
  setChartTab: (tab: "candle" | "sma" | "returns") => void;
  loading: boolean;
  ohlcv: OHLCV[];
  indicators: Indicator[];
}) {
  const returnsData = indicators.slice(-60).map((d) => ({
    time: d.time.slice(5),
    daily_return: d.daily_return ?? 0,
  }));

  const smaData = indicators.slice(-120).map((d) => ({
    time: d.time.slice(5),
    close: d.close,
    sma_20: d.sma_20,
    sma_50: d.sma_50,
  }));

  const hasIndicatorData = indicators.length > 0;

  return (
    <div style={{ marginBottom: 48 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <SectionLabel>
            {symbol} · 180D · {assetType === "stock" ? "Yahoo Finance" : "CoinGecko"}
          </SectionLabel>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Tab active={chartTab === "candle"} onClick={() => setChartTab("candle")}>Candlestick</Tab>
          <Tab active={chartTab === "sma"} onClick={() => setChartTab("sma")}>SMA</Tab>
          <Tab active={chartTab === "returns"} onClick={() => setChartTab("returns")}>Returns</Tab>
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
            LOADING OHLCV...
          </div>
        )}

        {!loading && chartTab === "candle" && <CandlestickChart data={ohlcv} />}

        {!loading && chartTab === "sma" && hasIndicatorData && (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={smaData} margin={{ top: 8, right: 8, bottom: 8, left: 32 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
              <XAxis
                dataKey="time"
                tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--text-muted)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                interval={20}
              />
              <YAxis
                tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--text-muted)" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0))}
              />
              <Tooltip content={<ChartTooltip />} />
              <Line dataKey="close" name="close" stroke="var(--text-dim)" dot={false} strokeWidth={1} strokeOpacity={0.6} />
              <Line dataKey="sma_20" name="SMA-20" stroke="var(--accent)" dot={false} strokeWidth={1.5} />
              <Line dataKey="sma_50" name="SMA-50" stroke="var(--navy-light)" dot={false} strokeWidth={1.5} />
            </LineChart>
          </ResponsiveContainer>
        )}

        {!loading && chartTab === "returns" && hasIndicatorData && (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={returnsData} margin={{ top: 8, right: 8, bottom: 8, left: 32 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
              <XAxis
                dataKey="time"
                tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--text-muted)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                interval={10}
              />
              <YAxis
                tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--text-muted)" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v.toFixed(1)}%`}
              />
              <ReferenceLine y={0} stroke="var(--border-2)" strokeWidth={1} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="daily_return" name="daily_return" fill="var(--accent)" opacity={0.7} radius={[1, 1, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}

        {!loading && (chartTab === "sma" || chartTab === "returns") && !hasIndicatorData && (
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
            NO INDICATOR DATA AVAILABLE FOR THIS ASSET
          </div>
        )}

        {!loading && (
          <div style={{ display: "flex", gap: 20, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
            {chartTab === "candle" && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 10, height: 10, border: "1px solid var(--accent)", background: "var(--accent)" }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>BULLISH</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 10, height: 10, border: "1px solid #ef4444" }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>BEARISH</span>
                </div>
              </>
            )}
            {chartTab === "sma" && (
              <>
                <LegendItem color="var(--accent)" label="SMA-20 · Short-term trend" />
                <LegendItem color="var(--navy-light)" label="SMA-50 · Medium-term trend" />
                <LegendItem color="var(--text-dim)" label="Close price" />
              </>
            )}
            {chartTab === "returns" && (
              <LegendItem color="var(--accent)" label="Daily return · (close_t − close_t-1) / close_t-1" />
            )}
            <div style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
              {assetType === "stock" ? "SOURCE · YAHOO FINANCE · DAILY BARS" : "SOURCE · COINGECKO · DAILY BARS"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
