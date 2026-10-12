"""Two-step login (TOTP, RFC 6238) and recovery codes.

Authenticator-app codes: 6 digits, 30-second steps, one step of clock drift
either way, and a step can't be used twice (users.mfa_last_step). The secret
is stored encrypted (AES-GCM, key derived from AUTH_SECRET) so a database
leak alone doesn't hand out working codes. Recovery codes are stored hashed
and each works once. Added after the 2026-10-12 security audit; required for
the platform owner on /admin.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import struct
import time
import urllib.parse

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

import auth

ISSUER = "Vistrow Voice"
STEP_SECONDS = 30
DIGITS = 6
RECOVERY_CODE_COUNT = 10


def _key() -> bytes:
    return hashlib.sha256(auth._secret() + b"|mfa-secret-v1").digest()


def encrypt_secret(secret: str) -> str:
    nonce = os.urandom(12)
    return base64.urlsafe_b64encode(nonce + AESGCM(_key()).encrypt(nonce, secret.encode(), None)).decode()


def decrypt_secret(blob: str) -> str:
    raw = base64.urlsafe_b64decode(blob.encode())
    return AESGCM(_key()).decrypt(raw[:12], raw[12:], None).decode()


def new_secret() -> str:
    """160-bit base32 secret, the size authenticator apps expect."""
    return base64.b32encode(os.urandom(20)).decode().rstrip("=")


def otpauth_url(secret: str, email: str) -> str:
    label = urllib.parse.quote(f"{ISSUER}:{email}")
    query = urllib.parse.urlencode({"secret": secret, "issuer": ISSUER, "digits": DIGITS, "period": STEP_SECONDS})
    return f"otpauth://totp/{label}?{query}"


def code_at(secret: str, step: int) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    digest = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return str(value % 10**DIGITS).zfill(DIGITS)


def matching_step(secret: str, code: str, last_step: int | None = None, now: float | None = None) -> int | None:
    """The time step this code belongs to (current one, or one either side),
    or None. A step at or before last_step was already used and is refused."""
    code = "".join(ch for ch in (code or "") if ch.isdigit())
    if len(code) != DIGITS:
        return None
    current = int((time.time() if now is None else now) // STEP_SECONDS)
    for step in (current, current - 1, current + 1):
        if last_step is not None and step <= last_step:
            continue
        if hmac.compare_digest(code_at(secret, step), code):
            return step
    return None


def new_recovery_codes() -> list[str]:
    alphabet = "abcdefghjkmnpqrstuvwxyz23456789"  # no 0/o, 1/l/i
    return ["-".join("".join(secrets.choice(alphabet) for _ in range(4)) for _ in range(2)) for _ in range(RECOVERY_CODE_COUNT)]


def hash_recovery_code(code: str) -> str:
    normalized = "".join(ch for ch in (code or "").lower() if ch.isalnum())
    return hmac.new(_key(), normalized.encode(), hashlib.sha256).hexdigest()


def looks_like_recovery_code(code: str) -> bool:
    return sum(ch.isalpha() for ch in (code or "")) > 0
