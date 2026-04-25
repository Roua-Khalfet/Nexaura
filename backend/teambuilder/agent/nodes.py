"""LangGraph agent nodes — 2 LLM calls only (extract + synthesize)."""

import json, asyncio, os
from datetime import datetime, timezone
from typing import Any, Dict

from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage

from agent.state import Role, Candidate
from agent.scorer import score_all
from db.salary_lookup import lookup_salary_sync
from asgiref.sync import sync_to_async
from cache.redis_client import cache_get, cache_set

_llm = ChatOllama(
    model=os.getenv("OLLAMA_MODEL", "llama3.1"),
    base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
    format="json", temperature=0.1,
)


def _llm_json(prompt: str) -> dict:
    resp = _llm.invoke([HumanMessage(content=prompt)])
    try:
        return json.loads(resp.content)
    except json.JSONDecodeError:
        s, e = resp.content.find("{"), resp.content.rfind("}") + 1
        return json.loads(resp.content[s:e]) if s != -1 and e > s else {}


# ── Node 1: Extract Requirements (LLM call #1) ──────────────
def extract_requirements(state: Dict[str, Any]) -> Dict[str, Any]:
    result = _llm_json(f"""
You are a senior technical recruiter. Extract roles a founder still needs to hire.
Normalize names: "uix desinger" → "UI/UX Designer", "backend guy" → "Backend Engineer".
Also extract their total hiring budget if they mention one.

Project: "{state['raw_input']}"

Return JSON: {{
  "budget": 50000, 
  "roles": [{{"title":"...","seniority":"junior|mid|senior|lead",
"employment_type":"fulltime|freelance|contract","required_skills":["..."],
"priority":"critical|important|nice-to-have"}}]
}}
""")
    roles = []
    for r in result.get("roles", []):
        try: roles.append(Role(**r).model_dump())
        except Exception: continue
    
    budget = result.get("budget", state.get("budget"))
    if isinstance(budget, str):
        budget = float(''.join(c for c in budget if c.isdigit() or c == '.')) if any(c.isdigit() for c in budget) else None
        
    return {**state, "extracted_roles": roles, "budget": budget}


# ── Node 2: Search Candidates (LOCAL DB + Optional GitHub) ──
async def search_candidates(state: Dict[str, Any]) -> Dict[str, Any]:
    roles = [Role(**r) for r in state.get("extracted_roles", [])]
    all_candidates = []

    for role in roles:
        key = f"candidates:{role.title}:{role.seniority}"
        cached = cache_get(key)  # Use sync version
        if cached:
            all_candidates.extend([Candidate(**c) for c in cached])
            continue
        
        # Search local database first (primary source)
        from tools.local_db_search import search_local_candidates, search_candidates_semantic
        
        # Try semantic search first (ChromaDB)
        local_candidates = await search_candidates_semantic(
            role.title, role.required_skills, role.seniority, limit=10
        )
        
        # If not enough candidates, try keyword search
        if len(local_candidates) < 5:
            keyword_candidates = await search_local_candidates(
                role.title, role.required_skills, limit=10
            )
            # Merge without duplicates
            existing_names = {c.name for c in local_candidates}
            for cand in keyword_candidates:
                if cand.name not in existing_names:
                    local_candidates.append(cand)
        
        # Optional: Add GitHub public profiles as supplementary source
        # (only if local DB has < 3 candidates)
        if len(local_candidates) < 3:
            try:
                gh = await search_github(role.title, role.required_skills, limit=3)
                if isinstance(gh, list):
                    local_candidates.extend(gh)
            except Exception as e:
                print(f"GitHub search error: {e}")
        
        all_candidates.extend(local_candidates)
        cache_set(key, [c.model_dump() for c in local_candidates], ttl=86400)  # Use sync version

    return {**state, "candidates": [c.model_dump() for c in all_candidates]}


# ── Node 3: Score Candidates (algorithmic, no LLM) ──────────
def score_candidates_node(state: Dict[str, Any]) -> Dict[str, Any]:
    roles = [Role(**r) for r in state.get("extracted_roles", [])]
    candidates = [Candidate(**c) for c in state.get("candidates", [])]
    scored = score_all(candidates, roles)
    return {**state, "candidates": [c.model_dump() for c in scored]}


# ── Node 4: Estimate Costs (DB, no LLM unless Layer 3) ──────
async def estimate_costs(state: Dict[str, Any]) -> Dict[str, Any]:
    roles = [Role(**r) for r in state.get("extracted_roles", [])]
    region, currency = state.get("region", "TN"), state.get("currency", "TND")
    cost_estimate = {}

    lookup_async = sync_to_async(lookup_salary_sync, thread_sensitive=True)

    for role in roles:
        rate = await lookup_async(role.title, role.seniority, region, currency)
        cost_estimate[role.title] = {
            "seniority": role.seniority,
            "employment_type": role.employment_type,
            "priority": role.priority, **rate,
        }

    return {**state, "cost_estimate": cost_estimate}


# ── Node 5: Synthesize Output (LLM call #2) ─────────────────
def synthesize_output(state: Dict[str, Any]) -> Dict[str, Any]:
    roles = state.get("extracted_roles", [])
    candidates = state.get("candidates", [])
    cost_estimate = state.get("cost_estimate", {})
    currency = state.get("currency", "TND")

    role_cands: Dict[str, list] = {}
    for c in candidates:
        r = c.get("matched_role", "Unknown")
        role_cands.setdefault(r, [])
        if len(role_cands[r]) < 2:
            role_cands[r].append(c)

    costs_fmt = {k: v.get("formatted") for k, v in cost_estimate.items()}
    top_fmt = {r: [{"name": c["name"], "url": c["profile_url"]} for c in cs] for r, cs in role_cands.items()}

    budget = state.get("budget")
    budget_ctx = f"Founder Budget: {budget} {currency}" if budget else ""

    result = _llm_json(f"""
You are a startup advisor. Write a 3-4 sentence response for the founder.
DO NOT hallucinate candidate names, salaries, or numbers. Only use the exact data provided below.
{budget_ctx}
Roles + costs ({currency}): {json.dumps(costs_fmt)}
Top candidates: {json.dumps(top_fmt)}

Confirm the roles, mention 1-2 candidates with their exact links from the data, and summarize the total estimated cost. If a budget was provided, mention if the cost is within budget.
Return JSON: {{"chat_response": "..."}}
""")
    chat_response = result.get("chat_response", "Team analysis complete.")

    a2a_roles = []
    for rd in roles:
        title = rd["title"]
        cost = cost_estimate.get(title, {})
        top = role_cands.get(title, [])
        a2a_roles.append({
            "title": title, "seniority": rd["seniority"],
            "employment_type": rd["employment_type"],
            "estimated_annual_cost_min": cost.get("annual_min"),
            "estimated_annual_cost_max": cost.get("annual_max"),
            "currency": currency, "priority": rd["priority"],
            "top_candidate_url": top[0]["profile_url"] if top else None,
            "salary_source": cost.get("source"),
        })

    return {
        **state, "chat_response": chat_response,
        "a2a_payload": {
            "agent": "team_builder", "version": "4.0",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "region": state.get("region", "TN"), "currency": currency,
            "budget": state.get("budget"), "required_roles": a2a_roles,
            "total_estimated_cost_min": sum(r.get("estimated_annual_cost_min") or 0 for r in a2a_roles),
            "total_estimated_cost_max": sum(r.get("estimated_annual_cost_max") or 0 for r in a2a_roles),
        },
    }
