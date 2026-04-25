"""Authentication models for ComplianceGuard."""

from django.db import models
import uuid


class ComplianceUser(models.Model):
    """User with Google OAuth credentials for ComplianceGuard."""
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
        db_table = 'compliance_users'

    def __str__(self):
        return f"{self.name} ({self.email})"
