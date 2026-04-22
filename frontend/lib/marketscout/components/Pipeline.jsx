// src/components/Pipeline.jsx
import { useState, useEffect, useRef } from "react";
import { usePitchSpeech, buildPitchText, buildSummaryText } from "../hooks/usePitchSpeech";
import { createSharedContext, saveAndDownloadContext } from "../agents/sharedContext";
import { runAgent1 } from "../agents/agent1_search";
import { runAgent2 } from "../agents/agent2_scraper";
import { runAgent2B } from "../agents/agent2b_reviews";
import { runAgent3SWOT } from "../agents/agent3_swot";
import Chatbot from "./Chatbot";
import PresentationModal from "./PresentationModal";
import { runAgent4Persona } from "../agents/agent4_persona";
import PersonaModal from "./PersonaModal";

// ── Competitor Card with tabs ─────────────────────────────────────────────────
function CompetitorCard({ c, isEmpty, getOriginalUrl, sector }) {
  const [activeTab, setActiveTab] = useState("overview");

  const tabs = ["Aperçu", "Forces / Faiblesses", "Avis", "Services"];
  const tabKeys = ["overview", "sw", "reviews", "services"];

  const url = getOriginalUrl(c.name, c.url);

  const scores = {
    "Infos générales": (() => {
      let s = 0;
      if (!isEmpty(c.general?.description))  s += 3;
      if (!isEmpty(c.general?.founded))       s += 2;
      if (!isEmpty(c.general?.team_size))     s += 2;
      if (!isEmpty(c.general?.headquarters))  s += 3;
      return Math.min(s, 10);
    })(),
    Tarification: (() => {
      let s = 0;
      if (!isEmpty(c.pricing?.model))       s += 4;
      if (!isEmpty(c.pricing?.price_range)) s += 3;
      if (!isEmpty(c.pricing?.details))     s += 3;
      return Math.min(s, 10);
    })(),
    Services: (() => {
      const n = c.services?.filter(s => !isEmpty(typeof s === "object" ? s.name : s)).length || 0;
      return Math.min(n * 2, 10);
    })(),
    Avis: (() => {
      if (!c.reviews || !c.reviews.sources_used?.length) return 0;
      let s = c.reviews.sources_used.length * 2;
      if (c.reviews.overall_sentiment) s += 2;
      if (c.reviews.rating_summary?.google_maps && c.reviews.rating_summary.google_maps !== "N/A") s += 2;
      return Math.min(s, 10);
    })(),
  };

  const sentimentColor = (s) => {
    if (!s) return "#b45309";
    const low = s.toLowerCase();
    if (low === "positive" || low === "positif") return "#0F6E56";
    if (low === "negative" || low === "negatif") return "#A32D2D";
    return "#854F0B";
  };
  const sentimentBg = (s) => {
    if (!s) return "#FAEEDA";
    const low = s.toLowerCase();
    if (low === "positive" || low === "positif") return "#E1F5EE";
    if (low === "negative" || low === "negatif") return "#FCEBEB";
    return "#FAEEDA";
  };
  const sentimentBorder = (s) => {
    if (!s) return "#FAC775";
    const low = s.toLowerCase();
    if (low === "positive" || low === "positif") return "#9FE1CB";
    if (low === "negative" || low === "negatif") return "#F7C1C1";
    return "#FAC775";
  };

  const initials = c.name
    ? c.name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()
    : "?";

  const googleRating = (() => {
    const raw = c.reviews?.rating_summary?.google_maps;
    if (!raw || raw === "N/A") return null;
    const match = String(raw).match(/[\d.]+/);
    return match ? parseFloat(match[0]) : null;
  })();

  const renderStars = (rating) => {
    if (!rating) return null;
    return Array.from({ length: 5 }, (_, i) => {
      const filled = i < Math.floor(rating);
      const half   = !filled && i < rating;
      return (
        <svg key={i} width="13" height="13" viewBox="0 0 12 12">
          <polygon
            points="6,1 7.5,4.5 11,5 8.5,7.5 9.3,11 6,9.2 2.7,11 3.5,7.5 1,5 4.5,4.5"
            fill={filled ? "#EF9F27" : half ? "#FAC775" : "#D3D1C7"}
          />
        </svg>
      );
    });
  };

  const strengths = [
    ...(c.competitive_analysis?.strengths || []).filter(s => !isEmpty(s) && s.length > 5),
    ...(c.competitive_analysis?.perceived_strengths || []).map(s => s.point || s).filter(s => !isEmpty(s)),
  ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 5);

  const weaknesses = [
    ...(c.competitive_analysis?.weaknesses || []).filter(w => !isEmpty(w) && w.length > 5),
    ...(c.competitive_analysis?.perceived_weaknesses || []).map(w => w.point || w).filter(w => !isEmpty(w)),
  ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 5);

  const services = (c.services || [])
    .filter(s => !isEmpty(typeof s === "object" ? s.name : s))
    .map(s => typeof s === "object" ? s.name : s);

  const targets = (c.target_clients?.segments || []).filter(t => !isEmpty(t));

  const topStrength = c.reviews?.perceived_strengths?.[0];
  const topWeakness = c.reviews?.perceived_weaknesses?.[0];

  return (
    <div style={styles.card}>
      {/* ── Card header ── */}
      <div style={styles.cardHeader}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flex: 1, minWidth: 0, overflow: "hidden" }}>
          <div style={styles.avatar}>{initials}</div>
          <div style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
            <div style={styles.cardName}>{c.name}</div>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.cardUrl}
              onClick={e => { e.preventDefault(); window.open(url, "_blank"); }}
            >
              {url?.replace(/^https?:\/\//, "") || "—"}
            </a>
            {!isEmpty(c.general?.description) && (
              <div style={styles.cardDesc}>{c.general.description}</div>
            )}
          </div>
        </div>

        {/* Right badges */}
        <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "flex-start", flexWrap: "wrap", justifyContent: "flex-end", maxWidth: "55%" }}>
          {sector && (
            <span style={{ ...styles.pill, background: "#EEEDFE", color: "#3C3489", borderColor: "#AFA9EC" }}>
              {sector}
            </span>
          )}
          <span style={{
            ...styles.pill,
            background: c.scrape_status === "success" ? "#E1F5EE" : "#F1EFE8",
            color:      c.scrape_status === "success" ? "#0F6E56" : "#5F5E5A",
            borderColor:c.scrape_status === "success" ? "#9FE1CB" : "#D3D1C7",
          }}>
            {c.scrape_status === "success" ? "Scrappé" : "Identifié"}
          </span>
          {!isEmpty(c.pricing?.model) && c.pricing.model !== "not mentionned" && (
            <span style={{ ...styles.pill, background: "#EEEDFE", color: "#3C3489", borderColor: "#AFA9EC" }}>
              {c.pricing.model}
            </span>
          )}
          {!isEmpty(c.project_info?.clientType || c.target_clients?.type) && (
            <span style={{ ...styles.pill, background: "#FAEEDA", color: "#854F0B", borderColor: "#FAC775" }}>
              {c.project_info?.clientType || c.target_clients?.type}
            </span>
          )}
          {c.reviews?.overall_sentiment && (
            <span style={{
              ...styles.pill,
              background: sentimentBg(c.reviews.overall_sentiment),
              color:      sentimentColor(c.reviews.overall_sentiment),
              borderColor:sentimentBorder(c.reviews.overall_sentiment),
            }}>
              {c.reviews.overall_sentiment}
            </span>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={styles.tabBar}>
        {tabs.map((label, i) => (
          <button
            key={label}
            onClick={() => setActiveTab(tabKeys[i])}
            style={{
              ...styles.tab,
              borderBottom: activeTab === tabKeys[i] ? "2px solid #534AB7" : "2px solid transparent",
              color: activeTab === tabKeys[i] ? "#534AB7" : "#888",
              fontWeight: activeTab === tabKeys[i] ? 500 : 400,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div style={styles.tabContent}>

        {/* ── OVERVIEW tab ── */}
        {activeTab === "overview" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div>
              <div style={styles.sectionLabel}>Complétude des données</div>
              {Object.entries(scores).map(([label, score]) => (
                <div key={label} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 12, color: "#555" }}>{label}</span>
                    <span style={{
                      fontSize: 12, fontWeight: 500,
                      color: score >= 7 ? "#534AB7" : score >= 4 ? "#854F0B" : "#888"
                    }}>
                      {score}/10
                    </span>
                  </div>
                  <div style={styles.barTrack}>
                    <div style={{
                      ...styles.barFill,
                      width: `${score * 10}%`,
                      background: score >= 7 ? "#534AB7" : score >= 4 ? "#EF9F27" : "#D3D1C7",
                    }} />
                  </div>
                </div>
              ))}

              <div style={{ marginTop: 14 }}>
                <div style={styles.sectionLabel}>Informations Clés</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {!isEmpty(c.general?.founded)      && <span style={styles.infoChip}>Fondé en {c.general.founded}</span>}
                  {!isEmpty(c.general?.team_size)    && <span style={styles.infoChip}>Équipe : {c.general.team_size}</span>}
                  {!isEmpty(c.general?.headquarters) && <span style={{ ...styles.infoChip, background: "#E6F1FB", color: "#185FA5", borderColor: "#B5D4F4" }}>Siège : {c.general.headquarters}</span>}
                  {!isEmpty(c.pricing?.price_range)  && <span style={styles.infoChip}>{c.pricing.price_range}</span>}
                </div>
              </div>

              {c.contact && (!isEmpty(c.contact.email) || !isEmpty(c.contact.phone) || !isEmpty(c.contact.address)) && (
                <div style={{ marginTop: 12 }}>
                  <div style={styles.sectionLabel}>Contact</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {!isEmpty(c.contact.email)   && <span style={{ fontSize: 12, color: "#555" }}>Email: {c.contact.email}</span>}
                    {!isEmpty(c.contact.phone)   && <span style={{ fontSize: 12, color: "#555" }}>Téléphone: {c.contact.phone}</span>}
                    {!isEmpty(c.contact.address) && <span style={{ fontSize: 12, color: "#555" }}>Adresse: {c.contact.address}</span>}
                  </div>
                </div>
              )}
            </div>

            <div>
              {(strengths.length > 0 || weaknesses.length > 0) && (
                <div style={{ marginBottom: 14 }}>
                  <div style={styles.sectionLabel}>Forces vs Faiblesses (aperçu)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div style={{ padding: 8, borderRadius: 8, background: "#E1F5EE", border: "0.5px solid #9FE1CB" }}>
                      {strengths.slice(0, 3).map((s, j) => (
                        <div key={j} style={{ fontSize: 12, color: "#0F6E56", padding: "2px 0" }}>
                          + {s}
                        </div>
                      ))}
                      {strengths.length === 0 && <div style={{ fontSize: 12, color: "#9FE1CB", fontStyle: "italic" }}>—</div>}
                    </div>
                    <div style={{ padding: 8, borderRadius: 8, background: "#FCEBEB", border: "0.5px solid #F7C1C1" }}>
                      {weaknesses.slice(0, 3).map((w, j) => (
                        <div key={j} style={{ fontSize: 12, color: "#A32D2D", padding: "2px 0" }}>
                          − {w}
                        </div>
                      ))}
                      {weaknesses.length === 0 && <div style={{ fontSize: 12, color: "#F7C1C1", fontStyle: "italic" }}>—</div>}
                    </div>
                  </div>
                </div>
              )}

              {c.reviews && c.reviews.sources_used?.length > 0 && (
                <div>
                  <div style={styles.sectionLabel}>Avis clients</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                    {googleRating !== null && (
                      <>
                        <span style={{ fontSize: 22, fontWeight: 500, color: "#1a1a1a", lineHeight: 1 }}>
                          {googleRating.toFixed(1)}
                        </span>
                        <div>
                          <div style={{ display: "flex", gap: 2, marginBottom: 2 }}>
                            {renderStars(googleRating)}
                          </div>
                          <span style={{ fontSize: 11, color: "#888" }}>
                            {c.reviews.rating_summary?.total_reviews_found
                              ? `${c.reviews.rating_summary.total_reviews_found} avis`
                              : "Google Maps"}
                          </span>
                        </div>
                      </>
                    )}
                    {c.reviews.overall_sentiment && (
                      <span style={{
                        fontSize: 12, padding: "2px 10px", borderRadius: 999,
                        background: sentimentBg(c.reviews.overall_sentiment),
                        color: sentimentColor(c.reviews.overall_sentiment),
                        border: `0.5px solid ${sentimentBorder(c.reviews.overall_sentiment)}`,
                      }}>
                        {c.reviews.overall_sentiment}
                      </span>
                    )}
                  </div>
                  {topStrength?.quotes?.[0] && !isEmpty(topStrength.quotes[0]) && (
                    <div style={styles.quoteBlock}>
                      "{topStrength.quotes[0]}"
                    </div>
                  )}
                </div>
              )}

              {c.pages_scraped?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <span style={{ fontSize: 12, color: "#888" }}>
                    {c.pages_scraped.length} page{c.pages_scraped.length > 1 ? "s" : ""} scrapée
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── STRENGTHS / WEAKNESSES tab ── */}
        {activeTab === "sw" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ ...styles.sectionLabel, color: "#0F6E56" }}>
                Forces ({strengths.length})
              </div>
              {strengths.length === 0 ? (
                <div style={{ fontSize: 12, color: "#aaa", fontStyle: "italic" }}>Pas de données</div>
              ) : strengths.map((s, j) => {
                const pct = Math.max(30, 100 - j * 15);
                return (
                  <div key={j} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: "#333", marginBottom: 3 }}>{s}</div>
                    <div style={styles.barTrack}>
                      <div style={{ ...styles.barFill, width: `${pct}%`, background: "#1D9E75" }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div>
              <div style={{ ...styles.sectionLabel, color: "#A32D2D" }}>
                Faiblesses ({weaknesses.length})
              </div>
              {weaknesses.length === 0 ? (
                <div style={{ fontSize: 12, color: "#aaa", fontStyle: "italic" }}>Pas de données</div>
              ) : weaknesses.map((w, j) => {
                const pct = Math.max(30, 100 - j * 15);
                return (
                  <div key={j} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: "#333", marginBottom: 3 }}>{w}</div>
                    <div style={styles.barTrack}>
                      <div style={{ ...styles.barFill, width: `${pct}%`, background: "#E24B4A" }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {(c.competitive_analysis?.opportunities_for_us?.length > 0 ||
              c.competitive_analysis?.threats_for_us?.length > 0) && (
              <>
                <div style={{ gridColumn: "1 / -1", borderTop: "0.5px solid #e5e5e5", paddingTop: 14 }}>
                  <div style={styles.sectionLabel}>Impact sur notre startup</div>
                </div>
                {c.competitive_analysis?.opportunities_for_us?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 500, color: "#185FA5", marginBottom: 6 }}>
                      Opportunités pour nous
                    </div>
                    {c.competitive_analysis.opportunities_for_us.slice(0, 4).map((o, j) => (
                      <div key={j} style={{ fontSize: 12, color: "#333", padding: "3px 0", borderBottom: "0.5px solid #f0f0f0" }}>
                        → {o}
                      </div>
                    ))}
                  </div>
                )}
                {c.competitive_analysis?.threats_for_us?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 500, color: "#854F0B", marginBottom: 6 }}>
                      Menaces pour nous
                    </div>
                    {c.competitive_analysis.threats_for_us.slice(0, 4).map((t, j) => (
                      <div key={j} style={{ fontSize: 12, color: "#333", padding: "3px 0", borderBottom: "0.5px solid #f0f0f0" }}>
                        ! {t}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── REVIEWS tab ── */}
        {activeTab === "reviews" && (
          <div>
            {(!c.reviews || !c.reviews.sources_used?.length) ? (
              <div style={{ fontSize: 13, color: "#aaa", fontStyle: "italic" }}>Aucune donnée d'avis collectée.</div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
                  {googleRating !== null && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, background: "#F1EFE8", border: "0.5px solid #D3D1C7" }}>
                      <span style={{ fontSize: 26, fontWeight: 500, color: "#2C2C2A", lineHeight: 1 }}>
                        {googleRating.toFixed(1)}
                      </span>
                      <div>
                        <div style={{ display: "flex", gap: 2, marginBottom: 3 }}>{renderStars(googleRating)}</div>
                        <div style={{ fontSize: 11, color: "#888" }}>Google Maps</div>
                      </div>
                    </div>
                  )}
                  {c.reviews.overall_sentiment && (
                    <span style={{
                      fontSize: 13, padding: "5px 14px", borderRadius: 999,
                      background: sentimentBg(c.reviews.overall_sentiment),
                      color: sentimentColor(c.reviews.overall_sentiment),
                      border: `0.5px solid ${sentimentBorder(c.reviews.overall_sentiment)}`,
                      fontWeight: 500,
                    }}>
                      {c.reviews.overall_sentiment}
                    </span>
                  )}
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {c.reviews.sources_used?.map((src, j) => (
                      <span key={j} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#F1EFE8", color: "#5F5E5A", border: "0.5px solid #D3D1C7" }}>
                        {src}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 500, color: "#0F6E56", marginBottom: 6 }}>
                      Ce que les clients apprécient
                    </div>
                    {c.reviews.perceived_strengths?.slice(0, 4).map((s, j) => (
                      <div key={j} style={{ marginBottom: 8, padding: "6px 8px", borderRadius: 8, background: "#E1F5EE", borderLeft: "3px solid #1D9E75" }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: "#0F6E56", marginBottom: s.quotes?.[0] ? 3 : 0 }}>
                          {s.point}
                        </div>
                        {s.quotes?.[0] && !isEmpty(s.quotes[0]) && (
                          <div style={{ fontSize: 11, color: "#085041", fontStyle: "italic" }}>
                            "{s.quotes[0]}"
                          </div>
                        )}
                        {s.frequency && (
                          <div style={{ fontSize: 10, color: "#1D9E75", marginTop: 3 }}>{s.frequency}</div>
                        )}
                      </div>
                    ))}
                    {!c.reviews.perceived_strengths?.length && (
                      <div style={{ fontSize: 12, color: "#aaa", fontStyle: "italic" }}>—</div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 500, color: "#A32D2D", marginBottom: 6 }}>
                      Plaintes récurrentes
                    </div>
                    {c.reviews.perceived_weaknesses?.slice(0, 4).map((w, j) => (
                      <div key={j} style={{ marginBottom: 8, padding: "6px 8px", borderRadius: 8, background: "#FCEBEB", borderLeft: "3px solid #E24B4A" }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: "#A32D2D", marginBottom: w.quotes?.[0] ? 3 : 0 }}>
                          {w.point}
                        </div>
                        {w.quotes?.[0] && !isEmpty(w.quotes[0]) && (
                          <div style={{ fontSize: 11, color: "#791F1F", fontStyle: "italic" }}>
                            "{w.quotes[0]}"
                          </div>
                        )}
                        {w.frequency && (
                          <div style={{ fontSize: 10, color: "#E24B4A", marginTop: 3 }}>{w.frequency}</div>
                        )}
                      </div>
                    ))}
                    {!c.reviews.perceived_weaknesses?.length && (
                      <div style={{ fontSize: 12, color: "#aaa", fontStyle: "italic" }}>—</div>
                    )}
                  </div>
                </div>

                {c.reviews.customer_expectations?.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={styles.sectionLabel}>Attentes des clients</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {c.reviews.customer_expectations.map((e, j) => (
                        <span key={j} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#EEEDFE", color: "#3C3489", border: "0.5px solid #AFA9EC" }}>
                          {e}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── SERVICES tab ── */}
        {activeTab === "services" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              {services.length > 0 && (
                <>
                  <div style={styles.sectionLabel}>Services proposés</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                    {services.map((s, j) => (
                      <span key={j} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 999, background: "#E1F5EE", color: "#0F6E56", border: "0.5px solid #9FE1CB" }}>
                        {s}
                      </span>
                    ))}
                  </div>
                </>
              )}

              {targets.length > 0 && (
                <>
                  <div style={styles.sectionLabel}>Clients cibles</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {targets.map((t, j) => (
                      <span key={j} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 999, background: "#FAEEDA", color: "#854F0B", border: "0.5px solid #FAC775" }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </>
              )}

              {services.length === 0 && targets.length === 0 && (
                <div style={{ fontSize: 13, color: "#aaa", fontStyle: "italic" }}>Aucune donnée de service.</div>
              )}
            </div>

            <div>
              {!isEmpty(c.pricing?.model) && c.pricing.model !== "not mentionned" && (
                <>
                  <div style={styles.sectionLabel}>Modèle tarifaire</div>
                  <span style={{ fontSize: 13, padding: "3px 12px", borderRadius: 999, background: "#EEEDFE", color: "#3C3489", border: "0.5px solid #AFA9EC", display: "inline-block", marginBottom: 8 }}>
                    {c.pricing.model}
                  </span>
                  {!isEmpty(c.pricing?.price_range) && (
                    <div style={{ fontSize: 13, color: "#333", marginBottom: 4 }}>{c.pricing.price_range}</div>
                  )}
                  {!isEmpty(c.pricing?.details) && (
                    <div style={{ fontSize: 12, color: "#666" }}>{c.pricing.details}</div>
                  )}
                </>
              )}

              {c.pages_scraped?.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={styles.sectionLabel}>Pages scrappées ({c.pages_scraped.length})</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {c.pages_scraped.map((p, j) => (
                      <span key={j} style={{ fontSize: 11, padding: "1px 7px", borderRadius: 4, background: "#F1EFE8", color: "#5F5E5A", border: "0.5px solid #D3D1C7" }}>
                        {p.path} ({p.length} chars)
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Pipeline component ───────────────────────────────────────────────────
export default function Pipeline({ projectData: externalProjectData, skipChatbot = false }) {
  const [phase, setPhase]               = useState(skipChatbot ? "loading" : "chat");
  const [status, setStatus]             = useState("idle");
  const [currentAgent, setCurrentAgent] = useState(0);
  const [logs, setLogs]                 = useState([]);
  const [context, setContext]           = useState(null);
  const [error, setError]               = useState(null);
  const [projectData, setProjectData]   = useState(null);

  const [isSaving, setIsSaving]         = useState(false);
  const [saveStatus, setSaveStatus]     = useState(null);
  const [presentationOpen, setPresentationOpen] = useState(false);

  const [personaOpen, setPersonaOpen]     = useState(false);
  const [personaLoading, setPersonaLoading] = useState(false);

  const pitch = usePitchSpeech();
  const [pitchOpen, setPitchOpen] = useState(false);
  const waveAnimRef = useRef(null);
  const waveBarsRef = useRef([]);

  useEffect(() => {
    const load = () => {};
    window.speechSynthesis?.getVoices();
    window.speechSynthesis?.addEventListener?.("voiceschanged", load);
    load();
    return () => window.speechSynthesis?.removeEventListener?.("voiceschanged", load);
  }, []);

  useEffect(() => {
    const isActive = pitch.state === "speaking";
    if (isActive) {
      let t = 0;
      const baseHeights = [5,9,14,10,18,12,7,16,9,20,14,10,18,7,12,16,9,14,10,18];
      const animate = () => {
        t += 1;
        waveBarsRef.current.forEach((bar, i) => {
          if (!bar) return;
          const wave = Math.sin(t * 0.12 + i * 0.45) * 0.45 + 0.55;
          bar.style.height = Math.max(3, Math.round(baseHeights[i % baseHeights.length] * wave)) + "px";
          bar.style.opacity = 0.6 + wave * 0.4;
        });
        waveAnimRef.current = requestAnimationFrame(animate);
      };
      waveAnimRef.current = requestAnimationFrame(animate);
    } else {
      if (waveAnimRef.current) cancelAnimationFrame(waveAnimRef.current);
      waveBarsRef.current.forEach((bar, i) => {
        if (!bar) return;
        const base = [5,9,14,10,18,12,7,16,9,20,14,10,18,7,12,16,9,14,10,18];
        bar.style.height = base[i % base.length] + "px";
        bar.style.opacity = pitch.state === "paused" ? "0.5" : "0.3";
      });
    }
    return () => { if (waveAnimRef.current) cancelAnimationFrame(waveAnimRef.current); };
  }, [pitch.state]);

  useEffect(() => {
    if (phase !== "pipeline") {
      setPitchOpen(false);
      pitch.stop();
    }
  }, [phase]);

  const handleGeneratePersona = async () => {
     console.log("click reçu, context:", context);  // ← ajoute ça
    if (context?.persona) {
      setPersonaOpen(true);
      return;
    }
    setPersonaLoading(true);
    try {
      const updatedCtx = await runAgent4Persona(
        { ...context },
        (msg) => addLog(4, msg)
      );
      setContext({ ...updatedCtx });
      setPersonaOpen(true);
    } catch (e) {
      console.error("Persona error:", e);
    } finally {
      setPersonaLoading(false);
    }
  };

  const handleRegeneratePersona = async () => {
    setContext(prev => ({ ...prev, persona: null }));
    setPersonaOpen(false);
    await handleGeneratePersona();
  };

  const handlePitchOpen = () => {
    setPitchOpen(true);
    if (pitch.state === "idle" || pitch.state === "error") {
      const text = buildSummaryText(context, projectData);
      pitch.speak(text);
    }
  };

  const handlePitchClose = () => {
    setPitchOpen(false);
    pitch.stop();
    pitch.reset();
  };

  const fmtTime = (s) => {
    const m = Math.floor((s || 0) / 60);
    const sec = Math.floor((s || 0) % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const handleDownloadContext = async () => {
    setIsSaving(true);
    setSaveStatus(null);
    try {
      await saveAndDownloadContext(context);
      setSaveStatus({ type: "success", message: "✅ Contexte téléchargé !" });
    } catch (err) {
      setSaveStatus({ type: "error", message: `❌ Erreur: ${err.message}` });
    } finally {
      setIsSaving(false);
    }
  };

  const addLog = (agent, msg) => {
    setLogs(prev => [...prev, { agent, msg, time: new Date().toLocaleTimeString() }]);
  };

  const isEmpty = (val) => {
    if (!val) return true;
    if (typeof val === "string" && (
      val.trim() === "" ||
      val.toLowerCase().includes("aucune information") ||
      val.toLowerCase().includes("non mentionne") ||
      val.toLowerCase().includes("non disponible") ||
      val.toLowerCase().includes("n/a") ||
      val.toLowerCase().includes("aucun") ||
      val.toLowerCase().includes("not available") ||
      val.toLowerCase().includes("unknown")
    )) return true;
    if (Array.isArray(val) && val.length === 0) return true;
    return false;
  };

  const getOriginalUrl = (competitorName, fallbackUrl) => {
    if (!context?.competitors) return fallbackUrl;
    const original = context.competitors.find(c =>
      c.name?.toLowerCase() === competitorName?.toLowerCase()
    );
    return original?.url || fallbackUrl;
  };

  const handleProjectReady = async (extractedProject, conversationHistory) => {
    setProjectData(extractedProject);
    setPhase("pipeline");
    setStatus("running");
    setLogs([]);

    try {
      const conversationText = (conversationHistory || [])
        .filter(m => m.role !== "system")
        .map(m => `${m.role === "user" ? "Entrepreneur" : "Expert"}: ${m.content}`)
        .join("\n");

      const userInput = {
        description:          extractedProject.enriched_description || extractedProject.description,
        location:             extractedProject.location    || "Tunisia",
        sector:               extractedProject.sector      || "Other",
        clientType:           extractedProject.clientType  || "B2C",
        priceRange:           extractedProject.priceRange  || "Not defined",
        problem_solved:       extractedProject.problem_solved       || "",
        differentiator:       extractedProject.differentiator       || "",
        stage:                extractedProject.stage                || "",
        budget:               extractedProject.budget               || "",
        enriched_description: extractedProject.enriched_description || extractedProject.description,
        conversation_summary: conversationText,
      };

      let ctx = createSharedContext(userInput);

      setCurrentAgent(1);
      addLog(1, "Agent 1 — Recherche de concurrents...");
      ctx = await runAgent1(ctx, (msg) => addLog(1, msg));
      addLog(1, `Agent 1 terminé — ${ctx.competitors.length} concurrents trouvés`);

      console.log("=== Agent 1 URLs (original) ===");
      ctx.competitors.forEach(c => console.log(`${c.name} → ${c.url}`));

      setContext({ ...ctx });

      setCurrentAgent(2);
      addLog(2, "Agent 2 + 2B en parallèle...");

      const ctxForAgent2  = JSON.parse(JSON.stringify(ctx));
      const ctxForAgent2B = JSON.parse(JSON.stringify(ctx));

      const [result2, result2b] = await Promise.allSettled([
        runAgent2(ctxForAgent2,  (msg) => addLog(2, `[Scraping] ${msg}`)),
        runAgent2B(ctxForAgent2B, (msg) => addLog(2, `[Reviews] ${msg}`)),
      ]);

      if (result2.status === "fulfilled") {
        ctx.competitors_raw        = result2.value.competitors_raw        || [];
        ctx.competitors_structured = result2.value.competitors_structured || [];

        ctx.competitors_structured = ctx.competitors_structured.map(comp => {
          const originalComp = ctx.competitors.find(c =>
            c.name?.toLowerCase() === comp.name?.toLowerCase()
          );
          if (originalComp?.url) comp.url = originalComp.url;
          return comp;
        });

        addLog(2, `Agent 2 OK — ${ctx.competitors_structured.length} concurrents`);
      } else {
        addLog(2, `Agent 2 erreur : ${result2.reason?.message}`);
        ctx.competitors_raw        = [];
        ctx.competitors_structured = [];
      }

      if (result2b.status === "fulfilled") {
        ctx.reviews_analysis = result2b.value.reviews_analysis || [];
        addLog(2, `Agent 2B OK — ${ctx.reviews_analysis.length} avis analysés`);

        if (ctx.competitors_structured?.length > 0 && ctx.reviews_analysis?.length > 0) {
          ctx.competitors_structured = ctx.competitors_structured.map(comp => {
            const review = ctx.reviews_analysis.find(r =>
              r.competitor_name?.toLowerCase() === comp.name?.toLowerCase()
            );
            if (review) {
              comp.reviews = review;
              comp.competitive_analysis = comp.competitive_analysis || {};
              comp.competitive_analysis.perceived_strengths  = review.perceived_strengths;
              comp.competitive_analysis.perceived_weaknesses = review.perceived_weaknesses;
              comp.competitive_analysis.customer_sentiment   = review.overall_sentiment;
              comp.competitive_analysis.opportunities_for_us = review.opportunities_for_us;
              comp.competitive_analysis.threats_for_us       = review.threats_for_us;
            }
            return comp;
          });
        }
      } else {
        addLog(2, `Agent 2B erreur : ${result2b.reason?.message}`);
        ctx.reviews_analysis = [];
      }

      addLog(2, "Agent 2 + 2B terminé");
      setContext({ ...ctx });

      setCurrentAgent(3);
      addLog(3, "Agent 3 SWOT — A2A...");
      ctx = await runAgent3SWOT(ctx, (msg) => addLog(3, msg));
      addLog(3, `SWOT terminé`);
      setContext({ ...ctx });

      setStatus("done");
      setCurrentAgent(0);

    } catch (e) {
      console.error("Pipeline error:", e);
      setError(e.message);
      setStatus("error");
      setCurrentAgent(0);
    }
  };

  const competitorsToShow = (() => {
    if (!context?.competitors_structured) return [];
    return context.competitors_structured
      .filter(c => {
        if (!c || !c.name) return false;
        if (c.url?.includes("localhost")) return false;
        return true;
      })
      .map(comp => ({
        ...comp,
        url: getOriginalUrl(comp.name, comp.url),
      }));
  })();

  // ── Auto-start when skipChatbot and external project data provided ──
  useEffect(() => {
    if (skipChatbot && externalProjectData && phase === "loading" && status === "idle") {
      const mapped = {
        description: externalProjectData.description || "",
        enriched_description: externalProjectData.description || "",
        location: externalProjectData.location || externalProjectData.siege || "Tunisia",
        sector: externalProjectData.sector || "Other",
        clientType: externalProjectData.clientType || "B2C",
        priceRange: externalProjectData.priceRange || "Not defined",
        problem_solved: externalProjectData.problemSolved || "",
        differentiator: externalProjectData.differentiator || "",
        stage: externalProjectData.stage || "",
        budget: externalProjectData.budget || externalProjectData.capital || "",
      };
      handleProjectReady(mapped, []);
    }
  }, [skipChatbot, externalProjectData, phase, status]);

  // ── CHAT PHASE ──
  if (phase === "chat") {
    return (
      <div>
        <div style={{ marginBottom: 20 }} />
        <Chatbot onProjectReady={handleProjectReady} />
      </div>
    );
  }

  // ── LOADING PHASE (waiting for auto-start) ──
  if (phase === "loading" && status === "idle") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔄</div>
          <div style={{ fontSize: 14, color: "#888" }}>Préparation de l'analyse marketing...</div>
        </div>
      </div>
    );
  }

  // ── PIPELINE PHASE ──
  return (
    <div>

      {projectData && (
        <div style={{
          background: "var(--color-background-primary, #fff)",
          border: "0.5px solid var(--color-border-tertiary, #e5e5e5)",
          borderRadius: 12,
          padding: "1.25rem",
          marginBottom: "1.5rem",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#534AB7" }} />
              <span style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary, #888)", textTransform: "uppercase", letterSpacing: "0.6px" }}>
                Projet analysé
              </span>
            </div>
            <span style={{ fontSize: 11, color: "var(--color-text-secondary, #888)" }}>via chatbot</span>
          </div>
          <p style={{
            fontSize: 14, color: "var(--color-text-primary, #1a1a1a)",
            lineHeight: 1.6, margin: 0, marginBottom: 14, paddingBottom: 14,
            borderBottom: "0.5px solid var(--color-border-tertiary, #e5e5e5)",
          }}>
            {projectData.enriched_description || projectData.description}
          </p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {projectData.location   && <span style={chip("#E6F1FB", "#185FA5")}>{projectData.location}</span>}
            {projectData.sector     && <span style={chip("#EEEDFE", "#534AB7")}>{projectData.sector}</span>}
            {projectData.clientType && <span style={chip("#FAEEDA", "#854F0B")}>{projectData.clientType}</span>}
            {projectData.priceRange && <span style={chip("#E1F5EE", "#0F6E56")}>{projectData.priceRange}</span>}
            {projectData.stage      && <span style={chip("#F1EFE8", "#5F5E5A")}>{projectData.stage}</span>}
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {[
          { n: 1, label: "Recherche" },
          { n: 2, label: "Scraping + Avis" },
          { n: 3, label: "SWOT A2A" },
        ].map(({ n, label }) => (
          <div key={n} style={{
            flex: 1, padding: "10px", borderRadius: 8,
            textAlign: "center", fontSize: 13, fontWeight: 500,
            background: currentAgent === n ? "#534AB7" :
                        (status === "done" && n <= 3) ? "#1a7a3a" : "#f0f0f0",
            color: currentAgent === n || (status === "done" && n <= 3) ? "#fff" : "#999",
            transition: "all 0.3s"
          }}>
            {status === "done" && n <= 3 ? "✓" : `Agent ${n}`}
            <div style={{ fontSize: 11, fontWeight: 400, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Status */}
      {status === "running" && (
        <div style={{ marginBottom: 16, padding: 12, borderRadius: 8,
                      background: "#f0f0ff", border: "1px solid #534AB7",
                      fontSize: 13, color: "#534AB7", fontWeight: 500 }}>
              {currentAgent === 1 && "Agent 1 — Recherche de concurrents..."}
              {currentAgent === 2 && "Agent 2 + 2B — Scraping et avis en parallèle..."}
              {currentAgent === 3 && "Agent 3 — SWOT par A2A..."}
        </div>
      )}
      {status === "error" && (
        <div style={{ marginTop: 16, padding: 14, borderRadius: 8,
                      background: "#fff0f0", color: "#cc0000", fontSize: 13 }}>
          Erreur : {error}
          <button onClick={() => { setPhase("chat"); setStatus("idle"); setLogs([]); }}
            style={{ marginLeft: 12, padding: "4px 10px", borderRadius: 6,
                     border: "1px solid #cc0000", background: "none",
                     color: "#cc0000", cursor: "pointer", fontSize: 12 }}>
            Nouvelle analyse
          </button>
        </div>
      )}

      {/* Results */}
      {status === "done" && context && (
        <div style={{ marginTop: 24 }}>

          {/* Banner */}
          <div style={{ padding: 14, borderRadius: 8, marginBottom: 20,
                        background: "#f9fdfa", border: "1px solid #b7ebc8",
                        display: "flex", justifyContent: "space-between", alignItems: "center" }}>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>

                {/* New Analysis */}
                <button
                  onClick={() => {
                    setPhase("chat"); setStatus("idle");
                    setLogs([]); setContext(null); setProjectData(null);
                    setPitchOpen(false);
                    pitch.reset();
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "9px 15px", borderRadius: 9, cursor: "pointer",
                    border: "0.5px solid var(--color-border-secondary, #ccc)",
                    background: "var(--color-background-primary, #fff)",
                    color: "var(--color-text-secondary, #888)",
                    fontSize: 13, fontWeight: 500, transition: "all 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--color-background-secondary, #f5f5f5)"}
                  onMouseLeave={e => e.currentTarget.style.background = "var(--color-background-primary, #fff)"}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M13 8A5 5 0 1 1 8 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    <path d="M13 3v3h-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Nouvelle analyse
                </button>

                {/* Download Context */}
                <button
                  onClick={handleDownloadContext}
                  disabled={isSaving}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "9px 15px", borderRadius: 9,
                    cursor: isSaving ? "not-allowed" : "pointer",
                    border: "0.5px solid rgba(83,74,183,0.25)",
                    borderLeft: "3px solid #534AB7",
                    background: "var(--color-background-primary, #fff)",
                    color: "#534AB7",
                    fontSize: 13, fontWeight: 500, transition: "all 0.15s",
                    opacity: isSaving ? 0.6 : 1,
                  }}
                  onMouseEnter={e => { if (!isSaving) e.currentTarget.style.background = "#EEEDFE"; }}
                  onMouseLeave={e => e.currentTarget.style.background = "var(--color-background-primary, #fff)"}
                >
                  {isSaving ? (
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ animation: "spin 1s linear infinite" }}>
                      <circle cx="8" cy="8" r="6" stroke="rgba(83,74,183,0.3)" strokeWidth="1.5"/>
                      <path d="M8 2a6 6 0 0 1 6 6" stroke="#534AB7" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M8 2v8M5 7l3 3 3-3" stroke="#534AB7" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M3 13h10" stroke="#534AB7" strokeWidth="1.4" strokeLinecap="round"/>
                    </svg>
                  )}
                  {isSaving ? "Enregistrement..." : "Télécharger le contexte"}
                </button>

                {/* Pitch Audio */}
                <button
                  onClick={handlePitchOpen}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "9px 15px", borderRadius: 9, cursor: "pointer",
                    border: `0.5px solid rgba(83,74,183,${pitchOpen ? "0.5" : "0.3"})`,
                    borderLeft: "3px solid #534AB7",
                    background: pitchOpen ? "#EEEDFE" : "var(--color-background-primary, #fff)",
                    color: "#534AB7",
                    fontSize: 13, fontWeight: 500, transition: "all 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "#EEEDFE"}
                  onMouseLeave={e => e.currentTarget.style.background = pitchOpen ? "#EEEDFE" : "var(--color-background-primary, #fff)"}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="6" stroke="#534AB7" strokeWidth="1.2"/>
                    <path d="M6.5 5.5v5l5-2.5z" fill="#534AB7"/>
                  </svg>
                  Pitch audio
                </button>

                {/* Presentation */}
                <button
                  onClick={() => setPresentationOpen(true)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "9px 15px", borderRadius: 9, cursor: "pointer",
                    border: "0.5px solid rgba(29,158,117,0.3)",
                    borderLeft: "3px solid #1D9E75",
                    background: "var(--color-background-primary, #fff)",
                    color: "#0F6E56",
                    fontSize: 13, fontWeight: 500, transition: "all 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "#E1F5EE"}
                  onMouseLeave={e => e.currentTarget.style.background = "var(--color-background-primary, #fff)"}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <rect x="1.5" y="2.5" width="13" height="9" rx="1.5" stroke="#0F6E56" strokeWidth="1.2"/>
                    <path d="M5 6.5h6M5 9h3.5" stroke="#0F6E56" strokeWidth="1.1" strokeLinecap="round"/>
                    <path d="M8 11.5v2M6 13.5h4" stroke="#0F6E56" strokeWidth="1.1" strokeLinecap="round"/>
                  </svg>
                  Présentation
                </button>

                {/* Persona */}
                <button
                  onClick={handleGeneratePersona}
                  disabled={personaLoading}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "9px 15px", borderRadius: 9,
                    cursor: personaLoading ? "not-allowed" : "pointer",
                    border: "0.5px solid rgba(217,90,48,0.3)",
                    borderLeft: "3px solid #D85A30",
                    background: "var(--color-background-primary, #fff)",
                    color: "#993C1D",
                    fontSize: 13, fontWeight: 500,
                    opacity: personaLoading ? 0.7 : 1,
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { if (!personaLoading) e.currentTarget.style.background = "#FAECE7"; }}
                  onMouseLeave={e => e.currentTarget.style.background = "var(--color-background-primary, #fff)"}
                >
                  {personaLoading ? (
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none"
                      style={{ animation: "spin 1s linear infinite" }}>
                      <circle cx="8" cy="8" r="6" stroke="rgba(217,90,48,0.3)" strokeWidth="1.5"/>
                      <path d="M8 2a6 6 0 0 1 6 6" stroke="#D85A30" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="5" r="3" stroke="#D85A30" strokeWidth="1.2"/>
                      <path d="M2 14c0-3.3 2.7-5 6-5s6 1.7 6 5" stroke="#D85A30" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                  )}
                  {personaLoading ? "Génération..." : "Persona"}
                </button>

              </div>

              {saveStatus && (
                <span style={{ fontSize: 12, color: saveStatus.type === "success" ? "#0F6E56" : "#A32D2D" }}>
                  {saveStatus.message}
                </span>
              )}
            </div>
          </div>

          {/* ── SWOT ── */}
          {context.swot && (
            <div style={{ marginBottom: 32 }}>
              <h3 style={{ fontSize: 16, fontWeight: 500, marginBottom: 8,
                            paddingBottom: 8, borderBottom: "2px solid #534AB7" }}>
                Analyse SWOT
              </h3>

              <div style={{ marginBottom: 16, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span style={badge("#534AB7")}>Forces — facteurs internes positifs</span>
                <span style={badge("#cc0000")}>Faiblesses — facteurs internes négatifs</span>
                <span style={badge("#1a7a3a")}>Opportunités — facteurs externes positifs</span>
                <span style={badge("#b45309")}>Menaces — facteurs externes négatifs</span>
              </div>

              {context.swot.a2a_log?.length > 0 && (
                <details style={{ marginBottom: 16 }}>
                  <summary style={{ cursor: "pointer", fontSize: 12, color: "#534AB7", fontWeight: 500 }}>
                    Trace A2A ({context.swot.a2a_log.length} échanges)
                  </summary>
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                    {context.swot.a2a_log.map((msg, i) => (
                      <div key={i} style={{ padding: "6px 10px", borderRadius: 6,
                                             background: "#f5f5f5", border: "1px solid #e5e5e5",
                                             fontSize: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span style={badge(msg.from === "agent2_scraping" ? "#1a7a3a" : "#b45309")}>
                          {msg.from === "agent2_scraping" ? "Agent 2" : "Agent 2B"}
                        </span>
                        <span style={{ color: "#555", flex: 1 }}>
                          "{msg.question?.slice(0, 70)}..."
                        </span>
                        <span style={{ color: "#1a7a3a", fontSize: 11 }}>{msg.opportunities_count} opp</span>
                        <span style={{ color: "#cc0000", fontSize: 11 }}>{msg.threats_count} menaces</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {context.swot.overall_score && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
                  {[
                    { key: "viability",         label: "Viabilité",   color: "#1a7a3a" },
                    { key: "market_opportunity", label: "Opportunité", color: "#534AB7" },
                    { key: "competition_risk",   label: "Risque",        color: "#cc0000" },
                  ].map(({ key, label, color }) => (
                    <div key={key} style={{ padding: 16, borderRadius: 10, textAlign: "center",
                                             border: `1px solid ${color}30`, background: color + "08" }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color, textTransform: "uppercase", marginBottom: 8 }}>
                        {label}
                      </div>
                      <div style={{ position: "relative", width: 70, height: 70, margin: "0 auto 8px" }}>
                        <svg width="70" height="70" viewBox="0 0 70 70">
                          <circle cx="35" cy="35" r="28" fill="none" stroke="#f0f0f0" strokeWidth="7"/>
                          <circle cx="35" cy="35" r="28" fill="none" stroke={color}
                            strokeWidth="7"
                            strokeDasharray={`${((context.swot.overall_score[key] || 0) / 100) * 176} 176`}
                            strokeLinecap="round" transform="rotate(-90 35 35)"/>
                        </svg>
                        <div style={{ position: "absolute", top: "50%", left: "50%",
                                       transform: "translate(-50%,-50%)",
                                       fontSize: 16, fontWeight: 700, color }}>
                          {context.swot.overall_score[key] || 0}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: "#888" }}>/100</div>
                    </div>
                  ))}
                </div>
              )}

              {context.swot.overall_score?.recommendation && (
                <div style={{ padding: 14, borderRadius: 8, marginBottom: 20,
                               background: "#f0f0ff", border: "1px solid #534AB730", textAlign: "center" }}>
                  <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>Recommandation finale</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#534AB7" }}>
                    {context.swot.overall_score.recommendation}
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                {[
                  { key: "strengths",     label: "Forces",     color: "#1a7a3a", bg: "#f0fff4", border: "#b7ebc8", sign: "+", subtitle: "Facteurs internes positifs" },
                  { key: "weaknesses",    label: "Faiblesses",    color: "#cc0000", bg: "#fff0f0", border: "#ffcccc", sign: "-", subtitle: "Facteurs internes à améliorer" },
                  { key: "opportunities", label: "Opportunités", color: "#0369a1", bg: "#f0f8ff", border: "#bae6fd", sign: "→", subtitle: "Facteurs externes favorables" },
                  { key: "threats",       label: "Menaces",       color: "#b45309", bg: "#fff8e1", border: "#fde68a", sign: "!", subtitle: "Facteurs externes défavorables" },
                ].map(({ key, label, color, bg, border, sign, subtitle }) => (
                  <div key={key} style={{ padding: 14, borderRadius: 10, background: bg,
                                           border: `1px solid ${border}`, minHeight: 150 }}>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color, textTransform: "uppercase" }}>{label}</div>
                      <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{subtitle}</div>
                    </div>
                    {!context.swot[key] || context.swot[key].length === 0 ? (
                      <div style={{ fontSize: 12, color: "#aaa", fontStyle: "italic" }}>Génération...</div>
                    ) : context.swot[key].map((item, i) => (
                      <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${border}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color, flex: 1 }}>
                            {sign} {item.point}
                          </span>
                          {item.impact && (
                            <span style={{
                              fontSize: 10, padding: "2px 8px", borderRadius: 10,
                              background: (item.impact === "eleve" || item.impact === "high") ? color + "20" : "#f0f0f0",
                              color: (item.impact === "eleve" || item.impact === "high") ? color : "#888",
                              whiteSpace: "nowrap", marginLeft: 8, flexShrink: 0
                            }}>
                              {item.impact === "élevé" || item.impact === "eleve" ? "Élevé" : item.impact === "moyen" ? "Moyen" : item.impact === "faible" ? "Faible" : item.impact}
                            </span>
                          )}
                        </div>
                        {!isEmpty(item.detail) && (
                          <div style={{ fontSize: 12, color: "#555", lineHeight: 1.5, marginBottom: 4 }}>{item.detail}</div>
                        )}
                        {!isEmpty(item.based_on) && (
                          <div style={{ fontSize: 11, color: "#888", fontStyle: "italic" }}>Source: {item.based_on}</div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {!isEmpty(context.swot.strategic_summary) && (
                <div style={{ padding: 14, borderRadius: 8, marginBottom: 16,
                               background: "#f9f9f9", border: "1px solid #e5e5e5",
                               fontSize: 13, color: "#333", lineHeight: 1.7 }}>
                  {context.swot.strategic_summary}
                </div>
              )}

              {(context.swot.so_strategies?.length > 0 || context.swot.wo_strategies?.length > 0) && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#333" }}>
                    Stratégies dérivées
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {[
                      { key: "so_strategies", label: "SO — Exploiter",  color: "#1a7a3a", bg: "#f0fff4", desc: "Forces + Opportunités" },
                      { key: "st_strategies", label: "ST — Défendre",   color: "#0369a1", bg: "#f0f8ff", desc: "Forces + Menaces" },
                      { key: "wo_strategies", label: "WO — Améliorer",  color: "#b45309", bg: "#fff8e1", desc: "Faiblesses + Opportunités" },
                      { key: "wt_strategies", label: "WT — Éviter",    color: "#cc0000", bg: "#fff0f0", desc: "Faiblesses + Menaces" },
                    ].map(({ key, label, color, bg, desc }) => (
                      context.swot[key]?.length > 0 && (
                        <div key={key} style={{ padding: 12, borderRadius: 8, background: bg, border: `1px solid ${color}30` }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 2 }}>{label}</div>
                          <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>{desc}</div>
                          {context.swot[key].map((s, i) => (
                            <div key={i} style={{ fontSize: 12, color: "#333", padding: "4px 0", borderBottom: `1px solid ${color}20` }}>
                              → {s}
                            </div>
                          ))}
                        </div>
                      )
                    ))}
                  </div>
                </div>
              )}

              {context.swot.priority_actions?.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#333" }}>Actions prioritaires</div>
                  {context.swot.priority_actions.map((action, i) => (
                    <div key={i} style={{ padding: 12, borderRadius: 8, marginBottom: 8,
                                           border: "1px solid #e5e5e5", background: "#fafafa",
                                           display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%",
                                     background: "#534AB7", color: "#fff",
                                     display: "flex", alignItems: "center",
                                     justifyContent: "center", fontSize: 13,
                                     fontWeight: 600, flexShrink: 0 }}>
                        {i + 1}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }}>{action.action}</div>
                        {!isEmpty(action.why) && (
                          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>{action.why}</div>
                        )}
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {!isEmpty(action.timeline) && (
                            <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: 10,
                                            background: "#f0f0ff", color: "#534AB7", border: "1px solid #534AB730" }}>
                              {action.timeline}
                            </span>
                          )}
                          {!isEmpty(action.swot_link) && (
                            <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: 10,
                                            background: "#f5f5f5", color: "#888", border: "1px solid #e5e5e5" }}>
                              {action.swot_link}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── COMPETITORS ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                        paddingBottom: 10, borderBottom: "2px solid #534AB7", marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>
              Concurrents identifiés{" "}
              <span style={{ color: "#534AB7" }}>({competitorsToShow.length})</span>
            </h3>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 999,
                              background: "#EEEDFE", color: "#3C3489", border: "0.5px solid #AFA9EC" }}>
                Scrappés : {competitorsToShow.filter(c => c.scrape_status === "success").length}
              </span>
              <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 999,
                              background: "#E1F5EE", color: "#0F6E56", border: "0.5px solid #9FE1CB" }}>
                Avis : {competitorsToShow.filter(c => c.reviews?.sources_used?.length > 0).length}
              </span>
            </div>
          </div>

          {competitorsToShow.length === 0 && (
            <div style={{ padding: 14, borderRadius: 8, background: "#f5f5f5", color: "#888", fontSize: 13 }}>
              Aucun concurrent à afficher.
            </div>
          )}

          {context.competitors?.length > 0 && competitorsToShow.length === 0 && (
            <div>
              <p style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>Concurrents identifiés par l'agent 1 :</p>
              {context.competitors.map((c, i) => (
                <div key={i} style={{ padding: 14, borderRadius: 8, marginBottom: 12,
                                       border: "1px solid #e5e5e5", background: "#fafafa", opacity: 0.8 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{c.name}</div>
                  <div onClick={() => window.open(c.url, "_blank")}
                    style={{ fontSize: 12, color: "#534AB7", cursor: "pointer",
                             textDecoration: "underline", marginTop: 4 }}>
                    {c.url}
                  </div>
                  {c.description && (
                    <div style={{ fontSize: 13, color: "#555", marginTop: 6 }}>{c.description}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Tabbed competitor cards ── */}
          {competitorsToShow.map((c, i) => (
            <CompetitorCard
              key={i}
              c={c}
              isEmpty={isEmpty}
              getOriginalUrl={getOriginalUrl}
              sector={projectData?.sector || null}
            />
          ))}

          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#534AB7" }}>
              Contexte complet de l'analyse
            </summary>
            <pre style={{ marginTop: 8, padding: 14, borderRadius: 8, background: "#f5f5f5",
                          fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all",
                          maxHeight: 400, overflow: "auto" }}>
              {JSON.stringify(context, null, 2)}
            </pre>
          </details>

        </div>
      )}

      {/* ── Floating Pitch Audio Player ── */}
      {pitchOpen && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          width: "min(680px, calc(100vw - 32px))",
          background: "var(--color-background-primary, #fff)",
          border: "0.5px solid var(--color-border-secondary, #ccc)",
          borderRadius: 16,
          boxShadow: "0 8px 32px rgba(83,74,183,0.18), 0 2px 8px rgba(0,0,0,0.08)",
          padding: "14px 18px", zIndex: 1000,
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 7, height: 7, borderRadius: "50%",
                background: pitch.state === "speaking" ? "#1D9E75"
                           : pitch.state === "paused"  ? "#EF9F27"
                           : pitch.state === "done"    ? "#534AB7"
                           : pitch.state === "error"   ? "#E24B4A"
                           : "#B4B2A9",
                boxShadow: pitch.state === "speaking" ? "0 0 0 3px rgba(29,158,117,0.2)" : "none",
                transition: "all 0.3s",
              }} />
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary, #1a1a1a)" }}>
                Pitch audio
              </span>
              <span style={{ fontSize: 11, color: "var(--color-text-secondary, #888)" }}>
                {pitch.state === "preparing" ? "Préparation..."
                : pitch.state === "speaking" ? "En cours"
                : pitch.state === "paused"   ? "En pause"
                : pitch.state === "done"     ? "Terminé"
                : pitch.state === "error"    ? (pitch.errorMsg || "Erreur")
                : ""}
              </span>
            </div>
            <button
              onClick={handlePitchClose}
              style={{
                width: 30, height: 30, borderRadius: "50%",
                border: "0.5px solid var(--color-border-secondary, #ccc)",
                background: "transparent", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--color-text-secondary, #888)", fontSize: 14, lineHeight: 1,
              }}>✕</button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: "var(--color-text-secondary, #888)", minWidth: 34, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              {fmtTime(pitch.currentTime)}
            </span>
            <div style={{ flex: 1, position: "relative", height: 4, borderRadius: 99, background: "var(--color-background-secondary, #f0f0f0)", cursor: "pointer" }}>
              <div style={{
                position: "absolute", left: 0, top: 0, height: "100%", borderRadius: 99,
                background: "#534AB7",
                width: `${pitch.totalDuration ? Math.min(100, (pitch.currentTime / pitch.totalDuration) * 100) : 0}%`,
                transition: "width 0.3s linear",
              }} />
              <input
                type="range" min={0} max={pitch.totalDuration || 120} value={pitch.currentTime || 0} step={1}
                disabled={pitch.state === "idle" || pitch.state === "preparing"}
                onChange={(e) => { if (!pitch.audioRef?.current) return; pitch.audioRef.current.currentTime = Number(e.target.value); }}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: pitch.state === "idle" || pitch.state === "preparing" ? "not-allowed" : "pointer", margin: 0 }}
              />
            </div>
            <span style={{ fontSize: 11, color: "var(--color-text-secondary, #888)", minWidth: 34, fontVariantNumeric: "tabular-nums" }}>
              {fmtTime(pitch.totalDuration)}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => {
                if (pitch.state === "speaking")    pitch.pause();
                else if (pitch.state === "paused") pitch.resume();
                else if (pitch.state === "done" || pitch.state === "error") {
                  const text = buildSummaryText(context, projectData);
                  pitch.reset();
                  setTimeout(() => pitch.speak(text), 50);
                }
              }}
              disabled={pitch.state === "preparing"}
              style={{
                width: 44, height: 44, borderRadius: "50%",
                border: "none", cursor: pitch.state === "preparing" ? "not-allowed" : "pointer",
                background: pitch.state === "preparing" ? "var(--color-background-secondary, #e0e0e0)" : "#534AB7",
                color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, transition: "background 0.2s", boxShadow: "0 2px 8px rgba(83,74,183,0.3)",
              }}>
              {pitch.state === "preparing" ? (
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ animation: "spin 1s linear infinite" }}>
                  <circle cx="9" cy="9" r="7" stroke="rgba(255,255,255,0.3)" strokeWidth="2"/>
                  <path d="M9 2a7 7 0 0 1 7 7" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              ) : pitch.state === "speaking" ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="3" y="3" width="4" height="10" rx="1.5" fill="white"/>
                  <rect x="9" y="3" width="4" height="10" rx="1.5" fill="white"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M5 3.5v9l8-4.5-8-4.5z" fill="white"/>
                </svg>
              )}
            </button>

            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 2.5, height: 28, overflow: "hidden" }}>
              {Array.from({ length: 20 }, (_, i) => {
                const base = [5,9,14,10,18,12,7,16,9,20,14,10,18,7,12,16,9,14,10,18];
                return (
                  <div key={i} ref={el => waveBarsRef.current[i] = el}
                    style={{
                      width: 2.5, height: base[i] + "px", background: "#534AB7",
                      borderRadius: 99, opacity: pitch.state === "speaking" ? 0.8 : 0.25,
                      transition: pitch.state !== "speaking" ? "height 0.3s, opacity 0.3s" : "none",
                      flexShrink: 0,
                    }}
                  />
                );
              })}
            </div>

            <span style={{ fontSize: 11, color: "var(--color-text-secondary, #888)", minWidth: 30, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              {pitch.progress}%
            </span>
          </div>

          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {presentationOpen && (
        <PresentationModal context={context} projectData={projectData} onClose={() => setPresentationOpen(false)} />
      )}

      {personaOpen && context?.persona && (
        <PersonaModal persona={context.persona} onClose={() => setPersonaOpen(false)} onRegenerate={handleRegeneratePersona} />
      )}

    </div>
  );
}

// ── Styles ──
const badge = (color) => ({
  display: "inline-block", padding: "2px 8px", borderRadius: 20,
  fontSize: 12, background: color + "15", color,
  border: `1px solid ${color}40`
});
const chip = (bg, color) => ({
  display: "inline-flex", alignItems: "center",
  padding: "3px 10px", borderRadius: 999,
  fontSize: 12, fontWeight: 500,
  background: bg, color,
});

// ── CompetitorCard styles ──
const styles = {
  card: {
    background: "#fff",
    border: "0.5px solid #e5e5e5",
    borderRadius: 12,
    marginBottom: 16,
    overflow: "hidden",
  },
  cardHeader: {
    padding: "14px 16px",
    borderBottom: "0.5px solid #f0f0f0",
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 10,
    background: "#EEEDFE",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 15, fontWeight: 500, color: "#3C3489",
    flexShrink: 0,
  },
  cardName: {
    fontSize: 15, fontWeight: 500, color: "#1a1a1a", marginBottom: 2,
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  },
  cardUrl: {
    fontSize: 12, color: "#534AB7", textDecoration: "none", display: "block", marginBottom: 3,
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  },
  cardDesc: {
    fontSize: 12, color: "#666", lineHeight: 1.6, marginTop: 4,
    wordBreak: "break-word",
    whiteSpace: "normal",
    overflow: "hidden",
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
  },
  pill: {
    fontSize: 11, padding: "3px 9px", borderRadius: 999,
    border: "0.5px solid", display: "inline-block",
  },
  tabBar: {
    display: "flex",
    borderBottom: "0.5px solid #f0f0f0",
    padding: "0 16px",
    gap: 0,
  },
  tab: {
    padding: "10px 14px",
    fontSize: 13,
    background: "none",
    border: "none",
    borderBottom: "2px solid transparent",
    cursor: "pointer",
    color: "#888",
    whiteSpace: "nowrap",
    transition: "color 0.15s",
  },
  tabContent: {
    padding: "16px",
  },
  sectionLabel: {
    fontSize: 11, fontWeight: 500, color: "#888",
    textTransform: "uppercase", letterSpacing: "0.5px",
    marginBottom: 8,
  },
  barTrack: {
    height: 5, borderRadius: 3, background: "#f0f0f0", overflow: "hidden",
  },
  barFill: {
    height: "100%", borderRadius: 3, transition: "width 0.4s ease",
  },
  infoChip: {
    fontSize: 12, padding: "3px 10px", borderRadius: 999,
    background: "#F1EFE8", color: "#5F5E5A",
    border: "0.5px solid #D3D1C7", display: "inline-block",
  },
  quoteBlock: {
    padding: "8px 12px", borderRadius: 8,
    background: "#F1EFE8", borderLeft: "3px solid #B4B2A9",
    fontSize: 12, color: "#444441", fontStyle: "italic", lineHeight: 1.5,
  },
};
