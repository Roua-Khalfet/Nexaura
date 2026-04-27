"""Search candidates from local database instead of scraping."""

from typing import List
from asgiref.sync import sync_to_async
from agent.state import Candidate
from api.models import Candidate as CandidateModel


async def search_local_candidates(role_title: str, skills: List[str], limit: int = 10) -> List[Candidate]:
    """Search candidates from local database by role and skills.
    
    Args:
        role_title: The role title to match
        skills: List of required skills
        limit: Maximum number of candidates to return
        
    Returns:
        List of Candidate objects matching the criteria
    """
    from django.db.models import Q
    
    # Build query to find candidates with matching skills
    query = Q(availability_status='available')
    
    # Add skill filters (candidates who have at least one of the required skills)
    if skills:
        skill_query = Q()
        for skill in skills:
            skill_query |= Q(skills__contains=[skill])
        query &= skill_query
    
    # Get candidates from database (wrapped in sync_to_async)
    @sync_to_async
    def get_candidates():
        return list(CandidateModel.objects.filter(query).order_by('-created_at')[:limit * 2])
    
    db_candidates = await get_candidates()
    
    # Convert to Candidate state objects
    candidates = []
    for db_cand in db_candidates:
        # Calculate skill match score
        matched_skills = set(db_cand.skills) & set(skills)
        
        candidates.append(Candidate(
            name=db_cand.name,
            source='internal_db',
            profile_url=f'/hr/candidates/{db_cand.id}',
            skills=db_cand.skills,
            score=0.0,  # Will be calculated by scorer
            estimated_rate=None,
            matched_role=role_title,
        ))
    
    return candidates[:limit]


async def search_candidates_by_seniority(seniority: str, skills: List[str], limit: int = 10) -> List[Candidate]:
    """Search candidates by seniority level and skills.
    
    Args:
        seniority: junior, mid, senior, or lead
        skills: List of required skills
        limit: Maximum number of candidates to return
        
    Returns:
        List of Candidate objects
    """
    from django.db.models import Q
    
    query = Q(availability_status='available', seniority=seniority)
    
    if skills:
        skill_query = Q()
        for skill in skills:
            skill_query |= Q(skills__contains=[skill])
        query &= skill_query
    
    @sync_to_async
    def get_candidates():
        return list(CandidateModel.objects.filter(query).order_by('-created_at')[:limit])
    
    db_candidates = await get_candidates()
    
    candidates = []
    for db_cand in db_candidates:
        candidates.append(Candidate(
            name=db_cand.name,
            source='internal_db',
            profile_url=f'/hr/candidates/{db_cand.id}',
            skills=db_cand.skills,
            score=0.0,
            estimated_rate=None,
            matched_role='',
        ))
    
    return candidates


async def search_candidates_semantic(role_title: str, skills: List[str], seniority: str, limit: int = 10) -> List[Candidate]:
    """Search candidates using ChromaDB semantic search.
    
    Args:
        role_title: The role title
        skills: Required skills
        seniority: Seniority level
        limit: Maximum results
        
    Returns:
        List of Candidate objects with semantic scores
    """
    from db.vector_store import semantic_match_candidates
    
    try:
        # Use ChromaDB for semantic matching
        matches = semantic_match_candidates(role_title, skills, seniority, limit)
        
        candidates = []
        for match in matches:
            # Get full candidate data from DB (wrapped in sync_to_async)
            @sync_to_async
            def get_candidate(name):
                try:
                    # Use filter().first() instead of get() to handle multiple results
                    return CandidateModel.objects.filter(name=name).first()
                except Exception as e:
                    print(f"Error fetching candidate {name}: {e}")
                    return None
            
            db_cand = await get_candidate(match['name'])
            if db_cand:
                candidates.append(Candidate(
                    name=db_cand.name,
                    source='internal_db',
                    profile_url=f'/hr/candidates/{db_cand.id}',
                    skills=db_cand.skills,
                    score=match.get('semantic_score', 0.0),
                    estimated_rate=None,
                    matched_role=role_title,
                ))
        
        return candidates
    except Exception as e:
        print(f"Semantic search error: {e}")
        # Fallback to regular search
        return await search_local_candidates(role_title, skills, limit)
