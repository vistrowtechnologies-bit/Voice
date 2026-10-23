"""Meta (Facebook / Instagram) Lead Ads → AI call. Phase 1 of
docs/META-LEAD-ADS-PLAN-2026-10-22.md.

What lives here, and why it is one module:
  * the meta_* tables (connections, pages, forms, rules, lead events);
  * the webhook receiver's logic (signature, 2 MB cap, durable rows, 200 fast);
  * the background worker that fetches each lead from Graph, keeps EVERY form
    answer and the ad context, and queues the call;
  * the hourly reconciliation that lists each form's leads and inserts any the
    webhook missed (webhooks for speed, polling for completeness);
  * Meta's deauthorize and data-deletion callbacks, done properly;
  * a FastAPI router with the OAuth and webhook routes.

Everything provider-facing goes through `fetcher` / `poster` callables so tests
run with no network. token_api.py mounts `router`, calls `init_tables()` and
`start_worker()` at startup and passes its session helpers to `configure()`;
until that wiring lands (it waits for PR #253 to merge, which frees
token_api.py), this module is complete and tested on its own.

Multi-tenant rules (plan section 2): one shared webhook URL routed by page_id
through meta_pages (page_id is the primary key, so one Page belongs to one
workspace); the webhook only records; a bad token for tenant A never delays
tenant B; dedupe on (page_id, leadgen_id); tokens encrypted and never sent to
the browser.

Phase 1 limitation, on purpose: leads are queued through
calls_db.ingest_inbound_lead's generic path (the account's shared "Instant
Lead Follow-up" campaign, first live agent with a number). Per-Page / per-form /
per-ad agent rules are Phase 2 and need a `route` parameter on that function.
"""

from __future__ import annotations

import base64
import datetime
import hashlib
import hmac
import inspect
import json
import logging
import os
import re
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Callable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

import calls_db
import campaign_dialer
import integration_crypto

logger = logging.getLogger("meta-leads")


class _MaskVerifyToken(logging.Filter):
    """Meta's webhook check puts our verify token in the query string, and the
    access log printed it (seen in Railway logs, 23 Oct). Mask it there."""

    _TOKEN = re.compile(r"(hub[._]verify_token)=[^&\s]*")

    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if isinstance(args, tuple) and len(args) >= 3 and isinstance(args[2], str) and "verify_token=" in args[2]:
            record.args = (*args[:2], self._TOKEN.sub(r"\1=REDACTED", args[2]), *args[3:])
        return True


logging.getLogger("uvicorn.access").addFilter(_MaskVerifyToken())

GRAPH_VERSION = "v25.0"  # keep in step with token_api._META_GRAPH_VERSION
GRAPH = f"https://graph.facebook.com/{GRAPH_VERSION}"
SOURCE = "meta_lead_ads"
MAX_BODY_BYTES = 2 * 1024 * 1024
# Everything Meta returns on a lead object that the agent or the reports use.
LEAD_FIELDS = ("created_time,id,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,"
               "form_id,platform,is_organic,field_data")
SCOPES = "pages_show_list,pages_manage_metadata,pages_read_engagement,leads_retrieval,pages_manage_ads"
STALE_AFTER_HOURS = 24          # plan B5: a lead this old is recorded, never called
TOKEN_WARN_DAYS = 7             # plan B12: "reconnect by" warning
WORKER_TICK_SECONDS = 1.0
RECONCILE_EVERY_SECONDS = 3600
MAX_ATTEMPTS = 8
RETRY_BACKOFF_SECONDS = (5, 30, 120, 600, 1800, 3600, 7200, 14400)
# Codes Meta uses for an invalid or expired token, and for rate limiting.
TOKEN_ERROR_CODES = {190, 102}
RATE_LIMIT_CODES = {4, 17, 32, 613}
_IDENTITY_NAME = ("full_name", "name", "first_name")
_IDENTITY_LAST = ("last_name",)
_IDENTITY_PHONE = ("phone_number", "phone", "mobile", "mobile_number", "contact_number", "whatsapp_number")
_IDENTITY_EMAIL = ("email", "email_address")
_IDENTITY_KEYS = set(_IDENTITY_NAME) | set(_IDENTITY_LAST) | set(_IDENTITY_PHONE) | set(_IDENTITY_EMAIL)
_CONTROL = re.compile(r"[\x00-\x1f\x7f  ]")

Fetcher = Callable[[str], dict]
Poster = Callable[[str, dict], dict]

# Phase 2 routing needs calls_db.ingest_inbound_lead(route=...) (patch in
# docs/patches/calls_db-meta-route.md). Until that lands, a resolved route is
# recorded on the event and the lead still goes down the generic path.
_INGEST_ACCEPTS_ROUTE = "route" in inspect.signature(calls_db.ingest_inbound_lead).parameters
_warned: set[str] = set()


def _warn_once(tag: str, message: str) -> None:
    if tag not in _warned:
        _warned.add(tag)
        logger.warning(message)


class GraphError(Exception):
    """A Graph API error with Meta's own code, so callers can tell a dead
    token (190) from a rate limit (4/17/32) from everything else."""

    def __init__(self, code: int, message: str, http_status: int = 0):
        super().__init__(f"graph error {code}: {message}")
        self.code, self.message, self.http_status = code, message, http_status


class PageOwnedElsewhere(Exception):
    """This Facebook Page is already connected to another workspace."""


class TokenStorageUnavailable(Exception):
    """Refusing to store a Meta token in plaintext (plan B10)."""


# ----------------------------------------------------------------- schema

_SCHEMA = f"""
CREATE TABLE IF NOT EXISTS meta_connections (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    account_id INTEGER NOT NULL,
    user_token TEXT NOT NULL,
    token_expires_at TEXT,
    fb_user_id TEXT DEFAULT '',
    fb_user_name TEXT DEFAULT '',
    status TEXT DEFAULT 'connected',
    connected_by_user_id INTEGER,
    connected_at TEXT DEFAULT {calls_db._NOW},
    last_error TEXT DEFAULT '',
    last_error_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_meta_connections_account ON meta_connections (account_id);

-- page_id is the primary key: one Facebook Page belongs to exactly one
-- workspace, and the webhook looks the owner up by it (no scan, no decrypt).
CREATE TABLE IF NOT EXISTS meta_pages (
    page_id TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL,
    connection_id INTEGER,
    page_name TEXT DEFAULT '',
    page_token TEXT NOT NULL,
    subscribed_at TEXT,
    subscription_ok INTEGER DEFAULT 0,
    last_lead_at TEXT,
    default_agent_id INTEGER,
    default_from_number TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT {calls_db._NOW}
);
CREATE INDEX IF NOT EXISTS idx_meta_pages_account ON meta_pages (account_id);

CREATE TABLE IF NOT EXISTS meta_forms (
    page_id TEXT NOT NULL,
    form_id TEXT NOT NULL,
    account_id INTEGER NOT NULL,
    form_name TEXT DEFAULT '',
    label TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    first_seen_at TEXT DEFAULT {calls_db._NOW},
    last_reconciled_at TEXT,
    PRIMARY KEY (page_id, form_id)
);

CREATE TABLE IF NOT EXISTS meta_lead_rules (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    account_id INTEGER NOT NULL,
    page_id TEXT NOT NULL,
    match_kind TEXT NOT NULL,
    match_value TEXT NOT NULL,
    agent_id INTEGER NOT NULL,
    from_number TEXT DEFAULT '',
    label TEXT DEFAULT '',
    position INTEGER DEFAULT 0,
    created_at TEXT DEFAULT {calls_db._NOW},
    UNIQUE (page_id, match_kind, match_value)
);

-- Every ad we have seen a lead from, with the names Meta returned on the
-- lead object, so the rules screen offers "2 BHK Khopoli launch" rather
-- than an ad id typed by hand.
CREATE TABLE IF NOT EXISTS meta_ads (
    page_id TEXT NOT NULL,
    ad_id TEXT NOT NULL,
    account_id INTEGER NOT NULL,
    ad_name TEXT DEFAULT '',
    adset_name TEXT DEFAULT '',
    campaign_id TEXT DEFAULT '',
    campaign_name TEXT DEFAULT '',
    first_seen_at TEXT DEFAULT {calls_db._NOW},
    PRIMARY KEY (page_id, ad_id)
);
CREATE INDEX IF NOT EXISTS idx_meta_ads_account ON meta_ads (account_id);

-- One row per lead Meta told us about (or we found by reconciliation). The
-- webhook writes it and answers 200; the worker does the rest. Primary key
-- makes Meta's redeliveries a no-op.
CREATE TABLE IF NOT EXISTS meta_lead_events (
    page_id TEXT NOT NULL,
    leadgen_id TEXT NOT NULL,
    account_id INTEGER,
    form_id TEXT DEFAULT '',
    ad_id TEXT DEFAULT '',
    via TEXT DEFAULT 'webhook',
    status TEXT DEFAULT 'received',
    reason TEXT DEFAULT '',
    attempts INTEGER DEFAULT 0,
    next_attempt_at TEXT,
    received_at TEXT DEFAULT {calls_db._NOW},
    processed_at TEXT,
    dialed_at TEXT,
    campaign_contact_id INTEGER,
    raw_json TEXT DEFAULT '',
    route_agent_id INTEGER,
    route_from_number TEXT DEFAULT '',
    route_label TEXT DEFAULT '',
    PRIMARY KEY (page_id, leadgen_id)
);
CREATE INDEX IF NOT EXISTS idx_meta_lead_events_status ON meta_lead_events (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_meta_lead_events_account ON meta_lead_events (account_id, received_at);

CREATE TABLE IF NOT EXISTS meta_deletion_requests (
    confirmation_code TEXT PRIMARY KEY,
    fb_user_id TEXT NOT NULL,
    status TEXT DEFAULT 'done',
    requested_at TEXT DEFAULT {calls_db._NOW}
);
"""


