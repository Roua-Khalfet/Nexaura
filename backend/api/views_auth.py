"""Authentication views for ComplianceGuard."""

import os
import logging
from django.http import JsonResponse
from django.shortcuts import redirect
from django.views.decorators.http import require_GET
from django.views.decorators.csrf import csrf_exempt

logger = logging.getLogger(__name__)


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
    from api.models_auth import ComplianceUser
    
    frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
    code = request.GET.get('code')
    error = request.GET.get('error')
    
    if error:
        return redirect(f"{frontend_url}/login?error={error}")
    
    if not code:
        return redirect(f"{frontend_url}/login?error=no_code")
    
    try:
        # Exchange code for tokens
        token_data = exchange_code_for_tokens(code)
        
        # Create or update user
        user, created = ComplianceUser.objects.update_or_create(
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
        request.session['user_id'] = str(user.id)
        request.session.save()
        
        logger.info(f"User {'created' if created else 'logged in'}: {user.email}")
        
        # Redirect to frontend with success
        return redirect(f"{frontend_url}/?login=success")
        
    except Exception as e:
        logger.error(f"OAuth callback error: {e}")
        return redirect(f"{frontend_url}/login?error=auth_failed")


@require_GET
def get_current_user(request):
    """Get currently logged in user."""
    from api.models_auth import ComplianceUser
    
    user_id = request.session.get('user_id')
    
    if not user_id:
        return JsonResponse({"error": "Not authenticated"}, status=401)
    
    try:
        user = ComplianceUser.objects.get(id=user_id)
        return JsonResponse({
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "picture": user.profile_picture,
            "last_login": str(user.last_login)
        })
    except ComplianceUser.DoesNotExist:
        return JsonResponse({"error": "User not found"}, status=404)


@csrf_exempt
@require_GET
def google_logout(request):
    """Logout user by clearing session."""
    request.session.flush()
    return JsonResponse({"status": "logged_out"})
