from technical_advisor_agent.kb import retriever
from technical_advisor_agent.state import AgentState
from technical_advisor_agent.tracing import append_agent_step


def _infer_services(existing_stack):
    services = {"compute", "storage", "serverless"}
    stack = existing_stack or []
    stack_lower = [s.lower() for s in stack]
    db_markers = {"postgres", "mysql", "mariadb", "mongo", "mongodb", "sql"}
    if any(marker in item for item in stack_lower for marker in db_markers):
        services.add("database")
    return list(services)


def cost_estimator(state: AgentState) -> AgentState:
    ctx = state.get("founder_context", {})
    existing_stack = ctx.get("existing_stack", []) if isinstance(ctx, dict) else getattr(ctx, "existing_stack", [])
    services = _infer_services(existing_stack)

    pricing = retriever.get_pricing(provider="aws", services=services)
    retrieved_chunks = retriever.query_kb(
        query_text=f"cost pricing {' '.join(services)} {state.get('user_query', '')}",
        intent="cost",
        top_k=5,
    )

    state["kb_results"] = {"pricing": pricing, "services": services, "retrieved_chunks": retrieved_chunks}
    state["search_results"] = []
    append_agent_step(
        state,
        step="Cost Estimator",
        details="Estimated cost ranges from pricing data and KB evidence.",
        metadata={"services": services, "retrieved_chunks": len(retrieved_chunks)},
    )
    return state
