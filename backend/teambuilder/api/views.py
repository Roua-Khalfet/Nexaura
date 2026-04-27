"""API views — Django REST Framework views for all Team Builder endpoints."""

import uuid
import json
import asyncio
import logging
import os
from datetime import datetime, timedelta
from django.http import JsonResponse
from django.shortcuts import redirect
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST, require_http_methods
from django.db import connection
from django.core.files.storage import default_storage
from django.utils import timezone
from api.models import SalaryRate, SalaryHistory, UserSession, Candidate, CandidateNotification

logger = logging.getLogger(__name__)


# ── Helpers ──────────────────────────────────────────────────
def _json_body(request):
    """Parse JSON body from request."""
    try:
        return json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return {}


def _check_api_key(request):
    """Verify X-API-Key header."""
    import os
    expected = os.getenv("API_KEY", "your_api_key")
    key = request.META.get("HTTP_X_API_KEY", "")
    if not expected or key != expected:
        return JsonResponse({"detail": "Invalid API key"}, status=403)
    return None


def _check_admin_key(request):
    """Verify admin X-API-Key header."""
    import os
    expected = os.getenv("ADMIN_API_KEY", "your_admin_key")
    key = request.META.get("HTTP_X_API_KEY", "")
    if not expected or key != expected:
        return JsonResponse({"detail": "Invalid admin API key"}, status=403)
    return None


# ── GET /health ──────────────────────────────────────────────
@require_GET
def health(request):
    return JsonResponse({
        "status": "ok", "version": "4.0.0",
        "region": "TN", "currency": "TND",
    })


# ── GET /api/v1/stats ───────────────────────────────────────
@require_GET
def get_stats(request):
    # Get logged in HR user
    hr_user_id = request.session.get('hr_user_id')
    
    # Get time range parameter (default: 30 days)
    days = request.GET.get('days', '30')
    try:
        days_int = int(days) if days != 'all' else None
    except ValueError:
        days_int = 30
    
    # Debug logging
    logger.info(f"Stats request - Session ID: {request.session.session_key}, HR User ID: {hr_user_id}, Days: {days}")
    
    if not hr_user_id:
        logger.warning("Stats request without hr_user_id in session")
        return JsonResponse({
            "roles_seeded": 0,
            "total_sessions": 0,
            "total_candidates": 0,
            "total_invitations": 0,
            "interested_candidates": 0,
            "pending_invitations": 0,
            "recent_sessions_30d": 0,
            "recent_candidates_30d": 0,
            "seniority_breakdown": [],
            "skills_breakdown": [],
            "candidate_sources": 5,
            "llm_model": "llama3.2",
            "currency": "TND",
            "region": "Tunisia",
        })
    
    from api.models import HRUser
    try:
        hr_user = HRUser.objects.get(id=hr_user_id)
    except HRUser.DoesNotExist:
        return JsonResponse({"error": "User not found"}, status=404)
    
    # Calculate date cutoff
    from django.utils import timezone
    if days_int:
        date_cutoff = timezone.now() - timedelta(days=days_int)
    else:
        date_cutoff = None  # All time
    
    # User-specific stats
    role_count = SalaryRate.objects.count()
    
    # Apply time filter if specified
    if date_cutoff:
        session_count = UserSession.objects.filter(hr_user=hr_user, created_at__gte=date_cutoff).count()
        candidate_count = Candidate.objects.filter(hr_user=hr_user, created_at__gte=date_cutoff).count()
        candidates_queryset = Candidate.objects.filter(hr_user=hr_user, created_at__gte=date_cutoff)
    else:
        session_count = UserSession.objects.filter(hr_user=hr_user).count()
        candidate_count = Candidate.objects.filter(hr_user=hr_user).count()
        candidates_queryset = Candidate.objects.filter(hr_user=hr_user)
    
    # Candidates by seniority
    from django.db.models import Count
    seniority_breakdown = list(
        candidates_queryset
        .values('seniority')
        .annotate(count=Count('id'))
        .order_by('-count')
    )
    
    # Candidates by skills (top 10)
    from django.db.models import Q
    skills_count = {}
    for candidate in candidates_queryset:
        if candidate.skills:
            for skill in candidate.skills:
                skill_lower = skill.lower().strip()
                skills_count[skill_lower] = skills_count.get(skill_lower, 0) + 1
    
    top_skills = sorted(skills_count.items(), key=lambda x: x[1], reverse=True)[:10]
    skills_breakdown = [{"skill": skill, "count": count} for skill, count in top_skills]
    
    # Invitation stats (always all time for invitations)
    total_invitations = CandidateNotification.objects.filter(candidate__hr_user=hr_user).count()
    interested_candidates = CandidateNotification.objects.filter(
        candidate__hr_user=hr_user, 
        status='interested'
    ).count()
    pending_invitations = CandidateNotification.objects.filter(
        candidate__hr_user=hr_user, 
        status='pending'
    ).count()
    
    # Calculate average response time (in days)
    responded_notifications = CandidateNotification.objects.filter(
        candidate__hr_user=hr_user,
        responded_at__isnull=False
    )
    
    avg_response_days = None
    if responded_notifications.exists():
        total_response_time = timedelta()
        count = 0
        for notification in responded_notifications:
            if notification.sent_at and notification.responded_at:
                response_time = notification.responded_at - notification.sent_at
                total_response_time += response_time
                count += 1
        
        if count > 0:
            avg_response_seconds = total_response_time.total_seconds() / count
            avg_response_days = round(avg_response_seconds / 86400, 1)  # Convert to days with 1 decimal
    
    # Recent activity (last 30 days for the "change" indicators)
    thirty_days_ago = timezone.now() - timedelta(days=30)
    recent_sessions = UserSession.objects.filter(
        hr_user=hr_user,
        created_at__gte=thirty_days_ago
    ).count()
    recent_candidates = Candidate.objects.filter(
        hr_user=hr_user,
        created_at__gte=thirty_days_ago
    ).count()
    
    return JsonResponse({
        "roles_seeded": role_count,
        "total_sessions": session_count,
        "total_candidates": candidate_count,
        "total_invitations": total_invitations,
        "interested_candidates": interested_candidates,
        "pending_invitations": pending_invitations,
        "avg_response_days": avg_response_days,
        "recent_sessions_30d": recent_sessions,
        "recent_candidates_30d": recent_candidates,
        "seniority_breakdown": seniority_breakdown,
        "skills_breakdown": skills_breakdown,
        "candidate_sources": 5,
        "llm_model": "llama3.2",
        "currency": "TND",
        "region": "Tunisia",
    })


# ── GET /api/v1/salaries ────────────────────────────────────
@require_GET
def list_salaries(request):
    rows = SalaryRate.objects.all().order_by("role_title", "seniority")
    data = [
        {
            "role": r.role_title, "seniority": r.seniority,
            "annual_min": r.annual_min, "annual_max": r.annual_max,
            "hourly_min": r.hourly_min, "hourly_max": r.hourly_max,
            "currency": r.currency, "region": r.region,
            "last_updated": str(r.last_updated) if r.last_updated else None,
        }
        for r in rows
    ]
    return JsonResponse(data, safe=False)


