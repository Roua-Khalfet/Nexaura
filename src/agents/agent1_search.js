// src/agents/agent1_search.js

import { callLLM } from "./llmRouter";

const SERPER_API_KEY = import.meta.env.VITE_SERPER_API_KEY;

const callGroq = (prompt) =>
  callLLM(prompt, { maxTokens: 2000, prefer: "groq", label: "agent1" });

function extractJSON(text) {
  let cleaned = text.replace(/```json|```/g, "").trim();
  const firstBrace   = cleaned.indexOf("{");
  const firstBracket = cleaned.indexOf("[");
  let start = -1;
  if (firstBrace === -1)        start = firstBracket;
  else if (firstBracket === -1) start = firstBrace;
  else                          start = Math.min(firstBrace, firstBracket);
  if (start === -1) throw new Error("Aucun JSON trouvé");
  const isObject = cleaned[start] === "{";
  const end = isObject ? cleaned.lastIndexOf("}") : cleaned.lastIndexOf("]");
  if (end === -1) throw new Error("JSON incomplet");
  return JSON.parse(cleaned.slice(start, end + 1));
}

// ─── Recherche Serper — neutre (pas de filtre hl) ─────────────────────────────
async function serperSearch(query) {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": SERPER_API_KEY },
    body: JSON.stringify({ q: query, num: 8 }),
  });
  if (!res.ok) throw new Error(`Erreur Serper : ${res.status}`);
  const data = await res.json();
  return data.organic || [];
}

// ─── Sites intermédiaires (annuaires, agrégateurs) ────────────────────────────
const INTERMEDIATE_SITES = [
  "tripadvisor", "yelp", "pagejaunes", "pagesjaunes",
  "annuaire", "directory", "top10", "classement",
  "comparateur", "trustpilot", "foursquare",
  "booking.com", "expedia", "zomato", "opentable",
  "google.com/maps", "maps.google", "waze.com",
  "jumia.com", "glovo", "talabat",
  "indeed.com", "glassdoor", "linkedin.com",
  "facebook.com", "instagram.com", "twitter.com", "meta.com",
  "yellow.tn", "tunisie.com", "tayara.tn",
  "agendatn.com", "tustex.com", "mahba",
];

// ─── Domaines bloqués définitivement ─────────────────────────────────────────
const HARD_BLOCKED_DOMAINS = [
  "meta.com", "facebook.com", "messenger.com", "instagram.com",
  "whatsapp.com", "twitter.com", "x.com", "tiktok.com",
  "snapchat.com", "telegram.org", "viber.com", "signal.org",
  "discord.com", "skype.com", "zoom.us",
  "google.com", "apple.com", "microsoft.com", "amazon.com",
  "netflix.com", "spotify.com", "uber.com", "airbnb.com",
  "openai.com", "anthropic.com", "huggingface.co","bing.com",
  "play.google.com", "apps.apple.com",
  "mapcarta.com", "mappy.com", "maps.google.com", "waze.com",
  "openstreetmap.org", "here.com", "mapquest.com",
  "pages24.com", "118000.fr",
  "github.com", "stackoverflow.com", "wikipedia.org",
  "reddit.com", "medium.com", "quora.com",
  "forbes.com", "techcrunch.com", "wired.com",
  "lefigaro.fr", "lemonde.fr", "leparisien.fr",
  "businessnews.com.tn", "webmanagercenter.com",
  "mosaiquefm.net", "kapitalis.com",
  "linkedin.com", "indeed.com", "glassdoor.com",
  "youtube.com", "vimeo.com", "dailymotion.com",
];

const BLOCKED_URL_PATTERNS = [
  "/blog", "/article", "/news", "/actualite", "/post/",
  "annuaire", "directory", "listing", "comparateur",
  "tripadvisor", "yelp", "pagejaunes", "trustpilot",
  "booking.com", "expedia", "foursquare",
  "mapcarta", "mappy", "pages24",
];

