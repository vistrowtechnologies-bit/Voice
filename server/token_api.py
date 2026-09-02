import base64
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import admin_db
import auth
import jwt
import call_intelligence
import calls_db
import campaign_dialer
import db_backup
import email_sender
import disposable_email
import help_chat
import integrations_dispatch
import kb_crawl
import kb_extract
import livekit_sip
import razorpay_client
import widget_avatars
import widget_chat
import voice_catalog
from help_content import FAQS
from dotenv import load_dotenv
from fastapi import Body, Depends, FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, RedirectResponse, StreamingResponse
from livekit import api
from livekit.api import (
    CreateRoomRequest,
    ListParticipantsRequest,
    ListRoomsRequest,
    RoomAgentDispatch,
    UpdateRoomMetadataRequest,
)
from pydantic import BaseModel

WIDGET_JS_PATH = Path(__file__).resolve().parent / "static" / "widget.js"
WORDPRESS_PLUGIN_ZIP_PATH = Path(__file__).resolve().parent / "static" / "vistrow-voice-widget.zip"
AGENT_ORB_VIDEO_PATH = Path(__file__).resolve().parent / "static" / "agent-orb.mp4"
WIDGET_AVATARS_DIR = Path(__file__).resolve().parent / "static" / "widget-avatars"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("telephony")

load_dotenv()

app = FastAPI()
calls_db.init_tables()
# Background worker that places due campaign calls (compliance-gated). Daemon
# thread, idempotent start — no-op until a campaign is set 'running'.
campaign_dialer.start_dialer()
# Daily Postgres backup to B2 (see db_backup.py) — same daemon-thread shape.
db_backup.start_backup_scheduler()

# Cookie is Secure in production (HTTPS) and not in local http dev — set
# AUTH_COOKIE_SECURE=1 on the deployment. In prod the browser hits the app's
# own origin and Vercel rewrites /api to the backend, so the session cookie
# is same-site either way (no cross-origin cookie needed).
_COOKIE_SECURE = os.environ.get("AUTH_COOKIE_SECURE", "").lower() in ("1", "true", "yes")
_DEVICE_COOKIE_NAME = "vv_device"

# Routes reachable without a session. Everything else (the dashboard/admin
# API) requires a valid session cookie, enforced by the middleware below.
_PUBLIC_PATHS = {
    "/token",                          # LiveKit token for the public demo + browser test
    "/widget.js",                      # embedded widget script
    "/widget/token",                   # widget call token (runs on customers' sites)
    "/widget/chat",                    # widget text-chat turn (runs on customers' sites)
    "/widget/feedback",                # widget post-conversation rating
    "/widget/telemetry",               # widget latency/failure diagnostics
    "/widget/site-config",             # public avatar/greeting/mode lookup by site key
    "/widget/warm",                    # widget room pre-warm (runs on customers' sites)
    "/widget/wp-pages",                # WordPress plugin pushing its own page list (runs on customers' sites)
    "/widget/wordpress-plugin.zip",    # plugin download
    "/agent-orb.mp4",                  # widget avatar video
    "/public/contact",                 # marketing site's "Book a Demo" form (anonymous visitors)
    "/telephony/enablex/inbound-event",  # EnableX inbound webhook (their server calls it)
    "/telephony/enablex/outbound-test-event",  # EnableX outbound/test-call webhook (their server calls it — no session)
    "/webhooks/meta",                  # Meta's leadgen/WhatsApp webhook (GET verify + POST events — no session)
}
_PUBLIC_PREFIXES = (
    "/auth/", "/invite/", "/widget-avatars/",
    # Third-party webhook sender (Zapier et al) — no session; the route
    # itself checks the ?token= query param via
    # calls_db.account_id_for_lead_webhook_token instead.
    "/leads/inbound/",
)  # signup/login/logout/me + invite-preview/accept handle their own logic; avatar images run on third-party sites, no session


@app.middleware("http")
async def no_store_api_responses(request: Request, call_next):
    """Every /api/* response is dashboard/admin data that must never be served
    stale — a super-admin adjusting an account's credits, plan, or status must
    see the change on the very next fetch. Without an explicit no-store, a
    dynamic-content GET can still get cached by an intermediate layer (Vercel's
    edge, a browser's heuristic cache) since FastAPI sets no cache headers of
    its own by default."""
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    return response


@app.middleware("http")
async def require_session(request: Request, call_next):
    """Gate the dashboard API behind a valid session cookie. Public demo,
    widget, webhook, and auth routes are allowlisted; CORS preflight passes."""
    path = request.url.path
    if request.method == "OPTIONS" or path in _PUBLIC_PATHS or path.startswith(_PUBLIC_PREFIXES):
        return await call_next(request)
    session = auth.read_session_token(request.cookies.get(auth.COOKIE_NAME))
    if session is not None:
        profile = calls_db.get_user_by_id(session["uid"])
        if profile is None or int(profile.get("session_version") or 1) != int(session.get("sv") or 1):
            return JSONResponse({"detail": "Session expired — please sign in again"}, status_code=401)
        if session.get("sid") and not calls_db.validate_user_session(session["sid"], session["uid"]):
            return JSONResponse({"detail": "This device was signed out"}, status_code=401)
        # Stash for downstream handlers/dependencies (Phase 3 scopes queries by it).
        request.state.user_id = session["uid"]
        request.state.account_id = session["aid"]
        request.state.session_id = session.get("sid")
        # imp is set only in a super-admin support session — carries the real
        # platform-owner user id so admin routes can attribute audit entries to
        # them even while uid/aid point at the tenant being viewed.
        request.state.impersonator_id = session.get("imp")
        return await call_next(request)
    # No session cookie — accept a programmatic API key instead. The key maps
    # to a tenant account; we give the request that account's owner user so
    # handlers that read user_id keep working.
    api_key = request.headers.get("X-Api-Key")
    if api_key:
        account_id = calls_db.resolve_api_key(api_key)
        if account_id is not None:
            request.state.account_id = account_id
            request.state.user_id = calls_db.account_owner_user_id(account_id)
            request.state.impersonator_id = None
            return await call_next(request)
    return JSONResponse({"detail": "Not authenticated"}, status_code=401)


def current_user(request: Request) -> dict:
    """FastAPI dependency: the logged-in user's {uid, aid}. The middleware has
    already rejected unauthenticated requests, so state is always populated on
    guarded routes."""
    return {"user_id": request.state.user_id, "account_id": request.state.account_id}


def require_role(min_role: str):
    """Dependency factory gating a route to `min_role` or higher, per
    calls_db.ROLE_RANK (viewer < member < admin < owner). Looks the caller's
    role up fresh on each request rather than trusting the session, since role can
    change after the cookie was issued. A super-admin support session (imp
    set) always passes — the platform owner never gets locked out of a
    tenant's own team/billing screens while impersonating."""

    def dep(request: Request, user: dict = Depends(current_user)) -> dict:
        if getattr(request.state, "impersonator_id", None):
            return user
        full = calls_db.get_user_by_id(user["user_id"])
        if full is None or calls_db.ROLE_RANK.get(full["role"], 0) < calls_db.ROLE_RANK[min_role]:
            raise HTTPException(403, "You don't have permission to do this")
        return user

    return dep


def require_platform_owner(request: Request) -> dict:
    """Dependency for every /admin route. Resolves the ACTING platform owner —
    normally the session user, but during a support session (imp set) it's the
    impersonator, so an admin can't be locked out of admin routes while viewing
    a tenant. Returns 404 (not 403) to non-owners so the panel's existence
    isn't disclosed to regular tenants poking at URLs."""
    acting_uid = getattr(request.state, "impersonator_id", None) or request.state.user_id
    user = calls_db.get_user_by_id(acting_uid)
    if user is None or not user["is_platform_owner"]:
        raise HTTPException(404, "Not found")
    return {"user_id": acting_uid, "email": user["email"]}


# Wildcard is required, not a placeholder: the widget (/widget/*, /token) is
# embedded on arbitrary tenant-owned domains we can't enumerate in advance.
# This is safe because allow_credentials is (deliberately) never set to True
# here — browsers refuse to expose a credentialed response to page JS without
# it, and our own dashboard never actually makes a cross-origin *credentialed*
# request in the first place (web-demo/vercel.json rewrites /api/* to this
# service server-side, so the browser sees it as same-origin and the session
# cookie's own `samesite=lax` is what's actually gating cross-site use of it).
# If a future frontend calls this API cross-origin with cookies, it needs
# allow_credentials=True + a real origin allowlist here, not a wildcard.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["*"],
)


@app.middleware("http")
async def _security_headers(request: Request, call_next):
    """No page here is ever meant to be framed by another site (no iframe
    embedding exists anywhere in this codebase — the widget injects into the
    host page's own DOM instead), so clickjacking protection is free. Not
    adding a script/style Content-Security-Policy here: getting that right
    needs an audit of every asset host the dashboard/marketing/widget bundles
    actually load, and shipping a wrong one silently breaks the app instead
    of failing loudly — narrower scope than a pre-launch pass should risk.
    """
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Content-Security-Policy"] = "frame-ancestors 'none'"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


