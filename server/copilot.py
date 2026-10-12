"""Confirmed write actions for the dashboard copilot (Phase 2).

The model never writes. When it calls a tool from copilot_tools.TOOLS,
help_chat.py calls propose(): the arguments are cleaned, ids are resolved
inside the session's account for the confirmation label, a `proposed` row is
written to copilot_actions, and the reply carries a signed token. Only
POST /help/chat/confirm (token_api.py -> confirm()) executes, after verifying
the signature, expiry and session, and re-checking role, plan and the daily
cap. The copilot_actions row is the audit trail and the cap counter.

Token: base64url(compact JSON {i, a, u, t, x, e}) + "." + base64url(HMAC-SHA256),
keyed with the session secret (auth._secret(), i.e. AUTH_SECRET) over a
copilot-specific prefix so it can never pass as a session cookie.
"""

import hashlib
import hmac
import json
import time

import auth
import calls_db
from copilot_tools import TOOLS, ActionError, plan_allows, role_allows

TOKEN_TTL_SECONDS = 10 * 60
# Per account, rolling 24 hours, counted from copilot_actions.
DAILY_PROPOSAL_CAP = 150
DAILY_WRITE_CAP = 40
_SIGNING_PREFIX = b"copilot-action."


class ConfirmError(Exception):
    """Maps to an HTTP error on the confirm/cancel routes."""

    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def _sign(body: str) -> str:
    return auth._b64(hmac.new(auth._secret(), _SIGNING_PREFIX + body.encode(), hashlib.sha256).digest())


def make_token(action_id: int, account_id: int, user_id: int, tool: str, args: dict, now: float | None = None) -> str:
    payload = {"i": action_id, "a": account_id, "u": user_id, "t": tool, "x": args,
               "e": int(now if now is not None else time.time()) + TOKEN_TTL_SECONDS}
    body = auth._b64(json.dumps(payload, separators=(",", ":")).encode())
    return f"{body}.{_sign(body)}"


def read_token(token: str) -> dict:
    """The verified payload, or ConfirmError(400). Expiry is checked by the caller
    so an expired action can still be marked expired in the audit."""
    body, _, sig = str(token or "").partition(".")
    try:
        valid = bool(body and sig) and hmac.compare_digest(sig.encode(), _sign(body).encode())
    except (TypeError, UnicodeEncodeError):
        valid = False
    if not valid:
        raise ConfirmError(400, "This action link is not valid. Ask the copilot again.")
    try:
        payload = json.loads(auth._unb64(body))
    except (ValueError, TypeError):
        raise ConfirmError(400, "This action link is not valid. Ask the copilot again.") from None
    if not isinstance(payload, dict) or payload.get("t") not in TOOLS or not isinstance(payload.get("x"), dict):
        raise ConfirmError(400, "This action link is not valid. Ask the copilot again.")
    return payload


def _since_24h() -> str:
    return calls_db._utc_days_ago(1)


def _features(account_id: int) -> dict:
    return calls_db.account_features(account_id)


def action_access(account_id: int, role: str | None, impersonating: bool = False) -> dict:
    """Which write tools the model may propose this turn, plus a line for the
    system prompt explaining why there are none when there are none."""
    if impersonating:
        return {"tools": [], "note": "Actions are switched off while a Vistrow admin is viewing this workspace. "
                "Answer questions only.", "upgrade": False}
    features = _features(account_id)
    if not features.get("copilot_actions"):
        return {"tools": [], "note": "Making changes for the user (pausing agents, booking callbacks, assigning "
                "numbers) needs the Growth plan. If they ask for a change, say so and tell them where to do it "
                "themselves, and add \"upgrade\": true to your JSON.", "upgrade": True}
    names = [n for n in TOOLS if role_allows(role, n) and plan_allows(features, n)]
    if not names:
        return {"tools": [], "note": "This user's role can view but not change things. If they ask for a "
                "change, say a workspace member or admin can do it.", "upgrade": False}
    if calls_db.count_copilot_actions(account_id, _since_24h()) >= DAILY_PROPOSAL_CAP:
        return {"tools": [], "note": "The workspace has reached today's limit for copilot actions. Tell the user "
                "to make the change on the page itself or try again tomorrow.", "upgrade": False}
    return {"tools": [TOOLS[n]["schema"] for n in names], "names": set(names), "note": "", "upgrade": False}


