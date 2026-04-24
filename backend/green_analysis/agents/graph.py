"""
LangGraph StateGraph — wires together all agent nodes.

Architecture: Dependency-driven parallel collaborative agents.
    input_parser → (needs_clarification? → interrupt → resume) →
    impact_analyst → ┌ cert_advisor ────────┐ → esg_scorer → END
                     └ sustainability_coach ─┘
                          (parallel fan-out / fan-in)

All agents share a single Azure AI endpoint (Kimi-K2.5) via an
OpenAI-compatible base_url — simpler key management, stronger reasoning.
"""

from __future__ import annotations

import logging
import os
import threading
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from langgraph.types import interrupt

from green_analysis.agents.state import EnvironmentalState

load_dotenv(override=True)

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


def _load_prompt(name: str) -> str:
    """Read a markdown system prompt from the prompts/ directory."""
    return (PROMPTS_DIR / f"{name}.md").read_text(encoding="utf-8")


# ── Shared Azure AI LLM factory ──────────────────────────────────────────

def _get_llm(agent_key: str, temperature: float = 0) -> ChatOpenAI:  # noqa: ARG001
    """Create a ChatOpenAI instance pointed at the Azure AI endpoint.

    agent_key is accepted for API compatibility but all agents share the same
    Azure model — key management is centralised via AZURE_GREEN_* env vars.
    """
    # Re-load .env at call time so key/model changes are picked up immediately.
    load_dotenv(override=True)
    api_key = (os.getenv("AZURE_GREEN_API_KEY", "") or "").strip()
    base_url = (os.getenv("AZURE_GREEN_ENDPOINT", "") or "").strip()
    model_name = (os.getenv("AZURE_GREEN_MODEL", "Kimi-K2.5") or "Kimi-K2.5").strip()
    if not api_key:
        logger.warning("AZURE_GREEN_API_KEY is not set — green analysis calls will fail")
    if not base_url:
        logger.warning("AZURE_GREEN_ENDPOINT is not set — green analysis calls will fail")
    return ChatOpenAI(
        model=model_name,
        api_key=api_key,
        base_url=base_url,
        temperature=temperature,
    )


# ── Real-time status tracking ─────────────────────────────────────────────
#
# WHY threading.Lock() instead of select_for_update():
# SQLite uses BEGIN IMMEDIATE for select_for_update(), which acquires a write
# lock instantly. When cert_advisor and sustainability_coach start in parallel,
# whichever hits the lock second gets "database is locked" immediately — and our
# except block silently swallows it, losing that agent's "running" write.
# A Python-level lock serializes the writes in-process without any SQLite
# locking, so both agents' status updates always succeed.
#
_db_write_lock = threading.Lock()


def _update_agent_status(state: EnvironmentalState, agent_name: str, status: str) -> None:
    """Write agent status to the Django DB for real-time tracking."""
    if not state.session_id:
        return
    try:
        from green_analysis.models import AnalysisSession
        with _db_write_lock:
            session = AnalysisSession.objects.get(pk=state.session_id)
            agent_status = session.agent_status or {}
            agent_status[agent_name] = status
            session.agent_status = agent_status
            session.save(update_fields=["agent_status", "updated_at"])
    except Exception:
        logger.debug("Could not update agent status for %s", agent_name, exc_info=True)


def _save_agent_trace(state: EnvironmentalState, agent_name: str, steps: list[dict]) -> None:
    """Persist agent reasoning trace to the Django DB."""
    if not state.session_id or not steps:
        return
    try:
        from green_analysis.models import AnalysisSession
        with _db_write_lock:
            session = AnalysisSession.objects.get(pk=state.session_id)
            traces = session.agent_trace or {}
            traces[agent_name] = steps
            session.agent_trace = traces
            session.save(update_fields=["agent_trace", "updated_at"])
    except Exception:
        logger.debug("Could not save trace for %s", agent_name, exc_info=True)


# ── Node wrappers (lazy imports + status tracking + trace persistence) ─────

def _extract_and_save_trace(state: EnvironmentalState, result: dict[str, Any]) -> dict[str, Any]:
    """Extract _trace from agent result, persist to DB, remove from state return."""
    trace_data = result.pop("_trace", None)
    if trace_data:
        for agent_name, steps in trace_data.items():
            _save_agent_trace(state, agent_name, steps)
    return result


def _input_parser_node(state: EnvironmentalState) -> dict[str, Any]:
    _update_agent_status(state, "input_parser", "running")
    from green_analysis.agents.input_parser import run_input_parser
    result = run_input_parser(state, _get_llm("parser"), _load_prompt("input_parser"))
    _extract_and_save_trace(state, result)
    _update_agent_status(state, "input_parser", "completed")
    return result


def _impact_analyst_node(state: EnvironmentalState) -> dict[str, Any]:
    _update_agent_status(state, "impact_analyst", "running")
    from green_analysis.agents.impact_analyst import run_impact_analyst
    result = run_impact_analyst(state, _get_llm("impact"), _load_prompt("impact_analyst"))
    _extract_and_save_trace(state, result)
    _update_agent_status(state, "impact_analyst", "completed")
    return result


