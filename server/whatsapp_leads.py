"""Click-to-WhatsApp (CTWA) leads from the WhatsApp Cloud API.

An ad whose button opens a WhatsApp chat has no form: the lead is the first
message, which carries the person's WhatsApp number (`from`) and, because it
came from an ad, a `referral` block (source_id = the ad, headline, body,
source_url, ctwa_clid). Meta posts it to the same callback as Lead Ads
(/webhooks/meta, object "whatsapp_business_account", field "messages");
meta_leads.handle_webhook_post checks the signature and hands it here.

A message from an ad becomes a contact and a queued call through the same
path as a Lead Ads lead: meta_leads.resolve_route (ad rule > Page default,
the Page found from the ad when its ads are known) and
calls_db.ingest_inbound_lead with source "whatsapp_ctwa". An ordinary chat
(no referral) is recorded and never called. "STOP"-type replies go on the
do-not-call list. Nothing here calls Meta, so a message is handled inside the
webhook request.

Which workspace a WhatsApp number belongs to lives in wa_numbers. Until the
Embedded Signup connect flow exists, only the platform owner can link a
number (it decides who receives that number's leads)."""
from __future__ import annotations

import datetime
import json
import logging

from fastapi import APIRouter, HTTPException, Request

import calls_db
import campaign_dialer
import meta_leads

logger = logging.getLogger("whatsapp-leads")

SOURCE = "whatsapp_ctwa"
STALE_AFTER_HOURS = meta_leads.STALE_AFTER_HOURS
OPT_OUT_WORDS = {"stop", "unsubscribe", "stop all", "cancel", "opt out", "optout", "बंद", "बंद करो"}

