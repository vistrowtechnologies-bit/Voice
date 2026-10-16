"""Lead-delivery dispatch.

When a call qualifies a lead, fan it out to whichever destinations the tenant
has connected on the Integrations page — CRM/webhook, Slack, WhatsApp, Google
Sheets, ArthaLeads, Zoho CRM. Delivery is still just HTTPS POST once
configured. Slack stores the Incoming Webhook URL returned by its OAuth
install flow; generic webhooks, WhatsApp providers, and Google Apps Script
endpoints are pasted by the operator. ArthaLeads is the one exception — its
endpoint is fixed, so the operator only pastes a token. Zoho CRM is the other
exception — it needs an authenticated API call (token_api.py's OAuth flow
stores the access/refresh token pair), not a plain JSON POST to an operator-
pasted URL. Same stdlib-urllib, best-effort, never-raise philosophy as
email_sender — a broken integration must never break a call.
"""

import json
import re

import kb_crawl
import logging
import os
import time
import urllib.error
import urllib.parse
import urllib.request

import calls_db
import google_sheets

logger = logging.getLogger("vistrow-integrations")

_DELIVERY_KEYS = {"webhook", "slack", "whatsapp", "sheets", "arthaleads", "zoho_crm"}

_ARTHALEADS_URL = "https://api.arthaleads.com/webhook/lead"
# Base of ArthaLeads' API for the link handshake (single-token contract,
# 2026-10-16); env override for a staging ArthaLeads.
_ARTHALEADS_API_BASE = (os.environ.get("ARTHALEADS_API_BASE") or _ARTHALEADS_URL.rsplit("/webhook/", 1)[0]).rstrip("/")
_ARTHALEADS_REJECTED = "ArthaLeads did not accept this key. Copy it again from ArthaLeads → Integrations → Vistrow Voice."
_ARTHALEADS_PLAN = "ArthaLeads says this feature needs its Enterprise plan."


def _post_json(url: str, payload: dict, timeout: int = 8) -> tuple[bool, str]:
    # Tenants type these URLs: never let one reach an internal address
    # (cloud metadata, *.railway.internal, localhost), directly or by redirect.
    # The DNS check is done by the connection itself (kb_crawl.safe_opener),
    # which then connects to that same checked IP.
    try:
        kb_crawl._assert_public_url(url)
    except ValueError as e:
        return False, str(e)
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "User-Agent": "Vistrow-Voice/1.0"},
        method="POST",
    )
    try:
        with kb_crawl.safe_opener().open(req, timeout=timeout) as resp:
            return (200 <= resp.status < 300), f"HTTP {resp.status}"
    except urllib.error.HTTPError as e:
        # Keep the receiver's own error text: "HTTP 500" alone told us nothing
        # about why ArthaLeads rejected call 1090.
        try:
            body = e.read(300).decode("utf-8", "replace").strip()
        except Exception:
            body = ""
        return False, f"HTTP {e.code}: {body}" if body else f"HTTP {e.code}"
    except (urllib.error.URLError, TimeoutError, ValueError, RuntimeError) as e:
        return False, str(e)


def _lead_summary_line(lead: dict) -> str:
    bits = [lead.get("name") or "Unknown caller"]
    if lead.get("phone"):
        bits.append(lead["phone"])
    if lead.get("company"):
        bits.append(lead["company"])
    if lead.get("use_case"):
        bits.append(lead["use_case"])
    return " · ".join(str(b) for b in bits if b)


def _slack_value(value: object, fallback: str = "-") -> str:
    text = str(value or "").strip()
    return text if text else fallback


def _human_channel(lead: dict) -> str:
    raw = (
        lead.get("source")
        or lead.get("channel")
        or lead.get("call_type")
        or lead.get("direction")
        or ""
    )
    text = str(raw).strip().replace("_", " ").replace("-", " ")
    if not text:
        return "Call"
    lowered = text.lower()
    if "widget" in lowered:
        return "Website Widget"
    if "outbound" in lowered:
        return "Outbound Call"
    if "inbound" in lowered or "phone" in lowered:
        return "Inbound Call"
    if "test" in lowered:
        return "Dashboard Test"
    return text.title()


