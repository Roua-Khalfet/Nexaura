"""Google OAuth2 authentication for ComplianceGuard."""

import os
from datetime import datetime, timedelta
from typing import Dict
from urllib.parse import urlencode
import requests

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request


# OAuth2 Configuration
SCOPES = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
]

CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/google/callback")


def get_authorization_url() -> tuple:
    """Generate Google OAuth2 authorization URL."""
    params = {
        'client_id': CLIENT_ID,
        'redirect_uri': REDIRECT_URI,
        'response_type': 'code',
        'scope': ' '.join(SCOPES),
        'access_type': 'offline',
        'prompt': 'consent',
        'include_granted_scopes': 'true'
    }
    
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    state = 'no_state'  # Simplified for now
    
    return auth_url, state


def exchange_code_for_tokens(code: str) -> Dict:
    """Exchange authorization code for access and refresh tokens."""
    token_url = "https://oauth2.googleapis.com/token"
    
    data = {
        'code': code,
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
        'redirect_uri': REDIRECT_URI,
        'grant_type': 'authorization_code'
    }
    
    response = requests.post(token_url, data=data)
    response.raise_for_status()
    token_data = response.json()
    
    # Get user info
    headers = {'Authorization': f"Bearer {token_data['access_token']}"}
    user_info_response = requests.get(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        headers=headers
    )
    user_info_response.raise_for_status()
    user_info = user_info_response.json()
    
    return {
        'access_token': token_data['access_token'],
        'refresh_token': token_data.get('refresh_token'),
        'token_expiry': datetime.now() + timedelta(seconds=token_data.get('expires_in', 3600)),
        'email': user_info.get('email'),
        'name': user_info.get('name'),
        'google_id': user_info.get('id'),
        'picture': user_info.get('picture')
    }


def refresh_access_token(refresh_token: str) -> Dict:
    """Refresh expired access token using refresh token."""
    token_url = "https://oauth2.googleapis.com/token"
    
    data = {
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
        'refresh_token': refresh_token,
        'grant_type': 'refresh_token'
    }
    
    response = requests.post(token_url, data=data)
    response.raise_for_status()
    token_data = response.json()
    
    return {
        'access_token': token_data['access_token'],
        'token_expiry': datetime.now() + timedelta(seconds=token_data.get('expires_in', 3600))
    }


def get_valid_credentials(user) -> Credentials:
    """Get valid credentials for user, refreshing if necessary."""
    from django.utils import timezone
    
    credentials = Credentials(
        token=user.access_token,
        refresh_token=user.refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET
    )
    
    # Check if token is expired
    if user.token_expiry and user.token_expiry < timezone.now():
        print(f"🔄 Refreshing expired token for {user.email}")
        credentials.refresh(Request())
        
        # Update stored tokens
        user.access_token = credentials.token
        user.token_expiry = credentials.expiry
        user.save()
    
    return credentials
