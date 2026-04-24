"""
Sustainability Coach agent — actionable green recommendations for Tunisian entrepreneurs.

Uses Tavily search for current program data + knowledge base fallback.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_groq import ChatGroq

from green_analysis.agents.state import EnvironmentalState, Recommendation
from green_analysis.tools.vectorstore import semantic_knowledge_search
from green_analysis.tools.web_search import search_green_funding_programs

logger = logging.getLogger(__name__)


def _gather_recommendation_data(sector: str) -> tuple[dict[str, Any], list[dict[str, str]]]:
    """Collect data for tailoring recommendations. Returns (data, trace_steps)."""
    data: dict[str, Any] = {"sources_used": []}
    trace: list[dict[str, str]] = []

    # 1. Semantic search for Tunisian programs + sector data
    query = f"Tunisian green funding programs and sustainability for {sector} businesses"
    trace.append({"step": "tool_call", "detail": f"Semantic search: '{query}'"})
    kb_results = semantic_knowledge_search.invoke({"query": query, "top_k": 8})
    if kb_results:
        data["knowledge_base"] = kb_results
        data["sources_used"].append("Semantic vector store (FAISS)")
        sources_found = set(r.get("source", "") for r in kb_results)
        trace.append({"step": "tool_result", "detail": f"Found {len(kb_results)} entries from {', '.join(sources_found)}"})
    else:
        trace.append({"step": "tool_result", "detail": "No semantic matches found"})

    # 2. Live search for the most impactful programs
    for program_name in ["FTE ANME", "Prosol"]:
        trace.append({"step": "tool_call", "detail": f"Tavily web search: '{program_name}'"})
        result = search_green_funding_programs.invoke({
            "sector": sector,
            "program_name": program_name,
        })
        if not result.get("fallback"):
            data.setdefault("live_search", []).append(result)
            data["sources_used"].append(f"Tavily search: {program_name}")
            trace.append({"step": "tool_result", "detail": f"Got live data for '{program_name}'"})
        else:
            trace.append({"step": "tool_result", "detail": f"Tavily unavailable for '{program_name}'"})

    return data, trace


def run_sustainability_coach(
    state: EnvironmentalState,
    llm: ChatGroq,
    system_prompt: str,
) -> dict[str, Any]:
    """Generate sustainability recommendations."""

    parsed = state.parsed_input
    impact = state.impact_assessment
    if not parsed:
        return {
            "current_agent": ["sustainability_coach"],
            "errors": ["Sustainability coach: no parsed input available"],
        }

    # Gather data
    tool_data, trace_steps = _gather_recommendation_data(parsed.industry_sector)

    impact_summary = ""
    if impact:
        impact_summary = (
            f"\n**Résumé de l'évaluation d'impact :**\n"
            f"- Carbone : {impact.carbon_estimate_range}\n"
            f"- Intensité énergétique : {impact.energy_intensity}\n"
            f"- Utilisation de l'eau : {impact.water_usage_category}\n"
            f"- Profil de déchets : {', '.join(impact.waste_profile)}\n"
            f"- Risques principaux : {', '.join(impact.key_environmental_risks)}\n"
        )

    user_message = (
        f"Fournissez des recommandations de durabilité pour cette entreprise tunisienne :\n\n"
        f"**Entreprise :** {parsed.business_description}\n"
        f"**Secteur :** {parsed.industry_sector} / {parsed.sub_sector}\n"
        f"**Localisation :** {parsed.location}\n"
        f"**Taille :** {parsed.scale}\n"
        f"**Activités :** {', '.join(parsed.activities)}\n"
        f"**Ressources utilisées :** {', '.join(parsed.resources_used)}\n"
        f"**Exports vers l'UE :** {parsed.exports_to_eu}\n"
        f"{impact_summary}\n"
        f"**Données sur les programmes et le secteur issues des outils :**\n```json\n{json.dumps(tool_data, indent=2, default=str)}\n```\n\n"
        f"Retournez un tableau JSON de 5 à 10 objets Recommendation. Chacun doit contenir : "
        f"title, category, description, estimated_impact, implementation_difficulty, "
        f"estimated_cost, tunisia_context, relevant_programs.\n"
        f"Retournez UNIQUEMENT un tableau JSON valide, sans balises markdown."
    )

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_message),
    ]

    try:
        response = llm.invoke(messages)
        content = response.content.strip()

        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        raw_list = json.loads(content)
        if isinstance(raw_list, dict) and "recommendations" in raw_list:
            raw_list = raw_list["recommendations"]

        recs = [Recommendation.model_validate(r) for r in raw_list]

        trace_steps.append({"step": "llm_call", "detail": "Generated sustainability recommendations from tool data"})
        trace_steps.append({"step": "result", "detail": f"Produced {len(recs)} recommendations across categories"})

        return {
            "recommendations": recs,
            "current_agent": ["sustainability_coach"],
            "_trace": {"sustainability_coach": trace_steps},
        }

    except (json.JSONDecodeError, Exception) as exc:
        logger.error("Sustainability coach failed: %s", exc)
        return {
            "current_agent": ["sustainability_coach"],
            "errors": [f"Sustainability coach error: {exc}"],
            "_trace": {"sustainability_coach": [{"step": "error", "detail": str(exc)}]},
        }
