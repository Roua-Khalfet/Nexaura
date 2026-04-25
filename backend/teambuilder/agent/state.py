from pydantic import BaseModel, Field
from typing import List, Optional


class Role(BaseModel):
    title: str
    seniority: str              # junior / mid / senior / lead
    employment_type: str        # fulltime / freelance / contract
    required_skills: List[str]
    priority: str               # critical / important / nice-to-have


class Candidate(BaseModel):
    name: str
    source: str                 # github / serpapi / upwork
    profile_url: str
    skills: List[str] = []
    score: float = 0.0
    estimated_rate: Optional[str] = None
    matched_role: Optional[str] = None


class AgentState(BaseModel):
    raw_input: str
    region: str = "TN"
    currency: str = "TND"
    budget: Optional[float] = None
    extracted_roles: List[Role] = Field(default_factory=list)
    candidates: List[Candidate] = Field(default_factory=list)
    cost_estimate: dict = Field(default_factory=dict)
    chat_response: str = ""
    a2a_payload: dict = Field(default_factory=dict)
    error: Optional[str] = None
