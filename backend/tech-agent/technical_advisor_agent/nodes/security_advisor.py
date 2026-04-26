from technical_advisor_agent.kb import retriever
from technical_advisor_agent.state import AgentState
from technical_advisor_agent.tracing import append_agent_step


def _compliance_for_industry(industry: str) -> list:
    ind = (industry or "").lower()
    if "fintech" in ind or "finance" in ind or "payments" in ind:
        return ["pci-dss", "gdpr"]
    if "health" in ind or "med" in ind:
        return ["hipaa", "gdpr"]
    if "saas" in ind:
        return ["soc2", "gdpr"]
    return ["gdpr"]


def security_advisor(state: AgentState) -> AgentState:
    ctx = state.get("founder_context", {})
    industry = ctx.get("industry", "") if isinstance(ctx, dict) else getattr(ctx, "industry", "")

    standards = _compliance_for_industry(industry)
    compliance = retriever.get_compliance(standards=standards)
    rules = retriever.get_rules(categories=["auth", "api", "data"])
    retrieved_chunks = retriever.query_kb(
        query_text=f"security compliance {industry} {state.get('user_query', '')}",
        intent="security",
        top_k=5,
    )

    state["kb_results"] = {
        "compliance": compliance,
        "rules": rules,
        "standards": standards,
        "retrieved_chunks": retrieved_chunks,
    }
    state["search_results"] = []
    append_agent_step(
        state,
        step="Security Advisor",
        details="Mapped industry compliance and security controls.",
        metadata={"standards": standards, "retrieved_chunks": len(retrieved_chunks)},
    )
    return state
