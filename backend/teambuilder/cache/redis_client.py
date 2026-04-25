import os, json
from typing import Optional
import redis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
_redis: Optional[redis.Redis] = None


def get_redis() -> redis.Redis:
    """Get synchronous Redis client."""
    global _redis
    if _redis is None:
        _redis = redis.from_url(REDIS_URL, decode_responses=True)
    return _redis


def cache_get(key: str) -> Optional[dict]:
    """Synchronous cache get."""
    data = get_redis().get(key)
    return json.loads(data) if data else None


def cache_set(key: str, value: dict, ttl: int = 86400):
    """Synchronous cache set."""
    get_redis().set(key, json.dumps(value), ex=ttl)


# Async versions for compatibility
async def cache_get_async(key: str) -> Optional[dict]:
    """Async wrapper for cache_get."""
    return cache_get(key)


async def cache_set_async(key: str, value: dict, ttl: int = 86400):
    """Async wrapper for cache_set."""
    cache_set(key, value, ttl)
