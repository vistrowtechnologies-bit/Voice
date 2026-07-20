"""Live balance checks for upstream vendor accounts, used by the admin Vendor
Credits tracker (admin_db.list_vendor_credits). Most vendors don't expose a
public balance API, so only vendors with a documented, stable endpoint get a
live checker here — everyone else stays "manual" (the operator punches the
number in after checking the vendor's own dashboard). Adding a live checker
for a vendor that doesn't actually have one would silently show a wrong
number, which is worse than admitting it's manual-only.

Uses stdlib urllib only, mirroring voice_preview.py's provider-call style —
no new server dependency for what's a once-per-admin-page-load check.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

_TIMEOUT_S = 10


class LiveCheckError(Exception):
    """A live balance check failed — missing key, network error, or an
    unexpected response shape. Callers fall back to the last stored value."""


def _get(url: str, headers: dict) -> dict:
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:200]
        raise LiveCheckError(f"HTTP {e.code}: {body}") from e
    except urllib.error.URLError as e:
        raise LiveCheckError(f"Could not reach vendor: {e.reason}") from e
    except (json.JSONDecodeError, KeyError, TypeError) as e:
        raise LiveCheckError(f"Unexpected response shape: {e}") from e


def check_elevenlabs() -> tuple[float, str]:
    """Remaining TTS characters this billing cycle, from ElevenLabs' own
    subscription endpoint (GET /v1/user/subscription — stable, documented).
    Returns (remaining, "characters")."""
    api_key = os.environ.get("ELEVEN_API_KEY")
    if not api_key:
        raise LiveCheckError("ELEVEN_API_KEY not configured")
    data = _get("https://api.elevenlabs.io/v1/user/subscription", {"xi-api-key": api_key})
    limit = data["character_limit"]
    used = data["character_count"]
    return float(limit - used), "characters"


# key -> live-checker function. Only vendors listed here run a live check;
# everyone else in admin_db.VENDOR_CATALOG stays manual-entry.
LIVE_CHECKERS = {
    "elevenlabs": check_elevenlabs,
}
