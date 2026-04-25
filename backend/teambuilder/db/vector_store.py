"""ChromaDB vector store — semantic matching of candidates to roles.

Uses ChromaDB's built-in sentence-transformer embeddings (all-MiniLM-L6-v2)
to match candidates to roles by meaning, not just keywords.

Runs locally, zero cost, persists to disk at ./chroma_data/.
"""

import chromadb
from chromadb.config import Settings

# Persistent local storage — survives restarts
client = chromadb.PersistentClient(
    path="./chroma_data",
    settings=Settings(anonymized_telemetry=False),
)


def get_roles_collection():
    """Collection for role descriptions (used as the search index)."""
    return client.get_or_create_collection(
        name="roles",
        metadata={"hnsw:space": "cosine"},
    )


def get_candidates_collection():
    """Collection for candidate profiles."""
    return client.get_or_create_collection(
        name="candidates",
        metadata={"hnsw:space": "cosine"},
    )


def role_to_text(title: str, seniority: str, skills: list[str], description: str = "") -> str:
    """Convert a role into a rich text string for embedding."""
    parts = [title, seniority]
    if skills:
        parts.append("Skills: " + ", ".join(skills))
    if description:
        parts.append(description)
    return " | ".join(parts)


def candidate_to_text(name: str, skills: list[str], source: str, role: str = "") -> str:
    """Convert a candidate into a rich text string for embedding."""
    parts = [name, source]
    if skills:
        parts.append("Skills: " + ", ".join(skills))
    if role:
        parts.append(f"Matched: {role}")
    return " | ".join(parts)


def index_roles(roles: list[dict]):
    """Index a list of roles into ChromaDB for semantic search.
    
    Each role dict should have: title, seniority, required_skills
    """
    collection = get_roles_collection()
    
    ids = []
    documents = []
    metadatas = []
    
    for i, r in enumerate(roles):
        role_id = f"{r['title']}_{r.get('seniority', 'mid')}".lower().replace(" ", "_")
        text = role_to_text(
            r["title"],
            r.get("seniority", "mid"),
            r.get("required_skills", []),
            r.get("description", ""),
        )
        ids.append(role_id)
        documents.append(text)
        metadatas.append({
            "title": r["title"],
            "seniority": r.get("seniority", "mid"),
            "skills": ", ".join(r.get("required_skills", [])),
        })
    
    # Upsert (insert or update)
    collection.upsert(ids=ids, documents=documents, metadatas=metadatas)
    return len(ids)


def index_candidates(candidates: list[dict]):
    """Index candidates into ChromaDB for persistence and similarity search."""
    collection = get_candidates_collection()
    
    ids = []
    documents = []
    metadatas = []
    
    for i, c in enumerate(candidates):
        cand_id = f"{c['source']}_{c['name']}_{i}".lower().replace(" ", "_")
        text = candidate_to_text(
            c["name"],
            c.get("skills", []),
            c["source"],
            c.get("matched_role", ""),
        )
        ids.append(cand_id)
        documents.append(text)
        metadatas.append({
            "name": c["name"],
            "source": c["source"],
            "profile_url": c.get("profile_url", ""),
            "matched_role": c.get("matched_role", ""),
            "skills": ", ".join(c.get("skills", [])),
        })
    
    collection.upsert(ids=ids, documents=documents, metadatas=metadatas)
    return len(ids)


def semantic_match_candidates(role_title: str, role_skills: list[str],
                               seniority: str = "mid", n_results: int = 10) -> list[dict]:
    """Find candidates that semantically match a role description.
    
    Returns list of dicts with candidate metadata + similarity distance.
    """
    collection = get_candidates_collection()
    
    if collection.count() == 0:
        return []
    
    query_text = role_to_text(role_title, seniority, role_skills)
    
    results = collection.query(
        query_texts=[query_text],
        n_results=min(n_results, collection.count()),
    )
    
    matched = []
    if results and results["metadatas"]:
        for meta, distance in zip(results["metadatas"][0], results["distances"][0]):
            similarity = round(1.0 - distance, 4)  # cosine distance to similarity
            matched.append({
                **meta,
                "semantic_score": similarity,
            })
    
    return matched


def find_similar_roles(role_title: str, skills: list[str], n_results: int = 5) -> list[dict]:
    """Find similar roles in the indexed roles collection."""
    collection = get_roles_collection()
    
    if collection.count() == 0:
        return []
    
    query_text = role_to_text(role_title, "mid", skills)
    
    results = collection.query(
        query_texts=[query_text],
        n_results=min(n_results, collection.count()),
    )
    
    matched = []
    if results and results["metadatas"]:
        for meta, distance in zip(results["metadatas"][0], results["distances"][0]):
            similarity = round(1.0 - distance, 4)
            matched.append({**meta, "similarity": similarity})
    
    return matched
