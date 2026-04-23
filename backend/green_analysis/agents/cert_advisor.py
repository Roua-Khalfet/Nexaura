"""
Green Certification Advisor agent — recommends relevant certifications and eco-labels.

Uses Tavily search for current data + knowledge base fallback.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_groq import ChatGroq

from green_analysis.agents.state import Certification, EnvironmentalState
from green_analysis.tools.vectorstore import semantic_knowledge_search
from green_analysis.tools.web_search import search_certification_requirements

logger = logging.getLogger(__name__)


def _gather_cert_data(sector: str, exports_to_eu: bool) -> tuple[dict[str, Any], list[dict[str, str]]]:
    """Collect certification data from tools. Returns (data, trace_steps)."""
    data: dict[str, Any] = {"sources_used": []}
    trace: list[dict[str, str]] = []

    # 1. Semantic search for relevant certifications
    query = f"certifications for {sector} businesses in Tunisia"
    if exports_to_eu:
        query += " exporting to EU CBAM"
    trace.append({"step": "tool_call", "detail": f"Semantic search: '{query}'"})
    kb_results = semantic_knowledge_search.invoke({"query": query, "top_k": 5})
    if kb_results:
        data["knowledge_base"] = kb_results
        data["sources_used"].append("Semantic vector store (FAISS)")
        trace.append({"step": "tool_result", "detail": f"Found {len(kb_results)} relevant knowledge entries"})
    else:
        trace.append({"step": "tool_result", "detail": "No semantic matches found"})

    # 2. Live search for the most relevant certs
    search_targets = ["ISO 14001 Tunisia"]
    if exports_to_eu:
        search_targets.append("ISO 14064 CBAM Tunisia")
    if "textile" in sector.lower():
        search_targets.append("OEKO-TEX Tunisia textile")
    if "tourism" in sector.lower() or "hotel" in sector.lower():
        search_targets.append("Green Key Tunisia hotel")
    if "agri" in sector.lower():
        search_targets.append("GLOBALG.A.P. Tunisia agriculture")

    live_results = []
    for target in search_targets[:3]:  # Cap to avoid burning Tavily quota
        trace.append({"step": "tool_call", "detail": f"Tavily web search: '{target}'"})
        result = search_certification_requirements.invoke({
            "certification_name": target,
            "country": "Tunisia",
        })
        if not result.get("fallback"):
            live_results.append(result)
            data["sources_used"].append(f"Tavily search: {target}")
            trace.append({"step": "tool_result", "detail": f"Got live results for '{target}'"})
        else:
            trace.append({"step": "tool_result", "detail": f"Tavily unavailable for '{target}'"})

    if live_results:
        data["live_search"] = live_results

    return data, trace


def run_cert_advisor(
    state: EnvironmentalState,
    llm: ChatGroq,
    system_prompt: str,
) -> dict[str, Any]:
    """Recommend green certifications based on business profile."""

    parsed = state.parsed_input
    impact = state.impact_assessment
    if not parsed:
        return {
            "current_agent": ["cert_advisor"],
            "errors": ["Cert advisor: no parsed input available"],
        }

    # Gather data
    tool_data, trace_steps = _gather_cert_data(parsed.industry_sector, parsed.exports_to_eu)

    impact_summary = ""
    if impact:
        impact_summary = (
            f"\n**Résumé de l'évaluation d'impact :**\n"
            f"- Carbone : {impact.carbon_estimate_range}\n"
            f"- Intensité énergétique : {impact.energy_intensity}\n"
            f"- Utilisation de l'eau : {impact.water_usage_category}\n"
            f"- Risques principaux : {', '.join(impact.key_environmental_risks)}\n"
        )

    user_message = (
        f"Recommandez des certifications vertes pour cette entreprise tunisienne :\n\n"
        f"**Entreprise :** {parsed.business_description}\n"
        f"**Secteur :** {parsed.industry_sector} / {parsed.sub_sector}\n"
        f"**Localisation :** {parsed.location}\n"
        f"**Taille :** {parsed.scale}\n"
        f"**Exports vers l'UE :** {parsed.exports_to_eu}\n"
        f"{impact_summary}\n"
        f"**Données sur les certifications issues des outils :**\n```json\n{json.dumps(tool_data, indent=2, default=str)}\n```\n\n"
        f"Retournez un tableau JSON d'objets Certification. Chacun doit contenir : "
        f"name, issuing_body, relevance, eligibility_summary, estimated_cost, "
        f"estimated_timeline, strategic_value, priority.\n"
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
        if isinstance(raw_list, dict) and "certifications" in raw_list:
            raw_list = raw_list["certifications"]

        certs = [Certification.model_validate(c) for c in raw_list]

        trace_steps.append({"step": "llm_call", "detail": "Generated certification recommendations from tool data"})
        trace_steps.append({"step": "result", "detail": f"Recommended {len(certs)} certifications: {', '.join(c.name for c in certs)}"})

        return {
            "certifications": certs,
            "current_agent": ["cert_advisor"],
            "_trace": {"cert_advisor": trace_steps},
        }

    except (json.JSONDecodeError, Exception) as exc:
        logger.error("Cert advisor failed: %s", exc)
        return {
            "current_agent": ["cert_advisor"],
            "errors": [f"Cert advisor error: {exc}"],
            "_trace": {"cert_advisor": [{"step": "error", "detail": str(exc)}]},
        }
