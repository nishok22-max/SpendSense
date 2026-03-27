"""
Email service for SpendSense.
Reads SMTP config from environment variables:
  SMTP_HOST    - SMTP server (default: smtp.gmail.com)
  SMTP_PORT    - SMTP port   (default: 587)
  SMTP_USER    - sender email/username
  SMTP_PASS    - SMTP password / app password
  SMTP_FROM    - display name + address, e.g. "SpendSense <you@gmail.com>"
  FRONTEND_URL - base URL for links (default: http://localhost:3000)
"""
import os
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
SMTP_FROM = os.getenv("SMTP_FROM", f"SpendSense <{SMTP_USER}>")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


def send_email(to: str, subject: str, html_body: str, text_body: str = "") -> None:
    """Send an HTML email via SMTP. Raises on failure."""
    if not SMTP_USER or not SMTP_PASS:
        print(f"[EMAIL - NOT CONFIGURED] To: {to} | Subject: {subject}")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM
    msg["To"] = to

    if text_body:
        msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    context = ssl.create_default_context()
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.ehlo()
        server.starttls(context=context)
        server.login(SMTP_USER, SMTP_PASS)
        server.sendmail(SMTP_USER, to, msg.as_string())


# ── Email Templates ──────────────────────────────────────────────────────────

_BASE_STYLE = """
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #0f0f12; color: #e4e4e7; margin: 0; padding: 0;
"""

def _wrap_template(title: str, content: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title></head>
<body style="{_BASE_STYLE}">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation"
             style="background:#18181b;border-radius:16px;border:1px solid #27272a;overflow:hidden;max-width:560px;width:100%;">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#6d28d9,#7c3aed);padding:32px 40px;text-align:center;">
          <div style="display:inline-flex;align-items:center;justify-content:center;
                      background:rgba(255,255,255,0.15);border-radius:12px;
                      width:48px;height:48px;margin-bottom:12px;">
            <span style="font-size:24px;">✦</span>
          </div>
          <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px;">SpendSense</h1>
          <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.7);">AI Expense Intelligence</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:36px 40px;">
          {content}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 40px 28px;border-top:1px solid #27272a;text-align:center;">
          <p style="margin:0;font-size:12px;color:#71717a;">
            © 2026 SpendSense · This email was sent to you because you have an account with us.<br>
            If you didn't request this, you can safely ignore it.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""


def build_verification_email(name: str, token: str) -> tuple[str, str, str]:
    """Returns (subject, html, text) for email verification."""
    link = f"{FRONTEND_URL}/verify-email?token={token}"
    subject = "Verify your SpendSense account"
    html = _wrap_template(subject, f"""
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#f4f4f5;">
        Welcome, {name}! 🎉
      </h2>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#a1a1aa;">
        Thanks for signing up. One quick step — please verify your email address
        to activate your account and start tracking your expenses.
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="{link}"
           style="display:inline-block;background:linear-gradient(135deg,#6d28d9,#7c3aed);
                  color:#fff;text-decoration:none;font-weight:600;font-size:15px;
                  padding:14px 36px;border-radius:10px;letter-spacing:0.3px;">
          ✉ Verify Email Address
        </a>
      </div>
      <p style="margin:0 0 8px;font-size:13px;color:#71717a;text-align:center;">
        Or copy and paste this link:
      </p>
      <p style="margin:0 0 24px;font-size:12px;color:#6d63f5;word-break:break-all;text-align:center;">
        {link}
      </p>
      <div style="background:#27272a;border-radius:8px;padding:14px 18px;">
        <p style="margin:0;font-size:13px;color:#71717a;">
          ⏱ This link expires in <strong style="color:#a1a1aa;">24 hours</strong>.
          If it expires, you can request a new one from the login page.
        </p>
      </div>
    """)
    text = f"Hi {name},\n\nVerify your SpendSense account by clicking:\n{link}\n\nThis link expires in 24 hours."
    return subject, html, text


def build_reset_email(name: str, token: str) -> tuple[str, str, str]:
    """Returns (subject, html, text) for password reset."""
    link = f"{FRONTEND_URL}/reset-password?token={token}"
    subject = "Reset your SpendSense password"
    html = _wrap_template(subject, f"""
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#f4f4f5;">
        Reset your password
      </h2>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#a1a1aa;">
        Hi {name}, we received a request to reset your SpendSense password.
        Click the button below to choose a new one.
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="{link}"
           style="display:inline-block;background:linear-gradient(135deg,#6d28d9,#7c3aed);
                  color:#fff;text-decoration:none;font-weight:600;font-size:15px;
                  padding:14px 36px;border-radius:10px;letter-spacing:0.3px;">
          🔑 Reset Password
        </a>
      </div>
      <p style="margin:0 0 8px;font-size:13px;color:#71717a;text-align:center;">
        Or copy and paste this link:
      </p>
      <p style="margin:0 0 24px;font-size:12px;color:#6d63f5;word-break:break-all;text-align:center;">
        {link}
      </p>
      <div style="background:#27272a;border-radius:8px;padding:14px 18px;">
        <p style="margin:0;font-size:13px;color:#71717a;">
          ⏱ This link expires in <strong style="color:#a1a1aa;">1 hour</strong>.
          If you didn't request a password reset, ignore this email — your account is safe.
        </p>
      </div>
    """)
    text = f"Hi {name},\n\nReset your SpendSense password:\n{link}\n\nExpires in 1 hour. If you didn't request this, ignore it."
    return subject, html, text
