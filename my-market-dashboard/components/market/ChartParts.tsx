import { useRef } from "react";
import { fmt } from "@/lib/market/format";
import type { OHLCV } from "@/types/market";

export function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  return (
    <div
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
        padding: "10px 14px",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
      }}
    >
      <div style={{ color: "var(--text-dim)", marginBottom: 6 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}:{" "}
          <span style={{ color: "var(--text)" }}>
            {typeof p.value === "number"
              ? p.name === "daily_return"
                ? `${p.value.toFixed(3)}%`
                : fmt(p.value)
              : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CandlestickChart({ data }: { data: OHLCV[] }) {
  const ref = useRef<SVGSVGElement>(null);
  const slice = data.slice(-90);

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

  return (
    <svg ref={ref} width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
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
        const bT = toY(Math.max(d.open, d.close));
        const bB = toY(Math.min(d.open, d.close));
        const bH = Math.max(1, bB - bT);

        return (
          <g key={i}>
            <line x1={x} y1={toY(d.high)} x2={x} y2={toY(d.low)} stroke={col} strokeWidth=".8" opacity=".7" />
            <rect
              x={x - cw / 2}
              y={bT}
              width={cw}
              height={bH}
              fill={up ? col : "transparent"}
              stroke={col}
              strokeWidth=".8"
              opacity=".9"
            />
          </g>
        );
      })}

      {slice
        .filter((_, i) => i % 15 === 0)
        .map((d, i) => {
          const idx = slice.indexOf(d);
          const x = PL + idx * step + step / 2;
          const dt = new Date(d.time);
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
              {dt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </text>
          );
        })}

      <line x1={PL} y1={PT} x2={PL} y2={H - PB} stroke="var(--border)" strokeWidth="1" />
      <line x1={PL} y1={H - PB} x2={W - PR} y2={H - PB} stroke="var(--border)" strokeWidth="1" />
    </svg>
  );
}

