import json
import re
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

from technical_advisor_agent.state import AgentState


load_dotenv()

llm = ChatOpenAI(model="gpt-4o", temperature=0)

CORRECTION_PROMPT = """
The following text contains a <A2A_PAYLOAD> block with invalid JSON.
Return ONLY the corrected JSON. No explanation. No markdown.

Text: {raw_output}
"""


def _normalize_references(state: AgentState) -> list[dict[str, str]]:
    refs: list[dict[str, str]] = []

    for item in state.get("search_results", []) or []:
        if not isinstance(item, dict):
            continue
        url = str(item.get("url") or "").strip()
        title = str(item.get("title") or url or "Untitled source").strip()
        if url:
            refs.append({"title": title, "url": url, "source": "web"})

    for item in state.get("github_results", []) or []:
        if not isinstance(item, dict):
            continue
        url = str(item.get("url") or "").strip()
        title = str(item.get("name") or url or "Untitled repository").strip()
        if url:
            refs.append({"title": title, "url": url, "source": "github"})

    kb_chunks = (state.get("kb_results", {}) or {}).get("retrieved_chunks", []) or []
    for item in kb_chunks:
        if not isinstance(item, dict):
            continue
        metadata = item.get("metadata") or {}
        source_file = str(metadata.get("source_file") or "").strip()
        if not source_file:
            continue
        refs.append({
            "title": source_file,
            "url": "",
            "source": "kb",
            "source_file": source_file,
        })

    deduped: list[dict[str, str]] = []
    seen: set[str] = set()
    for ref in refs:
        key = ref.get("url") or ref.get("source_file") or ref.get("title", "")
        if key in seen:
            continue
        seen.add(key)
        deduped.append(ref)
    return deduped


def _looks_like_mermaid(code: str) -> bool:
    first_line = (code or "").strip().splitlines()[0].strip() if (code or "").strip() else ""
    mermaid_starts = (
        "graph",
        "flowchart",
        "sequenceDiagram",
        "classDiagram",
        "stateDiagram",
        "erDiagram",
        "journey",
        "gantt",
        "pie",
        "mindmap",
        "timeline",
        "gitGraph",
        "quadrantChart",
        "requirementDiagram",
        "C4Context",
        "C4Container",
    )
    return first_line.startswith(mermaid_starts)


def _extract_mermaid_blocks(text: str) -> list[str]:
    pattern = re.compile(r"```(?P<lang>\w+)?\n(?P<code>.*?)```", re.DOTALL)
    blocks: list[str] = []
    for match in pattern.finditer(text or ""):
        lang = (match.group("lang") or "").strip().lower()
        code = (match.group("code") or "").strip()
        if not code:
            continue
        if lang == "mermaid" or (not lang and _looks_like_mermaid(code)):
            blocks.append(code)
    return blocks


def _remove_json_payload_blocks(text: str) -> str:
    """Strip fenced code blocks that contain A2A payload JSON (have an 'intent' key)."""
    pattern = re.compile(r'```(?:json)?\s*\{[^`]*"intent"\s*:[^`]*\}\s*```', re.DOTALL)
    return pattern.sub("", text or "").strip()


def _remove_mermaid_blocks(text: str) -> str:
    pattern = re.compile(r"```(?P<lang>\w+)?\n(?P<code>.*?)```", re.DOTALL)

    def _replace(match: re.Match[str]) -> str:
        lang = (match.group("lang") or "").strip().lower()
        code = (match.group("code") or "").strip()
        if lang == "mermaid" or (not lang and _looks_like_mermaid(code)):
            return ""
        return match.group(0)

    return pattern.sub(_replace, text or "")


def extract_payload(text: str) -> Optional[Dict[str, Any]]:
    match = re.search(r"<A2A_PAYLOAD>(.*?)</A2A_PAYLOAD>", text, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(1).strip())
    except json.JSONDecodeError:
        return None


def _to_float(value: Any) -> Optional[float]:
    try:
        num = float(value)
    except (TypeError, ValueError):
        return None
    return num


def _to_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return False


def _normalize_project_journey_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        return {}

    phase_summary = str(payload.get("phase_summary") or "").strip()
    new_decisions = payload.get("new_decisions")
    if not isinstance(new_decisions, dict):
        new_decisions = {}

    payload["phase_complete"] = _to_bool(payload.get("phase_complete"))
    payload["phase_summary"] = phase_summary
    payload["new_decisions"] = new_decisions
    payload["suggest_next_phase"] = _to_bool(payload.get("suggest_next_phase"))

    return payload


