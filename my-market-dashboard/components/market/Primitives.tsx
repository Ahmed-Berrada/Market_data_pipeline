import type { ReactNode } from "react";

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        letterSpacing: "0.25em",
        color: "var(--text-muted)",
        textTransform: "uppercase",
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  );
}

export function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        letterSpacing: "0.15em",
        padding: "5px 14px",
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        color: active ? "var(--accent)" : "var(--text-muted)",
        background: active ? "var(--accent-dim)" : "transparent",
        cursor: "pointer",
        transition: "all .2s",
        textTransform: "uppercase",
      }}
    >
      {children}
    </button>
  );
}

export function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 20, height: 1.5, background: color }} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
        {label}
      </span>
    </div>
  );
}

