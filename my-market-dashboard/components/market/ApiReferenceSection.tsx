import { API_ENDPOINTS } from "@/lib/market/constants";
import { API_BASE } from "@/lib/market/constants";
import { SectionLabel } from "@/components/market/Primitives";

export function ApiReferenceSection() {
  return (
    <div style={{ marginBottom: "clamp(32px, 8vw, 48px)" }}>
      <SectionLabel>REST API · Endpoints</SectionLabel>
      <div style={{ border: "1px solid var(--border)", background: "var(--bg-2)", overflowX: "auto" }}>
        {API_ENDPOINTS.map((ep, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "clamp(8px, 2vw, 16px)",
              padding: "10px clamp(10px, 3vw, 18px)",
              borderBottom: "1px solid var(--border)",
              transition: "background .15s",
              cursor: "default",
              minWidth: "300px",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-3)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(8px, 1.5vw, 9px)", color: "var(--accent)", opacity: 0.7, width: 28, flexShrink: 0 }}>
              {ep.m}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(9px, 2vw, 11px)", color: "var(--text-dim)", flex: 1, overflowX: "auto" }}>{ep.p}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(8px, 1.5vw, 9px)", color: "var(--text-muted)", display: "none" }} className="md-show">
              {ep.d}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: "clamp(8px, 2vw, 12px)", marginTop: 12, flexWrap: "wrap" }}>
        <a
          href={`${API_BASE}/docs`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "clamp(8px, 1.5vw, 9px)",
            letterSpacing: "0.18em",
            color: "var(--accent)",
            border: "1px solid var(--accent)",
            padding: "clamp(5px, 1vw, 7px) clamp(10px, 2vw, 14px)",
            textDecoration: "none",
            opacity: 0.7,
            transition: "opacity .2s",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.7")}
        >
          INTERACTIVE DOCS ↗
        </a>

        <a
          href="https://github.com/Ahmed-Berrada/Market_data_pipeline"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "clamp(8px, 1.5vw, 9px)",
            letterSpacing: "0.18em",
            color: "var(--text-muted)",
            border: "1px solid var(--border)",
            padding: "clamp(5px, 1vw, 7px) clamp(10px, 2vw, 14px)",
            textDecoration: "none",
            transition: "all .2s",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--text)";
            e.currentTarget.style.borderColor = "var(--border-2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-muted)";
            e.currentTarget.style.borderColor = "var(--border)";
          }}
        >
          VIEW SOURCE ↗
        </a>
      </div>
    </div>
  );
}

