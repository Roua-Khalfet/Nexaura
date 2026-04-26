from concurrent.futures import ThreadPoolExecutor
from typing import Dict

from technical_advisor_agent.nodes.stack_recommender import gather_stack_signals
from technical_advisor_agent.state import AgentState
from technical_advisor_agent.tracing import append_agent_step


def _run_option(state: AgentState, option: str) -> Dict:
    ctx = state.get("founder_context", {})
    signals = gather_stack_signals(founder_context=ctx, user_query=option)
    return {
        "query": option,
        "search_results": signals.get("search_results", []),
        "kb_results": signals.get("kb_results", {}),
    }


def comparison_router(state: AgentState) -> AgentState:
    option_a = (state.get("comparison_option_a") or "").strip()
    option_b = (state.get("comparison_option_b") or "").strip()

    if not option_a or not option_b:
        state["error"] = "Comparison intent requires two options, but none were parsed."
        append_agent_step(
            state,
            step="Comparison Router",
            details="Comparison intent failed because two options were not provided.",
            status="failed",
        )
        return state

    with ThreadPoolExecutor(max_workers=2) as pool:
        future_a = pool.submit(_run_option, state, option_a)
        future_b = pool.submit(_run_option, state, option_b)
        result_a = future_a.result()
        result_b = future_b.result()

    state["comparison_results"] = {"a": result_a, "b": result_b}
    state["search_results"] = (result_a.get("search_results") or []) + (result_b.get("search_results") or [])

    kb_a = result_a.get("kb_results") or {}
    kb_b = result_b.get("kb_results") or {}
    state["kb_results"] = {
        "comparison": {
            "option_a": option_a,
            "option_b": option_b,
            "a": kb_a,
            "b": kb_b,
        }
    }
    append_agent_step(
        state,
        step="Comparison Router",
        details="Executed both comparison branches and merged results.",
        metadata={"option_a": option_a, "option_b": option_b},
    )
    return state
