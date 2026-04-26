from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from technical_advisor_agent.state import AgentState
from technical_advisor_agent.tracing import append_agent_step


PHASE_SEQUENCE = [
    "discovery",
    "stack",
    "architecture",
    "roadmap",
    "cost_feasibility",
    "security",
    "handoff",
]

PHASE_DECISION_KEYS = {
    "discovery",
    "stack",
    "architecture",
    "roadmap",
    "cost_feasibility",
    "security",
}

INTENT_TO_PHASE = {
    "stack": "stack",
    "stack_comparison": "stack",
    "architecture": "architecture",
    "roadmap": "roadmap",
    "cost": "cost_feasibility",
    "feasibility": "cost_feasibility",
    "security": "security",
    "libraries": "stack",
}

ADVISORY_INTENTS = {"stack", "stack_comparison", "architecture", "roadmap", "cost", "feasibility", "security", "libraries"}

DISCOVERY_REQUIRED_FIELDS = (
    "industry",
    "product_description",
    "phase",
    "team_size",
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _as_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    if hasattr(value, "model_dump"):
        dumped = value.model_dump()
        if isinstance(dumped, dict):
            return dumped
    if hasattr(value, "dict"):
        dumped = value.dict()
        if isinstance(dumped, dict):
            return dumped
    return {}


def _default_project_state() -> dict[str, Any]:
    return {
        "current_phase": "discovery",
        "completed_phases": [],
        "decisions": {
            "discovery": None,
            "stack": None,
            "architecture": None,
            "roadmap": None,
            "cost_feasibility": None,
            "security": None,
        },
        "progress": 0,
        "total_phases": len(PHASE_SEQUENCE),
        "revisiting": False,
        "revisit_target": None,
        "project_title": None,
        "discovery_turn_count": 0,
        "discovery_complete": False,
        "advisory_turn_count": 0,
        "last_advisory_intent": None,
        "last_updated": _now_iso(),
    }


def _normalize_phase(value: Any) -> str:
    candidate = str(value or "").strip().lower()
    if candidate in PHASE_SEQUENCE:
        return candidate
    return "discovery"


def _normalize_completed(phases: Any) -> list[str]:
    if not isinstance(phases, list):
        return []

    seen: set[str] = set()
    normalized: list[str] = []
    for item in phases:
        phase = _normalize_phase(item)
        if phase in seen:
            continue
        seen.add(phase)
        normalized.append(phase)

    return sorted(normalized, key=lambda item: PHASE_SEQUENCE.index(item))


def _next_phase(phase: str) -> str:
    if phase not in PHASE_SEQUENCE:
        return "discovery"

    idx = PHASE_SEQUENCE.index(phase)
    if idx + 1 < len(PHASE_SEQUENCE):
        return PHASE_SEQUENCE[idx + 1]
    return phase


def _next_unlocked_phase(completed_phases: list[str]) -> str:
    completed = set(completed_phases)
    for phase in PHASE_SEQUENCE:
        if phase not in completed:
            return phase
    return "handoff"


def _infer_project_title(founder_context: dict[str, Any], current_title: Any) -> str | None:
    title = str(current_title or "").strip()
    if title:
        return title

    description = str(founder_context.get("product_description") or "").strip()
    if not description:
        return None

    first_sentence = description.split(".")[0].strip()
    if not first_sentence:
        first_sentence = description

    return first_sentence[:80]


def _has_discovery_requirements(founder_context: dict[str, Any]) -> bool:
    for field in DISCOVERY_REQUIRED_FIELDS:
        value = founder_context.get(field)
        if value is None:
            return False
        if isinstance(value, str) and not value.strip():
            return False
    return True


def _infer_industry_from_description(description: str) -> str:
    low = str(description or "").lower()
    if any(token in low for token in ("fitness", "coach", "wellness", "health")):
        return "Healthcare"
    if any(token in low for token in ("bank", "payment", "fintech", "wallet", "invoice")):
        return "Fintech"
    if any(token in low for token in ("learn", "course", "education", "student", "teacher")):
        return "EdTech"
    if any(token in low for token in ("shop", "store", "ecommerce", "e-commerce", "checkout")):
        return "E-commerce"
    if "ai" in low:
        return "AI"
    return "SaaS"


def apply_discovery_defaults(state: AgentState) -> AgentState:
    founder_context = _as_dict(state.get("founder_context"))

    if not str(founder_context.get("phase") or "").strip():
        founder_context["phase"] = "idea"

    if founder_context.get("team_size") in (None, ""):
        founder_context["team_size"] = 1

    if not str(founder_context.get("technical_level") or "").strip():
        founder_context["technical_level"] = "intermediate"

    if not str(founder_context.get("target_region") or "").strip():
        founder_context["target_region"] = "global"

    if not str(founder_context.get("industry") or "").strip():
        founder_context["industry"] = _infer_industry_from_description(founder_context.get("product_description") or "")

    state["founder_context"] = founder_context
    return state


def infer_first_advisory_intent(state: AgentState) -> str:
    founder_context = _as_dict(state.get("founder_context"))
    description = str(founder_context.get("product_description") or "").lower()
    if any(token in description for token in ("ai", "agent", "copilot", "llm", "ml", "model")):
        return "architecture"
    return "stack"


def _decision_phase_for_state(project_state: dict[str, Any], state: AgentState) -> str:
    if project_state.get("revisiting") and project_state.get("revisit_target") in PHASE_DECISION_KEYS:
        return str(project_state["revisit_target"])

    current_phase = _normalize_phase(project_state.get("current_phase"))
    if current_phase in PHASE_DECISION_KEYS:
        return current_phase

    intent = str(state.get("intent") or "").strip().lower()
    return INTENT_TO_PHASE.get(intent, "stack")


def _to_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return False


def _merge_decisions(project_state: dict[str, Any], state: AgentState) -> None:
    payload = state.get("a2a_payload") if isinstance(state.get("a2a_payload"), dict) else {}
    if not payload:
        return

    decision_phase = _decision_phase_for_state(project_state, state)
    if decision_phase not in PHASE_DECISION_KEYS:
        return

    decisions = _as_dict(project_state.get("decisions"))
    bucket = decisions.get(decision_phase)
    if not isinstance(bucket, dict):
        bucket = {}

    new_decisions = payload.get("new_decisions")
    if isinstance(new_decisions, dict):
        for key, value in new_decisions.items():
            if isinstance(key, str) and key.strip():
                bucket[key] = value

    phase_summary = str(payload.get("phase_summary") or "").strip()
    if phase_summary:
        bucket["phase_summary"] = phase_summary

    if decision_phase == "discovery":
        founder_context = _as_dict(state.get("founder_context"))
        for key in DISCOVERY_REQUIRED_FIELDS:
            if founder_context.get(key) is not None:
                bucket[key] = founder_context.get(key)

    decisions[decision_phase] = bucket if bucket else None
    project_state["decisions"] = decisions


def _update_phase_progress(project_state: dict[str, Any], state: AgentState) -> None:
    payload = state.get("a2a_payload") if isinstance(state.get("a2a_payload"), dict) else {}
    phase_complete = _to_bool(payload.get("phase_complete"))

    current_phase = _normalize_phase(project_state.get("current_phase"))
    completed = _normalize_completed(project_state.get("completed_phases"))

    founder_context = _as_dict(state.get("founder_context"))
    if current_phase == "discovery" and _has_discovery_requirements(founder_context):
        phase_complete = True
        if not str(payload.get("phase_summary") or "").strip():
            decisions = _as_dict(project_state.get("decisions"))
            discovery_bucket = decisions.get("discovery")
            if not isinstance(discovery_bucket, dict):
                discovery_bucket = {}
            discovery_bucket["phase_summary"] = "Discovery details captured and ready for stack planning."
            decisions["discovery"] = discovery_bucket
            project_state["decisions"] = decisions

    if phase_complete and current_phase not in completed:
        completed.append(current_phase)
        completed = _normalize_completed(completed)

    revisiting = _to_bool(project_state.get("revisiting"))
    if phase_complete and revisiting:
        project_state["revisiting"] = False
        project_state["revisit_target"] = None
        project_state["current_phase"] = _next_unlocked_phase(completed)
    elif phase_complete:
        project_state["current_phase"] = _next_phase(current_phase)

    if _normalize_phase(project_state.get("current_phase")) == "handoff" and "security" in completed:
        project_state["progress"] = max(len(completed), 6)
    else:
        project_state["progress"] = len(completed)

    project_state["completed_phases"] = completed


def _update_turn_counters(project_state: dict[str, Any], state: AgentState, *, increment_discovery: bool = True) -> None:
    current_phase = _normalize_phase(project_state.get("current_phase"))
    message_type = str(state.get("message_type") or "user_message").strip().lower()
    previous_discovery_turns = int(project_state.get("discovery_turn_count") or 0)
    discovery_complete = _to_bool(project_state.get("discovery_complete"))

    if current_phase == "discovery" and not discovery_complete:
        next_turns = previous_discovery_turns + (1 if increment_discovery else 0)
        project_state["discovery_turn_count"] = next_turns
        state["discovery_turn_count"] = next_turns

        if message_type == "confirm" or next_turns >= 2:
            apply_discovery_defaults(state)
            discovery_complete = True
            project_state["discovery_complete"] = True
            state["discovery_complete"] = True
            if "discovery" not in project_state.get("completed_phases", []):
                project_state["completed_phases"] = _normalize_completed(
                    list(project_state.get("completed_phases") or []) + ["discovery"]
                )
            project_state["current_phase"] = "stack"
            state["intent"] = state.get("intent") or infer_first_advisory_intent(state)
    else:
        project_state["discovery_turn_count"] = previous_discovery_turns
        project_state["discovery_complete"] = discovery_complete
        state["discovery_turn_count"] = previous_discovery_turns
        state["discovery_complete"] = discovery_complete

    current_intent = str(state.get("intent") or "").strip().lower()
    advisory_turn_count = int(project_state.get("advisory_turn_count") or 0)
    last_advisory_intent = str(project_state.get("last_advisory_intent") or "").strip().lower()
    if current_intent in ADVISORY_INTENTS:
        if current_intent == last_advisory_intent:
            advisory_turn_count += 1
        else:
            advisory_turn_count = 1
        project_state["last_advisory_intent"] = current_intent
    project_state["advisory_turn_count"] = advisory_turn_count
    state["advisory_turn_count"] = advisory_turn_count
    state["last_advisory_intent"] = project_state.get("last_advisory_intent")


def project_state_manager(state: AgentState) -> AgentState:
    existing = _as_dict(state.get("project_state"))
    project_state = _default_project_state()
    project_state.update(existing)

    project_state["current_phase"] = _normalize_phase(project_state.get("current_phase"))
    project_state["completed_phases"] = _normalize_completed(project_state.get("completed_phases"))

    decisions = _as_dict(project_state.get("decisions"))
    normalized_decisions = {}
    for key in PHASE_DECISION_KEYS:
        value = decisions.get(key)
        normalized_decisions[key] = value if isinstance(value, dict) else None
    project_state["decisions"] = normalized_decisions

    revisit_target = project_state.get("revisit_target")
    if project_state.get("revisiting") and revisit_target in PHASE_DECISION_KEYS:
        project_state["current_phase"] = str(revisit_target)
    else:
        project_state["revisiting"] = False
        project_state["revisit_target"] = None

    project_state["project_title"] = _infer_project_title(
        _as_dict(state.get("founder_context")),
        project_state.get("project_title"),
    )

    if not state.get("a2a_payload"):
        _update_turn_counters(project_state, state)

    _merge_decisions(project_state, state)
    _update_phase_progress(project_state, state)

    if state.get("a2a_payload"):
        _update_turn_counters(project_state, state, increment_discovery=False)

    project_state["current_phase"] = _normalize_phase(project_state.get("current_phase"))
    project_state["completed_phases"] = _normalize_completed(project_state.get("completed_phases"))
    project_state["progress"] = max(0, min(len(PHASE_SEQUENCE), int(project_state.get("progress") or 0)))
    project_state["total_phases"] = len(PHASE_SEQUENCE)
    project_state["last_updated"] = _now_iso()

    state["project_state"] = project_state
    state["updated_project_state"] = project_state
    state["current_phase"] = str(project_state.get("current_phase") or "discovery")
    state["completed_phases"] = list(project_state.get("completed_phases") or [])
    state["phase_decisions"] = _as_dict(project_state.get("decisions"))
    state["is_revisiting"] = _to_bool(project_state.get("revisiting"))
    state["discovery_turn_count"] = int(project_state.get("discovery_turn_count") or 0)
    state["discovery_complete"] = _to_bool(project_state.get("discovery_complete"))
    state["advisory_turn_count"] = int(project_state.get("advisory_turn_count") or 0)
    state["last_advisory_intent"] = project_state.get("last_advisory_intent")

    append_agent_step(
        state,
        step="Project State Manager",
        details="Updated project journey phase and decision memory.",
        metadata={
            "current_phase": state.get("current_phase"),
            "completed_phases": state.get("completed_phases"),
            "revisiting": state.get("is_revisiting"),
            "progress": project_state.get("progress"),
            "discovery_turn_count": state.get("discovery_turn_count"),
            "discovery_complete": state.get("discovery_complete"),
            "advisory_turn_count": state.get("advisory_turn_count"),
        },
    )
    return state