def propose(account_id: int, user_id: int, tool: str, args: dict) -> dict:
    """Validate and record a proposed action; returns the pendingAction for the
    reply. Raises ActionError with a message the model can relay."""
    spec = TOOLS[tool]
    args = {k: v for k, v in (args or {}).items() if k != "account_id"}
    cleaned = spec["clean"](args)
    label = spec["describe"](account_id, cleaned)
    action_id = calls_db.record_copilot_action(account_id, user_id, tool, cleaned, label)
    return {"token": make_token(action_id, account_id, user_id, tool, cleaned), "label": label, "tool": tool}


def _session_action(token: str, account_id: int, user_id: int) -> tuple[dict, dict]:
    payload = read_token(token)
    if payload.get("a") != account_id or payload.get("u") != user_id:
        raise ConfirmError(403, "This action was proposed to someone else.")
    row = calls_db.get_copilot_action(int(payload.get("i") or 0), account_id)
    if row is None or row["tool"] != payload["t"]:
        raise ConfirmError(404, "Action not found.")
    return payload, row


def _already_decided(row: dict) -> ConfirmError:
    return ConfirmError(409, f"This action was already {row['status']}.")


def confirm(token: str, account_id: int, user_id: int, *, impersonating: bool = False, via_api_key: bool = False) -> dict:
    if impersonating:
        raise ConfirmError(403, "Not allowed while viewing as a customer.")
    if via_api_key:
        raise ConfirmError(403, "Copilot actions need a signed-in person, not an API key.")
    payload, row = _session_action(token, account_id, user_id)
    if row["status"] != "proposed":
        raise _already_decided(row)
    if int(payload.get("e") or 0) < int(time.time()):
        calls_db.decide_copilot_action(row["id"], account_id, "expired")
        raise ConfirmError(400, "This action expired. Ask the copilot again.")
    tool = payload["t"]
    member = calls_db.get_user_by_id(user_id)
    if not member or member.get("account_id") != account_id or not role_allows(member.get("role"), tool):
        raise ConfirmError(403, "Your role can't make this change.")
    if not plan_allows(_features(account_id), tool):
        raise ConfirmError(403, "Copilot actions need the Growth plan. Upgrade in Billing to use them.")
    if calls_db.count_copilot_actions(account_id, _since_24h(), ("confirmed",)) >= DAILY_WRITE_CAP:
        raise ConfirmError(429, "Your workspace has reached today's limit of copilot changes. "
                           "Make this change on the page itself, or try again tomorrow.")
    # Claim the row before running, so a second confirm cannot run it again.
    if not calls_db.decide_copilot_action(row["id"], account_id, "confirmed"):
        raise _already_decided(calls_db.get_copilot_action(row["id"], account_id) or row)
    spec = TOOLS[tool]
    try:
        args = spec["clean"](payload["x"])
        message = spec["fn"](account_id, {"user_id": user_id, "account_id": account_id}, **args)
    except ActionError as exc:
        calls_db.decide_copilot_action(row["id"], account_id, "failed", str(exc), from_status="confirmed")
        raise ConfirmError(400, str(exc)) from exc
    except Exception as exc:
        calls_db.decide_copilot_action(row["id"], account_id, "failed", "internal error", from_status="confirmed")
        raise ConfirmError(500, "That change could not be made. Nothing else was changed; try it on the page itself.") from exc
    calls_db.decide_copilot_action(row["id"], account_id, "confirmed", message, from_status="confirmed")
    return {"ok": True, "message": message}


def cancel(token: str, account_id: int, user_id: int) -> dict:
    _, row = _session_action(token, account_id, user_id)
    if not calls_db.decide_copilot_action(row["id"], account_id, "cancelled"):
        raise _already_decided(calls_db.get_copilot_action(row["id"], account_id) or row)
    return {"ok": True, "message": "Cancelled. Nothing was changed."}
