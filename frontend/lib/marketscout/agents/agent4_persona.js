// src/agents/agent4_persona.js
import { callLLM } from "./llmRouter";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stableSeed(str) {
  return str
    .split("")
    .reduce((acc, c) => (Math.imul(acc, 31) + c.charCodeAt(0)) | 0, 0x811c9dc5) >>> 0;
}

function midAge(range) {
  if (!range) return 35;
  const parts = range.split("-").map((s) => parseInt(s.trim(), 10));
  return parts.length === 2
    ? Math.round((parts[0] + parts[1]) / 2)
    : parts[0] || 35;
}

// ─── Mappings visuels ─────────────────────────────────────────────────────────

const PROFESSION_VISUALS = [
  [["médecin", "docteur", "chirurgien", "infirmier"],
    "wearing a white medical coat, stethoscope around neck"],
  [["ingénieur", "développeur", "informaticien", "technicien"],
    "wearing smart casual shirt"],
  [["enseignant", "professeur", "formateur"],
    "wearing neat modest professional clothing"],
  [["artisan", "menuisier", "mécanicien", "plombier", "électricien"],
    "wearing sturdy work clothes, slightly calloused hands"],
  [["commerçant", "vendeur", "épicier"],
    "wearing casual business attire"],
  [["avocat", "notaire", "juriste"],
    "wearing a formal dark suit"],
  [["comptable", "auditeur", "financier", "banquier"],
    "wearing formal business attire"],
  [["architecte", "designer", "graphiste"],
    "wearing modern stylish casual clothes"],
  [["agriculteur", "éleveur"],
    "wearing simple durable rural clothing"],
  [["étudiant"],
    "wearing casual modern clothes, young appearance"],
  [["entrepreneur", "directeur", "manager", "chef"],
    "wearing business casual, confident posture"],
];

function getProfessionHint(profession) {
  if (!profession) return "wearing neat business casual attire";
  const lower = profession.toLowerCase();
  for (const [keywords, hint] of PROFESSION_VISUALS) {
    if (keywords.some((k) => lower.includes(k))) return hint;
  }
  return `wearing professional clothing appropriate for a ${profession}`;
}

const REGION_MAP = [
  [["tunis", "ariana", "ben arous", "manouba", "la marsa", "carthage"],
    { skin: "light Mediterranean complexion", bg: "modern Tunisian city background" }],
  [["sousse", "monastir", "mahdia"],
    { skin: "light olive Mediterranean skin tone", bg: "coastal Tunisian city" }],
  [["sfax"],
    { skin: "olive Mediterranean skin tone", bg: "urban Sfaxian environment" }],
  [["nabeul", "hammamet", "bizerte"],
    { skin: "light olive skin tone with warm undertone", bg: "coastal northern Tunisia" }],
  [["kairouan", "siliana", "zaghouan"],
    { skin: "warm olive skin tone", bg: "central Tunisian landscape" }],
  [["gabes", "medenine", "tataouine", "djerba"],
    { skin: "warm olive to light brown complexion", bg: "southern Tunisian setting" }],
  [["gafsa", "kasserine", "sidi bouzid"],
    { skin: "warm brown complexion", bg: "inland Tunisian environment" }],
  [["jendouba", "kef", "béja"],
    { skin: "warm Mediterranean olive complexion", bg: "northwestern Tunisian countryside" }],
];

function getRegionInfo(region) {
  if (!region) return { skin: "olive Mediterranean complexion", bg: "Tunisian urban background" };
  const lower = region.toLowerCase();
  for (const [keywords, info] of REGION_MAP) {
    if (keywords.some((k) => lower.includes(k))) return info;
  }
  return { skin: "olive Mediterranean complexion", bg: "Tunisian background" };
}

function getFamilyHint(familyStatus) {
  if (!familyStatus) return "";
  const lower = familyStatus.toLowerCase();
  if (lower.includes("enfant") || lower.includes("marié")) return "mature settled appearance";
  if (lower.includes("célibataire")) return "young independent appearance";
  return "";
}

