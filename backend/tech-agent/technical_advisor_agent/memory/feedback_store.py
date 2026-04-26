import json
import os
import time
import uuid
from typing import Dict, List

import redis.asyncio as aioredis


class FeedbackStore:
    def __init__(self, redis_url: str):
        self.r = aioredis.from_url(redis_url)
        self.stream = "feedback_stream"
        self.up_key = "kb_scores:up"
        self.down_key = "kb_scores:down"
        self.maxlen = int(os.getenv("FEEDBACK_STREAM_MAXLEN", "50000"))

    async def record(
        self,
        session_id: str,
        founder_id: str,
        rating: str,
        intent: str,
        kb_sources: List[str],
    ) -> None:
        event = {
            "event_id": str(uuid.uuid4()),
            "session_id": session_id,
            "founder_id": founder_id,
            "rating": rating,
            "intent": intent,
            "kb_sources": json.dumps(kb_sources),
            "ts": str(int(time.time())),
        }

        score_key = self.up_key if rating == "up" else self.down_key
        async with self.r.pipeline() as pipe:
            pipe.xadd(self.stream, event, maxlen=self.maxlen, approximate=True)
            for src in kb_sources:
                pipe.zincrby(score_key, 1, src)
            await pipe.execute()

    async def get_scores(self, sources: List[str]) -> Dict[str, float]:
        if not sources:
            return {}

        ups = await self.r.zmscore(self.up_key, sources)
        downs = await self.r.zmscore(self.down_key, sources)

        global_mean = await self._global_mean()
        c = int(os.getenv("BAYES_CONFIDENCE", "5"))

        scores: Dict[str, float] = {}
        for src, up, down in zip(sources, ups, downs):
            u = float(up or 0.0)
            d = float(down or 0.0)
            n = u + d
            scores[src] = ((c * global_mean) + u) / (c + n) if n > 0 else global_mean
        return scores

    async def get_all_scores(self, top_n: int = 100) -> Dict[str, float]:
        ups = await self.r.zrevrange(self.up_key, 0, max(0, top_n - 1), withscores=True)
        downs = await self.r.zrevrange(self.down_key, 0, max(0, top_n - 1), withscores=True)

        source_set = {str(k) for k, _ in ups} | {str(k) for k, _ in downs}
        sources = sorted(source_set)
        return await self.get_scores(sources)

    async def read_stream(self, count: int = 100, last_id: str = "0") -> List[Dict[str, str]]:
        stream = await self.r.xread({self.stream: last_id}, count=count, block=0)
        events: List[Dict[str, str]] = []
        for _stream_name, entries in stream:
            for event_id, fields in entries:
                item = {"id": str(event_id)}
                for key, value in fields.items():
                    item[str(key)] = str(value)
                events.append(item)
        return events

    async def _global_mean(self) -> float:
        up_total = await self._sum_sorted_set(self.up_key)
        down_total = await self._sum_sorted_set(self.down_key)
        total = up_total + down_total
        return (up_total / total) if total > 0 else 0.5

    async def _sum_sorted_set(self, key: str) -> float:
        items = await self.r.zrange(key, 0, -1, withscores=True)
        return float(sum(score for _, score in items))
