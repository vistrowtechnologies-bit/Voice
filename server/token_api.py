import json
import logging
import os
import secrets
import urllib.parse
import urllib.request
from pathlib import Path

import admin_db
import auth
import calls_db
import email_sender
import kb_crawl
import kb_extract
import livekit_sip
from dotenv import load_dotenv
from fastapi import Body, Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, RedirectResponse
from livekit import api
from livekit.api import CreateRoomRequest, ListParticipantsRequest, ListRoomsRequest
from pydantic import BaseModel

WIDGET_JS_PATH = Path(__file__).resolve().parent / "static" / "widget.js"
WORDPRESS_PLUGIN_ZIP_PATH = Path(__file__).resolve().parent / "static" / "vistrow-voice-widget.zip"
AGENT_ORB_VIDEO_PATH = Path(__file__).resolve().parent / "static" / "agent-orb.mp4"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("telephony")

load_dotenv()

app = FastAPI()
calls_db.init_tables()

# Cookie is Secure in production (HTTPS) and not in local http dev — set
# AUTH_COOKIE_SECURE=1 on the deployment. In prod the browser hits the app's
# own origin and Vercel rewrites /api to the backend, so the session cookie
# is same-site either way (no cross-origin cookie needed).
_COOKIE_SECURE = os.environ.get("AUTH_COOKIE_SECURE", "").lower() in ("1", "true", "yes")

# Routes reachable without a session. Everything else (the dashboard/admin
# API) requires a valid session cookie, enforced by the middleware below.
_PUBLIC_PATHS = {
    "/token",                          # LiveKit token for the public demo + browser test
    "/widget.js",                      # embedded widget script
    "/widget/token",                   # widget call token (runs on customers' sites)
    "/widget/wordpress-plugin.zip",    # plugin download
    "/agent-orb.mp4",                  # widget avatar video
    "/telephony/enablex/inbound-event",  # EnableX inbound webhook (their server calls it)
}
_PUBLIC_PREFIXES = ("/auth/",)         # signup/login/logout/me handle their own logic


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
        # Stash for downstream handlers/dependencies (Phase 3 scopes queries by it).
        request.state.user_id = session["uid"]
        request.state.account_id = session["aid"]
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


# --------------------------------------------------------------------- auth


class SignupRequest(BaseModel):
    name: str
    company: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


def _set_session_cookie(response: Response, user_id: int, account_id: int) -> None:
    response.set_cookie(
        auth.COOKIE_NAME,
        auth.make_session_token(user_id, account_id),
        max_age=auth.SESSION_TTL_SECONDS,
        httponly=True,
        secure=_COOKIE_SECURE,
        samesite="lax",
        path="/",
    )


