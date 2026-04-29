import json
from typing import Any, Dict, List

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

from technical_advisor_agent.state import AgentState
from technical_advisor_agent.synthesizer import prompts


load_dotenv()

llm = ChatOpenAI(model="gpt-4o", temperature=0)

DISCOVERY_REQUIRED_FIELDS = (
    "industry",
    "product_description",
    "phase",
    "team_size",
)


def _ctx_get(ctx, key, default=""):
    if isinstance(ctx, dict):
        return ctx.get(key, default)
    return getattr(ctx, key, default)


def _fmt_search(results: List[Dict[str, Any]]) -> str:
    if not results:
        return "None"
    lines = []
    for r in results:
        title = r.get("title") or ""
        url = r.get("url") or ""
        content = r.get("content") or ""
        lines.append(f"- {title} ({url}): {content}")
    return "\n".join(lines)


def _fmt_kb(kb: Dict[str, Any]) -> str:
    if not kb:
        return "None"
    try:
        return json.dumps(kb, indent=2)
    except Exception:
        return str(kb)


def _fmt_github(repos: List[Dict[str, Any]]) -> str:
    if not repos:
        return "None"
    lines = []
    for r in repos:
        lines.append(f"- {r.get('name')}: ⭐ {r.get('stars')} | {r.get('url')} | {r.get('description')}")
    return "\n".join(lines)


def _fmt_history(conversation_history: List[Dict[str, str]]) -> str:
    if not conversation_history:
        return ""

    lines = ["[CONVERSATION HISTORY]"]
    for item in conversation_history:
        role = str(item.get("role", "")).strip().lower()
        content = str(item.get("content", "")).strip()
        if not content:
            continue
        prefix = "User" if role == "user" else "Assistant"
        lines.append(f"{prefix}: {content}")
    lines.append("[END HISTORY]")
    return "\n".join(lines).strip()


def _fmt_obj(value: Any) -> str:
    try:
        return json.dumps(value, indent=2)
    except Exception:
        return str(value)


def _founder_context_summary(ctx: Any) -> str:
    payload = {
        "industry": _ctx_get(ctx, "industry", ""),
        "product_description": _ctx_get(ctx, "product_description", ""),
        "phase": _ctx_get(ctx, "phase", ""),
        "team_size": _ctx_get(ctx, "team_size", None),
        "budget_usd": _ctx_get(ctx, "budget_usd", None),
        "existing_stack": _ctx_get(ctx, "existing_stack", []),
        "target_region": _ctx_get(ctx, "target_region", ""),
        "technical_level": _ctx_get(ctx, "technical_level", ""),
    }
    return _fmt_obj(payload)


def _to_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return False


def _missing_discovery_fields(ctx: Any) -> list[str]:
    missing: list[str] = []
    for field in DISCOVERY_REQUIRED_FIELDS:
        value = _ctx_get(ctx, field, None)
        if value is None:
            missing.append(field)
            continue
        if isinstance(value, str) and not value.strip():
            missing.append(field)
    return missing


def _fmt_phase_decisions(value: Any) -> str:
    if isinstance(value, dict) and value:
        return _fmt_obj(value)
    return "{}"


def _language_instruction(state: AgentState) -> str:
    preferred_language = str(state.get("preferred_language") or "fr").strip().lower()
    if preferred_language in {"en", "eng", "english"}:
        return (
            "Language directive: respond in English. Keep the A2A payload structure unchanged, "
            "and keep any field values concise and natural in English."
        )

    return (
        "Language directive: respond in French by default. Keep the A2A payload structure unchanged, "
        "and keep any field values concise and natural in French."
    )


