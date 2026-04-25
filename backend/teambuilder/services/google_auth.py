"""Google OAuth2 authentication and Gmail API integration."""

import os
import base64
from email.mime.text import MIMEText
from datetime import datetime, timedelta
from typing import Optional, Dict
from urllib.parse import urlencode
import requests

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from google.auth.transport.requests import Request


# OAuth2 Configuration
SCOPES = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly'  # Read emails to monitor responses
]

CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/v1/auth/google/callback")


def get_authorization_url() -> tuple:
    """Generate Google OAuth2 authorization URL without PKCE."""
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


def get_valid_credentials(hr_user) -> Credentials:
    """Get valid credentials for HR user, refreshing if necessary."""
    from api.models import HRUser
    from django.utils import timezone
    
    credentials = Credentials(
        token=hr_user.access_token,
        refresh_token=hr_user.refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET
    )
    
    # Check if token is expired (use timezone-aware datetime)
    if hr_user.token_expiry and hr_user.token_expiry < timezone.now():
        print(f"🔄 Refreshing expired token for {hr_user.email}")
        credentials.refresh(Request())
        
        # Update stored tokens
        hr_user.access_token = credentials.token
        hr_user.token_expiry = credentials.expiry
        hr_user.save()
    
    return credentials


async def send_email_via_gmail_api(
    hr_user,
    to_email: str,
    subject: str,
    body: str
) -> bool:
    """Send email using Gmail API with HR user's credentials.
    
    Args:
        hr_user: HRUser model instance with OAuth tokens
        to_email: Recipient email
        subject: Email subject
        body: Email body (plain text)
        
    Returns:
        True if sent successfully
    """
    from asgiref.sync import sync_to_async
    
    @sync_to_async
    def _send_email_sync():
        try:
            # Get valid credentials (auto-refresh if expired)
            credentials = get_valid_credentials(hr_user)
            
            # Build Gmail service
            service = build('gmail', 'v1', credentials=credentials)
            
            # Create message
            message = MIMEText(body)
            message['to'] = to_email
            message['from'] = hr_user.email
            message['subject'] = subject
            
            # Encode message
            raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')
            
            # Send email
            send_result = service.users().messages().send(
                userId='me',
                body={'raw': raw_message}
            ).execute()
            
            print(f"✅ Email sent via Gmail API! Message ID: {send_result['id']}")
            print(f"   From: {hr_user.email}")
            print(f"   To: {to_email}")
            print(f"   Subject: {subject}")
            
            return True
            
        except Exception as e:
            print(f"❌ Gmail API send error: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    return await _send_email_sync()


def verify_gmail_api_access(hr_user) -> bool:
    """Verify that HR user has valid Gmail API access."""
    try:
        credentials = get_valid_credentials(hr_user)
        service = build('gmail', 'v1', credentials=credentials)
        
        # Test API access
        profile = service.users().getProfile(userId='me').execute()
        print(f"✅ Gmail API access verified for {profile['emailAddress']}")
        return True
        
    except Exception as e:
        print(f"❌ Gmail API access verification failed: {e}")
        return False
