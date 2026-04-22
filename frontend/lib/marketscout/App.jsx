// src/App.jsx
import Pipeline from "./components/Pipeline";

export default function App() {
  return (
    <div style={{
      maxWidth: 800,
      margin: "0 auto",
      padding: "2.5rem 1.25rem 2rem",
      fontFamily: "system-ui, sans-serif",
    }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>

          {/* Icône */}
          <div style={{
            width: 48, height: 48, flexShrink: 0,
            borderRadius: 12,
            background: "#534AB7",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M11 3L13.5 8.5H19L14.5 12L16.5 18L11 14.5L5.5 18L7.5 12L3 8.5H8.5L11 3Z" fill="white"/>
            </svg>
          </div>

          {/* Titre + sous-titre */}
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <h1 style={{
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontSize: 28,
                fontWeight: 400,
                letterSpacing: "-0.5px",
                color: "var(--color-text-primary, #1a1a1a)",
                lineHeight: 1,
                margin: 0,
              }}>
                Analyseur de marché startup
              </h1>
              <span style={{
                fontSize: 11, fontWeight: 500,
                padding: "3px 8px", borderRadius: 999,
                background: "#EEEDFE", color: "#534AB7",
                letterSpacing: "0.4px",
              }}>
                BETA
              </span>
            </div>
            <p style={{
              fontSize: 14,
              color: "var(--color-text-secondary, #888)",
              margin: 0, lineHeight: 1.5,
            }}>
              Concurrents · Avis · SWOT propulsé par une IA multi-agent
            </p>
          </div>

          {/* Badge région */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 12px",
            borderRadius: 999,
            border: "0.5px solid var(--color-border-tertiary, #e5e5e5)",
            fontSize: 12,
            color: "var(--color-text-secondary, #888)",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#1D9E75" }} />
            Tunisie &amp; Afrique du Nord
          </div>

        </div>
      </div>

      <Pipeline />
    </div>
  );
}