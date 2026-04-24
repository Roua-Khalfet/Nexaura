"""
Knowledge base loader — local JSON cache as fallback when APIs are unavailable.

This is the last resort: if Climate Watch, World Bank, and Tavily all fail,
agents still get usable data from these static files.

Files are in green_analysis/knowledge/data/:
    - emission_factors.json  — sector benchmarks, fuel factors, water data
    - certifications.json    — green certifications & CBAM info
    - tunisian_programs.json — national & international funding programs
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from langchain_core.tools import tool

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent.parent / "knowledge" / "data"

# In-memory cache to avoid repeated disk reads within a single process
_cache: dict[str, Any] = {}


def _load_json(filename: str) -> dict[str, Any]:
    """Load a JSON file from the data directory, with in-memory caching."""
    if filename in _cache:
        return _cache[filename]

    filepath = DATA_DIR / filename
    if not filepath.exists():
        logger.error("Knowledge base file not found: %s", filepath)
        return {"error": f"File not found: {filename}"}

    with open(filepath, encoding="utf-8") as f:
        data = json.load(f)

    _cache[filename] = data
    return data


def clear_cache() -> None:
    """Clear the in-memory cache (used after data refresh)."""
    _cache.clear()


@tool
def get_emission_factors(sector: str = "") -> dict[str, Any]:
    """Retrieve emission factors from the local knowledge base.

    This is the FALLBACK tool — use Climate Watch / World Bank APIs first.
    Call this when live APIs return errors or for sector-specific benchmarks
    that aren't available from global APIs.

    Args:
        sector: Industry sector key (e.g., "textiles", "agriculture_olive_oil",
            "food_processing"). Leave empty to get all sectors.

    Returns:
        Emission factor data including CO2/unit, energy intensity,
        water usage benchmarks, and waste profiles.
    """
    data = _load_json("emission_factors.json")
    if "error" in data:
        return data

    if not sector:
        return {
            "source": "Local knowledge base (emission_factors.json)",
            "metadata": data.get("_metadata", {}),
            "available_sectors": list(data.get("industry_sectors", {}).keys()),
            "energy_fuels": data.get("energy_fuels", {}),
            "water_benchmarks": data.get("water_benchmarks", {}),
        }

    # Look up specific sector
    sectors = data.get("industry_sectors", {})
    sector_data = sectors.get(sector)

    if sector_data is None:
        # Try fuzzy match
        matches = [k for k in sectors if sector.lower() in k.lower()]
        if matches:
            sector_data = sectors[matches[0]]
            sector = matches[0]
        else:
            return {
                "source": "Local knowledge base",
                "error": f"Sector '{sector}' not found. Available: {list(sectors.keys())}",
            }

    return {
        "source": "Local knowledge base (emission_factors.json)",
        "sector": sector,
        "data": sector_data,
        "grid_emission_factor_kgco2_kwh": data.get("energy_fuels", {})
        .get("grid_electricity", {})
        .get("emission_factor", 0.55),
    }


@tool
def get_certifications(sector: str = "") -> dict[str, Any]:
    """Retrieve green certification data from the local knowledge base.

    This is the FALLBACK tool — use Tavily web search first for current data.
    Call this when web search is unavailable or for structured cert data.

    Args:
        sector: Filter certifications relevant to a specific sector.
            Leave empty for all certifications.

    Returns:
        List of certifications with requirements, costs, and timelines.
    """
    data = _load_json("certifications.json")
    if "error" in data:
        return data

    certs = data.get("certifications", [])

    if sector:
        # Filter certs applicable to this sector
        filtered = [
            c
            for c in certs
            if "all" in c.get("applicable_sectors", [])
            or any(sector.lower() in s.lower() for s in c.get("applicable_sectors", []))
        ]
        certs = filtered if filtered else certs  # Fall back to all if no match

    return {
        "source": "Local knowledge base (certifications.json)",
        "certifications": certs,
        "cbam_info": data.get("cbam_info", {}),
        "count": len(certs),
    }


@tool
def get_tunisian_programs(program_type: str = "") -> dict[str, Any]:
    """Retrieve Tunisian green funding programs from the local knowledge base.

    This is the FALLBACK tool — use Tavily web search first for current data.
    Call this when web search is unavailable or for structured program data.

    Args:
        program_type: Filter by type: "subsidy", "tax_incentive",
            "technical_assistance", or leave empty for all.

    Returns:
        National and international green funding programs.
    """
    data = _load_json("tunisian_programs.json")
    if "error" in data:
        return data

    national = data.get("national_programs", [])
    international = data.get("international_financing", [])

    if program_type:
        national = [
            p for p in national if program_type.lower() in p.get("type", "").lower()
        ]

    return {
        "source": "Local knowledge base (tunisian_programs.json)",
        "national_programs": national,
        "international_financing": international,
        "quick_recommendations": data.get("summary", {}).get("quick_recommendations", {}),
    }
