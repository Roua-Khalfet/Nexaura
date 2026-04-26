from langgraph.graph import END, StateGraph

from technical_advisor_agent.nodes.architecture_generator import architecture_generator
from technical_advisor_agent.nodes.context_validator import context_validator
from technical_advisor_agent.nodes.cost_estimator import cost_estimator
from technical_advisor_agent.nodes.feasibility_assessor import feasibility_assessor
from technical_advisor_agent.nodes.github_discovery import github_discovery
from technical_advisor_agent.nodes.intent_classifier import intent_classifier
from technical_advisor_agent.nodes.comparison_router import comparison_router
from technical_advisor_agent.nodes.project_state_manager import project_state_manager
from technical_advisor_agent.nodes.roadmap_builder import roadmap_builder
from technical_advisor_agent.nodes.security_advisor import security_advisor
from technical_advisor_agent.nodes.stack_recommender import stack_recommender
from technical_advisor_agent.nodes.team_building_advisor import team_building_advisor
from technical_advisor_agent.parser.output_parser import output_parser
from technical_advisor_agent.state import AgentState
from technical_advisor_agent.synthesizer.synthesizer import synthesizer


PHASE_ALLOWED_INTENTS = {
    "stack": {"stack", "stack_comparison", "libraries"},
    "architecture": {"architecture"},
    "roadmap": {"roadmap"},
    "cost_feasibility": {"cost", "feasibility"},
    "security": {"security"},
    "team_building": {"team_building"},
}

PHASE_DEFAULT_INTENT = {
    "stack": "stack",
    "architecture": "architecture",
    "roadmap": "roadmap",
    "cost_feasibility": "cost",
    "security": "security",
}


def route_after_project_state_bootstrap(state: AgentState) -> str:
    if not state["context_valid"]:
        return END
    # Both discovery-complete and in-progress sessions route to intent_classifier.
    # The synthesizer enforces phase-appropriate prompts based on current_phase.
    return "intent_classifier"


def route_after_classification(state: AgentState) -> str:
    current_phase = str(state.get("current_phase") or "discovery").strip().lower()
    intent = str(state.get("intent") or "stack").strip().lower()

    if intent == "general":
        return "synthesizer"

    if intent == "stack_comparison_setup":
        return "synthesizer"

    # project_brief goes directly to synthesizer — the context validator already hydrated state.
    if intent == "project_brief":
        return "synthesizer"

    # team_building routes to the dedicated advisor node.
    if intent == "team_building":
        return "team_building"

    # Discovery and handoff are conversation-driven phases with no dedicated retriever node.
    if current_phase in {"discovery", "handoff"}:
        return "synthesizer"

    allowed = PHASE_ALLOWED_INTENTS.get(current_phase)
    if not allowed:
        return intent or "stack"

    if intent in allowed:
        return intent

    return PHASE_DEFAULT_INTENT.get(current_phase, "stack")


graph = StateGraph(AgentState)

graph.add_node("context_validator", context_validator)
graph.add_node("project_state_manager", project_state_manager)
graph.add_node("intent_classifier", intent_classifier)
graph.add_node("stack", stack_recommender)
graph.add_node("architecture", architecture_generator)
graph.add_node("roadmap", roadmap_builder)
graph.add_node("feasibility", feasibility_assessor)
graph.add_node("cost", cost_estimator)
graph.add_node("security", security_advisor)
graph.add_node("libraries", github_discovery)
graph.add_node("stack_comparison", comparison_router)
graph.add_node("team_building", team_building_advisor)
graph.add_node("synthesizer", synthesizer)
graph.add_node("output_parser", output_parser)
graph.add_node("project_state_finalizer", project_state_manager)

graph.set_entry_point("context_validator")
graph.add_edge("context_validator", "project_state_manager")
graph.add_conditional_edges("project_state_manager", route_after_project_state_bootstrap)
graph.add_conditional_edges("intent_classifier", route_after_classification)

for node in [
    "stack",
    "stack_comparison",
    "architecture",
    "roadmap",
    "feasibility",
    "cost",
    "security",
    "libraries",
    "team_building",
]:
    graph.add_edge(node, "synthesizer")

graph.add_edge("synthesizer", "output_parser")
graph.add_edge("output_parser", "project_state_finalizer")
graph.set_finish_point("project_state_finalizer")

agent = graph.compile()