def _transcript_preview(transcript: object, max_turns: int = 4) -> str:
    if not isinstance(transcript, list):
        return ""
    lines = []
    for turn in transcript:
        if not isinstance(turn, dict):
            continue
        text = str(turn.get("text") or turn.get("content") or "").strip()
        if not text:
            continue
        speaker_raw = str(turn.get("speaker") or turn.get("role") or "").lower()
        speaker = "Caller" if speaker_raw in {"visitor", "caller", "user", "human"} else "Agent"
        lines.append(f"{speaker}: {text}")
        if len(lines) >= max_turns:
            break
    return "\n".join(lines)


def _slack_lead_payload(url: str, lead: dict) -> dict:
    channel = _human_channel(lead)
    outcome = _slack_value(lead.get("outcome") or lead.get("status"), "qualified")
    summary = _slack_value(lead.get("summary") or _lead_summary_line(lead), "")
    language = _slack_value(lead.get("language") or lead.get("reply_language"))
    agent = _slack_value(lead.get("agent_name") or lead.get("agent"))
    duration = lead.get("duration_seconds") or lead.get("durationSeconds")
    duration_text = f"{int(float(duration))}s" if duration not in (None, "") else "-"
    transcript = _transcript_preview(lead.get("transcript"))

    fields = [
        {"type": "mrkdwn", "text": f"*Source:*\n{channel}"},
        {"type": "mrkdwn", "text": f"*Outcome:*\n{outcome.replace('_', ' ').title()}"},
        {"type": "mrkdwn", "text": f"*Phone:*\n{_slack_value(lead.get('phone'))}"},
        {"type": "mrkdwn", "text": f"*Language:*\n{language}"},
        {"type": "mrkdwn", "text": f"*Agent:*\n{agent}"},
        {"type": "mrkdwn", "text": f"*Duration:*\n{duration_text}"},
    ]
    if lead.get("email"):
        fields.append({"type": "mrkdwn", "text": f"*Email:*\n{lead['email']}"})
    if lead.get("company"):
        fields.append({"type": "mrkdwn", "text": f"*Company:*\n{lead['company']}"})
    if lead.get("use_case"):
        fields.append({"type": "mrkdwn", "text": f"*Use case:*\n{lead['use_case']}"})

    blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": f"New qualified lead · {channel}",
                "emoji": True,
            },
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*{_slack_value(lead.get('name'), 'Unknown caller')}*"
                + (f"\n{summary}" if summary else ""),
            },
        },
        {"type": "section", "fields": fields[:10]},
    ]
    if transcript:
        blocks.extend(
            [
                {"type": "divider"},
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"*Transcript preview:*\n```{transcript[:900]}```",
                    },
                },
            ]
        )

    return {
        "_url": url,
        "text": f"New qualified lead from {channel}: {_lead_summary_line(lead)}",
        "blocks": blocks,
    }


def _body_for(key: str, config: dict, lead: dict) -> dict | None:
    """Shape the outgoing payload for a given provider. Returns None if the
    integration is missing what it needs to send (treated as 'skip', not
    'fail')."""
    if key == "arthaleads":
        token = (config.get("token") or "").strip()
        if not token:
            return None
        return {
            "_url": _ARTHALEADS_URL,
            "token": token,
            "name": lead.get("name") or "Unknown caller",
            "phone": lead.get("phone", ""),
            "email": lead.get("email", ""),
            "message": lead.get("summary") or _lead_summary_line(lead),
            "transcript": lead.get("transcript") or [],
            "sentiment": lead.get("sentiment") or "neutral",
            "duration_seconds": lead.get("duration_seconds"),
            "channel": lead.get("channel") or "",
            "language": lead.get("language") or "",
            "agent_name": lead.get("agent_name") or "",
            "agent_id": lead.get("agent_id") or "",
            "page_path": lead.get("page_path") or "",
            "call_id": lead.get("call_id"),
            "recording_url": lead.get("recording_url") or "",
            "recording_mime_type": lead.get("recording_mime_type") or "audio/wav",
            "extracted_data": lead.get("extracted_data") or {},
        }
    url = (config.get("url") or "").strip()
    if not url:
        return None
    if key == "slack":
        return _slack_lead_payload(url, lead)
    if key == "whatsapp":
        # Generic provider webhook: {to, message}. The operator maps this to
        # their WhatsApp Business/Gupshup/Twilio send endpoint.
        return {
            "_url": url,
            "to": lead.get("phone", ""),
            "message": config.get("template")
            or f"Hi {lead.get('name', 'there')}, thanks for your call with us. We'll follow up shortly.",
        }
    # webhook + sheets both take the full lead JSON; the receiver (CRM,
    # Apps Script, Zapier) decides what to do with it.
    return {"_url": url, **lead}


