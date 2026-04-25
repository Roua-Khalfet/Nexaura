"""
Job Creator Agent - Automatically creates job postings from Build Team results.

This agent runs when:
1. Build Team agent completes → Auto-creates job postings from recommended roles
2. A2A Integration: team_builder → job_creator
"""

import logging
from typing import Dict, List
from asgiref.sync import sync_to_async
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


async def create_jobs_from_team_build(a2a_payload: Dict, hr_user, session_id: str = None) -> Dict:
    """
    Create job postings from Build Team A2A payload.
    
    Args:
        a2a_payload: The a2a_payload from team_builder agent
        hr_user: HRUser instance who initiated the build
        session_id: Optional session ID for tracking
        
    Returns:
        dict with created jobs and statistics
    """
    from api.models_jobs import JobPosting
    from api.models import UserSession
    
    @sync_to_async
    def create_jobs_sync():
        required_roles = a2a_payload.get('required_roles', [])
        currency = a2a_payload.get('currency', 'TND')
        
        created_jobs = []
        skipped_jobs = []
        
        # Get session if provided
        session = None
        if session_id:
            try:
                session = UserSession.objects.get(id=session_id)
            except UserSession.DoesNotExist:
                pass
        
        for role in required_roles:
            title = role.get('title')
            seniority = role.get('seniority', 'mid')
            
            # Check if job already exists (avoid duplicates)
            existing = JobPosting.objects.filter(
                hr_user=hr_user,
                title=title,
                seniority=seniority,
                status='open'
            ).exists()
            
            if existing:
                skipped_jobs.append({
                    'title': title,
                    'reason': 'Already exists'
                })
                continue
            
            # Extract salary range
            salary_min = role.get('estimated_annual_cost_min')
            salary_max = role.get('estimated_annual_cost_max')
            
            # Build description from role data
            description = f"""Position: {title}
Seniority Level: {seniority.capitalize()}
Employment Type: {role.get('employment_type', 'fulltime').capitalize()}
Priority: {role.get('priority', 'important').capitalize()}

Estimated Salary Range: {salary_min:,} - {salary_max:,} {currency}/year

This position was identified as part of your team building requirements.
"""
            
            # Set deadline (30 days from now for critical, 60 for others)
            days_to_deadline = 30 if role.get('priority') == 'critical' else 60
            deadline = datetime.now() + timedelta(days=days_to_deadline)
            
            # Create job posting
            job = JobPosting.objects.create(
                hr_user=hr_user,
                session=session,
                title=title,
                seniority=seniority,
                description=description,
                required_skills=[],  # Will be populated by matching agent
                salary_min=salary_min,
                salary_max=salary_max,
                location='Remote',  # Default, can be updated
                status='open',
                deadline=deadline
            )
            
            created_jobs.append({
                'id': str(job.id),
                'title': job.title,
                'seniority': job.seniority,
                'salary_range': f"{salary_min:,}-{salary_max:,} {currency}",
                'deadline': job.deadline.isoformat(),
                'priority': role.get('priority')
            })
            
            logger.info(f"✅ Created job: {title} ({seniority})")
        
        return {
            'created': created_jobs,
            'skipped': skipped_jobs,
            'total_created': len(created_jobs),
            'total_skipped': len(skipped_jobs)
        }
    
    return await create_jobs_sync()


async def auto_match_jobs_to_candidates(job_ids: List[str]) -> Dict:
    """
    Automatically match newly created jobs to existing candidates.
    
    Args:
        job_ids: List of job IDs to match
        
    Returns:
        dict with matching statistics
    """
    from services.job_matcher_agent import match_job_to_candidates
    
    total_matches = 0
    results = []
    
    for job_id in job_ids:
        matches = await match_job_to_candidates(job_id)
        total_matches += len(matches)
        results.append({
            'job_id': job_id,
            'matches_found': len(matches)
        })
    
    return {
        'jobs_matched': len(job_ids),
        'total_matches': total_matches,
        'results': results
    }
