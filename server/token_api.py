import json
import logging
import os
from pathlib import Path

import calls_db
import kb_extract
import livekit_sip
from dotenv import load_dotenv
from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from livekit import api
from livekit.api import CreateRoomRequest, ListParticipantsRequest, ListRoomsRequest
from pydantic import BaseModel

WIDGET_JS_PATH = Path(__file__).resolve().parent / "static" / "widget.js"
WORDPRESS_PLUGIN_ZIP_PATH = Path(__file__).resolve().parent / "static" / "arthale-voice-widget.zip"
AGENT_ORB_VIDEO_PATH = Path(__file__).resolve().parent / "static" / "agent-orb.mp4"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("telephony")

load_dotenv()

app = FastAPI()
calls_db.init_tables()

# Browser demo runs on a different origin during local dev; tighten this once
# the web-demo is deployed behind a known domain.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["*"],
)


class TokenRequest(BaseModel):
    identity: str
    room: str = "voice-agent-demo"
    agentId: int | None = None


@app.post("/token")
async def create_token(req: TokenRequest) -> dict:
    api_key = os.environ.get("LIVEKIT_API_KEY")
    api_secret = os.environ.get("LIVEKIT_API_SECRET")
    livekit_url = os.environ.get("LIVEKIT_URL")
    if not api_key or not api_secret or not livekit_url:
        raise HTTPException(500, "LiveKit credentials are not configured on the server")

    if req.agentId is not None:
        # Dashboard "test in browser" flow: pre-create the room carrying the
        # same {"agent_id"} metadata the SIP dispatch rules stamp on phone
        # calls, so agent/main.py's _agent_id_from_job loads this specific
        # agent's config instead of falling back to the first live one.
        async with api.LiveKitAPI() as lkapi:
            await lkapi.room.create_room(
                CreateRoomRequest(name=req.room, metadata=json.dumps({"agent_id": req.agentId}))
            )

    token = (
        api.AccessToken(api_key, api_secret)
        .with_identity(req.identity)
        .with_name(req.identity)
        .with_grants(api.VideoGrants(room_join=True, room=req.room))
        .to_jwt()
    )
    return {"token": token, "url": livekit_url}


@app.get("/active-calls")
async def list_active_calls() -> list[dict]:
    """List rooms currently live on the LiveKit server, one entry per visitor.

    Reflects real in-progress sessions (not mock data) by asking the LiveKit
    server directly, then pulling the agent's `lk.agent.state` attribute to
    report whether it's listening, thinking, or speaking.
    """
    lkapi = api.LiveKitAPI()
    try:
        rooms = await lkapi.room.list_rooms(ListRoomsRequest())
        calls = []
        for room in rooms.rooms:
            if room.num_participants < 2:
                continue  # only the agent has joined so far, no visitor yet
            participants = await lkapi.room.list_participants(
                ListParticipantsRequest(room=room.name)
            )
            agent_p = next(
                (p for p in participants.participants if "lk.agent.state" in p.attributes),
                None,
            )
            visitor_p = next(
                (p for p in participants.participants if p is not agent_p),
                None,
            )
            if agent_p is None or visitor_p is None:
                continue
            calls.append(
                {
                    "room": room.name,
                    "visitor_identity": visitor_p.identity,
                    "state": agent_p.attributes.get("lk.agent.state", "unknown"),
                    "joined_at_ms": visitor_p.joined_at_ms,
                }
            )
        return calls
    except Exception:
        # LiveKit server isn't reachable (e.g. infra/docker-compose.yml isn't
        # running yet) — degrade to "no live calls" instead of a 500.
        return []
    finally:
        await lkapi.aclose()


# ------------------------------------------------------ calls & leads


@app.get("/calls")
def list_calls(limit: int = 200, search: str = "", status: str = "", days: int = 0) -> list[dict]:
    """Real call history from agent/calls.db — one row per completed call."""
    return calls_db.list_calls(limit=limit, search=search, status=status, days=days)


