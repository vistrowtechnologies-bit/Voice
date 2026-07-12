"""Pluggable transactional-email sender.

Deliberately stdlib-only (urllib), same reasoning as kb_extract/auth — the
server image stays lean and deploy-fragile-free. Two backends, picked by which
env vars are set:

- Resend (recommended): set RESEND_API_KEY (+ optional EMAIL_FROM).
- SMTP: set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD (+ EMAIL_FROM).

When neither is configured, send_email logs the message (so a reset link is at
least recoverable from server logs during setup) and returns False. Every
caller treats a False as "couldn't deliver" but never crashes — email is an
enhancement, not a hard dependency.
"""

import json
import logging
import os
import smtplib
import urllib.error
import urllib.request
from email.message import EmailMessage

logger = logging.getLogger("vistrow-email")

_DEFAULT_FROM = "Vistrow Voice <noreply@vistrow.ai>"


def is_configured() -> bool:
    return bool(os.environ.get("RESEND_API_KEY") or os.environ.get("SMTP_HOST"))


def _from_address() -> str:
    return os.environ.get("EMAIL_FROM") or _DEFAULT_FROM


# Mirrors web-demo/src/index.css's dark-theme tokens so transactional email
# looks like the product, not a bare system notification.
_BG = "#0a0a12"
_SURFACE = "#17121f"
_BORDER = "#2a2438"
_PRIMARY = "#a855f7"
TEXT = "#f5f3ff"
_TEXT_MUTED = "#9089b0"


def render_email(*, preheader: str, heading: str, body_html: str, cta_label: str | None = None, cta_url: str | None = None) -> str:
    """Wrap transactional content in the app's dark card layout.

    Table-based + inline styles throughout since Gmail/Outlook strip <style>
    blocks in the <head>. `body_html` is caller-provided raw HTML (paragraphs,
    bold, etc.) — every call site in this codebase passes static/trusted copy.
    """
    cta_block = ""
    if cta_label and cta_url:
        cta_block = f"""
        <tr><td style="padding:28px 0 4px;">
          <a href="{cta_url}" style="display:inline-block;background:{_PRIMARY};color:{_BG};
            font-weight:700;font-size:15px;text-decoration:none;padding:14px 28px;border-radius:10px;">
            {cta_label}
          </a>
        </td></tr>
        <tr><td style="padding:14px 0 0;font-size:12px;color:{_TEXT_MUTED};word-break:break-all;">
          Or paste this link into your browser:<br/>
          <a href="{cta_url}" style="color:{_TEXT_MUTED};">{cta_url}</a>
        </td></tr>"""

    return f"""<!doctype html>
<html>
<body style="margin:0;padding:0;background:{_BG};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">{preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{_BG};padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0"
        style="max-width:480px;width:100%;background:{_SURFACE};border:1px solid {_BORDER};border-radius:16px;padding:36px;">
        <tr><td>
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:32px;height:32px;background:{_PRIMARY};border-radius:8px;" align="center" valign="middle">
                <span style="font-size:14px;line-height:32px;">&#127911;</span>
              </td>
              <td style="padding-left:10px;font-size:16px;font-weight:700;color:{TEXT};">Vistrow Voice</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding-top:28px;font-size:21px;font-weight:700;color:{TEXT};line-height:1.3;">{heading}</td></tr>
        <tr><td style="padding-top:12px;font-size:15px;line-height:1.65;color:{_TEXT_MUTED};">{body_html}</td></tr>
        {cta_block}
        <tr><td style="padding-top:32px;border-top:1px solid {_BORDER};margin-top:28px;"></td></tr>
        <tr><td style="padding-top:16px;font-size:12px;color:{_TEXT_MUTED};">
          &copy; 2026 Vistrow Voice. All rights reserved.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def send_email(to: str, subject: str, html: str) -> bool:
    """Best-effort send. Returns True only on a confirmed handoff to a provider."""
    resend_key = os.environ.get("RESEND_API_KEY")
    if resend_key:
        return _send_resend(resend_key, to, subject, html)
    if os.environ.get("SMTP_HOST"):
        return _send_smtp(to, subject, html)
    logger.warning(
        "email not configured — would have sent to %s: %r. Set RESEND_API_KEY or SMTP_* to enable.",
        to,
        subject,
    )
    return False


def _send_resend(api_key: str, to: str, subject: str, html: str) -> bool:
    payload = json.dumps({"from": _from_address(), "to": [to], "subject": subject, "html": html}).encode()
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            # Cloudflare (in front of api.resend.com) blocks the default
            # "Python-urllib/3.x" UA as a bot signature (error code 1010).
            "User-Agent": "Vistrow-Voice/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            ok = 200 <= resp.status < 300
        if ok:
            logger.info("sent email to %s via Resend: %r", to, subject)
        return ok
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        logger.warning("Resend send failed for %s: HTTP %s %s", to, e.code, body)
        return False
    except (urllib.error.URLError, TimeoutError):
        logger.warning("Resend send failed for %s", to, exc_info=True)
        return False


def _send_smtp(to: str, subject: str, html: str) -> bool:
    host = os.environ["SMTP_HOST"]
    port = int(os.environ.get("SMTP_PORT") or 587)
    user = os.environ.get("SMTP_USER")
    password = os.environ.get("SMTP_PASSWORD")
    msg = EmailMessage()
    msg["From"] = _from_address()
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content("This message requires an HTML-capable email client.")
    msg.add_alternative(html, subtype="html")
    try:
        with smtplib.SMTP(host, port, timeout=10) as server:
            server.starttls()
            if user and password:
                server.login(user, password)
            server.send_message(msg)
        logger.info("sent email to %s via SMTP: %r", to, subject)
        return True
    except (smtplib.SMTPException, OSError):
        logger.warning("SMTP send failed for %s", to, exc_info=True)
        return False
