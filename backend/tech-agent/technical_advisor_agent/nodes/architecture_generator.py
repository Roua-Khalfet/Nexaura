from technical_advisor_agent.kb import retriever
from technical_advisor_agent.state import AgentState
from technical_advisor_agent.tools.web_search import web_search
from technical_advisor_agent.tracing import append_agent_step


def architecture_generator(state: AgentState) -> AgentState:
    ctx = state.get("founder_context", {})
    industry = ctx.get("industry", "") if isinstance(ctx, dict) else getattr(ctx, "industry", "")
    product = ctx.get("product_description", "") if isinstance(ctx, dict) else getattr(ctx, "product_description", "")

    query = f"{product} system architecture best practices"
    search_results = web_search(query)
    templates = retriever.get_templates(domain=industry, intent="architecture")
    retrieved_chunks = retriever.query_kb(
        query_text=f"architecture {industry} {product} {state.get('user_query', '')}",
        intent="architecture",
        top_k=5,
    )

    state["search_results"] = search_results
    state["kb_results"] = {"templates": templates, "retrieved_chunks": retrieved_chunks}
    append_agent_step(
        state,
        step="Architecture Generator",
        details="Collected architecture templates, web evidence, and KB chunks.",
        metadata={"search_results": len(search_results), "retrieved_chunks": len(retrieved_chunks)},
    )
    return state
