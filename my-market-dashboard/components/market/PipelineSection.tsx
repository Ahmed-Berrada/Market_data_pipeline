import { CRYPTOS, STOCKS } from "@/lib/market/constants";
import { ago } from "@/lib/market/format";
import { SectionLabel } from "@/components/market/Primitives";
import type { PipelineStatus } from "@/types/market";

export function PipelineSection({ pipeline }: { pipeline: PipelineStatus | null }) {
  return (
    <div style={{ marginBottom: "clamp(32px, 8vw, 48px)" }}>
      <SectionLabel>Pipeline · Airflow DAGs</SectionLabel>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "clamp(8px, 3vw, 12px)", marginBottom: 24 }}>
        {[
          {
            id: "stocks_1min",
            schedule: "Weekdays · every minute",
            symbols: STOCKS,
            source: "Yahoo Finance · yfinance (1m interval)",
            steps: [
              "Extract 1m OHLCV via yfinance",
              "Validate + clean rows",
              "Compute SMA-20/50, daily return",
              "INSERT ON CONFLICT DO NOTHING",
              "Log run to pipeline_runs",
            ],
            color: "var(--accent)",
          },
          {
            id: "crypto_5min",
            schedule: "24/7 · every 5 minutes",
            symbols: CRYPTOS,
            source: "CoinGecko public API",
            steps: [
              "Fetch OHLCV from CoinGecko",
              "Handle rate limits (1.5s delay)",
              "Transform + deduplicate",
              "Load to crypto_prices",
              "Log run to pipeline_runs",
            ],
            color: "var(--navy-light)",
          },
        ].map((dag) => (
          <div key={dag.id} style={{ background: "var(--bg-2)", border: "1px solid var(--border)", padding: "clamp(16px, 3vw, 22px) clamp(16px, 3vw, 24px)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, gap: 8, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(11px, 2vw, 12px)", color: dag.color, fontWeight: 500, marginBottom: 4 }}>
                  {dag.id}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(8px, 2vw, 9px)", color: "var(--text-muted)", letterSpacing: "0.1em" }}>
                  {dag.schedule}
                </div>
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "clamp(7px, 1.5vw, 8px)",
                  letterSpacing: "0.15em",
                  color: dag.color,
                  border: `1px solid ${dag.color}`,
                  padding: "2px 7px",
                  opacity: 0.7,
                  whiteSpace: "nowrap",
                }}
              >
                ACTIVE
              </div>
            </div>

            <div style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(8px, 2vw, 9px)", color: "var(--text-muted)", marginBottom: 12 }}>{dag.source}</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
              {dag.steps.map((step, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      border: `1px solid ${dag.color}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      color: dag.color,
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    {i + 1}
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(8px, 2vw, 10px)", color: "var(--text-dim)" }}>{step}</span>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {dag.symbols.map((s) => (
                <span key={s} style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(7px, 1.5vw, 8px)", padding: "2px 6px", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ border: "1px solid var(--border)", background: "var(--bg-2)", overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr", padding: "10px 18px", borderBottom: "1px solid var(--border)", minWidth: "500px" }}>
          {["DAG", "LAST RUN", "STATUS", "ROWS INSERTED", "DURATION"].map((h) => (
            <span key={h} style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(7px, 1.5vw, 8px)", letterSpacing: "0.2em", color: "var(--text-muted)" }}>
              {h}
            </span>
          ))}
        </div>

        {pipeline?.pipelines?.length ? (
          pipeline.pipelines.map((p, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr",
                padding: "10px 18px",
                borderBottom: "1px solid var(--border)",
                transition: "background .15s",
                minWidth: "500px",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-3)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(10px, 2vw, 11px)", color: "var(--accent)" }}>{p.dag_id}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(10px, 2vw, 11px)", color: "var(--text-dim)" }}>{ago(p.last_run)}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(10px, 2vw, 11px)", color: p.status === "success" ? "#4ade80" : "#ef4444" }}>
                {p.status.toUpperCase()}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(10px, 2vw, 11px)", color: "var(--text-dim)" }}>
                {p.rows_inserted?.toLocaleString()}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(10px, 2vw, 11px)", color: "var(--text-dim)" }}>
                {p.duration_seconds?.toFixed(1)}s
              </span>
            </div>
          ))
        ) : (
          <div style={{ padding: "24px 18px", fontFamily: "var(--font-mono)", fontSize: "clamp(9px, 2vw, 10px)", color: "var(--text-muted)", letterSpacing: "0.15em", textAlign: "center" }}>
            NO RUNS RECORDED YET
          </div>
        )}
      </div>
    </div>
  );
}