function isHardBlocked(url) {
  try {
    const parsed   = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, "").replace(/^www2\./, "").toLowerCase();
    if (HARD_BLOCKED_DOMAINS.some(d => hostname === d || hostname.endsWith("." + d))) return true;
    const fullUrl = url.toLowerCase();
    if (BLOCKED_URL_PATTERNS.some(p => fullUrl.includes(p))) return true;
    return false;
  } catch {
    return true;
  }
}

function isIntermediateSite(url) {
  return INTERMEDIATE_SITES.some(p => url.toLowerCase().includes(p));
}

function isValidCompetitorUrl(url) {
  try { new URL(url); } catch { return false; }
  if (isHardBlocked(url)) return false;
  try {
    const parsed   = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length > 3) return false;
  } catch { return false; }
  return true;
}

function normalizeName(name) {
  return (name || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

function normalizeDomain(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace("www.", "").replace("www2.", "").toLowerCase().trim();
  } catch { return url.toLowerCase(); }
}

// ─── Scraper un site intermédiaire pour en extraire les URLs officielles ──────
async function scrapeForDirectUrls(intermediateUrl) {
  try {
    const res = await fetch(`https://r.jina.ai/${intermediateUrl}`, {
      headers: { "Accept": "text/plain", "X-Timeout": "10" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const content  = await res.text();
    const urlRegex = /https?:\/\/[^\s\)\"\'\<\>]+/g;
    const found    = content.match(urlRegex) || [];

    const directUrls = found
      .filter(url => {
        if (isHardBlocked(url)) return false;
        try {
          const parsed   = new URL(url);
          const segments = parsed.pathname.split("/").filter(Boolean);
          if (segments.length > 2) return false;
          return true;
        } catch { return false; }
      })
      .map(url => { try { return new URL(url).origin; } catch { return null; } })
      .filter(Boolean);

    return [...new Set(directUrls)].slice(0, 5);
  } catch (e) {
    console.warn(`Scraping intermédiaire échoué :`, e.message);
    return [];
  }
}

// ─── Dédoublonnage et fusion ──────────────────────────────────────────────────
function deduplicateAndMerge(competitors) {
  const merged = [];
  for (const comp of competitors) {
    const normName   = normalizeName(comp.name);
    const normDomain = normalizeDomain(comp.url);
    const existingIdx = merged.findIndex(m =>
      normalizeName(m.name) === normName ||
      normalizeDomain(m.url) === normDomain ||
      normName.includes(normalizeName(m.name)) ||
      normalizeName(m.name).includes(normName)
    );
    if (existingIdx === -1) {
      merged.push({ ...comp });
    } else {
      const existing = merged[existingIdx];
      if (comp.name.length < existing.name.length) existing.name = comp.name;
      if (normalizeDomain(comp.url).length < normalizeDomain(existing.url).length)
        existing.url = comp.url;
      if ((comp.pertinence_score || 0) > (existing.pertinence_score || 0))
        existing.pertinence_score = comp.pertinence_score;
      if (comp.description && comp.description !== existing.description)
        existing.description = existing.description + " | " + comp.description;
      merged[existingIdx] = existing;
      console.log(`Fusionné : "${comp.name}" → "${existing.name}"`);
    }
  }
  return merged;
}

// ─── Validation finale du secteur ────────────────────────────────────────────
const MIN_COMPETITORS = 3;

async function validateSectorMatch(competitors, sector, description, activityKeywords, onStep) {
  if (competitors.length === 0) return [];
  if (competitors.length <= MIN_COMPETITORS) {
    onStep(`Validation souple : ${competitors.length} concurrents, seuil minimum atteint — tous conservés`);
    return competitors;
  }

  onStep("Validation finale du secteur (2ème passe)...");

  const listForValidation = competitors.map((c, i) =>
    `INDEX_${i} | Nom : "${c.name}" | Description : "${c.description}" | Score : ${c.pertinence_score}/10`
  ).join("\n");

  const validationPrompt = `
Tu es un expert en analyse concurrentielle. Sois STRICT et PRÉCIS.

PROJET : "${description}"
SECTEUR EXACT : "${sector}"
MOTS-CLÉS : ${activityKeywords.join(", ")}

Entreprises candidates :
${listForValidation}

MISSION : Garde UNIQUEMENT les entreprises dont l'activité PRINCIPALE est EXACTEMENT "${sector}".

RÈGLES DE REJET STRICTES — rejette immédiatement si L'UN de ces critères s'applique :
1. L'entreprise est une plateforme tech mondiale, un réseau social ou une appli de messagerie
   (Facebook, Messenger, WhatsApp, Instagram, Telegram, Google, etc.) → TOUJOURS REJETER
2. L'activité principale de l'entreprise est différente de "${sector}", même si elle a un lien tangentiel
3. L'entreprise est un service cartographique, annuaire, agrégateur ou site de listing → TOUJOURS REJETER
4. L'entreprise est un site d'actualités, blog ou média → TOUJOURS REJETER

ACCEPTE seulement si l'entreprise :
- A "${sector}" comme activité principale et centrale
- Est une vraie entreprise locale ou régionale opérant dans le même espace
- Serait un concurrent direct que le projet va réellement affronter

Tu DOIS conserver au minimum ${MIN_COMPETITORS} concurrents. Si après filtrage strict il en reste moins de
${MIN_COMPETITORS}, garde les meilleurs par score plutôt que d'accepter des non-pertinents.

Réponds avec ce JSON :
{
  "validated": [
    {
      "index": 0,
      "is_true_competitor": true,
      "rejection_reason": null
    }
  ]
}
  `.trim();

  try {
    const raw    = await callGroq(validationPrompt);
    const parsed = extractJSON(raw);
    const validated = parsed.validated || [];

    let kept = competitors.filter((_, i) => {
      const v = validated.find(v => v.index === i);
      return !v || v.is_true_competitor !== false;
    });

    if (kept.length < MIN_COMPETITORS) {
      onStep(`Validation trop stricte — conservation des ${MIN_COMPETITORS} meilleurs par score`);
      kept = competitors
        .sort((a, b) => (b.pertinence_score || 0) - (a.pertinence_score || 0))
        .slice(0, MIN_COMPETITORS);
    }

    onStep(`Validation terminée — ${kept.length}/${competitors.length} conservés`);
    return kept;
  } catch (e) {
    onStep(`Erreur de validation — tous conservés : ${e.message}`);
    return competitors;
  }
}

// ─── Agent 1 principal ────────────────────────────────────────────────────────
export async function runAgent1(context, onStep) {
  const { description, location, sector } = context.project_info;

  onStep("Génération des requêtes de recherche...");

  // ── Étape 1 : Générer des requêtes multilingues ciblant les sites officiels ──
  const queryPrompt = `
Tu es un expert en veille concurrentielle.

Idée de startup :
- Description : ${description}
- SECTEUR EXACT : ${sector}
- Localisation : ${location}
- Client : ${context.project_info.client_type}
- Prix : ${context.project_info.price_range}

Génère 6 requêtes Google très ciblées pour trouver les SITES OFFICIELS des entreprises LOCALES
qui font EXACTEMENT "${sector}" à ${location}.

RÈGLES IMPORTANTES pour les requêtes :
- Cibler uniquement les sites officiels d'entreprises (pas les annuaires, cartes, réseaux sociaux, ni agrégateurs)
- Ajouter des termes comme "site officiel", "official website" pour éviter les résultats d'annuaires ou de cartes
- NE PAS cibler les plateformes mondiales ou applis de messagerie — uniquement les entreprises locales/régionales en "${sector}"
- Chaque requête doit inclure la localisation "${location}"

EXIGENCE MULTILINGUE — génère des requêtes dans les 3 langues :
- 2 requêtes en FRANÇAIS  (mots-clés sectoriels français + "site officiel")
- 2 requêtes en ARABE     (mots-clés sectoriels arabes)
- 2 requêtes en ANGLAIS   (mots-clés sectoriels anglais + "official website")

Réponds avec ce JSON :
{
  "queries": ["requete_fr_1", "requete_fr_2", "requete_ar_1", "requete_ar_2", "requete_en_1", "requete_en_2"],
  "activity_keywords": ["mot-clé 1", "mot-clé 2", "mot-clé 3"]
}
  `.trim();

  const queriesRaw       = await callGroq(queryPrompt);
  const queriesData      = extractJSON(queriesRaw);
  const queries          = queriesData.queries || [];
  const activityKeywords = queriesData.activity_keywords || [sector.toLowerCase()];

  const forcedQueries = queries.map(q =>
    q.toLowerCase().includes(location.toLowerCase()) ? q : `${q} ${location}`
  );

  onStep(`Requêtes : ${forcedQueries.join(" | ")}`);

  // ── Étape 2 : Recherche Serper (neutre) ──
  onStep("Recherche Google via Serper (multilingue)...");

  const allResults = [];
  for (const query of forcedQueries) {
    try {
      const results = await serperSearch(query);
      allResults.push(...results);
      onStep(`OK "${query}" → ${results.length} résultats`);
    } catch (e) {
      onStep(`Échec "${query}" — ${e.message}`);
    }
  }

  const seen = new Set();
  const uniqueResults = allResults.filter(r => {
    if (!r.link || seen.has(r.link)) return false;
    seen.add(r.link);
    return true;
  });

  onStep(`${uniqueResults.length} résultats uniques`);

  // ── Étape 3 : Traitement des URLs — filtre dur en premier ──
  onStep("Traitement des URLs...");

  const processedResults = [];
  const processedDomains = new Set();

  for (const result of uniqueResults) {
    const url = result.link;

    if (isHardBlocked(url) && !isIntermediateSite(url)) {
      onStep(`  Bloqué définitivement : ${url}`);
      continue;
    }

    if (isIntermediateSite(url)) {
      onStep(`Site intermédiaire : ${url} — extraction des URLs officielles...`);
      const directUrls = await scrapeForDirectUrls(url);
      if (directUrls.length > 0) {
        onStep(`${directUrls.length} URL(s) officielle(s) extraite(s)`);
        for (const directUrl of directUrls) {
          const domain = normalizeDomain(directUrl);
          if (isValidCompetitorUrl(directUrl) && !processedDomains.has(domain)) {
            processedDomains.add(domain);
            processedResults.push({
              url: directUrl,
              title: result.title,
              snippet: result.snippet || "",
              source: "extracted_from_intermediate",
            });
          }
        }
      } else {
        onStep(`Aucune URL officielle trouvée dans ${url} — ignoré`);
      }
    } else if (isValidCompetitorUrl(url)) {
      const domain = normalizeDomain(url);
      if (!processedDomains.has(domain)) {
        processedDomains.add(domain);
        processedResults.push({
          url,
          title: result.title,
          snippet: result.snippet || "",
          source: "direct",
        });
      }
    }
  }

  onStep(`${processedResults.length} URL(s) retenues après filtrage`);

  if (processedResults.length === 0) {
    throw new Error("Aucun résultat trouvé. Essayez de modifier la description.");
  }

  // ── Étape 4 : Scoring LLM — même secteur uniquement ──
  onStep("Identification et scoring des concurrents...");

  const sitesForGroq = processedResults
    .map((r, i) => `INDEX_${i} | Titre : ${r.title} | Description : ${r.snippet}`)
    .join("\n");

  const structurePrompt = `
Tu es un expert en analyse de marché. Sois STRICT sur la correspondance sectorielle.

PROJET : "${description}"
SECTEUR EXACT : "${sector}"
MOTS-CLÉS ACTIVITÉ : ${activityKeywords.join(", ")}
LOCALISATION : ${location}

Sites trouvés (les titres/snippets peuvent être en français, arabe ou anglais — évalue-les tous de la même façon) :
${sitesForGroq}

OBJECTIF : Trouver les CONCURRENTS DIRECTS — entreprises dont l'activité PRINCIPALE est EXACTEMENT "${sector}".

RÈGLES DE REJET STRICTES (is_same_sector = false) — à appliquer sans exception :
1. Plateformes tech mondiales, réseaux sociaux, applis de messagerie (Facebook, WhatsApp, Instagram, Telegram, Google, Apple, Microsoft, etc.) → TOUJOURS REJETER
2. Services cartographiques, annuaires, sites de listing, agrégateurs (Mapcarta, Mappy, TripAdvisor…) → TOUJOURS REJETER
3. Sites d'actualités, blogs, médias → TOUJOURS REJETER
4. Entreprises dont l'activité principale est différente de "${sector}" → REJETER
   Exemple : si le secteur est "salle de sport / fitness", rejeter les applis de messagerie, livraison de nourriture, etc.

ACCEPTER uniquement les vraies entreprises LOCALES/RÉGIONALES dans l'espace "${sector}".
Ne pas pénaliser une entreprise parce que son site est en français, arabe ou autre langue.

SCORE (1-10) :
- 8-10 : concurrent direct parfait, même activité, même zone
- 6-7  : concurrent direct, zone proche ou segment légèrement différent
- 4-5  : concurrent partiel (même secteur large, activité légèrement différente)
- < 4  : hors secteur → mettre is_same_sector = false

Tu dois identifier au moins ${MIN_COMPETITORS} vrais concurrents si les données le permettent.

Réponds avec ce JSON :
{
  "selected": [
    {
      "index": 0,
      "name": "Nom de l'entreprise",
      "description": "Ce que fait cette entreprise",
      "why_competitor": "Pourquoi c'est un concurrent direct en ${sector}",
      "pertinence_score": 8,
      "is_same_sector": true,
      "is_local": true
    }
  ]
}
  `.trim();

  const structuredRaw = await callGroq(structurePrompt);
  const parsed        = extractJSON(structuredRaw);
  const selected      = parsed.selected || [];

  // ── Étape 5 : Reconstruction — seuil adaptatif ──
  let rawCompetitors = buildCompetitors(selected, processedResults, 6);

  if (rawCompetitors.length < MIN_COMPETITORS) {
    onStep(`Seulement ${rawCompetitors.length} concurrents au seuil 6 — élargissement à 4...`);
    rawCompetitors = buildCompetitors(selected, processedResults, 4);
  }

  // ── Étape 6 : Dédoublonnage ──
  onStep("Dédoublonnage et fusion des doublons...");
  const deduped = deduplicateAndMerge(rawCompetitors);

  // ── Étape 7 : Validation finale du secteur (stricte) ──
  const validated = await validateSectorMatch(
    deduped, sector, description, activityKeywords, onStep
  );

  // ── Étape 8 : Tri final — top 4 ──
  const competitors = validated
    .sort((a, b) => (b.pertinence_score || 0) - (a.pertinence_score || 0))
    .slice(0, 4);

  console.log("=== Concurrents finaux ===");
  competitors.forEach(c =>
    console.log(`[${c.pertinence_score}/10] ${c.name} → ${c.url} (${c.source_type})`)
  );

  context.competitors = competitors;
  onStep(`Agent 1 terminé — ${competitors.length} concurrent(s) identifié(s)`);
  return context;
}

// ─── Helper : construction de la liste de concurrents selon un seuil de score ──
function buildCompetitors(selected, processedResults, minScore) {
  return selected
    .filter(s => {
      const idx = typeof s.index === "number" ? s.index : parseInt(s.index);
      return !isNaN(idx) &&
             idx >= 0 &&
             idx < processedResults.length &&
             s.is_same_sector === true &&
             (s.pertinence_score || 0) >= minScore;
    })
    .map(s => {
      const idx = typeof s.index === "number" ? s.index : parseInt(s.index);
      return {
        name:             s.name,
        url:              processedResults[idx].url,
        description:      s.description,
        relevance:        s.why_competitor,
        pertinence_score: s.pertinence_score || minScore,
        is_well_known:    true,
        source_type:      processedResults[idx].source,
      };
    });
}