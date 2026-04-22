// src/components/PresentationModal.jsx
import { useState, useRef, useCallback } from "react";
import { THEMES, generatePPTX, generatePDF } from "../utils/presentationBuilder";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function isEmpty(val) {
  if (!val) return true;
  if (typeof val === "string") {
    const low = val.toLowerCase().trim();
    return (
      low === "" ||
      low.includes("not available") ||
      low.includes("not mentioned") ||
      low.includes("not mentionned") ||
      low.includes("non_mentionne") ||
      low.includes("non_mentionné") ||
      low.includes("non mentionne") ||
      low.includes("n/a") ||
      low.includes("unknown") ||
      low.includes("aucun") ||
      low.includes("non disponible")
    );
  }
  if (Array.isArray(val)) return val.length === 0;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED SLIDE HEADER
// ─────────────────────────────────────────────────────────────────────────────
function SlideHeader({ theme, title, subtitle }) {
  return (
    <div style={{ marginBottom: 6, flexShrink: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: theme.primary }}>{title}</div>
      <div style={{ width: 18, height: 2, background: theme.primary, borderRadius: 1, marginTop: 2 }} />
      {subtitle && (
        <div style={{ fontSize: 5, color: theme.textMuted, marginTop: 2 }}>{subtitle}</div>
      )}
    </div>
  );
}

// Pill tag component
function Pill({ children, color, bg, border }) {
  return (
    <span style={{
      fontSize: 5.5, padding: "1px 5px", borderRadius: 20,
      background: bg, color, border: `0.5px solid ${border}`,
      display: "inline-block", whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEXT BOX — auto-scales font to fit, no truncation
// ─────────────────────────────────────────────────────────────────────────────
function FitText({ text, maxFontSize = 6, minFontSize = 4, style = {}, color = "#444" }) {
  return (
    <div style={{
      fontSize: maxFontSize,
      color,
      lineHeight: 1.4,
      wordBreak: "break-word",
      whiteSpace: "pre-wrap",
      overflow: "hidden",
      ...style,
    }}>
      {text}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE THUMBNAILS
// ─────────────────────────────────────────────────────────────────────────────

function SlideCover({ theme, companyName, projectData, date }) {
  const initials = (companyName || "MI")
    .split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  const chips = [projectData?.sector, projectData?.location, projectData?.clientType]
    .filter(Boolean).slice(0, 3);
  const desc = projectData?.enriched_description || projectData?.description || "";

  return (
    <div style={{
      background: theme.primary, width: "100%", height: "100%",
      borderRadius: 5, position: "relative", overflow: "hidden",
      display: "flex", flexDirection: "column", justifyContent: "flex-end",
      padding: 10, boxSizing: "border-box",
    }}>
      <div style={{ position: "absolute", top: -20, right: -20, width: 80, height: 80, borderRadius: "50%", background: theme.primaryDark, opacity: 0.5 }} />
      <div style={{ position: "absolute", bottom: -15, left: -15, width: 50, height: 50, borderRadius: "50%", background: theme.primaryDark, opacity: 0.4 }} />

      <div style={{ position: "absolute", top: 8, left: 8, width: 26, height: 26, borderRadius: 6, background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff" }}>
        {initials}
      </div>

      {chips.length > 0 && (
        <div style={{ display: "flex", gap: 3, marginBottom: 5, zIndex: 1, flexWrap: "wrap" }}>
          {chips.map((chip) => (
            <span key={chip} style={{ fontSize: 5.5, padding: "2px 6px", borderRadius: 20, background: "rgba(255,255,255,0.2)", color: "#fff" }}>{chip}</span>
          ))}
        </div>
      )}

      <div style={{ fontSize: 5.5, color: "rgba(255,255,255,0.65)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 3, zIndex: 1 }}>
        Analyse concurrentielle du marché
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", lineHeight: 1.2, zIndex: 1, marginBottom: 3 }}>
        {companyName || projectData?.sector || "Analyse du marché"}
      </div>
      {desc && (
        <div style={{
          fontSize: 5.5, color: "rgba(255,255,255,0.65)", lineHeight: 1.4, zIndex: 1, marginBottom: 4,
          overflow: "hidden", maxHeight: 28,
          display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
        }}>
          {desc}
        </div>
      )}

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 18, background: `${theme.primaryDark}CC`, display: "flex", alignItems: "center", paddingLeft: 8 }}>
        <span style={{ fontSize: 5.5, color: "rgba(255,255,255,0.65)" }}>{date}</span>
      </div>
    </div>
  );
}

function SlideExecSummary({ theme, projectData, context }) {
  const desc = projectData?.enriched_description || projectData?.description || "—";
  const infoItems = [
    { label: "Localisation", value: projectData?.location    || "—" },
    { label: "Secteur",     value: projectData?.sector      || "—" },
    { label: "Type de client", value: projectData?.clientType  || "—" },
    { label: "Phase",       value: projectData?.stage       || "—" },
  ].filter((x) => x.value !== "—");

  const scores  = context?.swot?.overall_score;
  const problem = projectData?.problem_solved;
  const diff    = projectData?.differentiator;

  return (
    <div style={{
      background: theme.bg, width: "100%", height: "100%", borderRadius: 5,
      overflow: "hidden", padding: 8, boxSizing: "border-box",
      display: "flex", flexDirection: "column",
    }}>
      <SlideHeader theme={theme} title="Résumé exécutif" />

      {/* Description — no truncation, clamp to 4 lines */}
      <div style={{
        fontSize: 6, color: "#555", lineHeight: 1.4, marginBottom: 5, flexShrink: 0,
        overflow: "hidden",
        display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical",
      }}>
        {desc}
      </div>

      {/* Info chips row */}
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginBottom: 5, flexShrink: 0 }}>
        {infoItems.map(({ label, value }) => (
          <div key={label} style={{
            background: theme.bgAlt, borderRadius: 4, padding: "2px 5px",
            border: `0.5px solid ${theme.border}`, minWidth: 0, maxWidth: "48%",
            overflow: "hidden",
          }}>
            <div style={{ fontSize: 4.5, color: theme.textMuted, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>
            <div style={{
              fontSize: 6, fontWeight: 700, color: theme.primary,
              overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
            }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Problem / Differentiator */}
      <div style={{ display: "flex", gap: 4, marginBottom: 4, flex: 1, minHeight: 0, overflow: "hidden" }}>
        {problem && (
          <div style={{ flex: 1, borderLeft: `2px solid ${theme.accent}`, paddingLeft: 4, overflow: "hidden" }}>
            <div style={{ fontSize: 4.5, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", marginBottom: 1 }}>Problème résolu</div>
            <div style={{
              fontSize: 5.5, color: "#444", lineHeight: 1.3,
              overflow: "hidden",
              display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical",
            }}>{problem}</div>
          </div>
        )}
        {diff && (
          <div style={{ flex: 1, borderLeft: `2px solid ${theme.primary}`, paddingLeft: 4, overflow: "hidden" }}>
            <div style={{ fontSize: 4.5, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", marginBottom: 1 }}>Différenciateur</div>
            <div style={{
              fontSize: 5.5, color: "#444", lineHeight: 1.3,
              overflow: "hidden",
              display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical",
            }}>{diff}</div>
          </div>
        )}
      </div>

      {/* Scores row */}
      {scores && (
        <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
          {[
            { key: "viability",          label: "Viabilité",   color: theme.accent },
            { key: "market_opportunity",  label: "Opportunité", color: theme.primary },
            { key: "competition_risk",    label: "Risk",        color: "#A32D2D" },
          ].map(({ key, label, color }) => scores[key] != null && (
            <div key={key} style={{ flex: 1, textAlign: "center", padding: "2px 0", background: `${color}12`, borderRadius: 3, border: `0.5px solid ${color}30` }}>
              <div style={{ fontSize: 9, fontWeight: 700, color }}>{scores[key]}/100</div>
              <div style={{ fontSize: 4.5, color, opacity: 0.8 }}>{label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SlideMarketOverview({ theme, context }) {
  const comps    = context?.competitors_structured || [];
  const scraped  = comps.filter((c) => c.scrape_status === "success").length;
  const reviewed = comps.filter((c) => c.reviews?.sources_used?.length > 0).length;

  return (
    <div style={{ background: theme.bg, width: "100%", height: "100%", borderRadius: 5, overflow: "hidden", padding: 8, boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
      <SlideHeader theme={theme} title="Aperçu du marché" />

      <div style={{ display: "flex", gap: 4, marginBottom: 6, flexShrink: 0 }}>
        {[
          { n: context?.competitors?.length || 0, label: "Identifiés", color: theme.primary },
          { n: scraped,  label: "Scrappés",     color: theme.accent },
          { n: reviewed, label: "Avec avis",    color: theme.warning },
        ].map(({ n, label, color }) => (
          <div key={label} style={{ flex: 1, background: `${color}18`, borderRadius: 4, padding: "3px 2px", textAlign: "center", border: `0.5px solid ${color}40` }}>
            <div style={{ fontSize: 14, fontWeight: 700, color }}>{n}</div>
            <div style={{ fontSize: 5, color, opacity: 0.8 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1.2fr 1fr", gap: 2, padding: "2px 4px", background: theme.primary, borderRadius: 3, marginBottom: 2 }}>
          {["Concurrent", "Tarification", "Sentiment", "Statut"].map((h) => (
            <div key={h} style={{ fontSize: 5, fontWeight: 700, color: "#fff" }}>{h}</div>
          ))}
        </div>
        {comps.slice(0, 6).map((c) => {
          const sent = (c.reviews?.overall_sentiment || "").toLowerCase();
          const sentColor = sent.includes("positive") || sent.includes("positif") ? "#0F6E56"
                          : sent.includes("negative") || sent.includes("negatif") ? "#A32D2D"
                          : "#854F0B";
          return (
            <div key={c.name} style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1.2fr 1fr", gap: 2, padding: "2px 4px", borderBottom: `0.5px solid ${theme.border}`, alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 3, overflow: "hidden" }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: theme.primaryLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 4.5, fontWeight: 700, color: theme.primary, flexShrink: 0 }}>
                  {(c.name || "?").slice(0, 2).toUpperCase()}
                </div>
                <span style={{ fontSize: 6, fontWeight: 500, color: theme.text, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{c.name}</span>
              </div>
              <span style={{ fontSize: 5.5, color: theme.textMuted, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{c.pricing?.model && !isEmpty(c.pricing.model) ? c.pricing.model : "—"}</span>
              <span style={{ fontSize: 5.5, color: sentColor, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{c.reviews?.overall_sentiment || "—"}</span>
              <span style={{ fontSize: 5.5, color: c.scrape_status === "success" ? "#0F6E56" : theme.textMuted }}>
                {c.scrape_status === "success" ? "✓" : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SlideCompetitors({ theme, context }) {
  const comps = (context?.competitors_structured || []).filter((c) => c?.name).slice(0, 3);

  return (
    <div style={{ background: theme.bg, width: "100%", height: "100%", borderRadius: 5, overflow: "hidden", padding: 8, boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
      <SlideHeader theme={theme} title="Concurrents identifiés" />
      <div style={{ display: "flex", gap: 4, flex: 1, minHeight: 0, overflow: "hidden" }}>
        {comps.map((c) => {
          const strengths = [
            ...(c.competitive_analysis?.strengths || []),
            ...(c.competitive_analysis?.perceived_strengths || []).map((s) => s.point || s),
          ].filter(Boolean).slice(0, 3);
          const weaknesses = [
            ...(c.competitive_analysis?.weaknesses || []),
            ...(c.competitive_analysis?.perceived_weaknesses || []).map((w) => w.point || w),
          ].filter(Boolean).slice(0, 2);
          const initials  = (c.name || "?").split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
          const sent      = (c.reviews?.overall_sentiment || "").toLowerCase();
          const sentColor = sent.includes("positive") || sent.includes("positif") ? "#0F6E56"
                          : sent.includes("negative") || sent.includes("negatif") ? "#A32D2D" : "#854F0B";
          const sentBg    = sent.includes("positive") || sent.includes("positif") ? "#E1F5EE"
                          : sent.includes("negative") || sent.includes("negatif") ? "#FCEBEB" : "#FAEEDA";
          const googleRaw = c.reviews?.rating_summary?.google_maps;
          const desc      = c.general?.description;

          return (
            <div key={c.name} style={{
              flex: 1, background: theme.bgAlt, borderRadius: 4, padding: 5,
              border: `0.5px solid ${theme.border}`,
              display: "flex", flexDirection: "column", gap: 2.5,
              overflow: "hidden", minWidth: 0,
            }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, background: theme.primaryLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 5.5, fontWeight: 700, color: theme.primary, flexShrink: 0 }}>{initials}</div>
                <div style={{ minWidth: 0, overflow: "hidden" }}>
                  <div style={{ fontSize: 6.5, fontWeight: 700, color: theme.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                  {c.url && <div style={{ fontSize: 5, color: theme.primary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.url.replace(/^https?:\/\//, "")}</div>}
                </div>
              </div>

              {/* Description — clamp, no hard truncation */}
              {desc && !isEmpty(desc) && (
                <div style={{
                  fontSize: 5, color: theme.textMuted, lineHeight: 1.3,
                  overflow: "hidden",
                  display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
                  flexShrink: 0,
                }}>{desc}</div>
              )}

              {/* Strengths */}
              <div style={{ display: "flex", flexDirection: "column", gap: 1.5, overflow: "hidden" }}>
                {strengths.map((s, i) => (
                  <div key={i} style={{
                    fontSize: 5.5, color: "#0F6E56", padding: "1px 4px", borderRadius: 3, background: "#E1F5EE",
                    overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                  }}>+ {s}</div>
                ))}
                {weaknesses.map((w, i) => (
                  <div key={i} style={{
                    fontSize: 5.5, color: "#A32D2D", padding: "1px 4px", borderRadius: 3, background: "#FCEBEB",
                    overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                  }}>– {w}</div>
                ))}
              </div>

              {/* Bottom row */}
              <div style={{ marginTop: "auto", display: "flex", gap: 3, flexWrap: "wrap", flexShrink: 0 }}>
                {c.pricing?.model && !isEmpty(c.pricing.model) && (
                  <Pill color={theme.primary} bg={theme.primaryLight} border={theme.border}>{c.pricing.model}</Pill>
                )}
                {c.reviews?.overall_sentiment && (
                  <Pill color={sentColor} bg={sentBg} border={sentColor + "40"}>{c.reviews.overall_sentiment}</Pill>
                )}
                {googleRaw && googleRaw !== "N/A" && (
                  <Pill color="#BA7517" bg="#FAEEDA" border="#FAC77540">⭐ {googleRaw}</Pill>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SlideSWOT({ theme, context }) {
  const swot   = context?.swot || {};
  const scores = swot.overall_score;
  const q = [
    { key: "strengths",     label: "Forces",        sub: "Interne positif",  color: "#0F6E56", bg: "#E1F5EE" },
    { key: "weaknesses",    label: "Faiblesses",    sub: "Interne négatif",  color: "#A32D2D", bg: "#FCEBEB" },
    { key: "opportunities", label: "Opportunités", sub: "Externe positif", color: "#185FA5", bg: "#E6F1FB" },
    { key: "threats",       label: "Menaces",       sub: "Externe négatif", color: "#854F0B", bg: "#FAEEDA" },
  ];

  return (
    <div style={{ background: theme.bg, width: "100%", height: "100%", borderRadius: 5, overflow: "hidden", padding: 8, boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
      <SlideHeader theme={theme} title="Analyse SWOT" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, flex: 1, minHeight: 0 }}>
        {q.map(({ key, label, sub, color, bg }) => {
          const items = (swot[key] || []).slice(0, 4).map((i) =>
            typeof i === "string" ? i : i.point
          );
          return (
            <div key={key} style={{
              background: bg, borderRadius: 4, padding: 5,
              display: "flex", flexDirection: "column", overflow: "hidden",
            }}>
              <div style={{ fontSize: 7, fontWeight: 700, color, marginBottom: 1, flexShrink: 0 }}>{label}</div>
              <div style={{ fontSize: 4.5, color, opacity: 0.6, marginBottom: 3, flexShrink: 0 }}>{sub}</div>
              <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", gap: 1 }}>
                {items.map((item, i) => (
                  <div key={i} style={{
                    fontSize: 5.5, color, lineHeight: 1.3,
                    overflow: "hidden",
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                  }}>· {item || ""}</div>
                ))}
                {items.length === 0 && <div style={{ fontSize: 6, color, opacity: 0.4, fontStyle: "italic" }}>—</div>}
              </div>
            </div>
          );
        })}
      </div>

      {scores && (
        <div style={{ display: "flex", gap: 3, marginTop: 4, flexShrink: 0 }}>
          {[
            { key: "viability",          label: "Viabilité",   color: theme.accent  },
            { key: "market_opportunity",  label: "Opportunité", color: theme.primary },
            { key: "competition_risk",    label: "Risk",        color: "#A32D2D"     },
          ].map(({ key, label, color }) => scores[key] != null && (
            <div key={key} style={{ flex: 1, textAlign: "center", padding: "2px 0", background: `${color}12`, borderRadius: 3 }}>
              <div style={{ fontSize: 8, fontWeight: 700, color }}>{scores[key]}/100</div>
              <div style={{ fontSize: 4.5, color, opacity: 0.8 }}>{label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SlideCompetitiveStr({ theme, context }) {
  const comps = (context?.competitors_structured || []).filter((c) => c?.name).slice(0, 5);

  return (
    <div style={{ background: theme.bg, width: "100%", height: "100%", borderRadius: 5, overflow: "hidden", padding: 8, boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
      <SlideHeader theme={theme} title="Paysage concurrentiel" subtitle="Forces et faiblesses clés identifiées chez les concurrents" />
      <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, justifyContent: "center", overflow: "hidden" }}>
        {comps.map((c) => {
          const strengths = [
            ...(c.competitive_analysis?.strengths || []),
            ...(c.competitive_analysis?.perceived_strengths || []).map((s) => s.point || s),
          ].filter(Boolean).slice(0, 2);
          const weaknesses = [
            ...(c.competitive_analysis?.weaknesses || []),
            ...(c.competitive_analysis?.perceived_weaknesses || []).map((w) => w.point || w),
          ].filter(Boolean).slice(0, 1);
          const initials  = (c.name || "?").split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
          const sent      = (c.reviews?.overall_sentiment || "").toLowerCase();
          const sentColor = sent.includes("positive") || sent.includes("positif") ? "#0F6E56"
                          : sent.includes("negative") || sent.includes("negatif") ? "#A32D2D" : "#854F0B";
          const sentBg    = sent.includes("positive") || sent.includes("positif") ? "#E1F5EE"
                          : sent.includes("negative") || sent.includes("negatif") ? "#FCEBEB" : "#FAEEDA";

          return (
            <div key={c.name} style={{ display: "flex", alignItems: "flex-start", gap: 4, paddingBottom: 3, borderBottom: `0.5px solid ${theme.border}`, overflow: "hidden" }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, background: theme.primaryLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 5.5, fontWeight: 700, color: theme.primary, flexShrink: 0 }}>{initials}</div>
              <span style={{ fontSize: 6.5, fontWeight: 600, color: theme.text, minWidth: 45, flexShrink: 0 }}>{c.name}</span>
              {c.reviews?.overall_sentiment && (
                <Pill color={sentColor} bg={sentBg} border={sentColor + "40"}>{c.reviews.overall_sentiment}</Pill>
              )}
              <div style={{ display: "flex", gap: 2, flex: 1, flexWrap: "wrap", overflow: "hidden" }}>
                {strengths.map((s, i) => (
                  <div key={i} style={{
                    fontSize: 5.5, color: theme.primary, padding: "1px 4px", borderRadius: 3, background: theme.primaryLight,
                    overflow: "hidden", maxWidth: "100%",
                    display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical",
                  }}>+ {s}</div>
                ))}
                {weaknesses.map((w, i) => (
                  <div key={`w${i}`} style={{
                    fontSize: 5.5, color: "#A32D2D", padding: "1px 4px", borderRadius: 3, background: "#FCEBEB",
                    overflow: "hidden", maxWidth: "100%",
                    display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical",
                  }}>– {w}</div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SlideActions({ theme, context }) {
  const swot = context?.swot || {};
  const strategies = [
    { key: "so_strategies", label: "SO — Exploit",  color: "#0F6E56", bg: "#E1F5EE" },
    { key: "st_strategies", label: "ST — Defend",   color: "#185FA5", bg: "#E6F1FB" },
    { key: "wo_strategies", label: "WO — Improve",  color: "#854F0B", bg: "#FAEEDA" },
    { key: "wt_strategies", label: "WT — Avoid",    color: "#A32D2D", bg: "#FCEBEB" },
  ];

  return (
    <div style={{ background: theme.bg, width: "100%", height: "100%", borderRadius: 5, overflow: "hidden", padding: 8, boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
      <SlideHeader theme={theme} title="Actions stratégiques" subtitle="Stratégies issues de l'analyse croisée SWOT" />
      <div style={{ display: "flex", gap: 4, flex: 1, minHeight: 0, overflow: "hidden" }}>
        {strategies.map(({ key, label, color, bg }) => {
          const items = (swot[key] || []).slice(0, 4);
          return (
            <div key={key} style={{ flex: 1, background: bg, borderRadius: 4, padding: 5, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ fontSize: 6, fontWeight: 700, color, marginBottom: 4, flexShrink: 0 }}>{label}</div>
              <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", gap: 2 }}>
                {items.map((item, i) => (
                  <div key={i} style={{
                    fontSize: 5.5, color, lineHeight: 1.3,
                    overflow: "hidden",
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                  }}>→ {item || ""}</div>
                ))}
                {items.length === 0 && <div style={{ fontSize: 6, color, opacity: 0.4 }}>—</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SlideRecommendations({ theme, context }) {
  const actions  = (context?.swot?.priority_actions || []).slice(0, 5);
  const finalRec = context?.swot?.overall_score?.recommendation;

  return (
    <div style={{ background: theme.bg, width: "100%", height: "100%", borderRadius: 5, overflow: "hidden", padding: 8, boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
      <SlideHeader theme={theme} title="Recommandations" subtitle="Actions prioritaires issues de l'analyse SWOT" />
      <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, justifyContent: "center", overflow: "hidden" }}>
        {actions.length === 0 && (
          <div style={{ fontSize: 7, color: theme.textMuted, fontStyle: "italic", textAlign: "center" }}>Aucune action prioritaire définie</div>
        )}
        {actions.map((action, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 4, overflow: "hidden" }}>
            <div style={{ width: 14, height: 14, borderRadius: "50%", background: theme.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 6.5, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{i + 1}</div>
            <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
              <div style={{
                fontSize: 6.5, fontWeight: 600, color: theme.text,
                overflow: "hidden",
                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
              }}>{action.action || action}</div>
              {action.why && !isEmpty(action.why) && (
                <div style={{
                  fontSize: 5.5, color: theme.textMuted, marginTop: 1,
                  overflow: "hidden",
                  display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical",
                }}>{action.why}</div>
              )}
              <div style={{ display: "flex", gap: 3, marginTop: 2 }}>
                {action.timeline && !isEmpty(action.timeline) && (
                  <Pill color={theme.primary} bg={theme.primaryLight} border={theme.border}>{action.timeline}</Pill>
                )}
                {action.swot_link && !isEmpty(action.swot_link) && (
                  <Pill color={theme.textMuted} bg={theme.bgAlt} border={theme.border}>{action.swot_link}</Pill>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {finalRec && !isEmpty(finalRec) && (
        <div style={{ marginTop: 5, padding: "4px 7px", borderRadius: 5, background: theme.primaryLight, border: `0.5px solid ${theme.primary}40`, flexShrink: 0 }}>
          <div style={{ fontSize: 5, color: theme.textMuted, textTransform: "uppercase", marginBottom: 1 }}>Recommandation finale</div>
          <div style={{
            fontSize: 6.5, fontWeight: 600, color: theme.primary,
            overflow: "hidden",
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          }}>{finalRec}</div>
        </div>
      )}
    </div>
  );
}

function SlideThankYou({ theme, companyName, presenterName }) {
  const nextSteps = [
    "Validate positioning with pilot customers",
    "Define a 6-month product roadmap",
    "Launch a targeted awareness campaign",
    "Identify and secure strategic partners",
  ];

  return (
    <div style={{ background: theme.bgAlt, width: "100%", height: "100%", borderRadius: 5, overflow: "hidden", display: "flex" }}>
      <div style={{ width: "42%", background: theme.primary, padding: 10, display: "flex", flexDirection: "column", justifyContent: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", bottom: -15, left: -15, width: 50, height: 50, borderRadius: "50%", background: theme.primaryDark, opacity: 0.4 }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", lineHeight: 1.2, zIndex: 1 }}>Merci</div>
        {presenterName && <div style={{ fontSize: 7, color: "rgba(255,255,255,0.7)", marginTop: 6, zIndex: 1 }}>{presenterName}</div>}
        <div style={{ fontSize: 5.5, color: "rgba(255,255,255,0.45)", marginTop: "auto", zIndex: 1 }}>Plateforme d'intelligence marché</div>
      </div>

      <div style={{ flex: 1, padding: 10, display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 8, fontWeight: 700, color: theme.primary, marginBottom: 4 }}>Étapes suivantes</div>
        {nextSteps.map((step, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: theme.primary, flexShrink: 0 }} />
            <span style={{ fontSize: 6.5, color: theme.text }}>{step}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────
const SLIDE_DEFS = [
  { key: "cover",           label: "Couverture"              },
  { key: "exec_summary",    label: "Résumé exécutif"        },
  { key: "market_overview", label: "Aperçu du marché"       },
  { key: "competitors",     label: "Concurrents"            },
  { key: "swot",            label: "Analyse SWOT"           },
  { key: "competitive_str", label: "Paysage concurrentiel"   },
  { key: "actions",         label: "Actions stratégiques"   },
  { key: "recommendations", label: "Recommandations"         },
  { key: "thank_you",       label: "Merci"                  },
  ];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN MODAL
// ─────────────────────────────────────────────────────────────────────────────
export default function PresentationModal({ context, projectData, onClose }) {
  const [themeKey,        setThemeKey]       = useState("purple");
  const [companyName,     setCompanyName]    = useState(projectData?.sector || "");
  const [presenterName,   setPresenterName]  = useState("");
  const [slideSelection,  setSlideSelection] = useState(
    Object.fromEntries(SLIDE_DEFS.map((s) => [s.key, true]))
  );
  const [exportStatus, setExportStatus] = useState(null);
  const [loadingPptx,  setLoadingPptx]  = useState(false);
  const [loadingPdf,   setLoadingPdf]   = useState(false);

  const slidesRef = useRef(null);

  const theme        = THEMES[themeKey] || THEMES.purple;
  const today        = new Date().toLocaleDateString("fr-FR", { year: "numeric", month: "long" });
  const enabledCount = Object.values(slideSelection).filter(Boolean).length;

  const toggleSlide = useCallback((key) => {
    setSlideSelection((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handlePPTX = async () => {
    setLoadingPptx(true);
    setExportStatus(null);
    try {
      await generatePPTX(context, projectData, {
        theme: themeKey,
        companyName,
        presenterName,
        date: today,
        lang: "fr",
        slides: slideSelection,
      });
      setExportStatus({ type: "success", msg: "Présentation téléchargée !" });
    } catch (err) {
      setExportStatus({ type: "error", msg: `Erreur PPTX : ${err.message}` });
    } finally {
      setLoadingPptx(false);
    }
  };

  const handlePDF = async () => {
    setLoadingPdf(true);
    setExportStatus(null);
    try {
      await generatePDF(slidesRef, {
        companyName: companyName || "Analyse_Concurrentielle",
        date: today,
      });
      setExportStatus({ type: "success", msg: "PDF téléchargé !" });
    } catch (err) {
      setExportStatus({ type: "error", msg: `Erreur PDF : ${err.message}` });
    } finally {
      setLoadingPdf(false);
    }
  };

  const slideProps = { theme, context, projectData, companyName, presenterName, date: today };

  const slideComponents = {
    cover:           <SlideCover          {...slideProps} />,
    exec_summary:    <SlideExecSummary    {...slideProps} />,
    market_overview: <SlideMarketOverview {...slideProps} />,
    competitors:     <SlideCompetitors    {...slideProps} />,
    swot:            <SlideSWOT           {...slideProps} />,
    competitive_str: <SlideCompetitiveStr {...slideProps} />,
    actions:         <SlideActions        {...slideProps} />,
    recommendations: <SlideRecommendations {...slideProps} />,
    thank_you:       <SlideThankYou       {...slideProps} />,
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--color-background-primary, #fff)",
        borderRadius: 14,
        border: "0.5px solid var(--color-border-secondary, #ccc)",
        width: "100%", maxWidth: 960,
        maxHeight: "calc(100vh - 32px)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>

        {/* ── HEADER ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 20px", borderBottom: "0.5px solid var(--color-border-tertiary, #eee)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "#EEEDFE", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <PresentIcon />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary, #1a1a1a)" }}>
                Créer la présentation
              </div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary, #888)" }}>
                {enabledCount} diapositive{enabledCount !== 1 ? "s" : ""} sélectionnée{enabledCount !== 1 ? "s" : ""}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 30, height: 30, borderRadius: "50%", border: "0.5px solid var(--color-border-secondary, #ccc)", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "var(--color-text-secondary, #888)" }}
          >✕</button>
        </div>

        {/* ── BODY ── */}
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

          {/* ── LEFT: Config panel ── */}
          <div style={{ width: 270, borderRight: "0.5px solid var(--color-border-tertiary, #eee)", padding: "16px 14px", overflowY: "auto", flexShrink: 0 }}>

            <SectionLabel>Thème de couleur</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 16 }}>
              {Object.entries(THEMES).map(([key, th]) => (
                <button
                  key={key}
                  onClick={() => setThemeKey(key)}
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    padding: "7px 9px", borderRadius: 8, cursor: "pointer",
                    border: themeKey === key ? `1.5px solid ${th.primary}` : "0.5px solid var(--color-border-tertiary, #eee)",
                    background: themeKey === key ? `${th.primary}12` : "transparent",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ width: 14, height: 14, borderRadius: 4, background: th.primary, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: themeKey === key ? 500 : 400, color: themeKey === key ? th.primary : "var(--color-text-primary, #1a1a1a)" }}>
                    {th.label}
                  </span>
                </button>
              ))}
            </div>

            <SectionLabel>Nom de l'entreprise</SectionLabel>
            <input
              type="text"
              placeholder="par ex. MarketPulse AI"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              style={inputStyle}
            />

            <SectionLabel style={{ marginTop: 12 }}>Présentateur</SectionLabel>
            <input
              type="text"
              placeholder="Votre nom"
              value={presenterName}
              onChange={(e) => setPresenterName(e.target.value)}
              style={inputStyle}
            />

            <SectionLabel style={{ marginTop: 14 }}>Diapositives à inclure</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {SLIDE_DEFS.map(({ key, label }) => {
                const checked = slideSelection[key];
                return (
                  <label
                    key={key}
                    onClick={() => toggleSlide(key)}
                    style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "3px 0" }}
                  >
                    <div style={{
                      width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                      border: `1.5px solid ${checked ? theme.primary : "var(--color-border-secondary, #ccc)"}`,
                      background: checked ? `${theme.primary}18` : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.15s",
                    }}>
                      {checked && (
                        <svg width="9" height="9" viewBox="0 0 9 9">
                          <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke={theme.primary} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span style={{ fontSize: 12, color: "var(--color-text-primary, #1a1a1a)" }}>{label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* ── RIGHT: Slide previews ── */}
          <div style={{ flex: 1, background: "var(--color-background-tertiary, #f5f5f5)", padding: "16px", overflowY: "auto" }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary, #888)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>
              Aperçu des diapositives
            </div>

            {/* Hidden PDF export container */}
            <div ref={slidesRef} style={{ position: "absolute", left: -9999, top: -9999, width: 1280 }}>
              {SLIDE_DEFS.filter(({ key }) => slideSelection[key]).map(({ key }) => (
                <div key={key} data-slide={key} style={{ width: 1280, height: 720, overflow: "hidden" }}>
                  {slideComponents[key]}
                </div>
              ))}
            </div>

            {/* Visible grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {SLIDE_DEFS.filter(({ key }) => slideSelection[key]).map(({ key, label }, idx) => (
                <div key={key}>
                  <div style={{
                    position: "relative", width: "100%", paddingBottom: "56.25%",
                    borderRadius: 8, overflow: "hidden",
                    border: `1.5px solid ${theme.primary}40`,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                  }}>
                    <div style={{ position: "absolute", inset: 0 }}>
                      {slideComponents[key]}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 5 }}>
                    <span style={{ fontSize: 10, color: "var(--color-text-secondary, #888)", fontWeight: 500 }}>
                      {idx + 1}. {label}
                    </span>
                  </div>
                </div>
              ))}

              {enabledCount === 0 && (
                <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 40, color: "var(--color-text-secondary, #888)", fontSize: 13 }}>
                  Sélectionnez au moins une diapositive
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderTop: "0.5px solid var(--color-border-tertiary, #eee)", flexShrink: 0, gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {exportStatus ? (
              <span style={{ fontSize: 12, color: exportStatus.type === "success" ? "#0F6E56" : "#A32D2D", fontWeight: 500 }}>
                {exportStatus.type === "success" ? "✓" : "✕"} {exportStatus.msg}
              </span>
            ) : (
              <span style={{ fontSize: 12, color: "var(--color-text-secondary, #888)" }}>
                 Format d'export
              </span>
            )}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handlePPTX}
              disabled={loadingPptx || enabledCount === 0}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                cursor: loadingPptx || enabledCount === 0 ? "not-allowed" : "pointer",
                border: "none",
                background: loadingPptx || enabledCount === 0 ? "#aaa" : theme.primary,
                color: "#fff",
                transition: "background 0.2s",
              }}
            >
              {loadingPptx ? (
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ animation: "spin 1s linear infinite" }}>
                  <circle cx="8" cy="8" r="6" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
                  <path d="M8 2a6 6 0 0 1 6 6" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              ) : <PptxIcon />}
              {loadingPptx ? "Génération…" : "Télécharger PPTX"}
            </button>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MICRO COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
function SectionLabel({ children, style }) {
  return (
    <div style={{
      fontSize: 10.5, fontWeight: 500,
      color: "var(--color-text-secondary, #888)",
      textTransform: "uppercase", letterSpacing: "0.5px",
      marginBottom: 7, marginTop: 4,
      ...style,
    }}>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%", boxSizing: "border-box",
  fontSize: 12.5, padding: "7px 10px",
  borderRadius: 8,
  border: "0.5px solid var(--color-border-secondary, #ccc)",
  background: "var(--color-background-secondary, #f5f5f5)",
  color: "var(--color-text-primary, #1a1a1a)",
  outline: "none",
  marginBottom: 4,
};

function PresentIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="14" height="10" rx="2" stroke="#534AB7" strokeWidth="1.2" />
      <path d="M5 6.5h6M5 9h4" stroke="#534AB7" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M8 12v2M6 14h4" stroke="#534AB7" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function PptxIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="14" height="10" rx="2" stroke="rgba(255,255,255,0.8)" strokeWidth="1.2" />
      <path d="M8 12v2M6 14h4" stroke="rgba(255,255,255,0.8)" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M4.5 6.5h3a1 1 0 0 1 0 2H4.5V6.5z" stroke="rgba(255,255,255,0.8)" strokeWidth="1" />
    </svg>
  );
}
