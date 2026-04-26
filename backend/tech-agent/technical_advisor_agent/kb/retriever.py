import os
from typing import Any, Dict, List

from technical_advisor_agent.kb import legacy_retriever
from technical_advisor_agent.kb.vector_retriever import get_vector_retriever
def get_templates(domain: str, intent: str) -> List[Dict]:
    return legacy_retriever.get_templates(domain=domain, intent=intent)


def get_compliance(standards: List[str]) -> str:
    return legacy_retriever.get_compliance(standards=standards)


def get_pricing(provider: str, services: List[str]) -> Dict:
    return legacy_retriever.get_pricing(provider=provider, services=services)


def get_rules(categories: List[str]) -> str:
    return legacy_retriever.get_rules(categories=categories)


def query_kb(query_text: str, intent: str, top_k: int = 5) -> List[Dict[str, Any]]:
    mode = os.getenv("KB_RETRIEVER", "vector").strip().lower()
    if mode != "vector":
        return _legacy_query(query_text=query_text, intent=intent, top_k=top_k)

    vector = get_vector_retriever()
    if vector is None:
        return _legacy_query(query_text=query_text, intent=intent, top_k=top_k)

    try:
        candidates = vector.query(
            query_text=query_text,
            intent=intent,
            top_k=top_k,
            candidate_k=int(os.getenv("KB_CANDIDATE_K", "20")),
        )
        return _apply_feedback_rerank(candidates)
    except Exception:
        return _legacy_query(query_text=query_text, intent=intent, top_k=top_k)


def _legacy_query(query_text: str, intent: str, top_k: int) -> List[Dict[str, Any]]:
    del query_text
    docs: List[Dict[str, Any]] = []
    rules = get_rules(categories=["api", "auth", "data", "scalability"]) if intent in {"security", "feasibility"} else ""
    templates = get_templates(domain="", intent=intent)

    if rules:
        docs.append(
            {
                "content": rules,
                "metadata": {"source_file": "rules", "domain": intent, "retriever": "legacy"},
                "score": 0.5,
            }
        )
    for idx, item in enumerate(templates[:top_k]):
        docs.append(
            {
                "content": str(item),
                "metadata": {
                    "source_file": f"templates/{idx}",
                    "domain": intent,
                    "retriever": "legacy",
                },
                "score": 0.4,
            }
        )
    return docs[:top_k]


def _apply_feedback_rerank(candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not candidates:
        return []

    redis_url = os.getenv("REDIS_URL", "redis://redis:6379")
    sources: List[str] = []
    for item in candidates:
        metadata = item.get("metadata") or {}
        source = str(metadata.get("source_file") or "").strip()
        if source:
            sources.append(source)

    if not sources:
        return candidates

    try:
        import redis

        client = redis.Redis.from_url(redis_url, decode_responses=True)
        ups = client.zmscore("kb_scores:up", sources)
        downs = client.zmscore("kb_scores:down", sources)
        bayes_scores: Dict[str, float] = {}
        up_total = sum(float(score) for _, score in client.zrange("kb_scores:up", 0, -1, withscores=True))
        down_total = sum(float(score) for _, score in client.zrange("kb_scores:down", 0, -1, withscores=True))
        total = up_total + down_total
        global_mean = (up_total / total) if total > 0 else 0.5
        c = int(os.getenv("BAYES_CONFIDENCE", "5"))
        for src, up, down in zip(sources, ups, downs):
            u = float(up or 0.0)
            d = float(down or 0.0)
            n = u + d
            bayes_scores[src] = ((c * global_mean) + u) / (c + n) if n > 0 else global_mean
    except Exception:
        return candidates

    weight = float(os.getenv("RERANK_WEIGHT", "0.2"))
    global_mean = float(sum(bayes_scores.values()) / max(len(bayes_scores), 1))

    reranked: List[Dict[str, Any]] = []
    for item in candidates:
        metadata = item.get("metadata") or {}
        source = str(metadata.get("source_file") or "").strip()
        semantic_score = float(item.get("score") or 0.0)
        bayesian = float(bayes_scores.get(source, global_mean))
        final_score = semantic_score * (1 - weight) + bayesian * weight
        reranked.append({**item, "final_score": final_score})

    reranked.sort(key=lambda x: x.get("final_score", x.get("score", 0.0)), reverse=True)
    return reranked
