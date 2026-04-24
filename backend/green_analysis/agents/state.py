"""
EnvironmentalState — the central Pydantic schema for the LangGraph StateGraph.

Every agent node reads from and writes to this shared state object.
Fields use Annotated + operator.add for LangGraph's reducer pattern
where appropriate (e.g., lists that agents append to).
"""

from __future__ import annotations

import operator
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Sub-models (structured outputs from each agent)
# ---------------------------------------------------------------------------

class ParsedInput(BaseModel):
    """Structured data extracted from the entrepreneur's free-text description."""

    business_description: str = Field(
        default="",
        description="Cleaned-up summary of the business idea",
    )
    industry_sector: str = Field(
        default="",
        description="Primary industry sector (e.g., agriculture, textiles, IT)",
    )
    sub_sector: str = Field(
        default="",
        description="More specific sub-sector if identifiable",
    )
    location: str = Field(
        default="Tunisia",
        description="Business location (city/region in Tunisia)",
    )
    scale: str = Field(
        default="",
        description="Business scale: micro, small, medium, large",
    )
    activities: list[str] = Field(
        default_factory=list,
        description="Key business activities (manufacturing, services, etc.)",
    )
    resources_used: list[str] = Field(
        default_factory=list,
        description="Key resources: energy, water, raw materials, chemicals, etc.",
    )
    exports_to_eu: bool = Field(
        default=False,
        description="Whether the business plans to export to EU (relevant for CBAM)",
    )


class ImpactAssessment(BaseModel):
    """Output of the Impact Analyst agent."""

    carbon_estimate_kg_co2_per_year: float | None = Field(
        default=None,
        description="Estimated annual CO2 emissions in kg",
    )
    carbon_estimate_range: str = Field(
        default="",
        description="Human-readable range, e.g., '5,000 – 15,000 kg CO2/year'",
    )
    energy_intensity: str = Field(
        default="",
        description="Energy intensity category: low, medium, high, very high",
    )
    water_usage_category: str = Field(
        default="",
        description="Water usage category: minimal, low, moderate, high, very high",
    )
    water_usage_m3_per_year: float | None = Field(
        default=None,
        description="Estimated annual water consumption in cubic meters",
    )
    waste_profile: list[str] = Field(
        default_factory=list,
        description="Typical waste streams: organic, plastic, chemical, e-waste, etc.",
    )
    waste_volume_category: str = Field(
        default="",
        description="Waste volume category: minimal, low, moderate, high",
    )
    key_environmental_risks: list[str] = Field(
        default_factory=list,
        description="Top environmental risks for this business type",
    )
    sector_benchmarks: dict[str, Any] = Field(
        default_factory=dict,
        description="Industry benchmark data used for the assessment",
    )
    methodology_notes: str = Field(
        default="",
        description="Notes on data sources and estimation methodology",
    )


class Certification(BaseModel):
    """A single green certification recommendation."""

    name: str = Field(description="Certification name, e.g., 'ISO 14001'")
    issuing_body: str = Field(default="", description="Organization that issues it")
    relevance: str = Field(
        default="",
        description="Why this certification is relevant to the business",
    )
    eligibility_summary: str = Field(
        default="",
        description="Key eligibility criteria",
    )
    estimated_cost: str = Field(
        default="",
        description="Estimated cost range for obtaining certification",
    )
    estimated_timeline: str = Field(
        default="",
        description="Typical timeline to achieve certification",
    )
    strategic_value: str = Field(
        default="",
        description="Business benefits: market access, reputation, compliance, etc.",
    )
    priority: str = Field(
        default="medium",
        description="Priority level: high, medium, low",
    )


