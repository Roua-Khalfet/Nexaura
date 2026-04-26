import json
import re

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

from technical_advisor_agent.state import AgentState
from technical_advisor_agent.tracing import append_agent_step


load_dotenv()

llm = ChatOpenAI(model="gpt-4o", temperature=0)

VALID_INTENTS = {
    "general",
    "stack",
    "architecture",
    "roadmap",
    "feasibility",
    "cost",
    "security",
    "libraries",
    "stack_comparison",
    "stack_comparison_setup",
    "team_building",
    "project_brief",
}
DEFAULT_INTENT = "general"

INTENT_ALIASES = {
    "tech_stack": "stack",
    "stack_recommendation": "stack",
    "stack_recommend": "stack",
    "architecture_design": "architecture",
    "system_architecture": "architecture",
    "planning": "roadmap",
    "implementation_plan": "roadmap",
    "plan": "roadmap",
    "viability": "feasibility",
    "feasible": "feasibility",
    "cost_estimation": "cost",
    "cost_analysis": "cost",
    "pricing": "cost",
    "security_review": "security",
    "compliance": "security",
    "dependencies": "libraries",
    "frameworks": "libraries",
    "library": "libraries",
    "compare": "stack_comparison",
    "comparison": "stack_comparison",
    "chat": "general",
    "general": "general",
    "idea": "general",
}


def _normalize_intent(value: str | None) -> str | None:
    if not value:
        return None

    intent = str(value).strip().lower().replace("-", "_").replace(" ", "_")
    if intent in VALID_INTENTS:
        return intent

    if intent in INTENT_ALIASES:
        return INTENT_ALIASES[intent]

    # Handle free-form variants like "cost estimation", "security/compliance", etc.
    if "compare" in intent or "_vs_" in intent or "vs" == intent:
        return "stack_comparison"
    if "cost" in intent or "budget" in intent or "price" in intent:
        return "cost"
    if "roadmap" in intent or "plan" in intent:
        return "roadmap"
    if "architect" in intent:
        return "architecture"
    if "feasib" in intent or "viab" in intent:
        return "feasibility"
    if "security" in intent or "compliance" in intent:
        return "security"
    if "librar" in intent or "dependenc" in intent or "framework" in intent:
        return "libraries"
    if "stack" in intent:
        return "stack"
    if "general" in intent or "chat" in intent or "idea" in intent:
        return "general"

    return None


def _extract_json_object(text: str) -> dict:
    raw = str(text or "").strip()
    if not raw:
        raise ValueError("Empty classifier output")

    # Remove markdown fences if present.
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw).strip()

    # Direct parse first.
    try:
        return json.loads(raw)
    except Exception:
        pass

    # Fallback: parse the first JSON object found in text.
    match = re.search(r"\{[\s\S]*\}", raw)
    if not match:
        raise ValueError("No JSON object found in classifier output")
    return json.loads(match.group(0))


def _intent_from_query(query: str) -> str | None:
    q = str(query or "").lower()
    if not q:
        return None

    # Comparison first to avoid false positives on stack/cost terms.
    if re.search(r"\b(vs\.?|versus|compare|comparison|against)\b", q):
        return "stack_comparison"

    if re.search(r"\b(cost|budget|pricing|price|estimate|estimation|runway|burn)\b", q):
        return "cost"

    if re.search(r"\b(roadmap|milestone|timeline|phases?|plan)\b", q):
        return "roadmap"

    if re.search(r"\b(feasibility|feasible|viable|viability|risk)\b", q):
        return "feasibility"

    if re.search(r"\b(security|compliance|gdpr|hipaa|soc2|iso\s*27001|threat)\b", q):
        return "security"

    if re.search(r"\b(libraries|library|dependency|dependencies|sdk|package)\b", q):
        return "libraries"

    if re.search(r"\b(architecture|architect|topology|microservices?|monolith|event\s*driven)\b", q):
        return "architecture"

    if re.search(r"\b(stack|framework|frontend|backend|database|recommend)\b", q):
        return "stack"

    return "general"