# ── GET /api/v1/sessions ────────────────────────────────────
@require_GET
def list_sessions(request):
    # Get logged in HR user
    hr_user_id = request.session.get('hr_user_id')
    
    if hr_user_id:
        # Filter by user's sessions only
        from api.models import HRUser
        try:
            hr_user = HRUser.objects.get(id=hr_user_id)
            sessions = UserSession.objects.filter(hr_user=hr_user).order_by("-created_at")[:50]
        except HRUser.DoesNotExist:
            # User ID in session but user doesn't exist - return empty
            sessions = []
    else:
        # Guest users (not logged in) should not see any sessions
        # Return empty list instead of showing all sessions (security fix)
        sessions = []
    
    data = [
        {
            "id": str(s.id),
            "raw_input": s.raw_input,
            "region": s.region,
            "created_at": str(s.created_at),
            "full_result": s.full_result,
        }
        for s in sessions
    ]
    return JsonResponse(data, safe=False)


# ── DELETE /api/v1/sessions/<id> ─────────────────────────────
@csrf_exempt
@require_http_methods(["DELETE"])
def delete_session(request, session_id):
    auth_err = _check_api_key(request)
    if auth_err:
        return auth_err
    UserSession.objects.filter(id=session_id).delete()
    return JsonResponse({"status": "deleted", "id": session_id})


# ── POST /api/v1/team-builder ────────────────────────────────
@csrf_exempt
@require_POST
def team_builder(request):
    auth_err = _check_api_key(request)
    if auth_err:
        return auth_err

    body = _json_body(request)
    description = body.get("description", "")
    region = body.get("region", "TN")
    currency = body.get("currency", "TND")
    budget = body.get("budget")

    session_id = str(uuid.uuid4())
    logger.info("request session_id=%s region=%s", session_id, region)

    # Run the LangGraph agent pipeline
    from agent.graph import build_graph
    result = asyncio.run(build_graph().ainvoke({
        "raw_input": description, "region": region,
        "currency": currency, "budget": budget,
    }))

    candidates = result.get("candidates", [])
    team = []
    for title, cost in result.get("cost_estimate", {}).items():
        all_matched = [c for c in candidates if c.get("matched_role") == title]
        team.append({
            "role": title, "seniority": cost.get("seniority"),
            "type": cost.get("employment_type"),
            "estimated_salary": cost.get("formatted"),
            "salary_source": cost.get("source"),
            "priority": cost.get("priority"),
            "top_candidates": [
                {"name": c["name"], "source": c["source"],
                 "profile_url": c["profile_url"], "score": c.get("score")}
                for c in all_matched
            ],
        })

    response_data = {
        "session_id": session_id,
        "chat_response": result.get("chat_response", ""),
        "recommended_team": team,
        "currency": currency,
        "a2a_payload": result.get("a2a_payload", {}),
    }

    # Save session to DB
    try:
        # Get logged in HR user (if any)
        hr_user = None
        hr_user_id = request.session.get('hr_user_id')
        if hr_user_id:
            from api.models import HRUser
            try:
                hr_user = HRUser.objects.get(id=hr_user_id)
            except HRUser.DoesNotExist:
                pass
        
        UserSession.objects.create(
            id=session_id,
            hr_user=hr_user,
            raw_input=description,
            region=region,
            a2a_payload=result.get("a2a_payload", {}),
            full_result=response_data,
        )
        
        # 🤖 A2A INTEGRATION #1: Auto-create job postings from team build
        if hr_user and result.get("a2a_payload"):
            try:
                from services.job_creator_agent import create_jobs_from_team_build, auto_match_jobs_to_candidates
                
                # Create jobs from recommended roles
                job_creation_result = asyncio.run(create_jobs_from_team_build(
                    result.get("a2a_payload"),
                    hr_user,
                    session_id
                ))
                
                logger.info(f"✨ A2A: Created {job_creation_result['total_created']} jobs from team build")
                
                # Auto-match newly created jobs to existing candidates
                if job_creation_result['total_created'] > 0:
                    job_ids = [job['id'] for job in job_creation_result['created']]
                    match_result = asyncio.run(auto_match_jobs_to_candidates(job_ids))
                    logger.info(f"✨ A2A: Found {match_result['total_matches']} candidate matches")
                    
                    # Add A2A results to response
                    response_data['a2a_jobs_created'] = job_creation_result
                    response_data['a2a_matches_found'] = match_result
                
            except Exception as e:
                logger.error(f"A2A job creation error: {e}")
                # Don't fail the main request if A2A fails
        
    except Exception as e:
        logger.error("db_session_save_error: %s", str(e))

    logger.info("complete session_id=%s roles=%d", session_id, len(team))
    return JsonResponse(response_data)


# ── POST /api/v1/admin/update-salaries ───────────────────────
@csrf_exempt
@require_POST
def update_salaries(request):
    auth_err = _check_admin_key(request)
    if auth_err:
        return auth_err

    from services.salary_updater import run_salary_update
    result = asyncio.run(run_salary_update())
    return JsonResponse(result)


