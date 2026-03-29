import { SectionLabel } from "@/components/market/Primitives";

export function ArchitectureSection() {
  return (
    <div style={{ marginBottom: 48 }}>
      <SectionLabel>System Architecture · ETL Flow</SectionLabel>
      <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", padding: "28px 24px" }}>
        <svg width="100%" viewBox="0 0 860 160" style={{ overflow: "visible", marginBottom: 24 }}>
          <defs>
            <marker id="arr2" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
              <path d="M1 1L6 4L1 7" fill="none" stroke="var(--accent)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity=".5" />
            </marker>
          </defs>

          {[
            { x: 10, y: 40, w: 110, label: "Yahoo Finance", sub: "stocks OHLCV" },
            { x: 10, y: 100, w: 110, label: "CoinGecko", sub: "crypto OHLCV" },
          ].map((n, i) => (
            <g key={i}>
              <rect x={n.x} y={n.y} width={n.w} height={40} rx="2" fill="var(--bg-3)" stroke="var(--border)" strokeWidth=".5" />
              <rect x={n.x} y={n.y} width={2} height={40} fill="var(--accent)" opacity=".5" />
              <text x={n.x + 10} y={n.y + 15} fill="var(--text-dim)" fontSize="9" fontFamily="var(--font-mono)" fontWeight="500">
                {n.label}
              </text>
              <text x={n.x + 10} y={n.y + 28} fill="var(--text-muted)" fontSize="8" fontFamily="var(--font-mono)">
                {n.sub}
              </text>
            </g>
          ))}

          <line x1={120} y1={60} x2={175} y2={85} stroke="var(--accent)" strokeWidth=".8" opacity=".4" markerEnd="url(#arr2)" />
          <line x1={120} y1={120} x2={175} y2={95} stroke="var(--accent)" strokeWidth=".8" opacity=".4" markerEnd="url(#arr2)" />

          {[
            { x: 175, y: 60, w: 120, label: "Airflow DAG", sub: "schedule + retry" },
            { x: 330, y: 60, w: 120, label: "Python ETL", sub: "extract+transform" },
            { x: 485, y: 60, w: 120, label: "PostgreSQL", sub: "OHLCV + indicators" },
            { x: 640, y: 60, w: 120, label: "FastAPI", sub: "REST endpoints" },
            { x: 795, y: 60, w: 60, label: "Next.js", sub: "dashboard" },
          ].map((n, i) => (
            <g key={i}>
              <rect x={n.x} y={n.y} width={n.w} height={40} rx="2" fill="var(--bg-3)" stroke="var(--border)" strokeWidth=".5" />
              <rect x={n.x} y={n.y} width={2} height={40} fill="var(--accent)" opacity=".4" />
              <text x={n.x + 10} y={n.y + 15} fill="var(--text-dim)" fontSize="9" fontFamily="var(--font-mono)" fontWeight="500">
                {n.label}
              </text>
              <text x={n.x + 10} y={n.y + 28} fill="var(--text-muted)" fontSize="8" fontFamily="var(--font-mono)">
                {n.sub}
              </text>
            </g>
          ))}

          {[
            [295, 80, 330, 80],
            [450, 80, 485, 80],
            [605, 80, 640, 80],
            [760, 80, 795, 80],
          ].map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--accent)" strokeWidth=".8" opacity=".4" markerEnd="url(#arr2)" />
          ))}

          <rect x={170} y={44} width={440} height={72} rx="3" fill="none" stroke="var(--border)" strokeWidth=".5" strokeDasharray="4 3" />
          <text x={180} y={40} fill="var(--text-muted)" fontSize="7" fontFamily="var(--font-mono)" letterSpacing="0.15em">
            DOCKER COMPOSE
          </text>
          <text x={630} y={40} fill="var(--text-muted)" fontSize="7" fontFamily="var(--font-mono)" letterSpacing="0.15em">
            RAILWAY
          </text>
          <text x={795} y={40} fill="var(--text-muted)" fontSize="7" fontFamily="var(--font-mono)" letterSpacing="0.15em">
            VERCEL
          </text>
        </svg>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
          {[
            {
              step: "01 · EXTRACT",
              color: "var(--accent)",
              desc: "yfinance pulls daily OHLCV for 7 equities. CoinGecko delivers crypto bars. Retry logic + exponential backoff handle rate limits and transient failures.",
            },
            {
              step: "02 · TRANSFORM",
              color: "var(--accent)",
              desc: "Python validates schema, drops nulls and corrupt rows (high < low), deduplicates on (symbol, time). Computes SMA-20, SMA-50 via rolling window, daily return via pct_change().",
            },
            {
              step: "03 · LOAD",
              color: "var(--accent)",
              desc: "Idempotent INSERT ... ON CONFLICT DO NOTHING into PostgreSQL. Running the pipeline twice yields the same result. Every run is logged to pipeline_runs for the status API.",
            },
          ].map((b, i) => (
            <div key={i} style={{ borderLeft: `2px solid ${b.color}`, paddingLeft: 14, paddingTop: 2, opacity: 0.85 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.15em", color: b.color, marginBottom: 6 }}>
                {b.step}
              </div>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", lineHeight: 1.7 }}>{b.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

