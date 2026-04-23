"""
REST API views for the environmental-analysis pipeline.

Endpoints:
    POST   /api/green-analysis/               → start analysis (returns immediately)
    GET    /api/green-analysis/{id}/           → get full results
    GET    /api/green-analysis/{id}/stream/    → SSE stream of agent status events
    POST   /api/green-analysis/{id}/followup/  → answer follow-up questions
    GET    /api/green-analysis/{id}/report/     → get report only
"""

from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time

from django.conf import settings
from django.http import StreamingHttpResponse
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.types import Command
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from green_analysis.agents.graph import build_graph
from green_analysis.models import AnalysisSession

from .serializers import (
    AnalysisCreateSerializer,
    AnalysisDetailSerializer,
    FollowUpSerializer,
    ReportSerializer,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_CHECKPOINT_DB = str(settings.BASE_DIR / "checkpoints.sqlite3")


def _get_graph():
    """Build the LangGraph pipeline with SQLite checkpointer."""
    conn = sqlite3.connect(_CHECKPOINT_DB, check_same_thread=False)
    checkpointer = SqliteSaver(conn)
    return build_graph(checkpointer=checkpointer)


def _thread_config(session_id: str) -> dict:
    return {"configurable": {"thread_id": session_id}}


def _serialize_pydantic(obj):
    """Convert a Pydantic model (or list of them) to JSON-safe dicts."""
    if obj is None:
        return None
    if isinstance(obj, list):
        return [item.model_dump() if hasattr(item, "model_dump") else item for item in obj]
    return obj.model_dump() if hasattr(obj, "model_dump") else obj


def _save_state_to_session(session: AnalysisSession, state: dict) -> None:
    """Persist LangGraph state fields into the Django model."""
    session.parsed_input = _serialize_pydantic(state.get("parsed_input"))
    session.impact_assessment = _serialize_pydantic(state.get("impact_assessment"))
    session.certifications = _serialize_pydantic(state.get("certifications", []))
    session.recommendations = _serialize_pydantic(state.get("recommendations", []))
    session.esg_score = _serialize_pydantic(state.get("esg_score"))
    session.final_report = state.get("final_report", "")
    session.errors = state.get("errors", [])
    session.follow_up_questions = state.get("follow_up_questions", [])
    session.user_responses = state.get("user_responses", {})

    if state.get("needs_clarification"):
        session.status = AnalysisSession.Status.CLARIFICATION_NEEDED
    elif session.final_report:
        session.status = AnalysisSession.Status.COMPLETED
    else:
        session.status = AnalysisSession.Status.PROCESSING

    session.save()


def _build_parsed_input(project_data: dict, raw_text: str) -> dict:
    """Map Studio project_data into parser output schema to skip parser overhead."""
    activity = (project_data.get("activite") or "").strip()
    data_handled = (project_data.get("donneesTraitees") or "").strip()
    resources = [data_handled] if data_handled else []
    activities = [activity] if activity else []

    return {
        "business_description": raw_text,
        "industry_sector": (project_data.get("sector") or "").strip(),
        "sub_sector": (project_data.get("typeSociete") or "").strip(),
        "location": (project_data.get("location") or "Tunisia").strip() or "Tunisia",
        "scale": (project_data.get("stage") or "").strip(),
        "activities": activities,
        "resources_used": resources,
        "exports_to_eu": False,
    }


def _run_pipeline(session_id: str, raw_text: str, project_data: dict | None = None) -> None:
    """Run the LangGraph pipeline in a background thread."""
    graph = _get_graph()
    thread_id = session_id

    try:
        initial_state = {"raw_input": raw_text, "session_id": session_id}
        if isinstance(project_data, dict) and project_data:
            initial_state["parsed_input"] = _build_parsed_input(project_data, raw_text)

        result = graph.invoke(
            initial_state,
            config=_thread_config(thread_id),
        )
        session = AnalysisSession.objects.get(pk=session_id)
        _save_state_to_session(session, result)
    except Exception:
        logger.exception("Pipeline failed for session %s", session_id)
        session = AnalysisSession.objects.get(pk=session_id)
        session.status = AnalysisSession.Status.FAILED
        session.errors = [*session.errors, "Pipeline execution failed"]
        session.save()


# ---------------------------------------------------------------------------
# Views
# ---------------------------------------------------------------------------


class AnalysisCreateView(APIView):
    """POST /api/green-analysis/ — start a new analysis.

    Returns immediately with the session ID. The pipeline runs in a
    background thread. Connect to the /stream/ endpoint for live updates.
    """

    def post(self, request):
        serializer = AnalysisCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        raw_text = serializer.validated_data["business_description"]
        project_data = serializer.validated_data.get("project_data")
        session = AnalysisSession.objects.create(
            raw_input=raw_text,
            status=AnalysisSession.Status.PROCESSING,
        )

        # Start pipeline in background thread
        thread = threading.Thread(
            target=_run_pipeline,
            args=(str(session.id), raw_text, project_data),
            daemon=True,
        )
        thread.start()

        return Response(
            {"id": str(session.id), "status": session.status},
            status=status.HTTP_202_ACCEPTED,
        )


class AnalysisDetailView(generics.RetrieveAPIView):
    """GET /api/green-analysis/{id}/ — fetch full analysis results."""

    queryset = AnalysisSession.objects.all()
    serializer_class = AnalysisDetailSerializer


class AnalysisStreamView(APIView):
    """GET /api/green-analysis/{id}/stream/ — SSE stream of agent events.

    Sends events as agents start and complete:
        data: {"agent": "input_parser", "status": "running"}
        data: {"agent": "input_parser", "status": "completed"}
        ...
        data: {"type": "done", "status": "completed"}
    """

    def get(self, request, pk):
        try:
            session = AnalysisSession.objects.get(pk=pk)
        except AnalysisSession.DoesNotExist:
            return Response(
                {"detail": "Session not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        def event_stream():
            last_seen = {}
            max_polls = 300  # 5 min max (300 * 1s)

            for _ in range(max_polls):
                session.refresh_from_db()
                current = session.agent_status or {}

                # Emit new/changed agent statuses
                for agent, agent_status in current.items():
                    if last_seen.get(agent) != agent_status:
                        last_seen[agent] = agent_status
                        yield f"data: {json.dumps({'agent': agent, 'status': agent_status})}\n\n"

                # Check terminal states
                if session.status == AnalysisSession.Status.COMPLETED:
                    yield f"data: {json.dumps({'type': 'done', 'status': 'completed'})}\n\n"
                    return
                if session.status == AnalysisSession.Status.FAILED:
                    yield f"data: {json.dumps({'type': 'done', 'status': 'failed'})}\n\n"
                    return
                if session.status == AnalysisSession.Status.CLARIFICATION_NEEDED:
                    yield f"data: {json.dumps({'type': 'clarification', 'questions': session.follow_up_questions})}\n\n"
                    return

                time.sleep(1)

            yield f"data: {json.dumps({'type': 'timeout'})}\n\n"

        response = StreamingHttpResponse(
            event_stream(),
            content_type="text/event-stream",
        )
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response


class AnalysisFollowUpView(APIView):
    """POST /api/green-analysis/{id}/followup/ — answer follow-up questions."""

    def post(self, request, pk):
        try:
            session = AnalysisSession.objects.get(pk=pk)
        except AnalysisSession.DoesNotExist:
            return Response(
                {"detail": "Session not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if session.status != AnalysisSession.Status.CLARIFICATION_NEEDED:
            return Response(
                {"detail": f"Session is '{session.status}', not awaiting follow-up."},
                status=status.HTTP_409_CONFLICT,
            )

        serializer = FollowUpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        answers = serializer.validated_data["responses"]
        thread_id = str(session.id)

        session.status = AnalysisSession.Status.PROCESSING
        session.agent_status = {}
        session.save(update_fields=["status", "agent_status", "updated_at"])

        def _resume_pipeline():
            graph = _get_graph()
            try:
                result = graph.invoke(
                    Command(resume=answers),
                    config=_thread_config(thread_id),
                )
                s = AnalysisSession.objects.get(pk=pk)
                _save_state_to_session(s, result)
            except Exception:
                logger.exception("Follow-up pipeline failed for session %s", thread_id)
                s = AnalysisSession.objects.get(pk=pk)
                s.status = AnalysisSession.Status.FAILED
                s.errors = [*s.errors, "Follow-up pipeline execution failed"]
                s.save()

        thread = threading.Thread(target=_resume_pipeline, daemon=True)
        thread.start()

        return Response(
            {"id": str(session.id), "status": "processing"},
            status=status.HTTP_202_ACCEPTED,
        )


class AnalysisReportView(generics.RetrieveAPIView):
    """GET /api/green-analysis/{id}/report/ — fetch final report only."""

    queryset = AnalysisSession.objects.all()
    serializer_class = ReportSerializer


class AnalysisReportView(generics.RetrieveAPIView):
    """GET /api/green-analysis/{id}/report/ — fetch final report only."""

    queryset = AnalysisSession.objects.all()
    serializer_class = ReportSerializer
