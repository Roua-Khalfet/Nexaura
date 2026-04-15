// src/agents/llmRouter.js
// Routeur LLM centralisé — Groq (principal) + vLLM TokenFactory (fallback)

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const VLLM_API_KEY = import.meta.env.VITE_VLLM_API_KEY;

const GROQ_BASE_URL = "https://api.groq.com/openai";
const VLLM_BASE_URL = "https://tokenfactory.esprit.tn/api";

const GROQ_MODEL = "llama-3.3-70b-versatile";
const VLLM_MODEL = "hosted_vllm/Llama-3.1-70B-Instruct";

const SYSTEM_JSON =
  "Tu es un assistant qui repond UNIQUEMENT en JSON valide. Aucun texte avant ou apres le JSON.";

// ─── État interne du routeur ──────────────────────────────────────────────────
const routerState = {
  groqBlocked: false,
  groqBlockedUntil: 0,
};

const vllmAvailable = !!VLLM_API_KEY;

// ─── Appel brut vers un endpoint OpenAI-compatible ───────────────────────────
async function callEndpoint({
  baseUrl,
  apiKey,
  model,
  prompt,
  maxTokens,
  systemPrompt,
  extraBody = {},
}) {
  let res;
  try {
    res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0.1,
        messages: [
          { role: "system", content: systemPrompt || SYSTEM_JSON },
          { role: "user", content: prompt },
        ],
        ...extraBody, // ← permet de passer response_format, temperature override, etc.
      }),
    });
  } catch (networkErr) {
    throw new Error(`NETWORK_ERROR: ${networkErr.message}`);
  }

  if (res.status === 429) {
    const retryAfter = res.headers.get("retry-after") || "10";
    throw Object.assign(new Error("RATE_LIMIT"), { retryAfter });
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body.error?.message || res.statusText || `HTTP ${res.status}`;
    if (
      res.status === 413 ||
      msg.toLowerCase().includes("rate limit") ||
      msg.toLowerCase().includes("token")
    ) {
      throw Object.assign(new Error("RATE_LIMIT"), { retryAfter: "10" });
    }
    throw new Error(`LLM error [${res.status}]: ${msg}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Réponse vide du LLM");
  return content;
}

// ─── Appel Groq ───────────────────────────────────────────────────────────────
async function callGroq(prompt, maxTokens, systemPrompt, extraBody = {}) {
  if (!GROQ_API_KEY) throw new Error("GROQ_KEY_MISSING");

  if (routerState.groqBlocked && Date.now() < routerState.groqBlockedUntil) {
    throw new Error("RATE_LIMIT");
  }
  if (routerState.groqBlocked && Date.now() >= routerState.groqBlockedUntil) {
    routerState.groqBlocked = false;
    console.log("[LLM] ✅ Groq débloqué — reprise normale");
  }

  return callEndpoint({
    baseUrl: GROQ_BASE_URL,
    apiKey: GROQ_API_KEY,
    model: GROQ_MODEL,
    prompt,
    maxTokens,
    systemPrompt,
    extraBody,
  });
}

// ─── Appel vLLM TokenFactory ──────────────────────────────────────────────────
async function callVLLM(prompt, maxTokens, systemPrompt, extraBody = {}) {
  if (!vllmAvailable) throw new Error("VLLM_KEY_MISSING");
  return callEndpoint({
    baseUrl: VLLM_BASE_URL,
    apiKey: VLLM_API_KEY,
    model: VLLM_MODEL,
    prompt,
    maxTokens,
    systemPrompt,
    extraBody,
  });
}

// ─── Routeur principal avec fallback INSTANTANÉ ───────────────────────────────
/**
 * callLLM — supporte DEUX signatures :
 *
 * ① Signature originale (agents existants) :
 *    callLLM(prompt, { maxTokens, prefer, systemPrompt, label })
 *
 * ② Nouvelle signature (agent4_persona et compatibilité OpenAI) :
 *    callLLM(model, messages, { max_tokens, temperature, response_format, ... })
 *    ex: callLLM("hosted_vllm/Llama-3.1-70B-Instruct", [{role:"user", content:"..."}], { max_tokens: 1000 })
 *
 * Stratégie SANS DOWNTIME :
 *   1. Si Groq est connu comme bloqué → aller directement sur vLLM
 *   2. Essayer le provider principal
 *   3. Si RATE_LIMIT → mémoriser le blocage + switch IMMÉDIAT sur vLLM (0ms d'attente)
 *   4. Si NETWORK_ERROR ou autre → switch immédiat sur vLLM
 *   5. Si les deux échouent → throw message lisible
 */
export async function callLLM(promptOrModel, messagesOrOptions = {}, extraOptions = {}) {

  // ── Détection signature ② : callLLM(model, messages[], options) ──
  if (typeof promptOrModel === "string" && Array.isArray(messagesOrOptions)) {
    const model    = promptOrModel;
    const messages = messagesOrOptions;
    const opts     = extraOptions;

    // Extraire les contenus depuis le tableau messages
    const userMsg = messages.find((m) => m.role === "user")?.content   || "";
    const sysMsg  = messages.find((m) => m.role === "system")?.content || SYSTEM_JSON;

    // Si le modèle est explicitement vLLM → prefer vllm, sinon groq
    const prefer = model.startsWith("hosted_vllm/") ? "vllm" : "groq";

    // Construire l'extraBody (response_format, temperature override, etc.)
    const extraBody = {};
    if (opts.response_format) extraBody.response_format = opts.response_format;
    if (opts.temperature !== undefined) extraBody.temperature = opts.temperature;

    return callLLM(userMsg, {
      maxTokens:    opts.max_tokens || 2000,
      prefer,
      systemPrompt: sysMsg,
      label:        "agent_openai_compat",
      extraBody,
    });
  }

  // ── Signature originale ① : callLLM(prompt, options) ──
  const prompt = promptOrModel;
  const {
    maxTokens    = 2000,
    prefer       = "groq",
    systemPrompt = SYSTEM_JSON,
    label        = "llm",
    extraBody    = {},
  } = messagesOrOptions;

  // ── Résoudre le provider préféré ──
  const groqReady =
    !!GROQ_API_KEY &&
    !(routerState.groqBlocked && Date.now() < routerState.groqBlockedUntil);
  const vllmReady = vllmAvailable;

  let effectivePrefer = prefer;
  if (prefer === "groq" && !groqReady && vllmReady) {
    effectivePrefer = "vllm";
    console.log(`[LLM:${label}] Groq indisponible → vLLM direct`);
  } else if (prefer === "vllm" && !vllmReady && groqReady) {
    effectivePrefer = "groq";
    console.log(`[LLM:${label}] vLLM non configuré → Groq direct`);
  }

  const primary = effectivePrefer === "groq"
    ? (p, t, s) => callGroq(p, t, s, extraBody)
    : (p, t, s) => callVLLM(p, t, s, extraBody);

  const secondary = effectivePrefer === "groq"
    ? vllmReady  ? (p, t, s) => callVLLM(p, t, s, extraBody) : null
    : groqReady  ? (p, t, s) => callGroq(p, t, s, extraBody) : null;

  const primName = effectivePrefer === "groq" ? "Groq" : "vLLM";
  const secName  = effectivePrefer === "groq" ? "vLLM" : "Groq";

  // ── Tentative sur le provider principal ──
  try {
    const result = await primary(prompt, maxTokens, systemPrompt);
    console.log(`[LLM:${label}] ✓ ${primName}`);
    return result;
  } catch (primaryErr) {
    const isRateLimit    = primaryErr.message === "RATE_LIMIT";
    const isNetworkError = primaryErr.message?.startsWith("NETWORK_ERROR");
    const isKeyMissing   =
      primaryErr.message === "GROQ_KEY_MISSING" ||
      primaryErr.message === "VLLM_KEY_MISSING";

    if (isRateLimit && effectivePrefer === "groq") {
      const blockDuration = 60_000;
      routerState.groqBlocked = true;
      routerState.groqBlockedUntil = Date.now() + blockDuration;
      console.warn(
        `[LLM:${label}] ⚡ Groq rate-limit → switch immédiat sur ${secName || "aucun"} (Groq bloqué 60s)`
      );
    } else if (isNetworkError) {
      console.warn(`[LLM:${label}] ${primName} erreur réseau → switch sur ${secName || "aucun"}`);
    } else if (isKeyMissing) {
      console.warn(`[LLM:${label}] ${primName} clé manquante → switch sur ${secName || "aucun"}`);
    } else {
      console.warn(
        `[LLM:${label}] ${primName} erreur: ${primaryErr.message} → switch sur ${secName || "aucun"}`
      );
    }

    if (!secondary) {
      throw new Error(
        "Le service IA est temporairement indisponible. Veuillez réessayer dans quelques secondes."
      );
    }

    // ── Fallback immédiat — ZÉRO délai ──
    try {
      const result = await secondary(prompt, maxTokens, systemPrompt);
      console.log(`[LLM:${label}] ✓ ${secName} (fallback instantané)`);
      return result;
    } catch (secondaryErr) {
      console.error(`[LLM:${label}] Les deux providers ont échoué.`, {
        primaryErr,
        secondaryErr,
      });
      throw new Error(
        "Le service IA est temporairement surchargé. Veuillez réessayer dans quelques secondes."
      );
    }
  }
}

// ─── Appels parallèles ────────────────────────────────────────────────────────
/**
 * callLLMParallel(prompts, options)
 *
 * Lance N prompts en parallèle.
 * Répartit automatiquement entre Groq et vLLM si les deux sont disponibles.
 * Chaque appel a son propre fallback croisé.
 * Les éléments échoués sont null (pas de throw global).
 */
export async function callLLMParallel(prompts, options = {}) {
  const results = await Promise.allSettled(
    prompts.map((prompt, i) => {
      const prefer = vllmAvailable ? (i % 2 === 0 ? "groq" : "vllm") : "groq";
      return callLLM(prompt, {
        ...options,
        prefer,
        label: `${options.label || "parallel"}_${i}`,
      });
    })
  );
  return results.map((r) => (r.status === "fulfilled" ? r.value : null));
}

// ─── Utilitaire : état du routeur (pour debug) ────────────────────────────────
export function getRouterStatus() {
  return {
    groq: {
      configured: !!GROQ_API_KEY,
      blocked: routerState.groqBlocked,
      blockedUntil: routerState.groqBlockedUntil
        ? new Date(routerState.groqBlockedUntil).toISOString()
        : null,
    },
    vllm: {
      configured: vllmAvailable,
    },
  };
}