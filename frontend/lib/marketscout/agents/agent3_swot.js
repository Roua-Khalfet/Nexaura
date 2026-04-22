// src/agents/agent3_swot.js

import { respondToAgent3 as agent2Respond } from "./agent2_scraper";
import { respondToAgent3 as agent2bRespond } from "./agent2b_reviews";
import { callLLM, callLLMParallel } from "./llmRouter";

const callGroq = (prompt, maxTokens = 2000) =>
  callLLM(prompt, { maxTokens, prefer: "groq", label: "agent3" });

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
  const slice = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch (e) {
    const repaired = repairJSON(slice);
    return JSON.parse(repaired);
  }
}

function repairJSON(str) {
  const stack = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (escaped) { escaped = false; continue; }
    if (c === "\\" && inString) { escaped = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === "{" || c === "[") stack.push(c);
    else if (c === "}" || c === "]") stack.pop();
  }
  let result = str.trimEnd();
  result = result.replace(/,\s*$/, "");
  for (let i = stack.length - 1; i >= 0; i--) {
    result += stack[i] === "{" ? "}" : "]";
  }
  return result;
}

function validateContext(context) {
  const hasScrapedData = context.competitors_structured?.some(c => c.scrape_status === "success");
  const hasReviewsData = context.reviews_analysis?.some(r => r.sources_used?.length > 0);
  const hasConversation = !!context.conversation_summary;
  console.log("=== VALIDATION DU CONTEXTE ===");
  console.log("scraping:", hasScrapedData, "| avis:", hasReviewsData, "| conversation:", hasConversation);
  return { hasScrapedData, hasReviewsData, hasConversation };
}

function isRelevantCompetitor(competitor, projectInfo) {
  const sector = (projectInfo.sector || "").toLowerCase();
  const description = (projectInfo.description || "").toLowerCase();
  const enriched = (projectInfo.enriched_description || "").toLowerCase();

  const projectKeywords = [
    ...sector.split(/\s+/),
    ...description.split(/\s+/).filter(w => w.length > 4),
    ...enriched.split(/\s+/).filter(w => w.length > 4),
  ].map(w => w.toLowerCase());

  const compName = (competitor.name || "").toLowerCase();
  const compDesc = (competitor.general?.description || competitor.content_summary || "").toLowerCase();
  const compServices = (competitor.services || [])
    .map(s => (typeof s === "object" ? s.name : s) || "")
    .join(" ").toLowerCase();
  const compText = `${compName} ${compDesc} ${compServices}`;

  const sectorExclusions = {
    "sport": ["hotel", "hôtel", "tourisme", "restaurant", "immobilier", "banque"],
    "fitness": ["hotel", "hôtel", "tourisme", "restaurant", "immobilier"],
    "foodtech": ["sport", "fitness", "immobilier", "finance", "education"],
    "edtech": ["sport", "hotel", "restaurant", "immobilier"],
    "fintech": ["sport", "hotel", "restaurant", "fitness"],
    "healthtech": ["hotel", "tourisme", "finance", "immobilier"],
    "café": ["sport", "fitness", "finance", "immobilier"],
    "restaurant": ["sport", "fitness", "finance", "immobilier"],
  };

  const sectorKey = Object.keys(sectorExclusions).find(k =>
    sector.includes(k) || description.includes(k)
  );
  if (sectorKey) {
    const exclusions = sectorExclusions[sectorKey];
    for (const excl of exclusions) {
      if (compText.includes(excl)) {
        console.log(`Exclu (hors secteur) : ${competitor.name}`);
        return false;
      }
    }
  }
  return true;
}

const JUNK_PATTERNS = [
  "non mentionne", "non mentionné", "non disponible", "n/a", "not available",
  "aucune information", "aucun", "inconnu", "unknown", "non renseigne",
  "non renseigné", "pas d'info", "pas d'information", "non précisé",
  "non specifie", "non spécifié", "à confirmer", "non communiqué",
];

function isJunk(str) {
  if (!str || typeof str !== "string") return true;
  const lower = str.toLowerCase().trim();
  if (lower.length < 15) return true;
  return JUNK_PATTERNS.some(p => lower.includes(p));
}