@app.get("/calls/export.csv", response_class=PlainTextResponse)
def export_calls_csv() -> PlainTextResponse:
    return PlainTextResponse(
        calls_db.calls_csv(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=calls.csv"},
    )


@app.get("/calls/{call_id}")
def get_call(call_id: int) -> dict:
    call = calls_db.get_call(call_id)
    if call is None:
        raise HTTPException(404, "Call not found")
    return call


# Leads are the same rows viewed CRM-style; kept as aliases so both mental
# models (call log vs. lead list) work against one source of truth.
@app.get("/leads")
def list_leads(limit: int = 200) -> list[dict]:
    return calls_db.list_calls(limit=limit)


@app.get("/leads/{lead_id}")
def get_lead(lead_id: int) -> dict:
    return get_call(lead_id)


# ---------------------------------------------------------- dashboard


@app.get("/dashboard/summary")
def dashboard_summary() -> dict:
    return calls_db.summary()


@app.get("/dashboard/usage-trends")
def dashboard_usage_trends(days: int = 14) -> dict:
    return calls_db.usage_trends(days=days)


@app.get("/dashboard/analytics")
def dashboard_analytics() -> dict:
    return calls_db.analytics()


# -------------------------------------------------------------- agents


@app.get("/agents")
def list_agents() -> list[dict]:
    return calls_db.list_agents()


@app.post("/agents")
def create_agent(data: dict = Body(...)) -> dict:
    return calls_db.create_agent(data)


@app.patch("/agents/{agent_id}")
def update_agent(agent_id: int, data: dict = Body(...)) -> dict:
    agent = calls_db.update_agent(agent_id, data)
    if agent is None:
        raise HTTPException(404, "Agent not found")
    return agent


@app.delete("/agents/{agent_id}")
def delete_agent(agent_id: int) -> dict:
    calls_db.delete_agent(agent_id)
    return {"ok": True}


# ------------------------------------------------------------ contacts


@app.get("/contacts")
def list_contacts() -> list[dict]:
    return calls_db.list_contacts()


@app.post("/contacts")
def create_contact(data: dict = Body(...)) -> dict:
    calls_db.create_contact(data)
    return {"ok": True}


@app.delete("/contacts/{contact_id}")
def delete_contact(contact_id: int) -> dict:
    calls_db.delete_contact(contact_id)
    return {"ok": True}


@app.delete("/contacts")
def delete_all_contacts() -> dict:
    calls_db.delete_all_contacts()
    return {"ok": True}


@app.get("/contacts/export.csv", response_class=PlainTextResponse)
def export_contacts_csv() -> PlainTextResponse:
    return PlainTextResponse(
        calls_db.contacts_csv(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=contacts.csv"},
    )


@app.post("/contacts/import")
def import_contacts(data: dict = Body(...)) -> dict:
    count = calls_db.import_contacts_csv(data.get("csv", ""))
    return {"imported": count}


# ------------------------------------------------------ knowledge base


@app.get("/knowledge-bases")
def list_knowledge_bases() -> list[dict]:
    return calls_db.list_knowledge_bases()


@app.post("/knowledge-bases")
def create_knowledge_base(data: dict = Body(...)) -> dict:
    calls_db.create_knowledge_base(data.get("name", "Untitled"))
    return {"ok": True}


@app.delete("/knowledge-bases/{kb_id}")
def delete_knowledge_base(kb_id: int) -> dict:
    calls_db.delete_knowledge_base(kb_id)
    return {"ok": True}


@app.post("/knowledge-bases/{kb_id}/sources")
def add_knowledge_source(kb_id: int, data: dict = Body(...)) -> dict:
    calls_db.add_knowledge_source(
        kb_id, data.get("name", "Untitled"), data.get("content", ""), data.get("type", "text")
    )
    return {"ok": True}


@app.delete("/knowledge-sources/{source_id}")
def delete_knowledge_source(source_id: int) -> dict:
    calls_db.delete_knowledge_source(source_id)
    return {"ok": True}


@app.patch("/knowledge-bases/{kb_id}")
def update_knowledge_base(kb_id: int, data: dict = Body(...)) -> dict:
    if "strict" in data:
        calls_db.set_kb_strict(kb_id, bool(data["strict"]))
    return {"ok": True}


@app.post("/knowledge-bases/{kb_id}/qa")
def add_kb_qa(kb_id: int, data: dict = Body(...)) -> dict:
    question = (data.get("question") or "").strip()
    answer = (data.get("answer") or "").strip()
    if not question or not answer:
        raise HTTPException(400, "Both question and answer are required")
    qa_id = calls_db.add_kb_qa(kb_id, question, answer)
    return {"ok": True, "id": qa_id}


@app.post("/knowledge-bases/{kb_id}/qa/bulk")
def add_kb_qa_bulk(kb_id: int, data: dict = Body(...)) -> dict:
    """Accept step of auto-extract: saves the reviewed draft pairs in one go."""
    pairs = data.get("pairs") or []
    if not isinstance(pairs, list):
        raise HTTPException(400, "pairs must be a list")
    added = calls_db.add_kb_qa_bulk(kb_id, pairs)
    return {"ok": True, "added": added}


@app.patch("/kb-qa/{qa_id}")
def update_kb_qa(qa_id: int, data: dict = Body(...)) -> dict:
    question = (data.get("question") or "").strip()
    answer = (data.get("answer") or "").strip()
    if not question or not answer:
        raise HTTPException(400, "Both question and answer are required")
    calls_db.update_kb_qa(qa_id, question, answer)
    return {"ok": True}


@app.delete("/kb-qa/{qa_id}")
def delete_kb_qa(qa_id: int) -> dict:
    calls_db.delete_kb_qa(qa_id)
    return {"ok": True}


@app.post("/knowledge-sources/{source_id}/extract-qa")
def extract_qa_from_source(source_id: int) -> dict:
    """LLM-drafts Q&A pairs from one uploaded source. Returns drafts only —
    nothing is saved until the operator reviews and POSTs them to /qa/bulk,
    so a misread price never reaches a live agent unreviewed."""
    source = calls_db.get_knowledge_source_content(source_id)
    if source is None:
        raise HTTPException(404, "Source not found")
    try:
        pairs = kb_extract.extract_qa_pairs(source["name"], source["content"])
    except RuntimeError as exc:
        raise HTTPException(502, str(exc)) from exc
    return {"ok": True, "pairs": pairs}


# ----------------------------------------------------------- campaigns


@app.get("/inbound-routes")
def list_inbound_routes() -> list[dict]:
    return calls_db.list_inbound_routes()


@app.post("/inbound-routes")
def create_inbound_route(data: dict = Body(...)) -> dict:
    calls_db.create_inbound_route(data)
    return {"ok": True}


@app.get("/campaigns")
def list_campaigns() -> list[dict]:
    return calls_db.list_campaigns()


@app.post("/campaigns")
def create_campaign(data: dict = Body(...)) -> dict:
    calls_db.create_campaign(data)
    return {"ok": True}


@app.patch("/campaigns/{campaign_id}")
def update_campaign(campaign_id: int, data: dict = Body(...)) -> dict:
    calls_db.update_campaign_status(campaign_id, data.get("status", "paused"))
    return {"ok": True}


# -------------------------------------------------------- integrations


@app.get("/integrations")
def list_integrations() -> list[dict]:
    return calls_db.list_integrations()


@app.patch("/integrations/{key}")
def update_integration(key: str, data: dict = Body(...)) -> dict:
    calls_db.update_integration(key, data.get("status", "not_connected"), data.get("config", {}))
    return {"ok": True}


# ----------------------------------------------------- telephony (EnableX)


@app.get("/telephony/status")
def telephony_status() -> dict:
    return calls_db.telephony_status()


@app.post("/telephony/connect")
def telephony_connect(data: dict = Body(...)) -> dict:
    app_id = (data.get("appId") or "").strip()
    app_key = (data.get("appKey") or "").strip()
    if not app_id or not app_key:
        raise HTTPException(400, "Both App ID and App Key are required")
    calls_db.connect_enablex(app_id, app_key)
    return calls_db.telephony_status()


@app.post("/telephony/disconnect")
def telephony_disconnect() -> dict:
    calls_db.disconnect_enablex()
    return {"ok": True}


@app.get("/telephony/numbers")
def list_phone_numbers() -> list[dict]:
    return calls_db.list_phone_numbers()


async def _sync_dispatch_rule(number_id: int) -> str | None:
    """Best-effort: (re)create this number's LiveKit SIP dispatch rule.

    Runs after every add/reassign so an inbound call to the number is always
    routed to whichever agent the dashboard currently has it assigned to.
    Returns an error message on failure — the number/agent change itself
    still saves either way, since LiveKit Cloud being briefly unreachable
    shouldn't block using the dashboard.
    """
    row = calls_db.get_phone_number(number_id)
    if row is None:
        return None
    try:
        await livekit_sip.upsert_dispatch_rule(row)
        return None
    except Exception as exc:
        logger.exception("failed to sync LiveKit dispatch rule for number %s", row["number"])
        return f"Number saved, but LiveKit call routing wasn't updated: {exc}"


@app.post("/telephony/numbers")
async def add_phone_number(data: dict = Body(...)) -> dict:
    number = (data.get("number") or "").strip()
    if not number:
        raise HTTPException(400, "A phone/virtual number is required")
    number_id = calls_db.add_phone_number(number, data.get("label", ""), data.get("agentId"))
    lk_sync_error = await _sync_dispatch_rule(number_id)
    return {"ok": True, "lkSyncError": lk_sync_error}


@app.patch("/telephony/numbers/{number_id}")
async def assign_phone_number(number_id: int, data: dict = Body(...)) -> dict:
    calls_db.assign_phone_number(number_id, data.get("agentId"))
    lk_sync_error = await _sync_dispatch_rule(number_id)
    return {"ok": True, "lkSyncError": lk_sync_error}


@app.delete("/telephony/numbers/{number_id}")
async def delete_phone_number(number_id: int) -> dict:
    row = calls_db.get_phone_number(number_id)
    if row is not None and row.get("lkDispatchRuleId"):
        try:
            await livekit_sip.delete_dispatch_rule(row)
        except Exception:
            logger.exception("failed to delete LiveKit dispatch rule for number %s", row["number"])
    calls_db.delete_phone_number(number_id)
    if calls_db.get_setting(livekit_sip.TRUNK_ID_SETTING):
        try:
            await livekit_sip.ensure_inbound_trunk()
        except Exception:
            logger.exception("failed to resync LiveKit trunk numbers after deleting %s", number_id)
    return {"ok": True}


@app.post("/telephony/test-call")
def telephony_test_call(data: dict = Body(...)) -> dict:
    from_number = (data.get("from") or "").strip()
    to_number = (data.get("to") or "").strip()
    if not from_number or not to_number:
        raise HTTPException(400, "Both a from (virtual) number and a to number are required")
    return calls_db.place_test_call(from_number, to_number)


@app.get("/telephony/sip-host")
def telephony_sip_host() -> dict:
    """The LiveKit SIP endpoint to register as the EnableX inbound webhook
    target isn't this — but this exposes the SIP host we bridge calls to, so
    the dashboard can show operators what's wired up."""
    return {"sipHost": livekit_sip.sip_host()}


@app.post("/telephony/enablex/inbound-event")
async def enablex_inbound_event(event: dict = Body(...)) -> dict:
    """Webhook EnableX calls for inbound-call lifecycle events.

    Set this URL (…/telephony/enablex/inbound-event) as the webhook on your
    EnableX inbound number in the portal. On an incoming call we accept the
    leg and bridge it to LiveKit's SIP host for the dialed number, so the
    same Riya agent that powers browser calls handles the phone call — the
    LiveKit inbound trunk + per-number dispatch rule route it into a room
    with the right agent auto-dispatched.

    EnableX expects a 200 quickly; we respond immediately and only act on the
    'incomingcall' state. (Encrypted webhook payloads aren't handled yet —
    configure the portal webhook without encryption for now.)
    """
    state = event.get("state")
    voice_id = event.get("voice_id")
    dialed_number = event.get("to")
    caller = event.get("from")
    logger.info("EnableX inbound event: state=%s voice_id=%s to=%s from=%s raw=%s", state, voice_id, dialed_number, caller, event)

    if state != "incomingcall" or not voice_id or not dialed_number:
        return {"ok": True}

    number_row = calls_db.get_phone_number_by_number(dialed_number)
    if number_row is None:
        logger.warning("inbound call to unregistered number %s — hanging up", dialed_number)
        return {"ok": False, "error": "number not registered"}

    accept = calls_db.enablex_accept_call(voice_id)
    if not accept.get("ok"):
        logger.error("failed to accept EnableX call %s: %s", voice_id, accept.get("error"))
        return accept

    sip_uri = f"sip:{dialed_number}@{livekit_sip.sip_host()}"
    bridge = calls_db.enablex_connect_to_sip(voice_id, dialed_number, sip_uri)
    if not bridge.get("ok"):
        logger.error("failed to bridge EnableX call %s to %s: %s", voice_id, sip_uri, bridge.get("error"))
    return bridge


@app.post("/telephony/enablex/outbound-test-event")
def enablex_outbound_test_event(event: dict = Body(...)) -> dict:
    """Webhook for the dashboard's "Call test" outbound calls (see
    calls_db.place_test_call). Once EnableX reports the callee answered, we
    bridge the leg to the LiveKit agent the same way real inbound calls are
    bridged, instead of just playing a canned line and hanging up."""
    state = event.get("state")
    voice_id = event.get("voice_id")
    logger.info("EnableX outbound-test event: state=%s voice_id=%s raw=%s", state, voice_id, event)

    if state != "connected" or not voice_id:
        return {"ok": True}

    bridge = calls_db.enablex_test_call_connected(voice_id)
    if bridge is None:
        logger.warning("outbound-test 'connected' event for untracked voice_id=%s", voice_id)
        return {"ok": True}
    logger.info("bridged outbound test call %s -> %s", voice_id, bridge)
    if not bridge.get("ok"):
        logger.error("failed to bridge outbound test call %s: %s", voice_id, bridge.get("error"))
    return bridge


# ------------------------------------------------------------- billing


@app.get("/billing/summary")
def billing() -> dict:
    return calls_db.billing_summary()


# ---------------------------------------------------------- website widget


@app.get("/widget/backend-url")
def widget_backend_url() -> dict:
    """This backend's own publicly reachable URL — the dashboard needs the
    real Railway URL (not the Vercel /api rewrite prefix web-demo itself
    uses) to generate an embed snippet a third-party site can call directly.
    Same helper calls_db.public_base_url() already uses for the EnableX
    webhook URL. Returns null if neither RAILWAY_PUBLIC_DOMAIN nor
    PUBLIC_BASE_URL is set (e.g. local dev)."""
    return {"backendUrl": calls_db.public_base_url()}


@app.get("/widget.js")
def widget_js() -> FileResponse:
    """Serves the embeddable widget bundle (built from ../widget) from this
    same backend, so a customer only ever has to configure one URL — this
    one — for both the <script src> and data-api-base. Rebuild with
    `npm run build` in widget/ and copy dist/widget.js here after editing
    widget/src/widget.ts; there's no automated build step wiring the two
    together yet."""
    return FileResponse(WIDGET_JS_PATH, media_type="application/javascript; charset=utf-8")


@app.get("/widget/wordpress-plugin.zip")
def widget_wordpress_plugin() -> FileResponse:
    """Downloadable, install-ready WordPress plugin (wordpress-plugin/ in the
    repo) — just a settings page for the site key + this backend's URL,
    which then echoes the widget.js script tag in wp_footer()."""
    return FileResponse(
        WORDPRESS_PLUGIN_ZIP_PATH,
        media_type="application/zip",
        filename="arthale-voice-widget.zip",
    )


@app.get("/agent-orb.mp4")
def widget_agent_orb() -> FileResponse:
    """Same looping orb video used on the dashboard's browser-call screen —
    served from here too so the embeddable widget (a separate, dependency-
    free bundle) can show the identical agent visual without needing its own
    copy of the asset shipped in the widget.js bundle itself."""
    return FileResponse(AGENT_ORB_VIDEO_PATH, media_type="video/mp4")


@app.get("/widget/sites")
def list_sites() -> list[dict]:
    return calls_db.list_sites()


@app.post("/widget/sites")
def create_site(data: dict = Body(...)) -> dict:
    name = (data.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "A site name is required")
    return calls_db.create_site(
        name,
        data.get("agentId"),
        data.get("allowedDomain", ""),
        data.get("widgetPosition", "bottom-right"),
        data.get("widgetLabel", "Talk to us"),
    )


@app.patch("/widget/sites/{site_id}")
def update_site(site_id: int, data: dict = Body(...)) -> dict:
    site = calls_db.update_site(site_id, data)
    if site is None:
        raise HTTPException(404, "Site not found")
    return site


@app.post("/widget/sites/{site_id}/regenerate-key")
def regenerate_site_key(site_id: int) -> dict:
    site = calls_db.regenerate_site_key(site_id)
    if site is None:
        raise HTTPException(404, "Site not found")
    return site


@app.delete("/widget/sites/{site_id}")
def delete_site(site_id: int) -> dict:
    calls_db.delete_site(site_id)
    return {"ok": True}


# Very small in-memory guard against a leaked/scraped site key being hammered
# from a script — resets on restart and isn't shared across instances, so
# it's a first line of defense, not a real distributed rate limiter.
_WIDGET_TOKEN_WINDOW_SECONDS = 60
_WIDGET_TOKEN_MAX_PER_WINDOW = 30
_widget_token_calls: dict[str, list[float]] = {}


def _widget_rate_limited(site_key: str) -> bool:
    import time

    now = time.monotonic()
    calls = [t for t in _widget_token_calls.get(site_key, []) if now - t < _WIDGET_TOKEN_WINDOW_SECONDS]
    calls.append(now)
    _widget_token_calls[site_key] = calls
    return len(calls) > _WIDGET_TOKEN_MAX_PER_WINDOW


def _looks_like_real_phone(phone: str) -> bool:
    """Rejects obviously-fake test input (9999999999, 7778889999,
    1234567890, ...) in addition to basic E.164 shape — client-side already
    checks this, but the client is untrusted, so the server enforces it too.
    Not real carrier validation, just filters the "typed garbage to get past
    a required field" pattern.
    """
    import re

    if not re.match(r"^\+[1-9]\d{7,14}$", phone.strip()):
        return False
    digits = re.sub(r"\D", "", phone)
    local = digits[-10:] if len(digits) >= 10 else digits
    if len(set(local)) <= 3:
        return False
    ascending = "01234567890123456789"
    descending = "98765432109876543210"
    if local in ascending or local in descending:
        return False
    return True


class WidgetTokenRequest(BaseModel):
    siteKey: str
    identity: str
    name: str
    phone: str


@app.post("/widget/token")
async def create_widget_token(req: WidgetTokenRequest) -> dict:
    """Public, unauthenticated endpoint the embeddable widget.js calls from
    an arbitrary third-party website — auth is the site key itself, not a
    dashboard session. Issues a LiveKit token for a fresh room pre-tagged
    with {"agent_id", "site_id", "visitor_name", "visitor_phone"} so
    agent/main.py's _call_context_from_job loads the right agent, seeds the
    lead with the details the visitor already typed in before the call even
    starts, and logs the call as a 'widget' call against this site — same
    mechanism phone numbers and dashboard browser tests already use for
    their own metadata shape.
    """
    masked_key = req.siteKey[:12] + "…" if len(req.siteKey) > 12 else req.siteKey
    name = req.name.strip()
    if not name:
        logger.warning("widget token rejected: empty name (site_key=%s)", masked_key)
        raise HTTPException(400, "Name is required")
    if not _looks_like_real_phone(req.phone):
        logger.warning("widget token rejected: invalid phone %r (site_key=%s)", req.phone, masked_key)
        raise HTTPException(400, "Enter a valid phone number in international format, e.g. +919812345678")

    site = calls_db.get_site_by_key(req.siteKey)
    if site is None:
        logger.warning("widget token rejected: unknown site_key=%s", masked_key)
        raise HTTPException(404, "Unknown site key")
    if site["status"] == "paused":
        logger.warning("widget token rejected: site %s is paused", site["name"])
        raise HTTPException(403, "This site's widget is currently paused")
    if _widget_rate_limited(req.siteKey):
        logger.warning("widget token rejected: rate limited (site=%s)", site["name"])
        raise HTTPException(429, "Too many calls from this site right now — try again shortly")

    api_key = os.environ.get("LIVEKIT_API_KEY")
    api_secret = os.environ.get("LIVEKIT_API_SECRET")
    livekit_url = os.environ.get("LIVEKIT_URL")
    if not api_key or not api_secret or not livekit_url:
        logger.error("widget token failed: LiveKit credentials not configured on the server")
        raise HTTPException(500, "LiveKit credentials are not configured on the server")

    import secrets

    room = f"widget-{site['id']}-{secrets.token_hex(8)}"
    try:
        async with api.LiveKitAPI() as lkapi:
            await lkapi.room.create_room(
                CreateRoomRequest(
                    name=room,
                    metadata=json.dumps(
                        {
                            "agent_id": site["agentId"],
                            "site_id": site["id"],
                            "visitor_name": name,
                            "visitor_phone": req.phone.strip(),
                        }
                    ),
                )
            )
        logger.info("widget token issued: site=%s agent_id=%s room=%s", site["name"], site["agentId"], room)
    except Exception:
        logger.exception("widget token failed: could not create LiveKit room for site=%s", site["name"])
        raise HTTPException(502, "Could not start the call right now — please try again shortly")

    token = (
        api.AccessToken(api_key, api_secret)
        .with_identity(req.identity)
        .with_name(req.identity)
        .with_grants(api.VideoGrants(room_join=True, room=room))
        .to_jwt()
    )
    return {"token": token, "url": livekit_url, "room": room}
