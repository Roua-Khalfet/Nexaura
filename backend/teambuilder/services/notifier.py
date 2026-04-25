"""Notification service for sending emails and WhatsApp messages to candidates."""

import os
import secrets
from datetime import datetime
from typing import Optional


def generate_response_token() -> str:
    """Generate a secure random token for candidate response tracking."""
    return secrets.token_urlsafe(32)


async def notify_candidate(candidate, role_title: str, salary_range: str, session_id: str, custom_message: str = None, hr_user=None, override_email: str = None) -> dict:
    """Send notification to candidate via email or WhatsApp.
    
    LOGIC:
    1. Check if candidate has email AND prefers email → Send Email
    2. If no email OR email failed → Check if has phone → Send WhatsApp
    3. If neither works → Raise error
    
    Args:
        candidate: Candidate model instance
        role_title: Title of the role
        salary_range: Estimated salary range
        session_id: Session ID for tracking
        custom_message: Optional custom message from HR (overrides default)
        hr_user: Optional HRUser instance (if logged in, uses Gmail API)
        override_email: Optional email to use instead of candidate.email (for edited emails)
        
    Returns:
        dict with status, type, and token
    """
    from api.models import CandidateNotification
    
    # Use override email if provided, otherwise use candidate's email
    actual_email = override_email or candidate.email
    
    # Generate unique response token
    token = generate_response_token()
    base_url = os.getenv("BASE_URL", "http://localhost:5173")
    response_url = f"{base_url}/candidate/respond/{token}"
    
    # Use custom message if provided, otherwise use default template
    if custom_message:
        message = f"""
Bonjour {candidate.name},

{custom_message}

Poste: {role_title}
Salaire estimé: {salary_range}

Êtes-vous intéressé(e) pour en discuter? Répondez ici: {response_url}

Cordialement,
L'équipe Team Builder
"""
    else:
        # Default professional message
        message = f"""
Bonjour {candidate.name},

Nous avons le plaisir de vous informer que votre profil a été sélectionné pour le poste de {role_title}.

Détails du poste:
• Titre: {role_title}
• Niveau: {candidate.seniority or 'À définir'}
• Rémunération estimée: {salary_range}

Nous aimerions discuter avec vous de cette opportunité et en savoir plus sur votre disponibilité.

Êtes-vous intéressé(e)? Merci de nous faire part de votre réponse en cliquant sur le lien ci-dessous:
{response_url}

Nous restons à votre disposition pour toute question.

Cordialement,
L'équipe Team Builder
"""
    
    notification_type = None
    error_message = None
    
    # PRIORITY 1: Try Email first (if available and preferred)
    if actual_email and candidate.preferred_contact in ['email', 'both']:
        try:
            # Use Gmail API if HR user is logged in, otherwise use SMTP
            if hr_user:
                from services.google_auth import send_email_via_gmail_api
                success = await send_email_via_gmail_api(
                    hr_user=hr_user,
                    to_email=actual_email,
                    subject=f"Opportunité: {role_title}",
                    body=message
                )
            else:
                success = await send_email(
                    to_email=actual_email,
                    subject=f"Opportunité: {role_title}",
                    body=message
                )
            
            if success:
                notification_type = 'email'
                print(f"✅ Email sent to {actual_email}")
        except Exception as e:
            error_message = f"Email failed: {str(e)}"
            print(f"❌ Email failed for {actual_email}: {e}")
    
    # PRIORITY 2: Fallback to WhatsApp (if email not sent and phone available)
    if not notification_type and candidate.phone:
        try:
            success = await send_whatsapp(candidate.phone, message)
            if success:
                notification_type = 'whatsapp'
                print(f"✅ WhatsApp sent to {candidate.phone}")
        except Exception as e:
            error_message = f"WhatsApp failed: {str(e)}"
            print(f"❌ WhatsApp failed for {candidate.phone}: {e}")
    
    # PRIORITY 3: If both failed, raise error
    if not notification_type:
        error_details = []
        if not actual_email and not candidate.phone:
            error_details.append("No contact information available")
        if actual_email and not notification_type:
            error_details.append(f"Email: {error_message or 'Failed'}")
        if candidate.phone and not notification_type:
            error_details.append(f"WhatsApp: {error_message or 'Failed'}")
        
        raise ValueError(
            f"Could not contact candidate {candidate.name}. " + 
            " | ".join(error_details)
        )
    
    # Save notification to database (wrap in sync_to_async)
    from asgiref.sync import sync_to_async
    
    @sync_to_async
    def create_notification():
        return CandidateNotification.objects.create(
            candidate=candidate,
            session_id=session_id,
            role_title=role_title,
            notification_type=notification_type,
            sent_to_email=actual_email if notification_type == 'email' else None,  # Store the actual email used (edited or original)
            response_token=token,
            message=message,
            status='pending'  # Changed from 'sent' to 'pending'
        )
    
    notification = await create_notification()
    
    return {
        "status": "sent",
        "type": notification_type,
        "token": token,
        "notification_id": str(notification.id),
        "contact": actual_email if notification_type == 'email' else candidate.phone
    }


async def send_email(to_email: str, subject: str, body: str) -> bool:
    """Send email using Django's email backend.
    
    For development: Emails are printed to console
    For production: Configure SMTP settings in settings.py
    """
    try:
        from django.core.mail import send_mail
        from django.conf import settings
        
        send_mail(
            subject=subject,
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[to_email],
            fail_silently=False,
        )
        return True
    except Exception as e:
        print(f"❌ Email send error: {e}")
        return False


async def send_whatsapp(to_phone: str, message: str) -> bool:
    """Send WhatsApp message via Twilio.
    
    Setup:
    1. Create Twilio account: https://www.twilio.com/try-twilio
    2. Get WhatsApp sandbox number: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn
    3. Add to .env:
       TWILIO_ACCOUNT_SID=your_sid
       TWILIO_AUTH_TOKEN=your_token
       TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
    
    Free tier: 1000 messages/month
    """
    
    # Check if Twilio is configured
    TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
    TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
    TWILIO_WHATSAPP_FROM = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")
    
    if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN:
        print(f"⚠️  Twilio not configured. WhatsApp message would be sent to: {to_phone}")
        print(f"📱 Message: {message[:100]}...")
        # For development: Just log the message
        return True
    
    try:
        from twilio.rest import Client
        
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        
        # Ensure phone number has whatsapp: prefix
        if not to_phone.startswith('whatsapp:'):
            to_phone = f"whatsapp:{to_phone}"
        
        message_obj = client.messages.create(
            from_=TWILIO_WHATSAPP_FROM,
            body=message,
            to=to_phone
        )
        
        print(f"✅ WhatsApp sent! SID: {message_obj.sid}")
        return True
        
    except Exception as e:
        print(f"❌ WhatsApp send error: {e}")
        return False


def record_response(token: str, action: str) -> bool:
    """Record candidate response (accept/refuse).
    
    Args:
        token: Response token from notification
        action: 'accept' or 'refuse'
        
    Returns:
        True if successful
    """
    from api.models import CandidateNotification
    from django.utils import timezone
    
    try:
        notification = CandidateNotification.objects.get(response_token=token)
        notification.status = 'accepted' if action == 'accept' else 'refused'
        notification.responded_at = timezone.now()
        notification.save()
        
        print(f"✅ Candidate response recorded: {action} for {notification.candidate.name}")
        return True
    except CandidateNotification.DoesNotExist:
        print(f"❌ Invalid token: {token}")
        return False
