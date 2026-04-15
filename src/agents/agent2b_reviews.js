// src/agents/agent2b_reviews.js

import { callLLM } from "./llmRouter";

const SERPER_API_KEY = import.meta.env.VITE_SERPER_API_KEY;

const callGroq = (prompt, maxTokens = 2000) =>
  callLLM(prompt, { maxTokens, prefer: "groq", label: "agent2b" });

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

async function serperSearch(query) {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": SERPER_API_KEY },
    body: JSON.stringify({ q: query, num: 5 }),
  });
  if (!res.ok) throw new Error(`Erreur Serper : ${res.status}`);
  const data = await res.json();
  return data.organic || [];
}

async function scrapeWithJina(url) {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        "Accept": "text/plain",
        "X-Timeout": "15",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Statut ${res.status}`);
    const text = await res.text();
    return text.slice(0, 4000);
  } catch (e) {
    return null;
  }
}

async function getGoogleMapsReviews(competitorName, location, onStep) {
  onStep(`  Google Maps : "${competitorName}"...`);
  try {
    const res = await fetch("https://google.serper.dev/maps", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": SERPER_API_KEY },
      body: JSON.stringify({ q: `${competitorName} ${location}`, num: 3 }),
    });
    if (!res.ok) throw new Error(`Erreur Serper Maps : ${res.status}`);
    const data = await res.json();
    const places = data.places || [];
    if (places.length === 0) return null;
    const place = places[0];
    onStep(`  Maps trouvé : ${place.title} — ${place.rating}/5`);

    let reviewsContent = null;
    if (place.cid) {
      reviewsContent = await scrapeWithJina(
        `https://www.google.com/maps/place/?q=place_id:${place.cid}`
      );
    }
    return {
      source: "google_maps",
      place_name: place.title,
      rating: place.rating,
      review_count: place.reviewCount || 0,
      address: place.address || "",
      reviews_content: reviewsContent,
    };
  } catch (e) {
    onStep(`  Erreur Maps : ${e.message}`);
    return null;
  }
}

