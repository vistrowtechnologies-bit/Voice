"""Lead-delivery dispatch.

When a call qualifies a lead, fan it out to whichever destinations the tenant
has connected on the Integrations page — CRM/webhook, Slack, WhatsApp, Google
Sheets. Each is just an HTTPS POST with a per-provider body shape, so there's
no OAuth to maintain: the operator pastes a webhook URL (Slack Incoming Webhook,
a Google Apps Script web-app URL, a Zapier/Make catch hook, their CRM endpoint)
and we deliver to it. Same stdlib-urllib, best-effort, never-raise philosophy
as email_sender — a broken integration must never break a call.

Cal.com is intentionally not a delivery target: it's a *booking* action the
agent takes mid-call (see agent tools), not a place we push finished leads.
"""

import json
import logging
import urllib.error
import urllib.request

import calls_db

logger = logging.getLogger("vistrow-integrations")

# Only these keys receive lead deliveries; calcom is handled agent-side.
_DELIVERY_KEYS = {"webhook", "slack", "whatsapp", "sheets"}


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


def _body_for(key: str, config: dict, lead: dict) -> dict | None:
    """Shape the outgoing payload for a given provider. Returns None if the
    integration is missing the URL it needs (treated as 'skip', not 'fail')."""
    url = (config.get("url") or "").strip()
    if not url:
        return None
    if key == "slack":
        return {
            "_url": url,
            "text": f":telephone_receiver: *New qualified lead* — {_lead_summary_line(lead)}"
            + (f"\n> {lead['summary']}" if lead.get("summary") else ""),
        }
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
    }
    ok, detail = _deliver_one(key, integ.get("config") or {}, sample)
    if ok:
        try:
            calls_db.touch_integration_sync(account_id, key)
        except Exception:
            pass
    return ok, detail
