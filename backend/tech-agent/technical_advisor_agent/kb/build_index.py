import hashlib
import os
from pathlib import Path
from typing import Dict, Generator, List, Tuple

from openai import OpenAI
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams


COLLECTION = "tech_advisor_kb"
DIM_FULL = 3072
DIM_FAST = 256
CHUNK_SIZE = 300
CHUNK_OVERLAP = 50
SUPPORTED_EXT = {".md", ".txt", ".json"}


def _is_truthy(value: str) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def _token_chunks(text: str) -> List[str]:
    tokens = text.split()
    if not tokens:
        return []

    chunks: List[str] = []
    step = max(1, CHUNK_SIZE - CHUNK_OVERLAP)
    for idx in range(0, len(tokens), step):
        chunk = tokens[idx: idx + CHUNK_SIZE]
        if not chunk:
            continue
        chunks.append(" ".join(chunk))
    return chunks


def _metadata_for_path(path: Path, kb_root: Path, chunk_index: int) -> Dict[str, str]:
    rel = path.relative_to(kb_root).as_posix()
    parts = rel.split("/")
    kb_type = parts[0] if parts else "unknown"
    stem = path.stem.lower()

    domain = "general"
    if kb_type == "compliance":
        domain = "security"
    elif kb_type == "pricing":
        domain = "cost"
    elif kb_type == "rules":
        if stem in {"auth", "api", "data"}:
            domain = "security"
        elif stem == "scalability":
            domain = "feasibility"
    elif kb_type == "templates":
        domain = "stack"

    return {
        "source_file": rel,
        "kb_type": kb_type,
        "domain": domain,
        "intent_tags": [domain],
        "chunk_index": chunk_index,
    }


def _walk_and_chunk(kb_root: Path) -> Generator[Tuple[str, Dict[str, str]], None, None]:
    for path in kb_root.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in SUPPORTED_EXT:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except Exception:
            continue

        for chunk_index, chunk in enumerate(_token_chunks(text)):
            metadata = _metadata_for_path(path, kb_root, chunk_index)
            yield chunk, metadata


def _point_id(source_file: str, chunk_index: int) -> str:
    raw = f"{source_file}:{chunk_index}".encode("utf-8")
    return hashlib.sha1(raw).hexdigest()


def build_index(kb_root: str = "technical_advisor_agent/kb", qdrant_url: str = "http://localhost:6333") -> int:
    kb_path = Path(kb_root)
    if not kb_path.exists():
        raise FileNotFoundError(f"KB root not found: {kb_root}")

    client = QdrantClient(url=qdrant_url)
    oai = OpenAI()

    client.recreate_collection(
        collection_name=COLLECTION,
        vectors_config={
            "full": VectorParams(size=DIM_FULL, distance=Distance.COSINE),
            "fast": VectorParams(size=DIM_FAST, distance=Distance.COSINE),
        },
    )

    points: List[PointStruct] = []
    for chunk, metadata in _walk_and_chunk(kb_path):
        response = oai.embeddings.create(
            model=os.getenv("EMBEDDING_MODEL", "text-embedding-3-large"),
            input=chunk,
            dimensions=DIM_FULL,
        )
        full_vec = list(response.data[0].embedding)
        fast_vec = full_vec[:DIM_FAST]

        points.append(
            PointStruct(
                id=_point_id(metadata["source_file"], metadata["chunk_index"]),
                vector={"full": full_vec, "fast": fast_vec},
                payload={**metadata, "text": chunk},
            )
        )

    if points:
        client.upsert(collection_name=COLLECTION, points=points)
    return len(points)


def collection_point_count(qdrant_url: str = "http://localhost:6333") -> int:
    client = QdrantClient(url=qdrant_url)
    info = client.get_collection(collection_name=COLLECTION)
    return int(getattr(info, "points_count", 0) or 0)


def ensure_index_ready(
    kb_root: str = "technical_advisor_agent/kb",
    qdrant_url: str = "http://localhost:6333",
) -> dict:
    try:
        count = collection_point_count(qdrant_url=qdrant_url)
        if count > 0:
            return {"status": "ready", "indexed": 0, "points": count}
    except Exception:
        pass

    indexed = build_index(kb_root=kb_root, qdrant_url=qdrant_url)
    return {"status": "indexed", "indexed": indexed, "points": indexed}


if __name__ == "__main__":
    auto = _is_truthy(os.getenv("AUTO_BUILD_INDEX_ON_STARTUP", "true"))
    if auto:
        result = ensure_index_ready(
            kb_root=os.getenv("KB_ROOT", "technical_advisor_agent/kb"),
            qdrant_url=os.getenv("QDRANT_URL", "http://localhost:6333"),
        )
        print(f"Index bootstrap: {result}")
    else:
        total = build_index(
            kb_root=os.getenv("KB_ROOT", "technical_advisor_agent/kb"),
            qdrant_url=os.getenv("QDRANT_URL", "http://localhost:6333"),
        )
        print(f"Indexed {total} chunks into Qdrant collection '{COLLECTION}'.")