function extractDirectFromContext(context) {
  const opportunities = [];
  const threats = [];

  const relevantCompetitors = context.competitors_structured
    ?.filter(c => c.scrape_status === "success")
    .filter(c => isRelevantCompetitor(c, context.project_info)) || [];

  relevantCompetitors.forEach(c => {
    c.competitive_analysis?.weaknesses
      ?.filter(w => !isJunk(w))
      .forEach(w => {
        opportunities.push({
          point: `Faiblesse exploitable chez ${c.name} : ${w}`,
          detail: `${c.name} est faible sur "${w}", ce qui est une opportunité de différenciation`,
          based_on: c.name,
          evidence: w,
          impact: "moyen",
          source: "agent2_scraping"
        });
      });

    c.competitive_analysis?.strengths
      ?.filter(s => !isJunk(s))
      .forEach(s => {
        threats.push({
          point: `Avantage concurrent chez ${c.name} : ${s}`,
          detail: `${c.name} excelle sur "${s}", ce qui fixe un niveau élevé difficile à atteindre`,
          based_on: c.name,
          evidence: s,
          impact: "moyen",
          source: "agent2_scraping"
        });
      });

    c.opportunities_for_competitors
      ?.filter(o => !isJunk(o))
      .forEach(o => {
        opportunities.push({
          point: o,
          detail: `Opportunité identifiée à partir de l'analyse du site de ${c.name}`,
          based_on: c.name,
          evidence: o,
          impact: "élevé",
          source: "agent2_scraping"
        });
      });
  });

  const relevantReviews = context.reviews_analysis
    ?.filter(r => r.sources_used?.length > 0)
    .filter(r => {
      const matchingComp = context.competitors_structured?.find(
        c => c.name?.toLowerCase() === r.competitor_name?.toLowerCase()
      );
      return !matchingComp || isRelevantCompetitor(matchingComp, context.project_info);
    }) || [];

  relevantReviews.forEach(r => {
    r.perceived_weaknesses
      ?.filter(w => w.point && !isJunk(w.point))
      .forEach(w => {
        opportunities.push({
          point: `Insatisfaction clients chez ${r.competitor_name} : ${w.point}`,
          detail: `Les clients se plaignent de "${w.point}" chez ${r.competitor_name}`,
          based_on: r.competitor_name,
          evidence: w.quotes?.[0] || w.point,
          impact: w.frequency === "Souvent" ? "élevé" : "moyen",
          source: "agent2b_reviews"
        });
      });

    r.opportunities_for_us
      ?.filter(o => !isJunk(o))
      .forEach(o => {
        opportunities.push({
          point: o,
          detail: `Opportunité détectée à partir des avis de ${r.competitor_name}`,
          based_on: r.competitor_name,
          evidence: o,
          impact: "moyen",
          source: "agent2b_reviews"
        });
      });

    r.threats_for_us
      ?.filter(t => !isJunk(t))
      .forEach(t => {
        threats.push({
          point: t,
          detail: `Risque identifié à partir des avis de ${r.competitor_name}`,
          based_on: r.competitor_name,
          evidence: t,
          impact: "moyen",
          source: "agent2b_reviews"
        });
      });
  });

  return { opportunities, threats };
}

// ─── Boucle A2A ────────────────────────────────────────────────────────────────
async function runA2ALoop(context, onStep) {
  const MAX_ITERATIONS = 2;
  let allOpportunities = [];
  let allThreats = [];
  let a2aLog = [];

  onStep("A2A — Extraction directe...");
  const directData = extractDirectFromContext(context);
  allOpportunities.push(...directData.opportunities);
  allThreats.push(...directData.threats);
  onStep(`Extraction directe : ${directData.opportunities.length} opp | ${directData.threats.length} menaces`);

  const questions = [
    `Pour le projet "${context.project_info.description}" dans le secteur ${context.project_info.sector} à ${context.project_info.location}, quelles sont les OPPORTUNITÉS DE MARCHÉ SPÉCIFIQUES dans ce secteur ?`,
    `Quelles sont les MENACES ET RISQUES SPÉCIFIQUES dans le secteur ${context.project_info.sector} auxquels ce projet devra faire face ?`,
  ];

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    onStep(`A2A — Itération ${iteration}/${MAX_ITERATIONS}`);

    for (const question of questions) {
      const [resp2, resp2b] = await Promise.allSettled([
        agent2Respond(question, context, iteration),
        agent2bRespond(question, context, iteration),
      ]);

      if (resp2.status === "fulfilled") {
        const r = resp2.value;
        if (r.opportunities?.length > 0) allOpportunities.push(...r.opportunities);
        if (r.threats?.length > 0) allThreats.push(...r.threats);
        a2aLog.push({
          from: "agent2_scraping", iteration,
          question: question.slice(0, 100),
          opportunities_count: r.opportunities?.length || 0,
          threats_count: r.threats?.length || 0,
        });
      }

      if (resp2b.status === "fulfilled") {
        const r = resp2b.value;
        if (r.opportunities?.length > 0) allOpportunities.push(...r.opportunities);
        if (r.threats?.length > 0) allThreats.push(...r.threats);
        a2aLog.push({
          from: "agent2b_reviews", iteration,
          question: question.slice(0, 100),
          opportunities_count: r.opportunities?.length || 0,
          threats_count: r.threats?.length || 0,
        });
      }

      await new Promise(r => setTimeout(r, 400));
    }

    onStep(`Iter ${iteration} — Total : ${allOpportunities.length} opp | ${allThreats.length} menaces`);
    if (allOpportunities.length >= 4 && allThreats.length >= 3) break;
  }

  return { allOpportunities, allThreats, a2aLog };
}

