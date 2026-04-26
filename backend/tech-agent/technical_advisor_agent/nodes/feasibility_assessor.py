from technical_advisor_agent.kb import retriever
from technical_advisor_agent.state import AgentState
from technical_advisor_agent.tools.web_search import web_search
from technical_advisor_agent.tracing import append_agent_step


def feasibility_assessor(state: AgentState) -> AgentState:
    feature = state.get("user_query", "")
    queries = [
        f"{feature} technical complexity",
        f"{feature} third party API alternatives",
    ]
    search_results = []
    for q in queries:
        search_results.extend(web_search(q))

    rules = retriever.get_rules(categories=["scalability", "api"])
    retrieved_chunks = retriever.query_kb(
        query_text=f"feasibility {feature}",
        intent="feasibility",
        top_k=5,
    )

    state["search_results"] = search_results
    state["kb_results"] = {"rules": rules, "retrieved_chunks": retrieved_chunks}
    append_agent_step(
        state,
        step="Feasibility Assessor",
        details="Assessed feasibility using web signals and KB rules.",
        metadata={"search_results": len(search_results), "retrieved_chunks": len(retrieved_chunks)},
    )
    return state