async function getFacebookReviews(competitorName, location, onStep) {
  onStep(`  Facebook : "${competitorName}"...`);
  try {
    const queries = [
      `${competitorName} ${location} site:facebook.com avis`,
      `${competitorName} ${location} site:facebook.com تقييم`,
      `${competitorName} ${location} site:facebook.com reviews`,
    ];

    for (const query of queries) {
      try {
        const results = await serperSearch(query);
        const fbResult = results.find(r =>
          r.link?.includes("facebook.com") &&
          !r.link?.includes("facebook.com/watch") &&
          !r.link?.includes("facebook.com/groups")
        );
        if (fbResult) {
          onStep(`  Facebook : ${fbResult.link}`);
          const content = await scrapeWithJina(fbResult.link);
          return { source: "facebook", url: fbResult.link, content, snippet: fbResult.snippet || "" };
        }
      } catch { /* essayer la requête suivante */ }
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function getWebsiteTestimonials(competitor, onStep) {
  onStep(`  Témoignages site : "${competitor.name}"...`);
  try {
    const paths = [
      "/temoignages", "/testimonials", "/avis", "/reviews",
      "/clients", "/آراء", "/شهادات",
    ];
    const baseUrl = competitor.url.replace(/\/$/, "");
    for (const path of paths) {
      const content = await scrapeWithJina(baseUrl + path);
      if (content && content.length > 300) {
        onStep(`  Témoignages trouvés : ${path}`);
        return { source: "website", url: baseUrl + path, content };
      }
      await new Promise(r => setTimeout(r, 300));
    }
    const homeContent = await scrapeWithJina(competitor.url);
    if (homeContent && (
      homeContent.toLowerCase().includes("temoignage") ||
      homeContent.toLowerCase().includes("avis client") ||
      homeContent.toLowerCase().includes("testimonial") ||
      homeContent.toLowerCase().includes("customer review") ||
      homeContent.includes("تقييم") ||
      homeContent.includes("آراء العملاء")
    )) {
      return { source: "website", url: competitor.url, content: homeContent };
    }
    return null;
  } catch (e) {
    return null;
  }
}

// ─── Analyse des avis + traduction en français ────────────────────────────────
async function analyzeReviews(competitor, sources, projectInfo) {
  const sourcesContent = sources
    .filter(s => s !== null)
    .map(s => {
      if (s.source === "google_maps") return `=== GOOGLE MAPS (${s.rating}/5, ${s.review_count} avis) ===\n${s.reviews_content || ""}`;
      if (s.source === "facebook") return `=== FACEBOOK ===\n${s.content || s.snippet}`;
      if (s.source === "website") return `=== SITE WEB ===\n${s.content}`;
      return "";
    })
    .join("\n\n")
    .slice(0, 5000);

  if (!sourcesContent.trim()) return buildEmptyReviewResult(competitor);

  const prompt = `
Tu es un expert en analyse de sentiment et en veille concurrentielle.
Ta tâche comporte DEUX parties également importantes :
1. Analyser les avis de "${competitor.name}" dans le secteur ${projectInfo.sector}.
2. TOUT PRODUIRE EN FRANÇAIS — quelle que soit la langue originale des avis
   (français, arabe, anglais ou autre). Chaque champ, chaque citation, chaque label doit être en français.
   Traduis fidèlement : n'omets pas d'information parce qu'elle est dans une autre langue.

AVIS BRUTS (peuvent être en français, arabe, anglais ou mélangés) :
"""
${sourcesContent}
"""

Réponds avec ce JSON (toutes les valeurs en français) :
{
  "competitor_name": "${competitor.name}",
  "overall_sentiment": "positif | négatif | mixte | neutre",
  "rating_summary": { "google_maps": "note/5 ou N/A", "total_reviews_found": 0 },
  "perceived_strengths": [
    { "point": "Force perçue en français", "frequency": "Souvent | Parfois | Rarement", "quotes": ["citation traduite en français"], "source": "google_maps | facebook | website" }
  ],
  "perceived_weaknesses": [
    { "point": "Faiblesse perçue en français", "frequency": "Souvent | Parfois | Rarement", "quotes": ["plainte traduite en français"], "source": "google_maps | facebook | website" }
  ],
  "common_complaints": ["plainte en français"],
  "common_praises": ["éloge en français"],
  "customer_expectations": ["attente en français"],
  "opportunities_for_us": ["Opportunité pour notre startup en français"],
  "threats_for_us": ["Menace basée sur les forces du concurrent en français"],
  "sources_used": ["google_maps", "facebook", "website"]
}
  `.trim();

  try {
    const raw = await callGroq(prompt, 2500);
    return extractJSON(raw);
  } catch (e) {
    return buildEmptyReviewResult(competitor);
  }
}

function buildEmptyReviewResult(competitor) {
  return {
    competitor_name: competitor.name,
    overall_sentiment: "neutre",
    rating_summary: { google_maps: "N/A", total_reviews_found: 0 },
    perceived_strengths: [],
    perceived_weaknesses: [],
    common_complaints: [],
    common_praises: [],
    customer_expectations: [],
    opportunities_for_us: [],
    threats_for_us: [],
    sources_used: [],
  };
}

// ─── Agent 2B principal ───────────────────────────────────────────────────────
export async function runAgent2B(context, onStep) {
  onStep(`Démarrage de l'Agent 2B — Avis clients (${context.competitors.length} concurrent(s))...`);

  const reviews_analysis = [];

  for (let i = 0; i < context.competitors.length; i++) {
    const competitor = context.competitors[i];
    onStep(`[${i + 1}/${context.competitors.length}] Avis : ${competitor.name}`);

    const [googleMaps, facebook, website] = await Promise.allSettled([
      getGoogleMapsReviews(competitor.name, context.project_info.location, onStep),
      getFacebookReviews(competitor.name, context.project_info.location, onStep),
      getWebsiteTestimonials(competitor, onStep),
    ]);

    const sources = [
      googleMaps.status === "fulfilled" ? googleMaps.value : null,
      facebook.status === "fulfilled" ? facebook.value : null,
      website.status === "fulfilled" ? website.value : null,
    ].filter(Boolean);

    onStep(`  ${sources.length} source(s) pour ${competitor.name}`);

    const analysis = await analyzeReviews(competitor, sources, context.project_info);
    reviews_analysis.push(analysis);

    onStep(`  OK ${competitor.name} — ${analysis.overall_sentiment} | Forces : ${analysis.perceived_strengths?.length} | Faiblesses : ${analysis.perceived_weaknesses?.length}`);
    await new Promise(r => setTimeout(r, 800));
  }

  context.reviews_analysis = reviews_analysis;

  if (context.competitors_structured) {
    context.competitors_structured = context.competitors_structured.map(comp => {
      const review = reviews_analysis.find(r =>
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

  const success = reviews_analysis.filter(r => r.sources_used?.length > 0).length;
  onStep(`Agent 2B terminé — ${success}/${context.competitors.length} analyse(s) complète(s)`);
  return context;
}

// ─── A2A ──────────────────────────────────────────────────────────────────────
export async function respondToAgent3(question, context, iteration = 1) {
  const reviewsData = context.reviews_analysis
    ?.filter(r => r.sources_used?.length > 0)
    .map(r => ({
      competitor: r.competitor_name,
      sentiment: r.overall_sentiment,
      google_rating: r.rating_summary?.google_maps || "N/A",
      perceived_strengths: r.perceived_strengths?.map(s => ({
        point: s.point,
        frequency: s.frequency,
        quote: s.quotes?.[0] || "",
      })) || [],
      perceived_weaknesses: r.perceived_weaknesses?.map(w => ({
        point: w.point,
        frequency: w.frequency,
        quote: w.quotes?.[0] || "",
      })) || [],
      common_complaints: r.common_complaints || [],
      common_praises: r.common_praises || [],
      customer_expectations: r.customer_expectations || [],
      opportunities_for_us: r.opportunities_for_us || [],
      threats_for_us: r.threats_for_us || [],
    })) || [];

  const prompt = `
Tu es l'Agent 2B spécialisé dans l'analyse des avis clients
(Google Maps, Facebook, sites web).
Itération ${iteration} — réponse à la question de l'Agent 3.
Toutes les données d'avis ont déjà été traduites en français. Réponds en français.

Question de l'Agent 3 :
"${question}"

Données disponibles de tes analyses d'avis (${reviewsData.length} concurrent(s)) :
${JSON.stringify(reviewsData, null, 2)}

Réponds en te basant STRICTEMENT sur tes données d'avis clients.
Cite des preuves concrètes (citations clients, notes, fréquences).

Réponds avec ce JSON (toutes les valeurs en français) :
{
  "agent": "agent2b_reviews",
  "iteration": ${iteration},
  "question": "${question}",
  "data_quality": "suffisant | insuffisant",
  "missing_info": "Ce qui manque si insuffisant",
  "opportunities": [
    {
      "point": "Opportunité identifiée à partir des avis",
      "detail": "Explication détaillée",
      "based_on_competitor": "Nom du concurrent",
      "evidence": "Citation ou donnée concrète des avis",
      "impact": "élevé | moyen | faible"
    }
  ],
  "threats": [
    {
      "point": "Menace identifiée à partir des avis",
      "detail": "Ce que les clients apprécient chez ce concurrent",
      "based_on_competitor": "Nom du concurrent",
      "evidence": "Citation ou donnée concrète des avis",
      "impact": "élevé | moyen | faible"
    }
  ]
}
  `.trim();

  const raw = await callLLM(prompt, { maxTokens: 2000, prefer: "groq", label: "agent2b_a2a" });
  return extractJSON(raw);
}