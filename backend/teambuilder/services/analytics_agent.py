"""
Analytics Agent - Tracks and analyzes recruitment metrics.

This agent runs when:
1. Job status changes → Records lifecycle event
2. Candidate responds → Updates response metrics
3. Dashboard loads → Provides real-time analytics
"""

import logging
from typing import Dict, List
from datetime import datetime, timedelta
from django.utils import timezone
from asgiref.sync import sync_to_async

logger = logging.getLogger(__name__)


async def track_job_lifecycle_event(job_id: str, event_type: str, metadata: Dict = None) -> bool:
    """
    Track a job lifecycle event for analytics.
    
    Event types:
    - job_created
    - job_opened
    - job_filled
    - job_closed
    - candidate_invited
    - candidate_responded
    - interview_scheduled
    - offer_made
    - offer_accepted
    - offer_rejected
    
    Args:
        job_id: UUID of the job posting
        event_type: Type of event
        metadata: Additional event data
        
    Returns:
        True if event was recorded
    """
    from api.models import JobLifecycleEvent
    
    @sync_to_async
    def record_event():
        try:
            from api.models_jobs import JobPosting
            job = JobPosting.objects.get(id=job_id)
            
            event = JobLifecycleEvent.objects.create(
                job_posting=job,
                hr_user=job.hr_user,
                event_type=event_type,
                metadata=metadata or {},
                timestamp=timezone.now()
            )
            
            logger.info(f"📊 Analytics: {event_type} for job {job.title}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to track event: {e}")
            return False
    
    return await record_event()


async def get_recruitment_metrics(hr_user, days: int = 30) -> Dict:
    """
    Get comprehensive recruitment metrics for HR user.
    
    Args:
        hr_user: HRUser instance
        days: Number of days to analyze (default: 30)
        
    Returns:
        dict with metrics
    """
    from api.models_jobs import JobPosting, JobInvitation
    from api.models import Candidate
    from django.db.models import Count, Avg, Q
    
    @sync_to_async
    def calculate_metrics():
        cutoff_date = timezone.now() - timedelta(days=days)
        
        # Job metrics
        jobs = JobPosting.objects.filter(hr_user=hr_user, created_at__gte=cutoff_date)
        total_jobs = jobs.count()
        open_jobs = jobs.filter(status='open').count()
        filled_jobs = jobs.filter(status='filled').count()
        
        # Time to fill (average days from created to filled)
        filled_jobs_with_time = jobs.filter(status='filled', filled_at__isnull=False)
        time_to_fill_list = []
        for job in filled_jobs_with_time:
            days_to_fill = (job.filled_at - job.created_at).days
            time_to_fill_list.append(days_to_fill)
        
        avg_time_to_fill = sum(time_to_fill_list) / len(time_to_fill_list) if time_to_fill_list else 0
        
        # Candidate metrics
        invitations = JobInvitation.objects.filter(
            job_posting__hr_user=hr_user,
            invited_at__gte=cutoff_date
        )
        total_invitations = invitations.count()
        interested_count = invitations.filter(status='interested').count()
        not_interested_count = invitations.filter(status='not_interested').count()
        
        # Response rate
        responded = invitations.filter(responded_at__isnull=False).count()
        response_rate = (responded / total_invitations * 100) if total_invitations > 0 else 0
        
        # Interest rate (of those who responded)
        interest_rate = (interested_count / responded * 100) if responded > 0 else 0
        
        # Average response time (days)
        responded_invitations = invitations.filter(responded_at__isnull=False)
        response_times = []
        for inv in responded_invitations:
            response_time = (inv.responded_at - inv.invited_at).total_seconds() / 86400
            response_times.append(response_time)
        
        avg_response_time = sum(response_times) / len(response_times) if response_times else 0
        
        # Conversion funnel
        interview_scheduled = invitations.filter(status='interview_scheduled').count()
        offers_made = invitations.filter(status='offer_made').count()
        offers_accepted = invitations.filter(status='accepted').count()
        
        # Top performing jobs (by interest rate)
        job_performance = []
        for job in jobs:
            job_invitations = job.invitations.all()
            if job_invitations.count() > 0:
                job_interested = job_invitations.filter(status='interested').count()
                job_interest_rate = (job_interested / job_invitations.count() * 100)
                job_performance.append({
                    'job_id': str(job.id),
                    'title': job.title,
                    'invitations': job_invitations.count(),
                    'interested': job_interested,
                    'interest_rate': round(job_interest_rate, 1)
                })
        
        job_performance.sort(key=lambda x: x['interest_rate'], reverse=True)
        
        return {
            'period_days': days,
            'jobs': {
                'total': total_jobs,
                'open': open_jobs,
                'filled': filled_jobs,
                'fill_rate': round((filled_jobs / total_jobs * 100) if total_jobs > 0 else 0, 1),
                'avg_time_to_fill_days': round(avg_time_to_fill, 1)
            },
            'candidates': {
                'total_invitations': total_invitations,
                'interested': interested_count,
                'not_interested': not_interested_count,
                'pending': total_invitations - responded,
                'response_rate': round(response_rate, 1),
                'interest_rate': round(interest_rate, 1),
                'avg_response_time_days': round(avg_response_time, 1)
            },
            'funnel': {
                'invited': total_invitations,
                'interested': interested_count,
                'interview_scheduled': interview_scheduled,
                'offers_made': offers_made,
                'offers_accepted': offers_accepted,
                'conversion_rate': round((offers_accepted / total_invitations * 100) if total_invitations > 0 else 0, 1)
            },
            'top_jobs': job_performance[:5]
        }
    
    return await calculate_metrics()


