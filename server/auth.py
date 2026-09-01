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


_DEV_FALLBACK_SECRET = "dev-insecure-secret-change-me"


def _secret() -> bytes:
    # A stable secret across restarts is required or every deploy logs
    # everyone out. Set AUTH_SECRET in prod; the dev fallback is fixed (not
    # random) so local sessions survive a reload, and is clearly not for prod.
    #
    # HARD GUARD: session tokens are HMAC-signed with this value, so if it
    # ever falls back to the public hardcoded string in a deployed
    # environment, ANYONE reading this source can forge a session cookie for
    # any user_id/account_id — a full auth bypass, including platform-owner
    # admin. Refuse to run on a deploy (any RAILWAY_* / FLY_* / RENDER /
    # K_SERVICE marker present) unless AUTH_SECRET is explicitly set, so this
    # can never silently ship insecure again. Local dev (no such marker) still
    # gets the convenient fixed fallback.
    configured = os.environ.get("AUTH_SECRET")
    if configured:
        return configured.encode()
    deployed = any(
        os.environ.get(k)
        for k in ("RAILWAY_ENVIRONMENT", "RAILWAY_SERVICE_ID", "FLY_APP_NAME", "RENDER", "K_SERVICE")
    )
    if deployed:
        raise RuntimeError(
            "AUTH_SECRET is not set in a deployed environment. Session tokens would be "
            "signed with a public hardcoded fallback, allowing anyone to forge admin "
            "sessions. Set AUTH_SECRET to a strong random value (e.g. "
            "`python3 -c 'import secrets; print(secrets.token_urlsafe(48))'`) and redeploy."
        )
    return _DEV_FALLBACK_SECRET.encode()


def make_session_token(
    user_id: int,
    account_id: int,
    impersonator_id: int | None = None,
    session_version: int = 1,
    session_id: str | None = None,
) -> str:
    """`impersonator_id`, when set, marks this as a super-admin support session:
    uid/aid point at the TARGET tenant (so every tenant route works unchanged),
    while `imp` records the real platform-owner user driving it. read_session_token
    surfaces it so /auth/me can show the support banner and gate the exit."""
    payload = {"uid": user_id, "aid": account_id, "sv": session_version, "exp": int(time.time()) + SESSION_TTL_SECONDS}
    if impersonator_id is not None:
        payload["imp"] = impersonator_id
    if session_id is not None:
        payload["sid"] = session_id
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def read_session_token(token: str | None) -> dict | None:
    """Returns {'uid', 'aid', 'imp'} if the token is well-formed, correctly
    signed, and unexpired; otherwise None. `imp` is None for a normal session."""
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
    return {
        "uid": payload.get("uid"),
        "aid": payload.get("aid"),
        "imp": payload.get("imp"),
        "sv": payload.get("sv", 1),
        "sid": payload.get("sid"),
    }


# --- helpers ----------------------------------------------------------


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))
