from langgraph.graph import StateGraph, START, END
from agent.nodes import (
    extract_requirements, search_candidates,
    score_candidates_node, estimate_costs, synthesize_output,
)


def build_graph():
    g = StateGraph(dict)
    g.add_node("extract_requirements", extract_requirements)
    g.add_node("search_candidates", search_candidates)
    g.add_node("score_candidates", score_candidates_node)
    g.add_node("estimate_costs", estimate_costs)
    g.add_node("synthesize_output", synthesize_output)
    g.add_edge(START, "extract_requirements")
    g.add_edge("extract_requirements", "search_candidates")
    g.add_edge("search_candidates", "score_candidates")
    g.add_edge("score_candidates", "estimate_costs")
    g.add_edge("estimate_costs", "synthesize_output")
    g.add_edge("synthesize_output", END)
    return g.compile()