async def get_real_time_dashboard_stats(hr_user) -> Dict:
    """
    Get real-time statistics for dashboard display.
    
    Args:
        hr_user: HRUser instance
        
    Returns:
        dict with current stats
    """
    from api.models_jobs import JobPosting, JobInvitation, RecruitmentNotification
    from api.models import Candidate
    
    @sync_to_async
    def get_stats():
        # Current state
        total_jobs = JobPosting.objects.filter(hr_user=hr_user).count()
        open_jobs = JobPosting.objects.filter(hr_user=hr_user, status='open').count()
        filled_jobs = JobPosting.objects.filter(hr_user=hr_user, status='filled').count()
        
        total_candidates = Candidate.objects.filter(hr_user=hr_user).count()
        available_candidates = Candidate.objects.filter(
            hr_user=hr_user,
            availability_status='available'
        ).count()
        
        # Pending actions
        pending_responses = JobInvitation.objects.filter(
            job_posting__hr_user=hr_user,
            status='invited',
            responded_at__isnull=True
        ).count()
        
        unread_notifications = RecruitmentNotification.objects.filter(
            hr_user=hr_user,
            is_read=False
        ).count()
        
        # Recent activity (last 7 days)
        seven_days_ago = timezone.now() - timedelta(days=7)
        recent_jobs = JobPosting.objects.filter(
            hr_user=hr_user,
            created_at__gte=seven_days_ago
        ).count()
        
        recent_candidates = Candidate.objects.filter(
            hr_user=hr_user,
            created_at__gte=seven_days_ago
        ).count()
        
        recent_interested = JobInvitation.objects.filter(
            job_posting__hr_user=hr_user,
            status='interested',
            responded_at__gte=seven_days_ago
        ).count()
        
        return {
            'jobs': {
                'total': total_jobs,
                'open': open_jobs,
                'filled': filled_jobs,
                'recent_7d': recent_jobs
            },
            'candidates': {
                'total': total_candidates,
                'available': available_candidates,
                'recent_7d': recent_candidates
            },
            'pending': {
                'responses': pending_responses,
                'notifications': unread_notifications
            },
            'activity': {
                'recent_interested_7d': recent_interested
            },
            'timestamp': timezone.now().isoformat()
        }
    
    return await get_stats()
