import re
from typing import Any

from technical_advisor_agent.state import AgentState
from technical_advisor_agent.tracing import append_agent_step


REQUIRED_DISCOVERY_FIELDS = ("industry", "product_description", "phase", "team_size")
DISCOVERY_MEMORY_FIELDS = (
    "industry",
    "product_description",
    "phase",
    "team_size",
    "budget_usd",
    "existing_stack",
    "target_region",
    "technical_level",
)

INDUSTRY_KEYWORDS = {
    "saas": "SaaS",
    "fintech": "Fintech",
    "health": "Healthcare",
    "healthcare": "Healthcare",
    "edtech": "EdTech",
    "ecommerce": "E-commerce",
    "e-commerce": "E-commerce",
    "marketplace": "Marketplace",
    "logistics": "Logistics",
    "ai": "AI",
}

COMMAND_MESSAGE_TYPES = {"command", "confirm", "deny"}
COMMAND_PHRASE_PREFIXES = [
    "yes, use these details",
    "proceed with the draft",
    "proceed with this draft",
    "i want to compare two stacks",
    "not yet",
    "yes",
    "no",
    "confirm",
    "proceed",
    "skip",
    "continue",
    "go ahead",
    "looks right",
    "looks right, let's go",
]

# Maps normalized command text (lowercased, stripped of trailing punctuation)
# to the target phase and intent for direct phase navigation.
PHASE_NAV_MAP: dict[str, dict[str, str]] = {
    "proceed to stack": {"current_phase": "stack", "intent": "stack"},
    "let's move to architecture": {"current_phase": "architecture", "intent": "architecture"},
    "let's move to roadmap": {"current_phase": "roadmap", "intent": "roadmap"},
    "let's move to cost and feasibility": {"current_phase": "cost_feasibility", "intent": "cost"},
    "let's move to cost & feasibility": {"current_phase": "cost_feasibility", "intent": "cost"},
    "let's move to security": {"current_phase": "security", "intent": "security"},
    "let's move to team building": {"current_phase": "team_building", "intent": "team_building"},
    "proceed to architecture": {"current_phase": "architecture", "intent": "architecture"},
    "proceed to roadmap": {"current_phase": "roadmap", "intent": "roadmap"},
    "proceed to cost and feasibility": {"current_phase": "cost_feasibility", "intent": "cost"},
    "proceed to cost & feasibility": {"current_phase": "cost_feasibility", "intent": "cost"},
    "proceed to security": {"current_phase": "security", "intent": "security"},
    "proceed to team building": {"current_phase": "team_building", "intent": "team_building"},
}

# Phase that becomes completed when the user navigates away from it.
PHASE_NAV_COMPLETES: dict[str, str] = {
    "stack": "discovery",
    "architecture": "stack",
    "roadmap": "architecture",
    "cost_feasibility": "roadmap",
    "security": "cost_feasibility",
    "handoff": "security",
    "team_building": "security",
}


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _to_text(value: Any) -> str:
    return str(value or "").strip()


def _is_stack_compare_command(text: str) -> bool:
    cleaned = _to_text(text).lower().strip().rstrip(".")
    return cleaned == "i want to compare two stacks"


def _detect_phase_nav(text: str) -> dict[str, str] | None:
    """Return {current_phase, intent} if text is a phase-navigation command, else None."""
    cleaned = _to_text(text).lower().strip().rstrip(".").rstrip("→").strip()
    for prefix, nav in PHASE_NAV_MAP.items():
        if cleaned == prefix or cleaned.startswith(prefix):
            return nav
    return None


def _is_proceed_with_winner(text: str) -> str | None:
    """Return the winner name if text is a 'Proceed with <stack>.' command, else None."""
    cleaned = _to_text(text).strip().rstrip(".")
    lower = cleaned.lower()
    if lower.startswith("proceed with "):
        winner = cleaned[len("Proceed with "):].strip()
        if winner:
            return winner
    return None


def _is_yes(text: str) -> bool:
    t = text.lower().strip()
    return t in {"yes", "y", "ok", "sure", "go ahead", "approved", "proceed", "sounds good"} or t.startswith("yes ")


def _is_no(text: str) -> bool:
    t = text.lower().strip()
    return t in {"no", "n", "nope", "not now", "don't", "do not", "skip"} or t.startswith("no ")