// ─── Consolidation Opportunités/Menaces ───────────────────────────────────────
async function consolidateData(rawOpportunities, rawThreats, projectInfo, onStep) {
  onStep(`Consolidation et filtrage sectoriel...`);

  const cleanOpportunities = rawOpportunities.filter(o => !isJunk(o.point) && !isJunk(o.evidence));
  const cleanThreats       = rawThreats.filter(t => !isJunk(t.point) && !isJunk(t.evidence));

  if (cleanOpportunities.length === 0 && cleanThreats.length === 0) {
    return { opportunities: [], threats: [] };
  }

  const prompt = `
Tu es l'Agent 3, un expert en stratégie.

PROJET : "${projectInfo.enriched_description || projectInfo.description}"
SECTEUR EXACT : ${projectInfo.sector}
LOCALISATION : ${projectInfo.location}
DIFFÉRENCIATEUR : ${projectInfo.differentiator || "Non mentionné"}

DONNÉES BRUTES (${cleanOpportunities.length} opp, ${cleanThreats.length} menaces) :
OPPORTUNITÉS : ${JSON.stringify(cleanOpportunities.slice(0, 15), null, 2)}
MENACES : ${JSON.stringify(cleanThreats.slice(0, 15), null, 2)}

IMPORTANT : TOUT LE RÉSULTAT DOIT ÊTRE EN FRANÇAIS — quelle que soit la langue des données d'entrée.
Traduis tout (description du projet, noms de concurrents, points, détails, preuves) en français.

INSTRUCTIONS :
1. FILTRE ABSOLU : Garde UNIQUEMENT ce qui est lié au secteur "${projectInfo.sector}"
2. OPPORTUNITÉS = facteurs externes POSITIFS (tendances, lacunes des concurrents, besoins non satisfaits)
3. MENACES = facteurs externes NÉGATIFS (concurrents forts, risques marché, barrières)
4. Dédoublonne et garde 4 à 6 éléments par catégorie
5. Reformule clairement et professionnellement en français

Réponds avec ce JSON :
{
  "opportunities": [
    {
      "point": "Opportunité externe positive",
      "detail": "Explication actionnable",
      "impact": "élevé | moyen | faible",
      "source": "agent2_scraping | agent2b_reviews | les deux",
      "based_on": "Source ou concurrent",
      "evidence": "Preuve concrète"
    }
  ],
  "threats": [
    {
      "point": "Menace externe négative",
      "detail": "Impact potentiel",
      "impact": "élevé | moyen | faible",
      "source": "agent2_scraping | agent2b_reviews | les deux",
      "based_on": "Source ou concurrent",
      "evidence": "Preuve concrète"
    }
  ]
}
  `.trim();

  try {
    const raw = await callGroq(prompt, 2500);
    const parsed = extractJSON(raw);
    onStep(`Consolidation OK : ${parsed.opportunities?.length || 0} opp | ${parsed.threats?.length || 0} menaces`);
    return parsed;
  } catch (e) {
    onStep(`Consolidation échouée : ${e.message}`);
    return {
      opportunities: cleanOpportunities.filter((o, i, arr) =>
        arr.findIndex(x => x.point === o.point) === i).slice(0, 6),
      threats: cleanThreats.filter((t, i, arr) =>
        arr.findIndex(x => x.point === t.point) === i).slice(0, 6),
    };
  }
}

