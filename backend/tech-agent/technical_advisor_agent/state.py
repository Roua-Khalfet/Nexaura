import operator
from typing import Annotated, Any, Dict, List, Optional, TypedDict


class AgentState(TypedDict):
    # Tracing
    agent_steps: Annotated[list, operator.add]

    # Input
    user_query: str
    founder_context: Dict[str, Any]
    input_source: str
    message_type: str
    session_id: str
    conversation_history: List[Dict[str, str]]
    preferred_language: Optional[str]
    project_state: Optional[Dict[str, Any]]
    updated_project_state: Optional[Dict[str, Any]]
    current_phase: str
    completed_phases: List[str]
    phase_decisions: Dict[str, Any]
    is_revisiting: bool
    discovery_turn_count: int
    discovery_complete: bool
    advisory_turn_count: int
    last_advisory_intent: Optional[str]

    # Validation
    context_valid: bool
    validation_error: Optional[str]

    # Routing
    intent: Optional[str]
    comparison_option_a: Optional[str]
    comparison_option_b: Optional[str]
    comparison_results: Optional[Dict[str, Any]]

    # Retrieved data
    search_results: List[Dict]
    github_results: List[Dict]
    kb_results: Dict[str, Any]

    # Processing
    raw_llm_output: Optional[str]
    parse_attempts: int

    # Output
    chat_response: Optional[str]
    a2a_payload: Optional[Dict]
    error: Optional[str]