def _client_ip(request: Request) -> str:
    """Real visitor IP behind Railway's edge proxy. request.client.host is
    Railway's internal proxy address, not the caller's — uvicorn only trusts
    X-Forwarded-For when started with --proxy-headers, which start.sh does
    not set. Railway's edge sets X-Forwarded-For itself (this container isn't
    reachable except through it), so the leftmost entry is trustworthy. Every
    per-IP rate limiter must go through this, or it silently shares one
    bucket (Railway's own proxy IP) across every real visitor.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return (request.client.host if request.client else "") or "unknown"

# Name of the dedicated LiveKit Cloud Agent that serves ONLY the marketing
# site's own demo (the "try it live" widget and DemoOrbCard) — deployed
# separately from the shared agent every tenant's calls run through (see
# agent/main.py's LIVEKIT_AGENT_NAME). Isolating it means demo traffic
# always lands on its own permanently-warm replica instead of sometimes
# getting load-balanced onto a replica the shared pool just cold-started to
# absorb a tenant traffic spike. Must match LIVEKIT_AGENT_NAME on that
# deployment exactly, or rooms created with this explicit dispatch will
# never get an agent.
_PLATFORM_DEMO_AGENT_NAME = "platform-demo"


# LiveKit's default empty_timeout is 300s, which is why an abandoned prewarm
# used to sit in the console as a 5-minute session. agent/main.py now deletes
# the room itself once its 90s wait_for_participant times out, so this is only
# the backstop for rooms an agent never joined at all (worker down, dispatch
# dropped). Kept above that 90s wait so it can never race the agent, and the
# /widget/token path already recreates a warmed room that has expired.
_ROOM_EMPTY_TIMEOUT_S = 120


# What the public demo's language picker may ask for. The demo runs a Gemini
# persona voice, so it is that voice's range plus our own native spellings -
# voice_catalog.to_google_code maps od-IN/bn-IN across at the TTS boundary.
_DEMO_SELECTABLE_LANGUAGES = frozenset(voice_catalog.GOOGLE_TTS_LANGUAGES) | frozenset(
    voice_catalog.LANGUAGE_LABELS
)


def _demo_dispatch_kwargs(agent_id: int | None, *, default_is_demo: bool = False) -> dict:
    """kwargs to spread into CreateRoomRequest so this room explicitly
    dispatches to the dedicated demo agent when agent_id is the platform
    demo agent — every other room is left on implicit/default dispatch
    (unchanged behavior) so tenant traffic never touches this at all.
    default_is_demo covers /token's agentId=None case, which agent/db.py's
    get_agent_config resolves to the platform-demo agent by default."""
    is_demo = calls_db.is_public_demo_agent(agent_id) if agent_id is not None else default_is_demo
    if not is_demo:
        return {}
    return {"agents": [RoomAgentDispatch(agent_name=_PLATFORM_DEMO_AGENT_NAME)]}


class TokenRequest(BaseModel):
    identity: str
    room: str = "voice-agent-demo"
    agentId: int | None = None
    # Public industry demos (/solutions/<industry>) name the agent by slug,
    # never by id — see calls_db.agent_id_for_public_demo_slug for why. When
    # set it wins over agentId, so a crafted body can't pair a published
    # slug with someone else's agent id.
    demoSlug: str | None = None
    # "Try it in your language" on the marketing pages. Validated against the
    # catalog below and only ever applied to a demo agent (see agent/main.py's
    # entrypoint), so this cannot repoint a tenant's configured language.
    language: str | None = None


@app.post("/token")
async def create_token(req: TokenRequest, request: Request) -> dict:
    # Public/unauthenticated: cap per client IP so a script can't mint
    # unlimited join tokens or dispatch unlimited billable agent calls.
    client_ip = _client_ip(request)
    if _token_rate_limited(client_ip):
        logger.warning("token rejected: rate limited (ip=%s)", client_ip)
        raise HTTPException(429, "Too many calls right now — please try again shortly.")

    api_key = os.environ.get("LIVEKIT_API_KEY")
    api_secret = os.environ.get("LIVEKIT_API_SECRET")
    livekit_url = os.environ.get("LIVEKIT_URL")
    if not api_key or not api_secret or not livekit_url:
        raise HTTPException(500, "LiveKit credentials are not configured on the server")

    # Pre-creating the room here (rather than letting the browser's own
    # WebRTC join implicitly create it) triggers agent dispatch immediately -
    # the entrypoint starts connecting and loading config in the background
    # while the caller is still requesting mic access, same head start
    # /widget/warm already gives widget rooms (see agent/main.py's
    # entrypoint docstring). Previously only the dashboard "test in browser"
    # flow (agentId set) got this; the marketing homepage's demo orb called
    # this same endpoint but skipped it, so every demo call started fully
    # cold. Metadata is agentId-specific (see _agent_id_from_job) but the
    # create_room call itself is unconditional and idempotent — a no-op if
    # DemoOrbCard's prewarm already created this room moments earlier.
    # A published industry-demo slug resolves to its agent server-side and
    # takes precedence over any agentId in the body — the slug is vouched
    # for (owner-set, live), a raw id from an unauthenticated caller is not.
    agent_id = req.agentId
    if req.demoSlug:
        agent_id = calls_db.agent_id_for_public_demo_slug(req.demoSlug)
        if agent_id is None:
            raise HTTPException(404, "That demo isn't available right now.")

    meta: dict = {}
    if agent_id is not None:
        meta["agent_id"] = agent_id
    if req.language:
        # Reject anything not in the catalog rather than passing it through:
        # an unknown code reaches the TTS as a locale it does not know, and
        # Sarvam in particular fails the call outright rather than degrading.
        if req.language not in _DEMO_SELECTABLE_LANGUAGES:
            raise HTTPException(400, "That language isn't available on the demo.")
        meta["demo_language"] = req.language
    metadata = json.dumps(meta) if meta else None
    async with api.LiveKitAPI() as lkapi:
        await lkapi.room.create_room(
            CreateRoomRequest(
                name=req.room,
                metadata=metadata,
                empty_timeout=_ROOM_EMPTY_TIMEOUT_S,
                **_demo_dispatch_kwargs(agent_id, default_is_demo=agent_id is None),
            )
        )

    token = (
        api.AccessToken(api_key, api_secret)
        .with_identity(req.identity)
        .with_name(req.identity)
        .with_grants(api.VideoGrants(room_join=True, room=req.room))
        .to_jwt()
    )
    return {"token": token, "url": livekit_url}


@app.post("/orchestrator/platform-demo-token")
async def orchestrator_platform_demo_token(request: Request) -> dict:
    """Fallback token for the marketing site's live demo — DemoOrbCard
    calls this when LiveKit's demo worker doesn't pick up within
    AGENT_JOIN_TIMEOUT_MS (worker cold-start/crash/restart), instead of
    just showing an error. Public/unauthenticated like /token above, so it
    shares the same per-IP rate limit; unlike the dashboard's
    /orchestrator/browser-token this needs no agentId — the orchestrator
    resolves the same is_platform_demo-flagged agent LiveKit's own /token
    route resolves for an unrouted call, off the same `agents` table."""
    client_ip = _client_ip(request)
    if _token_rate_limited(client_ip):
        raise HTTPException(429, "Too many calls right now — please try again shortly.")
    orchestrator_url = os.environ.get("ORCHESTRATOR_URL")
    if not orchestrator_url:
        return {"ok": False, "error": "Orchestrator not configured."}
    try:
        req = urllib.request.Request(f"{orchestrator_url.rstrip('/')}/browser/token/platform-demo", method="GET")
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        logger.exception("orchestrator platform-demo-token proxy failed")
        return {"ok": False, "error": f"Could not reach orchestrator: {e}"}


# --------------------------------------------------------------------- auth


class SignupRequest(BaseModel):
    name: str
    company: str
    email: str
    password: str
    referral_source: str = ""
    phone: str = ""


class LoginRequest(BaseModel):
    email: str
    password: str


class VerifyEmailRequest(BaseModel):
    email: str
    code: str


class ResendEmailVerificationRequest(BaseModel):
    email: str


def _set_session_cookie(
    response: Response,
    user_id: int,
    account_id: int,
    request: Request | None = None,
    provider: str = "",
) -> str:
    profile = calls_db.get_user_by_id(user_id)
    device_id = request.cookies.get(_DEVICE_COOKIE_NAME, "") if request is not None else ""
    if not re.fullmatch(r"[A-Za-z0-9_-]{20,160}", device_id):
        device_id = secrets.token_urlsafe(32)
    session_id = calls_db.create_user_session(
        user_id,
        device_id,
        request.headers.get("user-agent", "") if request is not None else "",
        provider or str((profile or {}).get("auth_provider") or ""),
        auth.SESSION_TTL_SECONDS,
    )
    response.set_cookie(
        auth.COOKIE_NAME,
        auth.make_session_token(
            user_id,
            account_id,
            session_version=int((profile or {}).get("session_version") or 1),
            session_id=session_id,
        ),
        max_age=auth.SESSION_TTL_SECONDS,
        httponly=True,
        secure=_COOKIE_SECURE,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        _DEVICE_COOKIE_NAME,
        device_id,
        max_age=365 * 24 * 3600,
        httponly=True,
        secure=_COOKIE_SECURE,
        samesite="lax",
        path="/",
    )
    return session_id


def _me_payload(user_id: int, impersonator_id: int | None = None) -> dict:
    user = calls_db.get_user_by_id(user_id)
    if user is None:
        raise HTTPException(401, "Session user no longer exists")
    avatar_key = user.get("avatar_url") or ""
    preferences = calls_db.get_user_preferences(user_id)
    payload = {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "phone": user.get("phone") or "",
        "timezone": preferences.get("timezone") or "UTC",
        "role": user["role"],
        "accountId": user["account_id"],
        "accountName": user["account_name"],
        "plan": user["account_plan"],
        "isPlatformOwner": bool(user["is_platform_owner"]),
        "onboarded": user["onboarded_at"] is not None,
        "consent": calls_db.get_consent(user["account_id"]),
        "tourCompleted": user["tour_completed_at"] is not None,
        "impersonating": False,
        "authProvider": user.get("auth_provider") or "password",
        "passwordSet": bool(user.get("password_set", True)),
        # The database holds an opaque object-storage key, never a direct
        # storage URL. The dashboard fetches it through an authenticated API
        # route, keeping account photos private.
        "avatarUrl": f"/api/profile/avatar?v={hashlib.sha256(avatar_key.encode()).hexdigest()[:12]}" if avatar_key else "",
    }
    if impersonator_id:
        # Support session: the panel shows the "viewing as" banner and the
        # sidebar admin link stays available so the owner can exit.
        payload["impersonating"] = True
        payload["isPlatformOwner"] = True
    return payload


@app.get("/auth/config")
def auth_config() -> dict:
    """Which optional auth features are actually configured on this server, so
    the frontend never shows a dead button. OAuth providers appear only when
    their client id + secret env vars are set; password-reset email appears
    only when an email provider is configured."""
    providers = []
    if os.environ.get("GOOGLE_OAUTH_CLIENT_ID") and os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET"):
        providers.append("google")
    if os.environ.get("GITHUB_OAUTH_CLIENT_ID") and os.environ.get("GITHUB_OAUTH_CLIENT_SECRET"):
        providers.append("github")
    if (
        os.environ.get("SLACK_OAUTH_CLIENT_ID")
        and os.environ.get("SLACK_OAUTH_CLIENT_SECRET")
        and os.environ.get("SLACK_OAUTH_REDIRECT_URI")
    ):
        providers.append("slack")
    email_configured = bool(os.environ.get("RESEND_API_KEY") or os.environ.get("SMTP_HOST"))
    return {"oauthProviders": providers, "emailConfigured": email_configured}


_OAUTH_STATE_COOKIE = "vv_oauth_state"
_OAUTH_NONCE_COOKIE = "vv_oauth_nonce"
_SLACK_INTEGRATION_STATE_COOKIE = "vv_slack_integration_state"
_SLACK_JWKS_CLIENT = jwt.PyJWKClient("https://slack.com/openid/connect/keys", cache_keys=True)


def _oauth_or_create_user(email: str, name: str, provider: str = "password") -> dict:
    """Finds the user by email, or provisions a brand-new account for them
    (mirrors /auth/signup) — OAuth is just a passwordless entry into the same
    signup path. A random unusable password hash fills the required column;
    the user can set a real password later via forgot-password if they want
    one for non-OAuth login too. `provider` is stamped for the admin panel."""
    email = email.lower()
    user = calls_db.get_user_by_email(email)
    if user is not None:
        calls_db.mark_user_email_verified(user["id"])
        calls_db.record_login(user["id"], provider)
        return {"user_id": user["id"], "account_id": user["account_id"]}
    company_name = f"{name.split(' ')[0]}'s Workspace" if name else email.split("@")[0]
    created = calls_db.create_account_with_owner(
        company_name,
        name or email.split("@")[0],
        email,
        auth.hash_password(secrets.token_urlsafe(32)),
        password_set=False,
        email_verified=True,
    )
    calls_db.record_login(created["user_id"], provider)
    return created


@app.get("/auth/oauth/google/start")
def auth_oauth_google_start(response: Response) -> RedirectResponse:
    client_id = os.environ.get("GOOGLE_OAUTH_CLIENT_ID")
    redirect_uri = os.environ.get("GOOGLE_OAUTH_REDIRECT_URI")
    if not client_id or not os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET") or not redirect_uri:
        raise HTTPException(404, "Google sign-in is not configured on this server")
    state = secrets.token_urlsafe(24)
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
    }
    redirect = RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{urllib.parse.urlencode(params)}")
    redirect.set_cookie(_OAUTH_STATE_COOKIE, state, max_age=600, httponly=True, secure=_COOKIE_SECURE, samesite="lax")
    return redirect


@app.get("/auth/oauth/google/callback")
def auth_oauth_google_callback(request: Request, code: str | None = None, state: str | None = None, error: str | None = None) -> RedirectResponse:
    base_url = _app_base_url(request)
    if error or not code:
        return RedirectResponse(f"{base_url}/login?error=oauth_failed")
    expected_state = request.cookies.get(_OAUTH_STATE_COOKIE)
    if not expected_state or state != expected_state:
        return RedirectResponse(f"{base_url}/login?error=oauth_failed")

    client_id = os.environ.get("GOOGLE_OAUTH_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET")
    redirect_uri = os.environ.get("GOOGLE_OAUTH_REDIRECT_URI")
    if not client_id or not client_secret or not redirect_uri:
        return RedirectResponse(f"{base_url}/login?error=oauth_failed")
    token_body = urllib.parse.urlencode(
        {
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        }
    ).encode()
    try:
        token_req = urllib.request.Request("https://oauth2.googleapis.com/token", data=token_body, method="POST")
        with urllib.request.urlopen(token_req, timeout=10) as resp:
            token_data = json.loads(resp.read())
        userinfo_req = urllib.request.Request(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
        )
        with urllib.request.urlopen(userinfo_req, timeout=10) as resp:
            userinfo = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        # Google's error body (e.g. {"error": "invalid_client", ...}) is the
        # actual reason — swallowing it left every failure looking identical
        # in the logs regardless of cause (bad secret vs bad redirect_uri vs
        # revoked code).
        try:
            detail = e.read().decode()
        except Exception:
            detail = "<no body>"
        logger.error("Google OAuth token/userinfo exchange failed: HTTP %s %s — %s", e.code, e.reason, detail)
        return RedirectResponse(f"{base_url}/login?error=oauth_failed")
    except Exception:
        logger.exception("Google OAuth exchange failed")
        return RedirectResponse(f"{base_url}/login?error=oauth_failed")

    email = userinfo.get("email")
    if not email or not userinfo.get("email_verified", True):
        return RedirectResponse(f"{base_url}/login?error=oauth_unverified_email")

    account = _oauth_or_create_user(email, userinfo.get("name", ""), provider="google")
    redirect = RedirectResponse(f"{base_url}/dashboard")
    redirect.delete_cookie(_OAUTH_STATE_COOKIE, path="/")
    _set_session_cookie(redirect, account["user_id"], account["account_id"], request, "google")
    return redirect


@app.get("/auth/oauth/slack/start")
def auth_oauth_slack_start() -> RedirectResponse:
    client_id = os.environ.get("SLACK_OAUTH_CLIENT_ID")
    client_secret = os.environ.get("SLACK_OAUTH_CLIENT_SECRET")
    redirect_uri = os.environ.get("SLACK_OAUTH_REDIRECT_URI")
    if not client_id or not client_secret or not redirect_uri:
        raise HTTPException(404, "Slack sign-in is not configured on this server")
    state = secrets.token_urlsafe(24)
    nonce = secrets.token_urlsafe(24)
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid profile email",
        "state": state,
        "nonce": nonce,
    }
    redirect = RedirectResponse(f"https://slack.com/openid/connect/authorize?{urllib.parse.urlencode(params)}")
    cookie = {"max_age": 600, "httponly": True, "secure": _COOKIE_SECURE, "samesite": "lax", "path": "/"}
    redirect.set_cookie(_OAUTH_STATE_COOKIE, state, **cookie)
    redirect.set_cookie(_OAUTH_NONCE_COOKIE, nonce, **cookie)
    return redirect


@app.get("/auth/oauth/slack/callback")
def auth_oauth_slack_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    base_url = _app_base_url(request)
    if request.cookies.get(_SLACK_INTEGRATION_STATE_COOKIE):
        session = auth.read_session_token(request.cookies.get(auth.COOKIE_NAME))
        user = {"user_id": session["uid"], "account_id": session["aid"]} if session else None
        return _complete_slack_integration_oauth(request, code, state, error, user)

    expected_state = request.cookies.get(_OAUTH_STATE_COOKIE)
    expected_nonce = request.cookies.get(_OAUTH_NONCE_COOKIE)
    if error or not code or not expected_state or not secrets.compare_digest(state or "", expected_state):
        return RedirectResponse(f"{base_url}/login?error=oauth_failed")

    client_id = os.environ.get("SLACK_OAUTH_CLIENT_ID")
    client_secret = os.environ.get("SLACK_OAUTH_CLIENT_SECRET")
    redirect_uri = os.environ.get("SLACK_OAUTH_REDIRECT_URI")
    if not client_id or not client_secret or not redirect_uri or not expected_nonce:
        return RedirectResponse(f"{base_url}/login?error=oauth_failed")

    token_body = urllib.parse.urlencode(
        {
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        }
    ).encode()
    try:
        token_req = urllib.request.Request(
            "https://slack.com/api/openid.connect.token",
            data=token_body,
            method="POST",
            headers={"Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"},
        )
        with urllib.request.urlopen(token_req, timeout=10) as resp:
            token_data = json.loads(resp.read())
        access_token = token_data.get("access_token")
        id_token = token_data.get("id_token", "")
        if not token_data.get("ok", True) or not access_token or not id_token:
            logger.error("Slack OIDC token exchange failed: %s", token_data.get("error", "missing token"))
            return RedirectResponse(f"{base_url}/login?error=oauth_failed")
        signing_key = _SLACK_JWKS_CLIENT.get_signing_key_from_jwt(id_token)
        claims = jwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=client_id,
            issuer="https://slack.com",
        )
        if not secrets.compare_digest(str(claims.get("nonce", "")), expected_nonce):
            logger.error("Slack OIDC nonce validation failed")
            return RedirectResponse(f"{base_url}/login?error=oauth_failed")

        userinfo_req = urllib.request.Request(
            "https://slack.com/api/openid.connect.userInfo",
            headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
        )
        with urllib.request.urlopen(userinfo_req, timeout=10) as resp:
            userinfo = json.loads(resp.read())
        if not userinfo.get("ok", True) or userinfo.get("sub") != claims.get("sub"):
            logger.error("Slack OIDC userInfo failed: %s", userinfo.get("error", "unknown error"))
            return RedirectResponse(f"{base_url}/login?error=oauth_failed")
    except (jwt.PyJWTError, jwt.PyJWKClientError):
        logger.exception("Slack OIDC signature or claims validation failed")
        return RedirectResponse(f"{base_url}/login?error=oauth_failed")
    except urllib.error.HTTPError as e:
        try:
            detail = e.read().decode()
        except Exception:
            detail = "<no body>"
        logger.error("Slack OAuth exchange failed: HTTP %s %s — %s", e.code, e.reason, detail)
        return RedirectResponse(f"{base_url}/login?error=oauth_failed")
    except Exception:
        logger.exception("Slack OAuth exchange failed")
        return RedirectResponse(f"{base_url}/login?error=oauth_failed")

    email = userinfo.get("email")
    if not email or not userinfo.get("email_verified", False):
        return RedirectResponse(f"{base_url}/login?error=oauth_unverified_email")

    account = _oauth_or_create_user(email, userinfo.get("name") or userinfo.get("given_name") or "", provider="slack")
    redirect = RedirectResponse(f"{base_url}/dashboard")
    redirect.delete_cookie(_OAUTH_STATE_COOKIE, path="/")
    redirect.delete_cookie(_OAUTH_NONCE_COOKIE, path="/")
    _set_session_cookie(redirect, account["user_id"], account["account_id"], request, "slack")
    return redirect


@app.get("/integrations/slack/start")
def integration_slack_start(
    request: Request,
    user: dict = Depends(require_role("admin")),
) -> RedirectResponse:
    client_id = os.environ.get("SLACK_OAUTH_CLIENT_ID")
    client_secret = os.environ.get("SLACK_OAUTH_CLIENT_SECRET")
    redirect_uri = os.environ.get("SLACK_OAUTH_REDIRECT_URI")
    if not client_id or not client_secret or not redirect_uri:
        raise HTTPException(404, "Slack integration is not configured on this server")

    state = secrets.token_urlsafe(24)
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": "incoming-webhook",
        "state": state,
    }
    redirect = RedirectResponse(f"https://slack.com/oauth/v2/authorize?{urllib.parse.urlencode(params)}")
    redirect.set_cookie(
        _SLACK_INTEGRATION_STATE_COOKIE,
        state,
        max_age=600,
        httponly=True,
        secure=_COOKIE_SECURE,
        samesite="lax",
        path="/",
    )
    return redirect


def _complete_slack_integration_oauth(
    request: Request,
    code: str | None,
    state: str | None,
    error: str | None,
    user: dict | None,
) -> RedirectResponse:
    base_url = _app_base_url(request)
    expected_state = request.cookies.get(_SLACK_INTEGRATION_STATE_COOKIE)
    redirect_uri = os.environ.get("SLACK_OAUTH_REDIRECT_URI") or f"{base_url}/api/auth/oauth/slack/callback"

    def _finish(query: str = "") -> RedirectResponse:
        response = RedirectResponse(f"{base_url}/dashboard/integrations{query}")
        response.delete_cookie(_SLACK_INTEGRATION_STATE_COOKIE, path="/")
        return response

    if error or not code or not expected_state or not secrets.compare_digest(state or "", expected_state) or not user:
        return _finish("?slack=failed")

    full_user = calls_db.get_user_by_id(user["user_id"])
    if full_user is None or calls_db.ROLE_RANK.get(full_user["role"], 0) < calls_db.ROLE_RANK["admin"]:
        return _finish("?slack=failed")

    client_id = os.environ.get("SLACK_OAUTH_CLIENT_ID")
    client_secret = os.environ.get("SLACK_OAUTH_CLIENT_SECRET")
    if not client_id or not client_secret:
        return _finish("?slack=failed")

    token_body = urllib.parse.urlencode(
        {
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
        }
    ).encode()
    try:
        token_req = urllib.request.Request(
            "https://slack.com/api/oauth.v2.access",
            data=token_body,
            method="POST",
            headers={"Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"},
        )
        with urllib.request.urlopen(token_req, timeout=10) as resp:
            token_data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            detail = e.read().decode()
        except Exception:
            detail = "<no body>"
        logger.error("Slack integration OAuth failed: HTTP %s %s - %s", e.code, e.reason, detail)
        return _finish("?slack=failed")
    except Exception:
        logger.exception("Slack integration OAuth failed")
        return _finish("?slack=failed")

    webhook = token_data.get("incoming_webhook") or {}
    webhook_url = (webhook.get("url") or "").strip()
    if not token_data.get("ok", False) or not webhook_url:
        logger.error("Slack integration OAuth returned no webhook: %s", token_data.get("error", "missing incoming_webhook"))
        return _finish("?slack=failed")

    channel = webhook.get("channel") or webhook.get("channel_name") or "Slack"
    team = token_data.get("team") or {}
    calls_db.update_integration(
        "slack",
        "connected",
        {
            "url": webhook_url,
            "channel": str(channel),
            "team": str(team.get("name") or ""),
            "teamId": str(team.get("id") or ""),
        },
        user["account_id"],
    )
    return _finish()


@app.get("/integrations/slack/callback")
def integration_slack_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    user: dict = Depends(require_role("admin")),
) -> RedirectResponse:
    return _complete_slack_integration_oauth(request, code, state, error, user)


_ZOHO_INTEGRATION_STATE_COOKIE = "vv_zoho_integration_state"


@app.get("/integrations/zoho_crm/start")
def integration_zoho_start(user: dict = Depends(require_role("admin"))) -> RedirectResponse:
    """A tenant admin connects Zoho CRM by logging into Zoho, not by pasting a
    webhook URL or API token — same shape as /integrations/slack/start."""
    client_id = os.environ.get("ZOHO_OAUTH_CLIENT_ID")
    client_secret = os.environ.get("ZOHO_OAUTH_CLIENT_SECRET")
    redirect_uri = os.environ.get("ZOHO_OAUTH_REDIRECT_URI")
    if not client_id or not client_secret or not redirect_uri:
        raise HTTPException(404, "Zoho integration is not configured on this server")
    accounts_base = os.environ.get("ZOHO_ACCOUNTS_BASE_URL", "https://accounts.zoho.com")
    state = secrets.token_urlsafe(24)
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        # CREATE lets us push a lead in; READ lets a future "test connection"
        # verify the token actually works against the tenant's own org.
        "scope": "ZohoCRM.modules.leads.CREATE,ZohoCRM.modules.leads.READ",
        "access_type": "offline",  # required to receive a refresh_token
        "prompt": "consent",  # forces a fresh refresh_token even on a re-connect
        "state": state,
    }
    redirect = RedirectResponse(f"{accounts_base}/oauth/v2/auth?{urllib.parse.urlencode(params)}")
    redirect.set_cookie(
        _ZOHO_INTEGRATION_STATE_COOKIE, state, max_age=600, httponly=True, secure=_COOKIE_SECURE, samesite="lax", path="/"
    )
    return redirect


@app.get("/auth/oauth/zoho/callback")
def auth_oauth_zoho_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    """Registered as this client's sole redirect_uri in Zoho's API Console —
    unlike Slack's callback, this only ever completes the integration-connect
    flow (there's no separate "log into Vistrow with Zoho" identity flow), so
    it doesn't need Slack's dual-dispatch. Reads the session cookie directly
    rather than via Depends(require_role) so a missing/expired session redirects
    back to the integrations page with an error instead of a bare 401."""
    base_url = _app_base_url(request)
    expected_state = request.cookies.get(_ZOHO_INTEGRATION_STATE_COOKIE)

    def _finish(query: str = "") -> RedirectResponse:
        response = RedirectResponse(f"{base_url}/dashboard/integrations{query}")
        response.delete_cookie(_ZOHO_INTEGRATION_STATE_COOKIE, path="/")
        return response

    session = auth.read_session_token(request.cookies.get(auth.COOKIE_NAME))
    if error or not code or not expected_state or not secrets.compare_digest(state or "", expected_state) or not session:
        return _finish("?zoho=failed")

    full_user = calls_db.get_user_by_id(session["uid"])
    if full_user is None or calls_db.ROLE_RANK.get(full_user["role"], 0) < calls_db.ROLE_RANK["admin"]:
        return _finish("?zoho=failed")

    client_id = os.environ.get("ZOHO_OAUTH_CLIENT_ID")
    client_secret = os.environ.get("ZOHO_OAUTH_CLIENT_SECRET")
    redirect_uri = os.environ.get("ZOHO_OAUTH_REDIRECT_URI")
    accounts_base = os.environ.get("ZOHO_ACCOUNTS_BASE_URL", "https://accounts.zoho.com")
    if not client_id or not client_secret or not redirect_uri:
        return _finish("?zoho=failed")

    token_body = urllib.parse.urlencode(
        {
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        }
    ).encode()
    try:
        token_req = urllib.request.Request(f"{accounts_base}/oauth/v2/token", data=token_body, method="POST")
        with urllib.request.urlopen(token_req, timeout=10) as resp:
            token_data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            detail = e.read().decode()
        except Exception:
            detail = "<no body>"
        logger.error("Zoho integration OAuth failed: HTTP %s %s - %s", e.code, e.reason, detail)
        return _finish("?zoho=failed")
    except Exception:
        logger.exception("Zoho integration OAuth failed")
        return _finish("?zoho=failed")

    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")
    # Zoho's accounts server tells us which regional CRM API host to call
    # (crm.zoho.com / crm.zoho.eu / crm.zoho.in / ...) - hardcoding one would
    # break for a tenant on a different data center than ours.
    api_domain = token_data.get("api_domain") or "https://www.zohoapis.com"
    if not access_token or not refresh_token:
        logger.error("Zoho integration OAuth returned no usable tokens: %s", token_data.get("error", "missing tokens"))
        return _finish("?zoho=failed")

    calls_db.update_integration(
        "zoho_crm",
        "connected",
        {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "api_domain": api_domain,
            "accounts_base": accounts_base,
            "expires_at": time.time() + float(token_data.get("expires_in") or 3600),
        },
        full_user["account_id"],
    )
    return _finish()


_FACEBOOK_INTEGRATION_STATE_COOKIE = "vv_facebook_integration_state"
_META_GRAPH_VERSION = "v25.0"  # v20.0 sunsets 2026-09-24; stay current explicitly rather than drift.


@app.get("/integrations/facebook/start")
def integration_facebook_start(user: dict = Depends(require_role("admin"))) -> RedirectResponse:
    """Same shape as Slack's start route: redirect to the provider's own
    OAuth screen, no form on our side. Scopes are the minimum Meta requires
    to list a Page and subscribe it to lead-gen events — pages_show_list to
    find it, leads_retrieval + pages_manage_metadata to read leads and
    subscribe the webhook, pages_read_engagement because Meta's own docs
    list it alongside leads_retrieval for this exact flow."""
    client_id = os.environ.get("META_OAUTH_CLIENT_ID")
    client_secret = os.environ.get("META_OAUTH_CLIENT_SECRET")
    redirect_uri = os.environ.get("META_OAUTH_REDIRECT_URI")
    if not client_id or not client_secret or not redirect_uri:
        raise HTTPException(404, "Facebook integration is not configured on this server")

    state = secrets.token_urlsafe(24)
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": "pages_show_list,pages_manage_metadata,pages_read_engagement,leads_retrieval",
        "state": state,
    }
    redirect = RedirectResponse(
        f"https://www.facebook.com/{_META_GRAPH_VERSION}/dialog/oauth?{urllib.parse.urlencode(params)}"
    )
    redirect.set_cookie(
        _FACEBOOK_INTEGRATION_STATE_COOKIE, state, max_age=600,
        httponly=True, secure=_COOKIE_SECURE, samesite="lax", path="/",
    )
    return redirect


@app.get("/integrations/facebook/callback")
def integration_facebook_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    user: dict = Depends(require_role("admin")),
) -> RedirectResponse:
    """Exchanges the code for a user token, lists the Pages this user
    manages, and auto-connects if there's exactly one. Deliberately refuses
    to guess when there's more than one — Business accounts running several
    Pages are common, and silently wiring leads from the wrong Page to the
    wrong campaign is worse than asking for help. Always subscribes the
    connected Page to the leadgen webhook field itself (not a separate
    manual step), so "Connected" here means leads actually flow, not just
    that a token is stored."""
    base_url = _app_base_url(request)

    def _finish(query: str = "") -> RedirectResponse:
        response = RedirectResponse(f"{base_url}/dashboard/integrations{query}")
        response.delete_cookie(_FACEBOOK_INTEGRATION_STATE_COOKIE, path="/")
        return response

    expected_state = request.cookies.get(_FACEBOOK_INTEGRATION_STATE_COOKIE)
    if error or not code or not expected_state or not secrets.compare_digest(state or "", expected_state):
        return _finish("?facebook=failed")

    client_id = os.environ.get("META_OAUTH_CLIENT_ID")
    client_secret = os.environ.get("META_OAUTH_CLIENT_SECRET")
    redirect_uri = os.environ.get("META_OAUTH_REDIRECT_URI")
    if not client_id or not client_secret or not redirect_uri:
        return _finish("?facebook=failed")

    try:
        token_params = urllib.parse.urlencode(
            {"client_id": client_id, "client_secret": client_secret, "redirect_uri": redirect_uri, "code": code}
        )
        with urllib.request.urlopen(
            f"https://graph.facebook.com/{_META_GRAPH_VERSION}/oauth/access_token?{token_params}", timeout=10
        ) as resp:
            user_token = json.loads(resp.read()).get("access_token")
        if not user_token:
            return _finish("?facebook=failed")

        pages_params = urllib.parse.urlencode({"access_token": user_token})
        with urllib.request.urlopen(
            f"https://graph.facebook.com/{_META_GRAPH_VERSION}/me/accounts?{pages_params}", timeout=10
        ) as resp:
            pages = json.loads(resp.read()).get("data") or []
    except Exception:
        logger.exception("Facebook integration OAuth failed")
        return _finish("?facebook=failed")

    if not pages:
        return _finish("?facebook=no_pages")
    if len(pages) > 1:
        return _finish("?facebook=multiple_pages")

    page = pages[0]
    page_id = str(page.get("id") or "")
    page_access_token = page.get("access_token") or ""
    if not page_id or not page_access_token:
        return _finish("?facebook=failed")

    try:
        subscribe_params = urllib.parse.urlencode(
            {"subscribed_fields": "leadgen", "access_token": page_access_token}
        ).encode()
        subscribe_req = urllib.request.Request(
            f"https://graph.facebook.com/{_META_GRAPH_VERSION}/{page_id}/subscribed_apps",
            data=subscribe_params, method="POST",
        )
        urllib.request.urlopen(subscribe_req, timeout=10)
    except Exception:
        logger.exception("Facebook page webhook subscription failed for page %s", page_id)
        return _finish("?facebook=subscribe_failed")

    calls_db.update_integration(
        "facebook", "connected",
        {"pageId": page_id, "pageName": str(page.get("name") or ""), "pageAccessToken": page_access_token},
        user["account_id"],
    )
    return _finish()


@app.get("/auth/oauth/github/start")
def auth_oauth_github_start(response: Response) -> RedirectResponse:
    client_id = os.environ.get("GITHUB_OAUTH_CLIENT_ID")
    redirect_uri = os.environ.get("GITHUB_OAUTH_REDIRECT_URI")
    if not client_id or not os.environ.get("GITHUB_OAUTH_CLIENT_SECRET") or not redirect_uri:
        raise HTTPException(404, "GitHub sign-in is not configured on this server")
    state = secrets.token_urlsafe(24)
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": "read:user user:email",
        "state": state,
    }
    redirect = RedirectResponse(f"https://github.com/login/oauth/authorize?{urllib.parse.urlencode(params)}")
    redirect.set_cookie(_OAUTH_STATE_COOKIE, state, max_age=600, httponly=True, secure=_COOKIE_SECURE, samesite="lax")
    return redirect


@app.get("/auth/oauth/github/callback")
def auth_oauth_github_callback(request: Request, code: str | None = None, state: str | None = None, error: str | None = None) -> RedirectResponse:
    base_url = _app_base_url(request)
    if error or not code:
        return RedirectResponse(f"{base_url}/login?error=oauth_failed")
    expected_state = request.cookies.get(_OAUTH_STATE_COOKIE)
    if not expected_state or state != expected_state:
        return RedirectResponse(f"{base_url}/login?error=oauth_failed")

    client_id = os.environ.get("GITHUB_OAUTH_CLIENT_ID")
    client_secret = os.environ.get("GITHUB_OAUTH_CLIENT_SECRET")
    redirect_uri = os.environ.get("GITHUB_OAUTH_REDIRECT_URI")
    if not client_id or not client_secret or not redirect_uri:
        return RedirectResponse(f"{base_url}/login?error=oauth_failed")
    token_body = urllib.parse.urlencode(
        {"code": code, "client_id": client_id, "client_secret": client_secret, "redirect_uri": redirect_uri}
    ).encode()
    try:
        token_req = urllib.request.Request(
            "https://github.com/login/oauth/access_token",
            data=token_body,
            method="POST",
            headers={"Accept": "application/json"},
        )
        with urllib.request.urlopen(token_req, timeout=10) as resp:
            token_data = json.loads(resp.read())
        access_token = token_data.get("access_token")
        if not access_token:
            logger.error("GitHub OAuth token exchange returned no access_token: %s", token_data)
            return RedirectResponse(f"{base_url}/login?error=oauth_failed")
        # GitHub's API requires a User-Agent on every request or it 403s.
        gh_headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.github+json",
            "User-Agent": "VistrowVoice",
        }
        user_req = urllib.request.Request("https://api.github.com/user", headers=gh_headers)
        with urllib.request.urlopen(user_req, timeout=10) as resp:
            gh_user = json.loads(resp.read())
        # A GitHub account's primary email is frequently private, so /user's
        # own "email" field is often null — /user/emails is the only reliable
        # source, and we specifically need the verified primary one.
        emails_req = urllib.request.Request("https://api.github.com/user/emails", headers=gh_headers)
        with urllib.request.urlopen(emails_req, timeout=10) as resp:
            gh_emails = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            detail = e.read().decode()
        except Exception:
            detail = "<no body>"
        logger.error("GitHub OAuth exchange failed: HTTP %s %s — %s", e.code, e.reason, detail)
        return RedirectResponse(f"{base_url}/login?error=oauth_failed")
    except Exception:
        logger.exception("GitHub OAuth exchange failed")
        return RedirectResponse(f"{base_url}/login?error=oauth_failed")

    primary = next((e for e in gh_emails if e.get("primary") and e.get("verified")), None)
    if primary is None:
        return RedirectResponse(f"{base_url}/login?error=oauth_unverified_email")

    account = _oauth_or_create_user(primary["email"], gh_user.get("name") or gh_user.get("login") or "", provider="github")
    redirect = RedirectResponse(f"{base_url}/dashboard")
    redirect.delete_cookie(_OAUTH_STATE_COOKIE, path="/")
    _set_session_cookie(redirect, account["user_id"], account["account_id"], request, "github")
    return redirect


@app.post("/auth/signup")
def auth_signup(req: SignupRequest, request: Request) -> dict:
    if _auth_rate_limited(_client_ip(request)):
        raise HTTPException(429, "Too many attempts — please wait a minute and try again.")
    email = req.email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(400, "Enter a valid email address")
    if len(req.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    if not req.name.strip() or not req.company.strip():
        raise HTTPException(400, "Name and company are required")
    if disposable_email.is_disposable(email):
        raise HTTPException(400, "Please use a permanent email address — temporary email providers are not supported")
    if not email_sender.is_configured():
        raise HTTPException(503, "Email verification is temporarily unavailable. Please try again shortly")
    if calls_db.email_exists(email):
        raise HTTPException(409, "An account with this email already exists")
    created = calls_db.create_account_with_owner(
        req.company.strip(),
        req.name.strip(),
        email,
        auth.hash_password(req.password),
        req.referral_source.strip(),
        req.phone.strip(),
    )
    code, _ = calls_db.create_email_verification(created["user_id"])
    if code is None:
        raise HTTPException(429, "Please wait before requesting another code")
    user = calls_db.get_user_by_email(email)
    html = email_sender.render_email(
        preheader="Verify your Vistrow Voice email",
        heading="Verify your email",
        body_html=(
            f"Hi {user['name'] if user else req.name.strip()}, use this code to finish creating your account: "
            f"<div style='margin:24px 0;padding:18px 16px;border:1px solid #e4d5fa;border-radius:12px;"
            f"background:#faf7ff;text-align:center;font-size:34px;font-weight:800;letter-spacing:9px;color:#7c3aed;'>{code}</div>"
            "This code expires in 10 minutes. If you did not start this signup, you can ignore this email."
        ),
    )
    email_sent = email_sender.send_email(
        email,
        f"{code} is your Vistrow Voice verification code",
        html,
        email_sender.FROM_EMAIL_VERIFICATION,
    )
    logger.info("new signup: account #%s (%s)", created["account_id"], email)
    return {
        "ok": True,
        "verificationRequired": True,
        "email": email,
        "emailSent": email_sent,
        "resendAfter": 60,
    }


@app.post("/auth/verify-email")
def auth_verify_email(req: VerifyEmailRequest, response: Response, request: Request) -> dict:
    email = req.email.strip().lower()
    code = re.sub(r"\D", "", req.code)
    if len(code) != 6:
        raise HTTPException(400, "Enter the 6-digit verification code")
    user_id = calls_db.consume_email_verification(email, code)
    if user_id is None:
        raise HTTPException(400, "That code is incorrect, expired, or has been used")
    user = calls_db.get_user_by_id(user_id)
    if user is None:
        raise HTTPException(400, "This account is no longer available")
    _set_session_cookie(response, user_id, user["account_id"], request, "password")
    calls_db.record_login(user_id, "password")
    calls_db.record_security_event(user_id, "email_verified")
    return {"ok": True, "user": _me_payload(user_id)}


@app.post("/auth/resend-email-verification")
def auth_resend_email_verification(req: ResendEmailVerificationRequest) -> dict:
    # Generic success shape prevents using this endpoint to enumerate users.
    email = req.email.strip().lower()
    user = calls_db.get_user_by_email(email)
    if user is None or user.get("email_verified_at"):
        return {"ok": True, "resendAfter": 60}
    code, retry_after = calls_db.create_email_verification(user["id"])
    if code is None:
        raise HTTPException(429, f"Please wait {retry_after} seconds before requesting another code")
    html = email_sender.render_email(
        preheader="Your new Vistrow Voice verification code",
        heading="Verify your email",
        body_html=(
            f"Hi {user['name']}, your new verification code is: "
            f"<div style='margin:24px 0;padding:18px 16px;border:1px solid #e4d5fa;border-radius:12px;"
            f"background:#faf7ff;text-align:center;font-size:34px;font-weight:800;letter-spacing:9px;color:#7c3aed;'>{code}</div>"
            "This code expires in 10 minutes."
        ),
    )
    if not email_sender.send_email(email, f"{code} is your Vistrow Voice verification code", html, email_sender.FROM_EMAIL_VERIFICATION):
        raise HTTPException(503, "We could not send the verification email. Please try again")
    return {"ok": True, "resendAfter": retry_after}


@app.post("/auth/login")
def auth_login(req: LoginRequest, response: Response, request: Request) -> dict:
    if _auth_rate_limited(_client_ip(request)):
        raise HTTPException(429, "Too many attempts — please wait a minute and try again.")
    user = calls_db.get_user_by_email(req.email.strip().lower())
    if user is None or not auth.verify_password(req.password, user["password_hash"]):
        # Same message either way — don't reveal which emails are registered.
        raise HTTPException(401, "Incorrect email or password")
    if not user.get("email_verified_at"):
        raise HTTPException(403, "Verify your email before signing in. You can request a new code from the verification page")
    _set_session_cookie(response, user["id"], user["account_id"], request, "password")
    calls_db.record_login(user["id"])
    return {"ok": True, "user": _me_payload(user["id"])}


class ContactRequest(BaseModel):
    name: str
    email: str
    phone: str = ""
    company: str = ""
    team_size: str = ""
    call_volume: str = ""
    timeline: str = ""
    use_case: str = ""
    # Honeypot: a field real visitors never see or fill (hidden off-screen in
    # the form, not just display:none — some bots skip display:none fields).
    # Any value here means a bot filled every input blindly. Silently accept
    # rather than 400, so a bot never learns which signal gave it away.
    hp: str = ""


@app.post("/public/contact")
def public_contact(req: ContactRequest) -> dict:
    """The marketing site's "Book a Demo" form (web-demo/src/pages/marketing/
    Contact.tsx) — unauthenticated, no per-tenant account involved, just a
    prospective customer reaching the Vistrow Voice team directly. Notifies
    the team by email rather than writing to any per-tenant table (this isn't
    a lead for an account's own CRM, it's a lead for Vistrow itself)."""
    if req.hp.strip():
        return {"ok": True}
    name = req.name.strip()
    email = req.email.strip().lower()
    if not name or "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(400, "Enter a valid name and email address")
    notify_to = os.environ.get("SALES_NOTIFY_EMAIL") or "vistrowai@gmail.com"
    # Call volume and timeline are the two fields that actually let sales
    # prioritize a queue of inbound leads (a 10k-calls/month "start
    # immediately" lead and a 50-calls/month "just researching" one need very
    # different follow-up speed) - phone number lets sales call back directly
    # for a calling product, rather than starting the relationship over email.
    details = "".join(
        f"<p style='margin:4px 0;'><strong>{label}:</strong> {value}</p>"
        for label, value in [
            ("Name", name),
            ("Email", email),
            ("Phone", req.phone.strip() or "-"),
            ("Company", req.company.strip() or "-"),
            ("Team size", req.team_size.strip() or "-"),
            ("Monthly call volume", req.call_volume.strip() or "-"),
            ("Timeline", req.timeline.strip() or "-"),
            ("Use case", req.use_case.strip() or "-"),
        ]
    )
    html = email_sender.render_email(
        preheader=f"New demo request from {name}",
        heading="New demo request",
        body_html=details,
    )
    sent = email_sender.send_email(notify_to, f"New demo request: {name}", html, email_sender.FROM_WEBSITE)
    if not sent:
        # Same "never crash on email failure" contract as password reset —
        # but this lead has nowhere else to land, so log it in full rather
        # than just the fact that sending failed.
        logger.info("demo request (email not configured/failed): %r", req.model_dump())
    return {"ok": True}


class RequestResetRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    password: str


def _app_base_url(request: Request) -> str:
    """Where the frontend lives, for building links in emails. APP_BASE_URL
    wins; otherwise fall back to the request's own origin."""
    base = os.environ.get("APP_BASE_URL")
    if base:
        return base.rstrip("/")
    origin = request.headers.get("origin")
    if origin:
        return origin.rstrip("/")
    return str(request.base_url).rstrip("/")


