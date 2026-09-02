"""
Spec-to-3D Generator — Email Verification Service (Part 8)
Supports SMTP, Resend, SendGrid, and universal Console Mode fallback.
Zero-setup local development by default; real email via environment variables.
"""

import os
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

logger = logging.getLogger(__name__)


class EmailService:
    """
    Transactional email sender for email verification and one-time security codes.
    """

    @classmethod
    def send_verification_email(cls, to_email: str, code: str) -> bool:
        """
        Send a 6-digit verification code to the recipient.
        Falls back to console mode if no email provider is configured.
        """
        provider = os.getenv("EMAIL_PROVIDER", "").lower().strip()
        smtp_host = os.getenv("SMTP_HOST")
        resend_key = os.getenv("RESEND_API_KEY")
        sendgrid_key = os.getenv("SENDGRID_API_KEY")

        subject = "Your HYDAC Spec-to-3D Verification Code"
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #1e293b; background: #0b132b; color: #ffffff; border-radius: 8px;">
            <h2 style="color: #00f0ff; margin-bottom: 8px;">HYDAC Spec-to-3D Generator</h2>
            <p style="color: #94a3b8; font-size: 14px;">Please use the following 6-digit code to verify your email address:</p>
            <div style="background: rgba(0, 240, 255, 0.1); border: 1px dashed #00f0ff; padding: 16px; text-align: center; border-radius: 6px; margin: 20px 0;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #00f0ff; font-family: monospace;">{code}</span>
            </div>
            <p style="color: #94a3b8; font-size: 13px;">This code will expire in <strong>10 minutes</strong>. If you did not request this code, please ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #1e293b; margin: 20px 0;" />
            <p style="color: #64748b; font-size: 11px;">Deterministic Parametric CAD Engine • Zero Hallucination Guarantee</p>
        </div>
        """
        plain_text = f"Your HYDAC Spec-to-3D verification code is: {code}\n(This code expires in 10 minutes.)"

        # 1. Resend API Provider
        if provider == "resend" or (not provider and resend_key):
            if cls._send_resend(to_email, subject, html_content, plain_text, resend_key):
                return True

        # 2. SendGrid API Provider
        if provider == "sendgrid" or (not provider and sendgrid_key):
            if cls._send_sendgrid(to_email, subject, html_content, plain_text, sendgrid_key):
                return True

        # 3. SMTP Provider
        if provider == "smtp" or (not provider and smtp_host):
            if cls._send_smtp(to_email, subject, html_content, plain_text):
                return True

        # 4. Console Fallback Mode (Default for local development)
        cls._log_console(to_email, code)
        return True

    @classmethod
    def _send_smtp(cls, to_email: str, subject: str, html: str, plain: str) -> bool:
        smtp_host = os.getenv("SMTP_HOST")
        if not smtp_host:
            return False

        smtp_port = int(os.getenv("SMTP_PORT", "587"))
        smtp_user = os.getenv("SMTP_USER", "")
        smtp_password = os.getenv("SMTP_PASSWORD", "")
        smtp_from = os.getenv("SMTP_FROM_EMAIL", smtp_user or "noreply@hydac-cad.com")

        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = smtp_from
            msg["To"] = to_email

            msg.attach(MIMEText(plain, "plain"))
            msg.attach(MIMEText(html, "html"))

            with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                if smtp_user and smtp_password:
                    server.login(smtp_user, smtp_password)
                server.sendmail(smtp_from, [to_email], msg.as_string())

            logger.info(f"Verification email successfully sent via SMTP to {to_email}")
            return True
        except Exception as e:
            logger.warning(f"SMTP email sending failed: {e}. Falling back to console mode.")
            return False

    @classmethod
    def _send_resend(cls, to_email: str, subject: str, html: str, plain: str, api_key: Optional[str]) -> bool:
        if not api_key:
            return False
        try:
            import httpx
            from_email = os.getenv("SMTP_FROM_EMAIL", "onboarding@resend.dev")
            response = httpx.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "from": from_email,
                    "to": [to_email],
                    "subject": subject,
                    "html": html,
                    "text": plain,
                },
                timeout=10.0,
            )
            if response.status_code in (200, 201):
                logger.info(f"Verification email sent via Resend API to {to_email}")
                return True
            else:
                logger.warning(f"Resend API error ({response.status_code}): {response.text}")
                return False
        except Exception as e:
            logger.warning(f"Resend sending failed: {e}")
            return False

    @classmethod
    def _send_sendgrid(cls, to_email: str, subject: str, html: str, plain: str, api_key: Optional[str]) -> bool:
        if not api_key:
            return False
        try:
            import httpx
            from_email = os.getenv("SMTP_FROM_EMAIL", "noreply@hydac-cad.com")
            response = httpx.post(
                "https://api.sendgrid.com/v3/mail/send",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "personalizations": [{"to": [{"email": to_email}]}],
                    "from": {"email": from_email},
                    "subject": subject,
                    "content": [
                        {"type": "text/plain", "value": plain},
                        {"type": "text/html", "value": html},
                    ],
                },
                timeout=10.0,
            )
            if response.status_code in (200, 202):
                logger.info(f"Verification email sent via SendGrid API to {to_email}")
                return True
            else:
                logger.warning(f"SendGrid API error ({response.status_code}): {response.text}")
                return False
        except Exception as e:
            logger.warning(f"SendGrid sending failed: {e}")
            return False

    @classmethod
    def _log_console(cls, to_email: str, code: str) -> None:
        """Fallback logger for local development."""
        msg = f"""
================================================================================
[EMAIL VERIFICATION SERVICE: CONSOLE MODE]
TO:      {to_email}
SUBJECT: Your HYDAC Spec-to-3D Verification Code
CODE:    >>> {code} <<<
STATUS:  Valid for 10 minutes
================================================================================
        """
        print(msg, flush=True)
        logger.info(f"[CONSOLE MODE EMAIL] Verification code for {to_email}: {code}")