@csrf_exempt
@require_POST
def upload_cv(request):
    auth_err = _check_api_key(request)
    if auth_err:
        return auth_err

    try:
        # Get logged in HR user
        hr_user = None
        hr_user_id = request.session.get('hr_user_id')
        if hr_user_id:
            from api.models import HRUser
            try:
                hr_user = HRUser.objects.get(id=hr_user_id)
            except HRUser.DoesNotExist:
                pass
        
        # Get uploaded files (support multiple files)
        cv_files = request.FILES.getlist('cv_files')
        if not cv_files:
            return JsonResponse({"error": "No CV files provided"}, status=400)
        
        consent = request.POST.get('consent', 'false').lower() == 'true'
        
        if not consent:
            return JsonResponse({"error": "Consent is required"}, status=400)
        
        # Process each file
        from services.cv_parser import extract_text_from_pdf, extract_text_from_docx, extract_text_from_image, parse_cv_text
        from db.vector_store import index_candidates
        
        results = []
        errors = []
        
        for cv_file in cv_files:
            try:
                # Save file
                file_name = f"cvs/{uuid.uuid4()}_{cv_file.name}"
                file_path = default_storage.save(file_name, cv_file)
                full_path = default_storage.path(file_path)
                
                # Extract text from CV based on file type
                file_lower = cv_file.name.lower()
                if file_lower.endswith('.pdf'):
                    cv_text = extract_text_from_pdf(full_path)
                elif file_lower.endswith('.docx'):
                    cv_text = extract_text_from_docx(full_path)
                elif file_lower.endswith(('.jpg', '.jpeg', '.png', '.bmp', '.tiff')):
                    cv_text = extract_text_from_image(full_path)
                else:
                    errors.append({"file": cv_file.name, "error": "Only PDF, DOCX, and image files (JPG, PNG) are supported"})
                    continue
                
                if not cv_text or len(cv_text.strip()) < 50:
                    errors.append({"file": cv_file.name, "error": "Could not extract text from file or text too short"})
                    continue
                
                # Parse CV with LLM
                parsed_data = parse_cv_text(cv_text)
                
                # Create candidate (linked to HR user)
                candidate = Candidate.objects.create(
                    hr_user=hr_user,
                    name=parsed_data['name'],
                    email=parsed_data['email'],
                    phone=parsed_data['phone'],
                    skills=parsed_data['skills'],
                    experience_years=parsed_data['experience_years'],
                    seniority=parsed_data['seniority'],
                    education=parsed_data['education'],
                    cv_text=cv_text,
                    cv_file_path=file_path,
                    consent_given=True,
                    consent_date=datetime.now(),
                    expires_at=datetime.now() + timedelta(days=180)  # 6 months
                )
                
                # Index in ChromaDB
                try:
                    index_candidates([{
                        'name': candidate.name,
                        'skills': candidate.skills,
                        'source': 'internal_db',
                        'matched_role': '',
                        'profile_url': f'/hr/candidates/{candidate.id}'
                    }])
                except Exception as e:
                    logger.error(f"ChromaDB indexing failed for {cv_file.name}: {e}")
                
                results.append({
                    "id": str(candidate.id),
                    "name": candidate.name,
                    "email": candidate.email,
                    "phone": candidate.phone,
                    "skills": candidate.skills,
                    "experience_years": candidate.experience_years,
                    "seniority": candidate.seniority,
                    "education": candidate.education,
                    "file_name": cv_file.name
                })
                
                # 🤖 AUTO-MATCH: Trigger Job Matcher Agent
                try:
                    from services.job_matcher_agent import match_candidate_to_jobs
                    matches = asyncio.run(match_candidate_to_jobs(str(candidate.id)))
                    logger.info(f"✨ Auto-matched {candidate.name} to {len(matches)} jobs")
                except Exception as e:
                    logger.error(f"Auto-matching failed for {candidate.name}: {e}")
                
            except Exception as e:
                logger.error(f"CV upload error for {cv_file.name}: {e}")
                errors.append({"file": cv_file.name, "error": str(e)})
        
        return JsonResponse({
            "status": "success",
            "processed": len(results),
            "failed": len(errors),
            "results": results,
            "errors": errors
        })
        
    except Exception as e:
        logger.error(f"CV upload error: {e}")
        return JsonResponse({"error": str(e)}, status=500)


# ── GET /api/v1/hr/candidates ────────────────────────────────
@require_GET
def list_candidates(request):
    auth_err = _check_api_key(request)
    if auth_err:
        return auth_err
    
    # Get logged in HR user
    hr_user_id = request.session.get('hr_user_id')
    
    # Enhanced filters
    seniority = request.GET.get('seniority')
    availability = request.GET.get('availability')
    skills_param = request.GET.get('skills', '')
    search = request.GET.get('search', '').strip()  # Search by name/email
    status = request.GET.get('status')  # invitation status
    sort_by = request.GET.get('sort', '-created_at')  # Sort option
    min_exp = request.GET.get('min_exp')
    max_exp = request.GET.get('max_exp')
    
    skills = [s.strip() for s in skills_param.split(',') if s.strip()]
    
    # Filter by user's candidates only
    if hr_user_id:
        from api.models import HRUser
        try:
            hr_user = HRUser.objects.get(id=hr_user_id)
            candidates = Candidate.objects.filter(hr_user=hr_user)
        except HRUser.DoesNotExist:
            candidates = Candidate.objects.all()
    else:
        candidates = Candidate.objects.all()
    
    # Apply filters
    if seniority:
        candidates = candidates.filter(seniority=seniority)
    if availability:
        candidates = candidates.filter(availability_status=availability)
    if search:
        from django.db.models import Q
        candidates = candidates.filter(
            Q(name__icontains=search) | 
            Q(email__icontains=search) |
            Q(phone__icontains=search)
        )
    if skills:
        from django.db.models import Q
        query = Q()
        for skill in skills:
            query |= Q(skills__icontains=skill)
        candidates = candidates.filter(query)
    if min_exp:
        candidates = candidates.filter(experience_years__gte=int(min_exp))
    if max_exp:
        candidates = candidates.filter(experience_years__lte=int(max_exp))
    
    # Get all candidates with their invitation status
    candidates_list = list(candidates)
    
    # Filter by invitation status if requested
    if status:
        filtered = []
        for c in candidates_list:
            inv_status = c.invitation_status
            if status == inv_status:
                filtered.append(c)
        candidates_list = filtered
    
    # Sort
    sort_map = {
        'newest': lambda c: c.created_at,
        'oldest': lambda c: c.created_at,
        'experience': lambda c: c.experience_years or 0,
        'name': lambda c: c.name.lower(),
    }
    
    if sort_by in sort_map:
        reverse = sort_by not in ['oldest', 'name']
        candidates_list.sort(key=sort_map[sort_by], reverse=reverse)
    else:
        candidates_list.sort(key=lambda c: c.created_at, reverse=True)
    
    data = [
        {
            "id": str(c.id),
            "name": c.name,
            "email": c.email,
            "phone": c.phone,
            "skills": c.skills,
            "experience_years": c.experience_years,
            "seniority": c.seniority,
            "availability_status": c.availability_status,
            "invitation_status": c.invitation_status,
            "notes": c.notes,
            "created_at": str(c.created_at),
        }
        for c in candidates_list
    ]
    
    return JsonResponse(data, safe=False)


# ── GET /api/v1/hr/candidates/{id} ───────────────────────────
@require_GET
def get_candidate_detail(request, candidate_id):
    auth_err = _check_api_key(request)
    if auth_err:
        return auth_err
    
    hr_user_id = request.session.get('hr_user_id')
    
    try:
        if hr_user_id:
            from api.models import HRUser
            hr_user = HRUser.objects.get(id=hr_user_id)
            candidate = Candidate.objects.get(id=candidate_id, hr_user=hr_user)
        else:
            candidate = Candidate.objects.get(id=candidate_id)
    except (Candidate.DoesNotExist, HRUser.DoesNotExist):
        return JsonResponse({"error": "Candidate not found"}, status=404)
    
    # Get invitation history
    invitations = candidate.notifications.order_by('-sent_at')
    invitation_history = [
        {
            "id": str(inv.id),
            "role_title": inv.role_title,
            "notification_type": inv.notification_type,
            "sent_at": str(inv.sent_at),
            "status": inv.status,
            "custom_message": inv.custom_message if hasattr(inv, 'custom_message') else None,
        }
        for inv in invitations
    ]
    
    return JsonResponse({
        "id": str(candidate.id),
        "name": candidate.name,
        "email": candidate.email,
        "phone": candidate.phone,
        "skills": candidate.skills,
        "experience_years": candidate.experience_years,
        "seniority": candidate.seniority,
        "education": candidate.education,
        "cv_text": candidate.cv_text,
        "cv_file_path": candidate.cv_file_path,
        "availability_status": candidate.availability_status,
        "preferred_contact": candidate.preferred_contact,
        "notes": candidate.notes,
        "invitation_status": candidate.invitation_status,
        "invitation_history": invitation_history,
        "consent_given": candidate.consent_given,
        "consent_date": str(candidate.consent_date) if candidate.consent_date else None,
        "created_at": str(candidate.created_at),
        "updated_at": str(candidate.updated_at),
    })


