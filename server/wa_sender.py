"""Vistrow's own WhatsApp sender (admin panel → WhatsApp).

Internal use only: Vistrow messaging its own customers from its own number
(+91 77131 28715, WABA "Vistrow Voice") — OTP, top-up confirmations,
invoices, account updates and opted-in offers. Not a tenant feature and not
the Click-to-WhatsApp lead flow (whatsapp_leads.py, owned by the dashboard
lane), which only hands delivery statuses here via record_status().

Meta Cloud API, own business only, so no App Review: a system-user token
with whatsapp_business_messaging (send) and whatsapp_business_management
(read templates) on this one WABA. The token lives only in the server env
(WA_SENDER_TOKEN) and is never returned by any route.

Business-initiated messages must use an approved template; Meta bills each
one by its category (authentication / utility / marketing), so every send
is logged with its category. Marketing broadcasts require an explicit
"these people opted in" confirmation and are capped per run.

Environment:
  WA_SENDER_TOKEN            system-user access token (secret)
  WA_SENDER_PHONE_NUMBER_ID  default 1508965148958051
  WA_SENDER_WABA_ID          default 2255177115055128
"""
from __future__ import annotations

import json
import logging
import os
import re
import threading
import urllib.error
import urllib.parse
import urllib.request

from fastapi import APIRouter, Body, Depends, HTTPException

import admin_db
import calls_db

logger = logging.getLogger("wa-sender")

GRAPH_VERSION = "v25.0"
DEFAULT_PHONE_NUMBER_ID = "1508965148958051"
DEFAULT_WABA_ID = "2255177115055128"
DISPLAY_NUMBER = "+91 77131 28715"
BROADCAST_MAX = 1000
# Platform events a template can be attached to. Wiring each event into its
# flow (sign-up, top-up, invoicing) is a separate step; these only resolve
# which approved template an event sends.
EVENTS = ("otp", "topup_receipt", "invoice", "welcome", "low_credit")
# Meta delivers statuses repeatedly and out of order (sent after read); a
# status only ever moves forward, "failed" excepted (it can follow "sent").
_STATUS_RANK = {"queued": 0, "sent": 1, "delivered": 2, "read": 3, "failed": 4}

_SCHEMA = f"""
CREATE TABLE IF NOT EXISTS wa_sender_templates (
    name TEXT NOT NULL,
    language TEXT NOT NULL,
    category TEXT DEFAULT '',
    status TEXT DEFAULT '',
    body TEXT DEFAULT '',
    param_count INTEGER DEFAULT 0,
    has_otp_button INTEGER DEFAULT 0,
    synced_at TEXT DEFAULT {calls_db._NOW},
    PRIMARY KEY (name, language)
);
CREATE TABLE IF NOT EXISTS wa_sender_messages (
    id SERIAL PRIMARY KEY,
    to_phone TEXT NOT NULL,
    template TEXT NOT NULL,
    language TEXT DEFAULT '',
    category TEXT DEFAULT '',
    kind TEXT DEFAULT 'manual',
    params_json TEXT DEFAULT '[]',
    account_id INTEGER,
    broadcast_id INTEGER,
    wa_message_id TEXT,
    status TEXT DEFAULT 'queued',
    error TEXT DEFAULT '',
    created_by INTEGER,
    created_at TEXT DEFAULT {calls_db._NOW},
    status_at TEXT
);
CREATE INDEX IF NOT EXISTS wa_sender_messages_wamid ON wa_sender_messages (wa_message_id);
CREATE TABLE IF NOT EXISTS wa_sender_broadcasts (
    id SERIAL PRIMARY KEY,
    name TEXT DEFAULT '',
    template TEXT NOT NULL,
    language TEXT DEFAULT '',
    total INTEGER DEFAULT 0,
    created_by INTEGER,
    created_at TEXT DEFAULT {calls_db._NOW}
);
CREATE TABLE IF NOT EXISTS wa_sender_event_templates (
    event TEXT PRIMARY KEY,
    template TEXT DEFAULT '',
    language TEXT DEFAULT 'en',
    enabled INTEGER DEFAULT 0
);
"""


