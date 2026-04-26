import os
from typing import Any, Dict, List, Optional


COLLECTION_NAME = "tech_advisor_kb"
DEFAULT_TOP_K = 5
DEFAULT_CANDIDATE_K = 20


class VectorRetriever:
    def __init__(self, qdrant_url: str, embedding_model: str = "text-embedding-3-large"):
        from openai import OpenAI
        from qdrant_client import QdrantClient

        self.client = QdrantClient(url=qdrant_url)
        self.oai = OpenAI()
        self.embedding_model = embedding_model

    def query(self, query_text: str, intent: str, top_k: int = DEFAULT_TOP_K, candidate_k: int = DEFAULT_CANDIDATE_K) -> List[Dict[str, Any]]:
        from qdrant_client.models import Filter, FieldCondition, MatchValue

        fast_vec = self._embed(query_text, dim=256)
        stage_one = self.client.search(
            collection_name=COLLECTION_NAME,
            query_vector=("fast", fast_vec),
            query_filter=Filter(must=[FieldCondition(key="domain", match=MatchValue(value=intent))]),
            limit=max(candidate_k, top_k),
        )
        if not stage_one:
            return []

        candidate_ids = [item.id for item in stage_one if item.id is not None]
        if not candidate_ids:
            return []

        full_vec = self._embed(query_text, dim=3072)
        points = self.client.retrieve(collection_name=COLLECTION_NAME, ids=candidate_ids, with_payload=True, with_vectors=True)

        ranked: List[Dict[str, Any]] = []
        for p in points:
            payload = p.payload or {}
            vectors = p.vector or {}
            full_vector: Optional[List[float]] = None
            if isinstance(vectors, dict):
                full_vector = vectors.get("full")
            elif isinstance(vectors, list):
                full_vector = vectors
            if not full_vector:
                continue
            similarity = self._cosine(full_vec, full_vector)
            ranked.append(
                {
                    "content": str(payload.get("text") or ""),
                    "metadata": payload,
                    "score": similarity,
                }
            )

        ranked.sort(key=lambda item: item.get("score", 0.0), reverse=True)
        return ranked[:top_k]

    def _embed(self, text: str, dim: int) -> List[float]:
        response = self.oai.embeddings.create(
            model=self.embedding_model,
            input=text,
            dimensions=dim,
        )
        return list(response.data[0].embedding)

    @staticmethod
    def _cosine(a: List[float], b: List[float]) -> float:
        if not a or not b:
            return 0.0
        size = min(len(a), len(b))
        if size == 0:
            return 0.0
        dot = sum(a[i] * b[i] for i in range(size))
        norm_a = sum(a[i] * a[i] for i in range(size)) ** 0.5
        norm_b = sum(b[i] * b[i] for i in range(size)) ** 0.5
        if norm_a == 0.0 or norm_b == 0.0:
            return 0.0
        return dot / (norm_a * norm_b)


_vector_retriever: Optional[VectorRetriever] = None


def get_vector_retriever() -> Optional[VectorRetriever]:
    global _vector_retriever
    if _vector_retriever is not None:
        return _vector_retriever

    qdrant_url = os.getenv("QDRANT_URL", "http://qdrant:6333")
    embedding_model = os.getenv("EMBEDDING_MODEL", "text-embedding-3-large")
    try:
        _vector_retriever = VectorRetriever(qdrant_url=qdrant_url, embedding_model=embedding_model)
    except Exception:
        _vector_retriever = None
    return _vector_retriever
