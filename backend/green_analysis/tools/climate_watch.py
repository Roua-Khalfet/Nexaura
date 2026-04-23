"""
Climate Watch Data API — live retrieval of Tunisia emissions data.

API docs: https://www.climatewatchdata.org/api/v1
No API key required. Free and open.

Provides:
    - Historical GHG emissions by sector for Tunisia
    - NDC (Nationally Determined Contributions) targets
    - Emission intensity indicators
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from langchain_core.tools import tool

logger = logging.getLogger(__name__)

CLIMATE_WATCH_BASE = "https://www.climatewatchdata.org/api/v1"
TUNISIA_ISO = "TUN"
CLIMATE_WATCH_SOURCE_ID = 256  # "Climate Watch" data source numeric ID
REQUEST_TIMEOUT = 15  # seconds


async def _fetch(path: str, params: dict[str, Any] | None = None) -> Any:
    """Perform a GET request against the Climate Watch API and return parsed JSON."""
    url = f"{CLIMATE_WATCH_BASE}{path}"
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        resp = await client.get(url, params=params or {})
        resp.raise_for_status()
        return resp.json()


@tool
async def get_tunisia_emissions(
    sector: str = "",
    start_year: int = 2000,
    end_year: int = 2022,
) -> dict[str, Any]:
    """Fetch Tunisia's historical GHG emissions from Climate Watch Data API.

    Args:
        sector: Optional sector filter, e.g. 'Energy', 'Agriculture',
                'Industrial Processes', 'Waste'. Leave empty for total.
        start_year: Start year for the time range (default 2000).
        end_year: End year for the time range (default 2022).

    Returns:
        Dictionary with emission values by year and metadata,
        or an error message if the API is unreachable.
    """
    try:
        params: dict[str, Any] = {
            "location": TUNISIA_ISO,
            "source": CLIMATE_WATCH_SOURCE_ID,
        }
        if sector:
            params["sector"] = sector

        raw = await _fetch("/emissions", params)

        # Response is a list of records: [{iso_code3, emissions: [{year, value}]}]
        result: dict[str, Any] = {
            "source": "Climate Watch Data API",
            "country": "Tunisia",
            "unit": "MtCO2e",
            "sector": sector or "Total (all sectors)",
            "data": {},
        }

        records = raw if isinstance(raw, list) else raw.get("data", [])
        for record in records:
            for entry in record.get("emissions", []):
                year = entry.get("year")
                value = entry.get("value")
                if year is not None and value is not None:
                    if start_year <= year <= end_year:
                        result["data"][str(year)] = round(value, 2)

        if not result["data"]:
            return {
                "source": "Climate Watch Data API",
                "error": "No emission data returned for the given parameters.",
                "fallback": True,
            }

        return result

    except (httpx.HTTPError, httpx.TimeoutException, KeyError) as exc:
        logger.warning("Climate Watch API failed: %s", exc)
        return {
            "source": "Climate Watch Data API",
            "error": f"API unavailable: {exc}",
            "fallback": True,
        }


@tool
async def get_tunisia_ndc_targets() -> dict[str, Any]:
    """Fetch Tunisia's NDC (climate pledge) targets from Climate Watch.

    Returns:
        Dictionary with NDC commitments and targets,
        or an error message if the API is unreachable.
    """
    try:
        raw = await _fetch("/ndcs", params={"location": TUNISIA_ISO})

        # Response is {categories: {id: {name, slug, ...}}, indicators: [...], ...}
        targets: list[dict[str, str]] = []
        categories = raw.get("categories", {})
        indicators = raw.get("indicators", [])

        for cat_id, cat_info in list(categories.items())[:10]:
            targets.append({
                "category": cat_info.get("name", ""),
                "type": cat_info.get("type", ""),
                "sources": ", ".join(cat_info.get("sources", [])),
            })

        # Extract indicator data (may be list or dict)
        ind_items = (
            indicators.items() if isinstance(indicators, dict) else enumerate(indicators)
        )
        for ind_id, ind_info in list(ind_items)[:15]:
            if isinstance(ind_info, dict):
                targets.append({
                    "indicator": ind_info.get("name", ""),
                    "category": str(ind_info.get("category", "")),
                    "value": str(ind_info.get("value", "")),
                })

        return {
            "source": "Climate Watch Data API — NDC Module",
            "country": "Tunisia",
            "targets": targets[:20],  # Cap to avoid token bloat
        }

    except (httpx.HTTPError, httpx.TimeoutException, KeyError) as exc:
        logger.warning("Climate Watch NDC API failed: %s", exc)
        return {
            "source": "Climate Watch Data API — NDC Module",
            "error": f"API unavailable: {exc}",
            "fallback": True,
        }


@tool
async def get_tunisia_emission_intensity() -> dict[str, Any]:
    """Fetch Tunisia's emission intensity indicators (CO2/GDP, CO2/capita).

    Returns:
        Dictionary with intensity metrics by year,
        or an error message if the API is unreachable.
    """
    try:
        params = {
            "location": TUNISIA_ISO,
            "source": CLIMATE_WATCH_SOURCE_ID,
        }
        raw = await _fetch("/emissions", params)

        intensity: dict[str, Any] = {
            "source": "Climate Watch Data API",
            "country": "Tunisia",
            "metrics": {},
        }

        records = raw if isinstance(raw, list) else raw.get("data", [])
        for record in records:
            sector = record.get("sector", "") or ""
            if "intensity" in sector.lower() or "per capita" in sector.lower():
                values = {}
                for entry in record.get("emissions", []):
                    year = entry.get("year")
                    value = entry.get("value")
                    if year and value is not None:
                        values[str(year)] = round(value, 4)
                if values:
                    intensity["metrics"][sector] = values

        return intensity

    except (httpx.HTTPError, httpx.TimeoutException, KeyError) as exc:
        logger.warning("Climate Watch intensity API failed: %s", exc)
        return {
            "source": "Climate Watch Data API",
            "error": f"API unavailable: {exc}",
            "fallback": True,
        }