def init_tables() -> None:
    conn = calls_db._connect()
    try:
        with conn:
            for statement in _SCHEMA.split(";"):
                if statement.strip():
                    conn.execute(statement)
    finally:
        conn.close()


# ------------------------------------------------------------------ config
def _config() -> dict:
    return {
        "token": (os.environ.get("WA_SENDER_TOKEN") or "").strip(),
        "phone_number_id": (os.environ.get("WA_SENDER_PHONE_NUMBER_ID") or DEFAULT_PHONE_NUMBER_ID).strip(),
        "waba_id": (os.environ.get("WA_SENDER_WABA_ID") or DEFAULT_WABA_ID).strip(),
    }


def status() -> dict:
    cfg = _config()
    return {"configured": bool(cfg["token"]), "phoneNumberId": cfg["phone_number_id"],
            "wabaId": cfg["waba_id"], "displayNumber": DISPLAY_NUMBER}


def normalize_phone(raw: str) -> str:
    """Digits with country code; a bare 10-digit number is taken as Indian."""
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 10:
        digits = "91" + digits
    if not 11 <= len(digits) <= 15:
        raise ValueError(f"not a phone number: {raw!r}")
    return digits


def _graph(method: str, path: str, body: dict | None = None, query: dict | None = None) -> dict:
    cfg = _config()
    if not cfg["token"]:
        raise RuntimeError("WhatsApp sender is not configured (WA_SENDER_TOKEN is not set)")
    url = f"https://graph.facebook.com/{GRAPH_VERSION}/{path}"
    if query:
        url += "?" + urllib.parse.urlencode(query)
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {cfg['token']}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as exc:
        try:
            detail = json.loads(exc.read() or b"{}").get("error", {})
        except ValueError:
            detail = {}
        raise RuntimeError(f"Meta {exc.code}: {detail.get('message') or exc.reason}") from None


# --------------------------------------------------------------- templates
def _template_shape(t: dict) -> dict:
    body, params, otp = "", 0, False
    for component in t.get("components") or []:
        if component.get("type") == "BODY":
            body = component.get("text") or ""
            params = len(set(re.findall(r"\{\{\s*(\w+)\s*\}\}", body)))
        if component.get("type") == "BUTTONS":
            otp = any(b.get("type") == "OTP" or b.get("otp_type") for b in component.get("buttons") or [])
    return {"name": t.get("name") or "", "language": t.get("language") or "", "category": t.get("category") or "",
            "status": t.get("status") or "", "body": body, "param_count": params, "has_otp_button": int(otp)}


def sync_templates() -> int:
    """Copy this WABA's templates from Meta (names, category, approval state)."""
    rows, after = [], None
    while True:
        query = {"fields": "name,language,category,status,components", "limit": 100}
        if after:
            query["after"] = after
        page = _graph("GET", f"{_config()['waba_id']}/message_templates", query=query)
        rows += [_template_shape(t) for t in page.get("data") or []]
        after = ((page.get("paging") or {}).get("cursors") or {}).get("after")
        if not after or not (page.get("paging") or {}).get("next"):
            break
    conn = calls_db._connect()
    try:
        with conn:
            conn.execute("DELETE FROM wa_sender_templates")
            for r in rows:
                conn.execute(
                    "INSERT INTO wa_sender_templates (name, language, category, status, body, param_count, has_otp_button) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (r["name"], r["language"], r["category"], r["status"], r["body"], r["param_count"], r["has_otp_button"]),
                )
    finally:
        conn.close()
    return len(rows)


def list_templates() -> list[dict]:
    conn = calls_db._connect()
    try:
        return [dict(r) for r in conn.execute(
            "SELECT name, language, category, status, body, param_count, has_otp_button, synced_at "
            "FROM wa_sender_templates ORDER BY name, language").fetchall()]
    finally:
        conn.close()


