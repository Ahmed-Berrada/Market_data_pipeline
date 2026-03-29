import { API_ENDPOINTS } from "@/lib/market/constants";
import { API_BASE } from "@/lib/market/constants";
import { SectionLabel } from "@/components/market/Primitives";

export function ApiReferenceSection() {
  return (
    <div style={{ marginBottom: 48 }}>
      <SectionLabel>REST API · Endpoints</SectionLabel>
      <div style={{ border: "1px solid var(--border)", background: "var(--bg-2)" }}>
        {API_ENDPOINTS.map((ep, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "10px 18px",
              borderBottom: "1px solid var(--border)",
              transition: "background .15s",
              cursor: "default",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-3)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)", opacity: 0.7, width: 28, flexShrink: 0 }}>
              {ep.m}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)", flex: 1 }}>{ep.p}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", display: "none" }} className="md-show">
              {ep.d}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <a
          href={`${API_BASE}/docs`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.18em",
            color: "var(--accent)",
            border: "1px solid var(--accent)",
            padding: "7px 14px",
            textDecoration: "none",
            opacity: 0.7,
            transition: "opacity .2s",
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
            fontSize: 9,
            letterSpacing: "0.18em",
            color: "var(--text-muted)",
            border: "1px solid var(--border)",
            padding: "7px 14px",
            textDecoration: "none",
            transition: "all .2s",
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