# ── PATCH /api/v1/hr/candidates/{id}/notes ────────────────────
@csrf_exempt
@require_http_methods(["PATCH"])
def update_candidate_notes(request, candidate_id):
    auth_err = _check_api_key(request)
    if auth_err:
        return auth_err
    
    hr_user_id = request.session.get('hr_user_id')
    body = _json_body(request)
    notes = body.get('notes', '')
    
    try:
        if hr_user_id:
            from api.models import HRUser
            hr_user = HRUser.objects.get(id=hr_user_id)
            candidate = Candidate.objects.get(id=candidate_id, hr_user=hr_user)
        else:
            candidate = Candidate.objects.get(id=candidate_id)
        
        candidate.notes = notes
        candidate.save()
        
        return JsonResponse({"success": True, "notes": notes})
    except (Candidate.DoesNotExist, HRUser.DoesNotExist):
        return JsonResponse({"error": "Candidate not found"}, status=404)
    return JsonResponse({"candidates": data, "total": len(data)})


# ── GET /api/v1/hr/candidates/:id ────────────────────────────
@require_GET
def get_candidate(request, candidate_id):
    auth_err = _check_api_key(request)
    if auth_err:
        return auth_err
    
    try:
        candidate = Candidate.objects.get(id=candidate_id)
        
        # Get notification history
        notifications = candidate.notifications.all().order_by('-sent_at')
        
        return JsonResponse({
            "id": str(candidate.id),
            "name": candidate.name,
            "email": candidate.email,
            "phone": candidate.phone,
            "skills": candidate.skills,
            "experience_years": candidate.experience_years,
            "seniority": candidate.seniority,
            "education": candidate.education,
            "availability_status": candidate.availability_status,
            "preferred_contact": candidate.preferred_contact,
            "created_at": str(candidate.created_at),
            "notifications": [
                {
                    "id": str(n.id),
                    "role_title": n.role_title,
                    "status": n.status,
                    "sent_at": str(n.sent_at),
                    "responded_at": str(n.responded_at) if n.responded_at else None,
                }
                for n in notifications
            ]
        })
    except Candidate.DoesNotExist:
        return JsonResponse({"error": "Candidate not found"}, status=404)


@csrf_exempt
@require_POST
def invite_candidate(request):
    auth_err = _check_api_key(request)
    if auth_err:
        return auth_err
    
    body = _json_body(request)
    candidate_id = body.get('candidate_id')
    email = body.get('email')  # Allow email override
    session_id = body.get('session_id')
    role_title = body.get('role_title')
    salary_range = body.get('salary_range', 'À définir')
    custom_message = body.get('custom_message')  # Optional custom message
    
    if not all([candidate_id, role_title, email]):
        return JsonResponse({"error": "Missing required fields (candidate_id, role_title, email)"}, status=400)
    
    try:
        candidate = Candidate.objects.get(id=candidate_id)
        
        # Log if email was edited
        if email and email != candidate.email:
            print(f"📧 Using custom email: {email} (original: {candidate.email})")
        
        # Get logged in HR user (if any)
        hr_user = None
        hr_user_id = request.session.get('hr_user_id')
        if hr_user_id:
            from api.models import HRUser
            try:
                hr_user = HRUser.objects.get(id=hr_user_id)
                print(f"✅ Using Gmail API with account: {hr_user.email}")
            except HRUser.DoesNotExist:
                pass
        
        # Send notification with optional custom message, HR user, and edited email
        from services.notifier import notify_candidate
        result = asyncio.run(notify_candidate(
            candidate, 
            role_title, 
            salary_range, 
            session_id or '',
            custom_message,
            hr_user,  # Pass HR user for Gmail API
            email  # Pass the edited email explicitly
        ))
        
        return JsonResponse(result)
        
    except Candidate.DoesNotExist:
        return JsonResponse({"error": "Candidate not found"}, status=404)
    except Exception as e:
        logger.error(f"Invite error: {e}")
        import traceback
        traceback.print_exc()
        return JsonResponse({"error": str(e)}, status=500)


# ── POST /api/v1/candidate/respond/:token ─────────────────────
@csrf_exempt
@require_POST
def candidate_respond(request, token):
    """Handle candidate response to invitation (interested/not_interested)."""
    action = request.GET.get('action', 'interested')
    
    if action not in ['interested', 'not_interested']:
        return JsonResponse({"error": "Invalid action"}, status=400)
    
    from services.notifier import record_response
    success = record_response(token, action)
    
    if success:
        # 🤖 A2A INTEGRATION #2: Update job invitation status and track analytics
        try:
            from api.models import CandidateNotification
            notification = CandidateNotification.objects.get(response_token=token)
            
            # Update linked job invitation if exists
            if hasattr(notification, 'job_invitation') and notification.job_invitation:
                from api.models_jobs import JobInvitation
                invitation = notification.job_invitation
                invitation.status = 'interested' if action == 'interested' else 'not_interested'
                invitation.responded_at = timezone.now()
                invitation.save()
                
                logger.info(f"✨ A2A: Updated job invitation status to {invitation.status}")
                
                # Track analytics event
                from services.analytics_agent import track_job_lifecycle_event
                asyncio.run(track_job_lifecycle_event(
                    str(invitation.job_posting.id),
                    'candidate_responded',
                    {
                        'candidate_id': str(notification.candidate.id),
                        'candidate_name': notification.candidate.name,
                        'response': action,
                        'days_to_respond': (timezone.now() - invitation.invited_at).days
                    }
                ))
                
                logger.info(f"✨ A2A: Tracked analytics event for candidate response")
        except Exception as e:
            logger.error(f"A2A response tracking error: {e}")
            # Don't fail the main request
        
        return JsonResponse({"status": "success", "action": action})
    else:
        return JsonResponse({"error": "Invalid or expired token"}, status=404)


# ── DELETE /api/v1/hr/candidates/:id ──────────────────────────
@csrf_exempt
@require_http_methods(["DELETE"])
def delete_candidate(request, candidate_id):
    auth_err = _check_api_key(request)
    if auth_err:
        return auth_err
    
    try:
        candidate = Candidate.objects.get(id=candidate_id)
        
        # Delete CV file if exists
        if candidate.cv_file_path:
            try:
                default_storage.delete(candidate.cv_file_path)
            except Exception as e:
                logger.error(f"File deletion error: {e}")
        
        candidate.delete()
        return JsonResponse({"status": "deleted", "id": candidate_id})
        
    except Candidate.DoesNotExist:
        return JsonResponse({"error": "Candidate not found"}, status=404)


