"""Job posting and recruitment pipeline models."""

from django.db import models
import uuid
from datetime import timedelta
from django.utils import timezone


class JobPosting(models.Model):
    """
    Represents an open job position.
    
    Status flow:
    - open: Actively recruiting
    - filled: Position has been filled
    - closed: Position closed without filling
    - on_hold: Temporarily paused
    """
    
    STATUS_CHOICES = [
        ('open', 'Open'),
        ('filled', 'Filled'),
        ('closed', 'Closed'),
        ('on_hold', 'On Hold'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hr_user = models.ForeignKey('HRUser', on_delete=models.CASCADE, related_name='job_postings')
    session = models.ForeignKey('UserSession', on_delete=models.SET_NULL, null=True, blank=True, related_name='job_postings')
    
    # Job details
    title = models.CharField(max_length=200)
    seniority = models.CharField(max_length=20)
    description = models.TextField(null=True, blank=True)
    required_skills = models.JSONField(default=list)
    salary_min = models.IntegerField(null=True, blank=True)
    salary_max = models.IntegerField(null=True, blank=True)
    location = models.CharField(max_length=100, null=True, blank=True)
    
    # Status tracking
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    filled_by = models.ForeignKey('Candidate', on_delete=models.SET_NULL, null=True, blank=True, related_name='filled_positions')
    filled_at = models.DateTimeField(null=True, blank=True)
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deadline = models.DateTimeField(null=True, blank=True)  # Hiring deadline
    
    class Meta:
        db_table = 'job_postings'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.title} ({self.seniority}) - {self.status}"
    
    @property
    def days_open(self):
        """Number of days since job was posted."""
        if self.status == 'filled' and self.filled_at:
            delta = self.filled_at - self.created_at
        else:
            delta = timezone.now() - self.created_at
        return delta.days
    
    @property
    def is_overdue(self):
        """Check if job is past deadline."""
        if self.deadline and self.status == 'open':
            return timezone.now() > self.deadline
        return False
    
    @property
    def candidates_count(self):
        """Total candidates invited for this job."""
        return self.invitations.count()
    
    @property
    def interested_count(self):
        """Candidates who showed interest."""
        return self.invitations.filter(status='interested').count()


class JobInvitation(models.Model):
    """
    Links candidates to job postings with their recruitment status.
    Replaces/extends CandidateNotification with job-specific tracking.
    """
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    job_posting = models.ForeignKey(JobPosting, on_delete=models.CASCADE, related_name='invitations')
    candidate = models.ForeignKey('Candidate', on_delete=models.CASCADE, related_name='job_invitations')
    notification = models.OneToOneField('CandidateNotification', on_delete=models.SET_NULL, null=True, blank=True, related_name='job_invitation')
    
    # Current status in recruitment pipeline
    status = models.CharField(
        max_length=20,
        default='invited',
        choices=[
            ('invited', 'Invited'),
            ('interested', 'Interested'),
            ('not_interested', 'Not Interested'),
            ('interview_scheduled', 'Interview Scheduled'),
            ('interviewed', 'Interviewed'),
            ('offer_made', 'Offer Made'),
            ('accepted', 'Accepted Offer'),
            ('rejected', 'Rejected'),
            ('withdrawn', 'Candidate Withdrew'),
        ]
    )
    
    # Timeline tracking
    invited_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)
    interview_date = models.DateTimeField(null=True, blank=True)
    offer_date = models.DateTimeField(null=True, blank=True)
    decision_date = models.DateTimeField(null=True, blank=True)
    
    # Notes
    hr_notes = models.TextField(null=True, blank=True)
    
    class Meta:
        db_table = 'job_invitations'
        unique_together = ('job_posting', 'candidate')
        ordering = ['-invited_at']
    
    def __str__(self):
        return f"{self.candidate.name} → {self.job_posting.title} ({self.status})"
    
    @property
    def days_pending(self):
        """Days since invitation without response."""
        if self.responded_at:
            return 0
        delta = timezone.now() - self.invited_at
        return delta.days


class RecruitmentNotification(models.Model):
    """
    System notifications for HR users about recruitment events.
    
    Types:
    - candidate_interested: Candidate showed interest
    - no_response: No response after X days
    - interview_reminder: Interview coming up
    - offer_pending: Offer made, awaiting response
    - position_filled: Job successfully filled
    - deadline_approaching: Job deadline in X days
    """
    
    NOTIFICATION_TYPES = [
        ('candidate_interested', 'Candidate Interested'),
        ('no_response', 'No Response'),
        ('interview_reminder', 'Interview Reminder'),
        ('offer_pending', 'Offer Pending'),
        ('position_filled', 'Position Filled'),
        ('deadline_approaching', 'Deadline Approaching'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hr_user = models.ForeignKey('HRUser', on_delete=models.CASCADE, related_name='notifications')
    job_posting = models.ForeignKey(JobPosting, on_delete=models.CASCADE, null=True, blank=True)
    job_invitation = models.ForeignKey(JobInvitation, on_delete=models.CASCADE, null=True, blank=True)
    
    notification_type = models.CharField(max_length=30, choices=NOTIFICATION_TYPES)
    title = models.CharField(max_length=200)
    message = models.TextField()
    
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        db_table = 'recruitment_notifications'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.notification_type} - {self.title}"
    
    def mark_as_read(self):
        """Mark notification as read."""
        if not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            self.save()



class JobLifecycleEvent(models.Model):
    """
    Tracks all lifecycle events for jobs for analytics.
    
    Event types:
    - job_created, job_opened, job_filled, job_closed, job_on_hold
    - candidate_invited, candidate_responded, interview_scheduled
    - offer_made, offer_accepted, offer_rejected
    """
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    job_posting = models.ForeignKey(JobPosting, on_delete=models.CASCADE, related_name='lifecycle_events')
    hr_user = models.ForeignKey('HRUser', on_delete=models.CASCADE, related_name='job_events')
    
    event_type = models.CharField(max_length=50)
    metadata = models.JSONField(default=dict)  # Additional event data
    timestamp = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'job_lifecycle_events'
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['job_posting', '-timestamp']),
            models.Index(fields=['hr_user', '-timestamp']),
            models.Index(fields=['event_type', '-timestamp']),
        ]
    
    def __str__(self):
        return f"{self.event_type} - {self.job_posting.title} @ {self.timestamp}"