def _me_payload(user_id: int, impersonator_id: int | None = None) -> dict:
    user = calls_db.get_user_by_id(user_id)
    if user is None:
        raise HTTPException(401, "Session user no longer exists")
    payload = {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "role": user["role"],
        "accountId": user["account_id"],
        "accountName": user["account_name"],
        "plan": user["account_plan"],
        "isPlatformOwner": bool(user["is_platform_owner"]),
        "onboarded": user["onboarded_at"] is not None,
        "impersonating": False,
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
    email_configured = bool(os.environ.get("RESEND_API_KEY") or os.environ.get("SMTP_HOST"))
    return {"oauthProviders": providers, "emailConfigured": email_configured}


_OAUTH_STATE_COOKIE = "vv_oauth_state"


def _oauth_or_create_user(email: str, name: str, provider: str = "password") -> dict:
    """Finds the user by email, or provisions a brand-new account for them
    (mirrors /auth/signup) — OAuth is just a passwordless entry into the same
    signup path. A random unusable password hash fills the required column;
    the user can set a real password later via forgot-password if they want
    one for non-OAuth login too. `provider` is stamped for the admin panel."""
    email = email.lower()
    user = calls_db.get_user_by_email(email)
    if user is not None:
        calls_db.record_login(user["id"], provider)
        return {"user_id": user["id"], "account_id": user["account_id"]}
    company_name = f"{name.split(' ')[0]}'s Workspace" if name else email.split("@")[0]
    created = calls_db.create_account_with_owner(
        company_name, name or email.split("@")[0], email, auth.hash_password(secrets.token_urlsafe(32))
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
    _set_session_cookie(redirect, account["user_id"], account["account_id"])
    return redirect


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
    _set_session_cookie(redirect, account["user_id"], account["account_id"])
    return redirect


@app.post("/auth/signup")
def auth_signup(req: SignupRequest, response: Response) -> dict:
    email = req.email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(400, "Enter a valid email address")
    if len(req.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    if not req.name.strip() or not req.company.strip():
        raise HTTPException(400, "Name and company are required")
    if calls_db.email_exists(email):
        raise HTTPException(409, "An account with this email already exists")
    created = calls_db.create_account_with_owner(
        req.company.strip(), req.name.strip(), email, auth.hash_password(req.password)
    )
    _set_session_cookie(response, created["user_id"], created["account_id"])
    calls_db.record_login(created["user_id"], "password")
    logger.info("new signup: account #%s (%s)", created["account_id"], email)
    return {"ok": True, "user": _me_payload(created["user_id"])}


@app.post("/auth/login")
def auth_login(req: LoginRequest, response: Response) -> dict:
    user = calls_db.get_user_by_email(req.email.strip().lower())
    if user is None or not auth.verify_password(req.password, user["password_hash"]):
        # Same message either way — don't reveal which emails are registered.
        raise HTTPException(401, "Incorrect email or password")
    _set_session_cookie(response, user["id"], user["account_id"])
    calls_db.record_login(user["id"])
    return {"ok": True, "user": _me_payload(user["id"])}


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
    # Always report success — never reveal whether an email is registered.
    user = calls_db.get_user_by_email(req.email.strip().lower())
    if user is not None:
        token = calls_db.create_password_reset(user["id"])
        link = f"{_app_base_url(request)}/reset-password?token={token}"
        html = (
            f"<p>Hi {user['name']},</p>"
            "<p>We received a request to reset your Vistrow Voice password. "
            f'Click the link below to choose a new one (valid for 1 hour):</p>'
            f'<p><a href="{link}">Reset your password</a></p>'
            "<p>If you didn't request this, you can safely ignore this email.</p>"
        )
        sent = email_sender.send_email(user["email"], "Reset your Vistrow Voice password", html)
        if not sent:
            # Email delivery isn't set up yet — surface the link in the server
            # log so the operator can still complete a reset during setup.
            logger.info("password reset link for %s (email not configured): %s", user["email"], link)
    return {"ok": True}


@app.post("/auth/reset-password")
def auth_reset_password(req: ResetPasswordRequest, response: Response) -> dict:
    if len(req.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    user_id = calls_db.consume_password_reset(req.token)
    if user_id is None:
        raise HTTPException(400, "This reset link is invalid or has expired")
    calls_db.update_user_profile(user_id, password_hash=auth.hash_password(req.password))
    # Log them straight in on success.
    user = calls_db.get_user_by_id(user_id)
    if user is not None:
        _set_session_cookie(response, user["id"], user["account_id"])
        return {"ok": True, "user": _me_payload(user_id)}
    return {"ok": True}


@app.post("/auth/logout")
def auth_logout(response: Response) -> dict:
    response.delete_cookie(auth.COOKIE_NAME, path="/")
    return {"ok": True}


@app.get("/auth/me")
def auth_me(request: Request) -> dict:
    session = auth.read_session_token(request.cookies.get(auth.COOKIE_NAME))
    if session is None:
        raise HTTPException(401, "Not authenticated")
    return {"user": _me_payload(session["uid"], session.get("imp"))}


class UpdateProfileRequest(BaseModel):
    name: str | None = None
    currentPassword: str | None = None
    newPassword: str | None = None


@app.patch("/profile")
def update_profile(req: UpdateProfileRequest, user: dict = Depends(current_user)) -> dict:
    name = req.name.strip() if req.name is not None else None
    if name is not None and not name:
        raise HTTPException(400, "Name can't be empty")

    password_hash = None
    if req.newPassword is not None:
        if len(req.newPassword) < 8:
            raise HTTPException(400, "New password must be at least 8 characters")
        stored_hash = calls_db.get_password_hash(user["user_id"])
        if stored_hash is None or not req.currentPassword or not auth.verify_password(req.currentPassword, stored_hash):
            raise HTTPException(401, "Current password is incorrect")
        password_hash = auth.hash_password(req.newPassword)

    calls_db.update_user_profile(user["user_id"], name=name, password_hash=password_hash)
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


@app.post("/onboarding/complete")
def complete_onboarding(user: dict = Depends(current_user)) -> dict:
    calls_db.mark_account_onboarded(user["account_id"])
    return {"user": _me_payload(user["user_id"])}


# --------------------------------------------------------------- api keys


class CreateApiKeyRequest(BaseModel):
    name: str = "API key"


@app.get("/api-keys")
def list_api_keys(user: dict = Depends(current_user)) -> list[dict]:
    return calls_db.list_api_keys(user["account_id"])


@app.post("/api-keys")
def create_api_key(req: CreateApiKeyRequest, user: dict = Depends(current_user)) -> dict:
    # Returns the full key exactly once; the client must copy it immediately.
    return calls_db.create_api_key(user["account_id"], req.name)


@app.delete("/api-keys/{key_id}")
def delete_api_key(key_id: int, user: dict = Depends(current_user)) -> dict:
    calls_db.delete_api_key(key_id, user["account_id"])
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
    html = (
        f"<p>Hi {user['name']},</p><p>A Vistrow Voice support agent started a password reset for your "
        f'account. Click below to set a new password (valid 1 hour):</p><p><a href="{link}">Reset password</a></p>'
    )
    sent = email_sender.send_email(user["email"], "Reset your Vistrow Voice password", html)
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
    _set_session_cookie(response, owner["id"], owner["account_id"])
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


@app.get("/dashboard/analytics")
def dashboard_analytics(user: dict = Depends(current_user)) -> dict:
    return calls_db.analytics(user["account_id"])


# -------------------------------------------------------------- agents


@app.get("/agents")
def list_agents(user: dict = Depends(current_user)) -> list[dict]:
    return calls_db.list_agents(user["account_id"])


@app.post("/agents")
def create_agent(data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    return calls_db.create_agent(data, user["account_id"])


@app.patch("/agents/{agent_id}")
def update_agent(agent_id: int, data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    if ("isPlatformDemo" in data or "is_platform_demo" in data) and not calls_db.is_platform_owner(
        user["account_id"]
    ):
        # Only the platform operator's own account may redirect the public
        # marketing site's live demo to one of its agents — silently drop
        # the field rather than error, so an unrelated edit (name, voice)
        # bundled in the same request still saves.
        data = {k: v for k, v in data.items() if k not in ("isPlatformDemo", "is_platform_demo")}
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


@app.post("/contacts/import")
def import_contacts(data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    count = calls_db.import_contacts_csv(data.get("csv", ""), user["account_id"])
    return {"imported": count}


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


# ----------------------------------------------------------- campaigns


@app.get("/inbound-routes")
def list_inbound_routes(user: dict = Depends(current_user)) -> list[dict]:
    return calls_db.list_inbound_routes(user["account_id"])


@app.post("/inbound-routes")
def create_inbound_route(data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    calls_db.create_inbound_route(data, user["account_id"])
    return {"ok": True}


@app.get("/campaigns")
def list_campaigns(user: dict = Depends(current_user)) -> list[dict]:
    return calls_db.list_campaigns(user["account_id"])


@app.post("/campaigns")
def create_campaign(data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    calls_db.create_campaign(data, user["account_id"])
    return {"ok": True}


@app.patch("/campaigns/{campaign_id}")
def update_campaign(campaign_id: int, data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    calls_db.update_campaign_status(campaign_id, data.get("status", "paused"), user["account_id"])
    return {"ok": True}


# -------------------------------------------------------- integrations


@app.get("/integrations")
def list_integrations(user: dict = Depends(current_user)) -> list[dict]:
    return calls_db.list_integrations(user["account_id"])


@app.patch("/integrations/{key}")
def update_integration(key: str, data: dict = Body(...), user: dict = Depends(current_user)) -> dict:
    calls_db.update_integration(key, data.get("status", "not_connected"), data.get("config", {}), user["account_id"])
    return {"ok": True}


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
    calls_db.assign_phone_number(number_id, data.get("agentId"), user["account_id"])
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
    return calls_db.place_test_call(from_number, to_number, user["account_id"])


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
    same agent that powers browser calls handles the phone call — the
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
    account_id = number_row["accountId"]

    accept = calls_db.enablex_accept_call(voice_id, account_id)
    if not accept.get("ok"):
        logger.error("failed to accept EnableX call %s: %s", voice_id, accept.get("error"))
        return accept

    sip_uri = f"sip:{dialed_number}@{livekit_sip.sip_host()}"
    bridge = calls_db.enablex_connect_to_sip(voice_id, dialed_number, sip_uri, account_id)
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
def billing(user: dict = Depends(current_user)) -> dict:
    return calls_db.billing_summary(user["account_id"])


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
        filename="vistrow-voice-widget.zip",
    )


@app.get("/agent-orb.mp4")
def widget_agent_orb() -> FileResponse:
    """Same looping orb video used on the dashboard's browser-call screen —
    served from here too so the embeddable widget (a separate, dependency-
    free bundle) can show the identical agent visual without needing its own
    copy of the asset shipped in the widget.js bundle itself."""
    return FileResponse(AGENT_ORB_VIDEO_PATH, media_type="video/mp4")


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
    )


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


@app.delete("/widget/sites/{site_id}")
def delete_site(site_id: int, user: dict = Depends(current_user)) -> dict:
    calls_db.delete_site(site_id, user["account_id"])
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