def is_command_message(state: AgentState) -> bool:
    msg_type = _to_text(state.get("message_type")).lower()
    if msg_type in COMMAND_MESSAGE_TYPES:
        return True

    query = _to_text(state.get("user_query")).lower().rstrip(".")
    if not query:
        return False
    return any(query.startswith(prefix) for prefix in COMMAND_PHRASE_PREFIXES)


def _extract_updates(user_query: str, founder_context: dict[str, Any]) -> dict[str, Any]:
    updates: dict[str, Any] = {}
    q = _to_text(user_query)
    low = q.lower()

    if not _to_text(founder_context.get("industry")):
        for token, label in INDUSTRY_KEYWORDS.items():
            if re.search(rf"\b{re.escape(token)}\b", low):
                updates["industry"] = label
                break

    if not _to_text(founder_context.get("phase")):
        if re.search(r"\b(plan(?:ning)?|from scratch|starting out|just starting)\b", low):
            updates["phase"] = "idea"
        if re.search(r"\bidea\b", low):
            updates["phase"] = "idea"
        elif re.search(r"\bmvp\b", low):
            updates["phase"] = "mvp"
        elif re.search(r"\bv1\b", low):
            updates["phase"] = "v1"
        elif re.search(r"\bscal(e|ing)\b", low):
            updates["phase"] = "scaling"

    if founder_context.get("team_size") in (None, ""):
        if re.search(r"\b(no team|no\s+one|just me|solo founder|alone)\b", low):
            updates["team_size"] = 0
        team_match = re.search(r"\b(\d{1,3})\s*(?:engineers?|developers?|devs?|people|team(?:\s+members?)?)\b", low)
        if team_match:
            updates["team_size"] = int(team_match.group(1))

    if founder_context.get("budget_usd") in (None, ""):
        budget_match = re.search(r"\$\s*(\d+[\d,]*)(k|m)?", low)
        if budget_match:
            amount = int(budget_match.group(1).replace(",", ""))
            suffix = (budget_match.group(2) or "").lower()
            if suffix == "k":
                amount *= 1_000
            elif suffix == "m":
                amount *= 1_000_000
            updates["budget_usd"] = amount

    if not _to_text(founder_context.get("product_description")):
        command_like = any(low.startswith(prefix) for prefix in COMMAND_PHRASE_PREFIXES)
        if len(q) >= 25 and not _is_yes(q) and not _is_no(q) and not command_like:
            updates["product_description"] = q

    if not _to_text(founder_context.get("target_region")):
        region_match = re.search(r"\b(?:in|for|target(?:ing)?)\s+(mena|europe|eu|us|usa|north america|africa|asia|global)\b", low)
        if region_match:
            updates["target_region"] = region_match.group(1)

    if not founder_context.get("existing_stack"):
        stack_tokens = []
        for token in ["react", "next.js", "nextjs", "vue", "angular", "node", "fastapi", "django", "postgres", "mongodb", "redis", "aws", "gcp", "azure"]:
            if token in low:
                stack_tokens.append(token)
        if stack_tokens:
            updates["existing_stack"] = sorted(set(stack_tokens))

    return updates


def _missing_fields(founder_context: dict[str, Any]) -> list[str]:
    missing = []
    for field in REQUIRED_DISCOVERY_FIELDS:
        value = founder_context.get(field)
        if value is None:
            missing.append(field)
        elif isinstance(value, str) and not value.strip():
            missing.append(field)
    return missing


