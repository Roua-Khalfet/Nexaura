from datetime import datetime, timezone
from typing import Any

from technical_advisor_agent.state import AgentState


def append_agent_step(
    state: AgentState,
    *,
    step: str,
    details: str,
    status: str = "completed",
    metadata: dict[str, Any] | None = None,
) -> None:
    entry: dict[str, Any] = {
        "step": step,
        "status": status,
        "details": details,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    if metadata:
        entry["metadata"] = metadata

    # AgentState defines agent_steps with an additive reducer.
    # Return only the new step from each node to avoid duplicate accumulation.
    state["agent_steps"] = [entry]