// src/components/Chatbot.jsx
import { useState, useEffect, useRef } from "react";
import {
  getChatbotResponse,
  getWelcomeMessage,
  extractProjectFromConversation
} from "../agents/chatbot_agent";

export default function Chatbot({ onProjectReady }) {
  const [messages, setMessages]           = useState([]);
  const [conversationHistory, setHistory] = useState([]);
  const [input, setInput]                 = useState("");
  const [isTyping, setIsTyping]           = useState(false);
  const [completionPct, setCompletionPct] = useState(0);
  const [isReady, setIsReady]             = useState(false);
  const [collectedInfo, setCollectedInfo] = useState({});
  const [error, setError]                 = useState(null);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    const init = async () => {
      setIsTyping(true);
      try {
        const welcome = await getWelcomeMessage();
        setMessages([{ role: "assistant", content: welcome, id: Date.now() }]);
        setHistory([{ role: "assistant", content: welcome }]);
      } catch (e) {
        setError("Impossible de démarrer. Vérifiez votre clé API Groq.");
      } finally {
        setIsTyping(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const sendMessage = async () => {
    if (!input.trim() || isTyping || isReady) return;

    const userMsg = input.trim();
    setInput("");
    setError(null);

    setMessages(prev => [...prev, { role: "user", content: userMsg, id: Date.now() }]);
    setIsTyping(true);

    try {
      const { message, state, conversationHistory: newHistory } =
        await getChatbotResponse(conversationHistory, userMsg);

      setHistory(newHistory);
      setCompletionPct(state.completion_percentage || 0);
      setCollectedInfo(state.collected || {});

      const readyToLaunch =
        message.includes("🚀 Launching the analysis now!") ||
        state.is_ready ||
        state.completion_percentage >= 85;

      setMessages(prev => [...prev, {
        role: "assistant",
        content: message,
        id: Date.now(),
        isLaunch: readyToLaunch
      }]);

      if (readyToLaunch) {
        setIsReady(true);
        setTimeout(async () => {
          try {
            const projectData = await extractProjectFromConversation(newHistory);
            onProjectReady(projectData, newHistory);
          } catch (e) {
            setError(`Extraction error: ${e.message}`);
            setIsReady(false);
          }
        }, 1500);
      }

    } catch (e) {
      setError(`Erreur : ${e.message}`);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Désolé, une erreur est survenue. Pouvez-vous reformuler ?",
        id: Date.now()
      }]);
    } finally {
      setIsTyping(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const infoFields = [
    { key: "description",            label: "Projet",         icon: "📝" },
    { key: "location",               label: "Localisation",   icon: "📍" },
    { key: "sector",                 label: "Secteur",        icon: "🏭" },
    { key: "clientType",             label: "Client",         icon: "🎯" },
    { key: "priceRange",             label: "Prix",           icon: "💰" },
    { key: "problem_solved",         label: "Problème résolu", icon: "🔧" },
    { key: "differentiator",         label: "Différenciateur", icon: "⚡" },
    { key: "stage",                  label: "Phase",          icon: "🚦" },
    { key: "competitive_advantages", label: "Avantages",      icon: "🏆" },
    ];

  return (
    <div style={{ display: "flex", gap: 20, height: "calc(100vh - 200px)", minHeight: 520 }}>

      {/* Main chat */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column",
                    border: "1px solid #e5e5e5", borderRadius: 12,
                    overflow: "hidden", background: "#fff" }}>

        {/* Header */}
        <div style={{ padding: "14px 18px", background: "#534AB7",
                       display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: "50%",
                         background: "rgba(255,255,255,0.2)",
                         display: "flex", alignItems: "center",
                         justifyContent: "center", fontSize: 20 }}>
            🤖
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>
              IA Analyseur Startup
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>
              Expert en analyse de marché — Tunisie & Afrique du Nord
            </div>
          </div>
          {completionPct > 0 && (
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", marginBottom: 4 }}>
                Progression
              </div>
              <div style={{ height: 6, width: 120, background: "rgba(255,255,255,0.2)",
                             borderRadius: 3, overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${completionPct}%`,
                  background: completionPct >= 85 ? "#4ade80" : "#fff",
                  borderRadius: 3,
                  transition: "width 0.5s"
                }} />
              </div>
              <div style={{ fontSize: 11, color: "#fff", marginTop: 2 }}>
                {completionPct}%
              </div>
            </div>
          )}
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflow: "auto", padding: "16px",
                       display: "flex", flexDirection: "column", gap: 14,
                       background: "#fafafa" }}>
          {messages.map((msg) => (
            <div key={msg.id} style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              alignItems: "flex-end",
              gap: 8,
            }}>
              {msg.role === "assistant" && (
                <div style={{
                  width: 30, height: 30, borderRadius: "50%",
                  background: "#534AB715", border: "1px solid #534AB730",
                  display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 15,
                  flexShrink: 0,
                }}>
                  🤖
                </div>
              )}
              <div style={{
                maxWidth: "72%",
                padding: "10px 14px",
                borderRadius: msg.role === "user"
                  ? "18px 18px 4px 18px"
                  : "4px 18px 18px 18px",
                background: msg.role === "user" ? "#534AB7" : "#fff",
                color: msg.role === "user" ? "#fff" : "#333",
                fontSize: 14,
                lineHeight: 1.65,
                border: msg.role === "assistant" ? "1px solid #e5e5e5" : "none",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
              }}>
                {msg.content}
                {msg.isLaunch && (
                  <div style={{
                    marginTop: 10, padding: "8px 12px", borderRadius: 8,
                    background: "#f0fff4", border: "1px solid #b7ebc8",
                    fontSize: 12, color: "#1a7a3a", textAlign: "center",
                    fontWeight: 500,
                  }}>
                    ✓ Informations collectées — lancement de l'analyse...
                  </div>
                )}
              </div>
              {msg.role === "user" && (
                <div style={{
                  width: 30, height: 30, borderRadius: "50%",
                  background: "#534AB7", color: "#fff",
                  display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 13,
                  fontWeight: 600, flexShrink: 0,
                }}>
                  U
                </div>
              )}
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
              <div style={{
                width: 30, height: 30, borderRadius: "50%",
                background: "#534AB715", border: "1px solid #534AB730",
                display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 15,
              }}>
                🤖
              </div>
              <div style={{
                padding: "10px 16px", borderRadius: "4px 18px 18px 18px",
                background: "#fff", border: "1px solid #e5e5e5",
                display: "flex", gap: 5, alignItems: "center",
              }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: "#534AB7",
                    animation: `bounce 1.2s infinite ${i * 0.2}s`,
                    opacity: 0.6,
                  }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: "8px 16px", background: "#fff0f0",
            color: "#cc0000", fontSize: 12,
            borderTop: "1px solid #ffcccc",
          }}>
            ⚠ {error}
          </div>
        )}

        {/* Input */}
        <div style={{
          padding: "12px 16px", borderTop: "1px solid #e5e5e5",
          display: "flex", gap: 8, background: "#fff",
        }}>
          <textarea
            ref={inputRef}
            rows={2}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isTyping || isReady}
            
            placeholder={
              isReady
                ? "Analyse en cours de lancement..."
                : "Décrivez votre projet et saisissez votre idée ici..."
            }
            style={{
              flex: 1, padding: "8px 12px", borderRadius: 10,
              fontSize: 13, border: "1px solid #ddd",
              outline: "none", resize: "none",
              background: isReady ? "#f5f5f5" : "#fff",
              color: "#333", lineHeight: 1.5,
              fontFamily: "inherit",
            }}
          />
          <button
            onClick={sendMessage}
            disabled={isTyping || isReady || !input.trim()}
            style={{
              padding: "0 18px", borderRadius: 10, border: "none",
              background: (!input.trim() || isTyping || isReady) ? "#e5e5e5" : "#534AB7",
              color: (!input.trim() || isTyping || isReady) ? "#aaa" : "#fff",
              cursor: (!input.trim() || isTyping || isReady) ? "not-allowed" : "pointer",
              fontSize: 20, flexShrink: 0, transition: "all 0.2s",
            }}
          >
            ➤
          </button>
        </div>

        <style>{`
          @keyframes bounce {
            0%, 60%, 100% { transform: translateY(0); }
            30% { transform: translateY(-6px); }
          }
        `}</style>
      </div>

      {/* Collected info panel */}
      <div style={{ width: 270, display: "flex", flexDirection: "column", gap: 10 }}>

        {/* Panel header */}
        <div style={{
          padding: "12px 14px", borderRadius: 10,
          background: "#f9f9f9", border: "1px solid #e5e5e5",
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 4 }}>
            Informations collectées
          </div>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 10 }}>
             Renseignées au fil de la conversation
          </div>
          <div style={{ height: 8, background: "#e5e5e5", borderRadius: 4, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${completionPct}%`,
              background: completionPct >= 85 ? "#1a7a3a" : "#534AB7",
              borderRadius: 4,
              transition: "width 0.5s",
            }} />
          </div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 6, fontWeight: 500 }}>
            {completionPct}% — {
              completionPct < 30 ? "Démarrage" :
              completionPct < 60 ? "En cours..." :
              completionPct < 85 ? "Presque prêt" :
              "Prêt à analyser !"
            }
          </div>
        </div>

        {/* Collected fields */}
        <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {infoFields.map(({ key, label, icon }) => (
            <div key={key} style={{
              padding: "8px 12px", borderRadius: 8,
              background: collectedInfo[key] ? "#f0fff4" : "#f9f9f9",
              border: `1px solid ${collectedInfo[key] ? "#b7ebc8" : "#e5e5e5"}`,
              transition: "all 0.3s",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 14 }}>{icon}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#888",
                                textTransform: "uppercase", flex: 1 }}>
                  {label}
                </span>
                {collectedInfo[key] && (
                  <span style={{ fontSize: 12, color: "#1a7a3a" }}>✓</span>
                )}
              </div>
              {collectedInfo[key] && (
                <div style={{
                  fontSize: 12, color: "#333", marginTop: 4,
                  lineHeight: 1.4, maxHeight: 48,
                  overflow: "hidden",
                }}>
                  {String(collectedInfo[key]).slice(0, 80)}
                  {String(collectedInfo[key]).length > 80 ? "..." : ""}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Ready badge */}
        {isReady && (
          <div style={{
            padding: 12, borderRadius: 10,
            background: "#f0fff4", border: "1px solid #b7ebc8",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 24, marginBottom: 4 }}>🚀</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1a7a3a" }}>
             Analyse lancée !
            </div>
            <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
              Le pipeline est en cours d'exécution
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
