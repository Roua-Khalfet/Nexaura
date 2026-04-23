"""
Tavily web search tool — fresh data on Tunisian programs, certifications, regulations.

Used when:
    - Knowledge base JSONs may be outdated
    - User asks about a specific program that may have changed
    - Agent needs current data on cert costs, program eligibility, new regulations

Requires TAVILY_API_KEY in .env (free tier: 1,000 requests/month at https://tavily.com).
"""

from __future__ import annotations

import logging
import os
from typing import Any

from langchain_core.tools import tool

logger = logging.getLogger(__name__)


def _get_tavily_client():
    """Lazy-init Tavily client to avoid import errors when key is missing."""
    from tavily import TavilyClient

    api_key = os.getenv("TAVILY_API_KEY", "")
    if not api_key:
        raise ValueError(
            "TAVILY_API_KEY not configured. "
            "Get a free key at https://tavily.com and add it to .env"
        )
    return TavilyClient(api_key=api_key)


@tool
def search_tunisian_environmental_data(
    query: str,
    max_results: int = 5,
    search_depth: str = "advanced",
) -> dict[str, Any]:
    """Search the web for current Tunisian environmental data, programs, or regulations.

    Use this tool when you need fresh/current information that may not be in
    the local knowledge base, such as:
    - Current status of ANME/ANPE programs (FTE, FODEP, Prosol)
    - Latest certification costs or requirements
    - New Tunisian environmental regulations or incentives
    - Current emission factors or energy data for Tunisia
    - EU CBAM updates affecting Tunisian exporters

    Args:
        query: Search query. Be specific and include "Tunisia" context.
            Good: "ANME FTE energy efficiency subsidy Tunisia 2026 eligibility"
            Bad: "energy subsidy"
        max_results: Number of results to return (1-10, default 5).
        search_depth: "basic" for quick search, "advanced" for deeper extraction.

    Returns:
        Dictionary with search results including extracted content,
        or error message if Tavily is unavailable.
    """
    try:
        client = _get_tavily_client()
        response = client.search(
            query=query,
            max_results=min(max_results, 10),
            search_depth=search_depth,
            include_answer=True,
            include_raw_content=False,
        )

        results = []
        for item in response.get("results", []):
            results.append({
                "title": item.get("title", ""),
                "url": item.get("url", ""),
                "content": item.get("content", ""),
                "score": item.get("score", 0),
            })

        return {
            "source": "Tavily Web Search",
            "query": query,
            "answer": response.get("answer", ""),
            "results": results,
            "result_count": len(results),
        }

    except ValueError as exc:
        # API key not configured
        logger.warning("Tavily not configured: %s", exc)
        return {
            "source": "Tavily Web Search",
            "error": str(exc),
            "fallback": True,
        }
    except Exception as exc:
        logger.warning("Tavily search failed: %s", exc)
        return {
            "source": "Tavily Web Search",
            "error": f"Search failed: {exc}",
            "fallback": True,
        }


@tool
def search_certification_requirements(
    certification_name: str,
    country: str = "Tunisia",
) -> dict[str, Any]:
    """Search for current requirements and costs of a specific green certification.

    Args:
        certification_name: Name of the certification (e.g., "ISO 14001",
            "Label Écologique Tunisien", "OEKO-TEX").
        country: Country context (default "Tunisia").

    Returns:
        Search results with current certification info.
    """
    query = (
        f"{certification_name} certification requirements cost timeline "
        f"{country} 2025 2026"
    )
    return search_tunisian_environmental_data.invoke({
        "query": query,
        "max_results": 3,
        "search_depth": "advanced",
    })


@tool
def search_green_funding_programs(
    sector: str = "",
    program_name: str = "",
) -> dict[str, Any]:
    """Search for current Tunisian green funding programs and incentives.

    Args:
        sector: Business sector for targeted results (e.g., "textiles",
            "agriculture", "manufacturing").
        program_name: Specific program name if known (e.g., "FTE", "FODEP",
            "Prosol").

    Returns:
        Search results with current program info.
    """
    parts = ["Tunisia green funding incentive program"]
    if program_name:
        parts.insert(0, program_name)
    if sector:
        parts.append(sector)
    parts.append("2025 2026 eligibility")

    query = " ".join(parts)
    return search_tunisian_environmental_data.invoke({
        "query": query,
        "max_results": 5,
        "search_depth": "advanced",
    })
