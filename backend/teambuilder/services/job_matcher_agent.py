"""
Job Matcher Agent - Automatically matches candidates to open positions.

This agent runs when:
1. A new CV is uploaded → Matches candidate to all open jobs
2. A new job is posted → Matches all candidates to the job
3. Manual trigger → Re-score all candidates for a specific job
"""

import os
from typing import List, Dict, Optional
from datetime import datetime
from asgiref.sync import sync_to_async


def calculate_skill_match_score(candidate_skills: List[str], required_skills: List[str]) -> float:
    """Calculate skill match percentage."""
    if not required_skills:
        return 0.5  # Neutral score if no requirements
    
    candidate_skills_lower = [s.lower().strip() for s in candidate_skills]
    required_skills_lower = [s.lower().strip() for s in required_skills]
    
    matches = sum(1 for req in required_skills_lower 
                  if any(req in cand or cand in req for cand in candidate_skills_lower))
    
    return matches / len(required_skills_lower) if required_skills_lower else 0


def calculate_seniority_match(candidate_seniority: str, job_seniority: str) -> float:
    """Calculate seniority match score."""
    seniority_levels = {'junior': 1, 'mid': 2, 'senior': 3, 'lead': 4}
    
    cand_level = seniority_levels.get(candidate_seniority.lower(), 2)
    job_level = seniority_levels.get(job_seniority.lower(), 2)
    
    # Exact match = 1.0, one level off = 0.7, two+ levels = 0.3
    diff = abs(cand_level - job_level)
    if diff == 0:
        return 1.0
    elif diff == 1:
        return 0.7
    else:
        return 0.3


def calculate_match_score(candidate: Dict, job: Dict) -> Dict:
    """
    Calculate overall match score between candidate and job.
    
    Returns:
        dict with score, matching_skills, missing_skills, seniority_match
    """
    # Skill match (70% weight)
    candidate_skills = candidate.get('skills', [])
    required_skills = job.get('required_skills', [])
    skill_score = calculate_skill_match_score(candidate_skills, required_skills)
    
    # Seniority match (30% weight)
    seniority_score = calculate_seniority_match(
        candidate.get('seniority', 'mid'),
        job.get('seniority', 'mid')
    )
    
    # Overall score
    overall_score = (skill_score * 0.7) + (seniority_score * 0.3)
    
    # Find matching and missing skills
    candidate_skills_lower = [s.lower().strip() for s in candidate_skills]
    required_skills_lower = [s.lower().strip() for s in required_skills]
    
    matching_skills = [req for req in required_skills 
                      if any(req.lower() in cand or cand in req.lower() 
                            for cand in candidate_skills_lower)]
    
    missing_skills = [req for req in required_skills 
                     if not any(req.lower() in cand or cand in req.lower() 
                               for cand in candidate_skills_lower)]
    
    return {
        'score': round(overall_score, 2),
        'skill_match': round(skill_score, 2),
        'seniority_match': round(seniority_score, 2),
        'matching_skills': matching_skills,
        'missing_skills': missing_skills,
        'matched_at': datetime.utcnow().isoformat()
    }