function getExpressionHint(personality) {
  if (!personality) return "slight confident professional smile";
  const lower = personality.toLowerCase();
  if (lower.includes("dynamique") || lower.includes("enthousiaste")) return "energetic warm smile";
  if (lower.includes("calme") || lower.includes("réservé")) return "calm composed expression, subtle smile";
  if (lower.includes("sérieux") || lower.includes("rigoureux")) return "focused serious expression";
  if (lower.includes("créatif")) return "thoughtful creative expression, relaxed smile";
  return "slight professional smile, confident look";
}

// ─── Construction du prompt image ─────────────────────────────────────────────

function buildAvatarPrompt(persona) {
  const age        = midAge(persona.age_range);
  const genderWord = ["femme", "female", "f"].includes(
    (persona.gender || "").toLowerCase()
  ) ? "woman" : "man";

  const { skin, bg } = getRegionInfo(persona.region);
  const clothing      = getProfessionHint(persona.profession);
  const familyHint    = getFamilyHint(persona.family_status);
  const expression    = getExpressionHint(persona.personality);

  const ageFaceHint =
    age < 28 ? "youthful face, smooth skin" :
    age < 40 ? "mature face with youthful features" :
    age < 55 ? "middle-aged face, some natural lines" :
               "older adult face, dignified aging";

  return [
    `photorealistic portrait of a ${age} year old Tunisian ${genderWord}`,
    skin,
    ageFaceHint,
    clothing,
    familyHint,
    expression,
    "natural soft directional lighting",
    "sharp realistic facial features, detailed eyes, realistic skin texture",
    "high resolution DSLR portrait photography, 85mm lens, shallow depth of field",
    bg,
    "hyperrealistic, photographic, 8K",
    "no watermark, no text, no blur, no cartoon, no illustration",
  ].filter(Boolean).join(", ");
}

// ─── Générateurs d'avatar ─────────────────────────────────────────────────────

/**
 * Convertit un Blob en data URL base64 (fonctionne en Node.js et browser).
 */