class Recommendation(BaseModel):
    """A single sustainability recommendation."""

    title: str = Field(description="Short title of the recommendation")
    category: str = Field(
        description="Category: energy, waste, water, materials, operations, funding"
    )
    description: str = Field(description="Detailed description of the recommendation")
    estimated_impact: str = Field(
        default="medium",
        description="Estimated environmental impact: high, medium, low",
    )
    implementation_difficulty: str = Field(
        default="medium",
        description="Difficulty: easy, medium, hard",
    )
    estimated_cost: str = Field(
        default="",
        description="Rough cost estimate or range",
    )
    tunisia_context: str = Field(
        default="",
        description="Tunisia-specific context: available programs, local providers, etc.",
    )
    relevant_programs: list[str] = Field(
        default_factory=list,
        description="Tunisian funding/incentive programs applicable (e.g., Prosol, FTE, FODEP)",
    )


class ESGScore(BaseModel):
    """Structured ESG score output."""

    environmental_score: float = Field(
        default=0.0,
        description="Environmental pillar score (0-100)",
    )
    social_score: float = Field(
        default=0.0,
        description="Social pillar score (0-100)",
    )
    governance_score: float = Field(
        default=0.0,
        description="Governance pillar score (0-100)",
    )
    composite_score: float = Field(
        default=0.0,
        description="Weighted composite score (0-100). Weights: E=50%, S=25%, G=25%",
    )
    letter_grade: str = Field(
        default="",
        description="Letter grade: A (80-100), B (65-79), C (50-64), D (35-49), E (0-34)",
    )
    environmental_breakdown: dict[str, float] = Field(
        default_factory=dict,
        description="Breakdown of environmental score by criterion",
    )
    social_breakdown: dict[str, float] = Field(
        default_factory=dict,
        description="Breakdown of social score by criterion",
    )
    governance_breakdown: dict[str, float] = Field(
        default_factory=dict,
        description="Breakdown of governance score by criterion",
    )
    summary: str = Field(
        default="",
        description="Executive summary of the ESG assessment",
    )


# ---------------------------------------------------------------------------
# Top-level Graph State
# ---------------------------------------------------------------------------

class EnvironmentalState(BaseModel):
    """
    Central state object for the LangGraph StateGraph.

    The graph flow is:
        Input Parsing → Impact Analyst → [Cert Advisor ∥ Sustainability Coach] → ESG Scorer

    Each agent reads what it needs and writes its output to the appropriate field.
    """

    # --- User input ---
    raw_input: str = Field(
        default="",
        description="Raw free-text business description from the user",
    )
    parsed_input: ParsedInput | None = Field(
        default=None,
        description="Structured data extracted from the raw input",
    )

    # --- Follow-up questions (human-in-the-loop) ---
    needs_clarification: bool = Field(
        default=False,
        description="Whether the input parser needs more info from the user",
    )
    follow_up_questions: list[str] = Field(
        default_factory=list,
        description="Questions to ask the user if input is too vague",
    )
    user_responses: dict[str, str] = Field(
        default_factory=dict,
        description="User responses to follow-up questions",
    )

    # --- Agent outputs ---
    impact_assessment: ImpactAssessment | None = Field(
        default=None,
        description="Output of the Impact Analyst agent",
    )
    certifications: Annotated[list[Certification], operator.add] = Field(
        default_factory=list,
        description="Recommended certifications from the Cert Advisor",
    )
    recommendations: Annotated[list[Recommendation], operator.add] = Field(
        default_factory=list,
        description="Sustainability recommendations from the Coach",
    )
    esg_score: ESGScore | None = Field(
        default=None,
        description="Final ESG score from the ESG Scorer",
    )

    # --- Final report ---
    final_report: str = Field(
        default="",
        description="Compiled final report (markdown) combining all agent outputs",
    )

    # --- Metadata ---
    session_id: str = Field(
        default="",
        description="Django AnalysisSession UUID — used for real-time status tracking",
    )
    current_agent: Annotated[list[str], operator.add] = Field(
        default_factory=list,
        description="Agents that have processed (appended by each node)",
    )
    errors: Annotated[list[str], operator.add] = Field(
        default_factory=list,
        description="Any errors encountered during processing",
    )