# ── Google OAuth2 Endpoints ───────────────────────────────────

@require_GET
def google_login(request):
    """Initiate Google OAuth2 login flow."""
    from services.google_auth import get_authorization_url
    
    try:
        auth_url, state = get_authorization_url()
        # Store state in session for CSRF protection
        request.session['oauth_state'] = state
        return JsonResponse({"auth_url": auth_url})
    except Exception as e:
        logger.error(f"OAuth initiation error: {e}")
        return JsonResponse({"error": str(e)}, status=500)


@require_GET
def google_callback(request):
    """Handle Google OAuth2 callback."""
    from services.google_auth import exchange_code_for_tokens
    from api.models import HRUser
    
    frontend_url = os.getenv('BASE_URL', 'http://localhost:5173')
    code = request.GET.get('code')
    error = request.GET.get('error')
    
    if error:
        return redirect(f"{frontend_url}/login?error={error}")
    
    if not code:
        return redirect(f"{frontend_url}/login?error=no_code")
    
    try:
        # Exchange code for tokens
        token_data = exchange_code_for_tokens(code)
        
        # Create or update HR user
        hr_user, created = HRUser.objects.update_or_create(
            google_id=token_data['google_id'],
            defaults={
                'email': token_data['email'],
                'name': token_data['name'],
                'access_token': token_data['access_token'],
                'refresh_token': token_data['refresh_token'],
                'token_expiry': token_data['token_expiry'],
                'profile_picture': token_data['picture']
            }
        )
        
        # Store user ID in session
        request.session['hr_user_id'] = str(hr_user.id)
        request.session.save()
        
        # Redirect to frontend with success (redirect to home page)
        return redirect(f"{frontend_url}/?login=success")
        
    except Exception as e:
        logger.error(f"OAuth callback error: {e}")
        return redirect(f"{frontend_url}/login?error=auth_failed")


@require_GET
def get_current_user(request):
    """Get currently logged in HR user."""
    from api.models import HRUser
    
    hr_user_id = request.session.get('hr_user_id')
    
    if not hr_user_id:
        return JsonResponse({"error": "Not authenticated"}, status=401)
    
    try:
        hr_user = HRUser.objects.get(id=hr_user_id)
        return JsonResponse({
            "id": str(hr_user.id),
            "email": hr_user.email,
            "name": hr_user.name,
            "picture": hr_user.profile_picture,
            "last_login": str(hr_user.last_login)
        })
    except HRUser.DoesNotExist:
        return JsonResponse({"error": "User not found"}, status=404)


@csrf_exempt
@require_POST
def google_logout(request):
    """Logout HR user."""
    request.session.flush()
    return JsonResponse({"status": "logged_out"})


# ── POST /api/v1/gmail/sync-responses ───────────────────────
@csrf_exempt
@require_POST
def sync_gmail_responses(request):
    """Sync candidate responses from Gmail inbox.
    
    This endpoint:
    1. Reads Gmail inbox for replies to invitation emails
    2. Analyzes sentiment (accepted/refused)
    3. Updates candidate notification statuses
    """
    from api.models import HRUser
    from services.gmail_monitor import sync_candidate_statuses
    from asgiref.sync import async_to_sync
    
    # Get logged in HR user
    hr_user_id = request.session.get('hr_user_id')
    
    if not hr_user_id:
        return JsonResponse({"error": "Not authenticated"}, status=401)
    
    try:
        hr_user = HRUser.objects.get(id=hr_user_id)
        
        # Sync responses from Gmail (convert async to sync)
        result = async_to_sync(sync_candidate_statuses)(hr_user)
        
        return JsonResponse({
            "success": True,
            "updated": result['updated'],
            "total_responses": result.get('total_responses', 0),
            "message": result['message']
        })
        
    except HRUser.DoesNotExist:
        return JsonResponse({"error": "User not found"}, status=404)
    except Exception as e:
        logger.error(f"Gmail sync error: {e}")
        import traceback
        traceback.print_exc()
        return JsonResponse({
            "error": str(e),
            "message": "Failed to sync Gmail responses"
        }, status=500)


# ── GET /api/v1/gmail/check-access ──────────────────────────
@require_GET
def check_gmail_access(request):
    """Check if HR user has valid Gmail API access."""
    from api.models import HRUser
    from services.google_auth import verify_gmail_api_access
    
    hr_user_id = request.session.get('hr_user_id')
    
    if not hr_user_id:
        return JsonResponse({"error": "Not authenticated"}, status=401)
    
    try:
        hr_user = HRUser.objects.get(id=hr_user_id)
        has_access = verify_gmail_api_access(hr_user)
        
        return JsonResponse({
            "has_access": has_access,
            "email": hr_user.email
        })
        
    except HRUser.DoesNotExist:
        return JsonResponse({"error": "User not found"}, status=404)
    except Exception as e:
        return JsonResponse({
            "has_access": False,
            "error": str(e)
        }, status=500)


# ══════════════════════════════════════════════════════════════
# JOB POSTINGS & RECRUITMENT PIPELINE
# ══════════════════════════════════════════════════════════════

# ── GET /api/v1/jobs ─────────────────────────────────────────
@require_GET
def list_jobs(request):
    """List all job postings for logged-in HR user."""
    from api.models_jobs import JobPosting
    
    hr_user_id = request.session.get('hr_user_id')
    if not hr_user_id:
        return JsonResponse({"error": "Not authenticated"}, status=401)
    
    try:
        from api.models import HRUser
        hr_user = HRUser.objects.get(id=hr_user_id)
        
        # Get filter params
        status = request.GET.get('status', '')
        
        jobs = JobPosting.objects.filter(hr_user=hr_user)
        
        if status:
            jobs = jobs.filter(status=status)
        
        jobs_data = []
        for job in jobs:
            jobs_data.append({
                'id': str(job.id),
                'title': job.title,
                'seniority': job.seniority,
                'status': job.status,
                'description': job.description,
                'required_skills': job.required_skills,
                'salary_min': job.salary_min,
                'salary_max': job.salary_max,
                'location': job.location,
                'created_at': job.created_at.isoformat(),
                'deadline': job.deadline.isoformat() if job.deadline else None,
                'filled_by': job.filled_by.name if job.filled_by else None,
                'filled_at': job.filled_at.isoformat() if job.filled_at else None,
                'days_open': job.days_open,
                'is_overdue': job.is_overdue,
                'candidates_count': job.candidates_count,
                'interested_count': job.interested_count,
                'session_id': str(job.session_id) if job.session_id else None,
            })
        
        return JsonResponse(jobs_data, safe=False)
        
    except HRUser.DoesNotExist:
        return JsonResponse({"error": "User not found"}, status=404)


