import os
from typing import List, Dict, Optional

from dotenv import load_dotenv

try:
    from github import Auth, Github
except ImportError:  # pragma: no cover
    Auth = None  # type: ignore
    Github = None  # type: ignore


load_dotenv()

_token = os.getenv("GITHUB_TOKEN")


_gh = Github(auth=Auth.Token(_token)) if Github and Auth and _token else None


def search_github(query: str, language: Optional[str] = None, max_results: int = 8) -> List[Dict]:
    if not _gh:
        return []
    try:
        q = f"{query} language:{language}" if language else query
        repos = _gh.search_repositories(query=q, sort="stars", order="desc")
        return [
            {
                "name": r.full_name,
                "description": r.description,
                "stars": r.stargazers_count,
                "url": r.html_url,
                "license": r.license.name if r.license else "None",
                "updated": str(r.pushed_at),
            }
            for r in repos[:max_results]
        ]
    except Exception:
        return []