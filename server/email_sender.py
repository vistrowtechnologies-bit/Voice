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

_DEFAULT_FROM = "Vistrow Voice <noreply@vistrowvoice.com>"

# Distinct From identities per email category — same verified domain
# (vistrowvoice.com), different local part, so a recipient can tell at a
# glance what kind of email this is before even opening it, and so replies
# to each naturally land somewhere sensible (nobody should ever reply to a
# password-reset email, but a contact-form notification is fair game).
# EMAIL_FROM (if set) still overrides everything, same as before — these are
# just better-labeled defaults, not a new configuration surface.
FROM_ACCOUNT_SECURITY = "Vistrow Voice <security@vistrowvoice.com>"  # password reset
FROM_EMAIL_VERIFICATION = "Vistrow Voice <verify@vistrowvoice.com>"  # signup OTP
FROM_INVITES = "Vistrow Voice <invites@vistrowvoice.com>"  # team member invites
FROM_WEBSITE = "Vistrow Voice Website <contact@vistrowvoice.com>"  # contact-form notifications


def is_configured() -> bool:
    return bool(os.environ.get("RESEND_API_KEY") or os.environ.get("SMTP_HOST"))


def _from_address(default: str = _DEFAULT_FROM) -> str:
    # EMAIL_FROM is an escape hatch for an operator who wants every outbound
    # email from one single address they control (e.g. their own domain
    # isn't set up yet) — it deliberately overrides even a category-specific
    # `default` passed by the caller.
    return os.environ.get("EMAIL_FROM") or default


# Transactional email deliberately uses a light surface even though the
# dashboard defaults dark: inboxes are reading environments, and this gives
# stronger contrast in Gmail/Outlook while retaining Vistrow's purple-pink
# identity. The mark is an already-public, cacheable brand asset so email
# clients can proxy it safely without embedding a bulky base64 image.
_BG = "#f6f3ff"
_SURFACE = "#ffffff"
_BORDER = "#e8e0f4"
_PRIMARY = "#7c3aed"
_PRIMARY_PINK = "#db2777"
TEXT = "#171122"
_TEXT_MUTED = "#625a73"
_LOGO_URL = os.environ.get("EMAIL_LOGO_URL") or "https://www.vistrowvoice.com/apple-touch-icon.png"
_WEBSITE_URL = "https://www.vistrowvoice.com"
_APP_URL = "https://app.vistrowvoice.com"
_SUPPORT_EMAIL = "support@vistrowvoice.com"


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
          <a href="{cta_url}" style="display:inline-block;background-color:{_PRIMARY};
            background-image:linear-gradient(105deg,{_PRIMARY} 0%,#a832e8 52%,{_PRIMARY_PINK} 100%);color:#ffffff;
            font-weight:700;font-size:15px;text-decoration:none;padding:14px 28px;border-radius:10px;
            box-shadow:0 8px 22px rgba(124,58,237,.24);">
            {cta_label}
          </a>
        </td></tr>
        <tr><td style="padding:16px 0 0;font-size:12px;line-height:1.6;color:#817891;word-break:break-all;">
          Or paste this link into your browser:<br/>
          <a href="{cta_url}" style="color:{_PRIMARY};">{cta_url}</a>
        </td></tr>"""

    return f"""<!doctype html>
<html>
<body style="margin:0;padding:0;background:{_BG};font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">{preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{_BG};padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0"
        style="max-width:480px;width:100%;background:{_SURFACE};border:1px solid {_BORDER};border-radius:18px;
        box-shadow:0 18px 50px rgba(62,35,91,.10);overflow:hidden;">
        <tr><td height="5" style="height:5px;line-height:5px;font-size:0;background-color:{_PRIMARY};
          background-image:linear-gradient(90deg,{_PRIMARY} 0%,#a832e8 50%,{_PRIMARY_PINK} 100%);">&nbsp;</td></tr>
        <tr><td style="padding:32px 36px 36px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td>
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:42px;height:42px;" align="center" valign="middle">
                <a href="{_WEBSITE_URL}" style="text-decoration:none;">
                  <img src="{_LOGO_URL}" width="42" height="42" alt="Vistrow Voice"
                    style="display:block;width:42px;height:42px;border:0;border-radius:10px;" />
                </a>
              </td>
              <td style="padding-left:12px;font-size:17px;font-weight:750;color:{TEXT};letter-spacing:-.2px;">
                <a href="{_WEBSITE_URL}" style="color:{TEXT};text-decoration:none;">Vistrow Voice</a>
              </td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding-top:30px;font-size:24px;font-weight:750;color:{TEXT};line-height:1.3;letter-spacing:-.35px;">{heading}</td></tr>
        <tr><td style="padding-top:12px;font-size:15px;line-height:1.7;color:{_TEXT_MUTED};">{body_html}</td></tr>
        {cta_block}
        <tr><td style="padding-top:34px;"><div style="height:1px;background:{_BORDER};font-size:0;line-height:0;">&nbsp;</div></td></tr>
        <tr><td style="padding-top:18px;font-size:12px;line-height:1.7;color:#817891;">
          Need help? <a href="mailto:{_SUPPORT_EMAIL}" style="color:{_PRIMARY};text-decoration:none;">{_SUPPORT_EMAIL}</a><br/>
          <a href="{_APP_URL}" style="color:#817891;text-decoration:none;">Open dashboard</a>
          &nbsp;&middot;&nbsp;
          <a href="{_WEBSITE_URL}/privacy" style="color:#817891;text-decoration:none;">Privacy</a><br/>
          <span style="display:inline-block;padding-top:8px;">&copy; 2026 Vistrow Voice. Built for Bharat.</span>
        </td></tr>
        </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def send_email(to: str, subject: str, html: str, from_address: str = _DEFAULT_FROM) -> bool:
    """Best-effort send. Returns True only on a confirmed handoff to a provider.

    `from_address` picks the category-specific identity (see FROM_* constants
    above) — e.g. password resets come from security@, invites from
    invites@. Still overridden globally by EMAIL_FROM if that's set."""
    resend_key = os.environ.get("RESEND_API_KEY")
    if resend_key:
        return _send_resend(resend_key, to, subject, html, from_address)
    if os.environ.get("SMTP_HOST"):
        return _send_smtp(to, subject, html, from_address)
    logger.warning(
        "email not configured — would have sent to %s: %r. Set RESEND_API_KEY or SMTP_* to enable.",
        to,
        subject,
    )
    return False


def _send_resend(api_key: str, to: str, subject: str, html: str, from_address: str = _DEFAULT_FROM) -> bool:
    payload = json.dumps(
        {"from": _from_address(from_address), "to": [to], "subject": subject, "html": html}
    ).encode()
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


def _send_smtp(to: str, subject: str, html: str, from_address: str = _DEFAULT_FROM) -> bool:
    host = os.environ["SMTP_HOST"]
    port = int(os.environ.get("SMTP_PORT") or 587)
    user = os.environ.get("SMTP_USER")
    password = os.environ.get("SMTP_PASSWORD")
    msg = EmailMessage()
    msg["From"] = _from_address(from_address)
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