# Zoho is regional; only its real hosts may receive the platform's client
# secret or a tenant's tokens. A stored value comes from the OAuth callback,
# but is checked here too so an edited config can never redirect them
# (security audit 2026-10-12).
_ZOHO_REGIONS = r"(com|in|eu|com\.au|jp|com\.cn|sa|ca|uk)"
_ZOHO_ACCOUNTS_RE = re.compile(rf"^https://accounts\.zoho\.{_ZOHO_REGIONS}$")
_ZOHO_API_RE = re.compile(rf"^https://(www\.)?zohoapis\.{_ZOHO_REGIONS}$")


def _zoho_host(value, pattern, default: str) -> str:
    value = (value or "").strip().rstrip("/")
    return value if pattern.match(value) else default


def _zoho_refresh_access_token(config: dict) -> tuple[str, dict] | None:
    """Exchanges the stored refresh_token for a fresh access_token. Returns
    (access_token, updated_config) on success, or None on failure — callers
    just fall back to the existing (possibly stale) access_token and let the
    API call itself fail, rather than treating a refresh hiccup as fatal."""
    client_id = os.environ.get("ZOHO_OAUTH_CLIENT_ID")
    client_secret = os.environ.get("ZOHO_OAUTH_CLIENT_SECRET")
    refresh_token = config.get("refresh_token")
    accounts_base = _zoho_host(config.get("accounts_base"), _ZOHO_ACCOUNTS_RE, "https://accounts.zoho.com")
    if not client_id or not client_secret or not refresh_token:
        return None
    body = urllib.parse.urlencode(
        {
            "refresh_token": refresh_token,
            "client_id": client_id,
            "client_secret": client_secret,
            "grant_type": "refresh_token",
        }
    ).encode()
    try:
        req = urllib.request.Request(f"{accounts_base}/oauth/v2/token", data=body, method="POST")
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
    except Exception:
        logger.exception("zoho_crm: token refresh failed")
        return None
    access_token = data.get("access_token")
    if not access_token:
        logger.error("zoho_crm: token refresh returned no access_token: %s", data.get("error"))
        return None
    updated = {**config, "access_token": access_token, "expires_at": time.time() + float(data.get("expires_in") or 3600)}
    return access_token, updated


def _zoho_lead_body(lead: dict) -> dict:
    # Mirrors agent/tools.py's _zoho_lead_body: empty fields are left out and
    # the record is upserted on whichever of Phone/Email is present, so a
    # repeat caller updates their lead instead of creating another.
    name = str(lead.get("name") or "").strip() or "Website visitor"
    record = {
        "Last_Name": name,
        "Company": str(lead.get("company") or "").strip() or name,
        "Phone": str(lead.get("phone") or "").strip(),
        "Email": str(lead.get("email") or "").strip(),
        "Description": lead.get("summary") or _lead_summary_line(lead),
        "Lead_Source": _human_channel(lead),
    }
    record = {k: v for k, v in record.items() if v}
    return {"data": [record], "duplicate_check_fields": [f for f in ("Phone", "Email") if record.get(f)]}