def _normalize_stack_comparison_payload(payload: Dict[str, Any], state: AgentState) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        return {}

    if str(payload.get("intent") or "").strip().lower() != "stack_comparison":
        return payload

    option_a = payload.get("option_a") if isinstance(payload.get("option_a"), dict) else {}
    option_b = payload.get("option_b") if isinstance(payload.get("option_b"), dict) else {}

    query_a = str(((state.get("comparison_results") or {}).get("a") or {}).get("query") or "").strip()
    query_b = str(((state.get("comparison_results") or {}).get("b") or {}).get("query") or "").strip()

    if not str(option_a.get("name") or "").strip() and query_a:
        option_a["name"] = query_a
    if not str(option_b.get("name") or "").strip() and query_b:
        option_b["name"] = query_b

    payload["option_a"] = option_a
    payload["option_b"] = option_b

    rows = payload.get("decision_matrix") if isinstance(payload.get("decision_matrix"), list) else []
    normalized_rows = []
    total_a = 0.0
    total_b = 0.0

    for row in rows:
        if not isinstance(row, dict):
            continue

        criterion = str(row.get("criterion") or "").strip()
        if not criterion:
            continue

        score_a = _to_float(row.get("score_a"))
        score_b = _to_float(row.get("score_b"))
        if score_a is None or score_b is None:
            continue

        weight = _to_float(row.get("weight"))
        if weight is not None and weight < 0:
            weight = None

        weighted_a = score_a if weight is None else score_a * weight
        weighted_b = score_b if weight is None else score_b * weight
        total_a += weighted_a
        total_b += weighted_b

        normalized_row = {
            "criterion": criterion,
            "score_a": score_a,
            "score_b": score_b,
        }
        if weight is not None:
            normalized_row["weight"] = weight
        normalized_rows.append(normalized_row)

    payload["decision_matrix"] = normalized_rows

    if normalized_rows:
        payload["total_score_a"] = float(payload.get("total_score_a") or total_a)
        payload["total_score_b"] = float(payload.get("total_score_b") or total_b)
        winner = str(payload.get("winner") or "").strip()
        if not winner:
            if abs(total_a - total_b) < 1e-9:
                winner = "tie"
            elif total_a > total_b:
                winner = str(option_a.get("name") or "option_a")
            else:
                winner = str(option_b.get("name") or "option_b")
        payload["winner"] = winner

    return payload


def output_parser(state: AgentState) -> AgentState:
    raw = state.get("raw_llm_output", "") or ""

    # Fast-path: synthesizer short-circuited because context_validator already
    # built a complete response (e.g. consent prompt with interaction buttons).
    # Preserve what was built and only enrich with reference/tracing metadata.
    if not raw and state.get("chat_response") and state.get("a2a_payload"):
        existing_payload = dict(state["a2a_payload"])
        existing_payload.setdefault("agent", "technical_advisor")
        existing_payload.setdefault("references", _normalize_references(state))
        existing_payload.setdefault("architecture_diagrams", [])
        existing_payload.setdefault("agent_steps", state.get("agent_steps", []))
        existing_payload.setdefault("founder_id", (state.get("founder_context") or {}).get("id"))
        state["a2a_payload"] = existing_payload
        return state

    payload = extract_payload(raw)
    architecture_diagrams = _extract_mermaid_blocks(raw)

    if payload is None and state.get("parse_attempts", 0) < 1:
        correction = CORRECTION_PROMPT.format(raw_output=raw)
        corrected = llm.invoke(correction).content
        try:
            payload = json.loads(corrected.strip())
        except json.JSONDecodeError:
            payload = {}
        state["parse_attempts"] = 1

    payload = _normalize_stack_comparison_payload(payload or {}, state)
    payload = _normalize_project_journey_payload(payload)

    chat_without_payload = re.sub(r"<A2A_PAYLOAD>.*?</A2A_PAYLOAD>", "", raw, flags=re.DOTALL).strip()
    chat_without_json = _remove_json_payload_blocks(chat_without_payload)
    chat = _remove_mermaid_blocks(chat_without_json).strip()

    # The state intent reflects which retrieval node actually ran (e.g. "stack" when
    # the stack_recommender executed). The LLM sometimes overrides this in its payload
    # (e.g. outputs "architecture" when STACK_PROMPT was used). For specific advisory
    # intents we trust the state, because it is authoritative about which phase is active.
    # For "general" and "discovery" we defer to the payload since the synthesizer
    # legitimately overrides the classifier's intent in those flows.
    state_intent = str(state.get("intent") or "").strip()
    payload_intent = str(payload.get("intent") or "").strip()
    if state_intent and state_intent not in {"general", "discovery"}:
        resolved_intent = state_intent
    else:
        resolved_intent = payload_intent or state_intent or "general"

    state["chat_response"] = chat
    state["a2a_payload"] = {
        "agent": "technical_advisor",
        "intent": resolved_intent,
        "founder_id": (state.get("founder_context") or {}).get("id"),
        "references": _normalize_references(state),
        "architecture_diagrams": architecture_diagrams,
        "agent_steps": state.get("agent_steps", []),
        **(payload or {}),
    }
    return state

