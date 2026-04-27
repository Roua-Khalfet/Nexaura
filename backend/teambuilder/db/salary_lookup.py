"""3-Layer Salary Lookup: exact → pg_trgm fuzzy → SerpAPI → LLM fallback.
Refactored from SQLAlchemy to Django ORM with SerpAPI integration.
"""

import os
import json
from django.db import connection
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage
from services.salary_scraper import scrape_salary_from_jobs, search_salary_online

SIMILARITY_THRESHOLD = 0.40

_llm = ChatGroq(
    model=os.getenv("GROQ_MODEL", "llama-3.1-70b-versatile"),
    api_key=os.getenv("GROQ_API_KEY"),
    temperature=0.1,
)


def lookup_salary_sync(role_title, seniority, region="TN", currency="TND", auto_save=True, use_serpapi=False):
    """Synchronous 4-layer salary lookup using Django's DB connection.
    
    Args:
        role_title: The job role title
        seniority: junior, mid, senior, or lead
        region: Region code (default: TN)
        currency: Currency code (default: TND)
        auto_save: If True, automatically save estimates to database
        use_serpapi: If True, use SerpAPI before LLM fallback (disabled by default for Tunisia)
    
    Returns:
        dict with salary data and source
    
    Note: SerpAPI has limited Tunisia coverage. Tunisian job boards provide better local data.
    """
    seniority = seniority.lower()
    region_name = "Tunisia" if region == "TN" else region

    with connection.cursor() as cursor:
        # Layer 1: Exact match
        cursor.execute(
            "SELECT annual_min, annual_max, hourly_min, hourly_max, currency "
            "FROM salary_rates WHERE role_title=%s AND seniority=%s AND region=%s LIMIT 1",
            [role_title, seniority, region],
        )
        row = cursor.fetchone()
        if row:
            return _fmt(row, currency, "exact")

        # Layer 2: Fuzzy match (pg_trgm)
        cursor.execute(
            "SELECT annual_min, annual_max, hourly_min, hourly_max, currency, "
            "similarity(role_title, %s) AS sim FROM salary_rates "
            "WHERE seniority=%s AND region=%s AND similarity(role_title, %s) > %s "
            "ORDER BY sim DESC LIMIT 1",
            [role_title, seniority, region, role_title, SIMILARITY_THRESHOLD],
        )
        row = cursor.fetchone()
        if row:
            return _fmt(row, currency, "fuzzy")

        # Layer 3: SerpAPI scraping (NEW!)
        if use_serpapi:
            print(f"🔍 Searching online for {role_title} ({seniority}) salary...")
            
            # Try Google Jobs first
            serpapi_data = scrape_salary_from_jobs(role_title, seniority, region_name)
            
            # Fallback to Google Search if no jobs found
            if not serpapi_data:
                serpapi_data = search_salary_online(role_title, seniority, region_name)
            
            if serpapi_data and serpapi_data.get("annual_min", 0) > 0:
                # Auto-save to database
                if auto_save:
                    from api.models import SalaryRate
                    try:
                        SalaryRate.objects.create(
                            role_title=role_title,
                            seniority=seniority,
                            region=region,
                            currency=serpapi_data.get("currency", currency),
                            annual_min=serpapi_data["annual_min"],
                            annual_max=serpapi_data["annual_max"],
                            hourly_min=None,
                            hourly_max=None,
                            source=serpapi_data.get("source", "serpapi")
                        )
                        print(f"✓ Saved SerpAPI salary for {role_title}: {serpapi_data['annual_min']:,}-{serpapi_data['annual_max']:,}")
                    except Exception as e:
                        print(f"Failed to save SerpAPI salary: {e}")
                
                return {
                    "annual_min": serpapi_data["annual_min"],
                    "annual_max": serpapi_data["annual_max"],
                    "currency": serpapi_data.get("currency", currency),
                    "formatted": f"{serpapi_data['annual_min']:,}–{serpapi_data['annual_max']:,} {serpapi_data.get('currency', currency)}/yr",
                    "source": serpapi_data.get("source", "serpapi"),
                }

        # Layer 4: LLM fallback
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT role_title, annual_min, annual_max, currency FROM salary_rates "
                "WHERE seniority=%s AND region=%s ORDER BY role_title",
                [seniority, region],
            )
            anchors = cursor.fetchall()

    ctx = "\n".join(f"{r[0]}: {r[1]}–{r[2]} {r[3]}" for r in anchors)
    prompt = (
        f"Known {seniority} salaries in {region_name} ({currency}):\n{ctx}\n\n"
        f'Estimate the annual range for a {seniority} "{role_title}" in {currency}.\n'
        f'Return JSON only: {{"annual_min": N, "annual_max": N}}'
    )
    try:
        resp = _llm.invoke([HumanMessage(content=prompt)])
        content = resp.content.strip()
        
        # Try to extract JSON from markdown code blocks if present
        if "```json" in content:
            start = content.find("```json") + 7
            end = content.find("```", start)
            content = content[start:end].strip()
        elif "```" in content:
            start = content.find("```") + 3
            end = content.find("```", start)
            content = content[start:end].strip()
        
        data = json.loads(content)
        
        annual_min = data["annual_min"]
        annual_max = data["annual_max"]
        
        # Auto-save to database if enabled
        if auto_save and annual_min > 0 and annual_max > 0:
            from api.models import SalaryRate
            try:
                SalaryRate.objects.create(
                    role_title=role_title,
                    seniority=seniority,
                    region=region,
                    currency=currency,
                    annual_min=annual_min,
                    annual_max=annual_max,
                    hourly_min=None,
                    hourly_max=None,
                    source="llm_estimated"
                )
                print(f"✓ Auto-saved LLM salary for {role_title} ({seniority}): {annual_min:,}-{annual_max:,} {currency}")
            except Exception as e:
                print(f"Failed to auto-save LLM salary: {e}")
        
        return {
            "annual_min": annual_min, 
            "annual_max": annual_max,
            "currency": currency,
            "formatted": f"{annual_min:,}–{annual_max:,} {currency}/yr",
            "source": "llm_estimated",
        }
    except Exception as e:
        print(f"LLM salary estimation error: {e}")
        return {
            "annual_min": 0, "annual_max": 0, "currency": currency,
            "formatted": "Estimate unavailable", "source": "error",
        }


def _fmt(row, currency, source):
    """Format a DB row (tuple) into a dict."""
    return {
        "annual_min": row[0], "annual_max": row[1],
        "hourly_min": row[2], "hourly_max": row[3],
        "currency": currency,
        "formatted": f"{row[0]:,}–{row[1]:,} {currency}/yr",
        "source": source,
    }
