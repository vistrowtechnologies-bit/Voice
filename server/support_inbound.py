"""Email replies to support tickets, threaded back into the ticket.

Without this, a customer hitting Reply in Gmail sent their answer to the
support@ mailbox, the team answered from the mailbox, and the dashboard
thread went stale. Now every ticket email carries a per-ticket Reply-To:

    vv-<ticket id>-<token>@<SUPPORT_REPLY_DOMAIN>

The token is an HMAC of the ticket id, so an address can't be guessed to
post into someone else's ticket. Resend receives mail for that domain and
POSTs an `email.received` webhook (Svix-signed; body not included), we
fetch the email from Resend's Receiving API, strip the quoted history, and
add the new text as a message — from the customer if the sender belongs to
the ticket's workspace, from support if it's the support team.

Off until all of SUPPORT_REPLY_DOMAIN, SUPPORT_REPLY_SECRET and
RESEND_WEBHOOK_SECRET are set (Resend's MX goes on a subdomain because
vistrowvoice.com's own MX serves the company mailbox). Until then emails go
out exactly as before, with no Reply-To.
"""

import base64
import hashlib
import hmac
import json
import logging
import os
import re
import time
import urllib.request

logger = logging.getLogger("vistrow-support-inbound")

_TOLERANCE_S = 5 * 60
_ADDRESS_RE = re.compile(r"^vv-(\d+)-([0-9a-f]{12})@(.+)$", re.IGNORECASE)


def _domain() -> str:
    return (os.environ.get("SUPPORT_REPLY_DOMAIN") or "").strip().lower()


def _secret() -> bytes:
    return (os.environ.get("SUPPORT_REPLY_SECRET") or "").encode()


def enabled() -> bool:
    return bool(_domain() and _secret() and os.environ.get("RESEND_WEBHOOK_SECRET"))


def _token(ticket_id: int) -> str:
    return hmac.new(_secret(), f"ticket:{ticket_id}".encode(), hashlib.sha256).hexdigest()[:12]


def reply_address(ticket_id: int) -> str | None:
    """The per-ticket Reply-To, or None while inbound email isn't set up."""
    if not enabled():
        return None
    return f"vv-{ticket_id}-{_token(ticket_id)}@{_domain()}"


def ticket_id_from(addresses: list[str]) -> int | None:
    """The ticket an email was sent to, only if its token is genuine."""
    for raw in addresses or []:
        addr = raw.split("<")[-1].rstrip(">").strip().lower()
        m = _ADDRESS_RE.match(addr)
        if m and m.group(3) == _domain() and hmac.compare_digest(m.group(2), _token(int(m.group(1)))):
            return int(m.group(1))
    return None


def verify_signature(headers: dict, raw_body: bytes, secret: str | None = None, now: float | None = None) -> bool:
    """Svix scheme, as Resend documents: HMAC-SHA256 over
    "{svix-id}.{svix-timestamp}.{body}" with the base64 part of the
    whsec_ secret; svix-signature holds space-separated "v1,<base64>"."""
    secret = secret if secret is not None else os.environ.get("RESEND_WEBHOOK_SECRET", "")
    msg_id, stamp, sigs = headers.get("svix-id"), headers.get("svix-timestamp"), headers.get("svix-signature")
    if not (secret and msg_id and stamp and sigs):
        return False
    try:
        if abs((now or time.time()) - int(stamp)) > _TOLERANCE_S:
            return False  # stale or replayed
        key = base64.b64decode(secret.split("_", 1)[1] if secret.startswith("whsec_") else secret)
    except (ValueError, TypeError):
        return False
    expected = base64.b64encode(
        hmac.new(key, f"{msg_id}.{stamp}.".encode() + raw_body, hashlib.sha256).digest()
    ).decode()
    for part in sigs.split():
        version, _, signature = part.partition(",")
        if version == "v1" and hmac.compare_digest(signature, expected):
            return True
    return False


_QUOTE_MARKERS = (
    re.compile(r"^On .{0,200}(wrote|a écrit|schrieb):\s*$", re.IGNORECASE),
    re.compile(r"^-{2,}\s*Original Message\s*-{2,}", re.IGNORECASE),
    re.compile(r"^From:\s.+", re.IGNORECASE),  # Outlook's reply header block
    re.compile(r"^_{10,}\s*$"),
)


def strip_quoted(text: str) -> str:
    """Only what the person just wrote: everything from the first quote
    header ("On … wrote:", "-----Original Message-----", Outlook's From:
    block) or run of ">" lines onwards is the previous conversation."""
    lines = (text or "").replace("\r\n", "\n").split("\n")
    out: list[str] = []
    for i, line in enumerate(lines):
        stripped = line.strip()
        # Gmail wraps long "On <date>, <name> <address>" headers, putting
        # "wrote:" alone on the next line.
        joined = stripped + " " + lines[i + 1].strip() if i + 1 < len(lines) else stripped
        if stripped.startswith(">") or any(p.match(stripped) or (stripped.startswith("On ") and p.match(joined)) for p in _QUOTE_MARKERS):
            break
        out.append(line)
    return "\n".join(out).strip()


def fetch_received(email_id: str) -> dict | None:
    """Resend's webhooks carry metadata only; the body comes from the
    Receiving API (GET /emails/receiving/{id})."""
    key = os.environ.get("RESEND_API_KEY")
    if not key:
        return None
    req = urllib.request.Request(
        f"https://api.resend.com/emails/receiving/{email_id}",
        headers={"Authorization": f"Bearer {key}", "User-Agent": "Vistrow-Voice/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except Exception:
        logger.exception("could not fetch received email %s", email_id)
        return None


def is_auto_reply(email: dict) -> bool:
    """Out-of-office and mailer-daemon replies must not become messages."""
    headers = {str(k).lower(): str(v).lower() for k, v in (email.get("headers") or {}).items()} if isinstance(email.get("headers"), dict) else {}
    auto = headers.get("auto-submitted", "no")
    return auto != "no" or "x-autoreply" in headers or headers.get("precedence") in ("auto_reply", "bulk", "junk")


def sender_address(value) -> str:
    raw = value.get("email") if isinstance(value, dict) else str(value or "")
    return raw.split("<")[-1].rstrip(">").strip().lower()
