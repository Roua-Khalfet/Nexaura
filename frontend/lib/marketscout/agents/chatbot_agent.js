// src/agents/chatbot_agent.js
// ✅ Utilise callLLM du routeur — fallback automatique Groq ↔ vLLM sans downtime

import { callLLM } from "./llmRouter";

// ─── Helper : appel LLM avec historique de messages ──────────────────────────
async function callWithMessages(messages, maxTokens = 1000, label = "chatbot") {
  const systemMsg = messages.find(m => m.role === "system");
  const chatMsgs  = messages.filter(m => m.role !== "system");

  const prompt = chatMsgs
    .map(m => `${m.role === "user" ? "Utilisateur" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  return callLLM(prompt, {
    maxTokens,
    systemPrompt: systemMsg?.content || "Tu es un assistant utile.",
    label,
  });
}

// ─── Helper : extraction JSON robuste ────────────────────────────────────────
function extractJSON(text) {
  let cleaned = text.replace(/```json|```/g, "").trim();
  const firstBrace = cleaned.indexOf("{");
  if (firstBrace === -1) throw new Error("Aucun JSON trouvé");
  const end = cleaned.lastIndexOf("}");
  return JSON.parse(cleaned.slice(firstBrace, end + 1));
}

// ─── System prompt du chatbot ─────────────────────────────────────────────────
const SYSTEM_PROMPT = `Tu es un expert senior en analyse de marché et stratégie startup,
spécialisé en Tunisie et en Afrique du Nord.

Ton rôle est de collecter des informations précises à travers une conversation naturelle
pour permettre une analyse de marché complète et un SWOT pertinent.

INFORMATIONS À COLLECTER (dans cet ordre) :
1. Description détaillée du projet (quoi, comment, pour qui, pourquoi)
2. Zone géographique cible précise
3. Secteur d'activité exact
4. Type de client (B2C / B2B / B2B2C)
5. Fourchette de prix envisagée
6. Problème principal résolu (très important pour le SWOT)
7. Différenciateur clé vs les concurrents existants (très important pour le SWOT)
8. Stade du projet (idée / MVP / en développement / lancé)
9. Budget de lancement disponible (optionnel)
10. Avantages concurrentiels que l'entrepreneur pense avoir

RÈGLES IMPORTANTES :
- Pose UNE seule question à la fois, très précisément
- Sois naturel et conversationnel
- Adapte tes questions en fonction des réponses précédentes
- Si une réponse est vague, demande des précisions spécifiques
- Donne un court feedback analytique sur chaque réponse
- Pose des questions de suivi intelligentes si nécessaire
- Quand tu as les infos 1 à 8, fais un récapitulatif et annonce que tu lances l'analyse
- Parle toujours en FRANÇAIS
- Montre ton expertise en faisant des observations pertinentes

SECTEURS EN TUNISIE : FoodTech, EdTech, FinTech, HealthTech, E-commerce,
AgriTech, PropTech, TransportTech, TourismTech, CleanTech, RetailTech, SaaS, MarketPlace

CONTEXTE DU MARCHÉ TUNISIEN :
- Population : ~12 M, 60 % ont moins de 35 ans
- Digital : ~70 % de taux d'internet, forte adoption mobile
- E-commerce en forte croissance post-COVID
- Marchés actifs : Tunis, Sfax, Sousse, Monastir, Bizerte
- Défis : pouvoir d'achat limité, accès difficile aux financements, infrastructure logistique
- Opportunités : diaspora (~2 M), export Afrique subsaharienne, digitalisation des PME`;

// ─── Analyse de l'état de la conversation ────────────────────────────────────
async function analyzeConversationState(conversationHistory) {
  const analysisPrompt = `
Analyse cette conversation et extrais les informations collectées.

Conversation :
${conversationHistory
    .filter(m => m.role !== "system")
    .map(m => `${m.role === "user" ? "Entrepreneur" : "Expert"}: ${m.content}`)
    .join("\n")}

Retourne UNIQUEMENT ce JSON :
{
  "collected": {
    "description": "description du projet ou null",
    "location": "zone géographique ou null",
    "sector": "secteur ou null",
    "clientType": "B2C/B2B/B2B2C ou null",
    "priceRange": "fourchette de prix ou null",
    "problem_solved": "problème résolu ou null",
    "differentiator": "différenciateur clé ou null",
    "stage": "idée/MVP/lancé ou null",
    "budget": "budget ou null",
    "competitive_advantages": "avantages concurrentiels ou null"
  },
  "missing_essential": ["liste des champs essentiels manquants parmi 1 à 8"],
  "is_ready": false,
  "completion_percentage": 0
}`.trim();

  try {
    const raw = await callLLM(analysisPrompt, {
      maxTokens:    800,
      systemPrompt: "Tu réponds UNIQUEMENT en JSON valide. Aucun texte avant ou après.",
      label:        "chatbot_state",
    });
    return extractJSON(raw);
  } catch {
    return {
      collected:         {},
      missing_essential: ["description", "location", "sector", "clientType", "priceRange", "problem_solved", "differentiator"],
      is_ready:          false,
      completion_percentage: 0,
    };
  }
}

// ─── Réponse principale du chatbot ───────────────────────────────────────────
export async function getChatbotResponse(conversationHistory, userMessage) {
  const updatedHistory = [
    ...conversationHistory,
    { role: "user", content: userMessage },
  ];

  const state = await analyzeConversationState(updatedHistory);

  const messagesForLLM = [
    { role: "system", content: SYSTEM_PROMPT },
    ...updatedHistory.filter(m => m.role !== "system"),
  ];

  if (state.is_ready || state.completion_percentage >= 85) {
    messagesForLLM.push({
      role: "system",
      content: `Tu as collecté toutes les informations essentielles (${state.completion_percentage}%).
Fais un récapitulatif structuré et détaillé de TOUTES les informations collectées,
en incluant le problème résolu, le différenciateur et les avantages concurrentiels.
Dis à l'entrepreneur que tu lances l'analyse complète maintenant.
Termine EXACTEMENT par : "🚀 Lancement de l'analyse maintenant !"`,
    });
  }

  const response = await callWithMessages(messagesForLLM, 700, "chatbot_response");

  return {
    message: response,
    state,
    conversationHistory: [
      ...updatedHistory,
      { role: "assistant", content: response },
    ],
  };
}

// ─── Message de bienvenue ─────────────────────────────────────────────────────
export async function getWelcomeMessage() {
  const welcomePrompt = `
Génère un message de bienvenue chaleureux et professionnel pour un entrepreneur tunisien
qui souhaite analyser son idée de startup.
Présente-toi comme un expert en analyse de marché spécialisé en Tunisie.
Explique brièvement ce que tu vas faire (collecter des infos, analyser le marché, générer un SWOT).
Pose la première question : la description du projet.
Sois concis (4-5 phrases max). Parle en FRANÇAIS.`.trim();

  return callWithMessages(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user",   content: welcomePrompt },
    ],
    400,
    "chatbot_welcome"
  );
}

// ─── Extraction finale du projet ──────────────────────────────────────────────
export async function extractProjectFromConversation(conversationHistory) {
  const conversationText = conversationHistory
    .filter(m => m.role !== "system")
    .map(m => `${m.role === "user" ? "Entrepreneur" : "Expert"}: ${m.content}`)
    .join("\n");

  const extractPrompt = `
Analyse cette conversation complète et extrais toutes les informations du projet startup.

Conversation :
${conversationText}

Extrais toutes les informations mentionnées et retourne UNIQUEMENT ce JSON :
{
  "description": "Description de base du projet",
  "location": "Zone géographique",
  "sector": "Secteur exact",
  "clientType": "B2C | B2B | B2B2C",
  "priceRange": "Fourchette de prix",
  "problem_solved": "Problème principal résolu par le projet",
  "differentiator": "Différenciateur clé vs les concurrents",
  "stage": "Stade du projet",
  "budget": "Budget disponible si mentionné",
  "competitive_advantages": "Avantages concurrentiels mentionnés",
  "target_audience": "Cible précise",
  "enriched_description": "Description TRÈS COMPLÈTE combinant TOUTES les infos collectées dans la conversation, incluant : le concept, le problème résolu, la cible, le différenciateur, le stade, les avantages. Minimum 3 phrases détaillées.",
  "conversation_summary": "Résumé complet de la conversation incluant tous les détails importants mentionnés par l'entrepreneur sur son projet, ses motivations, ses avantages concurrentiels, ses préoccupations, et tout ce qui pourrait aider à analyser les forces et faiblesses du projet"
}`.trim();

  try {
    const raw = await callLLM(extractPrompt, {
      maxTokens:    1500,
      systemPrompt: "Tu réponds UNIQUEMENT en JSON valide. Aucun texte avant ou après.",
      label:        "chatbot_extract",
    });
    return extractJSON(raw);
  } catch (e) {
    throw new Error(`Extraction échouée : ${e.message}`);
  }
}