from rest_framework import serializers

from green_analysis.models import AnalysisSession


class AnalysisCreateSerializer(serializers.Serializer):
    """Accepts the free-text business description to start an analysis."""

    business_description = serializers.CharField(
        min_length=20,
        max_length=5000,
        help_text="Describe your business idea (activities, location, scale …)",
    )
    project_data = serializers.DictField(
        required=False,
        help_text="Optional structured project data from Studio pipeline",
    )


class FollowUpSerializer(serializers.Serializer):
    """Accepts user answers to follow-up questions."""

    responses = serializers.DictField(
        child=serializers.CharField(),
        help_text="Mapping of question → answer",
    )


class AnalysisDetailSerializer(serializers.ModelSerializer):
    """Full read-only representation of an analysis session."""

    class Meta:
        model = AnalysisSession
        fields = [
            "id",
            "status",
            "raw_input",
            "follow_up_questions",
            "user_responses",
            "parsed_input",
            "impact_assessment",
            "certifications",
            "recommendations",
            "esg_score",
            "final_report",
            "errors",
            "agent_status",
            "agent_trace",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ReportSerializer(serializers.ModelSerializer):
    """Lightweight view returning only the final report."""

    class Meta:
        model = AnalysisSession
        fields = ["id", "status", "final_report", "esg_score"]
        read_only_fields = fields
