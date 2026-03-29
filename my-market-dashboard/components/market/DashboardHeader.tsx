import { TECH_STACK } from "@/lib/market/constants";
import { ago, fmtK } from "@/lib/market/format";
import type { PipelineStatus } from "@/types/market";

export function DashboardNav({ lastRun }: { lastRun?: string }) {
  return (
    <nav
      style={{
        borderBottom: "1px solid var(--border)",
        padding: "14px 32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "var(--bg)",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      <a
        href="https://ahmedberrada.com"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.2em",
          color: "var(--text-muted)",
          textDecoration: "none",
          transition: "color .2s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
      >
        ← AHMED BERRADA
      </a>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.2em", color: "var(--text-muted)" }}>
          {lastRun ? `UPDATED ${ago(lastRun).toUpperCase()}` : "MARKET DATA PIPELINE"}
        </span>
      </div>
    </nav>
  );
}

export function HeroSection() {
  return (
    <div style={{ marginBottom: 56 }}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
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
          fontSize: "clamp(40px,6vw,72px)",
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
          fontSize: 12,
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
              fontSize: 9,
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
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 48 }}>
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
        <div key={i} style={{ background: "var(--bg-2)", border: "1px solid var(--border)", padding: "20px 22px" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 8,
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
              fontSize: 28,
              color: "var(--accent)",
              fontWeight: 300,
              lineHeight: 1,
              marginBottom: 6,
            }}
          >
            {s.value}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{s.sub}</div>
        </div>
      ))}
    </div>
  );
}