// ─── Forces & Faiblesses — 2 appels parallèles ────────────────────────────────
async function extractStrengthsWeaknesses(projectInfo, conversationSummary, opportunities, threats, onStep) {
  onStep("Génération des forces et faiblesses — 2 appels parallèles...");

  const projectContext = `
PROJET : ${projectInfo.enriched_description || projectInfo.description}
SECTEUR : ${projectInfo.sector}
LOCALISATION : ${projectInfo.location}
PROBLÈME RÉSOLU : ${projectInfo.problem_solved || "Non mentionné"}
DIFFÉRENCIATEUR : ${projectInfo.differentiator || "Non mentionné"}
STADE : ${projectInfo.stage || "Stade idée"}
BUDGET : ${projectInfo.budget || "Non mentionné"}
PRIX : ${projectInfo.price_range}
CLIENT : ${projectInfo.client_type}
CONVERSATION : ${conversationSummary ? conversationSummary.slice(0, 2000) : "Non disponible"}
  `.trim();

  const competitiveContext = `
OPPORTUNITÉS DE MARCHÉ :
${opportunities.slice(0, 3).map(o => `- ${o.point}`).join("\n") || "Non disponible"}
MENACES :
${threats.slice(0, 3).map(t => `- ${t.point}`).join("\n") || "Non disponible"}
  `.trim();

  // Appel 1 — Forces uniquement
  const strengthsPrompt = `
Tu es un consultant McKinsey expert en stratégie startup.
Analyse ce projet en phase de VALIDATION D'IDÉE.
IMPORTANT : TOUT LE RÉSULTAT DOIT ÊTRE EN FRANÇAIS — même si la description du projet ou le contexte est en anglais ou arabe.

${projectContext}

${competitiveContext}

Génère exactement 5 FORCES INTERNES spécifiques à CE projet.
Une force = un avantage interne réel et unique propre à CE projet spécifique.

RÈGLES STRICTES :
- Commence par : "Modèle", "Capacité", "Positionnement", "Expertise", "Avantage", "Vision", "Concept", "Proposition"
- Chaque force est UNIQUE et couvre un angle différent
- Le détail explique l'impact marché concret (2-3 phrases)
- INTERDIT dans le point : "manque", "absence", "faible", "limité", "pas", "aucun"
- Très spécifique au projet — JAMAIS des généralités

Réponds UNIQUEMENT avec ce JSON :
{
  "Forces": [
    { "point": "Force 1", "detail": "Explication de l'impact concret", "impact": "élevé" },
    { "point": "Force 2", "detail": "Explication de l'impact concret", "impact": "élevé" },
    { "point": "Force 3", "detail": "Explication de l'impact concret", "impact": "moyen" },
    { "point": "Force 4", "detail": "Explication de l'impact concret", "impact": "moyen" },
    { "point": "Force 5", "detail": "Explication de l'impact concret", "impact": "moyen" }
  ]
}
  `.trim();

  // Appel 2 — Faiblesses uniquement
  const weaknessesPrompt = `
Tu es un consultant McKinsey expert en stratégie startup.
Analyse ce projet en phase de VALIDATION D'IDÉE.
IMPORTANT : TOUT LE RÉSULTAT DOIT ÊTRE EN FRANÇAIS — même si la description du projet ou le contexte est en anglais ou arabe.

${projectContext}

${competitiveContext}

Génère exactement 4 FAIBLESSES INTERNES spécifiques à CE projet.
Une faiblesse = un défi interne réel qui pourrait freiner le succès.

RÈGLES STRICTES :
- Commence par : "Défi de", "Risque de", "À développer", "À confirmer", "Nécessité de"
- Chaque faiblesse couvre un angle DIFFÉRENT
- Le détail explique le risque ET une piste de mitigation (2-3 phrases)
- Très spécifique au projet — JAMAIS des généralités

Réponds UNIQUEMENT avec ce JSON :
{
  "Faiblesses": [
    { "point": "Faiblesse 1", "detail": "Risque et piste de mitigation", "impact": "élevé" },
    { "point": "Faiblesse 2", "detail": "Risque et piste de mitigation", "impact": "élevé" },
    { "point": "Faiblesse 3", "detail": "Risque et piste de mitigation", "impact": "moyen" },
    { "point": "Faiblesse 4", "detail": "Risque et piste de mitigation", "impact": "moyen" }
  ]
}
  `.trim();

  const [strengthsRaw, weaknessesRaw] = await callLLMParallel(
    [strengthsPrompt, weaknessesPrompt],
    { maxTokens: 2000, label: "sw" }
  );
  const strengthsResult  = { status: strengthsRaw  ? "fulfilled" : "rejected", value: strengthsRaw  };
  const weaknessesResult = { status: weaknessesRaw ? "fulfilled" : "rejected", value: weaknessesRaw };

  let strengths = [];
  let weaknesses = [];

  if (strengthsResult.status === "fulfilled") {
    try {
      const parsed = extractJSON(strengthsResult.value);
      strengths = (parsed.Forces || [])
        .filter(s => s && s.point)
        .map(s => ({ ...s, source: "user_description" }));
      onStep(`Forces générées : ${strengths.length}`);
    } catch (e) {
      onStep(`Erreur parsing forces : ${e.message}`);
    }
  }

  if (weaknessesResult.status === "fulfilled") {
    try {
      const parsed = extractJSON(weaknessesResult.value);
      weaknesses = (parsed.Faiblesses || [])
        .filter(w => w && w.point)
        .map(w => ({ ...w, source: "user_description" }));
      onStep(`Faiblesses générées : ${weaknesses.length}`);
    } catch (e) {
      onStep(`Erreur parsing faiblesses : ${e.message}`);
    }
  }

  const forbidden = ["manque", "absence", "faible", "limité", "pas ", "aucun", "non satisfait"];
  strengths = strengths.filter(s =>
    !forbidden.some(w => s.point.toLowerCase().startsWith(w))
  );

  if (strengths.length < 3) {
    onStep("Complément des forces avec le fallback...");
    const fallback = buildSpecificStrengths(projectInfo);
    strengths = [...strengths, ...fallback].slice(0, 5);
  }
  if (weaknesses.length < 2) {
    onStep("Complément des faiblesses avec le fallback...");
    const fallback = buildSpecificWeaknesses(projectInfo);
    weaknesses = [...weaknesses, ...fallback].slice(0, 4);
  }

  onStep(`Forces : ${strengths.length} | Faiblesses : ${weaknesses.length}`);
  return { strengths, weaknesses };
}