def _cert_advisor_node(state: EnvironmentalState) -> dict[str, Any]:
    _update_agent_status(state, "cert_advisor", "running")
    from green_analysis.agents.cert_advisor import run_cert_advisor
    result = run_cert_advisor(state, _get_llm("cert"), _load_prompt("cert_advisor"))
    _extract_and_save_trace(state, result)
    _update_agent_status(state, "cert_advisor", "completed")
    return result


def _sustainability_coach_node(state: EnvironmentalState) -> dict[str, Any]:
    _update_agent_status(state, "sustainability_coach", "running")
    from green_analysis.agents.sustainability_coach import run_sustainability_coach
    result = run_sustainability_coach(state, _get_llm("sustainability"), _load_prompt("sustainability_coach"))
    _extract_and_save_trace(state, result)
    _update_agent_status(state, "sustainability_coach", "completed")
    return result


def _esg_scorer_node(state: EnvironmentalState) -> dict[str, Any]:
    _update_agent_status(state, "esg_scorer", "running")
    from green_analysis.agents.esg_scorer import run_esg_scorer
    result = run_esg_scorer(state, _get_llm("esg"), _load_prompt("esg_scorer"))
    _extract_and_save_trace(state, result)
    _update_agent_status(state, "esg_scorer", "completed")
    return result


# ── Human-in-the-loop: clarification check ────────────────────────────────

def _clarification_check(state: EnvironmentalState) -> dict[str, Any]:
    """If the parser flagged needs_clarification, interrupt for user input."""
    if not state.needs_clarification:
        return {}

    user_answers = interrupt({
        "questions": state.follow_up_questions,
        "message": "The business description needs more detail. Please answer the questions above.",
    })

    return {
        "user_responses": user_answers if isinstance(user_answers, dict) else {},
        "needs_clarification": False,
        "follow_up_questions": [],
    }


# ── Routing functions ─────────────────────────────────────────────────────

def _after_parser(state: EnvironmentalState) -> str:
    """Route after input_parser: clarification or continue to impact analysis."""
    if state.needs_clarification:
        return "clarification_check"
    return "impact_analyst"


def _after_clarification(state: EnvironmentalState) -> str:
    """After clarification, always re-run the parser with enriched input."""
    return "input_parser"


def _entry_router(state: EnvironmentalState) -> str:
    """Route entry based on whether parsed_input is already available."""
    if state.parsed_input:
        return "impact_analyst"
    return "input_parser"


# ── Build the graph ───────────────────────────────────────────────────────

def build_graph(checkpointer=None):
    """Construct and compile the environmental analysis StateGraph.

    Architecture:
        - Dependency-driven: each agent only runs when its inputs are ready
        - Parallel fan-out: cert_advisor and sustainability_coach run concurrently
          (each with its own LLM instance and API key)
        - Barrier fan-in: esg_scorer waits for both to complete before running

    Args:
        checkpointer: Optional LangGraph checkpointer for interrupt/resume.
    """

    graph = StateGraph(EnvironmentalState)

    # ── Register nodes ──
    graph.add_node("entry_router", lambda state: {})
    graph.add_node("input_parser", _input_parser_node)
    graph.add_node("clarification_check", _clarification_check)
    graph.add_node("impact_analyst", _impact_analyst_node)
    graph.add_node("cert_advisor", _cert_advisor_node)
    graph.add_node("sustainability_coach", _sustainability_coach_node)
    graph.add_node("esg_scorer", _esg_scorer_node)

    # ── Entry point ──
    graph.set_entry_point("entry_router")

    graph.add_conditional_edges(
        "entry_router",
        _entry_router,
        {"input_parser": "input_parser", "impact_analyst": "impact_analyst"},
    )

    # ── Conditional: parser → clarification or continue ──
    graph.add_conditional_edges(
        "input_parser",
        _after_parser,
        {"clarification_check": "clarification_check", "impact_analyst": "impact_analyst"},
    )
    graph.add_conditional_edges(
        "clarification_check",
        _after_clarification,
        {"input_parser": "input_parser"},
    )

    # ── Parallel fan-out: impact_analyst → [cert_advisor, sustainability_coach] ──
    # Both agents depend on parsed_input + impact_assessment.
    # LangGraph executes them concurrently and merges results via reducers.
    graph.add_edge("impact_analyst", "cert_advisor")
    graph.add_edge("impact_analyst", "sustainability_coach")

    # ── Barrier fan-in: [cert_advisor, sustainability_coach] → esg_scorer ──
    # esg_scorer only runs after BOTH agents complete.
    graph.add_edge("cert_advisor", "esg_scorer")
    graph.add_edge("sustainability_coach", "esg_scorer")

    # ── Terminal ──
    graph.add_edge("esg_scorer", END)

    return graph.compile(checkpointer=checkpointer)
