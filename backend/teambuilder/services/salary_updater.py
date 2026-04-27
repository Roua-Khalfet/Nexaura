"""Salary updater: scrapes TN job boards + SerpAPI → LLM extracts salary → upserts DB."""

import os, json
from datetime import datetime, timezone
from typing import Optional, List, Dict, Tuple
import httpx
from bs4 import BeautifulSoup
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage
from api.models import SalaryRate, SalaryHistory
from asgiref.sync import sync_to_async
from services.salary_scraper import scrape_salary_from_jobs

_llm = ChatGroq(
    model=os.getenv("GROQ_MODEL", "llama-3.1-70b-versatile"),
    api_key=os.getenv("GROQ_API_KEY"),
    temperature=0.1,
)

SOURCES = [
    {"name": "tanitjobs", "url": "https://www.tanitjobs.com/jobs/?f_C=2&f_I=1",
     "listing": "div.job-listing", "title": "h2.job-title", "salary": "span.salary"},
    {"name": "emploi.net", "url": "https://www.emploi.net/recherche-emploi-tunisie/informatique",
     "listing": "div.offer-details", "title": "h3.offer-title", "salary": "span.offer-salary"},
]

# Common tech roles to update via SerpAPI
COMMON_ROLES = [
    ("Python Developer", "senior"),
    ("JavaScript Developer", "mid"),
    ("Full Stack Developer", "senior"),
    ("DevOps Engineer", "senior"),
    ("Data Scientist", "mid"),
    ("Mobile Developer", "mid"),
    ("Backend Developer", "senior"),
    ("Frontend Developer", "mid"),
    ("QA Engineer", "mid"),
    ("Product Manager", "senior"),
]


async def _scrape(source: dict) -> List[dict]:
    headers = {"User-Agent": "Mozilla/5.0 (compatible; TeamBuilderBot/1.0)"}
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            soup = BeautifulSoup((await client.get(source["url"], headers=headers)).text, "html.parser")
    except Exception:
        return []
    
    results = []
    for i in soup.select(source["listing"])[:20]:
        t = i.select_one(source["title"])
        results.append({
            "title": t.get_text(strip=True) if t else "",
            "raw": i.get_text(separator=" ", strip=True)[:500],
            "url": source["url"]
        })
    return results


def _extract(listing: dict) -> Optional[dict]:
    try:
        d = json.loads(_llm.invoke([HumanMessage(content=f"""
Extract salary info from this Tunisian job listing. Return null if none found.
"{listing['raw']}"
JSON: {{"role_title":"...","seniority":"junior|mid|senior|lead","annual_min":N,"annual_max":N,"currency":"TND"}}
If monthly, multiply by 12. Convert USD(×3.1)/EUR(×3.3) to TND.
""") ]).content)
        return d if d and d.get("role_title") else None
    except Exception:
        return None


def _update_salaries_sync(agg):
    updated = 0
    unchanged = 0
    changes = []
    
    for (role, sen), ranges in agg.items():
        avg_min = int(sum(r["min"] for r in ranges) / len(ranges))
        avg_max = int(sum(r["max"] for r in ranges) / len(ranges))
        
        cur = SalaryRate.objects.filter(role_title=role, seniority=sen, region='TN').first()
        
        if cur and cur.annual_min == avg_min and cur.annual_max == avg_max:
            unchanged += 1
            continue
            
        SalaryHistory.objects.create(
            role_title=role,
            seniority=sen,
            region='TN',
            annual_min=avg_min,
            annual_max=avg_max,
            source_url=ranges[0]["url"]
        )
        
        if cur:
            cur.annual_min = avg_min
            cur.annual_max = avg_max
            cur.source = ranges[0]["url"]
            cur.save()
            changes.append({
                "role": role, "seniority": sen,
                "old": f"{cur.annual_min:,}–{cur.annual_max:,} TND" if cur else "new",
                "new": f"{avg_min:,}–{avg_max:,} TND", "source": ranges[0]["url"]
            })
        else:
            SalaryRate.objects.create(
                role_title=role,
                seniority=sen,
                region='TN',
                currency='TND',
                annual_min=avg_min,
                annual_max=avg_max,
                source=ranges[0]["url"]
            )
            changes.append({
                "role": role, "seniority": sen,
                "old": "new",
                "new": f"{avg_min:,}–{avg_max:,} TND", "source": ranges[0]["url"]
            })
            
        updated += 1
        
    return updated, unchanged, changes

async def run_salary_update(use_serpapi=False) -> dict:
    """
    Update salaries from multiple sources:
    1. Scrape Tunisian job boards (PRIMARY - best for Tunisia)
    2. Use SerpAPI for common tech roles (OPTIONAL - limited Tunisia data)
    
    Note: SerpAPI disabled by default as Tunisian job boards provide better local data.
    Enable use_serpapi=True only if you need international role coverage.
    """
    scraped_at = datetime.now(timezone.utc).isoformat()
    
    # Source 1: Traditional scraping
    listings = []
    for s in SOURCES:
        listings.extend(await _scrape(s))

    agg: Dict[Tuple[str, str], list] = {}
    for l in listings:
        d = _extract(l)
        if d:
            key = (d["role_title"], d.get("seniority", "mid"))
            agg.setdefault(key, []).append(
                {"min": d.get("annual_min", 0), "max": d.get("annual_max", 0), "url": l["url"]})

    # Source 2: SerpAPI for common roles (NEW!)
    serpapi_count = 0
    if use_serpapi and os.getenv("SERPAPI_KEY"):
        print("🔍 Updating salaries via SerpAPI...")
        for role, seniority in COMMON_ROLES:
            try:
                result = scrape_salary_from_jobs(role, seniority, "Tunisia")
                if result and result.get("annual_min", 0) > 0:
                    key = (role, seniority)
                    agg.setdefault(key, []).append({
                        "min": result["annual_min"],
                        "max": result["annual_max"],
                        "url": "serpapi"
                    })
                    serpapi_count += 1
                    print(f"  ✓ {role} ({seniority}): {result['annual_min']:,}-{result['annual_max']:,}")
            except Exception as e:
                print(f"  ✗ Failed to get {role}: {e}")

    update_sync = sync_to_async(_update_salaries_sync, thread_sensitive=True)
    updated, unchanged, changes = await update_sync(agg)

    return {
        "updated": updated,
        "unchanged": unchanged,
        "serpapi_count": serpapi_count,
        "changes": changes,
        "scraped_at": scraped_at
    }