// ─── Stratégies de secours locales si Groq échoue ─────────────────────────────
function buildFallbackStrategies(swot, projectInfo) {
  const s = swot.strengths[0]?.point || "votre avantage clé";
  const w = swot.weaknesses[0]?.point || "votre défi principal";
  const o = swot.opportunities[0]?.point || "l'opportunité de marché";
  const t = swot.threats[0]?.point || "la pression concurrentielle";
  const sector = projectInfo.sector || "ce secteur";
  const diff = projectInfo.differentiator || "votre différenciateur";

  return {
    so_strategies: [
      `Exploiter ${s} pour saisir ${o} — lancer une campagne de validation client ciblée dès le 1er mois`,
      `Utiliser ${diff} comme levier de différenciation dans ${sector} pour capturer les segments insatisfaits des concurrents`,
    ],
    st_strategies: [
      `Utiliser ${s} pour construire une barrière contre ${t} — documenter et communiquer les avantages uniques du projet`,
      `Renforcer la crédibilité en montrant des preuves concrètes de valeur avant que les concurrents réagissent`,
    ],
    wo_strategies: [
      `Transformer ${w} en priorité d'amélioration en exploitant ${o} — nouer des partenariats avec des acteurs existants pour accélérer`,
      `Construire des partenariats stratégiques dans ${sector} pour compenser les ressources limitées en phase initiale`,
    ],
    wt_strategies: [
      `Minimiser l'exposition à ${t} en se concentrant sur un segment de niche où ${w} a moins d'impact`,
      `Adopter une stratégie lean : tester le MVP avec un budget minimal avant d'engager des ressources importantes`,
    ],
  };
}

function buildFallbackActions(swot, projectInfo) {
  const sector = projectInfo.sector || "ce secteur";
  const location = projectInfo.location || "la région";
  const diff = projectInfo.differentiator || "votre concept";

  return [
    {
      action: `Mener 10 à 15 entretiens clients à ${location} pour valider la disposition à payer`,
      why: `Aucune hypothèse sur ${sector} n'est validée sans test terrain — priorité absolue au stade idée`,
      timeline: "0-3 mois",
      swot_link: swot.weaknesses[0]?.point || "Validation marché",
    },
    {
      action: `Créer un MVP minimal (landing page + prototype) et mesurer le taux de conversion`,
      why: `${diff} doit être testé avec de vrais utilisateurs avant tout investissement technique lourd`,
      timeline: "0-3 mois",
      swot_link: swot.strengths[0]?.point || "Proposition de valeur",
    },
    {
      action: `Identifier et contacter 3 partenaires ou distributeurs potentiels dans ${sector}`,
      why: `Les partenariats accélèrent l'acquisition client et compensent le manque de notoriété initiale`,
      timeline: "3-6 mois",
      swot_link: swot.opportunities[0]?.point || "Opportunité de marché",
    },
    {
      action: `Lancer une stratégie de contenu ou de présence digitale différenciante`,
      why: `Face à ${swot.threats[0]?.point || "la concurrence établie"}, la visibilité est critique pour exister`,
      timeline: "3-6 mois",
      swot_link: swot.threats[0]?.point || "Pression concurrentielle",
    },
  ];
}

