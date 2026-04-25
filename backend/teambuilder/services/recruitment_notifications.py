"""Service for generating recruitment notifications."""

from datetime import timedelta
from django.utils import timezone
from asgiref.sync import sync_to_async


async def check_and_create_notifications(hr_user):
    """
    Check recruitment status and create notifications for HR user.
    
    Checks for:
    1. Candidates who haven't responded after 3 days
    2. Candidates who showed interest (new)
    3. Interviews coming up in next 24 hours
    4. Offers pending for more than 5 days
    5. Job deadlines approaching (7 days)
    6. Positions filled (congratulations)
    """
    from api.models_jobs import JobPosting, JobInvitation, RecruitmentNotification
    
    notifications_created = []
    
    @sync_to_async
    def create_notifications_sync():
        nonlocal notifications_created
        
        # 1. No response after 3 days
        three_days_ago = timezone.now() - timedelta(days=3)
        pending_invitations = JobInvitation.objects.filter(
            job_posting__hr_user=hr_user,
            status='invited',
            invited_at__lte=three_days_ago,
            responded_at__isnull=True
        ).select_related('candidate', 'job_posting')
        
        for invitation in pending_invitations:
            # Check if notification already exists
            existing = RecruitmentNotification.objects.filter(
                hr_user=hr_user,
                job_invitation=invitation,
                notification_type='no_response'
            ).exists()
            
            if not existing:
                notif = RecruitmentNotification.objects.create(
                    hr_user=hr_user,
                    job_posting=invitation.job_posting,
                    job_invitation=invitation,
                    notification_type='no_response',
                    title=f"No response from {invitation.candidate.name}",
                    message=f"{invitation.candidate.name} hasn't responded to the {invitation.job_posting.title} invitation for {invitation.days_pending} days."
                )
                notifications_created.append(notif)
        
        # 2. New interested candidates (last 24 hours)
        yesterday = timezone.now() - timedelta(days=1)
        new_interested = JobInvitation.objects.filter(
            job_posting__hr_user=hr_user,
            status='interested',
            responded_at__gte=yesterday
        ).select_related('candidate', 'job_posting')
        
        for invitation in new_interested:
            existing = RecruitmentNotification.objects.filter(
                hr_user=hr_user,
                job_invitation=invitation,
                notification_type='candidate_interested'
            ).exists()
            
            if not existing:
                notif = RecruitmentNotification.objects.create(
                    hr_user=hr_user,
                    job_posting=invitation.job_posting,
                    job_invitation=invitation,
                    notification_type='candidate_interested',
                    title=f"🎉 {invitation.candidate.name} is interested!",
                    message=f"{invitation.candidate.name} showed interest in the {invitation.job_posting.title} position."
                )
                notifications_created.append(notif)
        
        # 3. Upcoming interviews (next 24 hours)
        tomorrow = timezone.now() + timedelta(days=1)
        upcoming_interviews = JobInvitation.objects.filter(
            job_posting__hr_user=hr_user,
            status='interview_scheduled',
            interview_date__lte=tomorrow,
            interview_date__gte=timezone.now()
        ).select_related('candidate', 'job_posting')
        
        for invitation in upcoming_interviews:
            existing = RecruitmentNotification.objects.filter(
                hr_user=hr_user,
                job_invitation=invitation,
                notification_type='interview_reminder',
                created_at__gte=yesterday
            ).exists()
            
            if not existing:
                hours_until = (invitation.interview_date - timezone.now()).total_seconds() / 3600
                notif = RecruitmentNotification.objects.create(
                    hr_user=hr_user,
                    job_posting=invitation.job_posting,
                    job_invitation=invitation,
                    notification_type='interview_reminder',
                    title=f"Interview with {invitation.candidate.name} soon",
                    message=f"Interview for {invitation.job_posting.title} in {int(hours_until)} hours."
                )
                notifications_created.append(notif)
        
        # 4. Pending offers (more than 5 days)
        five_days_ago = timezone.now() - timedelta(days=5)
        pending_offers = JobInvitation.objects.filter(
            job_posting__hr_user=hr_user,
            status='offer_made',
            offer_date__lte=five_days_ago,
            decision_date__isnull=True
        ).select_related('candidate', 'job_posting')
        
        for invitation in pending_offers:
            existing = RecruitmentNotification.objects.filter(
                hr_user=hr_user,
                job_invitation=invitation,
                notification_type='offer_pending'
            ).exists()
            
            if not existing:
                days_pending = (timezone.now() - invitation.offer_date).days
                notif = RecruitmentNotification.objects.create(
                    hr_user=hr_user,
                    job_posting=invitation.job_posting,
                    job_invitation=invitation,
                    notification_type='offer_pending',
                    title=f"Offer pending: {invitation.candidate.name}",
                    message=f"Offer for {invitation.job_posting.title} has been pending for {days_pending} days."
                )
                notifications_created.append(notif)
        
        # 5. Job deadlines approaching (7 days)
        seven_days_ahead = timezone.now() + timedelta(days=7)
        approaching_deadlines = JobPosting.objects.filter(
            hr_user=hr_user,
            status='open',
            deadline__lte=seven_days_ahead,
            deadline__gte=timezone.now()
        )
        
        for job in approaching_deadlines:
            existing = RecruitmentNotification.objects.filter(
                hr_user=hr_user,
                job_posting=job,
                notification_type='deadline_approaching',
                created_at__gte=yesterday
            ).exists()
            
            if not existing:
                days_left = (job.deadline - timezone.now()).days
                notif = RecruitmentNotification.objects.create(
                    hr_user=hr_user,
                    job_posting=job,
                    notification_type='deadline_approaching',
                    title=f"Deadline approaching: {job.title}",
                    message=f"Only {days_left} days left to fill the {job.title} position."
                )
                notifications_created.append(notif)
        
        # 6. Recently filled positions (last 24 hours)
        recently_filled = JobPosting.objects.filter(
            hr_user=hr_user,
            status='filled',
            filled_at__gte=yesterday
        ).select_related('filled_by')
        
        for job in recently_filled:
            existing = RecruitmentNotification.objects.filter(
                hr_user=hr_user,
                job_posting=job,
                notification_type='position_filled'
            ).exists()
            
            if not existing:
                notif = RecruitmentNotification.objects.create(
                    hr_user=hr_user,
                    job_posting=job,
                    notification_type='position_filled',
                    title=f"✅ Position filled: {job.title}",
                    message=f"Congratulations! {job.filled_by.name} has been hired for the {job.title} position."
                )
                notifications_created.append(notif)
        
        return len(notifications_created)
    
    count = await create_notifications_sync()
    return {
        'notifications_created': count,
        'message': f'Created {count} new notification(s)'
    }


async def get_unread_notifications(hr_user, limit=50):
    """Get unread notifications for HR user."""
    from api.models_jobs import RecruitmentNotification
    from asgiref.sync import sync_to_async
    
    @sync_to_async
    def get_notifications_sync():
        notifications = RecruitmentNotification.objects.filter(
            hr_user=hr_user,
            is_read=False
        ).select_related('job_posting', 'job_invitation__candidate')[:limit]
        
        return list(notifications.values(
            'id', 'notification_type', 'title', 'message', 
            'created_at', 'job_posting__title', 
            'job_invitation__candidate__name'
        ))
    
    return await get_notifications_sync()


async def mark_notification_read(notification_id, hr_user):
    """Mark a notification as read."""
    from api.models_jobs import RecruitmentNotification
    from asgiref.sync import sync_to_async
    
    @sync_to_async
    def mark_read_sync():
        try:
            notification = RecruitmentNotification.objects.get(
                id=notification_id,
                hr_user=hr_user
            )
            notification.mark_as_read()
            return True
        except RecruitmentNotification.DoesNotExist:
            return False
    
    return await mark_read_sync()
