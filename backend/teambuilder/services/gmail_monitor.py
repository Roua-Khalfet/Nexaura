"""Gmail conversation monitoring to track candidate responses."""

import re
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from asgiref.sync import sync_to_async

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from django.utils import timezone

from services.google_auth import get_valid_credentials


def extract_candidate_email_from_thread(messages: List[Dict]) -> Optional[str]:
    """Extract candidate email from thread messages."""
    for msg in messages:
        headers = msg.get('payload', {}).get('headers', [])
        for header in headers:
            if header['name'].lower() == 'from':
                # Extract email from "Name <email@domain.com>" format
                match = re.search(r'<(.+?)>', header['value'])
                if match:
                    return match.group(1).lower()
                return header['value'].lower()
    return None


def analyze_response_sentiment(body: str) -> str:
    """Analyze email body to determine if candidate is interested or not.
    
    Returns: 'interested', 'not_interested', or 'unclear'
    """
    body_lower = body.lower()
    
    # Positive keywords (interest)
    interest_keywords = [
        'yes', 'oui', 'interested', 'intéressé', 'accept', 'accepte',
        'disponible', 'available', 'would love', 'sounds great',
        'let\'s discuss', 'discutons', 'when can we', 'quand pouvons',
        'i\'m in', 'count me in', 'd\'accord', 'parfait', 'tell me more',
        'more information', 'plus d\'informations'
    ]
    
    # Negative keywords (not interested)
    not_interest_keywords = [
        'no thank', 'non merci', 'not interested', 'pas intéressé',
        'decline', 'refuse', 'unfortunately', 'malheureusement',
        'can\'t', 'cannot', 'ne peux pas', 'not available',
        'pas disponible', 'already accepted', 'déjà accepté'
    ]
    
    interest_score = sum(1 for keyword in interest_keywords if keyword in body_lower)
    not_interest_score = sum(1 for keyword in not_interest_keywords if keyword in body_lower)
    
    if interest_score > not_interest_score and interest_score > 0:
        return 'interested'
    elif not_interest_score > interest_score and not_interest_score > 0:
        return 'not_interested'
    else:
        return 'unclear'


def get_message_body(message: Dict) -> str:
    """Extract plain text body from Gmail message."""
    payload = message.get('payload', {})
    
    # Try to get plain text part
    if 'parts' in payload:
        for part in payload['parts']:
            if part.get('mimeType') == 'text/plain':
                data = part.get('body', {}).get('data', '')
                if data:
                    import base64
                    return base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
    
    # Fallback to body data
    data = payload.get('body', {}).get('data', '')
    if data:
        import base64
        return base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
    
    return ''


async def check_candidate_responses(hr_user) -> List[Dict]:
    """Check Gmail for candidate responses and return status updates.
    
    Returns list of dicts with:
    - candidate_email: str
    - status: 'interested' or 'not_interested'
    - message_snippet: str
    - received_at: datetime
    """
    from asgiref.sync import sync_to_async
    
    @sync_to_async
    def _check_responses_sync():
        try:
            credentials = get_valid_credentials(hr_user)
            service = build('gmail', 'v1', credentials=credentials)
            
            # Search for emails received in last 7 days
            # that are replies to our invitation emails
            query = 'is:inbox newer_than:7d'
            
            results = service.users().messages().list(
                userId='me',
                q=query,
                maxResults=50
            ).execute()
            
            messages = results.get('messages', [])
            updates = []
            
            for msg_ref in messages:
                # Get full message
                message = service.users().messages().get(
                    userId='me',
                    id=msg_ref['id'],
                    format='full'
                ).execute()
                
                # Extract headers
                headers = message.get('payload', {}).get('headers', [])
                subject = ''
                from_email = ''
                date_str = ''
                
                for header in headers:
                    if header['name'].lower() == 'subject':
                        subject = header['value']
                    elif header['name'].lower() == 'from':
                        from_email = header['value']
                    elif header['name'].lower() == 'date':
                        date_str = header['value']
                
                # Check if this is a reply to our invitation
                # (subject contains "Re:" and mentions job/opportunity)
                if not subject.lower().startswith('re:'):
                    continue
                
                if 'opportunit' not in subject.lower() and 'poste' not in subject.lower():
                    continue
                
                # Extract candidate email
                email_match = re.search(r'<(.+?)>', from_email)
                candidate_email = email_match.group(1).lower() if email_match else from_email.lower()
                
                # Get message body
                body = get_message_body(message)
                
                # Analyze sentiment
                sentiment = analyze_response_sentiment(body)
                
                if sentiment in ['interested', 'not_interested']:
                    updates.append({
                        'candidate_email': candidate_email,
                        'status': sentiment,
                        'message_snippet': message.get('snippet', '')[:200],
                        'received_at': timezone.now(),
                        'gmail_message_id': message['id']
                    })
            
            print(f"📧 Checked Gmail: Found {len(updates)} candidate responses")
            return updates
            
        except Exception as e:
            print(f"❌ Gmail monitoring error: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    return await _check_responses_sync()


async def sync_candidate_statuses(hr_user):
    """Sync candidate statuses based on Gmail responses.
    
    This function:
    1. Checks Gmail for candidate replies
    2. Updates Candidate and CandidateNotification models
    3. Returns summary of updates
    """
    from api.models import Candidate, CandidateNotification
    from asgiref.sync import sync_to_async
    
    # Get responses from Gmail
    responses = await check_candidate_responses(hr_user)
    
    if not responses:
        return {'updated': 0, 'message': 'No new responses found'}
    
    updated_count = 0
    
    for response in responses:
        candidate_email = response['candidate_email']
        new_status = response['status']
        
        # Find notification by sent_to_email (the actual email used, not candidate.email)
        @sync_to_async
        def update_candidate():
            nonlocal updated_count
            try:
                # Search by sent_to_email field (the edited email we actually sent to)
                notification = CandidateNotification.objects.filter(
                    sent_to_email__iexact=candidate_email,
                    candidate__hr_user=hr_user,
                    status='pending'
                ).order_by('-sent_at').first()
                
                if not notification:
                    print(f"⚠️  No pending notification found for email: {candidate_email}")
                    return False
                
                # Update notification status
                notification.status = new_status
                notification.responded_at = response['received_at']
                notification.save()
                
                updated_count += 1
                print(f"✅ Updated {notification.candidate.name} ({candidate_email}) → {new_status}")
                print(f"   Message: {response['message_snippet']}")
                return True
                    
            except Exception as e:
                print(f"❌ Error updating notification for {candidate_email}: {e}")
                return False
        
        await update_candidate()
    
    return {
        'updated': updated_count,
        'total_responses': len(responses),
        'message': f'Updated {updated_count} candidate(s) from Gmail responses'
    }