// ─── Analyse stratégique finale — 2 appels séparés ────────────────────────────
async function generateFinalSWOT(swot, projectInfo, onStep) {
  onStep("Génération de l'analyse stratégique finale (2 appels)...");

  if (swot.strengths.length === 0 && swot.opportunities.length === 0) {
    return {
      strategic_summary: "Données insuffisantes pour une analyse complète.",
      so_strategies: [], st_strategies: [],
      wo_strategies: [], wt_strategies: [],
      priority_actions: [],
      overall_score: { viability: 50, market_opportunity: 50, competition_risk: 50, recommendation: "Recherche complémentaire nécessaire" }
    };
  }

  const swotSummary = `
FORCES : ${swot.strengths.map(s => `[${s.impact}] ${s.point}`).join(" | ")}
FAIBLESSES : ${swot.weaknesses.map(w => `[${w.impact}] ${w.point}`).join(" | ")}
OPPORTUNITÉS : ${swot.opportunities.map(o => `[${o.impact}] ${o.point}`).join(" | ")}
MENACES : ${swot.threats.map(t => `[${t.impact}] ${t.point}`).join(" | ")}
  `.trim();

  const projectCtx = `
Projet : "${projectInfo.enriched_description || projectInfo.description}"
Secteur : ${projectInfo.sector} | Localisation : ${projectInfo.location}
Différenciateur : ${projectInfo.differentiator || "Non mentionné"}
Stade : ${projectInfo.stage || "Stade idée"}
Budget : ${projectInfo.budget || "Non mentionné"}
  `.trim();

  // Appel 1 : Résumé + Stratégies SO/ST/WO/WT
  const strategiesPrompt = `
Tu es un consultant senior en stratégie d'entreprise. Réponds UNIQUEMENT en JSON valide.
IMPORTANT : TOUT LE RÉSULTAT DOIT ÊTRE EN FRANÇAIS — même si la description du projet, les éléments SWOT ou le contexte sont en anglais ou arabe. Traduis tout.

${projectCtx}

${swotSummary}

Génère une analyse stratégique CONCRÈTE pour la phase de VALIDATION D'IDÉE.

Réponds avec ce JSON (max 2 éléments par clé pour rester concis) :
{
  "strategic_summary": "Résumé en 3-4 phrases très spécifiques au projet",
  "so_strategies": [
    "La Force X exploite l'Opportunité Y — action concrète de validation"
  ],
  "st_strategies": [
    "La Force X contrebalance la Menace Y — action concrète de mitigation"
  ],
  "wo_strategies": [
    "Réduire la Faiblesse X via l'Opportunité Y — action concrète"
  ],
  "wt_strategies": [
    "Minimiser la Faiblesse X face à la Menace Y — action défensive"
  ]
}
  `.trim();

  // Appel 2 : Actions prioritaires + Score
  const actionsPrompt = `
Tu es un consultant senior en stratégie d'entreprise. Réponds UNIQUEMENT en JSON valide.
IMPORTANT : TOUT LE RÉSULTAT DOIT ÊTRE EN FRANÇAIS — même si la description du projet, les éléments SWOT ou le contexte sont en anglais ou arabe. Traduis tout.

${projectCtx}

${swotSummary}

Génère 4 actions prioritaires et un score de viabilité pour ce projet en phase de validation.

Réponds avec ce JSON :
{
  "priority_actions": [
    {
      "action": "Action très concrète et spécifique à ce projet",
      "why": "Justification basée sur le SWOT",
      "timeline": "0-3 mois | 3-6 mois | 6-12 mois",
      "swot_link": "Force/Faiblesse/Opportunité/Menace concernée"
    }
  ],
  "overall_score": {
    "viability": 75,
    "market_opportunity": 80,
    "competition_risk": 60,
    "recommendation": "Lancer | Pivoter | Recherche complémentaire nécessaire"
  }
}
  `.trim();

  const [strategiesRaw, actionsRaw] = await callLLMParallel(
    [strategiesPrompt, actionsPrompt],
    { label: "swot_final" }
  );
  const strategiesResult = { status: strategiesRaw ? "fulfilled" : "rejected", value: strategiesRaw };
  const actionsResult    = { status: actionsRaw    ? "fulfilled" : "rejected", value: actionsRaw    };

  let strategicSummary = "";
  let so_strategies = [], st_strategies = [], wo_strategies = [], wt_strategies = [];

  if (strategiesResult.status === "fulfilled") {
    try {
      const parsed = extractJSON(strategiesResult.value);
      strategicSummary = parsed.strategic_summary || "";
      so_strategies = Array.isArray(parsed.so_strategies) ? parsed.so_strategies.filter(Boolean) : [];
      st_strategies = Array.isArray(parsed.st_strategies) ? parsed.st_strategies.filter(Boolean) : [];
      wo_strategies = Array.isArray(parsed.wo_strategies) ? parsed.wo_strategies.filter(Boolean) : [];
      wt_strategies = Array.isArray(parsed.wt_strategies) ? parsed.wt_strategies.filter(Boolean) : [];
      onStep(`Stratégies OK — SO:${so_strategies.length} ST:${st_strategies.length} WO:${wo_strategies.length} WT:${wt_strategies.length}`);
    } catch (e) {
      onStep(`Erreur parsing stratégies : ${e.message} — fallback local utilisé`);
      const fallback = buildFallbackStrategies(swot, projectInfo);
      so_strategies = fallback.so_strategies;
      st_strategies = fallback.st_strategies;
      wo_strategies = fallback.wo_strategies;
      wt_strategies = fallback.wt_strategies;
    }
  } else {
    onStep(`Appel stratégies échoué : ${strategiesResult.reason?.message} — fallback local utilisé`);
    const fallback = buildFallbackStrategies(swot, projectInfo);
    so_strategies = fallback.so_strategies;
    st_strategies = fallback.st_strategies;
    wo_strategies = fallback.wo_strategies;
    wt_strategies = fallback.wt_strategies;
  }

  let priority_actions = [];
  let overall_score = { viability: 65, market_opportunity: 70, competition_risk: 55, recommendation: "Recherche complémentaire nécessaire" };

  if (actionsResult.status === "fulfilled") {
    try {
      const parsed = extractJSON(actionsResult.value);
      priority_actions = Array.isArray(parsed.priority_actions)
        ? parsed.priority_actions.filter(a => a && a.action)
        : [];
      if (parsed.overall_score) overall_score = parsed.overall_score;
      onStep(`Actions OK — ${priority_actions.length} action(s) | Viabilité : ${overall_score.viability}/100`);
    } catch (e) {
      onStep(`Erreur parsing actions : ${e.message} — fallback local utilisé`);
      priority_actions = buildFallbackActions(swot, projectInfo);
    }
  } else {
    onStep(`Appel actions échoué : ${actionsResult.reason?.message} — fallback local utilisé`);
    priority_actions = buildFallbackActions(swot, projectInfo);
  }

  if (!strategicSummary) {
    const sector = projectInfo.sector || "ce secteur";
    const location = projectInfo.location || "la région";
    strategicSummary = `Le projet présente un positionnement pertinent dans le secteur ${sector} à ${location}. L'analyse concurrentielle révèle des opportunités réelles à exploiter rapidement. La priorité est de valider les hypothèses clés auprès des clients cibles avant d'engager les ressources principales.`;
  }

  return {
    strategic_summary: strategicSummary,
    so_strategies,
    st_strategies,
    wo_strategies,
    wt_strategies,
    priority_actions,
    overall_score,
  };
}

