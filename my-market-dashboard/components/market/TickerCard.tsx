import { CRYPTOS } from "@/lib/market/constants";
import { fmt, fmtK } from "@/lib/market/format";
import type { Latest } from "@/types/market";

export function TickerCard({
  symbol,
  latest,
  onClick,
  active,
}: {
  symbol: string;
  latest: Latest | null;
  onClick: () => void;
  active: boolean;
}) {
  const up = (latest?.change_pct ?? 0) >= 0;

  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "var(--accent-dim)" : "var(--bg-2)",
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        padding: "12px 14px",
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
        transition: "all .2s",
        fontFamily: "var(--font-mono)",
      }}
    >
      <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "var(--text-muted)", marginBottom: 4 }}>
        {CRYPTOS.includes(symbol) ? "CRYPTO" : "EQUITY"}
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--accent)",
          fontWeight: 500,
          letterSpacing: "0.1em",
          marginBottom: 6,
        }}
      >
        {symbol}
      </div>

      {latest ? (
        <>
          <div style={{ fontSize: 16, color: "var(--text)", fontWeight: 300 }}>
            ${latest.price > 1000 ? fmtK(latest.price) : fmt(latest.price)}
          </div>
          <div style={{ fontSize: 10, color: up ? "var(--accent)" : "#ef4444", marginTop: 2 }}>
            {up ? "▲" : "▼"} {Math.abs(latest.change_pct).toFixed(2)}%
          </div>
        </>
      ) : (
        <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em" }}>···</div>
      )}

      {active && (
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 1, background: "var(--accent)" }} />
      )}
    </button>
  );
}