def _build_project_state_block(state: AgentState, ctx: Any) -> str:
    project_state = state.get("project_state") if isinstance(state.get("project_state"), dict) else {}

    current_phase = str(state.get("current_phase") or project_state.get("current_phase") or "discovery")
    completed_phases = state.get("completed_phases")
    if not isinstance(completed_phases, list):
        completed_phases = project_state.get("completed_phases") if isinstance(project_state.get("completed_phases"), list) else []

    phase_decisions = state.get("phase_decisions")
    if not isinstance(phase_decisions, dict):
        phase_decisions = project_state.get("decisions") if isinstance(project_state.get("decisions"), dict) else {}

    project_title = str(project_state.get("project_title") or "").strip() or "unknown"
    is_revisiting = _to_bool(state.get("is_revisiting") or project_state.get("revisiting"))

    project_state_block = """
=== PROJECT STATE ===
Current phase: {current_phase}
Completed phases: {completed_phases}
Project title: {project_title}
Known decisions:
{phase_decisions_formatted}

BEHAVIORAL RULES:
- You are guiding the founder through the \"{current_phase}\" phase.
- Do NOT re-ask for information already captured in completed phases.
- Reference past decisions naturally when relevant.
- When this phase's goals are fully addressed, include in your A2A payload:
    \"phase_complete\": true
    \"phase_summary\": \"<one sentence summary of what was decided>\"
- Extract any new decisions made in this turn into:
    \"new_decisions\": {{ \"<field>\": \"<value>\", ... }}
- If revisiting a phase (is_revisiting={is_revisiting}), acknowledge it:
    \"You're revisiting [phase]. Here's what we previously decided: ...\"
    Then ask if they want to keep or revise those decisions.
- If the founder provides info that belongs to a future phase, acknowledge it briefly
  and store it, but stay focused on the current phase.
=== END PROJECT STATE ===
""".strip().format(
        current_phase=current_phase,
        completed_phases=completed_phases,
        project_title=project_title,
        phase_decisions_formatted=_fmt_phase_decisions(phase_decisions),
        is_revisiting=str(is_revisiting).lower(),
    )

    if current_phase == "discovery":
        missing_fields = _missing_discovery_fields(ctx)
        missing_fields_label = ", ".join(missing_fields) if missing_fields else "none"
        project_state_block = (
            f"{project_state_block}\n\n"
            + prompts.DISCOVERY_ADDENDUM.format(missing_context_fields=missing_fields_label)
        )

    ADVISORY_PHASES = {"stack", "architecture", "roadmap", "cost", "security", "libraries", "feasibility"}
    if current_phase in ADVISORY_PHASES:
        project_state_block = (
            f"{project_state_block}\n\n"
            "CRITICAL BEHAVIORAL RULE FOR ADVISORY PHASES:\n"
            "- Deliver your full output for this phase.\n"
            "- Do NOT end with questions, unknowns, or requests for clarification.\n"
            "- Make confident assumptions if context is incomplete.\n"
            "- Always include interaction_options in your A2A payload exactly as shown in the prompt template.\n"
        )

    return project_state_block


def synthesizer(state: AgentState) -> AgentState:
    intent = state.get("intent") or "stack"
    ctx = state.get("founder_context", {})

    # Only force discovery intent when the agent is still in the discovery phase
    # AND no explicit advisory intent was already classified. Once the user sends
    # an explicit advisory request (e.g. "give me the tech stack"), the intent
    # classifier result takes precedence even if current_phase is still "discovery".
    current_phase = str(state.get("current_phase") or "discovery").strip().lower()
    discovery_complete = _to_bool(state.get("discovery_complete"))
    if current_phase == "discovery" and not discovery_complete:
        intent = "discovery"

    # Short-circuit: context_validator already built a complete response
    # (e.g. consent prompt with interaction buttons). Running the LLM here
    # would overwrite that payload and strip the action buttons entirely.
    if state.get("chat_response") and state.get("a2a_payload"):
        state["raw_llm_output"] = None
        return state

    prompt_template = prompts.PROMPT_MAP.get(intent, prompts.STACK_PROMPT)
    prompt = prompt_template.format(
        industry=_ctx_get(ctx, "industry", ""),
        product_description=_ctx_get(ctx, "product_description", ""),
        phase=_ctx_get(ctx, "phase", ""),
        team_size=_ctx_get(ctx, "team_size", ""),
        budget_usd=_ctx_get(ctx, "budget_usd", ""),
        existing_stack=_ctx_get(ctx, "existing_stack", []),
        target_region=_ctx_get(ctx, "target_region", ""),
        technical_level=_ctx_get(ctx, "technical_level", ""),
        search_results=_fmt_search(state.get("search_results", [])),
        kb_results=_fmt_kb(state.get("kb_results", {})),
        github_results=_fmt_github(state.get("github_results", [])),
        compliance=state.get("kb_results", {}).get("compliance", ""),
        rules=state.get("kb_results", {}).get("rules", ""),
        user_query=state.get("user_query", ""),
        mermaid_diagram=_ctx_get(
            state.get("kb_results", {}),
            "mermaid_diagram",
            (
                'client["Web Client"] --> edge["API Gateway"]\n'
                'edge --> auth["Auth Service"]\n'
                'edge --> api["Application API"]\n'
                'api --> worker["Background Worker"]\n'
                'api --> db["Primary Database"]\n'
                'worker -. events .-> bus["Event Bus"]\n'
                'bus -. triggers .-> api\n'
                'api --> cache["Redis Cache"]\n'
                'ops["Monitoring"] -. observes .-> api\n'
                'ops -. tracks .-> db'
            ),
        ),
        comparison_option_a_data=_fmt_obj((state.get("comparison_results") or {}).get("a", {})),
        comparison_option_b_data=_fmt_obj((state.get("comparison_results") or {}).get("b", {})),
        discovery_turn_count=int(state.get("discovery_turn_count") or 0),
        founder_context_summary=_founder_context_summary(ctx),
    )

    project_state_block = _build_project_state_block(state, ctx)
    prompt = f"{_language_instruction(state)}\n\n{project_state_block}\n\n{prompt}"

    history_block = _fmt_history(state.get("conversation_history", []))
    if history_block:
        prompt = f"{history_block}\n\nCurrent query: {state.get('user_query', '')}\n\n{prompt}"

    result = llm.invoke(prompt)
    state["raw_llm_output"] = result.content
    return state