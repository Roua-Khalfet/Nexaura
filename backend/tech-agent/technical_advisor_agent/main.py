import os
import json
from contextlib import suppress
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi import Query
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from uuid import uuid4

from technical_advisor_agent.graph import agent
from technical_advisor_agent.kb.build_index import ensure_index_ready
from technical_advisor_agent.memory.feedback_store import FeedbackStore
from technical_advisor_agent.memory.session_store import (
    load_history,
    load_project_state,
    save_project_state,
    save_turn,
)
from technical_advisor_agent.models import FeedbackRequest, InvokeRequest, InvokeResponse, ProjectState


app = FastAPI()

# Add CORS middleware to allow requests from frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

feedback_store = FeedbackStore(redis_url=os.getenv("REDIS_URL", "redis://redis:6379"))


def _model_dump(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        try:
            return value.model_dump(mode="json")
        except TypeError:
            return value.model_dump()
    if hasattr(value, "dict"):
        return value.dict()
    return value


def _deep_merge_dict(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge_dict(merged[key], value)
        else:
            merged[key] = value
    return merged


def _normalize_project_state(source: Any) -> dict[str, Any]:
    try:
        return ProjectState(**(_model_dump(source) or {})).model_dump()
    except Exception:
        return ProjectState().model_dump()


def _resolve_project_state(session_id: str, request_project_state: Any) -> dict[str, Any]:
    stored = load_project_state(session_id) if session_id else None
    merged = _normalize_project_state(stored)

    incoming_dump = _model_dump(request_project_state) if request_project_state is not None else None
    if isinstance(incoming_dump, dict):
        merged = _deep_merge_dict(merged, incoming_dump)
        # Request body explicitly controls revisit flags.
        if "revisiting" in incoming_dump:
            merged["revisiting"] = incoming_dump.get("revisiting")
        if "revisit_target" in incoming_dump:
            merged["revisit_target"] = incoming_dump.get("revisit_target")

    return _normalize_project_state(merged)


def _is_truthy(value: str) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


@app.on_event("startup")
def bootstrap_vector_index() -> None:
    if os.getenv("KB_RETRIEVER", "vector").strip().lower() != "vector":
        return
    if not _is_truthy(os.getenv("AUTO_BUILD_INDEX_ON_STARTUP", "true")):
        return

    with suppress(Exception):
        result = ensure_index_ready(
            kb_root=os.getenv("KB_ROOT", "technical_advisor_agent/kb"),
            qdrant_url=os.getenv("QDRANT_URL", "http://qdrant:6333"),
        )
        print(f"[startup] vector index bootstrap result: {result}")


def _to_history_dict(messages) -> list[dict[str, str]]:
    history = []
    for msg in messages:
        if isinstance(msg, dict):
            msg_type = str(msg.get("type", ""))
            content = str(msg.get("content", ""))
        else:
            msg_type = str(getattr(msg, "type", ""))
            content = str(getattr(msg, "content", ""))
        if msg_type == "human":
            role = "user"
        elif msg_type == "ai":
            role = "assistant"
        else:
            continue
        history.append({"role": role, "content": content})
    return history


def _build_initial_state(
    request: InvokeRequest,
    *,
    session_id: str,
    conversation_history: list[dict[str, str]],
    project_state: dict[str, Any],
) -> dict[str, Any]:
    phase_decisions = project_state.get("decisions") if isinstance(project_state.get("decisions"), dict) else {}
    discovery_turn_count = int(project_state.get("discovery_turn_count") or 0)
    discovery_complete = bool(project_state.get("discovery_complete"))
    advisory_turn_count = int(project_state.get("advisory_turn_count") or 0)
    last_advisory_intent = project_state.get("last_advisory_intent")

    return {
        "user_query": request.user_query,
        "founder_context": _model_dump(request.founder_context) or {},
        "input_source": request.input_source,
        "message_type": request.message_type,
        "session_id": session_id,
        "conversation_history": conversation_history,
        "preferred_language": request.preferred_language,
        "project_state": project_state,
        "updated_project_state": project_state,
        "current_phase": str(project_state.get("current_phase") or "discovery"),
        "completed_phases": list(project_state.get("completed_phases") or []),
        "phase_decisions": phase_decisions,
        "is_revisiting": bool(project_state.get("revisiting")),
        "discovery_turn_count": discovery_turn_count,
        "discovery_complete": discovery_complete,
        "advisory_turn_count": advisory_turn_count,
        "last_advisory_intent": last_advisory_intent,
        "agent_steps": [],
        "search_results": [],
        "github_results": [],
        "kb_results": {},
        "parse_attempts": 0,
        "context_valid": False,
        "validation_error": None,
        "intent": None,
        "comparison_option_a": None,
        "comparison_option_b": None,
        "comparison_results": None,
        "raw_llm_output": None,
        "chat_response": None,
        "a2a_payload": None,
        "error": None,
    }


def _merge_state(target: dict[str, Any], patch: dict[str, Any]) -> None:
    for key, value in patch.items():
        if key == "agent_steps" and isinstance(value, list):
            existing = list(target.get("agent_steps") or [])
            target["agent_steps"] = existing + value
        else:
            target[key] = value


def _sse(event: str, payload: dict[str, Any]) -> str:
    body = json.dumps(payload, ensure_ascii=False)
    return f"event: {event}\ndata: {body}\n\n"


_NODE_SUMMARIES: dict[str, str] = {
    "context_validator": "Validating and extracting project context from your message…",
    "project_state_manager": "Updating project journey state and phase decisions…",
    "intent_classifier": "Classifying the intent of your request…",
    "stack": "Generating tech stack recommendation…",
    "stack_comparison": "Running decision matrix comparison…",
    "architecture": "Designing system architecture…",
    "roadmap": "Building product roadmap…",
    "feasibility": "Assessing technical feasibility…",
    "cost": "Estimating infrastructure and build costs…",
    "security": "Reviewing security posture and controls…",
    "libraries": "Discovering relevant open-source libraries…",
    "synthesizer": "Synthesizing final advisory response…",
    "output_parser": "Parsing and structuring agent output…",
    "project_state_finalizer": "Persisting project journey progress…",
}


def _node_summary(update: Any, node_name: str = "") -> str:
    # 1. Use the static label if we know the node name.
    if node_name and node_name in _NODE_SUMMARIES:
        return _NODE_SUMMARIES[node_name]

    # 2. Fall back to the last agent_step detail emitted by that node.
    if isinstance(update, dict):
        steps = update.get("agent_steps")
        if isinstance(steps, list) and steps:
            last = steps[-1]
            if isinstance(last, dict):
                details = str(last.get("details") or "").strip()
                if details:
                    return details

        if update.get("error"):
            return str(update.get("error"))

    return "Step completed."


def _result_project_state(result_state: dict[str, Any], fallback_state: dict[str, Any]) -> dict[str, Any]:
    candidate = result_state.get("updated_project_state") or result_state.get("project_state") or fallback_state
    return _normalize_project_state(candidate)


@app.post("/invoke")
async def invoke(request: InvokeRequest):
    session_id = request.session_id or str(uuid4())
    conversation_history = _to_history_dict(load_history(session_id))
    project_state = _resolve_project_state(session_id, request.project_state)
    initial_state = _build_initial_state(
        request,
        session_id=session_id,
        conversation_history=conversation_history,
        project_state=project_state,
    )

    result = agent.invoke(initial_state)

    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])

    chat_response = result.get("chat_response") or ""
    updated_project_state = _result_project_state(result, project_state)

    save_project_state(session_id=session_id, project_state=updated_project_state)
    save_turn(session_id=session_id, user_message=request.user_query, assistant_message=chat_response)

    response = InvokeResponse(
        session_id=session_id,
        chat_response=chat_response,
        a2a_payload=result.get("a2a_payload"),
        updated_project_state=ProjectState(**updated_project_state),
    )
    dumped = response.model_dump()
    dumped["updated_founder_context"] = result.get("founder_context") or initial_state.get("founder_context") or {}
    dumped["discovery_turn_count"] = int(result.get("discovery_turn_count") or updated_project_state.get("discovery_turn_count") or 0)
    dumped["discovery_complete"] = bool(result.get("discovery_complete") or updated_project_state.get("discovery_complete"))
    return dumped


