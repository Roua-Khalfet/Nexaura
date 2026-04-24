"""
Impact Analyst agent — environmental impact assessment using live APIs + knowledge base.

Calls tools for data, then uses LLM to synthesize an ImpactAssessment.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_groq import ChatGroq

from green_analysis.agents.state import EnvironmentalState, ImpactAssessment
from green_analysis.tools.climate_watch import get_tunisia_emissions
from green_analysis.tools.vectorstore import semantic_sector_search
from green_analysis.tools.world_bank import get_tunisia_energy_profile

logger = logging.getLogger(__name__)


def _gather_data(sector: str) -> tuple[dict[str, Any], list[dict[str, str]]]:
    """Collect data from all available sources. Returns (data, trace_steps)."""
    data: dict[str, Any] = {"sources_used": []}
    trace: list[dict[str, str]] = []

    # 1. Semantic knowledge base search (FAISS vector store)
    trace.append({"step": "tool_call", "detail": f"Semantic search for sector: '{sector}'"})
    kb_result = semantic_sector_search.invoke({"sector_description": sector})
    if "error" not in kb_result:
        data["knowledge_base"] = kb_result
        score = kb_result.get("relevance_score", "N/A")
        matched = kb_result.get("sector_id", "unknown")
        data["sources_used"].append("Semantic vector store (FAISS)")
        trace.append({"step": "tool_result", "detail": f"Matched sector '{matched}' (relevance: {score})"})
    else:
        trace.append({"step": "tool_result", "detail": f"No matching sector found for '{sector}'"})

    # 2. Climate Watch API
    trace.append({"step": "tool_call", "detail": "Fetching Tunisia emissions from Climate Watch API"})
    try:
        import asyncio
        cw_result = asyncio.get_event_loop().run_until_complete(
            get_tunisia_emissions.ainvoke({"sector": "", "start_year": 2018, "end_year": 2022})
        )
    except RuntimeError:
        import asyncio
        cw_result = asyncio.run(
            get_tunisia_emissions.ainvoke({"sector": "", "start_year": 2018, "end_year": 2022})
        )

    if not cw_result.get("fallback"):
        data["climate_watch"] = cw_result
        data["sources_used"].append("Climate Watch Data API")
        trace.append({"step": "tool_result", "detail": "Got Tunisia national emissions data"})
    else:
        trace.append({"step": "tool_result", "detail": "Climate Watch API unavailable, skipped"})

    # 3. World Bank API
    trace.append({"step": "tool_call", "detail": "Fetching Tunisia energy profile from World Bank API"})
    try:
        import asyncio
        wb_result = asyncio.get_event_loop().run_until_complete(
            get_tunisia_energy_profile.ainvoke({})
        )
    except RuntimeError:
        import asyncio
        wb_result = asyncio.run(get_tunisia_energy_profile.ainvoke({}))

    if not wb_result.get("fallback"):
        data["world_bank"] = wb_result
        data["sources_used"].append("World Bank Climate Data API")
        trace.append({"step": "tool_result", "detail": "Got World Bank energy profile"})
    else:
        trace.append({"step": "tool_result", "detail": "World Bank API unavailable, skipped"})

    return data, trace


def run_impact_analyst(
    state: EnvironmentalState,
    llm: ChatGroq,
    system_prompt: str,
) -> dict[str, Any]:
    """Perform environmental impact assessment."""

    parsed = state.parsed_input
    if not parsed:
        return {
            "current_agent": ["impact_analyst"],
            "errors": ["Impact analyst: no parsed input available"],
        }

    # Gather data from tools
    tool_data, trace_steps = _gather_data(parsed.industry_sector)

    # Build the LLM prompt with tool data
    user_message = (
        f"Réalisez une évaluation d'impact environnemental pour cette entreprise :\n\n"
        f"**Entreprise :** {parsed.business_description}\n"
        f"**Secteur :** {parsed.industry_sector} / {parsed.sub_sector}\n"
        f"**Localisation :** {parsed.location}\n"
        f"**Taille :** {parsed.scale}\n"
        f"**Activités :** {', '.join(parsed.activities)}\n"
        f"**Ressources utilisées :** {', '.join(parsed.resources_used)}\n"
        f"**Exports vers l'UE :** {parsed.exports_to_eu}\n\n"
        f"**Données issues des outils :**\n```json\n{json.dumps(tool_data, indent=2, default=str)}\n```\n\n"
        f"Sur la base de ces données, produisez un objet JSON ImpactAssessment complet.\n"
        f"Retournez UNIQUEMENT du JSON valide, sans balises markdown."
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

        # Normalize LLM output quirks before validation
        data = json.loads(content)

        # waste_profile: LLM sometimes returns a dict instead of list
        wp = data.get("waste_profile")
        if isinstance(wp, dict):
            data["waste_profile"] = list(wp.values()) if wp else []
            # Flatten nested lists
            flat = []
            for v in data["waste_profile"]:
                if isinstance(v, list):
                    flat.extend(v)
                else:
                    flat.append(str(v))
            data["waste_profile"] = flat

        # methodology_notes: LLM sometimes returns a dict instead of string
        mn = data.get("methodology_notes")
        if isinstance(mn, dict):
            data["methodology_notes"] = "; ".join(
                f"{k}: {v}" for k, v in mn.items()
            )

        assessment = ImpactAssessment.model_validate(data)

        trace_steps.append({"step": "llm_call", "detail": "Synthesized impact assessment from tool data"})
        trace_steps.append({"step": "result", "detail": f"Carbon: {assessment.carbon_estimate_range}, Energy: {assessment.energy_intensity}"})

        return {
            "impact_assessment": assessment,
            "current_agent": ["impact_analyst"],
            "_trace": {"impact_analyst": trace_steps},
        }

    except (json.JSONDecodeError, Exception) as exc:
        logger.error("Impact analyst failed: %s", exc)
        return {
            "current_agent": ["impact_analyst"],
            "errors": [f"Impact analyst error: {exc}"],
            "_trace": {"impact_analyst": [{"step": "error", "detail": str(exc)}]},
        }
