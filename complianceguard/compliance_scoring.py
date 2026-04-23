"""
ComplianceGuard — compliance_scoring.py
========================================
Moteur de scoring dynamique pour l'analyse de conformité.
Remplace le système hardcodé par une triangulation :
  1. GraphRAG (Neo4j) — Règles juridiques dynamiques
  2. Web Freshness (Serper) — Vérification d'actualité
  3. LLM Sémantique — Analyse fine de la description
"""

import os
import re
import logging
from typing import Any
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# ── FALLBACK CONSTANTS (utilisées si Neo4j est indisponible) ──────────────────

FALLBACK_CAPITAL = {"SUARL": 1000, "SARL": 1000, "SA": 5000, "SAS": 1000}
FALLBACK_CAPITAL_PAIEMENT = 1000000

FALLBACK_RISK_PROFILES = {
    "Fintech": {
        "risque_global": "élevé",
        "autorisations_requises": ["Agrément BCT", "Déclaration INPDP"],
        "capital_recommande": 1000000,
        "delai_conformite": "6-12 mois",
    },
    "HealthTech": {
        "risque_global": "élevé",
        "autorisations_requises": ["Autorisation Ministère Santé", "Déclaration INPDP"],
        "capital_recommande": 50000,
        "delai_conformite": "3-6 mois",
    },
    "EdTech": {
        "risque_global": "moyen",
        "autorisations_requises": ["Déclaration INPDP"],
        "capital_recommande": 10000,
        "delai_conformite": "1-3 mois",
    },
    "E-commerce": {
        "risque_global": "moyen",
        "autorisations_requises": ["Déclaration INPDP"],
        "capital_recommande": 5000,
        "delai_conformite": "1-2 mois",
    },
    "SaaS": {
        "risque_global": "faible",
        "autorisations_requises": [],
        "capital_recommande": 1000,
        "delai_conformite": "< 1 mois",
    },
}

# ── STRUCTURED OUTPUT MODELS ─────────────────────────────────────────────────

class ProjectAnalysis(BaseModel):
    """Analyse sémantique structurée du projet par le LLM."""
    innovation_score: int = Field(description="Score d'innovation de 0 à 100")
    innovation_justification: str = Field(description="Justification courte du score d'innovation")
    has_payment_activity: bool = Field(description="True si le projet implique des services de paiement, transfert d'argent, ou monnaie électronique")
    payment_justification: str = Field(description="Justification courte")
    data_sensitivity: str = Field(description="'critique' si données de santé/mineurs/financières, 'standard' si données personnelles classiques, 'minimal' si peu ou pas de données")
    data_justification: str = Field(description="Justification courte")
    is_ecommerce: bool = Field(description="True si le projet vend des biens/services en ligne")
    ecommerce_justification: str = Field(description="Justification courte")
    detected_sectors: list[str] = Field(description="Secteurs d'activité détectés (ex: Fintech, HealthTech, EdTech)")


# ── SOURCE 1: GRAPHRAG (Neo4j) ───────────────────────────────────────────────

def _get_graph():
    """Lazy import pour éviter les imports circulaires."""
    try:
        from complianceguard.tools.retriever import get_graph
        return get_graph()
    except Exception as e:
        logger.warning(f"[Scoring] Neo4j indisponible: {e}")
        return None


