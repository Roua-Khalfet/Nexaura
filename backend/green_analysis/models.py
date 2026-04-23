import uuid

from django.db import models


class AnalysisSession(models.Model):
    """Persists one environmental-analysis pipeline run."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        CLARIFICATION_NEEDED = "clarification_needed", "Clarification Needed"
        PROCESSING = "processing", "Processing"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    status = models.CharField(
        max_length=25,
        choices=Status.choices,
        default=Status.PENDING,
    )

    # Input
    raw_input = models.TextField(help_text="Free-text business description")

    # Follow-up (human-in-the-loop)
    follow_up_questions = models.JSONField(default=list, blank=True)
    user_responses = models.JSONField(default=dict, blank=True)

    # Agent outputs — stored as JSON (mirrors Pydantic models)
    parsed_input = models.JSONField(null=True, blank=True)
    impact_assessment = models.JSONField(null=True, blank=True)
    certifications = models.JSONField(default=list, blank=True)
    recommendations = models.JSONField(default=list, blank=True)
    esg_score = models.JSONField(null=True, blank=True)
    final_report = models.TextField(blank=True, default="")

    # Errors
    errors = models.JSONField(default=list, blank=True)

    # Real-time agent status tracking (for SSE streaming)
    agent_status = models.JSONField(
        default=dict,
        blank=True,
        help_text='Per-agent status: {"input_parser": "completed", "impact_analyst": "running", ...}',
    )

    # Agent reasoning traces (transparency)
    agent_trace = models.JSONField(
        default=dict,
        blank=True,
        help_text='Per-agent reasoning steps: {"input_parser": [{"step": "...", "detail": "..."}], ...}',
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"AnalysisSession {self.id} [{self.status}]"