async def match_candidate_to_jobs(candidate_id: str) -> List[Dict]:
    """
    Match a single candidate to all open jobs.
    
    Args:
        candidate_id: UUID of the candidate
        
    Returns:
        List of job matches with scores
    """
    from api.models import Candidate, JobPosting, CandidateJobMatch
    
    @sync_to_async
    def get_matches():
        try:
            candidate = Candidate.objects.get(id=candidate_id)
            open_jobs = JobPosting.objects.filter(status='open')
            
            matches = []
            for job in open_jobs:
                # Calculate match score
                match_data = calculate_match_score(
                    {
                        'skills': candidate.skills or [],
                        'seniority': candidate.seniority or 'mid'
                    },
                    {
                        'required_skills': job.required_skills or [],
                        'seniority': job.seniority or 'mid'
                    }
                )
                
                # Only save high-quality matches (score > 0.5)
                if match_data['score'] >= 0.5:
                    # Create or update match record
                    match, created = CandidateJobMatch.objects.update_or_create(
                        candidate=candidate,
                        job_posting=job,
                        defaults={
                            'match_score': match_data['score'],
                            'skill_match_score': match_data['skill_match'],
                            'seniority_match_score': match_data['seniority_match'],
                            'matching_skills': match_data['matching_skills'],
                            'missing_skills': match_data['missing_skills'],
                            'status': 'pending'
                        }
                    )
                    
                    matches.append({
                        'match_id': str(match.id),
                        'job_id': str(job.id),
                        'job_title': job.title,
                        'score': match_data['score'],
                        'matching_skills': match_data['matching_skills'],
                        'missing_skills': match_data['missing_skills'],
                        'created': created
                    })
            
            print(f"✅ Matched candidate {candidate.name} to {len(matches)} jobs")
            return matches
            
        except Candidate.DoesNotExist:
            print(f"❌ Candidate {candidate_id} not found")
            return []
        except Exception as e:
            print(f"❌ Error matching candidate: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    return await get_matches()


async def match_job_to_candidates(job_id: str) -> List[Dict]:
    """
    Match a single job to all candidates in the pool.
    
    Args:
        job_id: UUID of the job posting
        
    Returns:
        List of candidate matches with scores
    """
    from api.models import Candidate, JobPosting, CandidateJobMatch
    
    @sync_to_async
    def get_matches():
        try:
            job = JobPosting.objects.get(id=job_id)
            candidates = Candidate.objects.all()
            
            matches = []
            for candidate in candidates:
                # Calculate match score
                match_data = calculate_match_score(
                    {
                        'skills': candidate.skills or [],
                        'seniority': candidate.seniority or 'mid'
                    },
                    {
                        'required_skills': job.required_skills or [],
                        'seniority': job.seniority or 'mid'
                    }
                )
                
                # Only save high-quality matches (score > 0.5)
                if match_data['score'] >= 0.5:
                    # Create or update match record
                    match, created = CandidateJobMatch.objects.update_or_create(
                        candidate=candidate,
                        job_posting=job,
                        defaults={
                            'match_score': match_data['score'],
                            'skill_match_score': match_data['skill_match'],
                            'seniority_match_score': match_data['seniority_match'],
                            'matching_skills': match_data['matching_skills'],
                            'missing_skills': match_data['missing_skills'],
                            'status': 'pending'
                        }
                    )
                    
                    matches.append({
                        'match_id': str(match.id),
                        'candidate_id': str(candidate.id),
                        'candidate_name': candidate.name,
                        'score': match_data['score'],
                        'matching_skills': match_data['matching_skills'],
                        'missing_skills': match_data['missing_skills'],
                        'created': created
                    })
            
            # Sort by score descending
            matches.sort(key=lambda x: x['score'], reverse=True)
            
            print(f"✅ Matched job '{job.title}' to {len(matches)} candidates")
            return matches
            
        except JobPosting.DoesNotExist:
            print(f"❌ Job {job_id} not found")
            return []
        except Exception as e:
            print(f"❌ Error matching job: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    return await get_matches()


async def rematch_all() -> Dict:
    """
    Re-calculate all matches between candidates and jobs.
    Useful for: Algorithm updates, bulk re-scoring, data cleanup.
    
    Returns:
        Summary statistics
    """
    from api.models import Candidate, JobPosting
    
    @sync_to_async
    def get_counts():
        return {
            'candidates': Candidate.objects.count(),
            'jobs': JobPosting.objects.filter(status='open').count()
        }
    
    counts = await get_counts()
    
    # Match all candidates to all jobs
    candidates = await sync_to_async(list)(Candidate.objects.all())
    total_matches = 0
    
    for candidate in candidates:
        matches = await match_candidate_to_jobs(str(candidate.id))
        total_matches += len(matches)
    
    return {
        'candidates_processed': counts['candidates'],
        'open_jobs': counts['jobs'],
        'matches_created': total_matches,
        'timestamp': datetime.utcnow().isoformat()
    }
