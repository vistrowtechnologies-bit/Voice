"""Small first-party disposable-email guard for self-serve signup.

This deliberately targets established throwaway providers without rejecting
normal free inboxes such as Gmail or Outlook. The environment variable
DISPOSABLE_EMAIL_DOMAINS can add comma-separated domains without a deploy.
Inbox OTP remains the primary proof of ownership; no static list is perfect.
"""

import os

_KNOWN = {
    "10minutemail.com", "10minutemail.net", "dispostable.com", "emailondeck.com",
    "fakeinbox.com", "getnada.com", "guerrillamail.com", "guerrillamailblock.com",
    "maildrop.cc", "mailinator.com", "mailnesia.com", "mintemail.com",
    "moakt.com", "mytemp.email", "sharklasers.com", "temp-mail.org",
    "tempail.com", "tempmail.com", "tempmailo.com", "throwawaymail.com",
    "trashmail.com", "yopmail.com", "yopmail.fr", "yopmail.net",
}


def is_disposable(email: str) -> bool:
    domain = email.rsplit("@", 1)[-1].strip().lower()
    extra = {item.strip().lower() for item in os.environ.get("DISPOSABLE_EMAIL_DOMAINS", "").split(",") if item.strip()}
    domains = _KNOWN | extra
    return any(domain == blocked or domain.endswith(f".{blocked}") for blocked in domains)