@app.post("/auth/request-password-reset")
def auth_request_password_reset(req: RequestResetRequest, request: Request) -> dict:
    if _auth_rate_limited(_client_ip(request)):
        raise HTTPException(429, "Too many attempts — please wait a minute and try again.")
    # Always report success — never reveal whether an email is registered.
    user = calls_db.get_user_by_email(req.email.strip().lower())
    if user is not None:
        token = calls_db.create_password_reset(user["id"])
        link = f"{_app_base_url(request)}/reset-password?token={token}"
        html = email_sender.render_email(
            preheader="Reset your Vistrow Voice password",
            heading="Reset your password",
            body_html=(
                f"Hi {user['name']}, we received a request to reset your Vistrow Voice password. "
                "Click below to choose a new one — this link is valid for 1 hour. "
                "If you didn't request this, you can safely ignore this email."
            ),
            cta_label="Reset password",
            cta_url=link,
        )
        sent = email_sender.send_email(user["email"], "Reset your Vistrow Voice password", html, email_sender.FROM_ACCOUNT_SECURITY)
        if not sent:
            # Email delivery isn't set up yet — surface the link in the server
            # log so the operator can still complete a reset during setup.
            logger.info("password reset link for %s (email not configured): %s", user["email"], link)
    return {"ok": True}


