import { SectionLabel } from "@/components/market/Primitives";

export function LearnedSection() {
  return (
    <div style={{ marginBottom: "clamp(32px, 8vw, 48px)" }}>
      <SectionLabel>What I Learned</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "clamp(8px, 3vw, 12px)" }}>
        {[
          {
            title: "DAGs & orchestration",
            body: "How Airflow schedules, retries, and tracks tasks. The difference between a cron job and a proper orchestrated pipeline with dependency management and failure isolation.",
          },
          {
            title: "Idempotent pipelines",
            body: "ON CONFLICT DO NOTHING means running the same pipeline twice yields the same DB state. Critical for reliability - restarts and replays should not corrupt data.",
          },
          {
            title: "Time-series data modelling",
            body: "How to structure OHLCV tables for efficient range queries. Why indexing on (symbol, time DESC) matters for the query patterns a financial API actually runs.",
          },
          {
            title: "Financial indicators",
            body: "What SMA-20 and SMA-50 reveal about price trends. How daily return normalises changes across assets at different scales.",
          },
        ].map((l, i) => (
          <div key={i} style={{ borderLeft: "2px solid var(--border-2)", paddingLeft: 16, paddingTop: 2 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(9px, 2vw, 10px)", color: "var(--text-dim)", marginBottom: 6, fontWeight: 500 }}>
              {l.title}
            </div>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(9px, 2vw, 10px)", color: "var(--text-muted)", lineHeight: 1.7 }}>{l.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardFooter() {
  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: "clamp(16px, 4vw, 24px)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
      <a
        href="https://ahmedberrada.com"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "clamp(8px, 2vw, 9px)",
          letterSpacing: "0.2em",
          color: "var(--text-muted)",
          textDecoration: "none",
          transition: "color .2s",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
      >
        ← BACK TO PORTFOLIO
      </a>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(8px, 2vw, 9px)", letterSpacing: "0.15em", color: "var(--border-2)" }}>
        AHMED BERRADA · 2026
      </span>
    </div>
  );
}

