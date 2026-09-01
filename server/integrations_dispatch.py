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
import logging
import os
import time
import urllib.error
import urllib.parse
import urllib.request

import calls_db

logger = logging.getLogger("vistrow-integrations")

_DELIVERY_KEYS = {"webhook", "slack", "whatsapp", "sheets", "arthaleads", "zoho_crm"}

_ARTHALEADS_URL = "https://api.arthaleads.com/webhook/lead"


def _post_json(url: str, payload: dict, timeout: int = 8) -> tuple[bool, str]:
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "User-Agent": "Vistrow-Voice/1.0"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return (200 <= resp.status < 300), f"HTTP {resp.status}"
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}"
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
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


def _zoho_refresh_access_token(config: dict) -> tuple[str, dict] | None:
    """Exchanges the stored refresh_token for a fresh access_token. Returns
    (access_token, updated_config) on success, or None on failure — callers
    just fall back to the existing (possibly stale) access_token and let the
    API call itself fail, rather than treating a refresh hiccup as fatal."""
    client_id = os.environ.get("ZOHO_OAUTH_CLIENT_ID")
    client_secret = os.environ.get("ZOHO_OAUTH_CLIENT_SECRET")
    refresh_token = config.get("refresh_token")
    accounts_base = config.get("accounts_base") or "https://accounts.zoho.com"
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
    # Zoho's Leads module requires Last_Name (and Company, on most default
    # layouts) — there's no single "name" field to map onto, so the full
    # caller name goes in Last_Name and doubles as Company when none was
    # captured, rather than failing the whole record over a missing field.
    name = str(lead.get("name") or "Unknown caller").strip()
    return {
        "data": [
            {
                "Last_Name": name,
                "Company": lead.get("company") or name,
                "Phone": lead.get("phone", ""),
                "Email": lead.get("email", ""),
                "Description": lead.get("summary") or _lead_summary_line(lead),
                "Lead_Source": _human_channel(lead),
            }
        ]
    }


def _deliver_zoho_crm(account_id: int, config: dict, lead: dict) -> tuple[bool, str]:
    access_token = config.get("access_token")
    api_domain = (config.get("api_domain") or "https://www.zohoapis.com").rstrip("/")
    if not access_token or not config.get("refresh_token"):
        return False, "not configured"

    def _post(token: str) -> tuple[bool, str, int | None]:
        req = urllib.request.Request(
            f"{api_domain}/crm/v2/Leads",
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
    if key == "zoho_crm":
        return _deliver_zoho_crm(account_id, config, lead)
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
    }
    ok, detail = _deliver_one(key, integ.get("config") or {}, sample, account_id)
    try:
        if ok:
            calls_db.touch_integration_sync(account_id, key)
        else:
            calls_db.mark_integration_error(account_id, key, detail)
    except Exception:
        pass
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
    integ = next((i for i in calls_db.list_integrations(account_id) if i["key"] == "arthaleads"), None)
    if integ is None or integ.get("status") != "connected":
        return False, "ArthaLeads isn't connected"
    token = (integ.get("config") or {}).get("token", "").strip()
    if not token:
        return False, "No ArthaLeads token saved"
    if not (call.get("name") and call.get("phone")):
        return False, "This call has no name or phone number to send"
    transcript = call.get("transcript") or []
    body = {
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
        "extracted_data": call.get("extractedData") or {},
    }
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