# ── POST /api/v1/jobs ────────────────────────────────────────
@csrf_exempt
@require_POST
def create_job(request):
    """Create a new job posting."""
    from api.models_jobs import JobPosting
    from api.models import HRUser
    
    hr_user_id = request.session.get('hr_user_id')
    if not hr_user_id:
        return JsonResponse({"error": "Not authenticated"}, status=401)
    
    body = _json_body(request)
    
    try:
        hr_user = HRUser.objects.get(id=hr_user_id)
        
        job = JobPosting.objects.create(
            hr_user=hr_user,
            title=body.get('title'),
            seniority=body.get('seniority'),
            description=body.get('description', ''),
            required_skills=body.get('required_skills', []),
            salary_min=body.get('salary_min'),
            salary_max=body.get('salary_max'),
            location=body.get('location', ''),
            deadline=body.get('deadline'),
            status='open'
        )
        
        # 🤖 A2A INTEGRATION #4: Track job creation analytics
        try:
            from services.analytics_agent import track_job_lifecycle_event
            asyncio.run(track_job_lifecycle_event(
                str(job.id),
                'job_created',
                {
                    'title': job.title,
                    'seniority': job.seniority,
                    'salary_range': f"{job.salary_min}-{job.salary_max}" if job.salary_min else None
                }
            ))
        except Exception as e:
            logger.error(f"Analytics tracking error: {e}")
        
        return JsonResponse({
            'id': str(job.id),
            'title': job.title,
            'status': job.status,
            'created_at': job.created_at.isoformat()
        })
        
    except HRUser.DoesNotExist:
        return JsonResponse({"error": "User not found"}, status=404)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


# ── GET /api/v1/jobs/:id ─────────────────────────────────────
@require_GET
def get_job_detail(request, job_id):
    """Get job posting details with all candidates."""
    from api.models_jobs import JobPosting, JobInvitation
    from api.models import HRUser
    
    hr_user_id = request.session.get('hr_user_id')
    if not hr_user_id:
        return JsonResponse({"error": "Not authenticated"}, status=401)
    
    try:
        hr_user = HRUser.objects.get(id=hr_user_id)
        job = JobPosting.objects.get(id=job_id, hr_user=hr_user)
        
        # Get all invitations for this job
        invitations = JobInvitation.objects.filter(job_posting=job).select_related('candidate')
        
        invitations_data = []
        for inv in invitations:
            invitations_data.append({
                'id': str(inv.id),
                'candidate': {
                    'id': str(inv.candidate.id),
                    'name': inv.candidate.name,
                    'email': inv.candidate.email,
                    'phone': inv.candidate.phone,
                    'seniority': inv.candidate.seniority,
                    'skills': inv.candidate.skills,
                },
                'status': inv.status,
                'invited_at': inv.invited_at.isoformat(),
                'responded_at': inv.responded_at.isoformat() if inv.responded_at else None,
                'interview_date': inv.interview_date.isoformat() if inv.interview_date else None,
                'days_pending': inv.days_pending,
                'hr_notes': inv.hr_notes,
            })
        
        return JsonResponse({
            'id': str(job.id),
            'title': job.title,
            'seniority': job.seniority,
            'status': job.status,
            'description': job.description,
            'required_skills': job.required_skills,
            'salary_min': job.salary_min,
            'salary_max': job.salary_max,
            'location': job.location,
            'created_at': job.created_at.isoformat(),
            'deadline': job.deadline.isoformat() if job.deadline else None,
            'days_open': job.days_open,
            'is_overdue': job.is_overdue,
            'invitations': invitations_data,
        })
        
    except JobPosting.DoesNotExist:
        return JsonResponse({"error": "Job not found"}, status=404)


# ── PATCH /api/v1/jobs/:id ───────────────────────────────────
@csrf_exempt
@require_http_methods(["PATCH"])
def update_job(request, job_id):
    """Update job posting (status, deadline, etc)."""
    from api.models_jobs import JobPosting
    from api.models import HRUser
    
    hr_user_id = request.session.get('hr_user_id')
    if not hr_user_id:
        return JsonResponse({"error": "Not authenticated"}, status=401)
    
    body = _json_body(request)
    
    try:
        hr_user = HRUser.objects.get(id=hr_user_id)
        job = JobPosting.objects.get(id=job_id, hr_user=hr_user)
        
        old_status = job.status
        
        # Update fields
        if 'status' in body:
            job.status = body['status']
        if 'deadline' in body:
            job.deadline = body['deadline']
        if 'description' in body:
            job.description = body['description']
        
        job.save()
        
        # 🤖 A2A INTEGRATION #4: Track status changes
        if 'status' in body and body['status'] != old_status:
            try:
                from services.analytics_agent import track_job_lifecycle_event
                event_map = {
                    'open': 'job_opened',
                    'filled': 'job_filled',
                    'closed': 'job_closed',
                    'on_hold': 'job_on_hold'
                }
                event_type = event_map.get(body['status'], 'job_status_changed')
                
                asyncio.run(track_job_lifecycle_event(
                    str(job.id),
                    event_type,
                    {
                        'old_status': old_status,
                        'new_status': body['status'],
                        'days_open': job.days_open
                    }
                ))
            except Exception as e:
                logger.error(f"Analytics tracking error: {e}")
        
        return JsonResponse({
            'id': str(job.id),
            'status': job.status,
            'updated_at': job.updated_at.isoformat()
        })
        
    except JobPosting.DoesNotExist:
        return JsonResponse({"error": "Job not found"}, status=404)


# ── POST /api/v1/jobs/:id/invite ────────────────────────────
@csrf_exempt
@require_POST
def invite_to_job(request, job_id):
    """Invite a candidate to a specific job posting."""
    from api.models_jobs import JobPosting, JobInvitation
    from api.models import HRUser, Candidate
    
    hr_user_id = request.session.get('hr_user_id')
    if not hr_user_id:
        return JsonResponse({"error": "Not authenticated"}, status=401)
    
    body = _json_body(request)
    candidate_id = body.get('candidate_id')
    
    try:
        hr_user = HRUser.objects.get(id=hr_user_id)
        job = JobPosting.objects.get(id=job_id, hr_user=hr_user)
        candidate = Candidate.objects.get(id=candidate_id, hr_user=hr_user)
        
        # Create job invitation
        invitation, created = JobInvitation.objects.get_or_create(
            job_posting=job,
            candidate=candidate,
            defaults={'status': 'invited'}
        )
        
        if not created:
            return JsonResponse({
                "message": "Candidate already invited to this job",
                "invitation_id": str(invitation.id)
            })
        
        # Send notification email (reuse existing notifier)
        from services.notifier import notify_candidate
        result = asyncio.run(notify_candidate(
            candidate,
            job.title,
            f"{job.salary_min}-{job.salary_max}" if job.salary_min else "À définir",
            '',
            None,
            hr_user
        ))
        
        # Link notification to invitation
        if result.get('notification_id'):
            from api.models import CandidateNotification
            notification = CandidateNotification.objects.get(id=result['notification_id'])
            invitation.notification = notification
            invitation.save()
        
        return JsonResponse({
            'invitation_id': str(invitation.id),
            'status': 'invited',
            'notification_sent': True
        })
        
    except (JobPosting.DoesNotExist, Candidate.DoesNotExist):
        return JsonResponse({"error": "Job or candidate not found"}, status=404)


