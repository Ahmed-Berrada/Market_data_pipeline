import { useRef, useState, useCallback } from "react";
import { fmt, fmtK } from "@/lib/market/format";
import type { OHLCV, ChartRange } from "@/types/market";

const formatTooltipTime = (iso: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
};

const formatTooltipValue = (name: string, value: number): string => {
  if (name === "daily_return") {
    const sign = value >= 0 ? "+" : "";
    return `${sign}${(value * 100).toFixed(2)}%`;
  }
  return fmt(value);
};

export function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;

  // daily_return lives on the same data point as close — pull it from the first payload item
  const raw = payload[0]?.payload;
  const dailyReturn: number | null = raw?.daily_return ?? null;

  // Filter out sma/return lines that have no value at this point
  const priceLines = payload.filter(
    (p: any) => p.dataKey !== "daily_return" && p.value != null
  );

  return (
    <div
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
        padding: "10px 14px",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        minWidth: 160,
      }}
    >
      <div style={{ color: "var(--text-muted)", marginBottom: 8, fontSize: 10 }}>
        {formatTooltipTime(raw?.time ?? "")}
      </div>
      {priceLines.map((p: any, i: number) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 3 }}>
          <span style={{ color: p.color }}>{p.name}</span>
          <span style={{ color: "var(--text)" }}>{formatTooltipValue(p.name, p.value)}</span>
        </div>
      ))}
      {dailyReturn != null && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ color: "var(--text-muted)" }}>daily ret.</span>
          <span style={{ color: dailyReturn >= 0 ? "var(--accent)" : "#ef4444" }}>
            {dailyReturn >= 0 ? "+" : ""}{(dailyReturn * 100).toFixed(2)}%
          </span>
        </div>
      )}
    </div>
  );
}

const INTRADAY_RANGES: ChartRange[] = ["20m", "60m", "1d"];
const DAILY_RANGES: ChartRange[] = ["1w", "1mo", "3mo", "6mo", "1y"];

const MAX_CANDLES: Record<ChartRange, number> = {
  "20m": 20, "60m": 60, "1d": 90,
  "1w": 90, "1mo": 90, "3mo": 90,
  "6mo": 180, "1y": 365,
};

/** Aggregate minute-level bars into one candle per day */
function aggregateDaily(data: OHLCV[]): OHLCV[] {
  const byDay = new Map<string, OHLCV[]>();
  for (const d of data) {
    const key = d.time.slice(0, 10); // "YYYY-MM-DD"
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(d);
  }
  const result: OHLCV[] = [];
  for (const [, bars] of byDay) {
    const sorted = bars.sort((a, b) => a.time.localeCompare(b.time));
    result.push({
      time: sorted[0].time,
      open: sorted[0].open,
      high: Math.max(...sorted.map((b) => b.high)),
      low: Math.min(...sorted.map((b) => b.low)),
      close: sorted[sorted.length - 1].close,
      volume: sorted.reduce((s, b) => s + (b.volume ?? 0), 0),
    });
  }
  return result.sort((a, b) => a.time.localeCompare(b.time));
}

/** Aggregate minute-level bars into one candle per hour */
function aggregateHourly(data: OHLCV[]): OHLCV[] {
  const byHour = new Map<string, OHLCV[]>();
  for (const d of data) {
    const key = d.time.slice(0, 13); // "YYYY-MM-DDTHH"
    if (!byHour.has(key)) byHour.set(key, []);
    byHour.get(key)!.push(d);
  }
  const result: OHLCV[] = [];
  for (const [, bars] of byHour) {
    const sorted = bars.sort((a, b) => a.time.localeCompare(b.time));
    result.push({
      time: sorted[0].time,
      open: sorted[0].open,
      high: Math.max(...sorted.map((b) => b.high)),
      low: Math.min(...sorted.map((b) => b.low)),
      close: sorted[sorted.length - 1].close,
      volume: sorted.reduce((s, b) => s + (b.volume ?? 0), 0),
    });
  }
  return result.sort((a, b) => a.time.localeCompare(b.time));
}

