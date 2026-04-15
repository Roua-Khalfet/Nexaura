// src/agents/sharedContext.js

const STORAGE_KEY = "startup_analyzer_context";
const DJANGO_API_URL = "http://localhost:8000/api";

// ─── Créer un nouveau context (nouveau projet) ────────────────────────────────
export const createSharedContext = (userInput) => ({
  project_info: {
    description:          userInput.description,
    location:             userInput.location,
    sector:               userInput.sector,
    client_type:          userInput.clientType,
    price_range:          userInput.priceRange,
    problem_solved:       userInput.problem_solved  || "",
    differentiator:       userInput.differentiator  || "",
    stage:                userInput.stage           || "",
    budget:               userInput.budget          || "",
    enriched_description: userInput.enriched_description || userInput.description,
  },
  conversation_summary:    userInput.conversation_summary || "",
  competitors:             [],
  competitors_raw:         [],
  competitors_structured:  [],
  reviews_analysis:        [],
  market_metrics:          {},
  opportunities:           [],
  swot:                    {},
  personas:                [],
  final_report:            "",
});

// ─── Sauvegarder dans localStorage ───────────────────────────────────────────
export const saveContext = (context) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(context));
    console.log("✅ Context sauvegardé localStorage :", context);
  } catch (e) {
    console.error("❌ Erreur sauvegarde context :", e);
  }
};

// ─── Charger depuis localStorage ─────────────────────────────────────────────
export const loadContext = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const context = JSON.parse(saved);
      console.log("✅ Context chargé depuis localStorage :", context);
      return context;
    }
    return null;
  } catch (e) {
    console.error("❌ Erreur chargement context :", e);
    return null;
  }
};

// ─── Effacer localStorage ─────────────────────────────────────────────────────
export const clearContext = () => {
  localStorage.removeItem(STORAGE_KEY);
  console.log("🗑️ Context effacé");
};

// ─── Mettre à jour une clé + sauvegarder ─────────────────────────────────────
export const updateContext = (context, key, value) => {
  context[key] = value;
  saveContext(context);
  return context;
};

// ══════════════════════════════════════════════════════════════════════════════
// DJANGO INTEGRATION — Téléchargement local du context
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Envoie le context au serveur Django pour sauvegarde locale (fichier JSON)
 */
export const saveContextToServer = async (context) => {
  try {
    const response = await fetch(`${DJANGO_API_URL}/save-context/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(context),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || `Erreur serveur: ${response.status}`);
    }

    const result = await response.json();
    console.log("✅ Context sauvegardé sur serveur :", result.filename);
    return result; // { success, filename, filepath, size }
  } catch (e) {
    console.error("❌ Erreur saveContextToServer :", e);
    throw e;
  }
};

/**
 * Déclenche le téléchargement du fichier JSON dans le navigateur
 * Si filename est null → télécharge le plus récent
 */
export const downloadContextAsFile = async (filename = null) => {
  try {
    const url = filename
      ? `${DJANGO_API_URL}/download-context/${filename}/`
      : `${DJANGO_API_URL}/download-context/`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Erreur téléchargement: ${response.status}`);

    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename || `shared_context_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);

    console.log("✅ Téléchargement lancé :", link.download);
  } catch (e) {
    console.error("❌ Erreur downloadContextAsFile :", e);
    throw e;
  }
};

/**
 * Télécharge directement le context EN MÉMOIRE (sans passer par Django)
 * Utile si Django est off ou comme fallback rapide
 */
export const downloadContextLocally = (context) => {
  try {
    const json = JSON.stringify(context, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.href = url;
    link.download = `shared_context_${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    console.log("✅ Context téléchargé localement (sans serveur)");
  } catch (e) {
    console.error("❌ Erreur downloadContextLocally :", e);
    throw e;
  }
};

/**
 * Sauvegarde sur Django ET télécharge — tout en une seule action
 */
export const saveAndDownloadContext = async (context) => {
  const saved = await saveContextToServer(context);
  await downloadContextAsFile(saved.filename);
  return saved;
};

/**
 * Liste tous les fichiers de context sauvegardés sur le serveur Django
 */
export const listServerContexts = async () => {
  try {
    const response = await fetch(`${DJANGO_API_URL}/list-contexts/`);
    if (!response.ok) throw new Error(`Erreur: ${response.status}`);
    const data = await response.json();
    console.log("📁 Fichiers disponibles :", data);
    return data; // [{ filename, size, created_at }, ...]
  } catch (e) {
    console.error("❌ Erreur listServerContexts :", e);
    throw e;
  }
};