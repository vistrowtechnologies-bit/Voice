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