_SCHEMA = f"""
CREATE TABLE IF NOT EXISTS wa_numbers (
    phone_number_id TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL,
    waba_id TEXT DEFAULT '',
    display_phone TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    linked_by_user_id INTEGER,
    linked_at TEXT DEFAULT {calls_db._NOW}
);
CREATE INDEX IF NOT EXISTS idx_wa_numbers_account ON wa_numbers (account_id);

CREATE TABLE IF NOT EXISTS wa_inbound_events (
    phone_number_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    account_id INTEGER,
    from_phone TEXT DEFAULT '',
    profile_name TEXT DEFAULT '',
    message_type TEXT DEFAULT '',
    text TEXT DEFAULT '',
    ad_id TEXT DEFAULT '',
    ad_headline TEXT DEFAULT '',
    ctwa_clid TEXT DEFAULT '',
    referral_json TEXT DEFAULT '',
    sent_at TEXT,
    status TEXT DEFAULT 'received',
    reason TEXT DEFAULT '',
    route_agent_id INTEGER,
    campaign_contact_id INTEGER,
    received_at TEXT DEFAULT {calls_db._NOW},
    processed_at TEXT,
    PRIMARY KEY (phone_number_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_wa_inbound_account ON wa_inbound_events (account_id, received_at);
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


def link_number(account_id: int, phone_number_id: str, display_phone: str = "", waba_id: str = "",
                user_id: int | None = None) -> None:
    """Point a WhatsApp number's inbound messages at a workspace. Re-linking
    moves it (one owner per number, like a Facebook Page)."""
    phone_number_id = str(phone_number_id or "").strip()
    if not phone_number_id.isdigit():
        raise ValueError("phoneNumberId must be Meta's numeric phone number ID")
    conn = calls_db._connect()
    try:
        with conn:
            conn.execute(
                "INSERT INTO wa_numbers (phone_number_id, account_id, waba_id, display_phone, status, linked_by_user_id) "
                "VALUES (?, ?, ?, ?, 'active', ?) ON CONFLICT (phone_number_id) DO UPDATE SET "
                "account_id = excluded.account_id, waba_id = excluded.waba_id, display_phone = excluded.display_phone, "
                f"status = 'active', linked_by_user_id = excluded.linked_by_user_id, linked_at = {calls_db._NOW}",
                (phone_number_id, int(account_id), meta_leads._text(waba_id, 40),
                 meta_leads._text(display_phone, 30), user_id),
            )
    finally:
        conn.close()


def _owner(conn, phone_number_id: str) -> int | None:
    row = conn.execute("SELECT account_id FROM wa_numbers WHERE phone_number_id = ? AND status = 'active'",
                       (phone_number_id,)).fetchone()
    return int(row["account_id"]) if row else None


def _sent_at(timestamp) -> datetime.datetime | None:
    try:
        return datetime.datetime.fromtimestamp(int(timestamp), tz=datetime.timezone.utc)
    except (TypeError, ValueError, OverflowError, OSError):
        return None


def record_webhook(payload: dict, now: datetime.datetime | None = None) -> dict:
    """Record every inbound message of a whatsapp_business_account webhook and
    handle each new one. Delivery/read statuses and other fields are ignored.
    Meta redelivers; (phone_number_id, message_id) makes that a no-op."""
    now = now or meta_leads._utc_now()
    received = ignored = duplicates = 0
    fresh: list[tuple[str, str]] = []
    conn = calls_db._connect()
    try:
        with conn:
            for entry in payload.get("entry") or []:
                for change in entry.get("changes") or []:
                    value = change.get("value") or {}
                    if change.get("field") != "messages" or not value.get("messages"):
                        ignored += 1
                        continue
                    phone_number_id = str((value.get("metadata") or {}).get("phone_number_id") or "")
                    names = {str(c.get("wa_id") or ""): str((c.get("profile") or {}).get("name") or "")
                             for c in value.get("contacts") or []}
                    account_id = _owner(conn, phone_number_id) if phone_number_id else None
                    for message in value["messages"]:
                        message_id = str(message.get("id") or "")
                        sender = str(message.get("from") or "")
                        if not phone_number_id or not message_id or not sender:
                            ignored += 1
                            continue
                        referral = message.get("referral") or {}
                        sent = _sent_at(message.get("timestamp"))
                        status, reason = ("received", "") if account_id else ("skipped", "unknown_number")
                        inserted = conn.execute(
                            "INSERT INTO wa_inbound_events (phone_number_id, message_id, account_id, from_phone, "
                            "profile_name, message_type, text, ad_id, ad_headline, ctwa_clid, referral_json, sent_at, "
                            "status, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
                            "ON CONFLICT (phone_number_id, message_id) DO NOTHING RETURNING message_id",
                            (phone_number_id, meta_leads._text(message_id, 200), account_id,
                             meta_leads._text(sender, 20), meta_leads._text(names.get(sender, ""), 120),
                             meta_leads._text(message.get("type"), 20),
                             meta_leads._text((message.get("text") or {}).get("body"), 1000),
                             meta_leads._text(referral.get("source_id"), 100),
                             meta_leads._text(referral.get("headline"), 200),
                             meta_leads._text(referral.get("ctwa_clid"), 200),
                             json.dumps(referral)[:2000] if referral else "",
                             meta_leads._stamp(sent) if sent else None, status, reason),
                        ).fetchone()
                        if not inserted:
                            duplicates += 1
                            continue
                        received += 1
                        if account_id:
                            fresh.append((phone_number_id, message_id))
    finally:
        conn.close()
    outcomes = [process_message(pid, mid, now) for pid, mid in fresh]
    return {"received": received, "ignored": ignored, "duplicates": duplicates,
            "queued": outcomes.count("queued")}


def _finish(phone_number_id: str, message_id: str, status: str, reason: str = "",
            contact_id: int | None = None, agent_id: int | None = None) -> str:
    conn = calls_db._connect()
    try:
        with conn:
            conn.execute(
                f"UPDATE wa_inbound_events SET status = ?, reason = ?, campaign_contact_id = ?, route_agent_id = ?, "
                f"processed_at = {calls_db._NOW} WHERE phone_number_id = ? AND message_id = ?",
                (status, reason[:200], contact_id, agent_id, phone_number_id, message_id),
            )
    finally:
        conn.close()
    return status


def _page_for_ad(account_id: int, ad_id: str) -> str:
    """The Facebook Page an ad runs on, when the workspace's ads are known
    (meta_leads.sync_ads); "" otherwise, so only an ad rule can match."""
    if not ad_id:
        return ""
    conn = calls_db._connect()
    try:
        row = conn.execute("SELECT page_id FROM meta_ads WHERE account_id = ? AND ad_id = ? LIMIT 1",
                           (account_id, ad_id)).fetchone()
    finally:
        conn.close()
    return str(row["page_id"]) if row else ""


def _route_for_ad(account_id: int, page_id: str, ad_id: str) -> tuple[dict | None, str]:
    if page_id:
        return meta_leads.resolve_route(account_id, page_id, "", ad_id)
    # Page unknown: an ad rule still names the ad exactly, whatever its Page.
    conn = calls_db._connect()
    try:
        row = conn.execute("SELECT page_id FROM meta_lead_rules WHERE account_id = ? AND match_kind = 'ad' "
                           "AND match_value = ? LIMIT 1", (account_id, ad_id)).fetchone() if ad_id else None
    finally:
        conn.close()
    if row:
        return meta_leads.resolve_route(account_id, str(row["page_id"]), "", ad_id)
    return None, "no_rules"


def process_message(phone_number_id: str, message_id: str, now: datetime.datetime | None = None) -> str:
    now = now or meta_leads._utc_now()
    conn = calls_db._connect()
    try:
        event = conn.execute("SELECT * FROM wa_inbound_events WHERE phone_number_id = ? AND message_id = ?",
                             (phone_number_id, message_id)).fetchone()
    finally:
        conn.close()
    if not event or event["status"] != "received" or not event["account_id"]:
        return event["status"] if event else "missing"
    account_id = int(event["account_id"])
    phone = "+" + str(event["from_phone"]).lstrip("+")
    name = event["profile_name"] or ""
    text = (event["text"] or "").strip()

    if text.casefold().strip(" .!") in OPT_OUT_WORDS:
        calls_db.add_dnc(account_id, phone, reason="WhatsApp opt-out reply", source="whatsapp")
        return _finish(phone_number_id, message_id, "opted_out", "stop_reply")
    if not event["ad_id"] and not event["ctwa_clid"]:
        return _finish(phone_number_id, message_id, "skipped", "not_from_ad")

    sent = meta_leads._parse_meta_time((event["sent_at"] or "").replace(" ", "T") + "+00:00") if event["sent_at"] else None
    try:
        referral = json.loads(event["referral_json"] or "{}")
    except ValueError:
        referral = {}
    fields = {
        "channel": "whatsapp",
        "ad_id": event["ad_id"],
        "ad_headline": event["ad_headline"],
        "ad_body": meta_leads._text(referral.get("body"), 500),
        "ad_url": meta_leads._text(referral.get("source_url"), 500),
        "ctwa_clid": event["ctwa_clid"],
        "first_message": text[:500],
    }
    page_id = _page_for_ad(account_id, event["ad_id"])
    route, route_reason = _route_for_ad(account_id, page_id, event["ad_id"])
    agent_id = route["agentId"] if route else None
    contact_id = meta_leads._upsert_contact(account_id, name, phone, "", fields, tag="whatsapp-ctwa",
                                            source=SOURCE, fallback_name="WhatsApp lead")
    if sent and now - sent > datetime.timedelta(hours=STALE_AFTER_HOURS):
        calls_db._record_lead_event(account_id, SOURCE, message_id, name, phone)
        return _finish(phone_number_id, message_id, "stale", f"older_than_{STALE_AFTER_HOURS}h", contact_id, agent_id)
    if route is None and route_reason != "no_rules":
        calls_db._record_lead_event(account_id, SOURCE, message_id, name, phone)
        return _finish(phone_number_id, message_id, "skipped", route_reason, contact_id, agent_id)
    kwargs = {"route": {"agentId": route["agentId"], "fromNumber": route["fromNumber"], "label": route["label"]}} if route else {}
    result = calls_db.ingest_inbound_lead(account_id, name, phone, SOURCE, external_id=message_id,
                                          custom_fields=fields, **kwargs)
    if not result.get("ok") or not result.get("queued"):
        return _finish(phone_number_id, message_id, "skipped", str(result.get("reason") or "not_queued"), contact_id, agent_id)
    _finish(phone_number_id, message_id, "queued",
            ";".join(p for p in ("" if route else "no_route_generic_agent", "deduped" if result.get("deduped") else "") if p),
            result.get("contact_id"), agent_id)
    if result.get("delay_seconds"):
        campaign_dialer.notify_after(result["delay_seconds"])
    else:
        campaign_dialer.notify()
    return "queued"


def list_events(account_id: int, limit: int = 200) -> list[dict]:
    conn = calls_db._connect()
    try:
        rows = conn.execute(
            "SELECT phone_number_id, message_id, from_phone, profile_name, message_type, ad_id, ad_headline, status, "
            "reason, route_agent_id, campaign_contact_id, received_at, processed_at FROM wa_inbound_events "
            "WHERE account_id = ? ORDER BY received_at DESC LIMIT ?", (account_id, max(1, min(int(limit), 500))),
        ).fetchall()
    finally:
        conn.close()
    return [dict(r) for r in rows]


# ------------------------------------------------------------------ router
router = APIRouter()


def _platform_owner(request: Request) -> dict:
    user = meta_leads._admin(request)
    profile = calls_db.get_user_by_id(user["user_id"])
    if not profile or not profile.get("is_platform_owner"):
        raise HTTPException(403, "Only the platform owner can link a WhatsApp number for now")
    return user


@router.post("/integrations/whatsapp/numbers")
async def whatsapp_link_number(request: Request):
    """Platform owner only, until Embedded Signup proves who owns a number:
    {accountId, phoneNumberId, displayPhone?, wabaId?}."""
    user = _platform_owner(request)
    body = await request.json()
    try:
        link_number(int(body.get("accountId") or user["account_id"]), str(body.get("phoneNumberId") or ""),
                    str(body.get("displayPhone") or ""), str(body.get("wabaId") or ""), user["user_id"])
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True}


@router.get("/integrations/whatsapp/leads")
def whatsapp_leads_list(request: Request, limit: int = 200):
    user = meta_leads._admin(request)
    return {"items": list_events(user["account_id"], limit)}