def init_tables() -> None:
    conn = calls_db._connect()
    try:
        with conn:
            conn.execute(_SCHEMA)
            # Phase 2 columns on a table Phase 1 may already have created.
            for column, coltype in (("route_agent_id", "INTEGER"), ("route_from_number", "TEXT DEFAULT ''"),
                                    ("route_label", "TEXT DEFAULT ''")):
                conn.execute(f"ALTER TABLE meta_lead_events ADD COLUMN IF NOT EXISTS {column} {coltype}")
    finally:
        conn.close()


# -------------------------------------------------------------- utilities

def _utc_now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def _stamp(dt: datetime.datetime) -> str:
    return dt.astimezone(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _text(value, cap: int) -> str:
    return " ".join(_CONTROL.sub(" ", str(value if value is not None else "")).split())[:cap]


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.casefold()).strip("_")[:48]


def _parse_meta_time(value: str | None) -> datetime.datetime | None:
    """Meta's created_time, e.g. 2026-10-22T09:41:12+0000."""
    if not value:
        return None
    text = str(value).strip()
    if re.search(r"[+-]\d{4}$", text):
        text = text[:-2] + ":" + text[-2:]
    try:
        parsed = datetime.datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=datetime.timezone.utc)


def _account_tz(account_id: int) -> ZoneInfo:
    try:
        return ZoneInfo(calls_db.get_compliance(account_id).get("timezone") or "Asia/Kolkata")
    except (ZoneInfoNotFoundError, ValueError, TypeError, AttributeError):
        return ZoneInfo("Asia/Kolkata")


def token_storage_ok() -> bool:
    """Plan B10: never store a Meta token in plaintext. Local development and
    tests opt in explicitly with META_ALLOW_PLAINTEXT_TOKENS=1."""
    return integration_crypto.write_enabled() or os.environ.get("META_ALLOW_PLAINTEXT_TOKENS", "") == "1"


def _enc(value: str) -> str:
    if not token_storage_ok():
        raise TokenStorageUnavailable("INTEGRATION_ENCRYPTION_KEY and INTEGRATION_ENCRYPTION_WRITE must be set")
    return integration_crypto.encode_config({"t": value})


def _dec(stored: str) -> str:
    return str(integration_crypto.decode_config(stored).get("t") or "")


def _graph_get(url: str) -> dict:
    """Default fetcher: GET a Graph URL, raising GraphError with Meta's code."""
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            return json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as exc:
        body = exc.read() or b""
        try:
            error = (json.loads(body) or {}).get("error") or {}
        except ValueError:
            error = {}
        raise GraphError(int(error.get("code") or 0), str(error.get("message") or exc.reason), exc.code) from exc


def _graph_post(url: str, data: dict) -> dict:
    try:
        req = urllib.request.Request(url, data=urllib.parse.urlencode(data).encode(), method="POST")
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as exc:
        body = exc.read() or b""
        try:
            error = (json.loads(body) or {}).get("error") or {}
        except ValueError:
            error = {}
        raise GraphError(int(error.get("code") or 0), str(error.get("message") or exc.reason), exc.code) from exc


def _app_secret() -> str:
    return os.environ.get("META_OAUTH_CLIENT_SECRET", "")


# ----------------------------------------------------------- connections

def save_connection(account_id: int, user_token: str, expires_in: int | None, fb_user_id: str,
                    fb_user_name: str, user_id: int | None) -> int:
    """Store (or replace) the account's Meta user connection. The token is
    encrypted; an account has one connection at a time."""
    enc = _enc(user_token)
    expires_at = _stamp(_utc_now() + datetime.timedelta(seconds=int(expires_in))) if expires_in else None
    conn = calls_db._connect()
    try:
        with conn:
            conn.execute("UPDATE meta_connections SET status = 'replaced' WHERE account_id = ? AND status <> 'replaced'",
                         (account_id,))
            row = conn.execute(
                "INSERT INTO meta_connections (account_id, user_token, token_expires_at, fb_user_id, fb_user_name, "
                "status, connected_by_user_id) VALUES (?, ?, ?, ?, ?, 'connected', ?) RETURNING id",
                (account_id, enc, expires_at, _text(fb_user_id, 64), _text(fb_user_name, 120), user_id),
            ).fetchone()
            return row["id"]
    finally:
        conn.close()