def query_graph_requirements(sector: str, type_societe: str) -> dict[str, Any]:
    """
    Interroge Neo4j pour récupérer dynamiquement les règles juridiques.
    Retourne un dict avec les seuils, conditions et obligations trouvés.
    """
    graph = _get_graph()
    if not graph:
        return {"source": "fallback", "capital_seuil": FALLBACK_CAPITAL.get(type_societe, 1000)}

    result = {"source": "graphrag"}

    # 1. Chercher le capital minimum pour le type de société
    try:
        cap_query = """
        MATCH (n)
        WHERE (toLower(coalesce(n.description, '')) CONTAINS 'capital' 
               OR toLower(coalesce(n.valeur, '')) CONTAINS 'capital')
          AND toLower(coalesce(n.description, '') + ' ' + coalesce(n.valeur, '')) CONTAINS toLower($type_soc)
        RETURN n.description AS description, n.valeur AS valeur, n.reference AS reference
        LIMIT 3
        """
        rows = graph.query(cap_query, params={"type_soc": type_societe})
        if rows:
            # Extraire un montant numérique
            for row in rows:
                text = f"{row.get('description', '')} {row.get('valeur', '')}"
                amounts = re.findall(r"([\d\s.]+)\s*(?:TND|dinars?|DT)", text, re.IGNORECASE)
                if amounts:
                    amount_str = amounts[0].replace(" ", "").replace(".", "")
                    try:
                        result["capital_seuil"] = int(amount_str)
                        result["capital_article"] = row.get("reference", "")
                        break
                    except ValueError:
                        pass
    except Exception as e:
        logger.warning(f"[Scoring] Erreur requête capital: {e}")

    if "capital_seuil" not in result:
        result["capital_seuil"] = FALLBACK_CAPITAL.get(type_societe, 1000)

    # 2. Chercher les conditions du Startup Act
    try:
        startup_query = """
        MATCH (n)
        WHERE toLower(coalesce(n.reference, '')) CONTAINS '2018-20'
           OR toLower(coalesce(n.description, '')) CONTAINS 'startup act'
           OR toLower(coalesce(n.description, '')) CONTAINS 'label startup'
        RETURN n.description AS description, n.reference AS reference
        LIMIT 5
        """
        rows = graph.query(startup_query)
        if rows:
            result["startup_conditions"] = [
                {"description": r.get("description", ""), "reference": r.get("reference", "")}
                for r in rows if r.get("description")
            ]
    except Exception as e:
        logger.warning(f"[Scoring] Erreur requête Startup Act: {e}")

    # 3. Chercher les obligations sectorielles (BCT, INPDP, etc.)
    try:
        sector_query = """
        MATCH (n)-[r]->(m)
        WHERE type(r) IN ['CONDITIONNE', 'PREVOIT', 'APPLIQUE', 'FIXE']
          AND (toLower(coalesce(n.description, '')) CONTAINS toLower($sector)
               OR toLower(coalesce(m.description, '')) CONTAINS toLower($sector))
        RETURN n.description AS src_desc, type(r) AS rel, m.description AS tgt_desc,
               n.reference AS src_ref
        LIMIT 5
        """
        rows = graph.query(sector_query, params={"sector": sector})
        if rows:
            result["sector_obligations"] = [
                {"description": f"{r.get('src_desc', '')} → {r.get('tgt_desc', '')}", 
                 "reference": r.get("src_ref", "")}
                for r in rows
            ]
    except Exception as e:
        logger.warning(f"[Scoring] Erreur requête secteur: {e}")

    return result


# ── SOURCE 2: WEB FRESHNESS ─────────────────────────────────────────────────

def check_law_freshness(law_references: list[str]) -> dict[str, float]:
    """
    Vérifie via Serper si les lois citées sont toujours en vigueur.
    Retourne un dict {reference: score} où 1.0 = en vigueur, 0.0 = abrogée.
    """
    serper_key = os.getenv("SERPER_API_KEY", "").strip()
    if not serper_key or not law_references:
        return {ref: 0.8 for ref in law_references}  # Score neutre par défaut

    scores = {}
    try:
        from langchain_community.utilities import GoogleSerperAPIWrapper
        search = GoogleSerperAPIWrapper(serper_api_key=serper_key, k=2)

        for ref in law_references[:4]:  # Max 4 pour limiter les appels
            try:
                query = f'"{ref}" Tunisie (abrogée OR modifiée OR remplacée OR en vigueur)'
                results = search.results(query)
                snippets = " ".join(
                    item.get("snippet", "") for item in results.get("organic", [])
                ).lower()

                if any(w in snippets for w in ["abrogé", "a été abrogé", "remplacé par", "n'est plus"]):
                    logger.info(f"[Scoring] ALERTE: {ref} semble obsolète")
                    scores[ref] = 0.1
                elif any(w in snippets for w in ["en vigueur", "applicable", "modifié par"]):
                    scores[ref] = 1.0
                else:
                    scores[ref] = 0.8  # Pas de signal clair
            except Exception:
                scores[ref] = 0.8
    except ImportError:
        return {ref: 0.8 for ref in law_references}

    return scores


# ── SOURCE 3: LLM SÉMANTIQUE ────────────────────────────────────────────────

def analyze_project_semantically(description: str, sector: str) -> ProjectAnalysis | None:
    """
    Utilise le LLM pour analyser la description du projet de manière structurée.
    Remplace le pattern matching naïf par une compréhension contextuelle.
    """
    try:
        from complianceguard.ask_question import _build_llm
        from langchain_core.messages import HumanMessage, SystemMessage

        llm = _build_llm()
        structured_llm = llm.with_structured_output(ProjectAnalysis)

        system = """Tu es un analyste juridique expert en droit tunisien des startups.
Analyse la description du projet et évalue chaque critère de manière factuelle.
Pour le score d'innovation : 80-100 = technologie disruptive claire (IA, blockchain, deep tech), 
50-79 = innovation incrémentale, 20-49 = peu innovant, 0-19 = aucune innovation.
Sois strict et factuel. Ne surestime pas l'innovation."""

        human = f"""Secteur déclaré : {sector}

Description du projet :
{description}

Analyse ce projet selon les critères demandés."""

        result = structured_llm.invoke([
            SystemMessage(content=system),
            HumanMessage(content=human),
        ])
        return result
    except Exception as e:
        logger.error(f"[Scoring] Erreur LLM: {e}")
        return None


