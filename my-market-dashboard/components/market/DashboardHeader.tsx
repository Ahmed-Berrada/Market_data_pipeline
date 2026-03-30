import { TECH_STACK } from "@/lib/market/constants";
import { ago, fmtK } from "@/lib/market/format";
import type { PipelineStatus } from "@/types/market";

export function DashboardNav({ lastRun }: { lastRun?: string }) {
  return (
    <nav
      style={{
        borderBottom: "1px solid var(--border)",
        padding: "clamp(10px, 3vw, 14px) clamp(12px, 5vw, 32px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "var(--bg)",
        position: "sticky",
        top: 0,
        zIndex: 50,
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <a
        href="https://ahmedberrada.com"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "clamp(8px, 2vw, 10px)",
          letterSpacing: "0.2em",
          color: "var(--text-muted)",
          textDecoration: "none",
          transition: "color .2s",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
      >
        ← AHMED BERRADA
      </a>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(8px, 2vw, 9px)", letterSpacing: "0.2em", color: "var(--text-muted)" }}>
          {lastRun ? `UPDATED ${ago(lastRun).toUpperCase()}` : "MARKET DATA PIPELINE"}
        </span>
      </div>
    </nav>
  );
}

export function HeroSection() {
  return (
    <div style={{ marginBottom: "clamp(32px, 8vw, 56px)" }}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "clamp(7px, 2vw, 9px)",
          letterSpacing: "0.25em",
          color: "var(--text-muted)",
          marginBottom: 20,
        }}
      >
        02 · PROJECT · DATA ENGINEERING
      </div>
      <div style={{ width: 32, height: 1, background: "var(--accent)", opacity: 0.6, marginBottom: 24 }} />
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "clamp(32px, 8vw, 72px)",
          fontWeight: 400,
          lineHeight: 1,
          color: "var(--text)",
          marginBottom: 20,
        }}
      >
        Market Data
        <br />
        <em style={{ color: "var(--accent)", fontStyle: "italic" }}>Pipeline</em>
      </h1>
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "clamp(10px, 2.5vw, 12px)",
          color: "var(--text-muted)",
          maxWidth: 560,
          lineHeight: 1.8,
          marginBottom: 28,
        }}
      >
        Production-grade ETL system ingesting equities + crypto OHLCV data, computing financial indicators,
        orchestrating via Apache Airflow, stored in PostgreSQL and served through FastAPI.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {TECH_STACK.map((t) => (
          <span
            key={t}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "clamp(7px, 2vw, 9px)",
              letterSpacing: "0.12em",
              padding: "4px 10px",
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
            }}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

export function StatsGrid({ pipeline }: { pipeline: PipelineStatus | null }) {
  const totalRows = pipeline ? Object.values(pipeline.row_counts).reduce((a, b) => a + b, 0) : null;
  const lastRun = pipeline?.pipelines?.[0]?.last_run;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "clamp(8px, 3vw, 12px)", marginBottom: "clamp(32px, 8vw, 48px)" }}>
      {[
        { label: "DATA SOURCES", value: "2", sub: "Yahoo Finance + CoinGecko" },
        { label: "ASSETS TRACKED", value: "11", sub: "7 stocks · 4 crypto" },
        { label: "ROWS STORED", value: totalRows ? fmtK(totalRows) : "—", sub: "OHLCV + indicators" },
        {
          label: "PIPELINE STATUS",
          value: pipeline?.pipelines?.[0]?.status?.toUpperCase() ?? "—",
          sub: lastRun ? ago(lastRun) : "Airflow DAGs",
        },
      ].map((s, i) => (
        <div key={i} style={{ background: "var(--bg-2)", border: "1px solid var(--border)", padding: "clamp(14px, 3vw, 20px)" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "clamp(7px, 1.5vw, 8px)",
              letterSpacing: "0.22em",
              color: "var(--text-muted)",
              marginBottom: 10,
            }}
          >
            {s.label}
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "clamp(20px, 5vw, 28px)",
              color: "var(--accent)",
              fontWeight: 300,
              lineHeight: 1,
              marginBottom: 6,
            }}
          >
            {s.value}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(8px, 1.5vw, 9px)", color: "var(--text-muted)" }}>{s.sub}</div>
        </div>
      ))}
    </div>
  );
}