function formatCandleXLabel(iso: string, range: ChartRange): string {
  const d = new Date(iso);
  if (INTRADAY_RANGES.includes(range)) {
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }
  if (range === "1w") {
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function CandlestickChart({ data, range }: { data: OHLCV[]; range: ChartRange }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);

  // Aggregate raw bars depending on the selected range
  const processed = DAILY_RANGES.includes(range)
    ? aggregateDaily(data)
    : range === "1w"
      ? aggregateHourly(data)
      : data;
  const maxCandles = MAX_CANDLES[range];
  const slice = processed.slice(-maxCandles);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = ref.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = W / rect.width;
      const svgX = (e.clientX - rect.left) * scaleX;
      const svgY = (e.clientY - rect.top) * (H / rect.height);
      const step = (W - PL - PR) / slice.length;
      const idx = Math.floor((svgX - PL) / step);
      if (idx >= 0 && idx < slice.length) {
        setHovered(idx);
        // Position tooltip in client coords relative to SVG container
        setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      } else {
        setHovered(null);
        setMouse(null);
      }
    },
    [slice.length],
  );

  const handleMouseLeave = useCallback(() => {
    setHovered(null);
    setMouse(null);
  }, []);

  if (!slice.length) {
    return (
      <div
        style={{
          height: 240,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--text-muted)",
          letterSpacing: "0.15em",
        }}
      >
        NO DATA
      </div>
    );
  }

  const W = 860;
  const H = 240;
  const PL = 52;
  const PR = 16;
  const PT = 12;
  const PB = 28;
  const cW = W - PL - PR;
  const cH = H - PT - PB;
  const vals = slice.flatMap((d) => [d.high, d.low]);
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  const rng = mx - mn || 1;
  const toY = (v: number): number => PT + cH - ((v - mn) / rng) * cH;
  const step = cW / slice.length;
  const cw = Math.max(2, step * 0.6);

  const ticks = 4;
  const yTicks = Array.from({ length: ticks }, (_, i) => {
    const v = mn + (rng * i) / (ticks - 1);
    return { y: toY(v), label: v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0) };
  });

  const hoveredCandle = hovered !== null ? slice[hovered] : null;

  return (
    <div style={{ position: "relative" }}>
      <svg
        ref={ref}
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ overflow: "visible", cursor: "crosshair" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={PL}
              y1={t.y}
              x2={W - PR}
              y2={t.y}
              stroke="var(--border)"
              strokeWidth=".5"
              strokeDasharray="3 4"
            />
            <text
              x={PL - 6}
              y={t.y + 4}
              textAnchor="end"
              fill="var(--text-muted)"
              fontSize="9"
              fontFamily="var(--font-mono)"
            >
              {t.label}
            </text>
          </g>
        ))}

        {slice.map((d, i) => {
          const x = PL + i * step + step / 2;
          const up = d.close >= d.open;
          const col = up ? "var(--accent)" : "#ef4444";
          const isHovered = hovered === i;
          const bT = toY(Math.max(d.open, d.close));
          const bB = toY(Math.min(d.open, d.close));
          const bH = Math.max(1, bB - bT);

          return (
            <g key={i} opacity={hovered !== null && !isHovered ? 0.4 : 1}>
              <line x1={x} y1={toY(d.high)} x2={x} y2={toY(d.low)} stroke={col} strokeWidth={isHovered ? 1.4 : 0.8} opacity={isHovered ? 1 : 0.7} />
              <rect
                x={x - cw / 2}
                y={bT}
                width={cw}
                height={bH}
                fill={up ? col : "transparent"}
                stroke={col}
                strokeWidth={isHovered ? 1.4 : 0.8}
                opacity={isHovered ? 1 : 0.9}
              />
              {/* Invisible wider hit area for easier hovering */}
              <rect
                x={x - step / 2}
                y={PT}
                width={step}
                height={cH}
                fill="transparent"
              />
            </g>
          );
        })}

        {/* Crosshair line */}
        {hovered !== null && (
          <line
            x1={PL + hovered * step + step / 2}
            y1={PT}
            x2={PL + hovered * step + step / 2}
            y2={H - PB}
            stroke="var(--text-muted)"
            strokeWidth="0.5"
            strokeDasharray="3 3"
            opacity="0.6"
          />
        )}

        {(() => {
          // Pick ~5-7 evenly spaced labels
          const labelCount = Math.min(slice.length, 6);
          const labelStep = Math.max(1, Math.floor(slice.length / labelCount));

          return slice
            .map((d, i) => ({ d, i }))
            .filter(({ i }) => i % labelStep === 0)
            .map(({ d, i }) => {
              const x = PL + i * step + step / 2;
              return (
                <text
                  key={i}
                  x={x}
                  y={H - 6}
                  textAnchor="middle"
                  fill="var(--text-muted)"
                  fontSize="9"
                  fontFamily="var(--font-mono)"
                >
                  {formatCandleXLabel(d.time, range)}
                </text>
              );
            });
        })()}

        <line x1={PL} y1={PT} x2={PL} y2={H - PB} stroke="var(--border)" strokeWidth="1" />
        <line x1={PL} y1={H - PB} x2={W - PR} y2={H - PB} stroke="var(--border)" strokeWidth="1" />
      </svg>

      {/* Tooltip overlay */}
      {hoveredCandle && mouse && (
        <CandleTooltip candle={hoveredCandle} x={mouse.x} y={mouse.y} />
      )}
    </div>
  );
}

function CandleTooltip({ candle, x, y }: { candle: OHLCV; x: number; y: number }) {
  const up = candle.close >= candle.open;
  const changePct = ((candle.close - candle.open) / candle.open) * 100;

  // Offset tooltip so it doesn't sit under the cursor; flip sides near edges
  const offsetX = x > 600 ? -180 : 16;
  const offsetY = y > 140 ? -130 : 8;

  return (
    <div
      style={{
        position: "absolute",
        left: x + offsetX,
        top: y + offsetY,
        background: "var(--bg)",
        border: "1px solid var(--border)",
        padding: "10px 14px",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        minWidth: 160,
        pointerEvents: "none",
        zIndex: 10,
        boxShadow: "0 4px 12px rgba(0,0,0,.25)",
      }}
    >
      <div style={{ color: "var(--text-muted)", marginBottom: 8, fontSize: 10 }}>
        {formatTooltipTime(candle.time)}
      </div>
      {[
        { label: "Open", value: fmt(candle.open), color: "var(--text)" },
        { label: "High", value: fmt(candle.high), color: "var(--accent)" },
        { label: "Low", value: fmt(candle.low), color: "#ef4444" },
        { label: "Close", value: fmt(candle.close), color: up ? "var(--accent)" : "#ef4444" },
      ].map((row) => (
        <div key={row.label} style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 3 }}>
          <span style={{ color: "var(--text-muted)" }}>{row.label}</span>
          <span style={{ color: row.color }}>{row.value}</span>
        </div>
      ))}
      {candle.volume != null && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 3 }}>
          <span style={{ color: "var(--text-muted)" }}>Vol</span>
          <span style={{ color: "var(--text)" }}>{fmtK(candle.volume)}</span>
        </div>
      )}
      <div
        style={{
          marginTop: 6,
          paddingTop: 6,
          borderTop: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <span style={{ color: "var(--text-muted)" }}>Change</span>
        <span style={{ color: up ? "var(--accent)" : "#ef4444" }}>
          {up ? "+" : ""}{changePct.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

