from technical_advisor_agent.kb import retriever
from technical_advisor_agent.state import AgentState
from technical_advisor_agent.tools.web_search import web_search
from technical_advisor_agent.tracing import append_agent_step


def gather_stack_signals(founder_context, user_query: str) -> dict:
    ctx = founder_context or {}
    industry = ctx.get("industry", "") if isinstance(ctx, dict) else getattr(ctx, "industry", "")
    phase = ctx.get("phase", "") if isinstance(ctx, dict) else getattr(ctx, "phase", "")
    product = ctx.get("product_description", "") if isinstance(ctx, dict) else getattr(ctx, "product_description", "")

    queries = [
        f"{industry} tech stack {phase}",
        f"best backend for {product}",
        f"{user_query} founder stack recommendation",
    ]
    search_results = []
    for q in queries:
        search_results.extend(web_search(q))

    templates = retriever.get_templates(domain=industry, intent="stack")
    kb_query = f"stack {industry} {phase} {product} {user_query}".strip()
    retrieved_chunks = retriever.query_kb(query_text=kb_query, intent="stack", top_k=5)

    return {
        "search_results": search_results,
        "kb_results": {
            "templates": templates,
            "retrieved_chunks": retrieved_chunks,
        },
    }


def stack_recommender(state: AgentState) -> AgentState:
    signals = gather_stack_signals(
        founder_context=state.get("founder_context", {}),
        user_query=state.get("user_query", ""),
    )

    state["search_results"] = signals["search_results"]
    state["kb_results"] = signals["kb_results"]
    append_agent_step(
        state,
        step="Stack Recommender",
        details="Collected stack recommendation signals from web and KB.",
        metadata={
            "search_results": len(signals["search_results"]),
            "retrieved_chunks": len((signals["kb_results"] or {}).get("retrieved_chunks", [])),
        },
    )
    return state
