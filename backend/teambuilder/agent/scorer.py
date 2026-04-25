"""Hybrid candidate scorer — combines keyword matching + ChromaDB semantic similarity."""

from agent.state import Role, Candidate

SOURCE_RELIABILITY = {
    "internal_db": 1.0,  # Highest reliability - verified CVs with consent
    "github": 0.9,
    "serpapi": 0.7,
    "upwork": 0.8,
    "tanitjobs": 0.6,
    "keejob": 0.6,
}


def compute_score(candidate: Candidate, role: Role, semantic_score: float = 0.0) -> float:
    """Score a candidate 0.0–1.0 against a role using weighted criteria.
    
    Uses a hybrid approach:
      - 30% Skill keyword overlap
      - 25% ChromaDB semantic similarity
      - 15% Source reliability
      - 15% Profile completeness
      - 10% Has profile URL
      - 5%  Has rate/salary info
    """

    # 30% — Skill keyword overlap
    required = {s.lower() for s in role.required_skills}
    detected = {s.lower() for s in candidate.skills}
    overlap = len(required & detected)
    skill_score = overlap / max(len(required), 1)

    # 25% — ChromaDB semantic similarity (0.0–1.0, pre-computed)
    sem_score = max(0.0, min(1.0, semantic_score))

    # 15% — Source reliability
    source_score = SOURCE_RELIABILITY.get(candidate.source, 0.5)

    # 15% — Profile completeness (how many skills detected, cap at 5)
    completeness = min(len(candidate.skills), 5) / 5

    # 10% — Has profile URL
    has_url = 1.0 if candidate.profile_url else 0.0

    # 5% — Has rate/salary info
    has_rate = 1.0 if candidate.estimated_rate else 0.5

    return round(
        skill_score * 0.30
        + sem_score * 0.25
        + source_score * 0.15
        + completeness * 0.15
        + has_url * 0.10
        + has_rate * 0.05,
        2,
    )


def score_all(candidates: list, roles: list, semantic_scores: dict = None) -> list:
    """Score all candidates, using optional ChromaDB semantic scores.
    
    Args:
        candidates: List of Candidate objects
        roles: List of Role objects  
        semantic_scores: Optional dict mapping candidate name -> semantic similarity score
    """
    role_map = {r.title: r for r in roles}
    sem = semantic_scores or {}
    
    for c in candidates:
        role = role_map.get(c.matched_role)
        if role:
            sem_score = sem.get(c.name, 0.0)
            c.score = compute_score(c, role, semantic_score=sem_score)
        else:
            c.score = 0.3
    
    candidates.sort(key=lambda x: x.score, reverse=True)
    return candidates