@app.post("/invoke/stream")
async def invoke_stream(request: InvokeRequest):
    session_id = request.session_id or str(uuid4())
    conversation_history = _to_history_dict(load_history(session_id))
    project_state = _resolve_project_state(session_id, request.project_state)
    initial_state = _build_initial_state(
        request,
        session_id=session_id,
        conversation_history=conversation_history,
        project_state=project_state,
    )

    def event_generator():
        result_state = dict(initial_state)
        step_index = 0

        yield _sse(
            "run_started",
            {
                "session_id": session_id,
                "query": request.user_query,
                "history_turns": len(conversation_history),
            },
        )

        try:
            for update in agent.stream(initial_state, stream_mode="updates"):
                if not isinstance(update, dict):
                    continue

                for node_name, node_update in update.items():
                    step_index += 1
                    yield _sse(
                        "step_started",
                        {
                            "session_id": session_id,
                            "index": step_index,
                            "node": node_name,
                        },
                    )

                    if isinstance(node_update, dict):
                        _merge_state(result_state, node_update)

                    status = "failed" if isinstance(node_update, dict) and node_update.get("error") else "completed"
                    yield _sse(
                        "step_completed",
                        {
                            "session_id": session_id,
                            "index": step_index,
                            "node": node_name,
                            "status": status,
                            "summary": _node_summary(node_update, node_name),
                            "agent_step": (result_state.get("agent_steps") or [{}])[-1],
                        },
                    )

            if result_state.get("error"):
                yield _sse(
                    "run_failed",
                    {
                        "session_id": session_id,
                        "error": result_state.get("error"),
                    },
                )
                return

            chat_response = result_state.get("chat_response") or ""
            updated_project_state = _result_project_state(result_state, project_state)

            save_project_state(session_id=session_id, project_state=updated_project_state)
            save_turn(session_id=session_id, user_message=request.user_query, assistant_message=chat_response)

            yield _sse(
                "final_response",
                {
                    "session_id": session_id,
                    "chat_response": chat_response,
                    "a2a_payload": result_state.get("a2a_payload"),
                    "updated_project_state": updated_project_state,
                    "updated_founder_context": result_state.get("founder_context") or initial_state.get("founder_context") or {},
                    "discovery_turn_count": int(result_state.get("discovery_turn_count") or updated_project_state.get("discovery_turn_count") or 0),
                    "discovery_complete": bool(result_state.get("discovery_complete") or updated_project_state.get("discovery_complete")),
                },
            )
            yield _sse("project_state_updated", updated_project_state)
            yield _sse(
                "run_completed",
                {
                    "session_id": session_id,
                    "steps": step_index,
                },
            )
        except Exception as exc:
            yield _sse(
                "run_failed",
                {
                    "session_id": session_id,
                    "error": str(exc),
                },
            )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/project/{session_id}/state")
async def get_project_state(session_id: str):
    project_state = load_project_state(session_id)
    if not project_state:
        raise HTTPException(status_code=404, detail="Session not found")

    normalized = _normalize_project_state(project_state)
    return {"project_state": normalized}


@app.post("/feedback")
async def post_feedback(request: FeedbackRequest):
    rating = (request.rating or "").strip().lower()
    if rating not in {"up", "down"}:
        raise HTTPException(status_code=422, detail="rating must be 'up' or 'down'")

    await feedback_store.record(
        session_id=request.session_id,
        founder_id=request.founder_id,
        rating=rating,
        intent=request.intent,
        kb_sources=request.kb_sources,
    )
    return {"status": "ok"}


@app.get("/feedback/scores")
async def get_feedback_scores(top_n: int = Query(default=100, ge=1, le=500)):
    scores = await feedback_store.get_all_scores(top_n=top_n)
    return {"scores": scores}


@app.get("/feedback/stream")
async def get_feedback_stream(
    count: int = Query(default=100, ge=1, le=1000),
    last_id: str = Query(default="0"),
):
    events = await feedback_store.read_stream(count=count, last_id=last_id)
    return {"events": events}