def _comparison_options_from_query(query: str) -> tuple[str | None, str | None]:
    q = str(query or "").strip()
    if not q:
        return None, None

    vs_match = re.search(r"(?i)\b(.+?)\s+(?:vs\.?|versus|against)\s+(.+?)\b[\?\.!]?$", q)
    if vs_match:
        left = vs_match.group(1).strip(" \t\n\"'")
        right = vs_match.group(2).strip(" \t\n\"'")
        if left and right:
            return left, right

    compare_match = re.search(r"(?i)\bcompare\s+(.+?)\s+(?:and|with)\s+(.+?)\b[\?\.!]?$", q)
    if compare_match:
        left = compare_match.group(1).strip(" \t\n\"'")
        right = compare_match.group(2).strip(" \t\n\"'")
        if left and right:
            return left, right

    return None, None

CLASSIFIER_PROMPT = """
You are a routing classifier for a technical advisor agent.

Given the founder's profile and question, return ONLY valid JSON with this schema:
{{"intent": "general|stack|architecture|roadmap|feasibility|cost|security|libraries|stack_comparison|stack_comparison_setup", "option_a": string|null, "option_b": string|null}}

Set option_a and option_b only for stack_comparison queries (for example: "React vs Vue").
Use null for non-comparison intents.

No explanation. JSON only.

Founder profile:
- Industry: {industry}
- Phase: {phase}
- Existing stack: {existing_stack}

Question: {user_query}
"""


def _ctx_get(ctx, key, default=""):
    if isinstance(ctx, dict):
        return ctx.get(key, default)
    return getattr(ctx, key, default)


def intent_classifier(state: AgentState) -> AgentState:
    pre_set_intent = str(state.get("intent") or "").strip().lower()
    message_type = str(state.get("message_type") or "").strip().lower()
    # Skip LLM classification when intent was already resolved by context_validator
    # (phase-navigation commands, stack_comparison_setup, comparison winner selection).
    if pre_set_intent in VALID_INTENTS and message_type == "command":
        append_agent_step(
            state,
            step="Intent Classifier",
            details="Skipped classification because intent was pre-set by command routing.",
            metadata={"intent": pre_set_intent},
        )
        return state

    ctx = state.get("founder_context", {})
    user_query = state.get("user_query", "")
    prompt = CLASSIFIER_PROMPT.format(
        industry=_ctx_get(ctx, "industry", ""),
        phase=_ctx_get(ctx, "phase", ""),
        existing_stack=_ctx_get(ctx, "existing_stack", []),
        user_query=user_query,
    )
    raw = ""

    intent = DEFAULT_INTENT
    option_a = None
    option_b = None

    # First-pass deterministic routing to avoid over-reliance on LLM formatting.
    intent_from_query = _intent_from_query(user_query)

    try:
        raw = llm.invoke(prompt).content.strip()
        data = _extract_json_object(raw)

        normalized = _normalize_intent(data.get("intent"))
        intent = normalized or intent_from_query or DEFAULT_INTENT

        if intent == "stack_comparison":
            option_a = str(data.get("option_a") or "").strip() or None
            option_b = str(data.get("option_b") or "").strip() or None
            if not (option_a and option_b):
                option_a, option_b = _comparison_options_from_query(user_query)
    except Exception:
        # Robust fallback path when LLM output is malformed.
        intent = intent_from_query or DEFAULT_INTENT
        if intent == "stack_comparison":
            option_a, option_b = _comparison_options_from_query(user_query)

    state["intent"] = intent
    state["comparison_option_a"] = option_a
    state["comparison_option_b"] = option_b
    append_agent_step(
        state,
        step="Intent Classifier",
        details="Classified intent and parsed comparison options.",
        metadata={
            "intent": intent,
            "option_a": option_a,
            "option_b": option_b,
            "intent_from_query": intent_from_query,
            "raw_classifier": raw,
        },
    )
    return state