// ─── Forces de secours ────────────────────────────────────────────────────────
function buildSpecificStrengths(projectInfo) {
  const sector   = projectInfo.sector      || "ce secteur";
  const location = projectInfo.location    || "la région";
  const diff     = projectInfo.differentiator;
  const problem  = projectInfo.problem_solved;
  const price    = projectInfo.price_range;
  const client   = projectInfo.client_type;

  return [
    {
      point: diff
        ? `Proposition de valeur différenciante : ${diff}`
        : `Concept avec un positionnement distinctif dans le secteur ${sector}`,
      detail: diff
        ? `Ce différenciateur crée une barrière à l'imitation et guide les décisions produit, marketing et tarifaires dès la phase de validation`
        : `Un positionnement clair facilite le ciblage des bons segments pour les entretiens de validation`,
      impact: "élevé", source: "user_description"
    },
    {
      point: problem
        ? `Adressage d'un point de douleur client spécifique : ${problem}`
        : `Forte adéquation entre l'offre et un besoin de marché réel`,
      detail: `La clarté sur le problème résolu permet de formuler des hypothèses testables et de mesurer le problem-solution fit avant tout investissement`,
      impact: "élevé", source: "user_description"
    },
    {
      point: `Connaissance native du marché ${sector} à ${location}`,
      detail: `La compréhension terrain accélère la validation — accès direct aux clients potentiels, compréhension des usages locaux et des barrières culturelles à l'adoption`,
      impact: "moyen", source: "user_description"
    },
    {
      point: price
        ? `Modèle tarifaire compétitif à ${price} — disruptant les offres existantes`
        : `Modèle économique adapté au profil ${client}`,
      detail: `Le positionnement tarifaire optimise l'accessibilité pour le segment cible tout en créant un avantage concurrentiel direct`,
      impact: "moyen", source: "user_description"
    },
    {
      point: `Vision produit ancrée dans les tendances numériques du secteur ${sector}`,
      detail: `La composante technologique correspond aux attentes des consommateurs modernes et crée un écart difficile à combler pour les acteurs traditionnels`,
      impact: "moyen", source: "user_description"
    }
  ];
}

// ─── Faiblesses de secours ────────────────────────────────────────────────────
function buildSpecificWeaknesses(projectInfo) {
  const sector   = projectInfo.sector   || "ce secteur";
  const location = projectInfo.location || "la région";
  const budget   = projectInfo.budget;
  const diff     = projectInfo.differentiator;

  return [
    {
      point: "À confirmer : validation marché auprès des vrais clients cibles",
      detail: `Le problème identifié, la solution et le prix restent des hypothèses — aucun entretien client ni test marché n'a encore confirmé la disposition à payer à ${location}`,
      impact: "élevé", source: "user_description"
    },
    {
      point: "Défi de crédibilité initiale face aux acteurs établis du marché",
      detail: `Sans clients pilotes ni track-record, convaincre les premiers adoptants dans le secteur ${sector} sera difficile — le bouche-à-oreille devra être construit de zéro`,
      impact: "élevé", source: "user_description"
    },
    {
      point: diff
        ? `Risque d'exécution du différenciateur clé : ${diff}`
        : "Nécessité de prouver la faisabilité opérationnelle du modèle",
      detail: `Le différenciateur est convaincant sur le papier mais sa mise en œuvre réelle — recrutement, processus, coûts — n'a pas encore été testée`,
      impact: "moyen", source: "user_description"
    },
    {
      point: budget
        ? `Budget de ${budget} à déployer en mode validation lean`
        : "Allocation des ressources à optimiser pendant la phase de validation",
      detail: `La phase de validation doit tester les hypothèses clés avec un minimum de ressources avant d'engager le budget principal dans le développement complet`,
      impact: "moyen", source: "user_description"
    }
  ];
}

