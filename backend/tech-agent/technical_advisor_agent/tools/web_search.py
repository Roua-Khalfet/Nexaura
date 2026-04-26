import os
from typing import List, Dict

try:
    from tavily import TavilyClient
except ImportError:  # pragma: no cover
    TavilyClient = None  # type: ignore


_client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY")) if TavilyClient else None


def web_search(query: str, max_results: int = 5) -> List[Dict]:
    if not _client:
        return []
    try:
        response = _client.search(query=query, max_results=max_results)
        return [
            {"title": r.get("title"), "url": r.get("url"), "content": str(r.get("content", ""))[:500]}
            for r in response.get("results", [])
        ]
    except Exception:
        return []