def _deliver_zoho_crm(account_id: int, config: dict, lead: dict) -> tuple[bool, str]:
    access_token = config.get("access_token")
    api_domain = _zoho_host(config.get("api_domain"), _ZOHO_API_RE, "https://www.zohoapis.com")
    if not access_token or not config.get("refresh_token"):
        return False, "not configured"

    def _post(token: str) -> tuple[bool, str, int | None]:
        req = urllib.request.Request(
            f"{api_domain}/crm/v2/Leads/upsert",
            data=json.dumps(_zoho_lead_body(lead)).encode(),
            headers={"Authorization": f"Zoho-oauthtoken {token}", "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                return True, f"HTTP {resp.status}", resp.status
        except urllib.error.HTTPError as e:
            return False, f"HTTP {e.code}", e.code
        except (urllib.error.URLError, TimeoutError, ValueError) as e:
            return False, str(e), None

    # Access tokens live ~1hr; refresh proactively when we're at or past the
    # stored expiry so a normal delivery doesn't eat the extra round-trip.
    if time.time() >= float(config.get("expires_at") or 0) - 60:
        refreshed = _zoho_refresh_access_token(config)
        if refreshed:
            access_token, config = refreshed
            calls_db.update_integration("zoho_crm", "connected", config, account_id)

    ok, detail, status = _post(access_token)
    if not ok and status == 401:
        # Expired sooner than our own bookkeeping expected (clock drift, or
        # revoked/reissued elsewhere) — one forced refresh-and-retry.
        refreshed = _zoho_refresh_access_token(config)
        if refreshed:
            access_token, config = refreshed
            calls_db.update_integration("zoho_crm", "connected", config, account_id)
            ok, detail, status = _post(access_token)
    return ok, detail


def _deliver_one(key: str, config: dict, lead: dict, account_id: int | None = None) -> tuple[bool, str]:
    if account_id is None or not calls_db.account_entitlements(account_id)["features"]["crm"]:
        return False, "CRM delivery requires the Growth or Scale plan"
    if key == "zoho_crm":
        return _deliver_zoho_crm(account_id, config, lead)
    if key == "sheets" and config.get("mode") == "oauth":
        # "Sign in with Google" sheets: an authenticated Sheets API append,
        # not a POST to an Apps Script URL (configs without mode=oauth still
        # take the URL path below, unchanged).
        return google_sheets.append_lead(
            config,
            lead,
            os.environ.get("GOOGLE_SHEETS_OAUTH_CLIENT_ID"),
            os.environ.get("GOOGLE_SHEETS_OAUTH_CLIENT_SECRET"),
            lambda updated: calls_db.update_integration("sheets", "connected", updated, account_id),
        )
    body = _body_for(key, config, lead)
    if body is None:
        return False, "not configured"
    url = body.pop("_url")
    return _post_json(url, body)


def deliver_lead(account_id: int, lead: dict) -> dict:
    """Deliver `lead` to every connected delivery integration for the tenant.
    Best-effort: returns a per-integration result map, never raises. Stamps
    last_sync on each success so the UI can show 'last delivered'."""
    results: dict[str, str] = {}
    for integ in calls_db.list_integrations(account_id):
        key = integ["key"]
        if key not in _DELIVERY_KEYS or integ.get("status") != "connected":
            continue
        try:
            ok, detail = _deliver_one(key, integ.get("config") or {}, lead, account_id)
        except Exception:
            logger.exception("integration %s delivery crashed", key)
            ok, detail = False, "error"
        results[key] = "ok" if ok else detail
        if ok:
            try:
                calls_db.touch_integration_sync(account_id, key)
            except Exception:
                logger.exception("failed to stamp last_sync for %s", key)
    if results:
        logger.info("delivered lead for account %s: %s", account_id, results)
    return results


# Lead keys behind each owner-selectable field. Same as agent/tools.py
# _INTEGRATION_FIELDS, so a test send drops exactly what a live call drops.
_INTEGRATION_FIELDS = {
    "name": ("name",),
    "phone": ("phone",),
    "email": ("email",),
    "company": ("company",),
    "channel": ("channel",),
    "agent": ("agent_name", "agent_id"),
    "language": ("language",),
    "duration": ("duration_seconds",),
    "details": ("extracted_data", "summary", "use_case", "message"),
    "transcript": ("transcript",),
    "page": ("page_path",),
    "recording": ("recording_url", "recording_mime_type"),
    "call_id": ("call_id",),
}


def apply_field_choice(key: str, config: dict, lead: dict) -> dict:
    chosen = config.get("fields")
    if key not in calls_db.FIELD_CONFIGURABLE_KEYS or not isinstance(chosen, list) or not chosen:
        return lead
    out = dict(lead)
    for field, lead_keys in _INTEGRATION_FIELDS.items():
        if field not in chosen:
            for lead_key in lead_keys:
                out.pop(lead_key, None)
    if "company" not in chosen and isinstance(out.get("extracted_data"), dict):
        out["extracted_data"] = {k: v for k, v in out["extracted_data"].items() if k != "company"}
    return out


def test_integration(account_id: int, key: str) -> tuple[bool, str]:
    """Send a sample lead to one integration so the operator can confirm the
    wiring from the dashboard before relying on it."""
    integ = next((i for i in calls_db.list_integrations(account_id) if i["key"] == key), None)
    if integ is None:
        return False, "Unknown integration"
    if key not in _DELIVERY_KEYS:
        return False, "This integration isn't a lead-delivery target"
    sample = {
        "event": "test",
        "name": "Test Lead",
        "phone": "+919999999999",
        "email": "test@example.com",
        "company": "Acme Pvt Ltd",
        "use_case": "Sample delivery from Vistrow Voice",
        "summary": "This is a test payload to confirm your integration is wired correctly.",
        "outcome": "qualified",
        "transcript": [
            {"speaker": "Agent", "text": "Hi, thanks for calling! How can I help you today?"},
            {"speaker": "Caller", "text": "I'm looking for a 2BHK apartment, this is just a test call."},
            {"speaker": "Agent", "text": "Great, this is a sample transcript to confirm the integration works."},
        ],
        "sentiment": "positive",
        "duration_seconds": 45,
        "channel": "Website Widget",
        "language": "en",
        "agent_name": "Test Agent",
        "agent_id": "1000000001",
    }
    if key == "sheets" and (integ.get("config") or {}).get("mode") == "oauth":
        # A real row lands in the owner's sheet, so make it obviously deletable.
        sample = {**sample, "name": google_sheets.TEST_ROW_NAME, "channel": "Dashboard test"}
    sample = apply_field_choice(key, integ.get("config") or {}, sample)
    ok, detail = _deliver_one(key, integ.get("config") or {}, sample, account_id)
    try:
        if ok:
            calls_db.touch_integration_sync(account_id, key)
        else:
            calls_db.mark_integration_error(account_id, key, detail)
    except Exception:
        pass
    calls_db.record_integration_delivery(
        account_id, key, "test", "sent" if ok else "failed", "" if ok else detail, sample.get("name") or "",
    )
    return ok, detail


def _call_transcript_message(transcript: list[dict]) -> str:
    """Renders a get_call()-shaped transcript ({speaker, text} turns) as
    readable "Caller: ... / Agent: ..." lines — the ArthaLeads-side twin of
    agent/tools.py's _transcript_message, which only ever sees the raw
    {role, text} shape from a live session."""
    lines = []
    for turn in transcript:
        text = (turn.get("text") or "").strip()
        if not text:
            continue
        speaker = "Caller" if turn.get("speaker") == "visitor" else "Agent"
        lines.append(f"{speaker}: {text}")
    return "\n".join(lines)


def _saved_call_outcome(call: dict) -> dict:
    """crm_outcome (agent/tools.py) from what a saved call row still knows:
    the booked site visit and whether the caller ever spoke. Callback and
    opt-out live only in the live session, so a manual re-send can't carry
    them."""
    visit = call.get("siteVisit") or {}
    caller_spoke = any(
        t.get("speaker") == "visitor" and (t.get("text") or "").strip() for t in (call.get("transcript") or [])
    )
    if visit.get("date"):
        out = {"booking": "Site Visit Booked", "status": "Site Visit"}
        try:
            from zoneinfo import ZoneInfo
            import datetime as _dt

            out["site_visit_at"] = _dt.datetime.strptime(
                f"{visit['date']} {(visit.get('time') or '10:00')[:5]}", "%Y-%m-%d %H:%M"
            ).replace(tzinfo=ZoneInfo("Asia/Kolkata")).isoformat()
        except (ValueError, KeyError):
            pass
        return out
    if not caller_spoke:
        return {"booking": "Not Reachable"} if call.get("direction") == "outbound" else {}
    return {"status": "Contacted"}


def push_call_to_arthaleads(account_id: int, call_id: int) -> tuple[bool, str]:
    """Manually (re)send one specific call's lead to ArthaLeads — for a call
    the automatic delivery skipped (never marked qualified during the call)
    or that failed and the operator wants to retry after fixing the token.
    Stamps the call's own arthaleads_status either way, so the dashboard can
    show a definitive per-lead outcome instead of just the integration's
    most-recent-attempt status."""
    call = calls_db.get_call(call_id, account_id)
    if call is None:
        return False, "Call not found"
    token, why = _arthaleads_token(account_id)
    if not token:
        return False, why
    if not (call.get("name") and call.get("phone")):
        return False, "This call has no name or phone number to send"
    body = _arthaleads_call_body(account_id, call_id, call, token)
    ok, detail = _post_json(_ARTHALEADS_URL, body)
    try:
        if ok:
            calls_db.touch_integration_sync(account_id, "arthaleads")
            calls_db.set_call_arthaleads_status(call_id, account_id, "sent")
        else:
            calls_db.mark_integration_error(account_id, "arthaleads", detail)
            calls_db.set_call_arthaleads_status(call_id, account_id, "failed", detail)
    except Exception:
        pass
    return ok, detail


def _arthaleads_token(account_id: int) -> tuple[str, str]:
    """(token, '') when ArthaLeads is connected with a token, else ('', why)."""
    integ = next((i for i in calls_db.list_integrations(account_id) if i["key"] == "arthaleads"), None)
    if integ is None or integ.get("status") != "connected":
        return "", "ArthaLeads isn't connected"
    token = (integ.get("config") or {}).get("token", "").strip()
    if not token:
        return "", "No ArthaLeads token saved"
    return token, ""


def _arthaleads_api_post(path: str, payload: dict, timeout: int = 8) -> tuple[int, str]:
    """(HTTP status, body text) of a POST to ArthaLeads' API; status 0 and the
    error text when no response came back. Never raises."""
    req = urllib.request.Request(
        f"{_ARTHALEADS_API_BASE}{path}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "User-Agent": "Vistrow-Voice/1.0"},
        method="POST",
    )
    try:
        with kb_crawl.safe_opener().open(req, timeout=timeout) as resp:
            return resp.status, resp.read(2000).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        try:
            body = e.read(2000).decode("utf-8", "replace")
        except Exception:
            body = ""
        return e.code, body
    except (urllib.error.URLError, TimeoutError, ValueError, RuntimeError, OSError) as e:
        return 0, str(e)


def link_arthaleads(account_id: int, token: str) -> tuple[dict, str]:
    """The single-token handshake: tells ArthaLeads which Vistrow account this
    connection key now belongs to, so its auto-call setup fills itself in.
    Returns (link, detail) where link is the server-managed config.link —
    status "linked" (ArthaLeads accepted), "rejected" (401/403: wrong key or
    plan; do not save the key), or "pending" (ArthaLeads unreachable or
    answered oddly; the key is valid as far as we know, retry from Test)."""
    checked_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    status, text = _arthaleads_api_post("/webhook/vistrow/link", {
        "token": token,
        "account_id": str(account_id),
        "base_url": calls_db.public_base_url() or "https://api.vistrowvoice.com",
        "account_name": calls_db.account_name(account_id),
    })
    if status in (401, 403):
        detail = _ARTHALEADS_PLAN if status == 403 else _ARTHALEADS_REJECTED
        return {"status": "rejected", "error": detail, "checked_at": checked_at}, detail
    body = None
    if status == 200:
        try:
            body = json.loads(text)
        except ValueError:
            body = None
    if isinstance(body, dict) and body.get("success") is True:
        org_name = str(body.get("org_name") or "").strip()
        link = {"status": "linked", "org_name": org_name, "linked_at": str(body.get("linked_at") or checked_at),
                "checked_at": checked_at}
        return link, f"Linked with ArthaLeads ({org_name or 'your organisation'}). Vistrow account {account_id}."
    error = (f"HTTP {status}: {text[:120]}" if status else text)[:160].strip() or "no response"
    logger.warning("arthaleads link pending for account %s: %s", account_id, error)
    return ({"status": "pending", "error": error, "checked_at": checked_at},
            "Saved, but ArthaLeads could not be reached to finish linking. Click Send test to retry.")


def unlink_arthaleads(account_id: int, token: str) -> bool:
    """Best-effort: tells ArthaLeads this key no longer drives auto-calls."""
    status, text = _arthaleads_api_post("/webhook/vistrow/unlink", {"token": token})
    if status != 200:
        logger.warning("arthaleads unlink failed for account %s: %s %s", account_id, status, text[:120])
    return status == 200


def relink_arthaleads(account_id: int) -> tuple[bool, str]:
    """Test button: re-run the handshake with the stored key and refresh
    config.link. True only when ArthaLeads confirmed the link."""
    integ = next((i for i in calls_db.list_integrations(account_id, strict=True) if i["key"] == "arthaleads"), None)
    config = (integ or {}).get("config") or {}
    token = (config.get("token") or "").strip()
    if (integ or {}).get("status") != "connected" or not token:
        return False, "ArthaLeads isn't connected"
    link, detail = link_arthaleads(account_id, token)
    calls_db.update_integration("arthaleads", "connected", {**config, "link": link}, account_id)
    return link["status"] == "linked", detail


def _arthaleads_call_body(account_id: int, call_id: int, call: dict, token: str) -> dict:
    """The /webhook/lead body for one saved call - the same shape the agent
    sends at call end (agent/tools.py _integration_body)."""
    transcript = call.get("transcript") or []
    share_token = calls_db.ensure_call_recording_share_token(call_id, account_id)
    public_base = calls_db.public_base_url() or "https://api.vistrowvoice.com"
    recording_url = (
        f"{public_base}/public/calls/{call_id}/recording?token={share_token}"
        if share_token and call.get("hasRecording") else ""
    )
    return {
        "token": token,
        "name": call.get("name") or "Unknown caller",
        "phone": call.get("phone", ""),
        "email": call.get("email", ""),
        "message": _call_transcript_message(transcript),
        "transcript": [
            {"speaker": "Caller" if t.get("speaker") == "visitor" else "Agent", "text": t.get("text", "")}
            for t in transcript
            if (t.get("text") or "").strip()
        ],
        "sentiment": call.get("sentiment") or "neutral",
        "duration_seconds": call.get("durationSeconds"),
        "channel": call.get("channel") or "",
        "language": call.get("replyLanguage") or "",
        "agent_name": call.get("agent") or "",
        "agent_id": calls_db.agent_public_id(call.get("agentId")),
        "page_path": call.get("pagePath") or "",
        "call_id": call_id,
        "recording_url": recording_url,
        "recording_mime_type": "audio/wav",
        "extracted_data": call.get("extractedData") or {},
        "arthaleads_lead_id": calls_db.arthaleads_lead_id_for_call(call_id, account_id),
        "direction": call.get("direction") or "",
        "crm_outcome": _saved_call_outcome(call),
    }


def report_contact_not_reachable(account_id: int, contact: dict) -> tuple[bool, str]:
    """Tell ArthaLeads a lead's auto-call attempts are spent (the dialer calls
    this for calls_db.exhausted_arthaleads_contacts). Sent on the lead's last
    saved call when a dial got far enough to leave one, else as a minimal
    entry for the lead itself - a busy/switched-off dial saves no call row,
    and the CRM still needs to hear that nobody was reached."""
    token, why = _arthaleads_token(account_id)
    if not token:
        return False, why
    attempts = int(contact.get("attempts") or 0)
    outcome = {"booking": "Not Reachable", "attempts": attempts}
    call_id = contact.get("last_call_id")
    call = calls_db.get_call(int(call_id), account_id) if call_id else None
    if call and call.get("phone"):
        body = {**_arthaleads_call_body(account_id, int(call_id), call, token), "crm_outcome": outcome}
    else:
        fields = contact.get("custom_fields") or {}
        agent = calls_db.get_agent_by_id_unscoped(int(contact["agent_id"])) if contact.get("agent_id") else None
        body = {
            "token": token,
            "name": contact.get("name") or "Unknown caller",
            "phone": contact.get("phone") or "",
            "email": str(fields.get("email") or ""),
            "message": f"Not reachable after {attempts} call attempt(s) ({contact.get('outcome') or 'no answer'}).",
            "transcript": [],
            "channel": "phone",
            "agent_name": (agent or {}).get("name") or "",
            "agent_id": calls_db.agent_public_id(contact.get("agent_id")),
            # ArthaLeads keys a call on a numeric call_id and treats a null
            # one as a plain lead (new row, 2-minute dedupe, no attempts).
            # No call row exists for an undelivered dial, so the report gets
            # a synthetic id: the negated contact id, unique per contact and
            # never equal to a real (positive) call id.
            "call_id": -int(contact["id"]),
            "arthaleads_lead_id": str(fields.get("arthaleads_lead_id") or ""),
            "direction": "outbound",
            "crm_outcome": outcome,
        }
    ok, detail = _post_json(_ARTHALEADS_URL, body)
    try:
        if ok:
            calls_db.touch_integration_sync(account_id, "arthaleads")
        else:
            calls_db.mark_integration_error(account_id, "arthaleads", detail)
    except Exception:
        pass
    return ok, detail
