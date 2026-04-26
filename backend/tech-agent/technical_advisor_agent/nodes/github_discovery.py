from datetime import datetime, timedelta
from typing import List

from technical_advisor_agent.state import AgentState
from technical_advisor_agent.tools.github_tool import search_github
from technical_advisor_agent.tracing import append_agent_step


def _extract_keywords(text: str, limit: int = 4) -> str:
    words = [w.strip().lower() for w in text.replace("\n", " ").split() if len(w) > 3]
    deduped: List[str] = []
    for w in words:
        if w not in deduped:
            deduped.append(w)
        if len(deduped) >= limit:
            break
    return " ".join(deduped) if deduped else text


def _primary_language(existing_stack: List[str]) -> str:
    lower = [s.lower() for s in existing_stack or []]
    if any("python" in s for s in lower):
        return "python"
    if any("typescript" in s or "javascript" in s or "node" in s for s in lower):
        return "typescript"
    if any("java" in s for s in lower):
        return "java"
    if any("go" == s or "golang" in s for s in lower):
        return "go"
    return ""


def github_discovery(state: AgentState) -> AgentState:
    ctx = state.get("founder_context", {})
    existing_stack = ctx.get("existing_stack", []) if isinstance(ctx, dict) else getattr(ctx, "existing_stack", [])

    query_terms = _extract_keywords(state.get("user_query", ""))
    language = _primary_language(existing_stack)
    repos = search_github(query_terms, language=language or None)

    cutoff = datetime.utcnow() - timedelta(days=730)
    filtered = []
    for repo in repos:
        if repo.get("license") in (None, "None"):
            continue
        try:
            updated_dt = datetime.fromisoformat(str(repo.get("updated")))
        except Exception:
            updated_dt = cutoff
        if updated_dt < cutoff:
            continue
        if repo.get("stars", 0) <= 100:
            continue
        filtered.append(repo)

    state["github_results"] = filtered
    append_agent_step(
        state,
        step="Github Discovery",
        details="Discovered and filtered open-source repositories from GitHub.",
        metadata={"candidate_repos": len(repos), "selected_repos": len(filtered)},
    )
    return state
