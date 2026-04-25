from django.db import models
import uuid
from django.contrib.auth.models import User

class SalaryRate(models.Model):
    role_title = models.CharField(max_length=100)
    seniority = models.CharField(max_length=20)
    region = models.CharField(max_length=10)
    currency = models.CharField(max_length=10)
    annual_min = models.IntegerField()
    annual_max = models.IntegerField()
    hourly_min = models.IntegerField(null=True, blank=True)
    hourly_max = models.IntegerField(null=True, blank=True)
    source = models.CharField(max_length=200, null=True, blank=True)
    last_updated = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'salary_rates'
        unique_together = ('role_title', 'seniority', 'region')

class SalaryHistory(models.Model):
    role_title = models.CharField(max_length=100)
    seniority = models.CharField(max_length=20)
    region = models.CharField(max_length=10)
    annual_min = models.IntegerField(null=True, blank=True)
    annual_max = models.IntegerField(null=True, blank=True)
    source_url = models.TextField(null=True, blank=True)
    scraped_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'salary_history'

class UserSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hr_user = models.ForeignKey('HRUser', on_delete=models.CASCADE, related_name='sessions', null=True, blank=True)
    raw_input = models.TextField()
    region = models.CharField(max_length=10, default='TN')
    a2a_payload = models.JSONField(null=True, blank=True)
    full_result = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'sessions'

class Candidate(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hr_user = models.ForeignKey('HRUser', on_delete=models.CASCADE, related_name='candidates', null=True, blank=True)
    name = models.CharField(max_length=200)
    email = models.EmailField(max_length=200, null=True, blank=True)
    phone = models.CharField(max_length=50, null=True, blank=True)
    skills = models.JSONField(default=list)
    experience_years = models.IntegerField(null=True, blank=True)
    seniority = models.CharField(max_length=20, null=True, blank=True)
    education = models.TextField(null=True, blank=True)
    cv_text = models.TextField(null=True, blank=True)
    cv_file_path = models.CharField(max_length=500, null=True, blank=True)
    consent_given = models.BooleanField(default=False)
    consent_date = models.DateTimeField(null=True, blank=True)
    availability_status = models.CharField(max_length=20, default='available')
    preferred_contact = models.CharField(max_length=20, default='email')
    notification_consent = models.BooleanField(default=True)
    notes = models.TextField(null=True, blank=True)  # HR private notes
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'candidates'

    def __str__(self):
        return f"{self.name} - {self.seniority or 'Unknown'}"
    
    @property
    def invitation_status(self):
        """Get the latest invitation status for this candidate."""
        latest = self.notifications.order_by('-sent_at').first()
        if not latest:
            return 'not_invited'
        return latest.status

class CandidateNotification(models.Model):
    """
    Tracks invitations sent to candidates and their responses.
    
    Status flow:
    - pending: Invitation sent, awaiting response
    - interested: Candidate expressed interest (replied positively)
    - not_interested: Candidate declined
    - interview_scheduled: Interview has been scheduled
    - interviewed: Interview completed
    - offer_made: Job offer extended
    - hired: Candidate accepted offer and hired
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    candidate = models.ForeignKey(Candidate, on_delete=models.CASCADE, related_name='notifications')
    session = models.ForeignKey(UserSession, on_delete=models.SET_NULL, null=True, blank=True)
    role_title = models.CharField(max_length=200)
    notification_type = models.CharField(max_length=20)  # email or whatsapp
    sent_to_email = models.EmailField(max_length=200, null=True, blank=True)  # Actual email used (may differ from candidate.email)
    sent_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(
        max_length=20, 
        default='pending',
        choices=[
            ('pending', 'Pending Response'),
            ('interested', 'Interested'),
            ('not_interested', 'Not Interested'),
            ('interview_scheduled', 'Interview Scheduled'),
            ('interviewed', 'Interviewed'),
            ('offer_made', 'Offer Made'),
            ('hired', 'Hired'),
        ]
    )
    response_token = models.CharField(max_length=100, unique=True)
    responded_at = models.DateTimeField(null=True, blank=True)
    message = models.TextField(null=True, blank=True)

    class Meta:
        db_table = 'candidate_notifications'

    def __str__(self):
        return f"{self.candidate.name} - {self.role_title} - {self.status}"

class HRUser(models.Model):
    """HR User with Google OAuth credentials for sending emails."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    name = models.CharField(max_length=200)
    google_id = models.CharField(max_length=200, unique=True)
    access_token = models.TextField(null=True, blank=True)
    refresh_token = models.TextField(null=True, blank=True)
    token_expiry = models.DateTimeField(null=True, blank=True)
    profile_picture = models.URLField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_login = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'hr_users'

    def __str__(self):
        return f"{self.name} ({self.email})"


# Import job-related models
from api.models_jobs import JobPosting, JobInvitation, RecruitmentNotification


class CandidateJobMatch(models.Model):
    """
    AI-generated matches between candidates and job postings.
    Created automatically by the Job Matcher Agent.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    candidate = models.ForeignKey(Candidate, on_delete=models.CASCADE, related_name='job_matches')
    job_posting = models.ForeignKey('JobPosting', on_delete=models.CASCADE, related_name='candidate_matches')
    
    # Match scores
    match_score = models.FloatField()  # Overall score (0-1)
    skill_match_score = models.FloatField()  # Skill match component
    seniority_match_score = models.FloatField()  # Seniority match component
    
    # Match details
    matching_skills = models.JSONField(default=list)  # Skills that match
    missing_skills = models.JSONField(default=list)  # Skills candidate lacks
    
    # Status tracking
    status = models.CharField(
        max_length=20,
        default='pending',
        choices=[
            ('pending', 'Pending Review'),
            ('reviewed', 'Reviewed by HR'),
            ('contacted', 'Candidate Contacted'),
            ('rejected', 'Not a Fit'),
            ('hired', 'Hired'),
        ]
    )
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    
    # HR notes
    hr_notes = models.TextField(null=True, blank=True)
    
    class Meta:
        db_table = 'candidate_job_matches'
        unique_together = ('candidate', 'job_posting')
        ordering = ['-match_score', '-created_at']
    
    def __str__(self):
        return f"{self.candidate.name} → {self.job_posting.title} ({self.match_score:.0%})"

