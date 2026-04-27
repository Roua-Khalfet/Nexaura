from django.urls import path
from api import views

urlpatterns = [
    path("health", views.health, name="health"),
    path("api/v1/health", views.health, name="health_v1"),
    path("api/v1/stats", views.get_stats, name="stats"),
    path("api/v1/salaries", views.list_salaries, name="salaries"),
    path("api/v1/sessions", views.list_sessions, name="sessions"),
    path("api/v1/sessions/<str:session_id>", views.delete_session, name="delete_session"),
    path("api/v1/team-builder", views.team_builder, name="team_builder"),
    path("api/v1/admin/update-salaries", views.update_salaries, name="update_salaries"),
    
    # CV & Candidate Management
    path("api/v1/hr/upload-cv", views.upload_cv, name="upload_cv"),
    path("api/v1/hr/candidates", views.list_candidates, name="list_candidates"),
    path("api/v1/hr/candidates/<str:candidate_id>", views.get_candidate_detail, name="get_candidate_detail"),
    path("api/v1/hr/candidates/<str:candidate_id>/notes", views.update_candidate_notes, name="update_candidate_notes"),
    path("api/v1/hr/invite-candidate", views.invite_candidate, name="invite_candidate"),
    path("api/v1/hr/candidates/<str:candidate_id>/delete", views.delete_candidate, name="delete_candidate"),
    
    # Candidate Response
    path("api/v1/candidate/respond/<str:token>", views.candidate_respond, name="candidate_respond"),
    
    # Google OAuth2
    path("api/v1/auth/google/login", views.google_login, name="google_login"),
    path("api/v1/auth/google/callback", views.google_callback, name="google_callback"),
    path("api/v1/auth/user", views.get_current_user, name="get_current_user"),
    path("api/v1/auth/logout", views.google_logout, name="google_logout"),
    
    # Gmail Monitoring
    path("api/v1/gmail/sync-responses", views.sync_gmail_responses, name="sync_gmail_responses"),
    path("api/v1/gmail/check-access", views.check_gmail_access, name="check_gmail_access"),
    
    # Job Postings & Recruitment
    path("api/v1/jobs", views.list_jobs, name="list_jobs"),
    path("api/v1/jobs/create", views.create_job, name="create_job"),
    path("api/v1/jobs/<str:job_id>", views.get_job_detail, name="get_job_detail"),
    path("api/v1/jobs/<str:job_id>/update", views.update_job, name="update_job"),
    path("api/v1/jobs/<str:job_id>/invite", views.invite_to_job, name="invite_to_job"),
    path("api/v1/invitations/<str:invitation_id>/update", views.update_invitation_status, name="update_invitation_status"),
    path("api/v1/notifications", views.get_notifications, name="get_notifications"),
    path("api/v1/notifications/check", views.check_notifications, name="check_notifications"),
    path("api/v1/notifications/<str:notification_id>/read", views.mark_notification_read, name="mark_notification_read"),
    
    # AI Job Matching
    path("api/v1/matches", views.get_matches, name="get_matches"),
    path("api/v1/matches/trigger", views.trigger_matching, name="trigger_matching"),
    path("api/v1/matches/<str:match_id>/status", views.update_match_status, name="update_match_status"),
    
    # Natural Language Query Parsing
    path("api/v1/parse-salary-query", views.parse_salary_query, name="parse_salary_query"),
    path("api/v1/parse-candidate-query", views.parse_candidate_query, name="parse_candidate_query"),
    path("api/v1/salary-lookup", views.salary_lookup, name="salary_lookup"),
]
