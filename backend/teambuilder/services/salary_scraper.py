"""
Salary Scraper using SerpAPI to get real-time salary data from Google Jobs
"""
import os
import re
import requests
from typing import Optional, Dict

SERPAPI_KEY = os.getenv("SERPAPI_KEY")
SERPAPI_URL = "https://serpapi.com/search"


def scrape_salary_from_jobs(role_title: str, seniority: str, region: str = "Tunisia") -> Optional[Dict]:
    """
    Scrape salary data from Google Jobs using SerpAPI
    
    Args:
        role_title: Job role (e.g., "Python Developer")
        seniority: junior, mid, senior, lead
        region: Location (default: Tunisia)
    
    Returns:
        Dict with salary data or None if not found
    """
    if not SERPAPI_KEY:
        print("⚠️ SERPAPI_KEY not configured")
        return None
    
    # Build search query
    query = f"{seniority} {role_title} salary {region}"
    
    try:
        # Search Google Jobs via SerpAPI
        params = {
            "engine": "google_jobs",
            "q": query,
            "location": region,
            "api_key": SERPAPI_KEY,
            "num": 10  # Get top 10 results
        }
        
        response = requests.get(SERPAPI_URL, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        # Extract salaries from job listings
        salaries = []
        jobs_results = data.get("jobs_results", [])
        
        for job in jobs_results:
            salary_info = job.get("detected_extensions", {})
            
            # Try to extract salary from various fields
            salary_text = (
                salary_info.get("salary") or 
                job.get("salary") or 
                ""
            )
            
            if salary_text:
                # Parse salary range
                parsed = parse_salary_text(salary_text)
                if parsed:
                    salaries.append(parsed)
        
        if not salaries:
            print(f"No salary data found for {role_title} ({seniority}) in {region}")
            return None
        
        # Calculate average from all found salaries
        avg_min = sum(s["min"] for s in salaries) // len(salaries)
        avg_max = sum(s["max"] for s in salaries) // len(salaries)
        currency = salaries[0].get("currency", "TND")
        
        print(f"✓ Found {len(salaries)} salary data points for {role_title}")
        
        return {
            "annual_min": avg_min,
            "annual_max": avg_max,
            "currency": currency,
            "source": "serpapi_scraped",
            "sample_size": len(salaries)
        }
        
    except requests.exceptions.RequestException as e:
        print(f"SerpAPI request error: {e}")
        return None
    except Exception as e:
        print(f"Salary scraping error: {e}")
        return None


def parse_salary_text(text: str) -> Optional[Dict]:
    """
    Parse salary text to extract min, max, and currency
    
    Examples:
        "30,000 - 50,000 TND per year"
        "$60K - $80K"
        "45000-60000 EUR/year"
    """
    text = text.upper().replace(",", "")
    
    # Try to find currency
    currency = "TND"  # Default
    if "USD" in text or "$" in text:
        currency = "USD"
    elif "EUR" in text or "€" in text:
        currency = "EUR"
    elif "TND" in text or "DT" in text:
        currency = "TND"
    
    # Extract numbers (handle K for thousands)
    numbers = re.findall(r'(\d+(?:\.\d+)?)\s*K?', text)
    
    if len(numbers) >= 2:
        min_val = float(numbers[0])
        max_val = float(numbers[1])
        
        # Convert K to thousands
        if 'K' in text:
            min_val *= 1000
            max_val *= 1000
        
        return {
            "min": int(min_val),
            "max": int(max_val),
            "currency": currency
        }
    
    return None


def search_salary_online(role_title: str, seniority: str, region: str = "Tunisia") -> Optional[Dict]:
    """
    Search for salary information using SerpAPI Google Search
    (Alternative to Google Jobs if no job listings found)
    """
    if not SERPAPI_KEY:
        return None
    
    query = f"{role_title} {seniority} average salary {region}"
    
    try:
        params = {
            "engine": "google",
            "q": query,
            "api_key": SERPAPI_KEY,
            "num": 5
        }
        
        response = requests.get(SERPAPI_URL, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        # Look for salary info in organic results
        organic_results = data.get("organic_results", [])
        
        for result in organic_results:
            snippet = result.get("snippet", "")
            title = result.get("title", "")
            
            # Try to parse salary from snippet
            combined_text = f"{title} {snippet}"
            parsed = parse_salary_text(combined_text)
            
            if parsed:
                print(f"✓ Found salary info in search results for {role_title}")
                return {
                    "annual_min": parsed["min"],
                    "annual_max": parsed["max"],
                    "currency": parsed["currency"],
                    "source": "serpapi_search"
                }
        
        return None
        
    except Exception as e:
        print(f"Salary search error: {e}")
        return None
