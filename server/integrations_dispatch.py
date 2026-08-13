"""Lead-delivery dispatch.

When a call qualifies a lead, fan it out to whichever destinations the tenant
has connected on the Integrations page — CRM/webhook, Slack, WhatsApp, Google
Sheets, ArthaLeads. Delivery is still just HTTPS POST once configured. Slack
stores the Incoming Webhook URL returned by its OAuth install flow; generic
webhooks, WhatsApp providers, and Google Apps Script endpoints are pasted by
the operator. ArthaLeads is the one exception —
its endpoint is fixed, so the operator only pastes a token. Same
stdlib-urllib, best-effort, never-raise philosophy as email_sender — a broken
integration must never break a call.
"""

import json
import logging
import urllib.error
import urllib.request

import calls_db

logger = logging.getLogger("vistrow-integrations")

_DELIVERY_KEYS = {"webhook", "slack", "whatsapp", "sheets", "arthaleads"}

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


def _deliver_one(key: str, config: dict, lead: dict) -> tuple[bool, str]:
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
            ok, detail = _deliver_one(key, integ.get("config") or {}, lead)
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
    ok, detail = _deliver_one(key, integ.get("config") or {}, sample)
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
