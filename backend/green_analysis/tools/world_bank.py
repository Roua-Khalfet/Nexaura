"""
World Bank Climate Data API — live retrieval of Tunisia country indicators.

API docs: https://datahelpdesk.worldbank.org/knowledgebase/articles/889392
No API key required. Free and open.

Provides:
    - CO2 emissions per capita
    - Renewable energy share
    - Energy use per capita
    - Access to electricity
    - PM2.5 air pollution
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from langchain_core.tools import tool

logger = logging.getLogger(__name__)

WORLD_BANK_BASE = "https://api.worldbank.org/v2"
TUNISIA_ISO = "TUN"
REQUEST_TIMEOUT = 15

# Key indicator codes for environmental analysis
INDICATORS = {
    "co2_per_capita": "EN.ATM.CO2E.PC",           # CO2 emissions (metric tons per capita)
    "co2_total_kt": "EN.ATM.CO2E.KT",             # CO2 emissions (kt)
    "renewable_energy_pct": "EG.FEC.RNEW.ZS",     # Renewable energy % of total final energy
    "energy_use_per_capita": "EG.USE.PCAP.KG.OE",  # Energy use (kg oil eq. per capita)
    "electricity_access_pct": "EG.ELC.ACCS.ZS",    # Access to electricity (% population)
    "pm25_pollution": "EN.ATM.PM25.MC.M3",         # PM2.5 air pollution (µg/m³)
    "forest_area_pct": "AG.LND.FRST.ZS",          # Forest area (% of land area)
    "renewable_electricity_pct": "EG.ELC.RNEW.ZS", # Renewable electricity output (%)
    "water_stress": "ER.H2O.FWST.ZS",             # Level of water stress (%)
}


async def _fetch_indicator(
    indicator_code: str,
    date_range: str = "2010:2023",
) -> list[dict[str, Any]]:
    """Fetch a single indicator for Tunisia from World Bank API."""
    url = f"{WORLD_BANK_BASE}/country/{TUNISIA_ISO}/indicator/{indicator_code}"
    params = {
        "format": "json",
        "date": date_range,
        "per_page": 50,
    }
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        payload = resp.json()

    # World Bank API returns [metadata, data_array]
    if isinstance(payload, list) and len(payload) > 1:
        return payload[1] or []
    return []


@tool
async def get_tunisia_climate_indicators(
    indicators: list[str] | None = None,
    start_year: int = 2010,
    end_year: int = 2023,
) -> dict[str, Any]:
    """Fetch Tunisia's climate & environmental indicators from World Bank API.

    Args:
        indicators: List of indicator keys to fetch. Options:
            co2_per_capita, co2_total_kt, renewable_energy_pct,
            energy_use_per_capita, electricity_access_pct,
            pm25_pollution, forest_area_pct, renewable_electricity_pct,
            water_stress. Leave None for all.
        start_year: Start year (default 2010).
        end_year: End year (default 2023).

    Returns:
        Dictionary with indicator values by year, or error if API unavailable.
    """
    if indicators is None:
        indicators = list(INDICATORS.keys())

    date_range = f"{start_year}:{end_year}"
    result: dict[str, Any] = {
        "source": "World Bank Climate Data API",
        "country": "Tunisia",
        "indicators": {},
    }

    for key in indicators:
        code = INDICATORS.get(key)
        if not code:
            result["indicators"][key] = {"error": f"Unknown indicator: {key}"}
            continue

        try:
            records = await _fetch_indicator(code, date_range)

            yearly_data: dict[str, float | None] = {}
            unit = ""
            for record in records:
                year = record.get("date", "")
                value = record.get("value")
                if year:
                    yearly_data[year] = round(value, 4) if value is not None else None
                if not unit and record.get("indicator"):
                    unit = record["indicator"].get("value", "")

            # Get the most recent non-null value
            latest_value = None
            latest_year = None
            for yr in sorted(yearly_data.keys(), reverse=True):
                if yearly_data[yr] is not None:
                    latest_value = yearly_data[yr]
                    latest_year = yr
                    break

            result["indicators"][key] = {
                "code": code,
                "description": unit,
                "latest_value": latest_value,
                "latest_year": latest_year,
                "time_series": {
                    k: v for k, v in yearly_data.items() if v is not None
                },
            }

        except (httpx.HTTPError, httpx.TimeoutException, KeyError) as exc:
            logger.warning("World Bank API failed for %s: %s", key, exc)
            result["indicators"][key] = {
                "code": code,
                "error": f"API unavailable: {exc}",
                "fallback": True,
            }

    return result


@tool
async def get_tunisia_energy_profile() -> dict[str, Any]:
    """Fetch a focused Tunisia energy profile (CO2, renewables, energy use).

    Convenience wrapper around get_tunisia_climate_indicators that fetches
    the most relevant energy/emissions indicators for environmental analysis.

    Returns:
        Dictionary with key energy metrics for Tunisia.
    """
    energy_keys = [
        "co2_per_capita",
        "co2_total_kt",
        "renewable_energy_pct",
        "renewable_electricity_pct",
        "energy_use_per_capita",
    ]
    return await get_tunisia_climate_indicators.ainvoke({
        "indicators": energy_keys,
        "start_year": 2015,
        "end_year": 2023,
    })
