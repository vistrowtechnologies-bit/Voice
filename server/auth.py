"""In-house auth primitives — password hashing + signed session tokens.

Deliberately stdlib-only (hashlib + hmac), same reasoning as kb_extract's
urllib: the server image ships fastapi + livekit-api and nothing else, and
pulling in bcrypt (needs a C build) or PyJWT for two small jobs isn't worth
the deploy fragility. pbkdf2-hmac-sha256 with a high iteration count is a
sound, widely-used password KDF; the session token is a compact HMAC-signed
payload (a JWT in spirit, minus the library).

Swap this for bcrypt/argon2 + PyJWT later if desired — hash_password and
make_session_token are the only two seams that would change.
"""

import base64
import hashlib
import hmac
import json
import os
import secrets
import time

# --- password hashing -------------------------------------------------

# OWASP-recommended-order iteration count for pbkdf2-sha256. High enough to
# make offline cracking expensive, low enough to stay well under a login
# request's latency budget.
_PBKDF2_ITERATIONS = 240_000
_SALT_BYTES = 16


def hash_password(password: str) -> str:
    """Returns 'pbkdf2_sha256$<iterations>$<salt_b64>$<hash_b64>' — everything
    verify_password needs is encoded in the string, so the users table stores
    one column."""
    salt = secrets.token_bytes(_SALT_BYTES)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${_PBKDF2_ITERATIONS}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters, salt_b64, hash_b64 = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        expected = _unb64(hash_b64)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), _unb64(salt_b64), int(iters))
        return hmac.compare_digest(expected, actual)
    except (ValueError, TypeError):
        return False


# --- session tokens ---------------------------------------------------

COOKIE_NAME = "vv_session"
SESSION_TTL_SECONDS = 30 * 24 * 3600  # 30 days


def _secret() -> bytes:
    # A stable secret across restarts is required or every deploy logs
    # everyone out. Set AUTH_SECRET in prod; the dev fallback is fixed (not
    # random) so local sessions survive a reload, and is clearly not for prod.
    return (os.environ.get("AUTH_SECRET") or "dev-insecure-secret-change-me").encode()


def make_session_token(user_id: int, account_id: int) -> str:
    payload = {"uid": user_id, "aid": account_id, "exp": int(time.time()) + SESSION_TTL_SECONDS}
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def read_session_token(token: str | None) -> dict | None:
    """Returns {'uid', 'aid'} if the token is well-formed, correctly signed,
    and unexpired; otherwise None."""
    if not token or "." not in token:
        return None
    body, _, sig = token.partition(".")
    expected_sig = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected_sig):
        return None
    try:
        payload = json.loads(_unb64(body))
    except (ValueError, TypeError):
        return None
    if payload.get("exp", 0) < int(time.time()):
        return None
    return {"uid": payload.get("uid"), "aid": payload.get("aid")}


# --- helpers ----------------------------------------------------------


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))
