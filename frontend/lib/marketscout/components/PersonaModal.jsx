// src/components/PersonaModal.jsx
import { useState } from "react";

export default function PersonaModal({ persona, onClose, onRegenerate }) {
  const [imgError, setImgError]     = useState(false);
  const [imgLoading, setImgLoading] = useState(true);

  if (!persona) return null;

  // Utilise avatar_fallback si disponible (défini par l'agent), sinon DiceBear générique
  const fallbackAvatar =
    persona.avatar_fallback ||
    `https://api.dicebear.com/7.x/personas/svg?seed=${
      encodeURIComponent(persona.name || persona.nom)
    }&backgroundColor=EEEDFE`;

  const name         = persona.name         || persona.nom;
  const ageRange     = persona.age_range;
  const gender       = persona.gender       || persona.genre;
  const profession   = persona.profession;
  const region       = persona.region;
  const familyStatus = persona.family_status || persona.status_familial;
  const interests    = persona.interests    || persona.centres_interet || [];
  const personality  = persona.personality  || persona.personnalite;
  const pains        = persona.pains        || persona.douleurs        || [];
  const lifestyle    = persona.lifestyle    || persona.style_de_vie    || [];

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 2000,
        background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center",
        justifyContent: "center", padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff", borderRadius: 16,
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          width: "100%", maxWidth: 620,
          maxHeight: "90vh", overflowY: "auto",
          padding: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >

        {/* ── Header ── */}
        <div style={{
          padding: "16px 20px 14px",
          borderBottom: "0.5px solid #f0f0f0",
          display: "flex", justifyContent: "space-between",
          alignItems: "center",
        }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 500, color: "#1a1a1a" }}>
            {name}
          </h2>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                style={{
                  border: "0.5px solid #AFA9EC",
                  background: "#EEEDFE",
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 12,
                  color: "#3C3489",
                  cursor: "pointer",
                }}
              >
                ↻ Régénérer
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                border: "none", background: "none",
                cursor: "pointer", fontSize: 18,
                color: "#888", padding: "0 4px",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "200px 1fr",
          gap: 0, minHeight: 400,
        }}>

          {/* ── Colonne gauche ── */}
          <div style={{
            padding: 18,
            borderRight: "0.5px solid #f0f0f0",
            background: "#fafafa",
          }}>

            {/* Avatar avec spinner de chargement */}
            <div style={{
              width: 140, height: 140,
              borderRadius: 12,
              overflow: "hidden",
              marginBottom: 16,
              border: "1px solid #e5e5e5",
              background: "#EEEDFE",
              position: "relative",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {/* Spinner visible pendant le chargement */}
              {imgLoading && !imgError && (
                <div style={{
                  position: "absolute", inset: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "#EEEDFE",
                  zIndex: 1,
                }}>
                  <div style={{
                    width: 28, height: 28,
                    border: "3px solid #AFA9EC",
                    borderTopColor: "#3C3489",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                  }} />
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              )}

              <img
                src={imgError ? fallbackAvatar : persona.avatar_url}
                onLoad={() => setImgLoading(false)}
                onError={() => { setImgError(true); setImgLoading(false); }}
                alt={name}
                style={{
                  width: "100%", height: "100%",
                  objectFit: "cover",
                  opacity: imgLoading && !imgError ? 0 : 1,
                  transition: "opacity 0.3s ease",
                }}
              />
            </div>

            {/* Infos démographiques */}
            {[
              ["Âge",        ageRange     ? `${ageRange} ans`  : null],
              ["Genre",      gender],
              ["Profession", profession],
              ["Région",     region],
              ["Statut",     familyStatus],
            ].map(([k, v]) => v && (
              <div key={k} style={{ marginBottom: 8 }}>
                <span style={{
                  fontSize: 11, fontWeight: 500, color: "#888",
                  textTransform: "uppercase", letterSpacing: "0.4px",
                }}>
                  {k}
                </span>
                <div style={{ fontSize: 13, color: "#1a1a1a", marginTop: 2 }}>
                  {v}
                </div>
              </div>
            ))}

            {/* Centres d'intérêt */}
            {interests.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{
                  fontSize: 11, fontWeight: 500, color: "#888",
                  textTransform: "uppercase", letterSpacing: "0.4px",
                  marginBottom: 5,
                }}>
                  Centres d'intérêt
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {interests.map((c, i) => (
                    <span key={i} style={{
                      fontSize: 11, padding: "2px 8px", borderRadius: 999,
                      background: "#EEEDFE", color: "#3C3489",
                      border: "0.5px solid #AFA9EC",
                    }}>
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Personnalité */}
            {personality && (
              <div style={{
                marginTop: 10, padding: "8px 10px",
                borderRadius: 8, background: "#F1EFE8",
                borderLeft: "3px solid #B4B2A9",
                fontSize: 12, color: "#444", fontStyle: "italic",
              }}>
                {personality}
              </div>
            )}

            {/* Points de douleur */}
            {pains.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{
                  fontSize: 11, fontWeight: 500, color: "#888",
                  textTransform: "uppercase", letterSpacing: "0.4px",
                  marginBottom: 5,
                }}>
                  Points de douleur
                </div>
                {pains.map((d, i) => (
                  <div key={i} style={{
                    fontSize: 12, color: "#444", marginBottom: 4,
                    paddingLeft: 8, borderLeft: "2px solid #EF9F27",
                  }}>
                    {d}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Colonne droite — Routine quotidienne ── */}
          <div style={{ padding: 18 }}>
            <div style={{
              fontSize: 11, fontWeight: 500, color: "#888",
              textTransform: "uppercase", letterSpacing: "0.5px",
              marginBottom: 12,
            }}>
              Routine quotidienne
            </div>

            {lifestyle.length === 0 && (
              <div style={{ fontSize: 12, color: "#aaa", fontStyle: "italic" }}>
                Aucune donnée de style de vie disponible.
              </div>
            )}

            {lifestyle.map((item, i) => (
              <div key={i} style={{
                display: "flex", gap: 12, marginBottom: 12,
                paddingBottom: 12,
                borderBottom: i < lifestyle.length - 1
                  ? "0.5px solid #f0f0f0" : "none",
              }}>
                <div style={{
                  minWidth: 42, fontSize: 11, fontWeight: 500,
                  color: "#534AB7", paddingTop: 1,
                }}>
                  {item.time || item.heure}
                </div>
                <div>
                  <div style={{
                    fontSize: 13, fontWeight: 500,
                    color: "#1a1a1a", marginBottom: 2,
                  }}>
                    {item.activity || item.activite}
                  </div>
                  <div style={{ fontSize: 12, color: "#666", lineHeight: 1.5 }}>
                    {item.detail}
                  </div>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