# ── ORCHESTRATEUR PRINCIPAL ──────────────────────────────────────────────────

def _capital_score(capital: int | None, seuil: int) -> tuple[int, str]:
    """Score mathématique du capital."""
    if capital is None:
        return 30, "Capital non spécifié - à définir"
    if capital >= seuil:
        return 100, f"✓ Capital de {capital:,} TND ≥ {seuil:,} TND requis"
    ratio = capital / seuil
    score = int(ratio * 100)
    manque = seuil - capital
    return score, f"Capital insuffisant: {capital:,} TND < {seuil:,} TND (manque {manque:,} TND)"


def calculate_conformite_score(data: dict) -> dict:
    """
    Orchestrateur principal. Fusionne GraphRAG + Web + LLM
    et retourne le même format ConformiteResult que l'ancien système.
    Intègre les résultats de l'audit (quiz) s'ils sont fournis.
    """
    description = data.get("project_description", "") or ""
    sector = data.get("sector", "SaaS") or "SaaS"
    capital = data.get("capital")
    type_societe = data.get("type_societe", "SUARL") or "SUARL"
    audit_results = data.get("audit_results")

    criteres_results = []
    total_weighted_score = 0
    total_weight = 0
    law_refs_to_check = []
    
    # Audit integration variables
    audit_impact_score = None
    if audit_results:
        try:
            audit_qs = audit_results.get("questions", [])
            audit_ans = audit_results.get("answers", [])
            earned = 0
            total = 0
            for i, q in enumerate(audit_qs):
                if i < len(audit_ans):
                    weight = q.get("weight", 2)
                    total += weight
                    if audit_ans[i] == q.get("compliantAnswer", 0):
                        earned += weight
                    elif audit_ans[i] == 1: # Partiel
                        earned += weight * 0.3
            if total > 0:
                audit_impact_score = int((earned / total) * 100)
        except Exception as e:
            logger.warning(f"[Scoring] Erreur traitement audit_results: {e}")

    # ── Source 1: GraphRAG ────────────────────────────────────────────────
    print("[Scoring] Interrogation du GraphRAG...")
    graph_data = query_graph_requirements(sector, type_societe)
    graph_source = graph_data.get("source", "fallback")
    print(f"[Scoring] Source: {graph_source}")

    # ── Source 3: LLM Analyse sémantique ──────────────────────────────────
    print("[Scoring] Analyse sémantique LLM...")
    llm_analysis = analyze_project_semantically(description, sector)

    # ── CRITÈRE 1: Éligibilité Startup Act (25%) ──────────────────────────
    innov_score = 50  # Default
    innov_details = "Analyse non disponible"

    if llm_analysis:
        innov_score = llm_analysis.innovation_score
        innov_details = llm_analysis.innovation_justification
    
    if innov_score >= 60:
        innov_status = "check"
    elif innov_score >= 40:
        innov_status = "warning"
    else:
        innov_status = "x"

    # Enrichir avec les conditions du graphe
    startup_context = ""
    if graph_data.get("startup_conditions"):
        startup_context = " | Conditions GraphRAG: " + "; ".join(
            c["description"][:80] for c in graph_data["startup_conditions"][:2]
        )

    criteres_results.append({
        "label": "Éligibilité Label Startup",
        "score": innov_score,
        "status": innov_status,
        "article": "Art. 3, Loi 2018-20",
        "article_source": "Loi n° 2018-20 (Startup Act)",
        "details": innov_details + startup_context,
        "category": "Startup Act",
        "recommendation": "Soumettre dossier au Startup Act" if innov_score >= 60 else "Renforcer le caractère innovant du projet",
    })
    total_weighted_score += innov_score * 25
    total_weight += 25
    law_refs_to_check.append("Loi 2018-20")

    # ── CRITÈRE 2: Capital social (15%) ───────────────────────────────────
    cap_seuil = graph_data.get("capital_seuil", FALLBACK_CAPITAL.get(type_societe, 1000))
    cap_article = graph_data.get("capital_article", "Code des Sociétés Commerciales")
    cap_score, cap_details = _capital_score(capital, cap_seuil)

    criteres_results.append({
        "label": f"Capital social ({type_societe})",
        "score": cap_score,
        "status": "check" if cap_score == 100 else "warning" if cap_score >= 50 else "x",
        "article": cap_article,
        "article_source": "Code des Sociétés Commerciales",
        "details": cap_details + (f" [Source: {graph_source}]" if graph_source == "graphrag" else ""),
        "category": "Forme juridique",
        "recommendation": None if cap_score == 100 else f"Augmenter le capital à {cap_seuil:,} TND minimum",
    })
    total_weighted_score += cap_score * 15
    total_weight += 15

    # ── CRITÈRE 3: Autorisations sectorielles — BCT (20%) ────────────────
    has_payment = False
    payment_details = "Pas d'activité de paiement détectée"

    if llm_analysis:
        has_payment = llm_analysis.has_payment_activity
        payment_details = llm_analysis.payment_justification
    elif sector == "Fintech":
        has_payment = True
        payment_details = "Secteur Fintech — activité de paiement présumée"

    if has_payment:
        # BCT obligatoire
        bct_cap_score, bct_cap_details = _capital_score(capital, FALLBACK_CAPITAL_PAIEMENT)
        criteres_results.append({
            "label": "Agrément BCT (Paiement)",
            "score": 20,
            "status": "x",
            "article": "Art. 34, Loi 2016-48",
            "article_source": "Loi n° 2016-48 + Circulaire BCT 2020-01",
            "details": f"Activité de paiement détectée par l'IA: {payment_details}. Agrément BCT OBLIGATOIRE.",
            "category": "Réglementation BCT",
            "recommendation": "Déposer demande d'agrément auprès de la BCT (délai: 3-6 mois)",
        })
        total_weighted_score += 20 * 20
        total_weight += 20

        criteres_results.append({
            "label": "Capital établissement paiement",
            "score": bct_cap_score,
            "status": "check" if bct_cap_score == 100 else "x",
            "article": "Circ. 2020-01, Art. 5",
            "article_source": "Circulaire BCT 2020-01",
            "details": bct_cap_details,
            "category": "Réglementation BCT",
            "recommendation": None if bct_cap_score == 100 else "Capital de 1 000 000 TND requis",
        })
        total_weighted_score += bct_cap_score * 10
        total_weight += 10
        law_refs_to_check.append("Loi 2016-48")
    else:
        criteres_results.append({
            "label": "Agrément BCT",
            "score": 100,
            "status": "check",
            "article": "Art. 34, Loi 2016-48",
            "article_source": "Loi n° 2016-48",
            "details": f"Pas d'activité de paiement détectée — {payment_details}",
            "category": "Réglementation BCT",
            "recommendation": None,
        })
        total_weighted_score += 100 * 20
        total_weight += 20

    # ── CRITÈRE 4: Protection des données (15%) ──────────────────────────
    data_score = 80
    data_status = "check"
    data_details = "Obligations standard"
    data_reco = None

    if llm_analysis:
        sensitivity = llm_analysis.data_sensitivity
        if sensitivity == "critique":
            data_score = 35
            data_status = "warning"
            data_details = f"Données sensibles détectées: {llm_analysis.data_justification}. Déclaration INPDP obligatoire."
            data_reco = "Effectuer déclaration sur https://www.inpdp.tn (gratuit, ~2 semaines)"
        elif sensitivity == "standard":
            data_score = 60
            data_status = "warning"
            data_details = f"Traitement de données détecté: {llm_analysis.data_justification}. Déclaration INPDP recommandée."
            data_reco = "Effectuer déclaration INPDP par précaution"
    elif sector in ["Fintech", "HealthTech", "EdTech"]:
        data_score = 35
        data_status = "warning"
        data_details = f"Secteur {sector}: déclaration INPDP obligatoire (fallback)"
        data_reco = "Effectuer déclaration sur https://www.inpdp.tn"

    criteres_results.append({
        "label": "Protection des données (INPDP)",
        "score": data_score,
        "status": data_status,
        "article": "Art. 7, Loi organique 2004-63",
        "article_source": "Loi organique n° 2004-63",
        "details": data_details,
        "category": "Protection des données",
        "recommendation": data_reco,
    })
    total_weighted_score += data_score * 15
    total_weight += 15
    law_refs_to_check.append("Loi 2004-63")

    # ── CRITÈRE 5: Commerce électronique (10%) ───────────────────────────
    is_ecom = False
    ecom_details = "Pas d'activité e-commerce détectée"

    if llm_analysis:
        is_ecom = llm_analysis.is_ecommerce
        ecom_details = llm_analysis.ecommerce_justification

    if is_ecom:
        criteres_results.append({
            "label": "Mentions légales site web",
            "score": 60,
            "status": "warning",
            "article": "Art. 9, Loi 2000-83",
            "article_source": "Loi n° 2000-83",
            "details": f"E-commerce détecté: {ecom_details}. Mentions légales obligatoires.",
            "category": "Commerce électronique",
            "recommendation": "Créer page 'Mentions légales' complète",
        })
        total_weighted_score += 60 * 10
        total_weight += 10
        law_refs_to_check.append("Loi 2000-83")
    else:
        criteres_results.append({
            "label": "Commerce électronique",
            "score": 90,
            "status": "check",
            "article": "Art. 9, Loi 2000-83",
            "article_source": "Loi n° 2000-83",
            "details": ecom_details,
            "category": "Commerce électronique",
            "recommendation": None,
        })
        total_weighted_score += 90 * 10
        total_weight += 10

    # ── Source 2: Web Freshness (15%) ─────────────────────────────────────
    print("[Scoring] Vérification fraîcheur législative...")
    freshness_scores = check_law_freshness(law_refs_to_check)
    avg_freshness = sum(freshness_scores.values()) / len(freshness_scores) if freshness_scores else 0.8
    freshness_pct = int(avg_freshness * 100)

    obsolete_laws = [ref for ref, score in freshness_scores.items() if score < 0.5]
    if obsolete_laws:
        fresh_details = f"⚠ Lois potentiellement obsolètes: {', '.join(obsolete_laws)}"
        fresh_status = "warning"
    else:
        fresh_details = "Toutes les lois citées semblent en vigueur"
        fresh_status = "check"

    criteres_results.append({
        "label": "Fraîcheur législative",
        "score": freshness_pct,
        "status": fresh_status,
        "article": "Vérification web automatique",
        "article_source": "JORT / Sources officielles",
        "details": fresh_details,
        "category": "Veille juridique",
        "recommendation": f"Vérifier manuellement: {', '.join(obsolete_laws)}" if obsolete_laws else None,
    })
    total_weighted_score += freshness_pct * 15
    total_weight += 15

    # ── Source 4: Audit Quiz (Complément) ────────────────────────────────
    if audit_impact_score is not None:
        criteres_results.append({
            "label": "Audit de conformité (Quiz)",
            "score": audit_impact_score,
            "status": "check" if audit_impact_score >= 75 else "warning" if audit_impact_score >= 50 else "x",
            "article": "Auto-audit contextuel",
            "article_source": "Expertise ComplianceGuard",
            "details": f"Score obtenu lors du quiz technique: {audit_impact_score}%.",
            "category": "Audit Expert",
            "recommendation": "Revoir les points de vigilance identifiés lors du quiz" if audit_impact_score < 100 else None,
        })
        total_weighted_score += audit_impact_score * 30 # Poids important
        total_weight += 30

    # ── Enrichir avec obligations du graphe ───────────────────────────────
    if graph_data.get("sector_obligations"):
        for obligation in graph_data["sector_obligations"][:2]:
            criteres_results.append({
                "label": f"Obligation sectorielle (GraphRAG)",
                "score": 50,
                "status": "warning",
                "article": obligation.get("reference", "GraphRAG"),
                "article_source": "Knowledge Graph",
                "details": obligation.get("description", "")[:200],
                "category": sector,
                "recommendation": "Vérifier cette obligation avec un juriste",
            })

    # ── SCORE FINAL ──────────────────────────────────────────────────────
    score_global = int(total_weighted_score / total_weight) if total_weight > 0 else 50

    if score_global >= 75:
        status_global = "conforme"
    elif score_global >= 50:
        status_global = "conforme_reserves"
    else:
        status_global = "non_conforme"

    risk_profile = FALLBACK_RISK_PROFILES.get(sector, FALLBACK_RISK_PROFILES["SaaS"])
    all_recommendations = [c["recommendation"] for c in criteres_results if c.get("recommendation")]

    return {
        "score_global": score_global,
        "status": status_global,
        "criteres": criteres_results,
        "risk_profile": {
            "niveau": risk_profile["risque_global"],
            "autorisations_requises": risk_profile["autorisations_requises"],
            "capital_recommande": risk_profile["capital_recommande"],
            "delai_conformite": risk_profile["delai_conformite"],
        },
        "recommendations": all_recommendations[:5],
        "lois_applicables": list(dict.fromkeys(law_refs_to_check)),
    }