def _hydrate_from_project_memory(founder_context: dict[str, Any], project_state: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    decisions = _as_dict(project_state.get("decisions"))
    discovery = _as_dict(decisions.get("discovery"))

    if not discovery:
        return founder_context, []

    hydrated = dict(founder_context)
    restored_fields: list[str] = []

    for field in DISCOVERY_MEMORY_FIELDS:
        current_value = hydrated.get(field)
        memory_value = discovery.get(field)

        is_missing = current_value is None or (isinstance(current_value, str) and not current_value.strip()) or (isinstance(current_value, list) and not current_value)
        has_memory = memory_value is not None and not (isinstance(memory_value, str) and not memory_value.strip())

        if is_missing and has_memory:
            hydrated[field] = memory_value
            restored_fields.append(field)

    return hydrated, restored_fields


def _consent_prompt(pending_updates: dict[str, Any], missing: list[str]) -> tuple[str, dict[str, Any]]:
    stage_question = "Which stage are you currently in: idea, MVP, V1, or scaling?"
    team_question = "How many people are actively building this right now?"

    next_question = stage_question if "phase" in missing else team_question if "team_size" in missing else "What is your top success metric for the next 90 days?"

    understood_parts = []
    if pending_updates.get("industry"):
        understood_parts.append(f"industry = {pending_updates.get('industry')}")
    if pending_updates.get("product_description"):
        understood_parts.append("a product concept")

    understood_line = ", ".join(understood_parts) if understood_parts else "some useful project details"

    chat = (
        f"Here is what I understood so far: {understood_line}. "
        "If this looks right, use the highlighted button and I will immediately improve your project idea with a concrete draft. "
        f"Then we can continue with this next question: {next_question}"
    )
    payload = {
        "intent": "discovery",
        "phase_complete": False,
        "phase_summary": "Waiting for your confirmation before using these details in future steps.",
        "next_question": next_question,
        "new_decisions": {
            "pending_context_updates": pending_updates,
            "captured_fields": sorted(pending_updates.keys()),
            "missing_context_fields": missing,
            "context_storage_consent": None,
            "understood_summary": understood_line,
        },
        "interaction": {
            "type": "confirmation",
            "key": "context_storage",
            "prompt": "Can I use these details as your project info going forward?",
            "options": [
                {"id": "yes", "label": "Yes, use these details", "message": "Yes, use these details."},
                {"id": "no", "label": "Not yet", "message": "Not yet, keep exploring first."},
                {"id": "proceed", "label": "Proceed with this draft", "message": "Yes, use these details and proceed with the draft."},
            ],
        },
        "suggest_next_phase": False,
    }
    return chat, payload


def _consent_state(project_state: dict[str, Any]) -> bool | None:
    decisions = _as_dict(project_state.get("decisions"))
    discovery = _as_dict(decisions.get("discovery"))
    consent = discovery.get("context_storage_consent")
    if isinstance(consent, bool):
        return consent
    return None


def hydrate_from_stored_state(state: AgentState, *, details: str = "Command message detected, skipped extraction and hydrated stored context.") -> AgentState:
    project_state = _as_dict(state.get("project_state"))
    founder_context = _as_dict(state.get("founder_context"))
    hydrated, restored_fields = _hydrate_from_project_memory(founder_context, project_state)
    state["founder_context"] = hydrated
    state["context_valid"] = True
    state["validation_error"] = None

    append_agent_step(
        state,
        step="Context Validator",
        details=details,
        status="completed",
        metadata={
            "restored_from_memory": restored_fields,
            "message_type": _to_text(state.get("message_type")).lower() or "user_message",
        },
    )
    return state


def context_validator(state: AgentState) -> AgentState:
    if is_command_message(state):
        user_query = state.get("user_query", "")

        # Phase navigation command: "Proceed to Roadmap.", "Let's move to Security.", etc.
        nav = _detect_phase_nav(user_query)
        if nav:
            project_state = _as_dict(state.get("project_state"))
            target_phase = nav["current_phase"]
            # Mark the phase that is being left as completed.
            completed = list(project_state.get("completed_phases") or [])
            phase_to_complete = PHASE_NAV_COMPLETES.get(target_phase)
            if phase_to_complete and phase_to_complete not in completed:
                completed.append(phase_to_complete)
            project_state["completed_phases"] = completed
            project_state["current_phase"] = target_phase
            state["project_state"] = project_state
            state["intent"] = nav["intent"]
            return hydrate_from_stored_state(
                state,
                details=f"Phase navigation command detected: advancing to '{target_phase}'.",
            )

        # Stack comparison setup command.
        if _is_stack_compare_command(user_query):
            hydrated = hydrate_from_stored_state(state)
            hydrated["intent"] = "stack_comparison_setup"
            return hydrated

        # "Proceed with <winner>" command: deliver updated stack blueprint for chosen stack.
        winner = _is_proceed_with_winner(user_query)
        if winner:
            state["intent"] = "stack"
            state["user_query"] = (
                f"The founder selected '{winner}' as the recommended stack. "
                f"Deliver the final Stack Blueprint for this choice."
            )
            return hydrate_from_stored_state(
                state,
                details=f"Comparison winner selected: '{winner}'. Routing to stack blueprint.",
            )

        # Project brief generation command — pre-load all decisions into kb_results
        # so the synthesizer can assemble the complete brief in one shot.
        query_normalized = _to_text(user_query).lower().rstrip(".").strip()
        if "generate the project brief" in query_normalized:
            state["intent"] = "project_brief"
            project_state_inner = _as_dict(state.get("project_state"))
            decisions = _as_dict(project_state_inner.get("decisions"))
            state["kb_results"] = {"phase_decisions": decisions}
            state["search_results"] = []
            return hydrate_from_stored_state(
                state,
                details="Project brief command detected. Routing to project_brief synthesis.",
            )

        return hydrate_from_stored_state(state)

    project_state = _as_dict(state.get("project_state"))
    founder_context = _as_dict(state.get("founder_context"))
    founder_context, restored_fields = _hydrate_from_project_memory(founder_context, project_state)
    state["founder_context"] = founder_context

    decisions = _as_dict(project_state.get("decisions"))
    discovery = _as_dict(decisions.get("discovery"))
    pending_updates = _as_dict(discovery.get("pending_context_updates"))
    user_query = _to_text(state.get("user_query"))
    consent_status = _consent_state(project_state)

    state["context_valid"] = True
    state["validation_error"] = None

    # Handle explicit consent response when there is a pending context update.
    if pending_updates and _is_yes(user_query):
        merged = dict(founder_context)
        merged.update(pending_updates)
        state["founder_context"] = merged
        missing_after_merge = _missing_fields(merged)
        next_question = "Which stage are you currently in: idea, MVP, V1, or scaling?" if "phase" in missing_after_merge else "How many people are actively building this right now?" if "team_size" in missing_after_merge else "What is your top success metric for the next 90 days?"
        state["a2a_payload"] = {
            "intent": "discovery",
            "phase_complete": False,
            "phase_summary": "Great, I will use these details as we continue.",
            "next_question": next_question,
            "new_decisions": {
                "pending_context_updates": {},
                "context_storage_consent": True,
                "captured_fields": [],
                "missing_context_fields": missing_after_merge,
            },
            "suggest_next_phase": False,
        }
        state["chat_response"] = f"Great, I will use these details. Next question: {next_question}"
    elif pending_updates and _is_no(user_query):
        next_question = "No problem. Tell me your current stage (idea, MVP, V1, or scaling)."
        state["chat_response"] = f"Understood. We will keep exploring first. {next_question}"
        state["a2a_payload"] = {
            "intent": "discovery",
            "phase_complete": False,
            "phase_summary": "You chose to keep exploring before using those details.",
            "next_question": next_question,
            "new_decisions": {
                "pending_context_updates": {},
                "context_storage_consent": False,
                "captured_fields": [],
                "missing_context_fields": _missing_fields(founder_context),
            },
            "suggest_next_phase": False,
        }
    else:
        extracted = _extract_updates(user_query, founder_context)
        if extracted:
            merged = dict(founder_context)
            merged.update(extracted)
            state["founder_context"] = merged
            state["context_valid"] = True

    # Optional fast-path defaults after consent to keep discovery within 1-2 turns.
    if state.get("context_valid") and consent_status is True:
        hydrated = _as_dict(state.get("founder_context"))
        if not _to_text(hydrated.get("phase")):
            hydrated["phase"] = "idea"
        if hydrated.get("team_size") in (None, ""):
            hydrated["team_size"] = 0
        state["founder_context"] = hydrated

    state["founder_context"] = _as_dict(state.get("founder_context"))

    append_agent_step(
        state,
        step="Context Validator",
        details="Validated and/or discovered founder context with consent gating.",
        status="completed" if state.get("context_valid") else "failed",
        metadata={
            "missing_fields": _missing_fields(_as_dict(state.get("founder_context"))),
            "restored_from_memory": restored_fields,
            "has_pending_consent": bool(_as_dict((_as_dict((_as_dict(state.get("project_state"))).get("decisions"))).get("discovery")).get("pending_context_updates")),
        },
    )
    return state