# ── PATCH /api/v1/invitations/:id ────────────────────────────
@csrf_exempt
@require_http_methods(["PATCH"])
def update_invitation_status(request, invitation_id):
    """Update invitation status (interview scheduled, offer made, etc)."""
    from api.models_jobs import JobInvitation
    from api.models import HRUser
    from django.utils import timezone
    
    hr_user_id = request.session.get('hr_user_id')
    if not hr_user_id:
        return JsonResponse({"error": "Not authenticated"}, status=401)
    
    body = _json_body(request)
    
    try:
        hr_user = HRUser.objects.get(id=hr_user_id)
        invitation = JobInvitation.objects.get(
            id=invitation_id,
            job_posting__hr_user=hr_user
        )
        
        # Update status
        if 'status' in body:
            invitation.status = body['status']
            
            # Update timeline fields based on status
            if body['status'] == 'interview_scheduled' and 'interview_date' in body:
                invitation.interview_date = body['interview_date']
            elif body['status'] == 'offer_made':
                invitation.offer_date = timezone.now()
            elif body['status'] in ['accepted', 'rejected', 'withdrawn']:
                invitation.decision_date = timezone.now()
                
                # If accepted, mark job as filled
                if body['status'] == 'accepted':
                    job = invitation.job_posting
                    job.status = 'filled'
                    job.filled_by = invitation.candidate
                    job.filled_at = timezone.now()
                    job.save()
        
        if 'hr_notes' in body:
            invitation.hr_notes = body['hr_notes']
        
        invitation.save()
        
        return JsonResponse({
            'id': str(invitation.id),
            'status': invitation.status,
            'updated': True
        })
        
    except JobInvitation.DoesNotExist:
        return JsonResponse({"error": "Invitation not found"}, status=404)


# ── GET /api/v1/notifications ────────────────────────────────
@require_GET
def get_notifications(request):
    """Get recruitment notifications for HR user."""
    from api.models import HRUser
    from services.recruitment_notifications import get_unread_notifications
    from asgiref.sync import async_to_sync
    
    hr_user_id = request.session.get('hr_user_id')
    if not hr_user_id:
        return JsonResponse({"error": "Not authenticated"}, status=401)
    
    try:
        hr_user = HRUser.objects.get(id=hr_user_id)
        notifications = async_to_sync(get_unread_notifications)(hr_user)
        
        return JsonResponse({
            'notifications': notifications,
            'count': len(notifications)
        })
        
    except HRUser.DoesNotExist:
        return JsonResponse({"error": "User not found"}, status=404)


# ── POST /api/v1/notifications/check ─────────────────────────
@csrf_exempt
@require_POST
def check_notifications(request):
    """Check and create new notifications based on recruitment status."""
    from api.models import HRUser
    from services.recruitment_notifications import check_and_create_notifications
    from asgiref.sync import async_to_sync
    
    hr_user_id = request.session.get('hr_user_id')
    if not hr_user_id:
        return JsonResponse({"error": "Not authenticated"}, status=401)
    
    try:
        hr_user = HRUser.objects.get(id=hr_user_id)
        result = async_to_sync(check_and_create_notifications)(hr_user)
        
        return JsonResponse(result)
        
    except HRUser.DoesNotExist:
        return JsonResponse({"error": "User not found"}, status=404)


# ── POST /api/v1/notifications/:id/read ──────────────────────
@csrf_exempt
@require_POST
def mark_notification_read(request, notification_id):
    """Mark a notification as read."""
    from api.models import HRUser
    from services.recruitment_notifications import mark_notification_read as mark_read
    from asgiref.sync import async_to_sync
    
    hr_user_id = request.session.get('hr_user_id')
    if not hr_user_id:
        return JsonResponse({"error": "Not authenticated"}, status=401)
    
    try:
        hr_user = HRUser.objects.get(id=hr_user_id)
        success = async_to_sync(mark_read)(notification_id, hr_user)
        
        if success:
            return JsonResponse({'status': 'marked_as_read'})
        else:
            return JsonResponse({"error": "Notification not found"}, status=404)
            
    except HRUser.DoesNotExist:
        return JsonResponse({"error": "User not found"}, status=404)


# ── GET /api/v1/matches ──────────────────────────────────────
@require_GET
def get_matches(request):
    """Get all candidate-job matches for the logged-in HR user."""
    from api.models import CandidateJobMatch
    
    hr_user_id = request.session.get('hr_user_id')
    if not hr_user_id:
        return JsonResponse({"error": "Not authenticated"}, status=401)
    
    try:
        # Get filter parameters
        job_id = request.GET.get('job_id')
        status = request.GET.get('status', 'pending')
        min_score = float(request.GET.get('min_score', 0.5))
        
        # Base query
        matches = CandidateJobMatch.objects.select_related(
            'candidate', 'job_posting'
        ).filter(
            job_posting__hr_user_id=hr_user_id,
            match_score__gte=min_score
        )
        
        # Filter by job if specified
        if job_id:
            matches = matches.filter(job_posting_id=job_id)
        
        # Filter by status
        if status != 'all':
            matches = matches.filter(status=status)
        
        # Serialize
        results = []
        for match in matches[:100]:  # Limit to 100
            results.append({
                'id': str(match.id),
                'candidate': {
                    'id': str(match.candidate.id),
                    'name': match.candidate.name,
                    'email': match.candidate.email,
                    'seniority': match.candidate.seniority,
                    'skills': match.candidate.skills,
                },
                'job': {
                    'id': str(match.job_posting.id),
                    'title': match.job_posting.title,
                    'seniority': match.job_posting.seniority,
                    'required_skills': match.job_posting.required_skills,
                },
                'match_score': match.match_score,
                'skill_match_score': match.skill_match_score,
                'seniority_match_score': match.seniority_match_score,
                'matching_skills': match.matching_skills,
                'missing_skills': match.missing_skills,
                'status': match.status,
                'created_at': match.created_at.isoformat(),
            })
        
        return JsonResponse({
            'matches': results,
            'count': len(results)
        })
        
    except Exception as e:
        logger.error(f"Error fetching matches: {e}")
        import traceback
        traceback.print_exc()
        return JsonResponse({"error": str(e)}, status=500)


# ── POST /api/v1/matches/trigger ────────────────────────────
@csrf_exempt
@require_POST
def trigger_matching(request):
    """Manually trigger job matching for a candidate or job."""
    from services.job_matcher_agent import match_candidate_to_jobs, match_job_to_candidates
    
    hr_user_id = request.session.get('hr_user_id')
    if not hr_user_id:
        return JsonResponse({"error": "Not authenticated"}, status=401)
    
    try:
        body = _json_body(request)
        candidate_id = body.get('candidate_id')
        job_id = body.get('job_id')
        
        if candidate_id:
            # Match candidate to all jobs
            matches = asyncio.run(match_candidate_to_jobs(candidate_id))
            return JsonResponse({
                'status': 'success',
                'matches_created': len(matches),
                'matches': matches
            })
        elif job_id:
            # Match job to all candidates
            matches = asyncio.run(match_job_to_candidates(job_id))
            return JsonResponse({
                'status': 'success',
                'matches_created': len(matches),
                'matches': matches
            })
        else:
            return JsonResponse({"error": "Provide candidate_id or job_id"}, status=400)
            
    except Exception as e:
        logger.error(f"Error triggering match: {e}")
        import traceback
        traceback.print_exc()
        return JsonResponse({"error": str(e)}, status=500)


