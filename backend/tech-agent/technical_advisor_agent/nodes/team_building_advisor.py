from technical_advisor_agent.state import AgentState
from technical_advisor_agent.tracing import append_agent_step


def _as_dict(value) -> dict:
    return value if isinstance(value, dict) else {}


def team_building_advisor(state: AgentState) -> AgentState:
    project_state = _as_dict(state.get("project_state"))
    decisions = _as_dict(project_state.get("decisions"))

    # Pass decisions dict directly; synthesizer's _fmt_kb will serialise it as JSON.
    state["kb_results"] = {"phase_decisions": decisions}
    state["search_results"] = []

    append_agent_step(
        state,
        step="Team Building Advisor",
        details="Aggregated all phase decisions for team role synthesis.",
        metadata={"phases_with_data": [k for k, v in decisions.items() if v]},
    )
    return state