def connection(account_id: int) -> dict | None:
    conn = calls_db._connect()
    try:
        row = conn.execute(
            "SELECT * FROM meta_connections WHERE account_id = ? AND status <> 'replaced' ORDER BY id DESC LIMIT 1",
            (account_id,),
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    out = dict(row)
    out["user_token"] = _dec(out["user_token"])
    return out


def mark_needs_reconnect(account_id: int, error: str) -> None:
    conn = calls_db._connect()
    try:
        with conn:
            conn.execute(
                f"UPDATE meta_connections SET status = 'needs_reconnect', last_error = ?, last_error_at = {calls_db._NOW} "
                "WHERE account_id = ? AND status <> 'replaced'",
                (_text(error, 300), account_id),
            )
    finally:
        conn.close()


def add_page(account_id: int, connection_id: int | None, page_id: str, page_name: str, page_token: str) -> None:
    """Attach a Page to this account. A Page already attached to another
    account raises PageOwnedElsewhere; re-adding our own refreshes it."""
    enc = _enc(page_token)
    conn = calls_db._connect()
    try:
        with conn:
            owner = conn.execute("SELECT account_id FROM meta_pages WHERE page_id = ?", (page_id,)).fetchone()
            if owner and int(owner["account_id"]) != int(account_id):
                raise PageOwnedElsewhere(page_id)
            conn.execute(
                "INSERT INTO meta_pages (page_id, account_id, connection_id, page_name, page_token, status) "
                "VALUES (?, ?, ?, ?, ?, 'active') ON CONFLICT (page_id) DO UPDATE SET connection_id = excluded.connection_id, "
                "page_name = excluded.page_name, page_token = excluded.page_token, status = 'active'",
                (page_id, account_id, connection_id, _text(page_name, 200), enc),
            )
    finally:
        conn.close()


def mark_page_subscribed(page_id: str, ok: bool) -> None:
    conn = calls_db._connect()
    try:
        with conn:
            conn.execute(
                f"UPDATE meta_pages SET subscription_ok = ?, subscribed_at = CASE WHEN ? THEN {calls_db._NOW} ELSE subscribed_at END "
                "WHERE page_id = ?",
                (1 if ok else 0, ok, page_id),
            )
    finally:
        conn.close()


def page_owner(page_id: str) -> dict | None:
    """Who owns this Page and the token to read its leads with. Indexed on the
    primary key; the token is decrypted only here."""
    if not page_id:
        return None
    conn = calls_db._connect()
    try:
        row = conn.execute("SELECT * FROM meta_pages WHERE page_id = ? AND status = 'active'", (str(page_id),)).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    out = dict(row)
    out["page_token"] = _dec(out["page_token"])
    return out


def list_pages(account_id: int) -> list[dict]:
    conn = calls_db._connect()
    try:
        rows = conn.execute(
            "SELECT page_id, page_name, subscribed_at, subscription_ok, last_lead_at, default_agent_id, "
            "default_from_number, status FROM meta_pages WHERE account_id = ? ORDER BY page_name, page_id",
            (account_id,),
        ).fetchall()
    finally:
        conn.close()
    return [dict(r) for r in rows]


def set_page_default(account_id: int, page_id: str, agent_id: int | None, from_number: str) -> bool:
    conn = calls_db._connect()
    try:
        with conn:
            if agent_id is not None and conn.execute(
                "SELECT 1 FROM agents WHERE id = ? AND account_id = ?", (agent_id, account_id)
            ).fetchone() is None:
                raise ValueError("Agent not found in this workspace")
            if from_number and conn.execute(
                "SELECT 1 FROM phone_numbers WHERE account_id = ? AND number = ? AND status = 'active'",
                (account_id, from_number),
            ).fetchone() is None:
                raise ValueError("That phone number is not one of this workspace's active numbers")
            cur = conn.execute(
                "UPDATE meta_pages SET default_agent_id = ?, default_from_number = ? WHERE page_id = ? AND account_id = ?",
                (agent_id, from_number or "", page_id, account_id),
            )
            return cur.rowcount == 1
    finally:
        conn.close()


def disconnect(account_id: int, poster: Poster | None = None) -> dict:
    """Unsubscribe every Page from our app, forget the tokens, keep the leads."""
    poster = poster or _graph_delete
    pages = []
    conn = calls_db._connect()
    try:
        rows = conn.execute("SELECT page_id, page_token FROM meta_pages WHERE account_id = ?", (account_id,)).fetchall()
        for row in rows:
            unsubscribed = True
            try:
                poster(f"{GRAPH}/{row['page_id']}/subscribed_apps", {"access_token": _dec(row["page_token"])})
            except Exception as exc:  # noqa: BLE001 - best effort; the Page may already be gone
                unsubscribed = False
                logger.warning("meta disconnect: unsubscribe failed for page %s: %s", row["page_id"], exc)
            pages.append({"pageId": row["page_id"], "unsubscribed": unsubscribed})
        with conn:
            conn.execute("UPDATE meta_pages SET status = 'disconnected', page_token = '' WHERE account_id = ?", (account_id,))
            conn.execute("UPDATE meta_connections SET status = 'disconnected', user_token = '' WHERE account_id = ?", (account_id,))
    finally:
        conn.close()
    # The Integrations list reads the `integrations` row; keep its card in step.
    calls_db.update_integration("facebook", "not_connected", {}, account_id)
    return {"ok": True, "pages": pages}


def status_for(account_id: int) -> dict:
    """What the integration page shows. `connected` means leads can flow:
    a live user connection AND at least one active Page."""
    conn_row = connection(account_id)
    pages = list_pages(account_id)
    pending = []
    stored = calls_db.get_setting(_PENDING_PAGES_SETTING, account_id)
    if stored:
        try:
            pending = [{"id": p["id"], "name": p["name"]} for p in json.loads(_dec(stored)).get("pages", [])]
        except (ValueError, TypeError):
            pending = []
    active = any(p["status"] == "active" for p in pages)
    return {
        "connected": bool(conn_row and conn_row["status"] == "connected" and active),
        "status": conn_row["status"] if conn_row else "not_connected",
        "fbUserName": conn_row["fb_user_name"] if conn_row else "",
        "tokenExpiresAt": conn_row["token_expires_at"] if conn_row else None,
        "lastError": conn_row["last_error"] if conn_row else "",
        "pages": pages,
        "pendingPages": pending,
        "tokenStorageOk": token_storage_ok(),
    }


def connect_pages(account_id: int, page_ids: set[str], poster: Poster | None = None, fetcher: Fetcher | None = None) -> dict:
    """Connect the chosen candidate Pages (stored server-side by the OAuth
    callback): subscribe each to leadgen, verify, store, and mark the
    `integrations` card connected. Returns {"ok", "results", "pages"}; ok is
    False when nothing connected. Raises ValueError without a pending list."""
    stored = calls_db.get_setting(_PENDING_PAGES_SETTING, account_id)
    if not stored:
        raise ValueError("Connect with Facebook first")
    pending = json.loads(_dec(stored))
    results = []
    for page in pending.get("pages", []):
        if page["id"] not in page_ids:
            continue
        try:
            add_page(account_id, pending.get("connection_id"), page["id"], page["name"], page["access_token"])
        except PageOwnedElsewhere:
            results.append({"pageId": page["id"], "ok": False, "reason": "owned_elsewhere"})
            continue
        try:
            ok = subscribe_page(page["id"], page["access_token"], poster=poster, fetcher=fetcher)
        except GraphError as exc:
            ok = False
            logger.warning("meta subscribe failed for page %s: %s", page["id"], exc)
        results.append({"pageId": page["id"], "ok": True, "subscribed": ok})
    calls_db.set_setting(_PENDING_PAGES_SETTING, "", account_id)
    # The forms and ads show in the rules picker straight away, not after a first lead.
    sync_forms(fetcher, account_id=account_id)
    sync_ads(fetcher, account_id=account_id)
    pages = list_pages(account_id)
    connected = [p for p in pages if p["status"] == "active"]
    if any(r.get("ok") for r in results):
        # Never a token in this config: it is what the Integrations list reads.
        calls_db.update_integration("facebook", "connected", {"pages": len(connected)}, account_id)
    return {"ok": any(r.get("ok") for r in results), "results": results, "pages": pages}


def list_events(account_id: int, limit: int = 200) -> list[dict]:
    """The Leads tab: every event with, when known, who the lead is and the
    call it produced (campaign_contacts.call_id)."""
    conn = calls_db._connect()
    try:
        rows = conn.execute(
            "SELECT e.page_id, p.page_name, e.leadgen_id, e.form_id, f.form_name, e.ad_id, e.via, e.status, e.reason, "
            "e.attempts, e.received_at, e.processed_at, e.dialed_at, e.campaign_contact_id, "
            "e.route_agent_id, e.route_from_number, e.route_label, cc.call_id, "
            "COALESCE(NULLIF(cc.name, ''), ile.name, '') AS name, COALESCE(NULLIF(cc.phone, ''), ile.phone, '') AS phone "
            "FROM meta_lead_events e LEFT JOIN meta_pages p ON p.page_id = e.page_id "
            "LEFT JOIN meta_forms f ON f.page_id = e.page_id AND f.form_id = e.form_id "
            "LEFT JOIN campaign_contacts cc ON cc.id = e.campaign_contact_id "
            "LEFT JOIN inbound_lead_events ile ON ile.account_id = e.account_id AND ile.source = ? AND ile.external_id = e.leadgen_id "
            "WHERE e.account_id = ? ORDER BY e.received_at DESC LIMIT ?",
            (SOURCE, account_id, max(1, min(int(limit), 500))),
        ).fetchall()
    finally:
        conn.close()
    return [dict(r) for r in rows]


def _graph_delete(url: str, data: dict) -> dict:
    try:
        req = urllib.request.Request(f"{url}?{urllib.parse.urlencode(data)}", method="DELETE")
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as exc:
        raise GraphError(0, exc.reason, exc.code) from exc


# ---------------------------------------------------------------- webhook

def verify_signature(raw_body: bytes, signature: str, app_secret: str) -> bool:
    if not app_secret or not signature or not signature.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(app_secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def record_webhook(payload: dict) -> dict:
    """Write one meta_lead_events row per leadgen change and return at once.
    Unknown Pages are recorded as skipped so the admin panel can see them;
    duplicates (Meta redelivers for up to 36 h) are no-ops."""
    received = ignored = duplicates = 0
    rows: list[tuple] = []
    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            if change.get("field") != "leadgen":
                ignored += 1
                continue
            value = change.get("value") or {}
            leadgen_id = str(value.get("leadgen_id") or "")
            page_id = str(value.get("page_id") or entry.get("id") or "")
            if not leadgen_id or not page_id:
                ignored += 1
                continue
            rows.append((page_id, leadgen_id, str(value.get("form_id") or ""), str(value.get("ad_id") or ""),
                         json.dumps(value)[:2000]))
    if not rows:
        return {"received": 0, "ignored": ignored, "duplicates": 0}
    conn = calls_db._connect()
    try:
        owners = {}
        for page_id in {r[0] for r in rows}:
            row = conn.execute("SELECT account_id, status FROM meta_pages WHERE page_id = ?", (page_id,)).fetchone()
            owners[page_id] = row
        with conn:
            for page_id, leadgen_id, form_id, ad_id, raw in rows:
                owner = owners.get(page_id)
                account_id = owner["account_id"] if owner and owner["status"] == "active" else None
                status, reason = ("received", "") if account_id else ("skipped", "unknown_page")
                inserted = conn.execute(
                    "INSERT INTO meta_lead_events (page_id, leadgen_id, account_id, form_id, ad_id, via, status, reason, raw_json) "
                    "VALUES (?, ?, ?, ?, ?, 'webhook', ?, ?, ?) ON CONFLICT (page_id, leadgen_id) DO NOTHING RETURNING leadgen_id",
                    (page_id, leadgen_id, account_id, form_id, ad_id, status, reason, raw),
                ).fetchone()
                if inserted:
                    received += 1
                else:
                    duplicates += 1
    finally:
        conn.close()
    if received:
        _wake.set()
    return {"received": received, "ignored": ignored, "duplicates": duplicates}


def handle_webhook_post(raw_body: bytes, signature: str, app_secret: str | None = None) -> tuple[int, dict]:
    """(http status, body). Signature first, size second, then record. Always
    200 once the signature checks out: a non-200 only makes Meta retry."""
    secret = _app_secret() if app_secret is None else app_secret
    if not verify_signature(raw_body, signature, secret):
        return 403, {"ok": False, "reason": "invalid_signature"}
    if len(raw_body) > MAX_BODY_BYTES:
        return 200, {"ok": False, "reason": "body_too_large"}
    try:
        payload = json.loads(raw_body)
    except ValueError:
        return 200, {"ok": False, "reason": "invalid_json"}
    if not isinstance(payload, dict) or payload.get("object") != "page":
        return 200, {"ok": True, "reason": "ignored_object"}
    return 200, {"ok": True, **record_webhook(payload)}


# ------------------------------------------------------------ lead mapping

def is_test_lead(lead: dict) -> bool:
    """Meta's Lead Ads Testing Tool fills every answer with
    '... test lead: dummy data for <field>' (plan B11): record, never dial."""
    for entry in lead.get("field_data") or []:
        for value in (entry or {}).get("values") or []:
            if "dummy data" in str(value).casefold():
                return True
    return False


def lead_fields(lead: dict, page: dict, account_id: int) -> tuple[str, str, str, dict]:
    """(name, phone, email, custom_fields) with EVERY form answer kept.

    Identity questions fill name/phone/email; every other question becomes
    `form_<slug>` plus one line in `form_answers` (the agent reads that line;
    see agent/contact_notes.py). Ad, ad set, campaign and form ids and names,
    platform, organic flag and the submission time ride along for the agent's
    notes and the "which ads bring leads" report."""
    name = last = phone = email = ""
    answers: list[str] = []
    fields: dict[str, str] = {}
    for entry in lead.get("field_data") or []:
        key = _text((entry or {}).get("name"), 100).casefold()
        values = [v for v in ((entry or {}).get("values") or []) if str(v).strip()]
        value = _text(" / ".join(str(v) for v in values), 300)
        if not key or not value:
            continue
        if key in _IDENTITY_PHONE:
            phone = phone or value
        elif key in _IDENTITY_NAME:
            name = name or value
        elif key in _IDENTITY_LAST:
            last = last or value
        elif key in _IDENTITY_EMAIL:
            email = email or value
        else:
            slug = _slug(key)
            label = key.replace("_", " ").strip("? ").capitalize()
            answers.append(f"{label}: {value}")
            if slug and re.fullmatch(r"[a-z][a-z0-9_]*", slug):
                fields.setdefault(f"form_{slug}", value)
            if "language" in slug:
                fields.setdefault("language", value)
    if last and name and last.casefold() not in name.casefold():
        name = f"{name} {last}"
    if answers:
        fields["form_answers"] = " · ".join(answers)[:1200]
    platform = _text(lead.get("platform"), 20).casefold()
    organic = str(lead.get("is_organic")).casefold() in ("true", "1")
    source_label = "Instagram Ad" if platform in ("ig", "instagram") else "Facebook Ad"
    if organic:
        source_label = "Instagram form" if platform in ("ig", "instagram") else "Facebook form"
    fields["lead_source"] = source_label
    fields["platform"] = "instagram" if platform in ("ig", "instagram") else "facebook"
    fields["is_organic"] = "true" if organic else "false"
    fields["page_id"] = str(page.get("page_id") or "")
    fields["page_name"] = _text(page.get("page_name"), 200)
    for key in ("form_id", "ad_id", "ad_name", "adset_id", "adset_name", "campaign_id", "campaign_name"):
        value = _text(lead.get(key), 200)
        if value:
            fields[key] = value
    fields["meta_lead_id"] = str(lead.get("id") or "")
    created = _parse_meta_time(lead.get("created_time"))
    if created:
        fields["meta_created_time"] = created.isoformat()
        local = created.astimezone(_account_tz(account_id))
        fields["form_filled_at"] = f"{local.day} {local:%b %Y}, {local.hour % 12 or 12}:{local:%M} {'am' if local.hour < 12 else 'pm'}"
    if email:
        fields["email"] = email
    return name, phone, email, fields


# ---------------------------------------------------------------- routing
# Phase 2: which agent and caller number a lead gets. Most specific wins: an
# ad rule, then a form rule, then the Page's default. Exact match only. A rule
# may only name this account's own agents and active numbers; that is checked
# when the rule is written AND again when a lead arrives, because an agent can
# be paused or a number released later. The winning match is never skipped
# for a less specific one: if its agent is paused, the lead is not called and
# the reason is on the event, which is what the customer configured.

class DuplicateRule(Exception):
    """A rule for this (page, kind, value) already exists."""


_RULE_KINDS = ("ad", "form")
_TARGET_PROBLEMS = {
    "agent_missing": "Agent not found in this workspace",
    "agent_paused": "That agent is paused; put it live first",
    "agent_demo": "The demo agent cannot make lead calls",
    "number_inactive": "That phone number is not one of this workspace's active numbers",
    "no_number": "This agent has no phone number to call from. Assign one in Phone Numbers or pick a number for the rule",
}


def _agent_state(conn, account_id: int, agent_id: int) -> str:
    row = conn.execute(
        "SELECT status, is_platform_demo, public_demo_slug FROM agents WHERE id = ? AND account_id = ?",
        (agent_id, account_id),
    ).fetchone()
    if row is None:
        return "agent_missing"
    if row["is_platform_demo"] or (row["public_demo_slug"] or ""):
        return "agent_demo"
    if row["status"] != "live":
        return "agent_paused"
    return ""


def _number_for(conn, account_id: int, agent_id: int, from_number: str) -> tuple[str, str]:
    """(number, '') for the caller number: the one named, else the agent's
    own active number; ('', reason) when neither works."""
    if from_number:
        row = conn.execute(
            "SELECT number FROM phone_numbers WHERE account_id = ? AND number = ? AND status = 'active'",
            (account_id, from_number),
        ).fetchone()
        return (row["number"], "") if row else ("", "number_inactive")
    row = conn.execute(
        "SELECT number FROM phone_numbers WHERE account_id = ? AND agent_id = ? AND status = 'active' ORDER BY id LIMIT 1",
        (account_id, agent_id),
    ).fetchone()
    return (row["number"], "") if row else ("", "no_number")


def resolve_route(account_id: int, page_id: str, form_id: str, ad_id: str) -> tuple[dict | None, str]:
    """(route, reason).

    route = {"agentId", "fromNumber", "label", "matchKind": "ad"|"form"|"page"}
    with reason "". Otherwise route is None and reason is "no_rules" (nothing
    configured for this Page) or why the winning rule/default cannot be used:
    "agent_paused", "agent_missing", "agent_demo", "number_inactive",
    "no_number"."""
    conn = calls_db._connect()
    try:
        candidates: list[tuple[str, int, str, str]] = []
        for kind, value in (("ad", ad_id), ("form", form_id)):
            if not value:
                continue
            row = conn.execute(
                "SELECT agent_id, from_number, label FROM meta_lead_rules "
                "WHERE account_id = ? AND page_id = ? AND match_kind = ? AND match_value = ?",
                (account_id, str(page_id), kind, str(value)),
            ).fetchone()
            if row:
                candidates.append((kind, int(row["agent_id"]), row["from_number"] or "", row["label"] or ""))
        page = conn.execute(
            "SELECT default_agent_id, default_from_number, page_name FROM meta_pages "
            "WHERE page_id = ? AND account_id = ? AND status = 'active'",
            (str(page_id), account_id),
        ).fetchone()
        if page and page["default_agent_id"]:
            label = f"Page default: {page['page_name']}" if page["page_name"] else "Page default"
            candidates.append(("page", int(page["default_agent_id"]), page["default_from_number"] or "", label))
        if not candidates:
            return None, "no_rules"
        kind, agent_id, from_number, label = candidates[0]
        reason = _agent_state(conn, account_id, agent_id)
        if reason:
            return None, reason
        number, reason = _number_for(conn, account_id, agent_id, from_number)
        if reason:
            return None, reason
        return {"agentId": agent_id, "fromNumber": number, "label": label or f"{kind} rule", "matchKind": kind}, ""
    finally:
        conn.close()


def _rule_item(row) -> dict:
    return {"id": row["id"], "pageId": row["page_id"], "matchKind": row["match_kind"], "matchValue": row["match_value"],
            "agentId": row["agent_id"], "fromNumber": row["from_number"] or "", "label": row["label"] or "",
            "position": row["position"] or 0}


def list_rules(account_id: int) -> list[dict]:
    conn = calls_db._connect()
    try:
        rows = conn.execute(
            "SELECT id, page_id, match_kind, match_value, agent_id, from_number, label, position FROM meta_lead_rules "
            "WHERE account_id = ? ORDER BY page_id, match_kind, position, id",
            (account_id,),
        ).fetchall()
    finally:
        conn.close()
    return [_rule_item(r) for r in rows]


def create_rule(account_id: int, data: dict) -> dict:
    """Raises ValueError with a plain-English detail, or DuplicateRule."""
    page_id = _text(data.get("pageId"), 64)
    kind = _text(data.get("matchKind"), 10).lower()
    value = _text(data.get("matchValue"), 100)
    label = _text(data.get("label"), 120)
    from_number = _text(data.get("fromNumber"), 40)
    try:
        agent_id = int(data.get("agentId"))
    except (TypeError, ValueError):
        raise ValueError("Pick the agent who should make the call") from None
    if kind not in _RULE_KINDS:
        raise ValueError("A rule matches an ad or a form")
    if not value:
        raise ValueError("Pick the ad or form the rule applies to")
    conn = calls_db._connect()
    try:
        with conn:
            if conn.execute(
                "SELECT 1 FROM meta_pages WHERE page_id = ? AND account_id = ? AND status = 'active'", (page_id, account_id)
            ).fetchone() is None:
                raise ValueError("That Facebook Page is not connected to this workspace")
            problem = _agent_state(conn, account_id, agent_id) or _number_for(conn, account_id, agent_id, from_number)[1]
            if problem:
                raise ValueError(_TARGET_PROBLEMS[problem])
            if conn.execute(
                "SELECT 1 FROM meta_lead_rules WHERE page_id = ? AND match_kind = ? AND match_value = ?", (page_id, kind, value)
            ).fetchone():
                raise DuplicateRule(f"{kind}:{value}")
            position = conn.execute(
                "SELECT count(*) n FROM meta_lead_rules WHERE page_id = ? AND match_kind = ?", (page_id, kind)
            ).fetchone()["n"]
            row = conn.execute(
                "INSERT INTO meta_lead_rules (account_id, page_id, match_kind, match_value, agent_id, from_number, label, position) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, page_id, match_kind, match_value, agent_id, from_number, label, position",
                (account_id, page_id, kind, value, agent_id, from_number, label, position),
            ).fetchone()
            return _rule_item(row)
    finally:
        conn.close()


def delete_rule(account_id: int, rule_id: int) -> bool:
    conn = calls_db._connect()
    try:
        with conn:
            return conn.execute("DELETE FROM meta_lead_rules WHERE id = ? AND account_id = ?", (rule_id, account_id)).rowcount == 1
    finally:
        conn.close()


def options(account_id: int) -> dict:
    """What the rules screen may pick from: this account's forms and ads seen
    on its leads, its live agents, its active numbers. Nothing typed by hand."""
    conn = calls_db._connect()
    try:
        forms = conn.execute(
            "SELECT f.page_id, f.form_id, f.form_name, f.label FROM meta_forms f "
            "JOIN meta_pages p ON p.page_id = f.page_id AND p.account_id = f.account_id "
            "WHERE f.account_id = ? AND p.status = 'active' ORDER BY f.form_name, f.form_id",
            (account_id,),
        ).fetchall()
        ads = conn.execute(
            "SELECT page_id, ad_id, ad_name, campaign_name FROM meta_ads WHERE account_id = ? ORDER BY first_seen_at DESC, ad_id",
            (account_id,),
        ).fetchall()
    finally:
        conn.close()
    agents = [{"id": a["id"], "name": a["name"], "status": a["status"]}
              for a in calls_db.list_agents(account_id) if not a.get("isPlatformDemo")]
    numbers = [{"number": n["number"], "agentId": n.get("agentId")}
               for n in calls_db.list_phone_numbers(account_id) if n.get("status") == "active"]
    return {
        "forms": [{"pageId": f["page_id"], "formId": f["form_id"], "formName": f["form_name"] or "", "label": f["label"] or ""} for f in forms],
        "ads": [{"pageId": a["page_id"], "adId": a["ad_id"], "adName": a["ad_name"] or "", "campaignName": a["campaign_name"] or ""} for a in ads],
        "agents": agents,
        "numbers": numbers,
    }


def _remember_ad(conn, page: dict, lead: dict) -> None:
    ad_id = _text(lead.get("ad_id"), 100)
    if not ad_id:
        return
    conn.execute(
        "INSERT INTO meta_ads (page_id, ad_id, account_id, ad_name, adset_name, campaign_id, campaign_name) "
        "VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (page_id, ad_id) DO UPDATE SET "
        "ad_name = CASE WHEN excluded.ad_name <> '' THEN excluded.ad_name ELSE meta_ads.ad_name END, "
        "adset_name = CASE WHEN excluded.adset_name <> '' THEN excluded.adset_name ELSE meta_ads.adset_name END, "
        "campaign_id = CASE WHEN excluded.campaign_id <> '' THEN excluded.campaign_id ELSE meta_ads.campaign_id END, "
        "campaign_name = CASE WHEN excluded.campaign_name <> '' THEN excluded.campaign_name ELSE meta_ads.campaign_name END",
        (page["page_id"], ad_id, page["account_id"], _text(lead.get("ad_name"), 200), _text(lead.get("adset_name"), 200),
         _text(lead.get("campaign_id"), 100), _text(lead.get("campaign_name"), 200)),
    )


# ---------------------------------------------------------------- worker

_wake = threading.Event()
_lock = threading.Lock()
_started = False


def _remember_form(conn, page: dict, form_id: str, form_name: str) -> None:
    if not form_id:
        return
    conn.execute(
        "INSERT INTO meta_forms (page_id, form_id, account_id, form_name) VALUES (?, ?, ?, ?) "
        "ON CONFLICT (page_id, form_id) DO UPDATE SET form_name = CASE WHEN excluded.form_name <> '' "
        "THEN excluded.form_name ELSE meta_forms.form_name END",
        (page["page_id"], form_id, page["account_id"], _text(form_name, 200)),
    )


def _upsert_contact(account_id: int, name: str, phone: str, email: str, fields: dict) -> int | None:
    """The lead in Contacts, as ArthaLeads leads are, with the answers merged
    over what we already knew about this number."""
    contact_phone = calls_db.canonical_contact_phone(phone, account_id)
    if not contact_phone:
        return None
    conn = calls_db._connect()
    try:
        with conn:
            current = conn.execute(
                "SELECT name, custom_fields, email, tags FROM contacts WHERE account_id = ? AND phone = ?",
                (account_id, contact_phone),
            ).fetchone()
            try:
                old = json.loads(current["custom_fields"] or "{}") if current else {}
            except (TypeError, ValueError):
                old = {}
            merged = {**old, **{k: v for k, v in fields.items() if v not in (None, "")}}
            tags = calls_db._clean_tags([
                *(str(current["tags"] or "").split(",") if current else []),
                "meta-lead-ads",
                *([f"ad:{fields['ad_name'][:60]}"] if fields.get("ad_name") else []),
                *([f"form:{fields['form_name'][:60]}"] if fields.get("form_name") else []),
            ])
            row = conn.execute(
                f"INSERT INTO contacts (account_id, name, phone, email, custom_fields, status, tags, source) "
                f"VALUES (?, ?, ?, ?, ?, 'new', ?, ?) ON CONFLICT(account_id, phone) DO UPDATE SET "
                f"name = excluded.name, email = CASE WHEN excluded.email <> '' THEN excluded.email ELSE contacts.email END, "
                f"custom_fields = excluded.custom_fields, tags = excluded.tags, deleted_at = NULL, updated_at = {calls_db._NOW} "
                "RETURNING id",
                (account_id, name or (current["name"] if current else "") or "Facebook lead", contact_phone,
                 email or "", json.dumps(merged, ensure_ascii=False), tags, SOURCE),
            ).fetchone()
            return row["id"]
    finally:
        conn.close()


def _finish_event(page_id: str, leadgen_id: str, status: str, reason: str = "", contact_id: int | None = None,
                  dialed: bool = False) -> None:
    conn = calls_db._connect()
    try:
        with conn:
            conn.execute(
                f"UPDATE meta_lead_events SET status = ?, reason = ?, campaign_contact_id = COALESCE(?, campaign_contact_id), "
                f"processed_at = {calls_db._NOW}, next_attempt_at = NULL WHERE page_id = ? AND leadgen_id = ?",
                (status, _text(reason, 300), contact_id, page_id, leadgen_id),
            )
            if status == "queued":
                conn.execute(f"UPDATE meta_pages SET last_lead_at = {calls_db._NOW} WHERE page_id = ?", (page_id,))
    finally:
        conn.close()


def _retry_event(page_id: str, leadgen_id: str, attempts: int, reason: str) -> None:
    """Keep the row for another go, with exponential backoff; give up as
    'failed' after MAX_ATTEMPTS (the hourly reconciliation is the last net)."""
    if attempts >= MAX_ATTEMPTS:
        _finish_event(page_id, leadgen_id, "failed", reason)
        return
    delay = RETRY_BACKOFF_SECONDS[min(attempts, len(RETRY_BACKOFF_SECONDS) - 1)]
    conn = calls_db._connect()
    try:
        with conn:
            conn.execute(
                "UPDATE meta_lead_events SET status = 'received', attempts = ?, reason = ?, next_attempt_at = ? "
                "WHERE page_id = ? AND leadgen_id = ?",
                (attempts, _text(reason, 300), _stamp(_utc_now() + datetime.timedelta(seconds=delay)), page_id, leadgen_id),
            )
    finally:
        conn.close()


def process_event(event: dict, fetcher: Fetcher | None = None, now: datetime.datetime | None = None) -> str:
    """One lead end to end: fetch from Graph with the Page token, keep every
    field, record the contact, queue the call (unless test or stale), wake the
    dialer. Returns the event's final status."""
    fetcher = fetcher or _graph_get
    now = now or _utc_now()
    page_id, leadgen_id = event["page_id"], event["leadgen_id"]
    attempts = int(event.get("attempts") or 0) + 1
    page = page_owner(page_id)
    if page is None:
        _finish_event(page_id, leadgen_id, "skipped", "unknown_page")
        return "skipped"
    account_id = int(page["account_id"])
    try:
        lead = fetcher(f"{GRAPH}/{leadgen_id}?{urllib.parse.urlencode({'fields': LEAD_FIELDS, 'access_token': page['page_token']})}")
    except GraphError as exc:
        if exc.code in TOKEN_ERROR_CODES:
            mark_needs_reconnect(account_id, f"Graph {exc.code}: {exc.message}")
        reason = f"graph_{exc.code or exc.http_status}"
        _retry_event(page_id, leadgen_id, attempts, reason)
        return "received"
    except Exception as exc:  # noqa: BLE001 - network blip: retry with backoff
        _retry_event(page_id, leadgen_id, attempts, f"fetch_error: {exc}"[:200])
        return "received"

    name, phone, email, fields = lead_fields(lead, page, account_id)
    form_id = str(lead.get("form_id") or event.get("form_id") or "")
    ad_id = str(lead.get("ad_id") or event.get("ad_id") or "")
    route, route_reason = resolve_route(account_id, page_id, form_id, ad_id)
    fields["route_label"] = route["label"] if route else ""
    conn = calls_db._connect()
    try:
        with conn:
            _remember_form(conn, page, form_id, str(lead.get("form_name") or ""))
            _remember_ad(conn, page, lead)
            conn.execute(
                "UPDATE meta_lead_events SET form_id = COALESCE(NULLIF(?, ''), form_id), ad_id = COALESCE(NULLIF(?, ''), ad_id), "
                "route_agent_id = ?, route_from_number = ?, route_label = ? WHERE page_id = ? AND leadgen_id = ?",
                (form_id, ad_id, route["agentId"] if route else None, route["fromNumber"] if route else "",
                 route["label"] if route else "", page_id, leadgen_id),
            )
    finally:
        conn.close()

    if is_test_lead(lead):
        _finish_event(page_id, leadgen_id, "test", "meta_testing_tool")
        return "test"
    if not phone:
        calls_db._record_lead_event(account_id, SOURCE, leadgen_id, name, "")
        _finish_event(page_id, leadgen_id, "skipped", "no_phone")
        return "skipped"
    contact_id = _upsert_contact(account_id, name, phone, email, fields)
    created = _parse_meta_time(lead.get("created_time"))
    if created and now - created > datetime.timedelta(hours=STALE_AFTER_HOURS):
        calls_db._record_lead_event(account_id, SOURCE, leadgen_id, name, phone)
        _finish_event(page_id, leadgen_id, "stale", f"older_than_{STALE_AFTER_HOURS}h", contact_id)
        return "stale"
    if route is None and route_reason != "no_rules":
        # The configured agent or number cannot take the call (paused, released).
        # Calling from a different agent is not what the customer set up.
        calls_db._record_lead_event(account_id, SOURCE, leadgen_id, name, phone)
        _finish_event(page_id, leadgen_id, "skipped", route_reason, contact_id)
        return "skipped"
    kwargs: dict = {}
    route_note = ""
    if route and _INGEST_ACCEPTS_ROUTE:
        kwargs["route"] = {"agentId": route["agentId"], "fromNumber": route["fromNumber"], "label": route["label"]}
    elif route:
        route_note = "route_not_wired_generic_agent"
        _warn_once("route", "meta leads: calls_db.ingest_inbound_lead has no route parameter yet; "
                            "rules are recorded but leads use the generic agent (docs/patches/calls_db-meta-route.md)")
    else:
        route_note = "no_route_generic_agent"
    result = calls_db.ingest_inbound_lead(account_id, name, phone, SOURCE, external_id=leadgen_id, custom_fields=fields, **kwargs)
    if not result.get("ok"):
        _finish_event(page_id, leadgen_id, "skipped", str(result.get("reason") or "not_queued"), contact_id)
        return "skipped"
    if not result.get("queued"):
        _finish_event(page_id, leadgen_id, "skipped", str(result.get("reason") or "no_campaign"), contact_id)
        return "skipped"
    _finish_event(page_id, leadgen_id, "queued",
                  ";".join(part for part in (route_note, "deduped" if result.get("deduped") else "") if part),
                  result.get("contact_id"))
    if result.get("delay_seconds"):
        campaign_dialer.notify_after(result["delay_seconds"])
    else:
        campaign_dialer.notify()
    return "queued"


def process_pending(limit: int = 50, fetcher: Fetcher | None = None, now: datetime.datetime | None = None) -> dict:
    """One worker pass: every due 'received' event, oldest first, each in its
    own transaction so one tenant's dead token never blocks another's leads."""
    now = now or _utc_now()
    conn = calls_db._connect()
    try:
        rows = conn.execute(
            "SELECT page_id, leadgen_id, account_id, form_id, ad_id, attempts FROM meta_lead_events "
            "WHERE status = 'received' AND account_id IS NOT NULL AND (next_attempt_at IS NULL OR next_attempt_at <= ?) "
            "ORDER BY received_at LIMIT ?",
            (_stamp(now), limit),
        ).fetchall()
    finally:
        conn.close()
    stats: dict[str, int] = {}
    for row in rows:
        try:
            status = process_event(dict(row), fetcher=fetcher, now=now)
        except Exception:  # noqa: BLE001 - never let one lead stop the pass
            logger.exception("meta lead %s/%s failed", row["page_id"], row["leadgen_id"])
            _retry_event(row["page_id"], row["leadgen_id"], int(row["attempts"] or 0) + 1, "worker_error")
            status = "error"
        stats[status] = stats.get(status, 0) + 1
    return stats


def backlog() -> int:
    conn = calls_db._connect()
    try:
        return int(conn.execute("SELECT count(*) n FROM meta_lead_events WHERE status = 'received'").fetchone()["n"])
    finally:
        conn.close()


# ---------------------------------------------------------- reconciliation

def sync_forms(fetcher: Fetcher | None = None, now: datetime.datetime | None = None, account_id: int | None = None) -> int:
    """Learn each active Page's lead forms from Meta. Before this a form was
    only known once a webhook lead arrived from it, so reconcile never checked
    a form Meta had not pushed a lead from (every form, while the app is
    unpublished: Meta sends unpublished apps no real webhooks) and the rules
    picker stayed empty. A form seen for the first time is checked from now
    on, so connecting a Page does not dial the last two days' leads."""
    fetcher = fetcher or _graph_get
    stamp = _stamp(now or _utc_now())
    conn = calls_db._connect()
    try:
        sql, params = "SELECT page_id FROM meta_pages WHERE status = 'active'", ()
        if account_id is not None:
            sql, params = sql + " AND account_id = ?", (account_id,)
        page_ids = [row["page_id"] for row in conn.execute(sql, params).fetchall()]
    finally:
        conn.close()
    found = 0
    for page_id in page_ids:
        page = page_owner(page_id)
        if page is None:
            continue
        url = f"{GRAPH}/{page_id}/leadgen_forms?" + urllib.parse.urlencode(
            {"fields": "id,name", "limit": 100, "access_token": page["page_token"]})
        try:
            pages_seen = 0
            while url and pages_seen < 10:
                data = fetcher(url)
                pages_seen += 1
                conn = calls_db._connect()
                try:
                    with conn:
                        for form in data.get("data") or []:
                            if not form.get("id"):
                                continue
                            conn.execute(
                                "INSERT INTO meta_forms (page_id, form_id, account_id, form_name, last_reconciled_at) "
                                "VALUES (?, ?, ?, ?, ?) ON CONFLICT (page_id, form_id) DO UPDATE SET form_name = CASE "
                                "WHEN excluded.form_name <> '' THEN excluded.form_name ELSE meta_forms.form_name END",
                                (page_id, str(form["id"]), page["account_id"], _text(str(form.get("name") or ""), 200), stamp),
                            )
                            found += 1
                finally:
                    conn.close()
                url = ((data.get("paging") or {}).get("next")) or ""
        except GraphError as exc:
            if exc.code in TOKEN_ERROR_CODES:
                mark_needs_reconnect(int(page["account_id"]), f"Graph {exc.code}: {exc.message}")
            logger.warning("meta form sync failed for page %s: %s", page_id, exc)
        except Exception:  # noqa: BLE001
            logger.exception("meta form sync failed for page %s", page_id)
    return found


_LEAD_OBJECTIVES = {"LEAD_GENERATION", "OUTCOME_LEADS"}
_AD_FIELDS = "id,name,effective_status,adset{name},campaign{id,name,objective},creative{actor_id}"


def sync_ads(fetcher: Fetcher | None = None, account_id: int | None = None) -> int:
    """Learn the lead ads on each workspace's connected Pages from the ad
    accounts its connection was granted, so the rules picker can send an ad to
    its own agent before any lead arrives from it (until now an ad was only
    known from a delivered lead). An ad counts when its campaign is a leads
    campaign, its creative's Page is one of the workspace's connected Pages,
    and it is not deleted or archived. One ad account failing does not stop
    the others."""
    fetcher = fetcher or _graph_get
    conn = calls_db._connect()
    try:
        sql, params = "SELECT account_id, page_id FROM meta_pages WHERE status = 'active'", ()
        if account_id is not None:
            sql, params = sql + " AND account_id = ?", (account_id,)
        rows = conn.execute(sql, params).fetchall()
    finally:
        conn.close()
    pages_by_account: dict[int, set[str]] = {}
    for row in rows:
        pages_by_account.setdefault(int(row["account_id"]), set()).add(str(row["page_id"]))
    found = 0
    for acct, page_ids in pages_by_account.items():
        link = connection(acct)
        if not link or link.get("status") != "connected" or not link.get("user_token"):
            continue
        token = link["user_token"]
        try:
            ad_accounts = fetcher(f"{GRAPH}/me/adaccounts?" + urllib.parse.urlencode(
                {"fields": "account_id", "limit": 50, "access_token": token})).get("data") or []
        except GraphError as exc:
            if exc.code in TOKEN_ERROR_CODES:
                mark_needs_reconnect(acct, f"Graph {exc.code}: {exc.message}")
            logger.warning("meta ad sync: no ad accounts for workspace %s: %s", acct, exc)
            continue
        except Exception:  # noqa: BLE001
            logger.exception("meta ad sync: ad accounts failed for workspace %s", acct)
            continue
        kept = 0
        for ad_account in ad_accounts[:20]:
            act = str(ad_account.get("account_id") or "")
            if not act.isdigit():
                continue
            url = f"{GRAPH}/act_{act}/ads?" + urllib.parse.urlencode({"fields": _AD_FIELDS, "limit": 100, "access_token": token})
            try:
                pages_seen = 0
                while url and pages_seen < 10:
                    data = fetcher(url)
                    pages_seen += 1
                    conn = calls_db._connect()
                    try:
                        with conn:
                            for ad in data.get("data") or []:
                                campaign = ad.get("campaign") or {}
                                page_id = str((ad.get("creative") or {}).get("actor_id") or "")
                                if (not ad.get("id") or campaign.get("objective") not in _LEAD_OBJECTIVES
                                        or page_id not in page_ids or ad.get("effective_status") in ("DELETED", "ARCHIVED")):
                                    continue
                                _remember_ad(conn, {"page_id": page_id, "account_id": acct}, {
                                    "ad_id": ad["id"], "ad_name": ad.get("name"), "adset_name": (ad.get("adset") or {}).get("name"),
                                    "campaign_id": campaign.get("id"), "campaign_name": campaign.get("name")})
                                kept += 1
                    finally:
                        conn.close()
                    url = ((data.get("paging") or {}).get("next")) or ""
            except GraphError as exc:
                logger.warning("meta ad sync failed for ad account %s (workspace %s): %s", act, acct, exc)
            except Exception:  # noqa: BLE001
                logger.exception("meta ad sync failed for ad account %s (workspace %s)", act, acct)
        logger.info("meta ad sync: workspace %s, %d ad account(s), %d lead ad(s)", acct, len(ad_accounts), kept)
        found += kept
    return found


def reconcile(fetcher: Fetcher | None = None, now: datetime.datetime | None = None, lookback_hours: int = 48) -> dict:
    """Plan B8: list each active form's leads since the last check and insert
    any the webhook never delivered. They go through the same worker; the
    24 h stale rule decides whether they are called. The Pages' forms and
    lead ads are refreshed from Meta first (sync_forms, sync_ads)."""
    fetcher = fetcher or _graph_get
    now = now or _utc_now()
    sync_forms(fetcher, now)
    sync_ads(fetcher)
    conn = calls_db._connect()
    try:
        forms = conn.execute(
            "SELECT f.page_id, f.form_id, f.account_id, f.last_reconciled_at FROM meta_forms f "
            "JOIN meta_pages p ON p.page_id = f.page_id WHERE f.status = 'active' AND p.status = 'active'"
        ).fetchall()
    finally:
        conn.close()
    inserted = checked = errors = 0
    for form in forms:
        page = page_owner(form["page_id"])
        if page is None:
            continue
        since_dt = _parse_meta_time(form["last_reconciled_at"].replace(" ", "T") + "+00:00") if form["last_reconciled_at"] else None
        since = int((since_dt or (now - datetime.timedelta(hours=lookback_hours))).timestamp()) - 60
        url = (f"{GRAPH}/{form['form_id']}/leads?" + urllib.parse.urlencode({
            "fields": "id,created_time,ad_id", "limit": 100,
            "filtering": json.dumps([{"field": "time_created", "operator": "GREATER_THAN", "value": since}]),
            "access_token": page["page_token"]}))
        try:
            pages_seen = 0
            while url and pages_seen < 20:
                data = fetcher(url)
                pages_seen += 1
                conn = calls_db._connect()
                try:
                    with conn:
                        for lead in data.get("data") or []:
                            checked += 1
                            if conn.execute(
                                "INSERT INTO meta_lead_events (page_id, leadgen_id, account_id, form_id, ad_id, via, status) "
                                "VALUES (?, ?, ?, ?, ?, 'reconcile', 'received') ON CONFLICT (page_id, leadgen_id) DO NOTHING "
                                "RETURNING leadgen_id",
                                (form["page_id"], str(lead.get("id")), form["account_id"], form["form_id"], str(lead.get("ad_id") or "")),
                            ).fetchone():
                                inserted += 1
                finally:
                    conn.close()
                url = ((data.get("paging") or {}).get("next")) or ""
            conn = calls_db._connect()
            try:
                with conn:
                    conn.execute("UPDATE meta_forms SET last_reconciled_at = ? WHERE page_id = ? AND form_id = ?",
                                 (_stamp(now), form["page_id"], form["form_id"]))
            finally:
                conn.close()
        except GraphError as exc:
            errors += 1
            if exc.code in TOKEN_ERROR_CODES:
                mark_needs_reconnect(int(form["account_id"]), f"Graph {exc.code}: {exc.message}")
        except Exception:  # noqa: BLE001
            errors += 1
            logger.exception("meta reconcile failed for form %s", form["form_id"])
    if inserted:
        _wake.set()
    return {"forms": len(forms), "checked": checked, "inserted": inserted, "errors": errors}


def _loop() -> None:
    last_reconcile = 0.0
    while True:
        try:
            process_pending()
            if time.monotonic() - last_reconcile > RECONCILE_EVERY_SECONDS:
                last_reconcile = time.monotonic()
                reconcile()
        except Exception:  # noqa: BLE001
            logger.exception("meta worker pass failed")
        _wake.wait(WORKER_TICK_SECONDS)
        _wake.clear()


def start_worker() -> None:
    """Idempotent daemon thread, same shape as campaign_dialer.start_dialer.
    DISABLE_META_WORKER=1 keeps it off (local runs against a shared DB)."""
    if os.environ.get("DISABLE_META_WORKER", "").strip() not in ("", "0", "false", "False"):
        logger.info("meta lead worker disabled via DISABLE_META_WORKER")
        return
    global _started
    with _lock:
        if _started:
            return
        _started = True
    threading.Thread(target=_loop, name="meta-leads", daemon=True).start()


# --------------------------------------------- deauthorize / data deletion

def parse_signed_request(signed_request: str, app_secret: str) -> dict | None:
    """Meta's signed_request: base64url(sig).base64url(json). None unless the
    HMAC-SHA256 over the payload matches the app secret."""
    try:
        sig_b64, payload_b64 = signed_request.split(".", 1)
        pad = lambda s: s + "=" * (-len(s) % 4)  # noqa: E731
        sig = base64.urlsafe_b64decode(pad(sig_b64))
        payload = json.loads(base64.urlsafe_b64decode(pad(payload_b64)))
    except (ValueError, TypeError):
        return None
    expected = hmac.new(app_secret.encode(), payload_b64.encode(), hashlib.sha256).digest()
    if not hmac.compare_digest(sig, expected):
        return None
    return payload if isinstance(payload, dict) else None


def deauthorize(fb_user_id: str) -> int:
    """The Facebook user removed our app: their connections can no longer
    read leads. Mark them so the dashboard shows 'Reconnect', keep the leads."""
    conn = calls_db._connect()
    try:
        with conn:
            cur = conn.execute(
                f"UPDATE meta_connections SET status = 'needs_reconnect', last_error = 'App removed on Facebook', "
                f"last_error_at = {calls_db._NOW} WHERE fb_user_id = ? AND status NOT IN ('replaced', 'disconnected')",
                (_text(fb_user_id, 64),),
            )
            return cur.rowcount
    finally:
        conn.close()


def delete_user_data(fb_user_id: str) -> str:
    """Meta's data-deletion callback is about the Facebook USER who
    authorised us: erase their tokens, id and name. The leads stay: they are
    the business's own records of its customers, not the Facebook user's data."""
    code = secrets.token_urlsafe(12)
    conn = calls_db._connect()
    try:
        with conn:
            conn.execute(
                "UPDATE meta_connections SET status = 'disconnected', user_token = '', fb_user_id = '', fb_user_name = '' "
                "WHERE fb_user_id = ?",
                (_text(fb_user_id, 64),),
            )
            conn.execute("INSERT INTO meta_deletion_requests (confirmation_code, fb_user_id) VALUES (?, ?)",
                         (code, _text(fb_user_id, 64)))
    finally:
        conn.close()
    return code


def deletion_status(code: str) -> dict | None:
    conn = calls_db._connect()
    try:
        row = conn.execute("SELECT status, requested_at FROM meta_deletion_requests WHERE confirmation_code = ?",
                           (code,)).fetchone()
    finally:
        conn.close()
    return dict(row) if row else None


# -------------------------------------------------------------- OAuth flow

def oauth_start_url(state: str, redirect_uri: str, client_id: str, config_id: str = "") -> str:
    """auth_type=rerequest: without it a user who once ticked no Pages gets
    zero Pages for ever (ArthaLeads found this the hard way). With a Facebook
    Login for Business configuration (config_id) Meta takes the permissions
    and the Page / ad account picker from that configuration, not scope."""
    params = {"client_id": client_id, "redirect_uri": redirect_uri, "state": state,
              "response_type": "code", "auth_type": "rerequest"}
    if config_id:
        params.update(config_id=config_id, override_default_response_type="true")
    else:
        params["scope"] = SCOPES
    return f"https://www.facebook.com/{GRAPH_VERSION}/dialog/oauth?{urllib.parse.urlencode(params)}"


def exchange_code(code: str, redirect_uri: str, client_id: str, client_secret: str, fetcher: Fetcher | None = None) -> dict:
    """code → short-lived user token → long-lived (60-day) user token.
    Returns {access_token, expires_in}. If the long-lived exchange fails we
    keep the short one and say so, rather than failing the whole connect.
    A Business Login configuration that issues a system-user token answers
    without expires_in: that token never expires, so there is nothing to
    extend and expires_in is None."""
    fetcher = fetcher or _graph_get
    short = fetcher(f"{GRAPH}/oauth/access_token?" + urllib.parse.urlencode(
        {"client_id": client_id, "client_secret": client_secret, "redirect_uri": redirect_uri, "code": code}))
    token = short.get("access_token")
    if not token:
        raise GraphError(0, "no access_token in code exchange")
    if not short.get("expires_in"):
        return {"access_token": token, "expires_in": None, "long_lived": True}
    try:
        long = fetcher(f"{GRAPH}/oauth/access_token?" + urllib.parse.urlencode(
            {"grant_type": "fb_exchange_token", "client_id": client_id, "client_secret": client_secret,
             "fb_exchange_token": token}))
        if long.get("access_token"):
            return {"access_token": long["access_token"], "expires_in": int(long.get("expires_in") or 60 * 86400),
                    "long_lived": True}
    except GraphError as exc:
        logger.warning("meta long-lived token exchange failed: %s", exc)
    return {"access_token": token, "expires_in": int(short.get("expires_in") or 3600), "long_lived": False}


def list_user_pages(user_token: str, app_id: str, app_secret: str, fetcher: Fetcher | None = None) -> list[dict]:
    """Pages this user can connect: /me/accounts, and when that is empty the
    New Pages Experience fallback via debug_token's granular scopes."""
    fetcher = fetcher or _graph_get
    me = fetcher(f"{GRAPH}/me?" + urllib.parse.urlencode({"fields": "id,name", "access_token": user_token}))
    pages: list[dict] = []
    url = f"{GRAPH}/me/accounts?" + urllib.parse.urlencode({"fields": "id,name,access_token", "limit": 100, "access_token": user_token})
    seen = 0
    while url and seen < 10:
        data = fetcher(url)
        seen += 1
        pages.extend(p for p in (data.get("data") or []) if p.get("id") and p.get("access_token"))
        url = ((data.get("paging") or {}).get("next")) or ""
    if not pages and app_id and app_secret:
        try:
            debug = fetcher(f"{GRAPH}/debug_token?" + urllib.parse.urlencode(
                {"input_token": user_token, "access_token": f"{app_id}|{app_secret}"}))
            targets = []
            for scope in ((debug.get("data") or {}).get("granular_scopes") or []):
                if scope.get("scope") == "pages_show_list":
                    targets.extend(scope.get("target_ids") or [])
            for page_id in targets[:50]:
                page = fetcher(f"{GRAPH}/{page_id}?" + urllib.parse.urlencode({"fields": "id,name,access_token", "access_token": user_token}))
                if page.get("id") and page.get("access_token"):
                    pages.append(page)
        except GraphError as exc:
            logger.warning("meta debug_token page fallback failed: %s", exc)
    return [{"id": str(p["id"]), "name": str(p.get("name") or ""), "access_token": p["access_token"],
             "fb_user_id": str(me.get("id") or ""), "fb_user_name": str(me.get("name") or "")} for p in pages]


def subscribe_page(page_id: str, page_token: str, poster: Poster | None = None, fetcher: Fetcher | None = None) -> bool:
    """Subscribe the Page to leadgen and VERIFY it with GET subscribed_apps,
    so 'subscribed' means leads will flow, not just that the POST returned."""
    poster, fetcher = poster or _graph_post, fetcher or _graph_get
    poster(f"{GRAPH}/{page_id}/subscribed_apps", {"subscribed_fields": "leadgen", "access_token": page_token})
    check = fetcher(f"{GRAPH}/{page_id}/subscribed_apps?" + urllib.parse.urlencode({"access_token": page_token}))
    ok = any("leadgen" in (app.get("subscribed_fields") or []) for app in (check.get("data") or []))
    mark_page_subscribed(page_id, ok)
    return ok


# ------------------------------------------------------------------ router
# token_api.py mounts this router and injects its session helpers through
# configure(); importing token_api here would be circular.

router = APIRouter()
_deps: dict = {"require_admin": None, "live_session": None, "app_base_url": None, "cookie_secure": True}
_STATE_COOKIE = "vv_meta_state"
_POPUP_COOKIE = "vv_meta_popup"
_POPUP_RESULTS = {"failed", "no_pages", "pick_pages", "connected"}
_PENDING_PAGES_SETTING = "meta_pending_pages"


def configure(*, require_admin, live_session, app_base_url, cookie_secure: bool = True) -> None:
    _deps.update(require_admin=require_admin, live_session=live_session, app_base_url=app_base_url,
                 cookie_secure=cookie_secure)


def _env() -> dict:
    return {"client_id": os.environ.get("META_OAUTH_CLIENT_ID", ""),
            "client_secret": os.environ.get("META_OAUTH_CLIENT_SECRET", ""),
            "redirect_uri": os.environ.get("META_OAUTH_REDIRECT_URI", ""),
            "verify_token": os.environ.get("META_WEBHOOK_VERIFY_TOKEN", ""),
            "login_config_id": os.environ.get("META_LOGIN_CONFIG_ID", "")}


@router.get("/webhooks/meta")
def webhook_verify(request: Request):
    params = request.query_params
    expected = _env()["verify_token"]
    if params.get("hub.mode") == "subscribe" and expected and hmac.compare_digest(params.get("hub.verify_token", ""), expected):
        return JSONResponse(int(params.get("hub.challenge", "0") or 0))
    raise HTTPException(403, "Verification failed")


@router.post("/webhooks/meta")
async def webhook_event(request: Request):
    raw = await request.body()
    status, body = handle_webhook_post(raw, request.headers.get("x-hub-signature-256", ""))
    return JSONResponse(body, status_code=status)


@router.post("/webhooks/meta/deauthorize")
async def webhook_deauthorize(request: Request):
    form = await request.form()
    payload = parse_signed_request(str(form.get("signed_request") or ""), _app_secret())
    if not payload or not payload.get("user_id"):
        raise HTTPException(400, "Invalid signed_request")
    return {"ok": True, "connections": deauthorize(str(payload["user_id"]))}


@router.post("/webhooks/meta/deletion")
async def webhook_deletion(request: Request):
    form = await request.form()
    payload = parse_signed_request(str(form.get("signed_request") or ""), _app_secret())
    if not payload or not payload.get("user_id"):
        raise HTTPException(400, "Invalid signed_request")
    code = delete_user_data(str(payload["user_id"]))
    base = calls_db.public_base_url() or ""
    return {"url": f"{base}/webhooks/meta/deletion/{code}", "confirmation_code": code}


@router.get("/webhooks/meta/deletion/{code}")
def webhook_deletion_status(code: str):
    status = deletion_status(code)
    if not status:
        raise HTTPException(404, "Unknown confirmation code")
    return {"confirmation_code": code, "status": status["status"], "requested_at": status["requested_at"],
            "note": "The Facebook login connection and its tokens were deleted."}


def _admin(request: Request) -> dict:
    """The signed-in admin, through token_api's own session helpers."""
    if _deps["live_session"] is None:
        raise HTTPException(503, "Meta integration is not wired up on this server")
    session = _deps["live_session"](request)
    if not session:
        raise HTTPException(401, "Sign in to continue")
    profile = calls_db.get_user_by_id(session["uid"])
    if not profile or calls_db.ROLE_RANK.get(profile.get("role"), 0) < calls_db.ROLE_RANK["admin"]:
        raise HTTPException(403, "Admin access is required")
    return {"user_id": session["uid"], "account_id": profile["account_id"]}


def popup_result_page(result: str, fallback_url: str) -> HTMLResponse:
    """What the callback shows when sign-in ran in the dashboard's pop-up:
    hand the result to the dashboard tab and close. BroadcastChannel first,
    because facebook.com can cut the pop-up's window.opener; if the window
    cannot close (opened some other way) it carries on to the dashboard."""
    result = result if result in _POPUP_RESULTS else "failed"
    message = json.dumps({"source": "vv-meta", "result": result})
    target = json.dumps(fallback_url).replace("<", "\\u003c")
    return HTMLResponse(
        "<!doctype html><meta charset=\"utf-8\"><title>Facebook</title>"
        "<p style=\"font:14px system-ui,sans-serif;padding:24px\">You can close this window.</p>"
        f"<script>(function(){{var m={message};"
        "try{new BroadcastChannel('vv-meta').postMessage(m)}catch(e){}"
        "try{if(window.opener)window.opener.postMessage(m,location.origin)}catch(e){}"
        f"window.close();setTimeout(function(){{location.replace({target})}},800)}})()</script>")


@router.get("/integrations/meta/start")
def meta_start(request: Request, popup: int = 0):
    user = _admin(request)
    env = _env()
    if not env["client_id"] or not env["client_secret"] or not env["redirect_uri"]:
        raise HTTPException(404, "Facebook integration is not configured on this server")
    if not token_storage_ok():
        raise HTTPException(503, "Token encryption is not configured; connection refused")
    try:
        calls_db.require_feature(user["account_id"], "meta_leads")
    except Exception as exc:  # plan_policy.EntitlementError
        raise HTTPException(403, str(exc)) from exc
    state = secrets.token_urlsafe(24)
    response = RedirectResponse(oauth_start_url(state, env["redirect_uri"], env["client_id"], env["login_config_id"]))
    response.set_cookie(_STATE_COOKIE, state, max_age=600, httponly=True, secure=_deps["cookie_secure"], samesite="lax", path="/")
    if popup:
        response.set_cookie(_POPUP_COOKIE, "1", max_age=600, httponly=True, secure=_deps["cookie_secure"], samesite="lax", path="/")
    else:
        response.delete_cookie(_POPUP_COOKIE, path="/")
    return response


@router.get("/auth/oauth/meta/callback")
def meta_callback(request: Request, code: str | None = None, state: str | None = None, error: str | None = None):
    """Public path (like Zoho/Sheets): the session cookie is read here.
    Stores the user connection and the candidate Pages; the dashboard then
    shows the Page picker (POST /integrations/meta/pages) rather than guessing."""
    base = _deps["app_base_url"](request) if _deps["app_base_url"] else ""

    popup = request.cookies.get(_POPUP_COOKIE) == "1"

    def finish(query: str) -> RedirectResponse | HTMLResponse:
        target = f"{base}/dashboard/integrations/facebook{query}"
        response = popup_result_page(query.split("=", 1)[-1], target) if popup else RedirectResponse(target)
        response.delete_cookie(_STATE_COOKIE, path="/")
        response.delete_cookie(_POPUP_COOKIE, path="/")
        return response

    expected = request.cookies.get(_STATE_COOKIE)
    if error or not code or not expected or not secrets.compare_digest(state or "", expected):
        return finish("?facebook=failed")
    try:
        user = _admin(request)
    except HTTPException:
        return finish("?facebook=failed")
    env = _env()
    try:
        token = exchange_code(code, env["redirect_uri"], env["client_id"], env["client_secret"])
        pages = list_user_pages(token["access_token"], env["client_id"], env["client_secret"])
    except Exception:  # noqa: BLE001
        logger.exception("meta oauth callback failed")
        return finish("?facebook=failed")
    if not pages:
        return finish("?facebook=no_pages")
    fb_user_id, fb_user_name = pages[0]["fb_user_id"], pages[0]["fb_user_name"]
    try:
        connection_id = save_connection(user["account_id"], token["access_token"], token["expires_in"], fb_user_id, fb_user_name, user["user_id"])
    except TokenStorageUnavailable:
        return finish("?facebook=failed")
    # Candidate Pages wait server-side (tokens never reach the browser) until
    # the admin picks which to connect.
    calls_db.set_setting(_PENDING_PAGES_SETTING, _enc(json.dumps(
        {"connection_id": connection_id, "pages": pages, "at": _stamp(_utc_now())})), user["account_id"])
    return finish("?facebook=pick_pages")


@router.get("/integrations/meta")
def meta_status(request: Request):
    user = _admin(request)
    return status_for(user["account_id"])


@router.post("/integrations/meta/pages")
async def meta_connect_pages(request: Request):
    """Connect the chosen candidate Pages: subscribe each to leadgen, verify,
    store. A Page another workspace owns comes back as 409."""
    user = _admin(request)
    body = await request.json()
    wanted = {str(p) for p in (body.get("pageIds") or [])}
    try:
        out = connect_pages(user["account_id"], wanted)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if not out["ok"] and any(r.get("reason") == "owned_elsewhere" for r in out["results"]):
        return JSONResponse({"ok": False, "results": out["results"],
                             "detail": "That Facebook Page is already connected to another Vistrow workspace."}, status_code=409)
    return {"ok": True, "results": out["results"], "pages": out["pages"]}


@router.patch("/integrations/meta/pages/{page_id}")
async def meta_page_default(page_id: str, request: Request):
    user = _admin(request)
    body = await request.json()
    agent_id = body.get("agentId")
    try:
        ok = set_page_default(user["account_id"], page_id, int(agent_id) if agent_id not in (None, "") else None,
                              str(body.get("fromNumber") or ""))
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if not ok:
        raise HTTPException(404, "Page not found in this workspace")
    return {"ok": True, "pages": list_pages(user["account_id"])}


@router.post("/integrations/meta/disconnect")
def meta_disconnect(request: Request):
    user = _admin(request)
    return disconnect(user["account_id"])


@router.get("/integrations/meta/leads")
def meta_leads_list(request: Request, limit: int = 200):
    user = _admin(request)
    return {"items": list_events(user["account_id"], limit)}


# ------------------------------------------------------------ rules routes
# Contract (the dashboard codes against this):
#   GET    /integrations/meta/rules        -> {items: [{id, pageId, matchKind: 'ad'|'form', matchValue,
#                                                        agentId, fromNumber, label, position}]}
#   POST   /integrations/meta/rules        {pageId, matchKind, matchValue, agentId, fromNumber?, label?}
#                                          -> {ok, item}; 400 {detail} on a bad page/agent/number; 409 on a duplicate
#   DELETE /integrations/meta/rules/{id}   -> {ok}; 404 when it is not this workspace's rule
#   GET    /integrations/meta/options      -> {forms: [{pageId, formId, formName, label}],
#                                              ads: [{pageId, adId, adName, campaignName}],
#                                              agents: [{id, name, status}], numbers: [{number, agentId}]}

@router.get("/integrations/meta/rules")
def meta_rules_list(request: Request):
    user = _admin(request)
    return {"items": list_rules(user["account_id"])}


@router.post("/integrations/meta/rules")
async def meta_rules_create(request: Request):
    user = _admin(request)
    body = await request.json()
    try:
        item = create_rule(user["account_id"], body if isinstance(body, dict) else {})
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except DuplicateRule as exc:
        raise HTTPException(409, "A rule for that ad or form already exists. Delete it first to change it.") from exc
    return {"ok": True, "item": item}


@router.delete("/integrations/meta/rules/{rule_id}")
def meta_rules_delete(rule_id: int, request: Request):
    user = _admin(request)
    if not delete_rule(user["account_id"], rule_id):
        raise HTTPException(404, "Rule not found in this workspace")
    return {"ok": True}


@router.get("/integrations/meta/options")
def meta_rule_options(request: Request):
    user = _admin(request)
    return options(user["account_id"])
