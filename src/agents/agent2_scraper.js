// src/agents/agent2_scraper.js

import { callLLM } from "./llmRouter";

const callGroq = (prompt, maxTokens = 2000) =>
  callLLM(prompt, { maxTokens, prefer: "groq", label: "agent2" });

function extractJSON(text) {
  let cleaned = text.replace(/```json|```/g, "").trim();
  const firstBrace = cleaned.indexOf("{");
  const firstBracket = cleaned.indexOf("[");
  let start = -1;
  if (firstBrace === -1) start = firstBracket;
  else if (firstBracket === -1) start = firstBrace;
  else start = Math.min(firstBrace, firstBracket);
  if (start === -1) throw new Error("Aucun JSON trouvé");
  const isObject = cleaned[start] === "{";
  const end = isObject ? cleaned.lastIndexOf("}") : cleaned.lastIndexOf("]");
  if (end === -1) throw new Error("JSON incomplet");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function cleanUrl(url) {
  try {
    if (url.includes("localhost") || url.startsWith("http://localhost")) {
      return null;
    }
    const parsed = new URL(url);
    const trackingParams = [
      "srsltid", "utm_source", "utm_medium", "utm_campaign",
      "utm_term", "utm_content", "gclid", "fbclid", "ref",
      "source", "medium", "campaign",
    ];
    trackingParams.forEach(p => parsed.searchParams.delete(p));
    return parsed.toString();
  } catch {
    return null;
  }
}

// ─── Scraping Jina — neutre en langue ────────────────────────────────────────
async function scrapeWithJina(url) {
  const cleanedUrl = cleanUrl(url);
  if (!cleanedUrl) {
    console.warn(`URL invalide ignorée : ${url}`);
    return null;
  }
  try {
    const res = await fetch(`https://r.jina.ai/${cleanedUrl}`, {
      headers: {
        "Accept": "text/plain",
        "X-Timeout": "15",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Statut ${res.status}`);
    return await res.text();
  } catch (e) {
    console.warn(`Jina échoué pour ${cleanedUrl} :`, e.message);
    return null;
  }
}

function extractInternalLinks(content, baseUrl) {
  try {
    const base = new URL(baseUrl);
    const links = new Set();
    const urlRegex = /https?:\/\/[^\s\)\"\'\<\>]+/g;
    const found = content.match(urlRegex) || [];
    for (const url of found) {
      try {
        const parsed = new URL(url);
        if (parsed.hostname === base.hostname) {
          const path = parsed.pathname.toLowerCase();
          if (
            !path.match(/\.(jpg|jpeg|png|gif|svg|css|js|ico|pdf|zip|mp4|webp)$/) &&
            !path.includes("#") &&
            path !== "/" &&
            path.length < 50
          ) {
            links.add(parsed.origin + parsed.pathname);
          }
        }
      } catch { }
    }
    return [...links].slice(0, 3);
  } catch {
    return [];
  }
}

async function scrapeMultiplePages(baseUrl, onStep) {
  const pages = [];
  const cleanedBaseUrl = cleanUrl(baseUrl);
  if (!cleanedBaseUrl) {
    onStep(`  URL invalide ignorée : ${baseUrl}`);
    return pages;
  }

  onStep(`  Scraping : ${cleanedBaseUrl}`);
  const homeContent = await scrapeWithJina(cleanedBaseUrl);

  if (!homeContent || homeContent.length < 100) {
    try {
      const parsed = new URL(cleanedBaseUrl);
      const rootUrl = parsed.origin;
      if (rootUrl !== cleanedBaseUrl) {
        onStep(`  Nouvelle tentative avec le domaine racine : ${rootUrl}`);
        const rootContent = await scrapeWithJina(rootUrl);
        if (rootContent && rootContent.length > 100) {
          pages.push({ path: "/", url: rootUrl, content: rootContent, length: rootContent.length });
          onStep(`  OK domaine racine — ${rootContent.length} caractères`);
          return pages;
        }
      }
    } catch { }
    onStep(`  Site inaccessible`);
    return pages;
  }

  pages.push({ path: "/", url: cleanedBaseUrl, content: homeContent, length: homeContent.length });
  onStep(`  OK page principale — ${homeContent.length} caractères`);

  const internalLinks = extractInternalLinks(homeContent, cleanedBaseUrl);
  for (const link of internalLinks.slice(0, 3)) {
    try {
      const content = await scrapeWithJina(link);
      if (content && content.length > 200) {
        pages.push({ path: new URL(link).pathname, url: link, content, length: content.length });
        onStep(`  OK ${new URL(link).pathname} — ${content.length} caractères`);
      }
      await new Promise(r => setTimeout(r, 400));
    } catch { }
  }

  return pages;
}

// ─── Structuration + traduction en français ───────────────────────────────────
async function structureAllContent(competitor, pages, projectInfo) {
  if (pages.length === 0) return buildEmptyResult(competitor, "failed");

  const fullContent = pages
    .map(p => `\n\n=== PAGE : ${p.url} ===\n${p.content}`)
    .join("\n")
    .slice(0, 6000);

  const prompt = `
Tu es un expert en analyse de marché. Ta tâche comporte DEUX parties également importantes :
1. Analyser le contenu du site web fourni ci-dessous.
2. TOUT PRODUIRE EN FRANÇAIS — quelle que soit la langue originale du site
   (français, arabe, anglais ou autre). Chaque champ du JSON doit être écrit en français.
   Traduis fidèlement : ne résume pas ni n'omets d'information parce qu'elle est dans une autre langue.

Site : "${competitor.name}" (${competitor.url})
Secteur : ${projectInfo.sector} | Zone : ${projectInfo.location}

CONTENU BRUT DU SITE (peut être en français, arabe, anglais ou mixte) :
"""
${fullContent}
"""

Extrais TOUTES les informations disponibles et traduis tout en français.

Réponds avec ce JSON (toutes les valeurs en français) :
{
  "name": "${competitor.name}",
  "url": "${competitor.url}",
  "scrape_status": "success",
  "general": {
    "description": "Description complète en français",
    "mission": "Mission ou slogan en français",
    "founded": "Année ou vide",
    "headquarters": "Siège social en français ou vide",
    "team_size": "Taille de l'équipe ou vide"
  },
  "pricing": {
    "model": "freemium | subscription | commission | one_time | free | non_mentionne",
    "plans": [{ "name": "Nom du plan en français", "price": "Prix", "features": ["fonctionnalité en français"] }],
    "price_range": "Fourchette ou vide",
    "details": "Détails tarifaires en français"
  },
  "services": [{ "name": "Nom du service en français", "description": "Description en français" }],
  "features": [{ "name": "Nom de la fonctionnalité en français", "description": "Description en français" }],
  "target_clients": {
    "segments": ["segment en français"],
    "demographics": "Description en français",
    "geography": "Zone en français",
    "client_type": "B2B | B2C | B2B2C"
  },
  "marketing": {
    "value_proposition": "Proposition de valeur en français",
    "differentiators": ["différenciateur en français"],
    "channels": ["canal en français"],
    "social_media": {}
  },
  "technical": { "platforms": [], "technologies": [] },
  "contact": { "email": "", "phone": "", "address": "" },
  "competitive_analysis": {
    "strengths": ["force en français"],
    "weaknesses": ["faiblesse en français"],
    "opportunities": ["opportunité en français"],
    "threats": ["menace en français"]
  },
  "opportunities_for_competitors": ["opportunité en français"],
  "threats_for_competitors": ["menace en français"],
  "content_summary": "Résumé en 3 phrases en français",
  "data_completeness_score": 7
}
  `.trim();

  try {
    const raw = await callGroq(prompt, 3000);
    const parsed = extractJSON(raw);
    parsed.pages_scraped = pages.map(p => ({ url: p.url, path: p.path, length: p.length }));
    parsed.total_content_length = pages.reduce((acc, p) => acc + p.length, 0);
    return parsed;
  } catch (e) {
    return buildEmptyResult(competitor, "extraction_failed");
  }
}

function calculateCompletenessScore(structured) {
  let score = 0;
  if (structured.general?.description && structured.general.description.length > 30) score += 2;
  if (structured.general?.founded && structured.general.founded !== "") score += 1;
  if (structured.general?.headquarters && structured.general.headquarters !== "") score += 1;
  if (structured.pricing?.model && structured.pricing.model !== "non_mentionne") score += 1;
  if (structured.pricing?.price_range && structured.pricing.price_range !== "") score += 1;
  if (structured.services && structured.services.length > 0) score += 1;
  if (structured.services && structured.services.length >= 3) score += 1;
  if (structured.competitive_analysis?.strengths?.length > 0) score += 1;
  if (structured.competitive_analysis?.weaknesses?.length > 0) score += 1;
  if (structured.contact?.email && structured.contact.email !== "") score += 0.5;
  if (structured.contact?.phone && structured.contact.phone !== "") score += 0.5;
  if (structured.marketing?.value_proposition && structured.marketing.value_proposition.length > 20) score += 1;
  if (structured.target_clients?.segments?.length > 0) score += 1;
  return Math.min(Math.round(score), 10);
}

function buildEmptyResult(competitor, status) {
  return {
    name: competitor.name,
    url: competitor.url,
    scrape_status: status,
    general: { description: "", mission: "", founded: "", headquarters: "", team_size: "" },
    pricing: { model: "non_mentionne", plans: [], price_range: "", details: "" },
    services: [],
    features: [],
    target_clients: { segments: [], demographics: "", geography: "", client_type: "" },
    marketing: { value_proposition: "", differentiators: [], channels: [], social_media: {} },
    technical: { platforms: [], technologies: [] },
    contact: { email: "", phone: "", address: "" },
    competitive_analysis: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
    opportunities_for_competitors: [],
    threats_for_competitors: [],
    content_summary: "",
    pages_scraped: [],
    total_content_length: 0,
    data_completeness_score: 0,
  };
}

// ─── Agent 2 principal ────────────────────────────────────────────────────────
export async function runAgent2(context, onStep) {
  onStep(`Démarrage du scraping de ${context.competitors.length} site(s)...`);

  const competitors_raw = [];
  const competitors_structured_all = [];

  for (let i = 0; i < context.competitors.length; i++) {
    const competitor = context.competitors[i];

    const cleanedUrl = cleanUrl(competitor.url);
    if (!cleanedUrl) {
      onStep(`[${i + 1}/${context.competitors.length}] URL invalide ignorée : ${competitor.name} (${competitor.url})`);
      competitors_raw.push({
        name: competitor.name,
        url: competitor.url,
        scraped_at: new Date().toISOString(),
        scraped: false,
        total_pages: 0,
        total_characters: 0,
        pages: [],
        skip_reason: "URL invalide (localhost ou malformée)",
      });
      competitors_structured_all.push(buildEmptyResult(competitor, "failed"));
      continue;
    }

    competitor.url = cleanedUrl;
    onStep(`[${i + 1}/${context.competitors.length}] ${competitor.name} — ${cleanedUrl}`);

    const pages = await scrapeMultiplePages(cleanedUrl, onStep);
    const totalChars = pages.reduce((acc, p) => acc + p.length, 0);

    competitors_raw.push({
      name: competitor.name,
      url: cleanedUrl,
      scraped_at: new Date().toISOString(),
      scraped: pages.length > 0,
      total_pages: pages.length,
      total_characters: totalChars,
      pages: pages.map(p => ({ path: p.path, url: p.url, content: p.content, length: p.length })),
    });

    onStep(`Structuration et traduction de ${competitor.name}...`);
    const structured = await structureAllContent(competitor, pages, context.project_info);

    const completenessScore = calculateCompletenessScore(structured);
    structured.data_completeness_score = completenessScore;
    structured.pertinence_score = competitor.pertinence_score || 5;

    onStep(`${competitor.name} — statut : ${structured.scrape_status} | complétude : ${completenessScore}/10`);
    competitors_structured_all.push(structured);
    await new Promise(r => setTimeout(r, 800));
  }

  const MIN_COMPLETENESS = 2;
  const competitors_structured = competitors_structured_all.filter(c => {
    if (c.scrape_status === "failed" && c.data_completeness_score < MIN_COMPLETENESS) {
      onStep(`Exclu (échec total) : ${c.name}`);
      return false;
    }
    return true;
  });

  competitors_structured.sort((a, b) => {
    const scoreA = (a.data_completeness_score || 0) * 2 + (a.pertinence_score || 0);
    const scoreB = (b.data_completeness_score || 0) * 2 + (b.pertinence_score || 0);
    return scoreB - scoreA;
  });

  const successCount = competitors_structured.filter(c => c.scrape_status === "success").length;
  onStep(`Agent 2 terminé — ${successCount}/${context.competitors.length} scraping(s) réussi(s)`);
  onStep(`${competitors_structured.length} concurrent(s) conservé(s) après filtrage`);

  context.competitors_raw = competitors_raw;
  context.competitors_structured = competitors_structured;
  return context;
}

// ─── A2A ──────────────────────────────────────────────────────────────────────
export async function respondToAgent3(question, context, iteration = 1) {
  const scrapedData = context.competitors_structured
    ?.filter(c => c.scrape_status === "success")
    .map(c => ({
      name: c.name,
      url: c.url,
      services: c.services?.map(s => typeof s === "object" ? s.name : s) || [],
      weaknesses: c.competitive_analysis?.weaknesses || [],
      strengths: c.competitive_analysis?.strengths || [],
      pricing: c.pricing?.price_range || "N/A",
      target_clients: c.target_clients?.segments || [],
      value_proposition: c.marketing?.value_proposition || "",
      opportunities_for_competitors: c.opportunities_for_competitors || [],
      threats_for_competitors: c.threats_for_competitors || [],
      content_summary: c.content_summary || "",
    })) || [];

  const prompt = `
Tu es l'Agent 2 spécialisé dans le scraping web et l'analyse concurrentielle.
Question de l'Agent 3 : "${question}"
Données disponibles (${scrapedData.length} sites) :
${JSON.stringify(scrapedData, null, 2)}

Toutes les données ont déjà été traduites en français. Réponds en français.

Réponds avec ce JSON :
{
  "agent": "agent2_scraping",
  "iteration": ${iteration},
  "question": "${question}",
  "data_quality": "suffisant | insuffisant",
  "missing_info": "Ce qui manque",
  "opportunities": [
    { "point": "Opportunité", "detail": "Explication", "based_on_competitor": "Nom", "evidence": "Preuve", "impact": "élevé | moyen | faible" }
  ],
  "threats": [
    { "point": "Menace", "detail": "Explication", "based_on_competitor": "Nom", "evidence": "Preuve", "impact": "élevé | moyen | faible" }
  ]
}
  `.trim();

  const raw = await callLLM(prompt, { maxTokens: 2000, prefer: "groq", label: "agent2_a2a" });
  return extractJSON(raw);
}