def _template(name: str, language: str) -> dict | None:
    conn = calls_db._connect()
    try:
        row = conn.execute("SELECT * FROM wa_sender_templates WHERE name = ? AND language = ?",
                           (name, language)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


# ------------------------------------------------------------------ sending
def _components(template: dict, params: list[str]) -> list[dict]:
    components = []
    if params:
        components.append({"type": "body", "parameters": [{"type": "text", "text": str(p)} for p in params]})
    if template.get("has_otp_button") and params:
        # Authentication templates repeat the code on the copy-code button.
        components.append({"type": "button", "sub_type": "url", "index": "0",
                           "parameters": [{"type": "text", "text": str(params[0])}]})
    return components


def send_template(to: str, name: str, language: str, params: list[str] | None = None, *, kind: str = "manual",
                  account_id: int | None = None, broadcast_id: int | None = None, created_by: int | None = None) -> dict:
    """Send one approved template and log it. Never raises for a Meta error:
    the row records it as failed."""
    params = [str(p) for p in (params or [])]
    phone = normalize_phone(to)
    template = _template(name, language)
    if template is None:
        raise ValueError(f"template {name!r} ({language}) is not synced; sync templates first")
    if template["status"] != "APPROVED":
        raise ValueError(f"template {name!r} is {template['status'] or 'not approved'}")
    if template["param_count"] != len(params):
        raise ValueError(f"template {name!r} needs {template['param_count']} value(s), got {len(params)}")
    conn = calls_db._connect()
    try:
        with conn:
            msg_id = conn.execute(
                "INSERT INTO wa_sender_messages (to_phone, template, language, category, kind, params_json, account_id, "
                "broadcast_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
                (phone, name, language, template["category"], kind, json.dumps(params), account_id, broadcast_id, created_by),
            ).fetchone()["id"]
    finally:
        conn.close()
    try:
        reply = _graph("POST", f"{_config()['phone_number_id']}/messages", body={
            "messaging_product": "whatsapp", "to": phone, "type": "template",
            "template": {"name": name, "language": {"code": language}, "components": _components(template, params)},
        })
        wamid = ((reply.get("messages") or [{}])[0]).get("id")
        _set_row(msg_id, "sent" if wamid else "failed", wamid=wamid, error="" if wamid else "no message id returned")
        return {"id": msg_id, "status": "sent" if wamid else "failed", "waMessageId": wamid}
    except Exception as exc:
        _set_row(msg_id, "failed", error=str(exc)[:300])
        return {"id": msg_id, "status": "failed", "error": str(exc)[:300]}


def _set_row(msg_id: int, state: str, wamid: str | None = None, error: str = "") -> None:
    conn = calls_db._connect()
    try:
        with conn:
            conn.execute(
                f"UPDATE wa_sender_messages SET status = ?, wa_message_id = COALESCE(?, wa_message_id), error = ?, "
                f"status_at = {calls_db._NOW} WHERE id = ?",
                (state, wamid, error, msg_id),
            )
    finally:
        conn.close()


def record_status(wa_message_id: str, new_status: str, timestamp: str | int | None = None,
                  errors: list | None = None) -> bool:
    """A Meta delivery status for one of our sends. Idempotent and forward-only
    (Meta resends and reorders), and silently False for a message that is not
    ours, so the webhook can call it for every status it sees."""
    new_status = (new_status or "").lower()
    if new_status not in _STATUS_RANK or not wa_message_id:
        return False
    error = ""
    if new_status == "failed" and errors:
        first = errors[0] if isinstance(errors, list) else {}
        error = str(first.get("title") or first.get("message") or first.get("code") or "")[:300]
    conn = calls_db._connect()
    try:
        with conn:
            row = conn.execute("SELECT id, status FROM wa_sender_messages WHERE wa_message_id = ?",
                               (wa_message_id,)).fetchone()
            if row is None:
                return False
            if _STATUS_RANK[new_status] <= _STATUS_RANK.get(row["status"], 0):
                return True
            conn.execute(
                f"UPDATE wa_sender_messages SET status = ?, error = CASE WHEN ? <> '' THEN ? ELSE error END, "
                f"status_at = {calls_db._NOW} WHERE id = ?",
                (new_status, error, error, row["id"]),
            )
        return True
    finally:
        conn.close()


def broadcast(name: str, template: str, language: str, params: list[str], numbers: list[str],
              created_by: int | None) -> dict:
    """Same template to many numbers, sent in the background. Invalid numbers
    are rejected up front; duplicates are dropped."""
    phones, invalid = [], []
    for raw in numbers:
        try:
            phone = normalize_phone(raw)
        except ValueError:
            invalid.append(raw)
            continue
        if phone not in phones:
            phones.append(phone)
    if not phones:
        raise ValueError("no valid phone numbers")
    if len(phones) > BROADCAST_MAX:
        raise ValueError(f"at most {BROADCAST_MAX} numbers per broadcast")
    t = _template(template, language)
    if t is None or t["status"] != "APPROVED":
        raise ValueError(f"template {template!r} is not an approved, synced template")
    conn = calls_db._connect()
    try:
        with conn:
            bid = conn.execute(
                "INSERT INTO wa_sender_broadcasts (name, template, language, total, created_by) VALUES (?, ?, ?, ?, ?) "
                "RETURNING id", (name[:120], template, language, len(phones), created_by)).fetchone()["id"]
    finally:
        conn.close()

    def _run() -> None:
        for phone in phones:
            try:
                send_template(phone, template, language, params, kind="broadcast", broadcast_id=bid, created_by=created_by)
            except Exception:
                logger.exception("broadcast %s: send to %s failed", bid, phone[-4:])

    threading.Thread(target=_run, name=f"wa-broadcast-{bid}", daemon=True).start()
    return {"broadcastId": bid, "queued": len(phones), "invalid": invalid}


def list_messages(limit: int = 200, broadcast_id: int | None = None) -> list[dict]:
    conn = calls_db._connect()
    try:
        where, args = ("WHERE broadcast_id = ?", (broadcast_id,)) if broadcast_id else ("", ())
        return [dict(r) for r in conn.execute(
            "SELECT id, to_phone, template, language, category, kind, account_id, broadcast_id, wa_message_id, status, "
            f"error, created_at, status_at FROM wa_sender_messages {where} ORDER BY id DESC LIMIT ?",
            (*args, max(1, min(int(limit), 500)))).fetchall()]
    finally:
        conn.close()


def list_broadcasts(limit: int = 50) -> list[dict]:
    conn = calls_db._connect()
    try:
        return [dict(r) for r in conn.execute(
            "SELECT b.id, b.name, b.template, b.language, b.total, b.created_at, "
            "COUNT(m.id) FILTER (WHERE m.status IN ('sent', 'delivered', 'read')) AS sent, "
            "COUNT(m.id) FILTER (WHERE m.status IN ('delivered', 'read')) AS delivered, "
            "COUNT(m.id) FILTER (WHERE m.status = 'read') AS read, "
            "COUNT(m.id) FILTER (WHERE m.status = 'failed') AS failed "
            "FROM wa_sender_broadcasts b LEFT JOIN wa_sender_messages m ON m.broadcast_id = b.id "
            "GROUP BY b.id ORDER BY b.id DESC LIMIT ?", (max(1, min(int(limit), 200)),)).fetchall()]
    finally:
        conn.close()


# ------------------------------------------------------------- automations
def event_templates() -> list[dict]:
    conn = calls_db._connect()
    try:
        stored = {r["event"]: dict(r) for r in conn.execute("SELECT * FROM wa_sender_event_templates").fetchall()}
    finally:
        conn.close()
    return [stored.get(e) or {"event": e, "template": "", "language": "en", "enabled": 0} for e in EVENTS]


def set_event_template(event: str, template: str, language: str, enabled: bool) -> None:
    if event not in EVENTS:
        raise ValueError(f"unknown event {event!r}")
    conn = calls_db._connect()
    try:
        with conn:
            conn.execute(
                "INSERT INTO wa_sender_event_templates (event, template, language, enabled) VALUES (?, ?, ?, ?) "
                "ON CONFLICT (event) DO UPDATE SET template = excluded.template, language = excluded.language, "
                "enabled = excluded.enabled",
                (event, template.strip(), (language or "en").strip(), int(bool(enabled))),
            )
    finally:
        conn.close()


def send_event(event: str, to: str, params: list[str], account_id: int | None = None) -> dict | None:
    """For platform flows (OTP, top-up, invoice...): send this event's template
    if one is set and enabled, else None. Not called by any flow yet."""
    row = next((e for e in event_templates() if e["event"] == event), None)
    if not row or not row["enabled"] or not row["template"] or not _config()["token"]:
        return None
    return send_template(to, row["template"], row["language"], params, kind=event, account_id=account_id)


# ------------------------------------------------------------------ routes
def build_router(require_platform_owner) -> APIRouter:
    """Admin-only routes under /admin/whatsapp (platform owner, admin login)."""
    router = APIRouter(prefix="/admin/whatsapp")

    def _audit(admin: dict, action: str, detail: str) -> None:
        try:
            admin_db.write_audit(admin["user_id"], admin["email"], action, detail=detail[:500])
        except Exception:
            logger.exception("audit write failed")

    @router.get("/status")
    def wa_status(admin: dict = Depends(require_platform_owner)) -> dict:
        return status()

    @router.get("/templates")
    def wa_templates(admin: dict = Depends(require_platform_owner)) -> dict:
        return {"templates": list_templates()}

    @router.post("/templates/sync")
    def wa_templates_sync(admin: dict = Depends(require_platform_owner)) -> dict:
        try:
            count = sync_templates()
        except RuntimeError as exc:
            raise HTTPException(502, str(exc)) from exc
        _audit(admin, "wa_templates_sync", f"{count} templates")
        return {"synced": count, "templates": list_templates()}

    @router.post("/send")
    def wa_send(data: dict = Body(...), admin: dict = Depends(require_platform_owner)) -> dict:
        try:
            result = send_template(str(data.get("to") or ""), str(data.get("template") or ""),
                                   str(data.get("language") or "en"), list(data.get("params") or []),
                                   kind="manual", created_by=admin["user_id"])
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        _audit(admin, "wa_send", f"{data.get('template')} to ***{str(data.get('to') or '')[-4:]}: {result['status']}")
        return result

    @router.post("/broadcasts")
    def wa_broadcast(data: dict = Body(...), admin: dict = Depends(require_platform_owner)) -> dict:
        if data.get("confirmOptIn") is not True:
            raise HTTPException(400, "Confirm that every number opted in to WhatsApp messages from Vistrow")
        numbers = data.get("numbers") or []
        if isinstance(numbers, str):
            numbers = re.split(r"[\s,;]+", numbers)
        try:
            result = broadcast(str(data.get("name") or ""), str(data.get("template") or ""),
                               str(data.get("language") or "en"), list(data.get("params") or []),
                               [n for n in numbers if str(n).strip()], admin["user_id"])
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        _audit(admin, "wa_broadcast", f"{data.get('template')} to {result['queued']} numbers (#{result['broadcastId']})")
        return result

    @router.get("/broadcasts")
    def wa_broadcasts(admin: dict = Depends(require_platform_owner)) -> dict:
        return {"broadcasts": list_broadcasts()}

    @router.get("/messages")
    def wa_messages(limit: int = 200, broadcastId: int | None = None, admin: dict = Depends(require_platform_owner)) -> dict:
        return {"messages": list_messages(limit, broadcastId)}

    @router.get("/events")
    def wa_events(admin: dict = Depends(require_platform_owner)) -> dict:
        return {"events": event_templates()}

    @router.post("/events/{event}")
    def wa_event_set(event: str, data: dict = Body(...), admin: dict = Depends(require_platform_owner)) -> dict:
        try:
            set_event_template(event, str(data.get("template") or ""), str(data.get("language") or "en"),
                               bool(data.get("enabled")))
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        _audit(admin, "wa_event_template", f"{event} -> {data.get('template')} enabled={bool(data.get('enabled'))}")
        return {"events": event_templates()}

    return router
