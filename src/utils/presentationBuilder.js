// src/utils/presentationBuilder.js
// Generates PPTX (via pptxgenjs) and PDF (via jsPDF + html2canvas)
// from the pipeline shared context + project data.

// ─────────────────────────────────────────────────────────────────────────────
// THEME DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────
export const THEMES = {
  purple: {
    label: "Violet",
    primary:    "#534AB7",
    primaryDark:"#3C3489",
    primaryLight:"#EEEDFE",
    accent:     "#1D9E75",
    danger:     "#E24B4A",
    warning:    "#EF9F27",
    text:       "#1a1a1a",
    textMuted:  "#888787",
    bg:         "#FFFFFF",
    bgAlt:      "#F8F7FF",
    border:     "#E5E3F5",
  },
  blue: {
    label: "Bleu",
    primary:    "#185FA5",
    primaryDark:"#0C447C",
    primaryLight:"#E6F1FB",
    accent:     "#1D9E75",
    danger:     "#E24B4A",
    warning:    "#EF9F27",
    text:       "#1a1a1a",
    textMuted:  "#888787",
    bg:         "#FFFFFF",
    bgAlt:      "#F0F7FF",
    border:     "#CCDFF4",
  },
  green: {
    label: "Vert",
    primary:    "#0F6E56",
    primaryDark:"#085041",
    primaryLight:"#E1F5EE",
    accent:     "#534AB7",
    danger:     "#E24B4A",
    warning:    "#EF9F27",
    text:       "#1a1a1a",
    textMuted:  "#888787",
    bg:         "#FFFFFF",
    bgAlt:      "#F0FBF6",
    border:     "#B3DFD1",
  },
  dark: {
    label: "Sombre",
    primary:    "#534AB7",
    primaryDark:"#AFA9EC",
    primaryLight:"#26215C",
    accent:     "#1D9E75",
    danger:     "#E24B4A",
    warning:    "#EF9F27",
    text:       "#F0EFF8",
    textMuted:  "#A8A7B5",
    bg:         "#16151F",
    bgAlt:      "#1E1D2A",
    border:     "#2E2C3E",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function isEmpty(val) {
  if (!val) return true;
  if (typeof val === "string") {
    const low = val.toLowerCase().trim();
    return (
      low === "" ||
      low.includes("no information") ||
      low.includes("not mentionned") ||
      low.includes("not available") ||
      low.includes("n/a") ||
      low.includes("Null") ||
      low.includes("not available") ||
      low.includes("unknown")
    );
  }
  if (Array.isArray(val)) return val.length === 0;
  return false;
}

function truncate(str, maxLen = 120) {
  if (!str) return "";
  return str.length > maxLen ? str.slice(0, maxLen - 1) + "…" : str;
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function pptxColor(hex) {
  return hex.replace("#", "");
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE BUILDERS — each returns a function(pptx, slide, theme, data, lang)
// ─────────────────────────────────────────────────────────────────────────────

const T = {
  en: {
    cover_subtitle:   "Competitive Market Analysis",
    prepared_by:      "Prepared by",
    exec_summary:     "Executive Summary",
    description:      "Description",
    key_info:         "Key Information",
    location:         "Location",
    sector:           "Sector",
    client_type:      "Client type",
    stage:            "Stage",
    market_overview:  "Market Overview",
    competitors_id:   "Identified competitors",
    scraped:          "Scraped",
    with_reviews:     "With reviews",
    market_sectors:   "Target sector",
    client_target:    "Client target",
    competitors:      "Identified Competitors",
    pricing:          "Pricing",
    sentiment:        "Sentiment",
    swot:             "SWOT Analysis",
    strengths:        "Strengths",
    weaknesses:       "Weaknesses",
    opportunities:    "Opportunities",
    threats:          "Threats",
    positive_int:     "Positive internal factors",
    negative_int:     "Negative internal factors",
    positive_ext:     "Positive external factors",
    negative_ext:     "Negative external factors",
    competitive_str:  "Competitive Strengths",
    top_strengths:    "Top strengths identified among competitors",
    actions:          "Priority Actions",
    strategies:       "Strategies derived from SWOT analysis",
    so:               "SO — Exploit",
    st:               "ST — Defend",
    wo:               "WO — Improve",
    wt:               "WT — Avoid",
    recommendations:  "Recommendations",
    priority_actions: "Priority actions from SWOT",
    timeline:         "Timeline",
    viability:        "Viability",
    opportunity:      "Opportunity",
    risk:             "Risk",
    recommendation:   "Final Recommendation",
    thank_you:        "Thank You",
    next_steps:       "Next Steps",
    next_steps_list:  [
      "Validate positioning with pilot customers",
      "Define 6-month product roadmap",
      "Launch a targeted awareness campaign",
      "Identify strategic partners",
    ],
    confidential:     "Confidential",
    generated_by:     "Generated by Market Intelligence Platform",
  },
  fr: {
    cover_subtitle:   "Analyse concurrentielle du marché",
    prepared_by:      "Préparé par",
    exec_summary:     "Résumé exécutif",
    description:      "Description",
    key_info:         "Informations clés",
    location:         "Localisation",
    sector:           "Secteur",
    client_type:      "Type de client",
    stage:            "Phase",
    market_overview:  "Aperçu du marché",
    competitors_id:   "Concurrents identifiés",
    scraped:          "Scrappés",
    with_reviews:     "Avec avis",
    market_sectors:   "Secteur cible",
    client_target:    "Cible client",
    competitors:      "Concurrents identifiés",
    pricing:          "Tarification",
    sentiment:        "Sentiment",
    swot:             "Analyse SWOT",
    strengths:        "Forces",
    weaknesses:       "Faiblesses",
    opportunities:    "Opportunités",
    threats:          "Menaces",
    positive_int:     "Facteurs internes positifs",
    negative_int:     "Facteurs internes négatifs",
    positive_ext:     "Facteurs externes positifs",
    negative_ext:     "Facteurs externes négatifs",
    competitive_str:  "Forces concurrentielles",
    top_strengths:    "Principales forces identifiées chez les concurrents",
    actions:          "Actions prioritaires",
    strategies:       "Stratégies issues de l'analyse SWOT",
    so:               "SO — Exploiter",
    st:               "ST — Défendre",
    wo:               "WO — Améliorer",
    wt:               "WT — Éviter",
    recommendations:  "Recommandations",
    priority_actions: "Actions prioritaires SWOT",
    timeline:         "Calendrier",
    viability:        "Viabilité",
    opportunity:      "Opportunité",
    risk:             "Risque",
    recommendation:   "Recommandation finale",
    thank_you:        "Merci",
    next_steps:       "Étapes suivantes",
    next_steps_list:  [
      "Valider le positionnement avec des clients pilotes",
      "Définir une feuille de route produit sur 6 mois",
      "Lancer une campagne de visibilité ciblée",
      "Identifier des partenaires stratégiques",
    ],
    confidential:     "Confidentiel",
    generated_by:     "Généré par la plateforme d'intelligence marché",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// PPTX GENERATOR
// ─────────────────────────────────────────────────────────────────────────────
export async function generatePPTX(context, projectData, options = {}) {
  const {
    theme: themeKey = "violet",
    companyName = "",
    presenterName = "",
    date = new Date().toLocaleDateString("fr-FR", { year: "numeric", month: "long" }),
    lang = "fr",
    slides: slideSelection = {},
  } = options;

  const theme = THEMES[themeKey] || THEMES.violet;
  const t = T[lang] || T.fr;

  // Dynamically import pptxgenjs
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();

  pptx.layout = "LAYOUT_WIDE"; // 13.33" x 7.5"
  pptx.author = presenterName || "Plateforme d'intelligence marché";
  pptx.company = companyName || "";
  pptx.subject = t.cover_subtitle;
  pptx.title = companyName ? `${companyName} — ${t.cover_subtitle}` : t.cover_subtitle;

  const W = 13.33;
  const H = 7.5;

  // ── MASTER LAYOUT ────────────────────────────────────────────────────────────
  // Helper: add a standard slide with left accent bar + footer
  function addSlide(titleText) {
    const slide = pptx.addSlide();

    // Background
    slide.background = { color: pptxColor(theme.bg) };

    // Left accent bar
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: 0.06, h: H,
      fill: { color: pptxColor(theme.primary) },
      line: { color: pptxColor(theme.primary) },
    });

    // Footer line
    slide.addShape(pptx.ShapeType.line, {
      x: 0.3, y: H - 0.4, w: W - 0.6, h: 0,
      line: { color: pptxColor(theme.border), width: 0.5 },
    });

    // Footer left: company
    if (companyName) {
      slide.addText(companyName, {
        x: 0.3, y: H - 0.38, w: 4, h: 0.28,
        fontSize: 7, color: pptxColor(theme.textMuted),
        fontFace: "Calibri",
      });
    }

    // Footer center: title
    slide.addText(t.confidential, {
      x: (W - 3) / 2, y: H - 0.38, w: 3, h: 0.28,
      fontSize: 7, color: pptxColor(theme.textMuted),
      align: "center", fontFace: "Calibri",
    });

    // Footer right: date
    slide.addText(date, {
      x: W - 2, y: H - 0.38, w: 1.8, h: 0.28,
      fontSize: 7, color: pptxColor(theme.textMuted),
      align: "right", fontFace: "Calibri",
    });

    // Slide title
    if (titleText) {
      slide.addText(titleText, {
        x: 0.35, y: 0.22, w: W - 0.7, h: 0.45,
        fontSize: 18, bold: true,
        color: pptxColor(theme.primary),
        fontFace: "Calibri",
      });
      // Title underline
      slide.addShape(pptx.ShapeType.line, {
        x: 0.35, y: 0.72, w: 1.2, h: 0,
        line: { color: pptxColor(theme.primary), width: 2 },
      });
    }

    return slide;
  }

  // ── SLIDE 1: COVER ──────────────────────────────────────────────────────────
  if (slideSelection.cover !== false) {
    const slide = pptx.addSlide();
    slide.background = { color: pptxColor(theme.primary) };

    // Decorative large circle top-right
    slide.addShape(pptx.ShapeType.ellipse, {
      x: W - 3.5, y: -1.5, w: 4.5, h: 4.5,
      fill: { color: pptxColor(theme.primaryDark), transparency: 40 },
      line: { color: pptxColor(theme.primaryDark), transparency: 40 },
    });

    // Decorative small circle bottom-left
    slide.addShape(pptx.ShapeType.ellipse, {
      x: -0.8, y: H - 1.8, w: 2.5, h: 2.5,
      fill: { color: pptxColor(theme.primaryDark), transparency: 50 },
      line: { color: pptxColor(theme.primaryDark), transparency: 50 },
    });

    // Company initials badge
    const initials = (companyName || "MP")
      .split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.6, y: 0.5, w: 0.9, h: 0.9,
      fill: { color: "FFFFFF", transparency: 85 },
      line: { color: "FFFFFF", transparency: 70 },
      rectRadius: 0.15,
    });
    slide.addText(initials, {
      x: 0.6, y: 0.5, w: 0.9, h: 0.9,
      fontSize: 20, bold: true, color: "FFFFFF",
      align: "center", valign: "middle", fontFace: "Calibri",
    });

    // Subtitle label
    slide.addText(t.cover_subtitle.toUpperCase(), {
      x: 0.6, y: 2.5, w: 8, h: 0.4,
      fontSize: 10, color: "FFFFFF",
      transparency: 30, charSpacing: 2,
      fontFace: "Calibri",
    });

    // Main title
    const mainTitle = companyName || (projectData?.sector || "Market Analysis");
    slide.addText(mainTitle, {
      x: 0.6, y: 2.9, w: 9, h: 1.1,
      fontSize: 36, bold: true, color: "FFFFFF",
      fontFace: "Calibri",
    });

    // Description excerpt
    const desc = truncate(
      projectData?.enriched_description || projectData?.description || "",
      160
    );
    if (desc) {
      slide.addText(desc, {
        x: 0.6, y: 4.05, w: 8.5, h: 0.8,
        fontSize: 11, color: "FFFFFF",
        transparency: 25, lineSpacingMultiple: 1.3,
        fontFace: "Calibri",
      });
    }

    // Bottom bar
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: H - 1.1, w: W, h: 1.1,
      fill: { color: pptxColor(theme.primaryDark), transparency: 20 },
      line: { color: pptxColor(theme.primaryDark), transparency: 20 },
    });

    const footerItems = [];
    if (presenterName) footerItems.push(`${t.prepared_by}: ${presenterName}`);
    if (date)          footerItems.push(date);
    if (t.confidential) footerItems.push(t.confidential);

    slide.addText(footerItems.join("   ·   "), {
      x: 0.6, y: H - 0.9, w: W - 1.2, h: 0.7,
      fontSize: 9, color: "FFFFFF",
      transparency: 25, align: "left",
      fontFace: "Calibri",
    });

    // Chips: sector, location, clientType
    const chips = [
      projectData?.sector,
      projectData?.location,
      projectData?.clientType,
    ].filter(Boolean);
    chips.forEach((chip, i) => {
      slide.addShape(pptx.ShapeType.roundRect, {
        x: 0.6 + i * 2.1, y: 1.9, w: 1.9, h: 0.35,
        fill: { color: "FFFFFF", transparency: 80 },
        line: { color: "FFFFFF", transparency: 60 },
        rectRadius: 0.06,
      });
      slide.addText(chip, {
        x: 0.6 + i * 2.1, y: 1.9, w: 1.9, h: 0.35,
        fontSize: 9, color: "FFFFFF",
        align: "center", valign: "middle", fontFace: "Calibri",
      });
    });
  }

  // ── SLIDE 2: EXECUTIVE SUMMARY ───────────────────────────────────────────────
  if (slideSelection.exec_summary !== false) {
    const slide = addSlide(t.exec_summary);

    const desc = projectData?.enriched_description || projectData?.description || "";
    slide.addText(truncate(desc, 400), {
      x: 0.35, y: 0.85, w: 8.5, h: 2.0,
      fontSize: 11, color: pptxColor(theme.text),
      lineSpacingMultiple: 1.5, fontFace: "Calibri",
      valign: "top",
    });

    // Info boxes row
    const infoItems = [
      { label: t.location,    value: projectData?.location    || "—" },
      { label: t.sector,      value: projectData?.sector      || "—" },
      { label: t.client_type, value: projectData?.clientType  || "—" },
      { label: t.stage,       value: projectData?.stage       || "—" },
    ];

    infoItems.forEach(({ label, value }, i) => {
      const x = 0.35 + i * 3.2;
      slide.addShape(pptx.ShapeType.roundRect, {
        x, y: 3.1, w: 3.0, h: 1.05,
        fill: { color: pptxColor(theme.bgAlt) },
        line: { color: pptxColor(theme.border) },
        rectRadius: 0.1,
      });
      slide.addText(label.toUpperCase(), {
        x, y: 3.18, w: 3.0, h: 0.3,
        fontSize: 7.5, color: pptxColor(theme.textMuted),
        align: "center", charSpacing: 1, fontFace: "Calibri",
      });
      slide.addText(value, {
        x, y: 3.5, w: 3.0, h: 0.55,
        fontSize: 14, bold: true, color: pptxColor(theme.primary),
        align: "center", fontFace: "Calibri",
      });
    });

    // Problem / Differentiator
    const problem = projectData?.problem_solved;
    const diff    = projectData?.differentiator;

    if (problem) {
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.35, y: 4.35, w: 0.04, h: 0.8,
        fill: { color: pptxColor(theme.accent) },
        line: { color: pptxColor(theme.accent) },
      });
      slide.addText("Problem solved", {
        x: 0.5, y: 4.35, w: 5.5, h: 0.25,
        fontSize: 8, bold: true, color: pptxColor(theme.textMuted),
        fontFace: "Calibri",
      });
      slide.addText(truncate(problem, 200), {
        x: 0.5, y: 4.6, w: 5.5, h: 0.55,
        fontSize: 10, color: pptxColor(theme.text),
        fontFace: "Calibri", lineSpacingMultiple: 1.3,
      });
    }

    if (diff) {
      slide.addShape(pptx.ShapeType.rect, {
        x: 7.0, y: 4.35, w: 0.04, h: 0.8,
        fill: { color: pptxColor(theme.primary) },
        line: { color: pptxColor(theme.primary) },
      });
      slide.addText("Differentiator", {
        x: 7.15, y: 4.35, w: 5.8, h: 0.25,
        fontSize: 8, bold: true, color: pptxColor(theme.textMuted),
        fontFace: "Calibri",
      });
      slide.addText(truncate(diff, 200), {
        x: 7.15, y: 4.6, w: 5.8, h: 0.55,
        fontSize: 10, color: pptxColor(theme.text),
        fontFace: "Calibri", lineSpacingMultiple: 1.3,
      });
    }
  }

  // ── SLIDE 3: MARKET OVERVIEW ─────────────────────────────────────────────────
  if (slideSelection.market_overview !== false) {
    const slide = addSlide(t.market_overview);

    const competitorsAll    = context?.competitors_structured || [];
    const scraped           = competitorsAll.filter((c) => c.scrape_status === "success").length;
    const withReviews       = competitorsAll.filter((c) => c.reviews?.sources_used?.length > 0).length;

    const metrics = [
      { value: context?.competitors?.length || 0, label: t.competitors_id, color: theme.primary },
      { value: scraped,      label: t.scraped,      color: theme.accent },
      { value: withReviews,  label: t.with_reviews, color: theme.warning },
    ];

    metrics.forEach(({ value, label, color }, i) => {
      const x = 0.35 + i * 4.3;
      slide.addShape(pptx.ShapeType.roundRect, {
        x, y: 1.0, w: 4.0, h: 1.5,
        fill: { color: pptxColor(color), transparency: 92 },
        line: { color: pptxColor(color), transparency: 70 },
        rectRadius: 0.12,
      });
      slide.addText(String(value), {
        x, y: 1.05, w: 4.0, h: 0.9,
        fontSize: 40, bold: true, color: pptxColor(color),
        align: "center", fontFace: "Calibri",
      });
      slide.addText(label, {
        x, y: 1.95, w: 4.0, h: 0.45,
        fontSize: 10, color: pptxColor(color),
        align: "center", fontFace: "Calibri",
      });
    });

    // Top competitors table
    const topComps = competitorsAll.slice(0, 6);
    if (topComps.length > 0) {
      const tableData = [
        [
          { text: "Concurrent",  options: { bold: true, color: "FFFFFF", fill: pptxColor(theme.primary) } },
          { text: t.pricing,     options: { bold: true, color: "FFFFFF", fill: pptxColor(theme.primary) } },
          { text: t.sentiment,   options: { bold: true, color: "FFFFFF", fill: pptxColor(theme.primary) } },
          { text: "Scrape",      options: { bold: true, color: "FFFFFF", fill: pptxColor(theme.primary) } },
        ],
        ...topComps.map((c) => [
          { text: c.name || "—" },
          { text: !isEmpty(c.pricing?.model) ? c.pricing.model : "—" },
          { text: c.reviews?.overall_sentiment || "—" },
          { text: c.scrape_status === "success" ? "✓" : "—" },
        ]),
      ];

      slide.addTable(tableData, {
        x: 0.35, y: 2.75, w: W - 0.7, h: (topComps.length + 1) * 0.42,
        fontSize: 9.5, fontFace: "Calibri",
        border: { type: "solid", pt: 0.3, color: pptxColor(theme.border) },
        fill: pptxColor(theme.bg),
        color: pptxColor(theme.text),
        rowH: 0.38,
        align: "left", valign: "middle",
      });
    }
  }

  // ── SLIDE 4: COMPETITORS ─────────────────────────────────────────────────────
  if (slideSelection.competitors !== false) {
    const competitorsAll = (context?.competitors_structured || []).filter(
      (c) => c?.name && !c.url?.includes("localhost")
    );

    // Split into groups of 3 per slide
    const perPage = 3;
    const pages   = Math.ceil(competitorsAll.length / perPage) || 1;

    for (let p = 0; p < pages; p++) {
      const slide = addSlide(
        pages > 1
          ? `${t.competitors} (${p + 1}/${pages})`
          : t.competitors
      );

      const group = competitorsAll.slice(p * perPage, (p + 1) * perPage);
      const colW  = (W - 0.7) / perPage;

      group.forEach((c, i) => {
        const x = 0.35 + i * colW;
        const y = 0.9;

        // Card background
        slide.addShape(pptx.ShapeType.roundRect, {
          x, y, w: colW - 0.12, h: H - 1.6,
          fill: { color: pptxColor(theme.bgAlt) },
          line: { color: pptxColor(theme.border) },
          rectRadius: 0.12,
        });

        // Avatar
        const initials = (c.name || "?")
          .split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
        slide.addShape(pptx.ShapeType.roundRect, {
          x: x + 0.15, y: y + 0.15, w: 0.55, h: 0.55,
          fill: { color: pptxColor(theme.primaryLight) },
          line: { color: pptxColor(theme.border) },
          rectRadius: 0.1,
        });
        slide.addText(initials, {
          x: x + 0.15, y: y + 0.15, w: 0.55, h: 0.55,
          fontSize: 14, bold: true, color: pptxColor(theme.primary),
          align: "center", valign: "middle", fontFace: "Calibri",
        });

        // Name
        slide.addText(c.name || "—", {
          x: x + 0.78, y: y + 0.17, w: colW - 1.0, h: 0.3,
          fontSize: 11, bold: true, color: pptxColor(theme.text),
          fontFace: "Calibri",
        });

        // URL
        const url = (c.url || "").replace(/^https?:\/\//, "");
        slide.addText(truncate(url, 35), {
          x: x + 0.78, y: y + 0.47, w: colW - 1.0, h: 0.22,
          fontSize: 8, color: pptxColor(theme.primary),
          fontFace: "Calibri",
        });

        let curY = y + 0.85;

        // Description
        const desc = c.general?.description;
        if (!isEmpty(desc)) {
          slide.addText(truncate(desc, 130), {
            x: x + 0.15, y: curY, w: colW - 0.3, h: 0.7,
            fontSize: 8.5, color: pptxColor(theme.textMuted),
            lineSpacingMultiple: 1.3, fontFace: "Calibri",
          });
          curY += 0.75;
        }

        // Strengths
        const strengths = [
          ...(c.competitive_analysis?.strengths || []),
          ...(c.competitive_analysis?.perceived_strengths || []).map((s) => s.point || s),
        ].filter((s) => !isEmpty(s)).slice(0, 3);

        if (strengths.length > 0) {
          slide.addText("+ Strengths", {
            x: x + 0.15, y: curY, w: colW - 0.3, h: 0.22,
            fontSize: 7.5, bold: true, color: "#0F6E56", fontFace: "Calibri",
          });
          curY += 0.22;
          strengths.forEach((s) => {
            slide.addText(`· ${truncate(s, 60)}`, {
              x: x + 0.15, y: curY, w: colW - 0.3, h: 0.22,
              fontSize: 8, color: "#0F6E56", fontFace: "Calibri",
            });
            curY += 0.22;
          });
        }

        // Weaknesses
        const weaknesses = [
          ...(c.competitive_analysis?.weaknesses || []),
          ...(c.competitive_analysis?.perceived_weaknesses || []).map((w) => w.point || w),
        ].filter((w) => !isEmpty(w)).slice(0, 3);

        if (weaknesses.length > 0) {
          slide.addText("– Weaknesses", {
            x: x + 0.15, y: curY, w: colW - 0.3, h: 0.22,
            fontSize: 7.5, bold: true, color: "#A32D2D", fontFace: "Calibri",
          });
          curY += 0.22;
          weaknesses.forEach((w) => {
            slide.addText(`· ${truncate(w, 60)}`, {
              x: x + 0.15, y: curY, w: colW - 0.3, h: 0.22,
              fontSize: 8, color: "#A32D2D", fontFace: "Calibri",
            });
            curY += 0.22;
          });
        }

        // Pricing chip
        if (!isEmpty(c.pricing?.model) && c.pricing.model !== "not_mentionned") {
          slide.addShape(pptx.ShapeType.roundRect, {
            x: x + 0.15, y: H - 1.05, w: colW - 0.3, h: 0.3,
            fill: { color: pptxColor(theme.primaryLight) },
            line: { color: pptxColor(theme.border) },
            rectRadius: 0.06,
          });
          slide.addText(c.pricing.model, {
            x: x + 0.15, y: H - 1.05, w: colW - 0.3, h: 0.3,
            fontSize: 8, color: pptxColor(theme.primary),
            align: "center", valign: "middle", fontFace: "Calibri",
          });
        }
      });
    }
  }

  // ── SLIDE 5: SWOT ────────────────────────────────────────────────────────────
  if (slideSelection.swot !== false && context?.swot) {
    const slide = addSlide(t.swot);
    const swot = context.swot;

    const quadrants = [
      { key: "strengths",     label: t.strengths,     sub: t.positive_int, color: "#0F6E56", bg: "#E1F5EE", border: "#9FE1CB", sign: "+" },
      { key: "weaknesses",    label: t.weaknesses,    sub: t.negative_int, color: "#A32D2D", bg: "#FCEBEB", border: "#F7C1C1", sign: "–" },
      { key: "opportunities", label: t.opportunities, sub: t.positive_ext, color: "#185FA5", bg: "#E6F1FB", border: "#B5D4F4", sign: "→" },
      { key: "threats",       label: t.threats,       sub: t.negative_ext, color: "#854F0B", bg: "#FAEEDA", border: "#FAC775", sign: "!" },
    ];

    const qW = (W - 0.7) / 2;
    const qH = (H - 1.6) / 2;

    quadrants.forEach(({ key, label, sub, color, bg, border, sign }, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x   = 0.35 + col * (qW + 0.08);
      const y   = 0.9  + row * (qH + 0.08);

      slide.addShape(pptx.ShapeType.roundRect, {
        x, y, w: qW, h: qH,
        fill: { color: bg.replace("#", "") },
        line: { color: border.replace("#", "") },
        rectRadius: 0.1,
      });

      slide.addText(label, {
        x: x + 0.15, y: y + 0.1, w: qW - 0.3, h: 0.32,
        fontSize: 12, bold: true, color: color.replace("#", ""),
        fontFace: "Calibri",
      });
      slide.addText(sub, {
        x: x + 0.15, y: y + 0.42, w: qW - 0.3, h: 0.22,
        fontSize: 7.5, color: color.replace("#", ""),
        transparency: 30, fontFace: "Calibri",
      });

      const items = (swot[key] || []).slice(0, 4);
      items.forEach((item, j) => {
        const point = typeof item === "string" ? item : item.point;
        slide.addText(`${sign} ${truncate(point, 70)}`, {
          x: x + 0.15, y: y + 0.7 + j * 0.35, w: qW - 0.3, h: 0.32,
          fontSize: 9, color: color.replace("#", ""),
          fontFace: "Calibri", lineSpacingMultiple: 1.2,
        });
      });
    });

    // Overall scores if available
    if (swot.overall_score) {
      const scores = [
        { key: "viability",         label: t.viability,   color: theme.accent },
        { key: "market_opportunity", label: t.opportunity, color: theme.primary },
        { key: "competition_risk",   label: t.risk,        color: "#A32D2D" },
      ];
      scores.forEach(({ key, label, color }, i) => {
        // Small score badge in footer area
      });
    }
  }

  // ── SLIDE 6: COMPETITIVE STRENGTHS ──────────────────────────────────────────
  if (slideSelection.competitive_str !== false) {
    const slide = addSlide(t.competitive_str);
    slide.addText(t.top_strengths, {
      x: 0.35, y: 0.8, w: W - 0.7, h: 0.3,
      fontSize: 10, color: pptxColor(theme.textMuted), fontFace: "Calibri",
    });

    const comps = (context?.competitors_structured || [])
      .filter((c) => c?.name)
      .slice(0, 5);

    comps.forEach((c, i) => {
      const y = 1.25 + i * 1.0;
      const strengths = [
        ...(c.competitive_analysis?.strengths || []),
        ...(c.competitive_analysis?.perceived_strengths || []).map((s) => s.point || s),
      ].filter((s) => !isEmpty(s)).slice(0, 3);

      // Initials
      const initials = (c.name || "?")
        .split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
      slide.addShape(pptx.ShapeType.roundRect, {
        x: 0.35, y, w: 0.55, h: 0.55,
        fill: { color: pptxColor(theme.primaryLight) },
        line: { color: pptxColor(theme.border) },
        rectRadius: 0.08,
      });
      slide.addText(initials, {
        x: 0.35, y, w: 0.55, h: 0.55,
        fontSize: 12, bold: true, color: pptxColor(theme.primary),
        align: "center", valign: "middle", fontFace: "Calibri",
      });

      // Name
      slide.addText(c.name || "—", {
        x: 1.0, y: y + 0.05, w: 2.5, h: 0.3,
        fontSize: 10, bold: true, color: pptxColor(theme.text), fontFace: "Calibri",
      });

      // Sentiment chip
      if (c.reviews?.overall_sentiment) {
        const sent = c.reviews.overall_sentiment.toLowerCase();
        const chipColor = sent.includes("positif") || sent.includes("positive") ? "#0F6E56"
                        : sent.includes("negatif") || sent.includes("negative") ? "#A32D2D"
                        : "#854F0B";
        const chipBg    = sent.includes("positif") || sent.includes("positive") ? "#E1F5EE"
                        : sent.includes("negatif") || sent.includes("negative") ? "#FCEBEB"
                        : "#FAEEDA";
        slide.addShape(pptx.ShapeType.roundRect, {
          x: 1.0, y: y + 0.35, w: 1.4, h: 0.25,
          fill: { color: chipBg.replace("#", "") },
          line: { color: chipColor.replace("#", ""), transparency: 40 },
          rectRadius: 0.05,
        });
        slide.addText(c.reviews.overall_sentiment, {
          x: 1.0, y: y + 0.35, w: 1.4, h: 0.25,
          fontSize: 7.5, color: chipColor.replace("#", ""),
          align: "center", valign: "middle", fontFace: "Calibri",
        });
      }

      // Strengths as pills
      let pillX = 3.7;
      strengths.forEach((s) => {
        const pillW = Math.min(3.5, s.length * 0.075 + 0.3);
        if (pillX + pillW > W - 0.4) return;
        slide.addShape(pptx.ShapeType.roundRect, {
          x: pillX, y: y + 0.12, w: pillW, h: 0.32,
          fill: { color: pptxColor(theme.primaryLight) },
          line: { color: pptxColor(theme.border) },
          rectRadius: 0.06,
        });
        slide.addText(truncate(s, 40), {
          x: pillX + 0.05, y: y + 0.12, w: pillW - 0.1, h: 0.32,
          fontSize: 8, color: pptxColor(theme.primary),
          align: "center", valign: "middle", fontFace: "Calibri",
        });
        pillX += pillW + 0.12;
      });

      // Separator line
      if (i < comps.length - 1) {
        slide.addShape(pptx.ShapeType.line, {
          x: 0.35, y: y + 0.72, w: W - 0.7, h: 0,
          line: { color: pptxColor(theme.border), width: 0.3 },
        });
      }
    });
  }

  // ── SLIDE 7: PRIORITY ACTIONS / STRATEGIES ───────────────────────────────────
  if (slideSelection.actions !== false && context?.swot) {
    const slide = addSlide(t.actions);
    slide.addText(t.strategies, {
      x: 0.35, y: 0.8, w: W - 0.7, h: 0.3,
      fontSize: 10, color: pptxColor(theme.textMuted), fontFace: "Calibri",
    });

    const strategies = [
      { key: "so_strategies", label: t.so, color: "#0F6E56", bg: "#E1F5EE", border: "#9FE1CB" },
      { key: "st_strategies", label: t.st, color: "#185FA5", bg: "#E6F1FB", border: "#B5D4F4" },
      { key: "wo_strategies", label: t.wo, color: "#854F0B", bg: "#FAEEDA", border: "#FAC775" },
      { key: "wt_strategies", label: t.wt, color: "#A32D2D", bg: "#FCEBEB", border: "#F7C1C1" },
    ];

    const swot = context.swot;
    const colW = (W - 0.7) / 4;

    strategies.forEach(({ key, label, color, bg, border }, i) => {
      const x = 0.35 + i * (colW + 0.04);
      const items = (swot[key] || []).slice(0, 4);

      slide.addShape(pptx.ShapeType.roundRect, {
        x, y: 1.2, w: colW, h: H - 2.0,
        fill: { color: bg.replace("#", "") },
        line: { color: border.replace("#", "") },
        rectRadius: 0.1,
      });

      slide.addText(label, {
        x: x + 0.1, y: 1.3, w: colW - 0.2, h: 0.32,
        fontSize: 9.5, bold: true, color: color.replace("#", ""),
        fontFace: "Calibri",
      });

      items.forEach((item, j) => {
        slide.addText(`→ ${truncate(item, 75)}`, {
          x: x + 0.1, y: 1.72 + j * 0.72, w: colW - 0.2, h: 0.65,
          fontSize: 8.5, color: color.replace("#", ""),
          lineSpacingMultiple: 1.3, fontFace: "Calibri", valign: "top",
        });
      });

      if (items.length === 0) {
        slide.addText("—", {
          x: x + 0.1, y: 1.72, w: colW - 0.2, h: 0.35,
          fontSize: 9, color: color.replace("#", ""),
          transparency: 40, fontFace: "Calibri",
        });
      }
    });
  }

  // ── SLIDE 8: RECOMMENDATIONS ─────────────────────────────────────────────────
  if (slideSelection.recommendations !== false && context?.swot) {
    const slide = addSlide(t.recommendations);
    const swot = context.swot;

    slide.addText(t.priority_actions, {
      x: 0.35, y: 0.8, w: W - 0.7, h: 0.3,
      fontSize: 10, color: pptxColor(theme.textMuted), fontFace: "Calibri",
    });

    const actions = (swot.priority_actions || []).slice(0, 5);
    actions.forEach((action, i) => {
      const y = 1.25 + i * 1.0;

      // Number circle
      slide.addShape(pptx.ShapeType.ellipse, {
        x: 0.35, y: y + 0.05, w: 0.42, h: 0.42,
        fill: { color: pptxColor(theme.primary) },
        line: { color: pptxColor(theme.primary) },
      });
      slide.addText(String(i + 1), {
        x: 0.35, y: y + 0.05, w: 0.42, h: 0.42,
        fontSize: 12, bold: true, color: "FFFFFF",
        align: "center", valign: "middle", fontFace: "Calibri",
      });

      // Action text
      slide.addText(action.action || action, {
        x: 0.9, y: y + 0.05, w: W - 2.2, h: 0.3,
        fontSize: 11, bold: true, color: pptxColor(theme.text),
        fontFace: "Calibri",
      });

      // Why
      if (!isEmpty(action.why)) {
        slide.addText(truncate(action.why, 150), {
          x: 0.9, y: y + 0.37, w: W - 2.2, h: 0.28,
          fontSize: 9, color: pptxColor(theme.textMuted),
          fontFace: "Calibri",
        });
      }

      // Timeline chip
      if (!isEmpty(action.timeline)) {
        slide.addShape(pptx.ShapeType.roundRect, {
          x: W - 1.6, y: y + 0.1, w: 1.2, h: 0.28,
          fill: { color: pptxColor(theme.primaryLight) },
          line: { color: pptxColor(theme.border) },
          rectRadius: 0.05,
        });
        slide.addText(action.timeline, {
          x: W - 1.6, y: y + 0.1, w: 1.2, h: 0.28,
          fontSize: 7.5, color: pptxColor(theme.primary),
          align: "center", valign: "middle", fontFace: "Calibri",
        });
      }

      // Separator
      if (i < actions.length - 1) {
        slide.addShape(pptx.ShapeType.line, {
          x: 0.35, y: y + 0.75, w: W - 0.7, h: 0,
          line: { color: pptxColor(theme.border), width: 0.3 },
        });
      }
    });

    // Final recommendation
    if (!isEmpty(swot.overall_score?.recommendation)) {
      slide.addShape(pptx.ShapeType.roundRect, {
        x: 0.35, y: H - 1.5, w: W - 0.7, h: 0.7,
        fill: { color: pptxColor(theme.primaryLight) },
        line: { color: pptxColor(theme.primary), transparency: 60 },
        rectRadius: 0.1,
      });
      slide.addText(`${t.recommendation}: ${swot.overall_score.recommendation}`, {
        x: 0.55, y: H - 1.5, w: W - 1.1, h: 0.7,
        fontSize: 13, bold: true, color: pptxColor(theme.primary),
        align: "center", valign: "middle", fontFace: "Calibri",
      });
    }
  }

  // ── SLIDE 9: THANK YOU ───────────────────────────────────────────────────────
  if (slideSelection.thank_you !== false) {
    const slide = pptx.addSlide();
    slide.background = { color: pptxColor(theme.bgAlt) };

    // Left colored panel
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: 5.5, h: H,
      fill: { color: pptxColor(theme.primary) },
      line: { color: pptxColor(theme.primary) },
    });

    // Decorative circle
    slide.addShape(pptx.ShapeType.ellipse, {
      x: 0.5, y: H - 3, w: 3.5, h: 3.5,
      fill: { color: pptxColor(theme.primaryDark), transparency: 50 },
      line: { color: pptxColor(theme.primaryDark), transparency: 50 },
    });

    // Thank you text
    slide.addText(t.thank_you, {
      x: 0.5, y: 2.2, w: 4.5, h: 1.4,
      fontSize: 40, bold: true, color: "FFFFFF", fontFace: "Calibri",
    });

    if (presenterName) {
      slide.addText(presenterName, {
        x: 0.5, y: 3.7, w: 4.5, h: 0.45,
        fontSize: 14, color: "FFFFFF", transparency: 25, fontFace: "Calibri",
      });
    }

    slide.addText(t.generated_by, {
      x: 0.5, y: H - 0.7, w: 4.5, h: 0.45,
      fontSize: 8, color: "FFFFFF", transparency: 40, fontFace: "Calibri",
    });

    // Right: next steps
    slide.addText(t.next_steps, {
      x: 6.0, y: 1.2, w: 6.8, h: 0.5,
      fontSize: 16, bold: true, color: pptxColor(theme.primary), fontFace: "Calibri",
    });
    slide.addShape(pptx.ShapeType.line, {
      x: 6.0, y: 1.75, w: 1.2, h: 0,
      line: { color: pptxColor(theme.primary), width: 2 },
    });

    const nextSteps = t.next_steps_list;
    nextSteps.forEach((step, i) => {
      slide.addShape(pptx.ShapeType.ellipse, {
        x: 6.0, y: 2.1 + i * 0.9, w: 0.3, h: 0.3,
        fill: { color: pptxColor(theme.primary) },
        line: { color: pptxColor(theme.primary) },
      });
      slide.addText(step, {
        x: 6.45, y: 2.1 + i * 0.9, w: 6.3, h: 0.35,
        fontSize: 10.5, color: pptxColor(theme.text), fontFace: "Calibri",
      });
    });
  }

  // Write file
  return pptx.writeFile({ fileName: `${companyName || "Analyse_Concurrentielle"}_${date}.pptx` });
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF GENERATOR
// Uses jsPDF + html2canvas to render the DOM slide previews into a PDF
// The PresentationModal renders invisible slide DOM nodes that we capture.
// ─────────────────────────────────────────────────────────────────────────────
export async function generatePDF(slidesContainerRef, options = {}) {
  const { companyName = "Analyse_Concurrentielle", date = "" } = options;

  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);

  const container = slidesContainerRef.current;
  if (!container) throw new Error("Slides container not found");

  const slideEls = container.querySelectorAll("[data-slide]");
  if (slideEls.length === 0) throw new Error("No slides to export");

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < slideEls.length; i++) {
    const el = slideEls[i];
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: null,
      logging: false,
    });
    const imgData = canvas.toDataURL("image/jpeg", 0.92);

    if (i > 0) pdf.addPage();
    pdf.addImage(imgData, "JPEG", 0, 0, pdfW, pdfH);
  }

  pdf.save(`${companyName}_${date}.pdf`);
}