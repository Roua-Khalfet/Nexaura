from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class ProjectPhase(str, Enum):
    IDEA = "idea"
    MVP = "mvp"
    V1 = "v1"
    SCALING = "scaling"


class FounderContext(BaseModel):
    id: Optional[str] = None
    industry: Optional[str] = None
    product_description: Optional[str] = None
    phase: Optional[str] = None
    team_size: Optional[int] = None
    budget_usd: Optional[int] = None
    existing_stack: List[str] = Field(default_factory=list)
    target_region: Optional[str] = None
    technical_level: Optional[str] = None


class PhaseDecisions(BaseModel):
    discovery: Optional[dict] = None
    stack: Optional[dict] = None
    architecture: Optional[dict] = None
    roadmap: Optional[dict] = None
    cost_feasibility: Optional[dict] = None
    security: Optional[dict] = None


class ProjectState(BaseModel):
    current_phase: str = "discovery"
    completed_phases: List[str] = Field(default_factory=list)
    decisions: PhaseDecisions = Field(default_factory=PhaseDecisions)
    progress: int = 0
    total_phases: int = 7
    revisiting: bool = False
    revisit_target: Optional[str] = None
    project_title: Optional[str] = None
    last_updated: Optional[str] = None
    discovery_turn_count: int = 0
    discovery_complete: bool = False
    advisory_turn_count: int = 0
    last_advisory_intent: Optional[str] = None


class InvokeRequest(BaseModel):
    user_query: str
    founder_context: Optional[dict] = Field(default_factory=dict)
    input_source: str = "user_prompt"
    message_type: str = "user_message"
    session_id: Optional[str] = None
    project_state: Optional[ProjectState] = None
    preferred_language: Optional[str] = None


# Backward-compatible alias used by existing imports.
AgentRequest = InvokeRequest


class FeedbackRequest(BaseModel):
    session_id: str
    founder_id: str
    rating: str
    intent: str
    kb_sources: List[str] = []


class FeedbackStreamQuery(BaseModel):
    count: int = 100
    last_id: str = "0"


class InvokeResponse(BaseModel):
    session_id: str
    chat_response: str
    a2a_payload: Optional[Dict]
    updated_project_state: ProjectState