async function blobToDataUrl(blob) {
  // Environnement Node.js
  if (typeof FileReader === "undefined") {
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return `data:${blob.type};base64,${base64}`;
  }
  // Environnement browser
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Génère l'avatar via Hugging Face Inference API.
 *
 * ✅ 100% gratuit avec un compte HF (https://huggingface.co/join)
 * ✅ Token gratuit sur : https://huggingface.co/settings/tokens
 * ✅ Ajoutez dans .env : HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxx
 *
 * Modèles utilisés par ordre de priorité (tous gratuits) :
 *   1. stabilityai/stable-diffusion-xl-base-1.0  → meilleure qualité
 *   2. Lykon/dreamshaper-8                        → portraits réalistes
 *   3. runwayml/stable-diffusion-v1-5             → rapide, fiable
 */
async function generateAvatarHuggingFace(prompt, seed, onLog) {
  onLog?.("Génération avatar via HuggingFace...");
  try {
    const response = await fetch("/api/avatar/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, seed }),
    });

    if (!response.ok) {
      onLog?.("⚠️ Avatar HF échoué — fallback Pollinations");
      return null;
    }

    const { dataUrl } = await response.json();
    onLog?.("✅ Avatar généré via HuggingFace");
    return dataUrl;

  } catch (e) {
    onLog?.("⚠️ Avatar HF exception — fallback Pollinations");
    return null;
  }
}

/**
 * Fallback : Pollinations.ai — aucune clé requise.
 * Retourne directement une URL (pas de base64).
 */
function generateAvatarPollinations(prompt, seed) {
  return (
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=512&height=512&nologo=true&enhance=true&model=flux&seed=${seed}`
  );
}

// ─── Agent principal ───────────────────────────────────────────────────────────

export async function runAgent4Persona(ctx, onLog) {
  console.log("[Agent4] project_info received:", ctx.project_info);
  onLog("Agent 4 — Génération du persona...");

  const p = ctx.project_info || ctx.userInput || {};

  const llmPrompt = `Tu es un expert marketing spécialisé dans le marché tunisien.
Analyse ce projet startup et génère UN PERSONA CLIENT PRINCIPAL qui soit RÉALISTE et SPÉCIFIQUE à ce projet.

INFORMATIONS DU PROJET :
- Description : ${p.enriched_description || p.description || ""}
- Secteur : ${p.sector || ""}
- Type de client cible : ${p.client_type || ""}
- Région : ${p.location || ""}
- Gamme de prix : ${p.price_range || ""}
- Problème résolu : ${p.problem_solved || ""}
- Ce qui différencie ce projet : ${p.differentiator || ""}

RÈGLES IMPORTANTES :
- Le persona doit être directement lié au secteur et au problème résolu
- L'âge, la profession et le style de vie doivent correspondre LOGIQUEMENT au type de client
- Les points de douleur doivent refléter exactement le problème que le projet résout
- La région doit correspondre à la localisation du projet
- Réponds UNIQUEMENT avec du JSON valide, sans texte autour
- Écris toutes les valeurs des champs en français

FORMAT JSON ATTENDU :
{
  "name": "Prénom et nom typiquement tunisien",
  "age_range": "ex. 28-40",
  "gender": "Homme ou Femme",
  "profession": "profession spécifique liée au secteur",
  "region": "ville tunisienne liée au projet",
  "family_status": "ex. Marié(e), 2 enfants",
  "interests": ["lié au secteur", "lié au problème", "..."],
  "personality": "description courte et réaliste",
  "pains": ["douleur directement liée au problème résolu", "..."],
  "lifestyle": [
    {"time":"6h00","activity":"Réveil","detail":"détail lié à sa vie et sa profession"},
    {"time":"7h30","activity":"Trajet","detail":"..."},
    {"time":"9h00","activity":"Travail","detail":"activité liée à la profession"},
    {"time":"12h30","activity":"Déjeuner","detail":"..."},
    {"time":"15h00","activity":"Après-midi","detail":"..."},
    {"time":"18h00","activity":"Fin de journée","detail":"..."},
    {"time":"21h00","activity":"Soirée","detail":"..."}
  ]
}`;

  const raw = await callLLM(
    "hosted_vllm/Llama-3.1-70B-Instruct",
    [{ role: "user", content: llmPrompt }],
    {
      temperature: 0.7,
      max_tokens: 1000,
      response_format: { type: "json_object" },
    }
  );

  // ── Parse JSON ──────────────────────────────────────────────────────────────
  let persona;
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    persona = JSON.parse(clean);
  } catch (e) {
    onLog("Erreur de parsing JSON — utilisation du fallback persona");
    persona = {
      name: "Persona",
      age_range: "25-45",
      gender: "Femme",
      profession: "Commerciale",
      region: "Tunis",
      lifestyle: [],
    };
  }

  // ── Génération de l'avatar ──────────────────────────────────────────────────
  onLog("Génération de l'avatar...");

  const avatarPrompt = buildAvatarPrompt(persona);
  const seed = stableSeed(
    [persona.name, persona.profession, persona.region, persona.age_range]
      .filter(Boolean).join("-")
  );

  // Stratégie : HF d'abord (meilleure qualité), Pollinations en fallback
  const hfResult = await generateAvatarHuggingFace(avatarPrompt, seed, onLog);

  if (hfResult) {
    persona.avatar_url    = hfResult;       // data URL base64 — intégré, pas de requête externe
    persona.avatar_source = "huggingface";
  } else {
    persona.avatar_url    = generateAvatarPollinations(avatarPrompt, seed);
    persona.avatar_source = "pollinations";
  }

  // Fallback ultime côté client (si l'image ne charge pas du tout)
  persona.avatar_fallback =
    `https://api.dicebear.com/7.x/personas/svg` +
    `?seed=${encodeURIComponent(persona.name || "persona")}&backgroundColor=EEEDFE`;

  ctx.persona = persona;
  onLog(`✅ Agent 4 terminé — ${persona.name} (avatar: ${persona.avatar_source})`);
  return ctx;
}