// ─── Agent 3 SWOT principal ───────────────────────────────────────────────────
export async function runAgent3SWOT(context, onStep) {
  onStep("=== Démarrage de l'Agent 3 SWOT ===");

  const { hasScrapedData, hasReviewsData, hasConversation } = validateContext(context);
  onStep(`Contexte : scraping=${hasScrapedData} | avis=${hasReviewsData} | conversation=${hasConversation}`);

  // ÉTAPE 1 : Collecte A2A
  onStep("=== ÉTAPE 1 : Collecte A2A ===");
  const { allOpportunities, allThreats, a2aLog } = await runA2ALoop(context, onStep);
  onStep(`A2A : ${allOpportunities.length} opp | ${allThreats.length} menaces`);

  // ÉTAPE 2 : Consolidation Opportunités/Menaces
  onStep("=== ÉTAPE 2 : Consolidation O/M ===");
  let consolidated = { opportunities: [], threats: [] };
  try {
    consolidated = await consolidateData(allOpportunities, allThreats, context.project_info, onStep);
  } catch (e) {
    onStep(`Consolidation échouée : ${e.message}`);
    consolidated = {
      opportunities: allOpportunities.slice(0, 6),
      threats: allThreats.slice(0, 6),
    };
  }

  // ÉTAPE 3 : Forces et Faiblesses (2 appels parallèles)
  onStep("=== ÉTAPE 3 : Forces et Faiblesses ===");
  let sw = { strengths: [], weaknesses: [] };
  try {
    sw = await extractStrengthsWeaknesses(
      context.project_info,
      context.conversation_summary || "",
      consolidated.opportunities,
      consolidated.threats,
      onStep
    );
  } catch (e) {
    onStep(`Forces/Faiblesses échouées : ${e.message}`);
    sw = {
      strengths: buildSpecificStrengths(context.project_info),
      weaknesses: buildSpecificWeaknesses(context.project_info),
    };
  }

  // ÉTAPE 4 : Assemblage du SWOT complet
  const swot = {
    strengths:     sw.strengths              || [],
    weaknesses:    sw.weaknesses             || [],
    opportunities: consolidated.opportunities || [],
    threats:       consolidated.threats       || [],
  };

  onStep(`SWOT : ${swot.strengths.length}F | ${swot.weaknesses.length}Fa | ${swot.opportunities.length}O | ${swot.threats.length}M`);

  // ÉTAPE 5 : Analyse stratégique finale (SO/ST/WO/WT + actions + scores)
  onStep("=== ÉTAPE 5 : Analyse stratégique + actions prioritaires ===");
  let strategic = {};
  try {
    strategic = await generateFinalSWOT(swot, context.project_info, onStep);
  } catch (e) {
    onStep(`Analyse stratégique échouée : ${e.message} — fallback local`);
    const fallbackStrategies = buildFallbackStrategies(swot, context.project_info);
    const fallbackActions    = buildFallbackActions(swot, context.project_info);
    strategic = {
      strategic_summary: `Le projet présente un positionnement pertinent dans le secteur ${context.project_info.sector || "cible"} à ${context.project_info.location || "la région"}. La priorité est de valider les hypothèses clés auprès des clients cibles.`,
      ...fallbackStrategies,
      priority_actions: fallbackActions,
      overall_score: { viability: 60, market_opportunity: 65, competition_risk: 55, recommendation: "Recherche complémentaire nécessaire" }
    };
  }

  // Sauvegarde du contexte complet
  context.swot = {
    strengths:         swot.strengths,
    weaknesses:        swot.weaknesses,
    opportunities:     swot.opportunities,
    threats:           swot.threats,
    strategic_summary: strategic.strategic_summary  || "",
    so_strategies:     strategic.so_strategies      || [],
    st_strategies:     strategic.st_strategies      || [],
    wo_strategies:     strategic.wo_strategies      || [],
    wt_strategies:     strategic.wt_strategies      || [],
    priority_actions:  strategic.priority_actions   || [],
    overall_score:     strategic.overall_score      || {
      viability: 60, market_opportunity: 65,
      competition_risk: 55, recommendation: "Recherche complémentaire nécessaire"
    },
    a2a_log:      a2aLog,
    generated_at: new Date().toISOString(),
  };

  onStep(`=== Agent 3 SWOT terminé ===`);
  onStep(`${context.swot.strengths.length}F | ${context.swot.weaknesses.length}Fa | ${context.swot.opportunities.length}O | ${context.swot.threats.length}M`);
  onStep(`Stratégies : SO=${context.swot.so_strategies?.length} | ST=${context.swot.st_strategies?.length} | WO=${context.swot.wo_strategies?.length} | WT=${context.swot.wt_strategies?.length}`);
  onStep(`Actions prioritaires : ${context.swot.priority_actions?.length}`);

  return context;
}