@app.post("/auth/reset-password")
def auth_reset_password(req: ResetPasswordRequest, response: Response, request: Request) -> dict:
    if len(req.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    user_id = calls_db.consume_password_reset(req.token)
    if user_id is None:
        raise HTTPException(400, "This reset link is invalid or has expired")
    calls_db.update_user_profile(user_id, password_hash=auth.hash_password(req.password))
    calls_db.invalidate_other_sessions(user_id)
    calls_db.record_security_event(user_id, "password_reset")
    # Log them straight in on success.
    user = calls_db.get_user_by_id(user_id)
    if user is not None:
        _set_session_cookie(response, user["id"], user["account_id"], request, "password")
        return {"ok": True, "user": _me_payload(user_id)}
    return {"ok": True}


@app.post("/auth/logout")
def auth_logout(request: Request, response: Response) -> dict:
    session = auth.read_session_token(request.cookies.get(auth.COOKIE_NAME))
    if session and session.get("sid"):
        calls_db.revoke_user_session(session["sid"], session["uid"])
    response.delete_cookie(auth.COOKIE_NAME, path="/")
    return {"ok": True}


@app.get("/invite/{token}")
def get_invite(token: str) -> dict:
    """Public preview so the accept page can greet the invitee by name/org
    before asking them to set a password — no auth required, matches
    /auth/reset-password's own token-in-URL pattern."""
    invite = calls_db.get_invite_by_token(token)
    if invite is None:
        raise HTTPException(404, "This invite link is invalid or has expired")
    return {
        "email": invite["email"],
        "name": invite["name"],
        "role": invite["role"],
        "accountName": invite["account_name"],
    }


class AcceptInviteRequest(BaseModel):
    token: str
    password: str


@app.post("/invite/accept")
def accept_invite(req: AcceptInviteRequest, response: Response, request: Request) -> dict:
    if len(req.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    invite = calls_db.get_invite_by_token(req.token)
    if invite is None:
        raise HTTPException(400, "This invite link is invalid or has expired")
    if calls_db.email_exists(invite["email"]):
        raise HTTPException(409, "An account with this email already exists — sign in instead")
    result = calls_db.accept_invite(invite["id"], auth.hash_password(req.password))
    _set_session_cookie(response, result["user_id"], result["account_id"], request, "password")
    calls_db.record_login(result["user_id"], "password")
    return {"ok": True, "user": _me_payload(result["user_id"])}


@app.get("/auth/me")
def auth_me(request: Request, response: Response) -> dict:
    session = auth.read_session_token(request.cookies.get(auth.COOKIE_NAME))
    if session is None:
        raise HTTPException(401, "Not authenticated")
    profile = calls_db.get_user_by_id(session["uid"])
    if profile is None or int(profile.get("session_version") or 1) != int(session.get("sv") or 1):
        raise HTTPException(401, "Session expired — please sign in again")
    if session.get("sid"):
        if not calls_db.validate_user_session(session["sid"], session["uid"]):
            raise HTTPException(401, "This device was signed out")
    else:
        # Transparently upgrade pre-device-management cookies after deploy.
        _set_session_cookie(response, session["uid"], session["aid"], request)
    return {"user": _me_payload(session["uid"], session.get("imp"))}


class UpdateProfileRequest(BaseModel):
    name: str | None = None
    phone: str | None = None
    currentPassword: str | None = None
    newPassword: str | None = None


@app.patch("/profile")
def update_profile(req: UpdateProfileRequest, response: Response, request: Request, user: dict = Depends(current_user)) -> dict:
    name = req.name.strip() if req.name is not None else None
    if name is not None and not name:
        raise HTTPException(400, "Name can't be empty")
    phone = req.phone.strip() if req.phone is not None else None
    if phone:
        phone = re.sub(r"[\s().-]", "", phone)
        if not re.fullmatch(r"\+?\d{7,15}", phone):
            raise HTTPException(400, "Enter a valid phone number with country code")

    password_hash = None
    if req.newPassword is not None:
        if len(req.newPassword) < 8:
            raise HTTPException(400, "New password must be at least 8 characters")
        profile = calls_db.get_user_by_id(user["user_id"])
        if profile is None:
            raise HTTPException(404, "Account not found")
        # OAuth users have no password they could possibly know. Their first
        # password is created from an authenticated Settings session; later
        # changes still require the current password.
        if profile.get("password_set", True):
            stored_hash = calls_db.get_password_hash(user["user_id"])
            if stored_hash is None or not req.currentPassword or not auth.verify_password(req.currentPassword, stored_hash):
                raise HTTPException(401, "Current password is incorrect")
        password_hash = auth.hash_password(req.newPassword)

    calls_db.update_user_profile(
        user["user_id"], name=name, phone=phone, password_hash=password_hash,
        password_set=True if password_hash is not None else None,
    )
    if password_hash is not None:
        calls_db.invalidate_other_sessions(user["user_id"])
        calls_db.record_security_event(user["user_id"], "password_changed")
        _set_session_cookie(response, user["user_id"], user["account_id"], request, "password")
    return {"user": _me_payload(user["user_id"])}


@app.post("/profile/avatar")
async def update_profile_avatar(
    image: UploadFile = File(...), user: dict = Depends(current_user)
) -> dict:
    """Persist a small, private avatar in durable object storage. Railway's
    container filesystem is ephemeral, so profile photos must never live in
    /app/static in production."""
    allowed = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
    suffix = allowed.get(image.content_type or "")
    if suffix is None:
        raise HTTPException(400, "Use a JPG, PNG, or WebP image")
    data = await image.read()
    if not data or len(data) > 2 * 1024 * 1024:
        raise HTTPException(400, "Profile image must be smaller than 2 MB")
    client, bucket = _b2_client()
    if client is None or bucket is None:
        raise HTTPException(503, "Profile photo storage is not configured")
    old_key = calls_db.get_user_avatar_key(user["user_id"])
    object_key = f"profile-avatars/{user['user_id']}/{secrets.token_urlsafe(12)}.{suffix}"
    try:
        client.put_object(Bucket=bucket, Key=object_key, Body=data, ContentType=image.content_type)
        calls_db.update_user_profile(user["user_id"], avatar_url=object_key)
        if old_key:
            try:
                client.delete_object(Bucket=bucket, Key=old_key)
            except Exception:
                logger.warning("Could not remove superseded profile avatar for user %s", user["user_id"])
    except Exception:
        logger.exception("Profile avatar upload failed")
        raise HTTPException(502, "Could not store profile photo")
    return {"user": _me_payload(user["user_id"])}


@app.get("/profile/avatar")
def get_profile_avatar(user: dict = Depends(current_user)) -> StreamingResponse:
    key = calls_db.get_user_avatar_key(user["user_id"])
    if not key:
        raise HTTPException(404, "No profile photo")
    client, bucket = _b2_client()
    if client is None or bucket is None:
        raise HTTPException(503, "Profile photo storage is not configured")
    try:
        obj = client.get_object(Bucket=bucket, Key=key)
        return StreamingResponse(
            obj["Body"].iter_chunks(),
            media_type=obj.get("ContentType") or "image/jpeg",
            headers={"Cache-Control": "private, max-age=300"},
        )
    except Exception:
        logger.exception("Profile avatar read failed")
        raise HTTPException(404, "Profile photo not found")


@app.delete("/profile/avatar")
def delete_profile_avatar(user: dict = Depends(current_user)) -> dict:
    key = calls_db.get_user_avatar_key(user["user_id"])
    if key:
        client, bucket = _b2_client()
        if client is not None and bucket is not None:
            try:
                client.delete_object(Bucket=bucket, Key=key)
            except Exception:
                logger.warning("Could not remove profile avatar for user %s", user["user_id"])
    calls_db.update_user_profile(user["user_id"], avatar_url="")
    calls_db.record_security_event(user["user_id"], "profile_photo_removed")
    return {"user": _me_payload(user["user_id"])}


class UpdateAccountRequest(BaseModel):
    name: str


@app.patch("/account")
def update_account(req: UpdateAccountRequest, user: dict = Depends(current_user)) -> dict:
    name = req.name.strip()
    if not name:
        raise HTTPException(400, "Company name can't be empty")
    calls_db.update_account(user["account_id"], name=name)
    return {"user": _me_payload(user["user_id"])}


class EmailChangeRequest(BaseModel):
    email: str


@app.post("/profile/request-email-change")
def request_email_change(req: EmailChangeRequest, request: Request, user: dict = Depends(current_user)) -> dict:
    new_email = req.email.strip().lower()
    if "@" not in new_email or "." not in new_email.rsplit("@", 1)[-1]:
        raise HTTPException(400, "Enter a valid email address")
    profile = calls_db.get_user_by_id(user["user_id"])
    if profile is None:
        raise HTTPException(404, "Account not found")
    if new_email == profile["email"].lower():
        raise HTTPException(400, "That is already your sign-in email")
    if calls_db.email_exists(new_email):
        raise HTTPException(409, "An account already uses that email address")
    # A passwordless OAuth account cannot safely move its identity away from
    # the provider email. Ask it to create a password first, then it can use
    # email sign-in even if the provider identity remains unchanged.
    if not profile.get("password_set", True):
        raise HTTPException(400, "Create a password first, then change your sign-in email")
    token = calls_db.create_email_change_request(user["user_id"], new_email)
    link = f"{_app_base_url(request)}/confirm-email-change?token={token}"
    html = email_sender.render_email(
        preheader="Confirm your new Vistrow Voice sign-in email",
        heading="Confirm your new email",
        body_html=(
            f"Hi {profile['name']}, confirm <b>{new_email}</b> as your new Vistrow Voice sign-in email. "
            "This link is valid for one hour. If you did not request this change, you can ignore this email."
        ),
        cta_label="Confirm new email",
        cta_url=link,
    )
    email_sender.send_email(new_email, "Confirm your new Vistrow Voice email", html, email_sender.FROM_ACCOUNT_SECURITY)
    calls_db.record_security_event(user["user_id"], "email_change_requested", user_agent=request.headers.get("user-agent", ""))
    return {"ok": True}


@app.get("/auth/confirm-email-change")
def confirm_email_change(token: str, response: Response, request: Request) -> dict:
    result = calls_db.consume_email_change_request(token)
    if result is None:
        raise HTTPException(400, "This email-change link is invalid or has expired")
    user_id, email = result
    if calls_db.email_exists(email):
        raise HTTPException(409, "An account already uses that email address")
    profile = calls_db.get_user_by_id(user_id)
    if profile is None:
        raise HTTPException(404, "Account not found")
    calls_db.update_user_email(user_id, email)
    calls_db.invalidate_other_sessions(user_id)
    calls_db.record_security_event(user_id, "email_changed")
    _set_session_cookie(response, user_id, profile["account_id"], request)
    return {"ok": True, "user": _me_payload(user_id)}


class PreferencesRequest(BaseModel):
    timezone: str | None = None
    language: str | None = None
    notify_leads: bool | None = None
    notify_calls: bool | None = None
    notify_billing: bool | None = None
    notify_product: bool | None = None
    dashboard_checklist_dismissed: bool | None = None
    dashboard_hidden_cards: str | None = None


@app.get("/profile/preferences")
def get_profile_preferences(user: dict = Depends(current_user)) -> dict:
    return calls_db.get_user_preferences(user["user_id"])


@app.patch("/profile/preferences")
def update_profile_preferences(req: PreferencesRequest, user: dict = Depends(current_user)) -> dict:
    values = req.model_dump(exclude_none=True)
    if values.get("language") not in (None, "en", "hi"):
        raise HTTPException(400, "Unsupported language")
    if values.get("timezone") and "/" not in values["timezone"] and values["timezone"] != "UTC":
        raise HTTPException(400, "Use a valid IANA timezone")
    if "dashboard_hidden_cards" in values:
        try:
            hidden_cards = json.loads(values["dashboard_hidden_cards"])
        except (TypeError, ValueError):
            raise HTTPException(400, "Dashboard card preferences must be a JSON list")
        allowed_cards = {"attention", "quick_actions", "funnel", "followups", "appointments", "channels", "feedback"}
        if not isinstance(hidden_cards, list) or len(hidden_cards) > len(allowed_cards) or any(card not in allowed_cards for card in hidden_cards):
            raise HTTPException(400, "Unknown dashboard card preference")
        values["dashboard_hidden_cards"] = json.dumps(list(dict.fromkeys(hidden_cards)))
    return calls_db.update_user_preferences(user["user_id"], values)


@app.get("/profile/security-events")
def profile_security_events(user: dict = Depends(current_user)) -> list[dict]:
    return calls_db.list_security_events(user["user_id"])


def _device_summary(user_agent: str) -> dict:
    ua = user_agent or ""
    if "Edg/" in ua:
        browser = "Microsoft Edge"
    elif "OPR/" in ua or "Opera" in ua:
        browser = "Opera"
    elif "Firefox/" in ua or "FxiOS/" in ua:
        browser = "Firefox"
    elif "Chrome/" in ua or "CriOS/" in ua:
        browser = "Chrome"
    elif "Safari/" in ua:
        browser = "Safari"
    else:
        browser = "Web browser"

    if "Android" in ua:
        operating_system = "Android"
    elif "iPhone" in ua:
        operating_system = "iPhone"
    elif "iPad" in ua:
        operating_system = "iPad"
    elif "Windows" in ua:
        operating_system = "Windows"
    elif "Mac OS X" in ua or "Macintosh" in ua:
        operating_system = "macOS"
    elif "Linux" in ua:
        operating_system = "Linux"
    else:
        operating_system = "Unknown device"

    if "iPad" in ua or "Tablet" in ua:
        device_type = "tablet"
    elif any(marker in ua for marker in ("Mobile", "Android", "iPhone")):
        device_type = "mobile"
    else:
        device_type = "desktop"
    return {"browser": browser, "operatingSystem": operating_system, "deviceType": device_type}


@app.get("/profile/devices")
def profile_devices(request: Request, response: Response, user: dict = Depends(current_user)) -> dict:
    session = auth.read_session_token(request.cookies.get(auth.COOKIE_NAME))
    current_session_id = session.get("sid") if session else None
    if not current_session_id:
        current_session_id = _set_session_cookie(response, user["user_id"], user["account_id"], request)

    # Several sign-ins from one browser intentionally collapse into one device.
    grouped: dict[str, dict] = {}
    for row in calls_db.list_user_sessions(user["user_id"]):
        device_id = row["device_id"]
        existing = grouped.get(device_id)
        is_current = row["id"] == current_session_id
        if existing is None:
            grouped[device_id] = {
                "id": device_id,
                **_device_summary(row.get("user_agent") or ""),
                "provider": row.get("provider") or "",
                "firstSignedInAt": row["created_at"],
                "lastActiveAt": row["last_seen_at"],
                "current": is_current,
            }
        else:
            existing["current"] = existing["current"] or is_current
            if row["created_at"] < existing["firstSignedInAt"]:
                existing["firstSignedInAt"] = row["created_at"]
    devices = sorted(grouped.values(), key=lambda item: item["lastActiveAt"], reverse=True)
    devices.sort(key=lambda item: item["current"], reverse=True)
    return {"devices": devices}


@app.delete("/profile/devices/{device_id}")
def sign_out_device(device_id: str, request: Request, response: Response, user: dict = Depends(current_user)) -> dict:
    if not re.fullmatch(r"[A-Za-z0-9_-]{20,160}", device_id):
        raise HTTPException(400, "Invalid device")
    session = auth.read_session_token(request.cookies.get(auth.COOKIE_NAME))
    rows = calls_db.list_user_sessions(user["user_id"])
    current_device_id = next((row["device_id"] for row in rows if session and row["id"] == session.get("sid")), None)
    if not calls_db.revoke_device_sessions(user["user_id"], device_id):
        raise HTTPException(404, "Device is no longer signed in")
    calls_db.record_security_event(user["user_id"], "device_signed_out")
    signed_out_current = device_id == current_device_id
    if signed_out_current:
        response.delete_cookie(auth.COOKIE_NAME, path="/")
    return {"ok": True, "signedOutCurrent": signed_out_current}


@app.post("/profile/sign-out-others")
def sign_out_other_sessions(response: Response, request: Request, user: dict = Depends(current_user)) -> dict:
    calls_db.invalidate_other_sessions(user["user_id"])
    calls_db.record_security_event(user["user_id"], "signed_out_other_sessions", user_agent=request.headers.get("user-agent", ""))
    _set_session_cookie(response, user["user_id"], user["account_id"], request)
    return {"ok": True, "user": _me_payload(user["user_id"])}


@app.post("/profile/request-data-export")
def request_data_export(user: dict = Depends(current_user)) -> StreamingResponse:
    profile = calls_db.get_user_by_id(user["user_id"])
    if profile is None:
        raise HTTPException(404, "Account not found")
    export = {
        "exportedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "profile": {
            "name": profile["name"],
            "email": profile["email"],
            "phone": profile.get("phone") or "",
            "role": profile["role"],
            "workspace": profile["account_name"],
            "plan": profile["account_plan"],
        },
        "preferences": calls_db.get_user_preferences(user["user_id"]),
        "securityEvents": calls_db.list_security_events(user["user_id"], 100),
    }
    # Shared customer/call data belongs to the tenant, not every individual
    # user. Only workspace admins may export that scope; members and viewers
    # receive their own profile/preferences/security data.
    if profile["role"] in ("owner", "admin"):
        export["workspaceData"] = {
            "agents": calls_db.list_agents(user["account_id"]),
            "calls": calls_db.list_calls(user["account_id"], limit=10000),
            "contacts": calls_db.list_contacts(user["account_id"]),
            "appointments": calls_db.list_appointments(user["account_id"]),
            "knowledgeBases": calls_db.list_knowledge_bases(user["account_id"]),
            "integrations": [
                {k: v for k, v in item.items() if k != "config"}
                for item in calls_db.list_integrations(user["account_id"])
            ],
            "billing": calls_db.billing_summary(user["account_id"]),
        }
    calls_db.create_privacy_request(user["user_id"], user["account_id"], "export", status="completed")
    calls_db.record_security_event(user["user_id"], "data_export_requested")
    content = json.dumps(export, ensure_ascii=False, indent=2, default=str).encode("utf-8")
    filename = f"vistrow-voice-data-{time.strftime('%Y-%m-%d')}.json"
    return StreamingResponse(
        iter([content]),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


class AccountDeletionRequest(BaseModel):
    email: str
    confirmation: str


@app.get("/profile/privacy-requests")
def profile_privacy_requests(user: dict = Depends(current_user)) -> dict:
    return {"requests": calls_db.list_user_privacy_requests(user["user_id"])}


@app.post("/profile/request-account-deletion")
def request_account_deletion(req: AccountDeletionRequest, user: dict = Depends(current_user)) -> dict:
    profile = calls_db.get_user_by_id(user["user_id"])
    if profile is None:
        raise HTTPException(404, "Account not found")
    if req.email.strip().lower() != profile["email"].lower() or req.confirmation.strip() != "DELETE":
        raise HTTPException(400, "Enter your sign-in email and type DELETE to confirm")
    if profile:
        html = email_sender.render_email(
            preheader="Vistrow Voice account deletion request",
            heading="Account deletion request received",
            body_html="We received your request. For security, our team will verify ownership before any account or workspace data is deleted. Our privacy team will review this request within 2 business days.",
        )
        email_sender.send_email(profile["email"], "Vistrow Voice account deletion request", html, email_sender.FROM_ACCOUNT_SECURITY)
    calls_db.record_security_event(user["user_id"], "account_deletion_requested")
    request_row = calls_db.create_privacy_request(user["user_id"], user["account_id"], "deletion")
    return {"ok": True, "requestId": request_row["id"], "status": request_row["status"]}


@app.delete("/profile/account-deletion-request/{request_id}")
def cancel_account_deletion_request(request_id: int, user: dict = Depends(current_user)) -> dict:
    request_row = calls_db.cancel_privacy_request(request_id, user["user_id"])
    if request_row is None:
        raise HTTPException(404, "Deletion request not found")
    if request_row["status"] != "cancelled":
        raise HTTPException(409, "This request is already being processed and can no longer be cancelled here")
    calls_db.record_security_event(user["user_id"], "account_deletion_cancelled")
    return {"ok": True, "request": request_row}


@app.post("/onboarding/consent")
def accept_consent(data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    """One combined Terms/Privacy acceptance shown at signup, before the rest
    of onboarding — matches how consumer products actually do this (nobody
    reads five separate consent boxes), but the frontend must send back the
    exact version string it displayed, so a stale client can never silently
    record acceptance of text the user didn't see."""
    version = str((data or {}).get("version") or "")
    if version != calls_db.CONSENT_VERSION:
        raise HTTPException(409, "This consent version is out of date - please refresh and try again.")
    calls_db.record_consent(user["account_id"], user["user_id"])
    return {"user": _me_payload(user["user_id"])}


@app.post("/onboarding/complete")
def complete_onboarding(user: dict = Depends(current_user)) -> dict:
    calls_db.mark_account_onboarded(user["account_id"])
    return {"user": _me_payload(user["user_id"])}


@app.post("/tour/complete")
def complete_tour(user: dict = Depends(current_user)) -> dict:
    calls_db.mark_user_tour_complete(user["user_id"])
    return {"user": _me_payload(user["user_id"])}


# --------------------------------------------------------------- api keys


class CreateApiKeyRequest(BaseModel):
    name: str = "API key"


@app.get("/api-keys")
def list_api_keys(user: dict = Depends(current_user)) -> list[dict]:
    return calls_db.list_api_keys(user["account_id"])


@app.post("/api-keys")
def create_api_key(req: CreateApiKeyRequest, user: dict = Depends(require_role("admin"))) -> dict:
    # Full API access via a key is an admin-level grant. Returns the full key
    # exactly once; the client must copy it immediately.
    return calls_db.create_api_key(user["account_id"], req.name)


@app.delete("/api-keys/{key_id}")
def delete_api_key(key_id: int, user: dict = Depends(require_role("admin"))) -> dict:
    calls_db.delete_api_key(key_id, user["account_id"])
    return {"ok": True}


# -------------------------------------------------------------- team & invites


class InviteMemberRequest(BaseModel):
    email: str
    name: str
    role: str = "member"


@app.get("/team/members")
def team_members(user: dict = Depends(current_user)) -> list[dict]:
    return calls_db.list_team_members(user["account_id"])


@app.get("/team/invites")
def team_invites(user: dict = Depends(require_role("admin"))) -> list[dict]:
    return calls_db.list_invites(user["account_id"])


@app.post("/team/invite")
def team_invite(req: InviteMemberRequest, request: Request, user: dict = Depends(require_role("admin"))) -> dict:
    email = req.email.strip().lower()
    name = req.name.strip()
    role = req.role if req.role in ("admin", "member", "viewer") else "member"
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(400, "Enter a valid email address")
    if not name:
        raise HTTPException(400, "Name is required")
    if calls_db.email_exists(email):
        raise HTTPException(409, "A user with this email already exists")
    inviter = calls_db.get_user_by_id(user["user_id"])
    invite = calls_db.create_invite(user["account_id"], email, name, role, user["user_id"])
    link = f"{_app_base_url(request)}/invite/{invite['token']}"
    html = email_sender.render_email(
        preheader=f"{inviter['name']} invited you to join {inviter['account_name']} on Vistrow Voice",
        heading="You're invited",
        body_html=(
            f"Hi {name}, {inviter['name']} invited you to join "
            f"<strong style=\"color:{email_sender.TEXT}\">{inviter['account_name']}</strong> on Vistrow Voice as "
            f"a <strong style=\"color:{email_sender.TEXT}\">{role}</strong>. This invite is valid for 7 days."
        ),
        cta_label="Accept invite",
        cta_url=link,
    )
    sent = email_sender.send_email(email, f"You're invited to join {inviter['account_name']} on Vistrow Voice", html, email_sender.FROM_INVITES)
    if not sent:
        logger.info("invite link for %s (email not configured): %s", email, link)
    return {"ok": True, "emailSent": sent, "inviteLink": link}


@app.post("/team/invites/{invite_id}/revoke")
def team_revoke_invite(invite_id: int, user: dict = Depends(require_role("admin"))) -> dict:
    calls_db.revoke_invite(user["account_id"], invite_id)
    return {"ok": True}


class UpdateMemberRoleRequest(BaseModel):
    role: str


@app.patch("/team/members/{member_id}")
def team_update_role(member_id: int, req: UpdateMemberRoleRequest, user: dict = Depends(require_role("admin"))) -> dict:
    try:
        calls_db.update_member_role(user["account_id"], member_id, req.role)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True}


@app.delete("/team/members/{member_id}")
def team_remove_member(member_id: int, user: dict = Depends(require_role("admin"))) -> dict:
    try:
        calls_db.remove_team_member(user["account_id"], member_id)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True}


@app.get("/active-calls")
async def list_active_calls(user: dict = Depends(current_user)) -> list[dict]:
    """List rooms currently live on the LiveKit server, one entry per visitor,
    scoped to the caller's tenant.

    Reflects real in-progress sessions (not mock data) by asking the LiveKit
    server directly, then pulling the agent's `lk.agent.state` attribute to
    report whether it's listening, thinking, or speaking. LiveKit has no
    concept of tenants, so each room's metadata (stamped at creation with
    {"agent_id": ...}) is used to look up which account's agent is handling
    it — rooms whose agent doesn't belong to the caller's account are
    dropped, and rooms with no agent_id (predate per-tenant metadata) are
    dropped too rather than risk showing another tenant's live call.
    """
    lkapi = api.LiveKitAPI()
    try:
        rooms = await lkapi.room.list_rooms(ListRoomsRequest())
        calls = []
        for room in rooms.rooms:
            if room.num_participants < 2:
                continue  # only the agent has joined so far, no visitor yet
            try:
                agent_id = json.loads(room.metadata or "{}").get("agent_id")
            except ValueError:
                agent_id = None
            if agent_id is None or calls_db.agent_account_id(agent_id) != user["account_id"]:
                continue
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


# ================================================= super-admin (platform owner)
#
# Every route below is gated by require_platform_owner (404 to everyone else)
# and reads/writes ACROSS tenants via admin_db. Mutations write an immutable
# admin_audit_log entry. Impersonation mints a scoped support session so the
# owner can operate inside a tenant while the banner + audit trail stay on.


async def _platform_live_call_count() -> int:
    """Count of rooms currently live across ALL tenants (num_participants >= 2)."""
    lkapi = api.LiveKitAPI()
    try:
        rooms = await lkapi.room.list_rooms(ListRoomsRequest())
        return sum(1 for r in rooms.rooms if r.num_participants >= 2)
    except Exception:
        return 0
    finally:
        await lkapi.aclose()


_ADMIN_API_KEY_ENVS = {
    "Sarvam": "SARVAM_API_KEY",
    "OpenAI": "OPENAI_API_KEY",
    "Gemini": "GEMINI_API_KEY",
    "Tavily": "TAVILY_API_KEY",
    "Google OAuth": "GOOGLE_OAUTH_CLIENT_ID",
    "GitHub OAuth": "GITHUB_OAUTH_CLIENT_ID",
    "Slack OAuth": "SLACK_OAUTH_CLIENT_ID",
    "EnableX": "ENABLEX_APP_ID",
    "LiveKit": "LIVEKIT_API_KEY",
}


@app.get("/admin/overview")
async def admin_overview(days: int = 30, admin: dict = Depends(require_platform_owner)) -> dict:
    data = admin_db.platform_overview(days)
    data["kpis"]["liveCalls"] = await _platform_live_call_count()
    return data


@app.get("/admin/accounts")
def admin_accounts(
    search: str = "", plan: str = "", status: str = "", activity: str = "",
    limit: int = 50, offset: int = 0, admin: dict = Depends(require_platform_owner),
) -> dict:
    return admin_db.list_accounts(search, plan, status, activity, limit, offset)


@app.get("/admin/accounts/{account_id}")
def admin_account_detail(account_id: int, admin: dict = Depends(require_platform_owner)) -> dict:
    detail = admin_db.account_detail(account_id)
    if detail is None:
        raise HTTPException(404, "Account not found")
    return detail


@app.get("/admin/users")
def admin_users(search: str = "", limit: int = 50, offset: int = 0, admin: dict = Depends(require_platform_owner)) -> dict:
    return admin_db.list_all_users(search, limit, offset)


@app.get("/admin/calls")
def admin_calls(
    account_id: int = 0, channel: str = "", days: int = 0, search: str = "",
    limit: int = 50, offset: int = 0, admin: dict = Depends(require_platform_owner),
) -> dict:
    return admin_db.list_all_calls(account_id, channel, days, search, limit, offset)


@app.get("/admin/calls/{call_id}")
def admin_call_detail(call_id: int, admin: dict = Depends(require_platform_owner)) -> dict:
    detail = admin_db.call_detail(call_id)
    if detail is None:
        raise HTTPException(404, "Call not found")
    return detail


@app.get("/admin/analytics")
def admin_analytics(days: int = 30, admin: dict = Depends(require_platform_owner)) -> dict:
    return admin_db.analytics(days)


@app.get("/admin/billing")
def admin_billing(admin: dict = Depends(require_platform_owner)) -> dict:
    return admin_db.billing_overview()


@app.get("/admin/audit")
def admin_audit(action: str = "", limit: int = 100, offset: int = 0, admin: dict = Depends(require_platform_owner)) -> dict:
    return admin_db.audit_log(action, limit, offset)


@app.get("/admin/health")
async def admin_health(admin: dict = Depends(require_platform_owner)) -> dict:
    health = admin_db.system_health()
    health["liveCalls"] = await _platform_live_call_count()
    health["apiKeys"] = [{"name": n, "configured": bool(os.environ.get(env))} for n, env in _ADMIN_API_KEY_ENVS.items()]
    return health


@app.get("/admin/vendor-credits")
def admin_vendor_credits(admin: dict = Depends(require_platform_owner)) -> dict:
    return {"vendors": admin_db.list_vendor_credits()}


@app.post("/admin/db-backup/run")
def admin_db_backup_run(admin: dict = Depends(require_platform_owner)) -> dict:
    """Manual trigger for db_backup.run_backup_now() — for verifying the
    backup actually works (and that its email receipt arrives) without
    waiting for the daily 3am UTC window. Synchronous: a full pg_dump +
    upload takes a few seconds to a minute at this database's current
    size, well inside a normal request timeout."""
    return db_backup.run_backup_now()


class AdminPrivacyRequestUpdate(BaseModel):
    status: str
    note: str = ""


@app.get("/admin/privacy-requests")
def admin_privacy_requests(status: str = "", admin: dict = Depends(require_platform_owner)) -> dict:
    return {"requests": admin_db.privacy_requests(status)}


@app.post("/admin/privacy-requests/{request_id}")
def admin_update_privacy_request(
    request_id: int,
    req: AdminPrivacyRequestUpdate,
    admin: dict = Depends(require_platform_owner),
) -> dict:
    try:
        updated = admin_db.update_privacy_request(request_id, req.status, req.note)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if updated is None:
        raise HTTPException(404, "Privacy request not found")
    admin_db.write_audit(
        admin["user_id"],
        admin["email"],
        "update_privacy_request",
        updated["account_id"],
        updated["user_id"],
        detail=f"request #{request_id} -> {req.status}: {req.note[:200]}",
    )
    return {"request": updated}


class AdminVendorCreditRequest(BaseModel):
    balance: float | None = None
    unit: str = ""
    threshold: float | None = None
    notes: str = ""


@app.post("/admin/vendor-credits/{key}")
def admin_update_vendor_credit(key: str, req: AdminVendorCreditRequest, admin: dict = Depends(require_platform_owner)) -> dict:
    if key not in {v["key"] for v in admin_db.VENDOR_CATALOG}:
        raise HTTPException(404, "Unknown vendor")
    admin_db.update_vendor_credit(key, req.balance, req.unit, req.threshold, req.notes, admin["email"])
    admin_db.write_audit(admin["user_id"], admin["email"], "update_vendor_credit", None, detail=f"vendor={key} balance={req.balance} {req.unit}")
    return {"vendors": admin_db.list_vendor_credits()}


class AdminCreditsRequest(BaseModel):
    total: int
    reason: str = ""


@app.post("/admin/accounts/{account_id}/credits")
def admin_set_credits(account_id: int, req: AdminCreditsRequest, admin: dict = Depends(require_platform_owner)) -> dict:
    admin_db.adjust_credits(account_id, req.total)
    admin_db.write_audit(admin["user_id"], admin["email"], "adjust_credits", account_id, detail=f"set credits_total={req.total}. {req.reason}".strip())
    return admin_db.account_detail(account_id)


class AdminPlanRequest(BaseModel):
    plan: str
    reason: str = ""


@app.post("/admin/accounts/{account_id}/plan")
def admin_set_plan(account_id: int, req: AdminPlanRequest, admin: dict = Depends(require_platform_owner)) -> dict:
    if req.plan not in admin_db.PLAN_PRICING:
        raise HTTPException(400, "Unknown plan")
    admin_db.change_plan(account_id, req.plan)
    admin_db.write_audit(admin["user_id"], admin["email"], "change_plan", account_id, detail=f"plan={req.plan}. {req.reason}".strip())
    return admin_db.account_detail(account_id)


class AdminStatusRequest(BaseModel):
    status: str
    reason: str = ""


@app.post("/admin/accounts/{account_id}/status")
def admin_set_status(account_id: int, req: AdminStatusRequest, admin: dict = Depends(require_platform_owner)) -> dict:
    if req.status not in ("active", "suspended"):
        raise HTTPException(400, "Status must be active or suspended")
    admin_db.set_account_status(account_id, req.status)
    admin_db.write_audit(admin["user_id"], admin["email"], "set_status", account_id, detail=f"status={req.status}. {req.reason}".strip())
    return admin_db.account_detail(account_id)


class AdminNotesRequest(BaseModel):
    notes: str


@app.post("/admin/accounts/{account_id}/notes")
def admin_set_notes(account_id: int, req: AdminNotesRequest, admin: dict = Depends(require_platform_owner)) -> dict:
    admin_db.set_account_notes(account_id, req.notes)
    admin_db.write_audit(admin["user_id"], admin["email"], "add_note", account_id, detail="updated internal notes")
    return admin_db.account_detail(account_id)


@app.post("/admin/accounts/{account_id}/reset-password")
def admin_reset_password(account_id: int, request: Request, admin: dict = Depends(require_platform_owner)) -> dict:
    owner_uid = calls_db.account_owner_user_id(account_id)
    if owner_uid is None:
        raise HTTPException(404, "Account has no owner user")
    user = calls_db.get_user_by_id(owner_uid)
    token = calls_db.create_password_reset(owner_uid)
    link = f"{_app_base_url(request)}/reset-password?token={token}"
    html = email_sender.render_email(
        preheader="Reset your Vistrow Voice password",
        heading="Reset your password",
        body_html=(
            f"Hi {user['name']}, a Vistrow Voice support agent started a password reset for your account. "
            "Click below to set a new password — this link is valid for 1 hour."
        ),
        cta_label="Reset password",
        cta_url=link,
    )
    sent = email_sender.send_email(user["email"], "Reset your Vistrow Voice password", html, email_sender.FROM_ACCOUNT_SECURITY)
    admin_db.write_audit(admin["user_id"], admin["email"], "reset_password", account_id, owner_uid, detail=f"reset link issued to {user['email']}")
    # Return the link so the operator can share it directly if email isn't configured.
    return {"ok": True, "emailSent": sent, "resetLink": link}


@app.post("/admin/impersonate/{account_id}")
def admin_impersonate(account_id: int, response: Response, admin: dict = Depends(require_platform_owner)) -> dict:
    """Start a support session AS this tenant's owner. uid/aid point at the
    tenant (so every tenant route works), imp records the real owner so the
    banner shows and the owner can exit."""
    owner_uid = calls_db.account_owner_user_id(account_id)
    if owner_uid is None:
        raise HTTPException(404, "Account has no owner user")
    response.set_cookie(
        auth.COOKIE_NAME,
        auth.make_session_token(owner_uid, account_id, impersonator_id=admin["user_id"]),
        max_age=auth.SESSION_TTL_SECONDS, httponly=True, secure=_COOKIE_SECURE, samesite="lax", path="/",
    )
    admin_db.write_audit(admin["user_id"], admin["email"], "impersonate", account_id, owner_uid, detail="started support session")
    return {"ok": True}


@app.post("/admin/impersonate/exit")
def admin_impersonate_exit(request: Request, response: Response) -> dict:
    """End a support session and restore the platform owner's own session."""
    session = auth.read_session_token(request.cookies.get(auth.COOKIE_NAME))
    if session is None or not session.get("imp"):
        raise HTTPException(400, "Not in a support session")
    owner = calls_db.get_user_by_id(session["imp"])
    if owner is None or not owner["is_platform_owner"]:
        raise HTTPException(403, "Not permitted")
    _set_session_cookie(response, owner["id"], owner["account_id"], request)
    return {"ok": True}


# ------------------------------------------------------ calls & leads


@app.get("/calls")
def list_calls(
    limit: int = 200, search: str = "", status: str = "", days: int = 0, user: dict = Depends(current_user)
) -> list[dict]:
    """Real call history from the calls table — one row per completed call."""
    return calls_db.list_calls(user["account_id"], limit=limit, search=search, status=status, days=days)


@app.get("/calls/export.csv", response_class=PlainTextResponse)
def export_calls_csv(user: dict = Depends(current_user)) -> PlainTextResponse:
    return PlainTextResponse(
        calls_db.calls_csv(user["account_id"]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=calls.csv"},
    )


@app.get("/calls/{call_id}")
def get_call(call_id: int, user: dict = Depends(current_user)) -> dict:
    call = calls_db.get_call(call_id, user["account_id"])
    if call is None:
        raise HTTPException(404, "Call not found")
    return call


def _b2_client():
    """Boto3 S3-compatible client for Backblaze B2, or None if the storage
    env vars aren't configured — every caller checks for None and raises its
    own 503, since the exact message differs (recording vs download)."""
    endpoint_url = os.environ.get("B2_ENDPOINT_URL")
    key_id = os.environ.get("B2_KEY_ID")
    application_key = os.environ.get("B2_APPLICATION_KEY")
    bucket = os.environ.get("B2_BUCKET_NAME")
    region = os.environ.get("B2_REGION")
    if not (endpoint_url and key_id and application_key and bucket and region):
        return None, None
    import boto3

    client = boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=key_id,
        aws_secret_access_key=application_key,
        region_name=region,
    )
    return client, bucket


@app.get("/calls/{call_id}/recording")
def get_call_recording_url(call_id: int, user: dict = Depends(current_user)) -> dict:
    """A short-lived presigned Backblaze B2 GET URL for this call's
    recording — never the raw storage key, and never proxied through this
    server (client downloads directly from B2). Used for inline playback;
    see /recording/download below for the renamed, MP3 download."""
    key = calls_db.get_call_recording_key(call_id, user["account_id"])
    if not key:
        raise HTTPException(404, "No recording for this call")
    client, bucket = _b2_client()
    if client is None:
        raise HTTPException(503, "Recording storage not configured")
    url = client.generate_presigned_url(
        "get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=3600
    )
    return {"url": url}


@app.get("/calls/{call_id}/recording/download")
def download_call_recording(call_id: int, user: dict = Depends(current_user)) -> Response:
    """The recording as an MP3, named after the caller, instead of the raw
    WAV under an opaque {call_id}.wav key — what an operator actually wants
    when saving a recording locally rather than just playing it inline.
    Proxied (not a presigned redirect like /recording above) because the
    rename + transcode both have to happen server-side."""
    call = calls_db.get_call(call_id, user["account_id"])
    if call is None:
        raise HTTPException(404, "Call not found")
    key = calls_db.get_call_recording_key(call_id, user["account_id"])
    if not key:
        raise HTTPException(404, "No recording for this call")
    client, bucket = _b2_client()
    if client is None:
        raise HTTPException(503, "Recording storage not configured")

    try:
        wav_bytes = client.get_object(Bucket=bucket, Key=key)["Body"].read()
    except Exception:
        logger.exception("recording download: failed to fetch %s from B2", key)
        raise HTTPException(502, "Could not fetch the recording right now")

    try:
        proc = subprocess.run(
            ["ffmpeg", "-y", "-i", "pipe:0", "-f", "mp3", "-codec:a", "libmp3lame", "-qscale:a", "2", "pipe:1"],
            input=wav_bytes,
            capture_output=True,
            check=True,
            timeout=60,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        logger.exception("recording download: ffmpeg transcode failed for call=%s", call_id)
        raise HTTPException(500, "Could not convert the recording to MP3")
    mp3_bytes = proc.stdout

    # Caller's name + phone, not the account's own agent name — this is what
    # actually distinguishes one downloaded file from the next when an
    # operator's saved several. Falls back to the call id if neither is on
    # file (e.g. a widget visitor who never gave a name/number).
    safe_name = re.sub(r"[^\w\-]+", "_", (call.get("name") or "").strip()).strip("_")
    safe_phone = re.sub(r"[^\d+]+", "", call.get("phone") or "")
    base = "_".join(part for part in (safe_name, safe_phone) if part) or f"call-{call_id}"
    filename = f"{base}.mp3"

    return Response(
        content=mp3_bytes,
        media_type="audio/mpeg",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/calls/{call_id}/analyze")
def analyze_call(call_id: int, user: dict = Depends(current_user)) -> dict:
    """Run (or re-run) conversation intelligence on one call and cache it on
    the row. Returns the intelligence object."""
    transcript = calls_db.get_call_transcript(call_id, user["account_id"])
    if transcript is None:
        raise HTTPException(404, "Call not found")
    try:
        data = call_intelligence.analyze_transcript(transcript)
    except RuntimeError as exc:
        raise HTTPException(502, str(exc))
    calls_db.save_call_intelligence(call_id, user["account_id"], data)
    return data


@app.post("/calls/{call_id}/push-to-arthaleads")
def push_call_to_arthaleads(call_id: int, user: dict = Depends(require_role("admin"))) -> dict:
    """Manually (re)send one call's lead to ArthaLeads — for a lead the
    automatic delivery skipped (call never got marked qualified) or that
    failed and the operator wants to retry after fixing the token."""
    ok, detail = integrations_dispatch.push_call_to_arthaleads(user["account_id"], call_id)
    if not ok and detail in ("Call not found",):
        raise HTTPException(404, detail)
    return {"ok": ok, "detail": detail}


@app.get("/dashboard/intelligence")
def dashboard_intelligence(days: int = 30, user: dict = Depends(current_user)) -> dict:
    return calls_db.intelligence_summary(user["account_id"], days=days)


# Leads are the same rows viewed CRM-style; kept as aliases so both mental
# models (call log vs. lead list) work against one source of truth.
@app.get("/leads")
def list_leads(limit: int = 200, user: dict = Depends(current_user)) -> list[dict]:
    return calls_db.list_calls(user["account_id"], limit=limit)


@app.get("/leads/{lead_id}")
def get_lead(lead_id: int, user: dict = Depends(current_user)) -> dict:
    return get_call(lead_id, user)


# ---------------------------------------------------------- dashboard


@app.get("/dashboard/summary")
def dashboard_summary(user: dict = Depends(current_user)) -> dict:
    return calls_db.summary(user["account_id"])


@app.get("/dashboard/usage-trends")
def dashboard_usage_trends(days: int = 14, user: dict = Depends(current_user)) -> dict:
    return calls_db.usage_trends(user["account_id"], days=days)


@app.get("/dashboard/period-comparison")
def dashboard_period_comparison(days: int = 14, user: dict = Depends(current_user)) -> dict:
    return calls_db.period_comparison(user["account_id"], days=days)


@app.get("/dashboard/analytics")
def dashboard_analytics(user: dict = Depends(current_user)) -> dict:
    return calls_db.analytics(user["account_id"])


@app.get("/dashboard/launch-readiness")
def dashboard_launch_readiness(user: dict = Depends(current_user)) -> dict:
    return calls_db.launch_readiness(user["account_id"])


@app.get("/dashboard/feedback")
def dashboard_feedback(user: dict = Depends(current_user)) -> dict:
    return calls_db.feedback_summary(user["account_id"])


# -------------------------------------------------------------- agents


@app.get("/agents")
def list_agents(user: dict = Depends(current_user)) -> list[dict]:
    return calls_db.list_agents(user["account_id"])


# Models restricted to the Vistrow admin account. Groq is the fastest
# time-to-first-token option available but its model list is open-weight
# only and unevaluated for Hindi/Marathi quality on real calls — speed was
# measured, quality was not. Keep it owner-only until that is checked, the
# same way preview voices are gated below.
_ADMIN_ONLY_MODEL_PREFIXES = ("groq/",)


def _guard_admin_only_model(data: dict | None, account_id: int) -> None:
    model = str((data or {}).get("model") or "")
    if model.startswith(_ADMIN_ONLY_MODEL_PREFIXES) and not calls_db.is_platform_owner(account_id):
        raise HTTPException(400, "That model is available only to the Vistrow admin account.")


@app.post("/agents")
def create_agent(data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    requested_voice = str((data or {}).get("voice") or "")
    entry = voice_catalog.get_voice(requested_voice) if requested_voice else None
    if entry and entry.get("preview") and not calls_db.is_platform_owner(user["account_id"]):
        raise HTTPException(400, "That preview voice is available only to the Vistrow admin account.")
    _guard_admin_only_model(data, user["account_id"])
    return calls_db.create_agent(data, user["account_id"])


@app.patch("/agents/{agent_id}")
def update_agent(agent_id: int, data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    requested_voice = str((data or {}).get("voice") or "")
    entry = voice_catalog.get_voice(requested_voice) if requested_voice else None
    if entry and entry.get("preview") and not calls_db.is_platform_owner(user["account_id"]):
        raise HTTPException(400, "That preview voice is available only to the Vistrow admin account.")
    _guard_admin_only_model(data, user["account_id"])
    # Both of these decide what the PUBLIC marketing site talks to, so only
    # the platform operator's own account may set them: isPlatformDemo
    # redirects the main "talk to Artha" demo, and publicDemoSlug publishes
    # an agent on an unauthenticated industry-demo endpoint (billable calls
    # against that agent, from anyone). Silently dropped rather than an
    # error, so an unrelated edit (name, voice) in the same request still
    # saves — same reasoning as the original isPlatformDemo guard.
    _OWNER_ONLY_AGENT_FIELDS = (
        "isPlatformDemo", "is_platform_demo", "publicDemoSlug", "public_demo_slug",
    )
    if any(f in data for f in _OWNER_ONLY_AGENT_FIELDS) and not calls_db.is_platform_owner(
        user["account_id"]
    ):
        data = {k: v for k, v in data.items() if k not in _OWNER_ONLY_AGENT_FIELDS}
    agent = calls_db.update_agent(agent_id, data, user["account_id"])
    if agent is None:
        raise HTTPException(404, "Agent not found")
    return agent


@app.delete("/agents/{agent_id}")
def delete_agent(agent_id: int, user: dict = Depends(current_user)) -> dict:
    calls_db.delete_agent(agent_id, user["account_id"])
    return {"ok": True}


# ------------------------------------------------------------ contacts


@app.get("/contacts")
def list_contacts(user: dict = Depends(current_user)) -> list[dict]:
    return calls_db.list_contacts(user["account_id"])


@app.post("/contacts")
def create_contact(data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    calls_db.create_contact(data, user["account_id"])
    return {"ok": True}


@app.delete("/contacts/{contact_id}")
def delete_contact(contact_id: int, user: dict = Depends(current_user)) -> dict:
    calls_db.delete_contact(contact_id, user["account_id"])
    return {"ok": True}


@app.delete("/contacts")
def delete_all_contacts(user: dict = Depends(current_user)) -> dict:
    calls_db.delete_all_contacts(user["account_id"])
    return {"ok": True}


@app.get("/contacts/export.csv", response_class=PlainTextResponse)
def export_contacts_csv(user: dict = Depends(current_user)) -> PlainTextResponse:
    return PlainTextResponse(
        calls_db.contacts_csv(user["account_id"]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=contacts.csv"},
    )


@app.post("/contacts/import/preview")
def preview_contacts_import(data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    """First step of the column-mapping import flow — parse just the header
    row + a few sample rows so the frontend can render a Facebook-Custom-
    Audience-style "map each column" screen before anything is imported."""
    return calls_db.preview_csv_columns(data.get("csv", ""))


@app.post("/contacts/import/mapped")
def import_contacts_mapped(data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    count = calls_db.import_contacts_mapped(data.get("csv", ""), data.get("mapping") or {}, user["account_id"])
    return {"imported": count}


@app.get("/contacts/{contact_id}")
def get_contact_detail(contact_id: int, user: dict = Depends(current_user)) -> dict:
    detail = calls_db.contact_detail(contact_id, user["account_id"])
    if detail is None:
        raise HTTPException(404, "Contact not found")
    return detail


@app.post("/contacts/{contact_id}/notes")
def create_contact_note(contact_id: int, data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    body = (data.get("body") or "").strip()
    if not body:
        raise HTTPException(400, "Note body is required")
    return calls_db.add_contact_note(contact_id, user["account_id"], body, user.get("email", ""))


@app.delete("/contacts/{contact_id}/notes/{note_id}")
def remove_contact_note(contact_id: int, note_id: int, user: dict = Depends(current_user)) -> dict:
    calls_db.delete_contact_note(note_id, user["account_id"])
    return {"ok": True}


# ------------------------------------------------------ knowledge base


@app.get("/knowledge-bases")
def list_knowledge_bases(user: dict = Depends(current_user)) -> list[dict]:
    return calls_db.list_knowledge_bases(user["account_id"])


@app.post("/knowledge-bases")
def create_knowledge_base(data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    calls_db.create_knowledge_base(data.get("name", "Untitled"), user["account_id"])
    return {"ok": True}


@app.delete("/knowledge-bases/{kb_id}")
def delete_knowledge_base(kb_id: int, user: dict = Depends(current_user)) -> dict:
    calls_db.delete_knowledge_base(kb_id, user["account_id"])
    return {"ok": True}


@app.post("/knowledge-bases/{kb_id}/sources")
def add_knowledge_source(kb_id: int, data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    calls_db.add_knowledge_source(
        kb_id, data.get("name", "Untitled"), data.get("content", ""), user["account_id"], data.get("type", "text")
    )
    return {"ok": True}


@app.get("/knowledge-sources/{source_id}")
def get_knowledge_source(source_id: int, user: dict = Depends(current_user)) -> dict:
    source = calls_db.get_knowledge_source_content(source_id, user["account_id"])
    if source is None:
        raise HTTPException(404, "Source not found")
    return source


@app.patch("/knowledge-sources/{source_id}")
def update_knowledge_source(source_id: int, data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    source = calls_db.update_knowledge_source(
        source_id, user["account_id"], name=data.get("name"), content=data.get("content")
    )
    if source is None:
        raise HTTPException(404, "Source not found")
    return source


@app.delete("/knowledge-sources/{source_id}")
def delete_knowledge_source(source_id: int, user: dict = Depends(current_user)) -> dict:
    calls_db.delete_knowledge_source(source_id, user["account_id"])
    return {"ok": True}


# Hard cap on how many pages one import-urls call fetches — each fetch is a
# synchronous ~1-10s network call on the request thread, so an unbounded list
# could tie up a worker for minutes and blow past any upstream proxy timeout.
MAX_IMPORT_URLS = 20


class ScanUrlRequest(BaseModel):
    url: str


class ImportUrlsRequest(BaseModel):
    urls: list[str]


@app.post("/knowledge-bases/{kb_id}/sources/scan-url")
def scan_kb_url(kb_id: int, req: ScanUrlRequest, user: dict = Depends(current_user)) -> dict:
    """Fetch one page and return the same-domain links found on it, so the
    operator can bulk-select which pages to import as sources."""
    if not calls_db.kb_exists(kb_id, user["account_id"]):
        raise HTTPException(404, "Knowledge base not found")
    try:
        return kb_crawl.scan(req.url)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(502, str(exc)) from exc


@app.post("/knowledge-bases/{kb_id}/sources/import-urls")
def import_kb_urls(kb_id: int, req: ImportUrlsRequest, user: dict = Depends(current_user)) -> dict:
    """Fetch each selected URL's visible text and save it as a source."""
    if not calls_db.kb_exists(kb_id, user["account_id"]):
        raise HTTPException(404, "Knowledge base not found")
    urls = req.urls[:MAX_IMPORT_URLS]
    added = 0
    failed = []
    for url in urls:
        try:
            title, text = kb_crawl.fetch_page_text(url)
        except (ValueError, RuntimeError) as exc:
            failed.append({"url": url, "error": str(exc)})
            continue
        if not text.strip():
            failed.append({"url": url, "error": "No readable text found on that page"})
            continue
        calls_db.add_knowledge_source(kb_id, title, text, user["account_id"], "url")
        added += 1
    return {"added": added, "failed": failed}


@app.patch("/knowledge-bases/{kb_id}")
def update_knowledge_base(kb_id: int, data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    if "strict" in data:
        calls_db.set_kb_strict(kb_id, bool(data["strict"]), user["account_id"])
    return {"ok": True}


@app.post("/knowledge-bases/{kb_id}/qa")
def add_kb_qa(kb_id: int, data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    question = (data.get("question") or "").strip()
    answer = (data.get("answer") or "").strip()
    if not question or not answer:
        raise HTTPException(400, "Both question and answer are required")
    qa_id = calls_db.add_kb_qa(kb_id, question, answer, user["account_id"])
    if qa_id is None:
        raise HTTPException(404, "Knowledge base not found")
    return {"ok": True, "id": qa_id}


@app.post("/knowledge-bases/{kb_id}/qa/bulk")
def add_kb_qa_bulk(kb_id: int, data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    """Accept step of auto-extract: saves the reviewed draft pairs in one go."""
    pairs = data.get("pairs") or []
    if not isinstance(pairs, list):
        raise HTTPException(400, "pairs must be a list")
    added = calls_db.add_kb_qa_bulk(kb_id, pairs, user["account_id"])
    return {"ok": True, "added": added}


@app.patch("/kb-qa/{qa_id}")
def update_kb_qa(qa_id: int, data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    question = (data.get("question") or "").strip()
    answer = (data.get("answer") or "").strip()
    if not question or not answer:
        raise HTTPException(400, "Both question and answer are required")
    calls_db.update_kb_qa(qa_id, question, answer, user["account_id"])
    return {"ok": True}


@app.delete("/kb-qa/{qa_id}")
def delete_kb_qa(qa_id: int, user: dict = Depends(current_user)) -> dict:
    calls_db.delete_kb_qa(qa_id, user["account_id"])
    return {"ok": True}


@app.post("/knowledge-sources/{source_id}/extract-qa")
def extract_qa_from_source(source_id: int, user: dict = Depends(current_user)) -> dict:
    """LLM-drafts Q&A pairs from one uploaded source. Returns drafts only —
    nothing is saved until the operator reviews and POSTs them to /qa/bulk,
    so a misread price never reaches a live agent unreviewed."""
    source = calls_db.get_knowledge_source_content(source_id, user["account_id"])
    if source is None:
        raise HTTPException(404, "Source not found")
    try:
        pairs = kb_extract.extract_qa_pairs(source["name"], source["content"])
    except RuntimeError as exc:
        raise HTTPException(502, str(exc)) from exc
    return {"ok": True, "pairs": pairs}


# ------------------------------------------------------------- help chat


class HelpChatTurn(BaseModel):
    role: str
    content: str


class HelpChatRequest(BaseModel):
    message: str
    history: list[HelpChatTurn] = []
    currentPage: str | None = None


@app.get("/help/faqs")
def list_help_faqs(user: dict = Depends(current_user)) -> list[dict]:
    return FAQS


@app.post("/help/chat")
def help_chat_message(req: HelpChatRequest, user: dict = Depends(current_user)) -> dict:
    try:
        reply = help_chat.answer_help_question(
            req.message,
            [turn.model_dump() for turn in req.history],
            account_id=user["account_id"],
            current_page=req.currentPage,
        )
    except RuntimeError as exc:
        raise HTTPException(502, str(exc)) from exc
    return {"reply": reply}


# ----------------------------------------------------------- campaigns


@app.get("/inbound-routes")
def list_inbound_routes(user: dict = Depends(current_user)) -> list[dict]:
    return calls_db.list_inbound_routes(user["account_id"])


async def _sync_inbound_route_agent(phone_number: str | None, agent_id: int | None, account_id: int) -> str | None:
    """The Inbound Calls page's routes (schedule/window/max-concurrent) are
    a separate table from phone_numbers, but real call routing (both
    LiveKit's dispatch-rule metadata and the orchestrator's
    get_phone_number_by_number lookup) only ever reads phone_numbers.agent_id
    - confirmed live as the cause of a route saying one agent while a
    completely different one actually answered. Keeps that field in sync
    with whatever agent a route assigns, so the two pages can't silently
    disagree about who answers a number. Returns an error string on a
    LiveKit sync failure (best-effort, doesn't block saving the route)."""
    if not phone_number or not agent_id:
        return None
    number_row = calls_db.get_phone_number_by_number(phone_number)
    if number_row is None or number_row["accountId"] != account_id:
        return None
    calls_db.assign_phone_number(number_row["id"], agent_id, account_id)
    return await _sync_dispatch_rule(number_row["id"], account_id)


@app.post("/inbound-routes")
async def create_inbound_route(data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    phone_number = data.get("phoneNumber")
    if phone_number and calls_db.inbound_route_exists_for_number(phone_number, user["account_id"]):
        raise HTTPException(400, "This number already has an active route. Edit the existing one instead.")
    calls_db.create_inbound_route(data, user["account_id"])
    lk_sync_error = await _sync_inbound_route_agent(phone_number, data.get("agentId"), user["account_id"])
    return {"ok": True, "lkSyncError": lk_sync_error}


@app.patch("/inbound-routes/{route_id}")
async def update_inbound_route(route_id: int, data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    phone_number = data.get("phoneNumber")
    if phone_number and calls_db.inbound_route_exists_for_number(phone_number, user["account_id"], exclude_route_id=route_id):
        raise HTTPException(400, "This number already has a different active route.")
    calls_db.update_inbound_route(route_id, data, user["account_id"])
    lk_sync_error = await _sync_inbound_route_agent(phone_number, data.get("agentId"), user["account_id"])
    return {"ok": True, "lkSyncError": lk_sync_error}


@app.delete("/inbound-routes/{route_id}")
def delete_inbound_route(route_id: int, user: dict = Depends(current_user)) -> dict:
    calls_db.delete_inbound_route(route_id, user["account_id"])
    return {"ok": True}


@app.get("/campaigns")
def list_campaigns(user: dict = Depends(current_user)) -> list[dict]:
    return calls_db.list_campaigns_with_stats(user["account_id"])


@app.get("/campaigns/segment-count")
def campaign_segment_count(segment: str = "", tag: str = "", user: dict = Depends(current_user)) -> dict:
    """Live "N contacts match" preview for the campaign picker's segment
    tabs (Fresh Leads/Need Follow-up/Failed-Retry/All), narrowed by the
    same optional tag filter create_campaign itself uses."""
    return {"count": calls_db.count_contacts_by_segment(user["account_id"], segment, tag)}


@app.get("/campaigns/{campaign_id}")
def get_campaign(campaign_id: int, user: dict = Depends(current_user)) -> dict:
    detail = calls_db.campaign_detail(campaign_id, user["account_id"])
    if detail is None:
        raise HTTPException(404, "Campaign not found")
    return detail


_CAMPAIGN_STATES = {"draft", "running", "paused", "completed", "cancelled"}


@app.post("/campaigns")
def create_campaign(data: dict = Body(...), user: dict = Depends(require_role("member"))) -> dict:
    # from_number must be one of this tenant's own numbers — the campaign dials
    # from it and its assigned agent answers. Reject early with a clear message
    # rather than letting the dialer silently pause a mis-configured campaign.
    from_number = (data.get("fromNumber") or "").strip()
    if from_number:
        owned = {n["number"] for n in calls_db.list_phone_numbers(user["account_id"])}
        if from_number not in owned:
            raise HTTPException(400, "That from-number isn't one of your numbers")
    campaign_id = calls_db.create_campaign(data, user["account_id"])
    detail = calls_db.campaign_detail(campaign_id, user["account_id"])
    if detail is not None and detail["stats"]["total"] == 0:
        # An empty queue is almost always a wrong tag / empty upload — tell the
        # operator instead of creating a campaign that can never dial anyone.
        logger.info("campaign %s created with no contacts", campaign_id)
    return detail or {"id": campaign_id}


@app.patch("/campaigns/{campaign_id}")
def update_campaign(campaign_id: int, data: dict = Body(...), user: dict = Depends(require_role("member"))) -> dict:
    status = data.get("status", "paused")
    if status not in _CAMPAIGN_STATES:
        raise HTTPException(400, "Invalid campaign status")
    calls_db.set_campaign_status(campaign_id, status, user["account_id"])
    detail = calls_db.campaign_detail(campaign_id, user["account_id"])
    if detail is None:
        raise HTTPException(404, "Campaign not found")
    return detail


# --------------------------------------------------------- compliance
#
# DNC registry + calling-window/consent/retention config. Read is open to any
# authenticated role (viewers should see the rules they operate under); writes
# are admin+ because getting compliance wrong is a legal, not cosmetic, risk.


@app.get("/compliance/settings")
def get_compliance_settings(user: dict = Depends(current_user)) -> dict:
    # Opportunistic retention enforcement — purge on read so DPDP retention is
    # actually applied without a standalone scheduler (cheap, tenant-scoped,
    # no-op when retention is unlimited).
    try:
        calls_db.purge_expired_calls(user["account_id"])
    except Exception:
        logger.exception("retention purge failed for account %s", user["account_id"])
    return calls_db.get_compliance(user["account_id"])


@app.patch("/compliance/settings")
def update_compliance_settings(data: dict = Body(...), user: dict = Depends(require_role("admin"))) -> dict:
    return calls_db.save_compliance(user["account_id"], data)


@app.get("/compliance/dnc")
def list_dnc(user: dict = Depends(current_user)) -> list[dict]:
    return calls_db.list_dnc(user["account_id"])


@app.post("/compliance/dnc")
def add_dnc(data: dict = Body(...), user: dict = Depends(require_role("admin"))) -> dict:
    phone = (data.get("phone") or "").strip()
    if not phone:
        raise HTTPException(400, "A phone number is required")
    added = calls_db.add_dnc(user["account_id"], phone, reason=(data.get("reason") or "").strip())
    return {"ok": True, "added": added}


@app.post("/compliance/dnc/bulk")
def bulk_add_dnc(data: dict = Body(...), user: dict = Depends(require_role("admin"))) -> dict:
    # Accepts a raw pasted/uploaded blob — one number per line or comma-
    # separated — and reports how many were newly added vs already present.
    raw = data.get("numbers") or ""
    if isinstance(raw, list):
        candidates = [str(x) for x in raw]
    else:
        candidates = [chunk for line in str(raw).splitlines() for chunk in line.split(",")]
    phones = [p.strip() for p in candidates if p.strip()]
    if not phones:
        raise HTTPException(400, "No phone numbers found to import")
    added = calls_db.bulk_add_dnc(user["account_id"], phones)
    return {"ok": True, "added": added, "total": len(phones)}


@app.delete("/compliance/dnc/{dnc_id}")
def remove_dnc(dnc_id: int, user: dict = Depends(require_role("admin"))) -> dict:
    calls_db.remove_dnc(user["account_id"], dnc_id)
    return {"ok": True}


# -------------------------------------------------------- integrations


@app.get("/integrations")
def list_integrations(user: dict = Depends(current_user)) -> list[dict]:
    return calls_db.list_integrations(user["account_id"])


@app.patch("/integrations/{key}")
def update_integration(key: str, data: dict = Body(...), user: dict = Depends(require_role("admin"))) -> dict:
    calls_db.update_integration(
        key,
        data.get("status", "not_connected"),
        data.get("config", {}),
        user["account_id"],
        name=data.get("name"),
    )
    return {"ok": True}


@app.post("/integrations/{key}/test")
def test_integration(key: str, user: dict = Depends(require_role("admin"))) -> dict:
    ok, detail = integrations_dispatch.test_integration(user["account_id"], key)
    return {"ok": ok, "detail": detail}


# --------------------------------------------------------------- appointments

@app.get("/appointments")
def list_appointments(start: str = "", end: str = "", status: str = "", search: str = "", user: dict = Depends(current_user)) -> list[dict]:
    return calls_db.list_appointments(user["account_id"], start, end, status, search)


@app.post("/appointments")
def create_appointment(data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    if not data.get("date") or not data.get("time"):
        raise HTTPException(400, "date and time are required")
    result = calls_db.book_appointment_native(
        user["account_id"], data.get("agentId"), None,
        data.get("name", ""), data.get("phone", ""), data["date"], data["time"],
        int(data.get("durationMinutes", 30)), data.get("purpose", ""), data.get("email", ""), source="manual",
    )
    if not result.get("ok"):
        raise HTTPException(409, result.get("error", "could not book"))
    return calls_db.get_appointment(result["id"], user["account_id"])


@app.patch("/appointments/{appt_id}/status")
def update_appointment_status(appt_id: int, data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    appt = calls_db.update_appointment_status(appt_id, user["account_id"], data.get("status", ""))
    if not appt:
        raise HTTPException(404, "not found")
    return appt


@app.post("/appointments/{appt_id}/reschedule")
def reschedule_appointment(appt_id: int, data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    if not data.get("date") or not data.get("time"):
        raise HTTPException(400, "date and time are required")
    result = calls_db.reschedule_appointment(appt_id, user["account_id"], data["date"], data["time"])
    if not result.get("ok"):
        raise HTTPException(409, result.get("error", "could not reschedule"))
    return calls_db.get_appointment(result["id"], user["account_id"])


@app.delete("/appointments/{appt_id}")
def delete_appointment(appt_id: int, user: dict = Depends(current_user)) -> dict:
    calls_db.delete_appointment(appt_id, user["account_id"])
    return {"ok": True}


@app.get("/appointments/availability")
def appointments_check_availability(date: str, duration_minutes: int = 30, user: dict = Depends(current_user)) -> dict:
    return {"slots": calls_db.check_availability(user["account_id"], date, duration_minutes)}


# ------------------------------------------------------------ availability config

@app.get("/availability/settings")
def get_availability_settings(user: dict = Depends(current_user)) -> dict:
    return calls_db.get_availability_config(user["account_id"])


@app.patch("/availability/settings")
def update_availability_settings(data: dict = Body(...), user: dict = Depends(require_role("admin"))) -> dict:
    return calls_db.save_availability_config(user["account_id"], data)


# ----------------------------------------------------- telephony (EnableX)


@app.get("/telephony/status")
def telephony_status(user: dict = Depends(current_user)) -> dict:
    return calls_db.telephony_status(user["account_id"])


@app.post("/telephony/connect")
def telephony_connect(data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    app_id = (data.get("appId") or "").strip()
    app_key = (data.get("appKey") or "").strip()
    if not app_id or not app_key:
        raise HTTPException(400, "Both App ID and App Key are required")
    calls_db.connect_enablex(app_id, app_key, user["account_id"])
    return calls_db.telephony_status(user["account_id"])


@app.post("/telephony/disconnect")
def telephony_disconnect(user: dict = Depends(current_user)) -> dict:
    calls_db.disconnect_enablex(user["account_id"])
    return {"ok": True}


@app.get("/telephony/numbers")
def list_phone_numbers(user: dict = Depends(current_user)) -> list[dict]:
    return calls_db.list_phone_numbers(user["account_id"])


async def _sync_dispatch_rule(number_id: int, account_id: int) -> str | None:
    """Best-effort: (re)create this number's LiveKit SIP dispatch rule.

    Runs after every add/reassign so an inbound call to the number is always
    routed to whichever agent the dashboard currently has it assigned to.
    Returns an error message on failure — the number/agent change itself
    still saves either way, since LiveKit Cloud being briefly unreachable
    shouldn't block using the dashboard.
    """
    row = calls_db.get_phone_number(number_id, account_id)
    if row is None:
        return None
    try:
        await livekit_sip.upsert_dispatch_rule(row)
        return None
    except Exception as exc:
        logger.exception("failed to sync LiveKit dispatch rule for number %s", row["number"])
        return f"Number saved, but LiveKit call routing wasn't updated: {exc}"


@app.get("/telephony/sip-auth")
def get_sip_auth(user: dict = Depends(require_role("admin"))) -> dict:
    """Credentials any SIP trunk provider (EnableX today) must send on every
    INVITE to reach our shared LiveKit inbound trunk. One pair for the whole
    platform — see livekit_sip.ensure_inbound_auth."""
    username, password = livekit_sip.ensure_inbound_auth()
    return {"username": username, "password": password, "sipHost": livekit_sip.sip_host()}


@app.post("/telephony/numbers")
async def add_phone_number(data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    number = (data.get("number") or "").strip()
    if not number:
        raise HTTPException(400, "A phone/virtual number is required")
    number_id = calls_db.add_phone_number(number, user["account_id"], data.get("label", ""), data.get("agentId"))
    lk_sync_error = await _sync_dispatch_rule(number_id, user["account_id"])
    return {"ok": True, "lkSyncError": lk_sync_error}


@app.patch("/telephony/numbers/{number_id}")
async def assign_phone_number(number_id: int, data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    if not calls_db.assign_phone_number(number_id, data.get("agentId"), user["account_id"]):
        raise HTTPException(400, "Agent not found")
    lk_sync_error = await _sync_dispatch_rule(number_id, user["account_id"])
    return {"ok": True, "lkSyncError": lk_sync_error}


@app.delete("/telephony/numbers/{number_id}")
async def delete_phone_number(number_id: int, user: dict = Depends(current_user)) -> dict:
    row = calls_db.get_phone_number(number_id, user["account_id"])
    if row is not None and row.get("lkDispatchRuleId"):
        try:
            await livekit_sip.delete_dispatch_rule(row)
        except Exception:
            logger.exception("failed to delete LiveKit dispatch rule for number %s", row["number"])
    calls_db.delete_phone_number(number_id, user["account_id"])
    if calls_db.get_setting(livekit_sip.TRUNK_ID_SETTING, calls_db.PLATFORM_ACCOUNT_ID):
        try:
            await livekit_sip.ensure_inbound_trunk()
        except Exception:
            logger.exception("failed to resync LiveKit trunk numbers after deleting %s", number_id)
    return {"ok": True}


@app.post("/telephony/test-call")
def telephony_test_call(data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    from_number = (data.get("from") or "").strip()
    to_number = (data.get("to") or "").strip()
    if not from_number or not to_number:
        raise HTTPException(400, "Both a from (virtual) number and a to number are required")

    orchestrator_url = os.environ.get("ORCHESTRATOR_URL")
    if orchestrator_url and calls_db.is_on_orchestrator_pipeline(user["account_id"]):
        # This account is on the Railway-native pipeline (orchestrator/) —
        # EnableX WebSocket streaming, no LiveKit SIP bridge involved. Every
        # other account still goes through place_test_call() below.
        try:
            request = urllib.request.Request(
                f"{orchestrator_url.rstrip('/')}/telephony/enablex/outbound-test-call",
                data=json.dumps({"to": to_number, "fromNumber": from_number, "accountId": user["account_id"]}).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(request, timeout=15) as resp:
                return json.loads(resp.read().decode())
        except Exception as e:
            logger.exception("orchestrator test-call proxy failed")
            return {"ok": False, "error": f"Could not reach orchestrator: {e}"}

    return calls_db.place_test_call(from_number, to_number, user["account_id"])


@app.post("/orchestrator/browser-token")
def orchestrator_browser_token(data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    """Mints a browser-streaming token for the dashboard's own agent-test
    mic button (AgentTestCall.tsx's BrowserTestModal) against the
    Railway-native orchestrator, instead of a LiveKit room token. Gated to
    whichever accounts are actually on the orchestrator pipeline (see
    calls_db.is_on_orchestrator_pipeline) — every other account falls
    through to the LiveKit room flow in BrowserTestModal instead."""
    agent_id = data.get("agentId")
    if not agent_id:
        raise HTTPException(400, "agentId is required")

    orchestrator_url = os.environ.get("ORCHESTRATOR_URL")
    if not (orchestrator_url and calls_db.is_on_orchestrator_pipeline(user["account_id"])):
        raise HTTPException(400, "This account isn't on the orchestrator pipeline yet.")

    try:
        url = f"{orchestrator_url.rstrip('/')}/browser/token?account_id={user['account_id']}&agent_id={agent_id}"
        request = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(request, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        logger.exception("orchestrator browser-token proxy failed")
        return {"ok": False, "error": f"Could not reach orchestrator: {e}"}


@app.get("/telephony/sip-host")
def telephony_sip_host() -> dict:
    """The LiveKit SIP endpoint to register as the EnableX inbound webhook
    target isn't this — but this exposes the SIP host we bridge calls to, so
    the dashboard can show operators what's wired up."""
    return {"sipHost": livekit_sip.sip_host()}


#  EnableX's own webhook 'state' values seen across accounts/portal configs
#  aren't a single fixed string per lifecycle stage — mirror the broader set
#  other EnableX integrations match on rather than a single literal, so a
#  differently-worded event for the same lifecycle stage doesn't silently
#  no-op the whole call.
_ENABLEX_TERMINAL_STATES = {
    "completed", "disconnected", "failed", "busy", "no-answer", "noanswer", "cancelled", "canceled",
}


def _verify_enablex_webhook(request: Request) -> bool:
    """EnableX's own webhook docs offer exactly one authenticity check for
    these callbacks: an HTTP Basic Authentication checkbox + username/password
    in the portal's webhook config screen, sent back as the Authorization
    header on every POST (no HMAC/signature scheme is offered). Until
    ENABLEX_WEBHOOK_USER/PASS are set here *and* the same credentials are
    entered in the portal, this returns True unverified — so shipping this
    doesn't 401 real inbound calls the moment it deploys; it only starts
    enforcing once both sides are actually configured to match.
    """
    expected_user = os.environ.get("ENABLEX_WEBHOOK_USER")
    expected_pass = os.environ.get("ENABLEX_WEBHOOK_PASS")
    if not expected_user or not expected_pass:
        return True
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Basic "):
        return False
    try:
        got_user, _, got_pass = base64.b64decode(auth_header[6:]).decode().partition(":")
    except (ValueError, UnicodeDecodeError):
        return False
    return secrets.compare_digest(got_user, expected_user) and secrets.compare_digest(got_pass, expected_pass)


@app.post("/telephony/enablex/inbound-event")
async def enablex_inbound_event(request: Request) -> dict:
    """Webhook EnableX calls for inbound-call lifecycle events.

    Set this URL (…/telephony/enablex/inbound-event) as the webhook on your
    EnableX inbound number in the portal. On an incoming call we accept the
    leg and bridge it to LiveKit's SIP host for the dialed number, so the
    same agent that powers browser calls handles the phone call — the
    LiveKit inbound trunk + per-number dispatch rule route it into a room
    with the right agent auto-dispatched. EXCEPT for accounts on the
    Railway-native orchestrator pipeline (calls_db.is_on_orchestrator_pipeline,
    same gate /telephony/test-call uses) — every event for one of those
    accounts' numbers is proxied to the orchestrator's own inbound-event
    handler instead, which runs its own accept/connected/stream lifecycle.
    This keeps ONE stable EnableX portal webhook URL regardless of which
    pipeline an account is on, rather than requiring a portal change per
    migration.

    EnableX expects a 200 quickly; we respond immediately and only act on the
    'incomingcall' state (for the LiveKit path). (Encrypted webhook payloads
    aren't handled yet — configure the portal webhook without encryption for
    now.)

    Takes the raw Request rather than a typed `dict = Body(...)` — a real
    'incomingcall' event from EnableX was observed hitting this route with a
    422 before ever reaching this function (FastAPI's own body-parsing
    rejected it, so not even our own logging line ran), meaning it isn't a
    plain `application/json` object body the old signature required. Parsed
    manually here, with every shape falling back to a 200 + logged raw body
    instead of ever 422ing again — a webhook that can 422 a call it can't
    parse is worse than one that just logs and moves on.
    """
    if not _verify_enablex_webhook(request):
        raise HTTPException(401, "Invalid webhook credentials")
    raw_body = await request.body()
    content_type = request.headers.get("content-type", "")
    event: dict = {}
    if raw_body:
        try:
            parsed = json.loads(raw_body)
            if isinstance(parsed, dict):
                event = parsed
        except ValueError:
            if "form" in content_type:
                event = dict((await request.form()))
    if not event:
        logger.info(
            "EnableX inbound event: unparsed body (content-type=%s): %r", content_type, raw_body[:2000]
        )
        return {"ok": True}

    state = event.get("state")
    voice_id = event.get("voice_id")
    dialed_number = event.get("to")
    caller = event.get("from")
    logger.info("EnableX inbound event: state=%s voice_id=%s to=%s from=%s raw=%s", state, voice_id, dialed_number, caller, event)

    if dialed_number:
        number_row = calls_db.get_phone_number_by_number(dialed_number)
        if number_row is not None:
            orchestrator_url = os.environ.get("ORCHESTRATOR_URL")
            if orchestrator_url and calls_db.is_on_orchestrator_pipeline(number_row["accountId"]):
                try:
                    request = urllib.request.Request(
                        f"{orchestrator_url.rstrip('/')}/telephony/enablex/inbound-event",
                        data=json.dumps(event).encode(),
                        headers={"Content-Type": "application/json"},
                        method="POST",
                    )
                    with urllib.request.urlopen(request, timeout=15) as resp:
                        return json.loads(resp.read().decode())
                except Exception as e:
                    logger.exception("orchestrator inbound-event proxy failed")
                    return {"ok": False, "error": f"Could not reach orchestrator: {e}"}

    if state in _ENABLEX_TERMINAL_STATES:
        logger.info("EnableX inbound call %s ended: state=%s", voice_id, state)
        return {"ok": True}

    if state != "incomingcall" or not voice_id or not dialed_number:
        return {"ok": True}

    number_row = calls_db.get_phone_number_by_number(dialed_number)
    if number_row is None:
        logger.warning("inbound call to unregistered number %s — hanging up", dialed_number)
        return {"ok": False, "error": "number not registered"}
    account_id = number_row["accountId"]

    accept = calls_db.enablex_accept_call(voice_id, account_id)
    if not accept.get("ok"):
        logger.error("failed to accept EnableX call %s: %s", voice_id, accept.get("error"))
        return accept
    logger.info("accepted EnableX call %s: %s", voice_id, accept.get("response"))

    # See enablex_test_call_connected in calls_db.py for why the "+" is
    # stripped here — EnableX's gateway appears to reject a "+"-prefixed SIP
    # user-part with "Unallocated (unassigned) number".
    sip_uri = f"sip:{dialed_number.lstrip('+')}@{livekit_sip.sip_host()}"
    bridge = calls_db.enablex_connect_to_sip(voice_id, dialed_number, sip_uri, account_id)
    if not bridge.get("ok"):
        logger.error("failed to bridge EnableX call %s to %s: %s", voice_id, sip_uri, bridge.get("error"))
    else:
        # EnableX returning ok=True here only means it accepted the connect
        # *request* — it says nothing about whether the SIP INVITE it then
        # sends toward sip_uri actually reaches/authenticates against
        # LiveKit's trunk. That's a real, previously-silent gap: a prior
        # real call bridged with no error here and no LiveKit room ever
        # got created. logged in full so a bridge that "succeeds" by
        # EnableX's own account but never produces a LiveKit job can be
        # told apart from one that actually reached the agent.
        logger.info("bridged EnableX call %s to %s: %s", voice_id, sip_uri, bridge.get("response"))
    return bridge


# EnableX 'ready to bridge' states seen for the outbound leg — not just the
# single 'connected' string this used to match on. Matching only one literal
# state meant a differently-worded ready event for the same lifecycle point
# left the call ringing with nothing ever bridging it — dead air, no error.
_ENABLEX_ANSWERED_STATES = {"connected", "answered", "answer", "in-progress", "in_progress", "ongoing", "active", "bridged"}


@app.post("/telephony/enablex/outbound-test-event")
def enablex_outbound_test_event(request: Request, event: dict = Body(...)) -> dict:
    """Webhook for the dashboard's "Call test" outbound calls (see
    calls_db.place_test_call). Once EnableX reports the callee answered, we
    bridge the leg to the LiveKit agent the same way real inbound calls are
    bridged, instead of just playing a canned line and hanging up."""
    if not _verify_enablex_webhook(request):
        raise HTTPException(401, "Invalid webhook credentials")
    state = event.get("state")
    voice_id = event.get("voice_id")
    logger.info("EnableX outbound-test event: state=%s voice_id=%s raw=%s", state, voice_id, event)

    if state in _ENABLEX_TERMINAL_STATES:
        logger.info("EnableX outbound-test call %s ended before bridging: state=%s", voice_id, state)
        return {"ok": True}

    if state not in _ENABLEX_ANSWERED_STATES or not voice_id:
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
def billing(user: dict = Depends(current_user)) -> dict:
    return calls_db.billing_summary(user["account_id"])


@app.get("/billing/subscription")
def billing_subscription(user: dict = Depends(current_user)) -> dict:
    return {
        "subscription": calls_db.get_subscription(user["account_id"]),
        "invoices": calls_db.list_invoices(user["account_id"]),
        "razorpayConfigured": razorpay_client.is_configured(),
    }


class CheckoutRequest(BaseModel):
    plan: str
    billingCycle: str = "monthly"  # "monthly" | "annual"


@app.post("/billing/checkout")
def billing_checkout(req: CheckoutRequest, user: dict = Depends(current_user)) -> dict:
    """Starts (or switches) a subscription for this account. Returns what the
    frontend needs to open Razorpay Checkout against — actual activation
    happens via the subscription.activated/charged webhook below, not here;
    this route only creates the pending subscription and hands back its id."""
    if not calls_db.PRICING_FINALIZED:
        raise HTTPException(503, "Introductory pricing is still being finalized — checkout isn't open yet.")
    if not razorpay_client.is_configured():
        raise HTTPException(503, "Billing isn't set up on this server yet — contact support.")
    plan = req.plan.strip().lower()
    if plan not in calls_db.PLAN_PRICING:
        raise HTTPException(400, f"Unknown plan: {req.plan}")
    cycle = req.billingCycle.strip().lower()
    if cycle not in ("monthly", "annual"):
        raise HTTPException(400, "billingCycle must be 'monthly' or 'annual'")

    try:
        plan_id = razorpay_client.plan_id_for(plan, cycle)
    except razorpay_client.RazorpayNotConfigured as e:
        raise HTTPException(503, str(e)) from e

    existing = calls_db.get_subscription(user["account_id"])
    customer_id = existing["razorpay_customer_id"] if existing else None
    if not customer_id:
        profile = calls_db.get_user_by_id(user["user_id"])
        if profile is None:
            raise HTTPException(401, "Session user no longer exists")
        try:
            customer = razorpay_client.create_customer(profile["account_name"] or profile["name"], profile["email"])
            customer_id = customer["id"]
        except razorpay_client.RazorpayError as e:
            raise HTTPException(502, f"Could not start checkout: {e}") from e

    total_count = 10 if cycle == "annual" else 120  # ~"until cancelled" at this product's timescale
    try:
        subscription = razorpay_client.create_subscription(
            plan_id, customer_id, total_count, notes={"account_id": str(user["account_id"]), "plan": plan}
        )
    except razorpay_client.RazorpayError as e:
        raise HTTPException(502, f"Could not start checkout: {e}") from e

    calls_db.upsert_subscription(
        user["account_id"], plan, cycle, customer_id, subscription["id"],
        status="created", current_period_start=None, current_period_end=None,
    )
    return {
        "razorpayKeyId": os.environ.get("RAZORPAY_KEY_ID"),
        "subscriptionId": subscription["id"],
        "plan": plan,
        "billingCycle": cycle,
    }


class TopupRequest(BaseModel):
    credits: int


@app.post("/billing/topup")
def billing_topup(req: TopupRequest, user: dict = Depends(current_user)) -> dict:
    """One-off credit purchase, priced at the account's own plan rate (not
    the overage penalty rate — this is buying ahead, not running over)."""
    if not calls_db.PRICING_FINALIZED:
        raise HTTPException(503, "Introductory pricing is still being finalized — top-ups aren't open yet.")
    if not razorpay_client.is_configured():
        raise HTTPException(503, "Billing isn't set up on this server yet — contact support.")
    if req.credits <= 0:
        raise HTTPException(400, "credits must be positive")
    summary = calls_db.billing_summary(user["account_id"])
    plan_pricing = calls_db.PLAN_PRICING.get(summary["plan"], calls_db.PLAN_PRICING["starter"])
    per_credit_rate = plan_pricing["price_inr"] / plan_pricing["credits"]
    amount_inr = round(req.credits * per_credit_rate, 2)

    try:
        order = razorpay_client.create_order(
            amount_inr, receipt=f"topup-{user['account_id']}-{int(time.time())}",
            notes={"account_id": str(user["account_id"]), "credits": str(req.credits)},
        )
    except razorpay_client.RazorpayError as e:
        raise HTTPException(502, f"Could not start top-up: {e}") from e

    calls_db.record_invoice(
        user["account_id"], kind="topup", amount_inr=amount_inr, status="created",
        razorpay_order_id=order["id"], credits=req.credits,
        notes=f"{req.credits} credits at {per_credit_rate:.2f}/credit",
    )
    return {
        "razorpayKeyId": os.environ.get("RAZORPAY_KEY_ID"),
        "orderId": order["id"],
        "amountInr": amount_inr,
        "credits": req.credits,
    }


class VerifyPaymentRequest(BaseModel):
    razorpayOrderId: str
    razorpayPaymentId: str
    razorpaySignature: str


@app.post("/billing/verify-payment")
def billing_verify_payment(req: VerifyPaymentRequest, user: dict = Depends(current_user)) -> dict:
    """Confirms a top-up's Checkout callback wasn't forged, then applies the
    credits immediately. Subscription checkouts don't use this route — those
    activate via the webhook, since Razorpay's own subscription-checkout
    signature is keyed differently and the webhook is the authoritative
    source there anyway."""
    if not razorpay_client.verify_payment_signature(
        req.razorpayOrderId, req.razorpayPaymentId, req.razorpaySignature
    ):
        raise HTTPException(400, "Payment signature did not verify")
    invoice = calls_db.mark_invoice_paid(razorpay_order_id=req.razorpayOrderId, razorpay_payment_id=req.razorpayPaymentId)
    if invoice and invoice["account_id"] == user["account_id"] and invoice["kind"] == "topup" and invoice["credits"]:
        calls_db.add_topup_credits(user["account_id"], invoice["credits"])
    return {"ok": True}


@app.post("/billing/razorpay/webhook")
async def billing_razorpay_webhook(request: Request) -> dict:
    """Source of truth for subscription lifecycle — Razorpay calls this on
    every event (see https://razorpay.com/docs/webhooks/). Configure this
    URL (…/billing/razorpay/webhook) as a webhook in the Razorpay dashboard
    for: subscription.activated, subscription.charged, subscription.cancelled,
    payment.captured, payment.failed. Always returns 200 once the signature
    checks out (even for events we don't act on) so Razorpay doesn't retry
    forever on an event we simply don't need."""
    raw_body = await request.body()
    signature = request.headers.get("x-razorpay-signature", "")
    if not razorpay_client.verify_webhook_signature(raw_body, signature):
        raise HTTPException(400, "Invalid webhook signature")

    event = json.loads(raw_body)
    event_type = event.get("event", "")
    payload = event.get("payload", {})
    logger.info("razorpay webhook: %s", event_type)

    if event_type in ("subscription.activated", "subscription.authenticated"):
        sub = payload.get("subscription", {}).get("entity", {})
        account_id = calls_db.find_account_id_by_razorpay_subscription(sub.get("id", ""))
        if account_id:
            plan = (sub.get("notes") or {}).get("plan") or "starter"
            existing = calls_db.get_subscription(account_id)
            calls_db.upsert_subscription(
                account_id, plan, existing["billing_cycle"] if existing else "monthly",
                sub.get("customer_id"), sub["id"], status="active",
                current_period_start=_epoch_to_iso(sub.get("current_start")),
                current_period_end=_epoch_to_iso(sub.get("current_end")),
            )
            admin_db.change_plan(account_id, plan)

    elif event_type == "subscription.charged":
        sub = payload.get("subscription", {}).get("entity", {})
        payment = payload.get("payment", {}).get("entity", {})
        account_id = calls_db.find_account_id_by_razorpay_subscription(sub.get("id", ""))
        if account_id:
            existing = calls_db.get_subscription(account_id)
            plan = (sub.get("notes") or {}).get("plan") or (existing["plan"] if existing else "starter")
            new_period_start = _epoch_to_iso(sub.get("current_start"))
            new_period_end = _epoch_to_iso(sub.get("current_end"))

            # Record the plan charge itself.
            calls_db.record_invoice(
                account_id, kind="subscription",
                amount_inr=(payment.get("amount") or 0) / 100,
                status="paid", razorpay_payment_id=payment.get("id"),
                period_start=new_period_start, period_end=new_period_end,
                notes=f"{plan} plan renewal",
            )

            # Bill overage + phone-number fees for the period that JUST
            # closed (the one before this new one) as a subscription addon —
            # lands on the FOLLOWING charge, a Razorpay Addon limitation, not
            # a bug (see razorpay_client.create_subscription_addon).
            if existing and existing["current_period_start"] and existing["current_period_end"]:
                overage = calls_db.overage_for_account_period(
                    account_id, plan, existing["current_period_start"], existing["current_period_end"]
                )
                phone_fees = calls_db.active_phone_number_fees(account_id)
                addon_total = overage["overageAmountInr"] + phone_fees
                if addon_total > 0:
                    try:
                        razorpay_client.create_subscription_addon(
                            sub["id"], addon_total,
                            f"Overage ({overage['overageCredits']} credits) + phone number fees for "
                            f"{existing['current_period_start'][:10]}–{existing['current_period_end'][:10]}",
                        )
                        calls_db.record_invoice(
                            account_id, kind="overage", amount_inr=addon_total, status="pending_next_cycle",
                            period_start=existing["current_period_start"], period_end=existing["current_period_end"],
                            credits=int(overage["overageCredits"]),
                            notes=f"{overage['overageCredits']} credits over plan + {phone_fees} phone number fees",
                        )
                    except razorpay_client.RazorpayError:
                        logger.exception("failed to add overage addon for account %s", account_id)

            calls_db.upsert_subscription(
                account_id, plan, existing["billing_cycle"] if existing else "monthly",
                sub.get("customer_id"), sub["id"], status="active",
                current_period_start=new_period_start, current_period_end=new_period_end,
            )
            admin_db.change_plan(account_id, plan)

    elif event_type == "subscription.cancelled":
        sub = payload.get("subscription", {}).get("entity", {})
        account_id = calls_db.find_account_id_by_razorpay_subscription(sub.get("id", ""))
        if account_id:
            existing = calls_db.get_subscription(account_id)
            if existing:
                calls_db.upsert_subscription(
                    account_id, existing["plan"], existing["billing_cycle"],
                    existing["razorpay_customer_id"], existing["razorpay_subscription_id"],
                    status="cancelled",
                    current_period_start=existing["current_period_start"],
                    current_period_end=existing["current_period_end"],
                )

    elif event_type == "payment.captured":
        # Only relevant for one-off orders (top-ups) — subscription charges
        # are already handled above, keyed by subscription id, not order id.
        payment = payload.get("payment", {}).get("entity", {})
        order_id = payment.get("order_id")
        if order_id:
            invoice = calls_db.mark_invoice_paid(razorpay_order_id=order_id, razorpay_payment_id=payment.get("id"))
            if invoice and invoice["kind"] == "topup" and invoice["credits"]:
                calls_db.add_topup_credits(invoice["account_id"], invoice["credits"])

    elif event_type == "payment.failed":
        payment = payload.get("payment", {}).get("entity", {})
        order_id = payment.get("order_id")
        if order_id:
            calls_db.mark_invoice_failed(order_id)
    return {"ok": True}


def _parse_facebook_field_data(field_data: list) -> tuple[str, str]:
    """(name, phone) out of Facebook Lead Ads' field_data shape — a list of
    {"name": <question label>, "values": [<answer>]} pairs. Question labels
    vary per form, so this matches by common phone/name aliases rather than
    assuming an exact key. Shared by the Zapier-passthrough path (leads_inbound)
    and the native Graph API leadgen lookup (facebook_leadgen_lead), since
    both eventually hold the same shape — one from Zapier forwarding it
    unmodified, the other from calling Meta directly."""
    name, phone = "", ""
    for entry in field_data or []:
        label = str((entry or {}).get("name") or "").strip().lower()
        values = (entry or {}).get("values") or []
        value = str(values[0]).strip() if values else ""
        if not value:
            continue
        if not phone and label in ("phone_number", "phone", "mobile", "contact_number"):
            phone = value
        elif not name and label in ("full_name", "name", "first_name"):
            name = value
    return name, phone


@app.post("/leads/inbound/{account_id}")
async def leads_inbound(account_id: int, token: str, request: Request) -> dict:
    """Generic entry point for any external lead source that can POST JSON —
    a Zapier 'Webhooks by Zapier' step bridging Facebook Lead Ads' native
    'New Lead' trigger is the first one wired up, and it needs no Meta App
    Review: Zapier already holds the Facebook permissions on its own side,
    we just receive whatever it forwards. The same route works for any other
    lead source later (a different ad platform, a form tool, a BSP).

    Auth is the per-account token from calls_db.get_or_create_lead_webhook_token
    (shown on the Integrations page), not a session — this is called by a
    third-party service, not a logged-in user. Deliberately tolerant of
    payload shape: accepts a plain {"name", "phone"} body (what we ask
    Zapier's custom-request step to send) as well as Zapier's raw
    passthrough of Facebook's own field_data array, so a misconfigured Zap
    that forwards the unmodified Facebook payload still queues a call
    instead of silently dropping the lead.

    Always returns 200 once the token checks out, even when the payload has
    no usable phone number — the caller is a webhook sender that will retry
    on anything else, and a malformed one-off payload isn't worth a retry
    storm."""
    if calls_db.account_id_for_lead_webhook_token(token) != account_id:
        raise HTTPException(404, "Not found")
    try:
        body = await request.json()
    except Exception:
        body = {}
    name = str(body.get("name") or body.get("full_name") or "").strip()
    phone = str(body.get("phone") or body.get("phone_number") or "").strip()
    if not phone:
        # Zapier's raw Facebook Lead Ads passthrough — see _parse_facebook_field_data.
        parsed_name, parsed_phone = _parse_facebook_field_data(body.get("field_data") or [])
        name, phone = name or parsed_name, phone or parsed_phone
    if not phone:
        logger.warning("leads_inbound: no phone number in payload for account %s", account_id)
        return {"ok": False, "reason": "no_phone_in_payload"}
    result = calls_db.ingest_inbound_lead(
        account_id, name, phone, source="facebook_lead_ads",
        external_id=str(body.get("leadgen_id") or body.get("id") or ""),
    )
    if not result.get("ok"):
        logger.warning("leads_inbound: could not queue lead for account %s: %s", account_id, result.get("reason"))
    return result


@app.get("/webhooks/meta")
def webhooks_meta_verify(request: Request) -> PlainTextResponse:
    """Meta's one-time webhook verification handshake, run once when the
    URL is registered in the Meta App dashboard (or re-verified): it GETs
    this URL with hub.mode=subscribe, hub.verify_token, and hub.challenge,
    and expects the challenge echoed back as plain text if the verify token
    matches — otherwise it refuses to save the subscription. One webhook
    URL serves every connected account; routing to the right one happens
    per-event in webhooks_meta_event, by page_id."""
    params = request.query_params
    verify_token = os.environ.get("META_WEBHOOK_VERIFY_TOKEN", "")
    if (
        params.get("hub.mode") == "subscribe"
        and verify_token
        and secrets.compare_digest(params.get("hub.verify_token", ""), verify_token)
    ):
        return PlainTextResponse(params.get("hub.challenge", ""))
    raise HTTPException(403, "Verification failed")


def _fetch_facebook_lead_fields(leadgen_id: str, page_access_token: str) -> list:
    url = (
        f"https://graph.facebook.com/{_META_GRAPH_VERSION}/{leadgen_id}"
        f"?fields=field_data&access_token={urllib.parse.quote(page_access_token)}"
    )
    with urllib.request.urlopen(url, timeout=10) as resp:
        return json.loads(resp.read()).get("field_data") or []


@app.post("/webhooks/meta")
async def webhooks_meta_event(request: Request) -> dict:
    """The real-time receiver for every Meta product this app is subscribed
    to — today just Facebook Lead Ads ('page' object, 'leadgen' field);
    WhatsApp inbound messages land here too once that's wired up
    ('whatsapp_business_account' object), same URL, same signature check,
    branching on `object`.

    Every request is signature-verified against META_OAUTH_CLIENT_SECRET
    (X-Hub-Signature-256, HMAC-SHA256 over the raw body) before the payload
    is trusted at all — this is a public URL with no per-account secret in
    it, so the signature is the only thing standing between "real Meta
    event" and "anyone who found this URL can inject a fake lead." Always
    returns 200 once the signature checks out, even for an object/field we
    don't act on — Meta retries a non-200 for up to 7 days, and there's
    nothing to gain from that on an event we intentionally ignore."""
    raw_body = await request.body()
    app_secret = os.environ.get("META_OAUTH_CLIENT_SECRET", "")
    signature = request.headers.get("x-hub-signature-256", "")
    if not app_secret or not signature.startswith("sha256="):
        raise HTTPException(403, "Missing signature")
    expected = "sha256=" + hmac.new(app_secret.encode(), raw_body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(403, "Invalid signature")

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        return {"ok": False, "reason": "invalid_json"}

    if payload.get("object") != "page":
        return {"ok": True, "reason": "ignored_object"}  # e.g. whatsapp_business_account, not built yet

    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            if change.get("field") != "leadgen":
                continue
            value = change.get("value") or {}
            leadgen_id = str(value.get("leadgen_id") or "")
            page_id = str(value.get("page_id") or "")
            if not leadgen_id or not page_id:
                continue
            connection = calls_db.facebook_page_connection(page_id)
            if not connection:
                logger.warning("webhooks_meta_event: leadgen event for unconnected page %s", page_id)
                continue
            try:
                field_data = _fetch_facebook_lead_fields(leadgen_id, connection["pageAccessToken"])
            except Exception:
                logger.exception("webhooks_meta_event: failed to fetch lead %s for page %s", leadgen_id, page_id)
                continue
            name, phone = _parse_facebook_field_data(field_data)
            if not phone:
                logger.warning("webhooks_meta_event: lead %s had no phone field", leadgen_id)
                continue
            result = calls_db.ingest_inbound_lead(
                connection["account_id"], name, phone, source="facebook_lead_ads_native", external_id=leadgen_id,
            )
            if not result.get("ok"):
                logger.warning("webhooks_meta_event: could not queue lead %s: %s", leadgen_id, result.get("reason"))
    return {"ok": True}


@app.get("/integrations/lead-webhook")
def integrations_lead_webhook(user: dict = Depends(current_user)) -> dict:
    """The URL + token an operator pastes into a Zapier 'Webhooks by Zapier'
    step (or any other lead source) so POSTing to it queues an instant call.
    Session-authenticated, unlike the webhook route itself — this is read by
    the logged-in dashboard, not by the third-party sender. base is null
    (same as /widget/backend-url) when neither RAILWAY_PUBLIC_DOMAIN nor
    PUBLIC_BASE_URL is set, e.g. local dev with no public URL to hand out."""
    account_id = user["account_id"]
    token = calls_db.get_or_create_lead_webhook_token(account_id)
    base = calls_db.public_base_url()
    url = f"{base}/leads/inbound/{account_id}?token={token}" if base else None
    return {"url": url, "accountId": account_id, "token": token}


def _epoch_to_iso(epoch: int | None) -> str | None:
    if epoch is None:
        return None
    import datetime

    return datetime.datetime.fromtimestamp(epoch, tz=datetime.timezone.utc).isoformat()


# ---------------------------------------------------------- voices

@app.get("/voices/catalog")
def voices_catalog(user: dict = Depends(current_user)) -> dict:
    """The full voice catalog annotated for this account: which voices are in
    its menu, which its plan can add, and remaining slots. Powers the Voices
    page's add/remove grid."""
    return calls_db.voice_catalog_for_account(user["account_id"])


@app.get("/voices/mine")
def voices_mine(user: dict = Depends(current_user)) -> list[dict]:
    """The account's curated voice menu — the only voices the agent picker
    offers. Auto-seeds sensible defaults on an account's first read."""
    return calls_db.list_account_voices(user["account_id"])


@app.post("/voices/mine")
def voices_add(body: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    voice = (body or {}).get("voice", "")
    try:
        calls_db.add_account_voice(user["account_id"], voice)
    except calls_db.VoiceMenuError as e:
        raise HTTPException(status_code=400, detail=e.message)
    return {"ok": True, "voices": calls_db.list_account_voices(user["account_id"])}


@app.delete("/voices/mine/{voice:path}")
def voices_remove(voice: str, user: dict = Depends(current_user)) -> dict:
    calls_db.remove_account_voice(user["account_id"], voice)
    return {"ok": True, "voices": calls_db.list_account_voices(user["account_id"])}


@app.get("/voices/preview")
def voices_preview(voice: str, lang: str = "", user: dict = Depends(current_user)) -> Response:
    """Return the fixed Vistrow audition line spoken by `voice`. Served from
    the Postgres cache when present (zero provider cost); synthesized once and
    cached on the first request for a given (voice, lang)."""
    import voice_catalog

    lang = lang or voice_catalog.DEFAULT_SAMPLE_LANG
    entry = voice_catalog.get_voice(voice)
    if entry is None:
        raise HTTPException(status_code=404, detail="Unknown voice.")
    if entry.get("preview") and not calls_db.is_platform_owner(user["account_id"]):
        raise HTTPException(status_code=404, detail="Unknown voice.")
    if lang not in voice_catalog.SAMPLE_TEXTS:
        raise HTTPException(status_code=400, detail="Unsupported preview language.")

    cached = calls_db.get_voice_sample(voice, lang)
    if cached is None:
        import voice_preview

        try:
            audio, content_type = voice_preview.synthesize(voice, lang)
        except voice_preview.PreviewError as e:
            raise HTTPException(status_code=502, detail=e.message)
        calls_db.save_voice_sample(voice, lang, audio, content_type)
        cached = {"audio": audio, "content_type": content_type}

    return Response(
        content=cached["audio"],
        media_type=cached["content_type"],
        # Immutable: the audition line is fixed, so the browser can cache the
        # clip and not even re-request it on replay.
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


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
    # This URL is deliberately stable in every customer embed snippet, so it
    # must revalidate instead of being cached for days by a browser/CDN after
    # a widget bug fix. no-cache permits storage but requires an origin check;
    # the ETag/Last-Modified response still makes unchanged loads cheap.
    return FileResponse(
        WIDGET_JS_PATH,
        media_type="application/javascript; charset=utf-8",
        headers={"Cache-Control": "no-cache, must-revalidate"},
    )


@app.get("/widget/wordpress-plugin.zip")
def widget_wordpress_plugin() -> FileResponse:
    """Downloadable, install-ready WordPress plugin (wordpress-plugin/ in the
    repo) — just a settings page for the site key + this backend's URL,
    which then echoes the widget.js script tag in wp_footer()."""
    return FileResponse(
        WORDPRESS_PLUGIN_ZIP_PATH,
        media_type="application/zip",
        filename="vistrow-voice-widget.zip",
    )


@app.get("/agent-orb.mp4")
def widget_agent_orb() -> FileResponse:
    """Same looping orb video used on the dashboard's browser-call screen —
    served from here too so the embeddable widget (a separate, dependency-
    free bundle) can show the identical agent visual without needing its own
    copy of the asset shipped in the widget.js bundle itself."""
    return FileResponse(AGENT_ORB_VIDEO_PATH, media_type="video/mp4")


@app.get("/widget-avatars/{key}.png")
def widget_avatar_image(key: str) -> FileResponse:
    """Serves one of the curated avatar catalog images (widget_avatars.py)
    to third-party sites embedding the widget — unauthenticated, like
    agent-orb.mp4 above. The {key} path param is validated against the
    known catalog before touching the filesystem, so this can't be used to
    read arbitrary files off the static/ directory."""
    if not widget_avatars.is_valid_avatar_key(key):
        raise HTTPException(404, "Unknown avatar")
    return FileResponse(WIDGET_AVATARS_DIR / f"{key}.png", media_type="image/png")


@app.get("/widget-avatars/{key}.mp4")
def widget_avatar_video(key: str) -> FileResponse:
    """Animated variant of a catalog avatar (see VIDEO_AVATAR_KEYS in
    widget.ts's avatarTag()) — same catalog validation as the .png route
    above, plus a filesystem check since only some avatars have one."""
    if not widget_avatars.is_valid_avatar_key(key):
        raise HTTPException(404, "Unknown avatar")
    path = WIDGET_AVATARS_DIR / f"{key}.mp4"
    if not path.exists():
        raise HTTPException(404, "No video for this avatar")
    return FileResponse(path, media_type="video/mp4")


@app.get("/widget/sites")
def list_sites(user: dict = Depends(current_user)) -> list[dict]:
    return calls_db.list_sites(user["account_id"])


@app.post("/widget/sites")
def create_site(data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    name = (data.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "A site name is required")
    return calls_db.create_site(
        name,
        data.get("agentId"),
        user["account_id"],
        data.get("allowedDomain", ""),
        data.get("widgetPosition", "bottom-right"),
        data.get("widgetLabel", "Talk to us"),
        data.get("widgetAvatar", "default"),
        data.get("widgetGreeting", ""),
        data.get("widgetMode", "voice"),
        data.get("widgetAskName", True),
        data.get("widgetAskPhone", True),
    )


@app.get("/widget/avatar-catalog")
def widget_avatar_catalog(user: dict = Depends(current_user)) -> dict:
    return {"avatars": [{"key": k, "label": v} for k, v in widget_avatars.WIDGET_AVATAR_CATALOG.items()]}



# This endpoint fires on every widget load across every tenant's site, but
# the platform-wide conversation count only needs to be roughly fresh - a
# 5-minute in-memory cache turns "one COUNT query per widget load,
# platform-wide" into "one COUNT query per 5 minutes, platform-wide."
# Per-process only (not shared across Railway replicas) and resets on
# restart, same tradeoff as the rate-limit guards below - fine for a number
# that's inherently approximate ("N+ people this week").
_PLATFORM_PROOF_CACHE_TTL_SECONDS = 300
_platform_proof_cache: dict[int, tuple[float, int]] = {}


def _platform_conversation_count_cached(days: int = 7) -> int:
    now = time.monotonic()
    cached = _platform_proof_cache.get(days)
    if cached is not None and now - cached[0] < _PLATFORM_PROOF_CACHE_TTL_SECONDS:
        return cached[1]
    count = calls_db.platform_conversation_count(days=days)
    _platform_proof_cache[days] = (now, count)
    return count


@app.get("/widget/site-config")
def widget_site_config(siteKey: str, path: str = "") -> dict:
    """Public, unauthenticated — lets any embed method (WordPress plugin,
    a hand-pasted snippet) pull a site's current avatar/greeting/mode
    straight from the dashboard's own record instead of keeping its own
    separately-editable copy. The dashboard's Website Widget page is the
    single source of truth for these; the WordPress plugin used to store
    its own copies in wp_options, which could silently drift out of sync
    with whatever the dashboard said - this endpoint is what lets it defer
    to the dashboard instead (see wp_footer's short-lived transient cache).

    `path` (the visitor's current location.pathname) lets one site-wide
    install still show a page-specific greeting via site_page_routes — see
    calls_db.resolve_site_page. Omitted or unmatched, this behaves exactly
    as it did before per-page routing existed."""
    site = calls_db.get_site_by_key(siteKey)
    if site is None:
        raise HTTPException(404, "Unknown site key")
    calls_db.record_site_page_view(site["id"], path)
    resolved = calls_db.resolve_site_page(site, path)
    return {
        "avatar": resolved["avatar"],
        "greeting": resolved["greeting"],
        "mode": site["widgetMode"],
        "position": site["widgetPosition"],
        "askName": site["widgetAskName"],
        "requireName": site["widgetRequireName"],
        "askPhone": site["widgetAskPhone"],
        "requirePhone": site["widgetRequirePhone"],
        "askEmail": site["widgetAskEmail"],
        "requireEmail": site["widgetRequireEmail"],
        "platformConversationCount": _platform_conversation_count_cached(days=7),
        "platformConversationWindowDays": 7,
    }


@app.patch("/widget/sites/{site_id}")
def update_site(site_id: int, data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    site = calls_db.update_site(site_id, data, user["account_id"])
    if site is None:
        raise HTTPException(404, "Site not found")
    return site


@app.post("/widget/sites/{site_id}/regenerate-key")
def regenerate_site_key(site_id: int, user: dict = Depends(current_user)) -> dict:
    site = calls_db.regenerate_site_key(site_id, user["account_id"])
    if site is None:
        raise HTTPException(404, "Site not found")
    return site


@app.get("/widget/sites/{site_id}/routes")
def list_site_page_routes(site_id: int, user: dict = Depends(current_user)) -> list[dict]:
    return calls_db.list_site_page_routes(site_id, user["account_id"])


@app.get("/widget/sites/{site_id}/seen-paths")
def list_site_seen_paths(site_id: int, user: dict = Depends(current_user)) -> list[dict]:
    return calls_db.list_site_seen_paths(site_id, user["account_id"])


@app.post("/widget/sites/{site_id}/sync-wp-pages")
def sync_wp_pages_from_dashboard(site_id: int, user: dict = Depends(current_user)) -> dict:
    """Dashboard-triggered counterpart to the WordPress plugin's own push
    (POST /widget/wp-pages) — pulls the page list directly from the site's
    public WP REST API instead, so an operator who wants to manage
    everything from this dashboard never has to open WordPress admin at
    all. Requires the site's domain to be set."""
    site = calls_db.get_site(site_id, user["account_id"])
    if site is None:
        raise HTTPException(404, "Site not found")
    try:
        pages = calls_db.fetch_wp_pages_via_rest(site["allowedDomain"])
    except RuntimeError as exc:
        raise HTTPException(400, str(exc))
    calls_db.sync_wp_site_pages(site_id, pages)
    return {"ok": True, "count": len(pages)}


# Loose since this only fires when an admin views the plugin's own settings
# page in WP admin, not on real visitor traffic — same idea as
# _widget_warm_rate_limited, scaled down for much lower expected volume.
_WP_PAGES_SYNC_WINDOW_SECONDS = 60
_WP_PAGES_SYNC_MAX_PER_WINDOW = 10
_wp_pages_sync_calls: dict[str, list[float]] = {}


def _wp_pages_sync_rate_limited(site_key: str) -> bool:
    import time

    now = time.monotonic()
    calls = [t for t in _wp_pages_sync_calls.get(site_key, []) if now - t < _WP_PAGES_SYNC_WINDOW_SECONDS]
    calls.append(now)
    _wp_pages_sync_calls[site_key] = calls
    return len(calls) > _WP_PAGES_SYNC_MAX_PER_WINDOW


class WpPagesSyncRequest(BaseModel):
    siteKey: str
    pages: list[dict] = []


@app.post("/widget/wp-pages")
def sync_wp_pages(req: WpPagesSyncRequest) -> dict:
    """Public, unauthenticated — same site-key-is-the-auth model as
    /widget/token. Called by the WordPress plugin's own admin settings
    page (vistrow_voice_sync_wp_pages) with its already-local get_pages()
    list, so the dashboard's page-rules picker can suggest real WordPress
    pages immediately instead of waiting for actual visitor traffic to
    populate site_seen_paths."""
    site = calls_db.get_site_by_key(req.siteKey)
    if site is None:
        raise HTTPException(404, "Unknown site key")
    if _wp_pages_sync_rate_limited(req.siteKey):
        raise HTTPException(429, "Too many syncs right now — try again shortly")
    calls_db.sync_wp_site_pages(site["id"], req.pages)
    return {"ok": True}


@app.post("/widget/sites/{site_id}/routes")
def create_site_page_route(site_id: int, data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    route = calls_db.create_site_page_route(
        site_id,
        user["account_id"],
        data.get("pathPattern", ""),
        data.get("agentId"),
        data.get("greetingOverride", ""),
        data.get("avatarOverride", ""),
    )
    if route is None:
        raise HTTPException(400, "Site not found, or path pattern is empty")
    return route


@app.delete("/widget/sites/{site_id}/routes/{route_id}")
def delete_site_page_route(site_id: int, route_id: int, user: dict = Depends(current_user)) -> dict:
    calls_db.delete_site_page_route(route_id, user["account_id"])
    return {"ok": True}


@app.delete("/widget/sites/{site_id}")
def delete_site(site_id: int, user: dict = Depends(current_user)) -> dict:
    calls_db.delete_site(site_id, user["account_id"])
    return {"ok": True}


# Shared per-IP guard across /auth/login, /auth/signup, and
# /auth/request-password-reset: password brute-forcing, signup spam, and
# password-reset email-bombing are the same "unauthenticated form, cheap to
# script" abuse shape, so one bucket per IP across all three is simpler than
# three separate ones and strictly more conservative. Same
# resets-on-restart/not-distributed caveat as the widget limiter below.
_AUTH_WINDOW_SECONDS = 60
_AUTH_MAX_PER_WINDOW = 8
_auth_calls: dict[str, list[float]] = {}


def _auth_rate_limited(client_ip: str) -> bool:
    import time

    now = time.monotonic()
    calls = [t for t in _auth_calls.get(client_ip, []) if now - t < _AUTH_WINDOW_SECONDS]
    calls.append(now)
    _auth_calls[client_ip] = calls
    return len(calls) > _AUTH_MAX_PER_WINDOW


# Very small in-memory guard against a leaked/scraped site key being hammered
# from a script — resets on restart and isn't shared across instances, so
# it's a first line of defense, not a real distributed rate limiter.
_WIDGET_TOKEN_WINDOW_SECONDS = 60
_WIDGET_TOKEN_MAX_PER_WINDOW = 30
_widget_token_calls: dict[str, list[float]] = {}

# Same first-line guard for the public, unauthenticated /token endpoint
# (used by the marketing-site live demo and the dashboard browser-test). It
# mints a real LiveKit join token and — when agentId is set — dispatches that
# agent, i.e. a billable call against a tenant's credits + our STT/LLM/TTS
# spend. Without a cap, anyone could script unlimited calls against any
# agent id. The marketing demo's 5-call cap is client-side localStorage only,
# so it's trivially bypassed — this is the server-side backstop. Keyed by
# client IP.
_TOKEN_WINDOW_SECONDS = 60
_TOKEN_MAX_PER_WINDOW = 12
_token_calls: dict[str, list[float]] = {}


def _token_rate_limited(client_ip: str) -> bool:
    import time

    now = time.monotonic()
    calls = [t for t in _token_calls.get(client_ip, []) if now - t < _TOKEN_WINDOW_SECONDS]
    calls.append(now)
    _token_calls[client_ip] = calls
    return len(calls) > _TOKEN_MAX_PER_WINDOW


def _widget_rate_limited(site_key: str) -> bool:
    import time

    now = time.monotonic()
    calls = [t for t in _widget_token_calls.get(site_key, []) if now - t < _WIDGET_TOKEN_WINDOW_SECONDS]
    calls.append(now)
    _widget_token_calls[site_key] = calls
    return len(calls) > _WIDGET_TOKEN_MAX_PER_WINDOW


# Separate, looser limiter for /widget/warm: it fires on every widget open
# (form shown), not just on a completed submit, so it sees several times the
# traffic of /widget/token for the same amount of real visitor activity.
_WIDGET_WARM_WINDOW_SECONDS = 60
_WIDGET_WARM_MAX_PER_WINDOW = 60
_widget_warm_calls: dict[str, list[float]] = {}


def _widget_warm_rate_limited(site_key: str) -> bool:
    import time

    now = time.monotonic()
    calls = [t for t in _widget_warm_calls.get(site_key, []) if now - t < _WIDGET_WARM_WINDOW_SECONDS]
    calls.append(now)
    _widget_warm_calls[site_key] = calls
    return len(calls) > _WIDGET_WARM_MAX_PER_WINDOW


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


class WidgetWarmRequest(BaseModel):
    siteKey: str
    path: str = ""


@app.post("/widget/warm")
async def warm_widget_agent(req: WidgetWarmRequest) -> dict:
    """Best-effort: pre-create the LiveKit room the instant a visitor opens
    the widget's pre-call form — well before they've finished typing their
    name/phone/email — so the agent (which auto-dispatches into a room as
    soon as it's created) gets a head start waking up if it's been idle.
    The room only carries {"agent_id", "site_id"} for now; /widget/token
    fills in the visitor's details once they actually submit, reusing this
    same room instead of creating a fresh one. If the visitor never submits,
    the empty room is just abandoned — the agent's own 90s
    wait_for_participant timeout (agent/main.py) cleans that job up on its
    own, same as it already does for a normal widget room nobody joins.

    req.path (location.pathname at open time) can steer this to a
    different agent than the site's own default — see
    calls_db.resolve_site_page.
    """
    site = calls_db.get_site_by_key(req.siteKey)
    if site is None or site["status"] == "paused":
        # Silent no-op, not an error — this is a speculative optimization
        # the widget fires on every open; a bad/paused site key will get a
        # proper error from /widget/token when the visitor actually submits.
        return {"room": None}
    if _widget_warm_rate_limited(req.siteKey):
        return {"room": None}

    api_key = os.environ.get("LIVEKIT_API_KEY")
    api_secret = os.environ.get("LIVEKIT_API_SECRET")
    livekit_url = os.environ.get("LIVEKIT_URL")
    if not api_key or not api_secret or not livekit_url:
        return {"room": None}

    import secrets

    resolved_agent_id = calls_db.resolve_site_page(site, req.path)["agentId"]
    room = f"widget-{site['id']}-{secrets.token_hex(8)}"
    try:
        async with api.LiveKitAPI() as lkapi:
            await lkapi.room.create_room(
                CreateRoomRequest(
                    name=room,
                    metadata=json.dumps({"agent_id": resolved_agent_id, "site_id": site["id"]}),
                    empty_timeout=_ROOM_EMPTY_TIMEOUT_S,
                    **_demo_dispatch_kwargs(resolved_agent_id),
                )
            )
        logger.info("widget warm: pre-created room=%s for site=%s agent_id=%s", room, site["name"], resolved_agent_id)
    except Exception:
        logger.warning("widget warm: could not pre-create room for site=%s", site["name"], exc_info=True)
        return {"room": None}
    return {"room": room}


class WidgetTokenRequest(BaseModel):
    siteKey: str
    identity: str
    name: str
    phone: str
    email: str
    room: str | None = None
    path: str = ""


@app.post("/widget/token")
async def create_widget_token(req: WidgetTokenRequest) -> dict:
    """Public, unauthenticated endpoint the embeddable widget.js calls from
    an arbitrary third-party website — auth is the site key itself, not a
    dashboard session. Issues a LiveKit token for a fresh room pre-tagged
    with {"agent_id", "site_id", "visitor_name", "visitor_phone", "visitor_email"}
    so agent/main.py's _call_context_from_job loads the right agent, seeds the
    lead with the details the visitor already typed in before the call even
    starts, and logs the call as a 'widget' call against this site — same
    mechanism phone numbers and dashboard browser tests already use for
    their own metadata shape.
    """
    masked_key = req.siteKey[:12] + "…" if len(req.siteKey) > 12 else req.siteKey
    site = calls_db.get_site_by_key(req.siteKey)
    if site is None:
        logger.warning("widget token rejected: unknown site_key=%s", masked_key)
        raise HTTPException(404, "Unknown site key")

    # Each field is only validated when this site's pre-call form actually
    # asks for it at all (widgetAskName/widgetAskPhone/widgetAskEmail — see
    # the dashboard's Website Widget page); a site configured to skip a
    # field entirely submits it blank, which used to be rejected outright
    # for name/phone. Beyond that, "require" decides whether a shown field
    # is mandatory — but even an optional field still gets its format
    # checked the moment the visitor actually typed something into it, so a
    # garbled phone/email never silently reaches the agent.
    name = req.name.strip()
    if site["widgetAskName"] and site["widgetRequireName"] and not name:
        logger.warning("widget token rejected: empty name (site_key=%s)", masked_key)
        raise HTTPException(400, "Name is required")
    name = name or "Website visitor"

    phone_typed = req.phone.strip() != ""
    if site["widgetAskPhone"] and (site["widgetRequirePhone"] or phone_typed) and not _looks_like_real_phone(req.phone):
        logger.warning("widget token rejected: invalid phone %r (site_key=%s)", req.phone, masked_key)
        raise HTTPException(400, "Enter a valid phone number in international format, e.g. +919812345678")

    email = req.email.strip()
    if site["widgetAskEmail"] and site["widgetRequireEmail"] and not email:
        logger.warning("widget token rejected: empty email (site_key=%s)", masked_key)
        raise HTTPException(400, "Email is required")
    if email and "@" not in email:
        logger.warning("widget token rejected: invalid email (site_key=%s)", masked_key)
        raise HTTPException(400, "Enter a valid email address")

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

    resolved_agent_id = calls_db.resolve_site_page(site, req.path)["agentId"]
    metadata = json.dumps(
        {
            "agent_id": resolved_agent_id,
            "site_id": site["id"],
            "visitor_name": name,
            "visitor_phone": req.phone.strip(),
            "visitor_email": email,
        }
    )
    # Reuse the room /widget/warm pre-created (and the agent may already be
    # joining/waiting in) when its prefix matches this site — updating its
    # metadata rather than creating a new one keeps the agent's head start.
    # Falls back to creating fresh whenever warm wasn't called, failed, or
    # named a room for a different site (stale/tampered value). Metadata is
    # always overwritten here regardless of what warm() guessed, so this is
    # the one place that actually decides which agent picks up the call.
    room = req.room if req.room and req.room.startswith(f"widget-{site['id']}-") else None
    try:
        async with api.LiveKitAPI() as lkapi:
            if room:
                try:
                    await lkapi.room.update_room_metadata(
                        UpdateRoomMetadataRequest(room=room, metadata=metadata)
                    )
                except Exception:
                    logger.info("widget token: warmed room=%s gone, creating fresh (site=%s)", room, site["name"])
                    room = None
            if not room:
                room = f"widget-{site['id']}-{secrets.token_hex(8)}"
                await lkapi.room.create_room(
                    CreateRoomRequest(
                        name=room,
                        metadata=metadata,
                        empty_timeout=_ROOM_EMPTY_TIMEOUT_S,
                        **_demo_dispatch_kwargs(resolved_agent_id),
                    )
                )
        logger.info("widget token issued: site=%s agent_id=%s room=%s", site["name"], resolved_agent_id, room)
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


# Looser than /widget/token's cap since a chat exchange is far cheaper than
# a live voice call (one text completion vs. STT+LLM+TTS for a whole
# call) - a normal back-and-forth conversation needs many requests.
_WIDGET_CHAT_WINDOW_SECONDS = 60
_WIDGET_CHAT_MAX_PER_WINDOW = 40
_widget_chat_calls: dict[str, list[float]] = {}


def _widget_chat_rate_limited(site_key: str) -> bool:
    import time

    now = time.monotonic()
    calls = [t for t in _widget_chat_calls.get(site_key, []) if now - t < _WIDGET_CHAT_WINDOW_SECONDS]
    calls.append(now)
    _widget_chat_calls[site_key] = calls
    return len(calls) > _WIDGET_CHAT_MAX_PER_WINDOW


class WidgetChatRequest(BaseModel):
    siteKey: str
    message: str
    history: list[dict] = []
    # Billing only - lets a chat-only session bill the same per-minute
    # credit rate as a voice call (calls_db.upsert_widget_chat_call) even
    # though no LiveKit room/agent ever runs for it. sessionId is a
    # client-generated id for the whole chat, stable across every turn;
    # startedAt is set once when the chat panel opens.
    sessionId: str | None = None
    startedAt: str | None = None
    name: str | None = None
    phone: str | None = None
    email: str | None = None
    path: str = ""


class WidgetFeedbackRequest(BaseModel):
    siteKey: str
    sessionId: str
    mode: str
    rating: str
    comment: str | None = None


class DemoFeedbackRequest(BaseModel):
    roomName: str
    rating: str
    comment: str | None = None


class WidgetTelemetryRequest(BaseModel):
    siteKey: str
    sessionId: str
    mode: str
    connectLatencyMs: int | None = None
    agentJoinLatencyMs: int | None = None
    firstResponseLatencyMs: int | None = None
    failureReason: str | None = None


@app.post("/widget/feedback")
def widget_feedback(req: WidgetFeedbackRequest) -> dict:
    site = calls_db.get_site_by_key(req.siteKey)
    if site is None:
        raise HTTPException(404, "Unknown site key")
    if req.rating not in ("helpful", "not_helpful"):
        raise HTTPException(400, "Invalid feedback rating")
    if req.mode not in ("chat", "voice"):
        raise HTTPException(400, "Invalid conversation mode")
    if not req.sessionId or len(req.sessionId) > 200:
        raise HTTPException(400, "Invalid conversation session")
    room_name = f"widget-chat-{req.sessionId}" if req.mode == "chat" else req.sessionId
    if not calls_db.set_widget_feedback(site["id"], room_name, req.rating, (req.comment or "").strip()[:500]):
        # Voice-call persistence can finish just after LiveKit disconnects;
        # the widget retries once when this short race happens.
        raise HTTPException(404, "Conversation is still being saved")
    return {"ok": True}


@app.post("/demo/feedback")
def demo_feedback(req: DemoFeedbackRequest) -> dict:
    """Same as /widget/feedback, for the marketing site's own DemoOrbCard
    orb — no siteKey involved, since there's no tenant site, just the
    platform's own demo call."""
    if req.rating not in ("helpful", "not_helpful"):
        raise HTTPException(400, "Invalid feedback rating")
    if not req.roomName or len(req.roomName) > 200:
        raise HTTPException(400, "Invalid conversation session")
    if not calls_db.set_demo_feedback(req.roomName, req.rating, (req.comment or "").strip()[:500]):
        # Same short race as widget_feedback above — call persistence can
        # finish just after LiveKit disconnects.
        raise HTTPException(404, "Conversation is still being saved")
    return {"ok": True}


@app.post("/widget/telemetry")
def widget_telemetry(req: WidgetTelemetryRequest) -> dict:
    site = calls_db.get_site_by_key(req.siteKey)
    if site is None:
        raise HTTPException(404, "Unknown site key")
    if req.mode not in ("chat", "voice") or not req.sessionId or len(req.sessionId) > 200:
        raise HTTPException(400, "Invalid conversation session")
    values = [req.connectLatencyMs, req.agentJoinLatencyMs, req.firstResponseLatencyMs]
    if any(v is not None and (v < 0 or v > 300_000) for v in values):
        raise HTTPException(400, "Invalid timing value")
    room_name = f"widget-chat-{req.sessionId}" if req.mode == "chat" else req.sessionId
    saved = calls_db.set_widget_telemetry(site["id"], room_name, {
        "connectLatencyMs": req.connectLatencyMs,
        "agentJoinLatencyMs": req.agentJoinLatencyMs,
        "firstResponseLatencyMs": req.firstResponseLatencyMs,
        "failureReason": (req.failureReason or "")[:120] or None,
    })
    return {"ok": True, "saved": saved}


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


@app.post("/widget/chat")
def widget_chat_route(req: WidgetChatRequest) -> StreamingResponse:
    """Public, unauthenticated text-chat turn for a site in 'chat' or
    'both' widget mode — same site_key-is-the-auth model as /widget/token,
    but answers with a plain OpenAI chat completion grounded in the site's
    agent config instead of placing a LiveKit call. Stateless: the widget
    resends the full conversation history every turn (see widget_chat.py).

    Streams the reply back as Server-Sent Events (one {"delta": "..."} event
    per token chunk, then {"done": true}) instead of waiting for the full
    completion — a non-streaming JSON response meant a visitor stared at a
    typing indicator for the entire generation with nothing to show for it;
    this way text appears as it's generated, same as a normal chat product."""
    masked_key = req.siteKey[:12] + "…" if len(req.siteKey) > 12 else req.siteKey
    site = calls_db.get_site_by_key(req.siteKey)
    if site is None:
        logger.warning("widget chat rejected: unknown site_key=%s", masked_key)
        raise HTTPException(404, "Unknown site key")
    if site["status"] == "paused":
        raise HTTPException(403, "This site's widget is currently paused")
    if site["widgetMode"] not in ("chat", "both"):
        raise HTTPException(403, "Chat is not enabled for this site")
    if _widget_chat_rate_limited(req.siteKey):
        raise HTTPException(429, "Too many messages right now — try again shortly")

    resolved_agent_id = calls_db.resolve_site_page(site, req.path)["agentId"]
    if not resolved_agent_id:
        raise HTTPException(400, "This site has no agent assigned yet")
    agent = calls_db.get_agent_by_id_unscoped(resolved_agent_id)
    if agent is None:
        raise HTTPException(400, "This site's agent no longer exists")

    kb_content, kb_strict = "", True
    if agent.get("kbId"):
        kb_content = calls_db.get_kb_content_for_prompt(agent["kbId"])
        kb_strict = calls_db.is_kb_strict_for_prompt(agent["kbId"])

    def event_generator():
        # A RuntimeError here surfaces only once we start iterating this
        # generator, which is after the 200 + SSE headers already went out —
        # too late for HTTPException, so failures mid-stream are reported as
        # an {"error": ...} event instead and the widget renders that.
        parts: list[str] = []
        try:
            for delta in widget_chat.stream_widget_chat(req.message, req.history, agent, kb_content, kb_strict):
                parts.append(delta)
                yield _sse({"delta": delta})
        except RuntimeError as exc:
            logger.error("widget chat stream failed for site=%s: %s", site["name"], exc)
            yield _sse({"error": "Could not reach the chat assistant — please try again shortly"})
            return

        reply = "".join(parts).strip()
        if not reply:
            logger.error("widget chat stream returned an empty reply for site=%s", site["name"])
            yield _sse({"error": "Chat model returned an empty reply"})
            return
        yield _sse({"done": True})

        if req.sessionId and req.startedAt:
            transcript = [
                *req.history,
                {"role": "user", "content": req.message},
                {"role": "assistant", "content": reply},
            ]
            lead = {"name": req.name, "phone": req.phone, "email": req.email}
            try:
                calls_db.upsert_widget_chat_call(site, agent, req.sessionId, req.startedAt, transcript, lead)
            except Exception:
                logger.exception("failed to log widget chat call for site=%s", site["name"])

    return StreamingResponse(event_generator(), media_type="text/event-stream")