# ── PUT /api/v1/matches/:id/status ──────────────────────────
@csrf_exempt
@require_http_methods(["PUT"])
def update_match_status(request, match_id):
    """Update the status of a candidate-job match."""
    from api.models import CandidateJobMatch
    
    hr_user_id = request.session.get('hr_user_id')
    if not hr_user_id:
        return JsonResponse({"error": "Not authenticated"}, status=401)
    
    try:
        body = _json_body(request)
        new_status = body.get('status')
        hr_notes = body.get('hr_notes')
        
        match = CandidateJobMatch.objects.get(
            id=match_id,
            job_posting__hr_user_id=hr_user_id
        )
        
        if new_status:
            match.status = new_status
        if hr_notes:
            match.hr_notes = hr_notes
        
        match.reviewed_at = datetime.now()
        match.save()
        
        return JsonResponse({
            'status': 'success',
            'match_id': str(match.id),
            'new_status': match.status
        })
        
    except CandidateJobMatch.DoesNotExist:
        return JsonResponse({"error": "Match not found"}, status=404)
    except Exception as e:
        logger.error(f"Error updating match: {e}")
        return JsonResponse({"error": str(e)}, status=500)


# ── POST /api/v1/parse-salary-query ──────────────────────────
@require_GET
def salary_lookup(request):
    """Lookup salary for a specific role and seniority."""
    auth_err = _check_api_key(request)
    if auth_err:
        return auth_err
    
    role_title = request.GET.get('role_title', '')
    seniority = request.GET.get('seniority', 'mid')
    region = request.GET.get('region', 'TN')
    currency = request.GET.get('currency', 'TND')
    
    if not role_title:
        return JsonResponse({"error": "role_title is required"}, status=400)
    
    try:
        from db.salary_lookup import lookup_salary_sync
        result = lookup_salary_sync(role_title, seniority, region, currency)
        return JsonResponse(result)
    except Exception as e:
        logger.error(f"Salary lookup error: {e}")
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
@require_POST
def parse_salary_query(request):
    """Parse natural language salary query using LLM."""
    auth_err = _check_api_key(request)
    if auth_err:
        return auth_err
    
    body = _json_body(request)
    query = body.get('query', '')
    
    if not query:
        return JsonResponse({"error": "Query is required"}, status=400)
    
    try:
        from langchain_groq import ChatGroq
        from langchain_core.messages import HumanMessage
        
        llm = ChatGroq(
            model=os.getenv("GROQ_MODEL", "llama-3.1-70b-versatile"),
            api_key=os.getenv("GROQ_API_KEY"),
            temperature=0.1,
        )
        
        prompt = f"""Parse this salary query and extract structured information.
Query: "{query}"

Extract:
- role: job title (e.g., "Backend Engineer", "Product Manager")
- seniority: one of [junior, mid, senior, lead]
- region: one of [TN, EU, US] (default: TN)
- currency: one of [TND, EUR, USD] (default: TND)

Return JSON only: {{"role": "...", "seniority": "...", "region": "...", "currency": "..."}}"""
        
        response = llm.invoke([HumanMessage(content=prompt)])
        parsed = json.loads(response.content)
        
        return JsonResponse(parsed)
        
    except Exception as e:
        logger.error(f"Salary query parsing error: {e}")
        # Fallback to simple parsing
        query_lower = query.lower()
        
        # Extract seniority
        seniority = 'mid'
        if 'junior' in query_lower or 'jr' in query_lower:
            seniority = 'junior'
        elif 'senior' in query_lower or 'sr' in query_lower:
            seniority = 'senior'
        elif 'lead' in query_lower or 'principal' in query_lower:
            seniority = 'lead'
        
        # Extract region
        region = 'TN'
        if 'europe' in query_lower or 'eu' in query_lower:
            region = 'EU'
        elif 'us' in query_lower or 'united states' in query_lower or 'america' in query_lower:
            region = 'US'
        
        # Extract role (simple heuristic)
        role = query.replace('senior', '').replace('junior', '').replace('mid-level', '').replace('lead', '').strip()
        if not role:
            role = 'Software Engineer'
        
        return JsonResponse({
            "role": role,
            "seniority": seniority,
            "region": region,
            "currency": "TND" if region == "TN" else ("EUR" if region == "EU" else "USD")
        })


# ── POST /api/v1/parse-candidate-query ───────────────────────
@csrf_exempt
@require_POST
def parse_candidate_query(request):
    """Parse natural language candidate search query using LLM."""
    auth_err = _check_api_key(request)
    if auth_err:
        return auth_err
    
    body = _json_body(request)
    query = body.get('query', '')
    
    if not query:
        return JsonResponse({"error": "Query is required"}, status=400)
    
    try:
        from langchain_groq import ChatGroq
        from langchain_core.messages import HumanMessage
        
        llm = ChatGroq(
            model=os.getenv("GROQ_MODEL", "llama-3.1-70b-versatile"),
            api_key=os.getenv("GROQ_API_KEY"),
            temperature=0.1,
        )
        
        prompt = f"""Parse this candidate search query and extract structured information.
Query: "{query}"

Extract:
- search: general search term (role, keywords)
- skills: comma-separated list of technical skills mentioned
- seniority: one of [any, junior, mid, senior, lead] (default: any)

Return JSON only: {{"search": "...", "skills": "...", "seniority": "..."}}"""
        
        response = llm.invoke([HumanMessage(content=prompt)])
        parsed = json.loads(response.content)
        
        return JsonResponse(parsed)
        
    except Exception as e:
        logger.error(f"Candidate query parsing error: {e}")
        # Fallback to simple parsing
        query_lower = query.lower()
        
        # Extract seniority
        seniority = 'any'
        if 'junior' in query_lower or 'jr' in query_lower:
            seniority = 'junior'
        elif 'mid' in query_lower or 'mid-level' in query_lower:
            seniority = 'mid'
        elif 'senior' in query_lower or 'sr' in query_lower:
            seniority = 'senior'
        elif 'lead' in query_lower or 'principal' in query_lower:
            seniority = 'lead'
        
        # Extract common skills
        common_skills = ['python', 'javascript', 'react', 'django', 'node', 'java', 'typescript', 'sql', 'aws', 'docker']
        found_skills = [skill for skill in common_skills if skill in query_lower]
        
        return JsonResponse({
            "search": query,
            "skills": ','.join(found_skills) if found_skills else '',
            "seniority": seniority
        })
