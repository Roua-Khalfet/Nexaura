import json
import os
from typing import Any, List, Optional

import redis
from langchain_community.chat_message_histories import RedisChatMessageHistory
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage


REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
SESSION_TTL_SECONDS = 86400
MAX_TURNS = 10
MAX_MESSAGES = MAX_TURNS * 2
PROJECT_STATE_KEY_PREFIX = "project"


def _project_state_key(session_id: str) -> str:
    return f"{PROJECT_STATE_KEY_PREFIX}:{session_id}:state"


def _get_state_client() -> Optional[redis.Redis]:
    try:
        return redis.Redis.from_url(REDIS_URL, decode_responses=True)
    except Exception:
        return None


def _get_history(session_id: str) -> RedisChatMessageHistory:
    return RedisChatMessageHistory(
        session_id=session_id,
        url=REDIS_URL,
        ttl=SESSION_TTL_SECONDS,
    )


def _touch_ttl(history: RedisChatMessageHistory) -> None:
    redis_client = getattr(history, "redis_client", None)
    key = getattr(history, "key", None)
    if redis_client is None or key is None:
        return
    try:
        redis_client.expire(key, SESSION_TTL_SECONDS)
    except Exception:
        pass


def load_history(session_id: str) -> List[BaseMessage]:
    history = _get_history(session_id)
    try:
        return list(history.messages)[-MAX_MESSAGES:]
    except Exception:
        return []


def save_turn(session_id: str, user_message: str, assistant_message: str) -> None:
    history = _get_history(session_id)
    history.add_message(HumanMessage(content=user_message))
    history.add_message(AIMessage(content=assistant_message))
    _touch_ttl(history)


def load_project_state(session_id: str) -> Optional[dict[str, Any]]:
    if not session_id:
        return None

    client = _get_state_client()
    if client is None:
        return None

    key = _project_state_key(session_id)
    try:
        raw = client.get(key)
        if not raw:
            return None
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            return None
        client.expire(key, SESSION_TTL_SECONDS)
        return parsed
    except Exception:
        return None


def save_project_state(session_id: str, project_state: dict[str, Any]) -> bool:
    if not session_id or not isinstance(project_state, dict):
        return False

    client = _get_state_client()
    if client is None:
        return False

    key = _project_state_key(session_id)
    try:
        client.set(key, json.dumps(project_state))
        client.expire(key, SESSION_TTL_SECONDS)
        return True
    except Exception:
        return False
