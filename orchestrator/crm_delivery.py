"""Zoho CRM and "Sign in with Google" Sheets lead delivery for the
orchestrator pipeline.

Mirror of agent/tools.py's _zoho_should_send .. _deliver_google_sheet_row
(the Zoho CRM and Google Sheets OAuth helpers). The orchestrator image only
ships orchestrator/ (see Dockerfile), so it cannot import agent/; the body
below is a verbatim copy of those lines. Keep the two in step:
test_crm_delivery.py checks the copy still matches agent/tools.py.
"""

import asyncio
import json
import logging
import os
import re
import time
from datetime import datetime, timedelta, timezone

import aiohttp

import db

logger = logging.getLogger("orchestrator-tools")

# Same as agent/tools.py's (and tools.py's) _CHANNEL_LABELS.
_CHANNEL_LABELS = {"phone": "Phone", "widget": "Website Widget", "browser": "Web"}

# --- BEGIN MIRROR of agent/tools.py ---
def _zoho_should_send(lead: dict) -> bool:
    """One Zoho lead per real caller. Every event used to create a new record
    (each mid-call lead update, callback, booking, and the end-of-call event
    of EVERY call), so the CRM filled with "Unknown caller" rows with no
    phone or email and repeats of the same caller (10 Oct 2026). Only the
    end-of-call event goes - it already carries everything captured plus the
    post-call read - and only when there is a way to reach the person."""
    return lead.get("type") == "call_completed" and bool(
        str(lead.get("phone") or "").strip() or str(lead.get("email") or "").strip()
    )


def _zoho_description(lead: dict) -> str:
    lines = []
    for key, value in (lead.get("extracted_data") or {}).items():
        if value not in (None, "", [], {}):
            lines.append(f"{str(key).replace('_', ' ').capitalize()}: {value}")
    if lead.get("use_case") or lead.get("message"):
        lines.append(str(lead.get("use_case") or lead.get("message")))
    meta = []
    if lead.get("agent_name"):
        meta.append(f"Agent: {lead['agent_name']}")
    if lead.get("duration_seconds"):
        meta.append(f"Call length: {round(float(lead['duration_seconds']))} s")
    if lead.get("language"):
        meta.append(f"Language: {lead['language']}")
    if lead.get("page_path"):
        meta.append(f"Page: {lead['page_path']}")
    if lead.get("recording_url"):
        meta.append(f"Recording: {lead['recording_url']}")
    return "\n".join(lines + meta)[:32000]


def _zoho_lead_body(lead: dict) -> dict:
    # Mirrors server/integrations_dispatch.py's _zoho_lead_body - keep both in
    # step (agent/ and server/ are separate deployments). Zoho's Leads module
    # requires Last_Name (and Company on most layouts), so the caller's name
    # fills both when no company was captured. Empty fields are left out
    # rather than sent as "": the record is upserted on Phone/Email, and an
    # empty match field could match an unrelated lead.
    name = str(lead.get("name") or "").strip() or "Website visitor"
    record = {
        "Last_Name": name,
        "Company": str(lead.get("company") or "").strip() or name,
        "Phone": str(lead.get("phone") or "").strip(),
        "Email": str(lead.get("email") or "").strip(),
        "Description": _zoho_description(lead),
        "Lead_Source": _CHANNEL_LABELS.get(lead.get("channel"), lead.get("channel") or "") or "Call",
    }
    record = {k: v for k, v in record.items() if v}
    return {
        "data": [record],
        # Same person calling again updates their lead instead of adding one.
        "duplicate_check_fields": [f for f in ("Phone", "Email") if record.get(f)],
    }


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


async def _zoho_refresh_access_token(http: aiohttp.ClientSession, config: dict) -> tuple[str, dict] | None:
    client_id = os.environ.get("ZOHO_OAUTH_CLIENT_ID")
    client_secret = os.environ.get("ZOHO_OAUTH_CLIENT_SECRET")
    refresh_token = config.get("refresh_token")
    accounts_base = _zoho_host(config.get("accounts_base"), _ZOHO_ACCOUNTS_RE, "https://accounts.zoho.com")
    if not client_id or not client_secret or not refresh_token:
        return None
    try:
        async with http.post(
            f"{accounts_base}/oauth/v2/token",
            data={
                "refresh_token": refresh_token,
                "client_id": client_id,
                "client_secret": client_secret,
                "grant_type": "refresh_token",
            },
        ) as resp:
            data = await resp.json()
    except Exception:
        logger.warning("zoho_crm: token refresh failed", exc_info=True)
        return None
    access_token = data.get("access_token")
    if not access_token:
        logger.warning("zoho_crm: token refresh returned no access_token: %s", data.get("error"))
        return None
    updated = {**config, "access_token": access_token, "expires_at": time.time() + float(data.get("expires_in") or 3600)}
    return access_token, updated


async def _deliver_zoho_crm_lead(http: aiohttp.ClientSession, account_id: int | None, config: dict, lead: dict) -> bool:
    """Same authenticated-API shape as server/integrations_dispatch.py's
    _deliver_zoho_crm, reimplemented here because this is a separate
    process (agent/, not server/) with its own venv and its own DB
    connection — the two can't share a Python module directly."""
    access_token = config.get("access_token")
    api_domain = _zoho_host(config.get("api_domain"), _ZOHO_API_RE, "https://www.zohoapis.com")
    if not access_token or not config.get("refresh_token"):
        logger.warning("zoho_crm: config missing token fields, keys=%s", sorted(config.keys()))
        return False

    async def _post(token: str) -> tuple[bool, int | None]:
        try:
            async with http.post(
                f"{api_domain}/crm/v2/Leads/upsert",
                json=_zoho_lead_body(lead),
                headers={"Authorization": f"Zoho-oauthtoken {token}"},
            ) as resp:
                return (200 <= resp.status < 300), resp.status
        except Exception:
            logger.warning("zoho_crm delivery failed", exc_info=True)
            return False, None

    if time.time() >= float(config.get("expires_at") or 0) - 60:
        refreshed = await _zoho_refresh_access_token(http, config)
        if refreshed:
            access_token, config = refreshed
            db.update_integration_config(account_id, "zoho_crm", config)

    ok, status = await _post(access_token)
    if not ok and status == 401:
        refreshed = await _zoho_refresh_access_token(http, config)
        if refreshed:
            access_token, config = refreshed
            db.update_integration_config(account_id, "zoho_crm", config)
            ok, status = await _post(access_token)
    return ok


# ---------------------------------------------------------------------------
# Google Sheets over OAuth ("Sign in with Google"). Async twin of
# server/google_sheets.py - keep the row shape and the owner-facing error
# wording identical (separate deployables, no shared module). Rows go in via
# batchUpdate appendCells addressed by the tab's numeric sheetId, so a
# renamed tab still works, and text cells are stringValues Sheets never
# parses as formulas; see server/google_sheets.py's docstring for the full
# reasoning.
_SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_SHEETS_ERR_ACCESS_REMOVED = "Google access was removed. Sign in with Google again."
_SHEETS_ERR_SHEET_DELETED = "The leads sheet was deleted. Reconnect to create a new one."
_SHEETS_ERR_NO_PERMISSION = "Vistrow Voice can no longer edit the leads sheet. Sign in with Google again."
_SHEETS_ERR_API_DISABLED = "Google Sheets is turned off for Vistrow Voice's Google project. Please contact support."
_SHEETS_ERR_BUSY = "Google Sheets is busy right now. The next lead will try again."
_IST = timezone(timedelta(hours=5, minutes=30))


def _sheets_safe_text(value: object) -> str:
    """A leading = + - @ gets an apostrophe, so the text can't run as a
    formula even after the owner exports the sheet to CSV and opens it in
    Excel (Sheets itself never parses a stringValue)."""
    text = str(value if value is not None else "").strip()
    return "'" + text if text[:1] in ("=", "+", "-", "@") else text


def _sheets_safe_phone(value: object) -> str:
    # A real phone number keeps its leading + (the Phone column is plain-text
    # formatted); anything that isn't digits/spaces/()- is treated as text.
    text = str(value or "").strip()
    if text and all(ch.isdigit() or ch in "+ -()" for ch in text) and "+" not in text[1:]:
        return text
    return _sheets_safe_text(text)


def _sheets_details(lead: dict) -> str:
    """_zoho_description without the meta lines (agent, length, language,
    page, recording) - the sheet has its own columns for those."""
    lines = []
    for key, value in (lead.get("extracted_data") or {}).items():
        if value not in (None, "", [], {}):
            lines.append(f"{str(key).replace('_', ' ').capitalize()}: {value}")
    if lead.get("use_case") or lead.get("message"):
        lines.append(str(lead.get("use_case") or lead.get("message")))
    return "\n".join(lines)[:45000]  # Sheets caps a cell at 50,000 characters


# Same as server/google_sheets.py's play_url/recording_cell: a "▶ Play
# recording" link to the browser player page, in the brand's dark purple.
_SHEETS_LINK_TEXT = "▶ Play recording"
_SHEETS_LINK_RGB = {"red": 0x7e / 255, "green": 0x22 / 255, "blue": 0xce / 255}


def _sheets_recording_cell(recording_url: object) -> dict:
    url = str(recording_url or "").strip()
    if "/public/calls/" in url and "/recording?token=" in url:
        url = url.replace("/recording?token=", "/play?token=", 1)
    if not url.startswith(("https://", "http://")):
        return {"userEnteredValue": {"stringValue": ""}}
    return {
        "userEnteredValue": {"stringValue": _SHEETS_LINK_TEXT},
        "userEnteredFormat": {"textFormat": {"link": {"uri": url}, "foregroundColor": _SHEETS_LINK_RGB, "bold": True}},
    }


def _sheets_row_cells(lead: dict, now: datetime | None = None) -> list[dict]:
    extracted = lead.get("extracted_data") or {}
    # Sheets' date serial (days since 1899-12-30) of the IST wall-clock time:
    # a real date-time cell whatever timezone the spreadsheet is set to.
    local = (now or datetime.now(timezone.utc)).astimezone(_IST).replace(tzinfo=None)
    serial = (local - datetime(1899, 12, 30)).total_seconds() / 86400

    def text(value: object) -> dict:
        return {"userEnteredValue": {"stringValue": _sheets_safe_text(value)}}

    def number(value: object) -> dict:
        try:
            return {"userEnteredValue": {"numberValue": round(float(value))}}
        except (TypeError, ValueError):
            return text("")

    duration, call_id = lead.get("duration_seconds"), lead.get("call_id")
    return [
        {"userEnteredValue": {"numberValue": serial}},
        text(lead.get("name") or ""),
        {"userEnteredValue": {"stringValue": _sheets_safe_phone(lead.get("phone"))}},
        text(lead.get("email") or ""),
        text(lead.get("company") or extracted.get("company") or ""),
        text(_CHANNEL_LABELS.get(lead.get("channel"), lead.get("channel") or "")),
        text(lead.get("agent_name") or ""),
        text(lead.get("language") or ""),
        number(duration) if duration not in (None, "") else text(""),
        text(_sheets_details(lead)),
        text(lead.get("page_path") or ""),
        _sheets_recording_cell(lead.get("recording_url")),
        number(call_id) if call_id not in (None, "") else text(""),
    ]


def _sheets_append_body(sheet_id: int, lead: dict, now: datetime | None = None) -> dict:
    return {"requests": [{"appendCells": {
        "sheetId": sheet_id,
        "rows": [{"values": _sheets_row_cells(lead, now)}],
        "fields": "userEnteredValue,userEnteredFormat.textFormat",
    }}]}


_SHEETS_HEADERS = [
    "Date/time (IST)", "Name", "Phone", "Email", "Company", "Channel", "Agent",
    "Language", "Duration (s)", "Details", "Page", "Recording", "Call ID",
]
_SHEETS_COLUMN_WIDTHS = [150, 160, 140, 200, 160, 120, 120, 90, 90, 360, 180, 220, 80]


# Copy of server/google_sheets.py format_requests (agent/ and server/ are
# separate deployables); test_sheets_agent_tabs.py checks they match. Used
# to style a new per-agent tab.
def _sheets_rgb(hex_colour: str) -> dict:
    h = hex_colour.lstrip("#")
    return {"red": int(h[0:2], 16) / 255, "green": int(h[2:4], 16) / 255, "blue": int(h[4:6], 16) / 255}


_SHEETS_PURPLE = _sheets_rgb("#9333ea")
_SHEETS_PURPLE_DARK = _sheets_rgb("#7e22ce")
_SHEETS_LAVENDER = _sheets_rgb("#faf5ff")
_SHEETS_WHITE = _sheets_rgb("#ffffff")


def _sheets_format_requests(sheet_id: int, add_banding: bool = True, add_filter: bool = True) -> list[dict]:
    """One batchUpdate that turns a blank tab into the leads sheet in Vistrow
    colours: purple frozen header with white bold text, lavender/white row
    bands, a filter on every column, Date/time as a date-time, Phone as plain
    text (so a typed or pasted +91 number keeps its +), and readable column
    widths. add_banding/add_filter are False when restyling a sheet that
    already has them - Google rejects a second band or filter on the same
    range, and the whole batch with it."""
    header_format = {
        "backgroundColor": _SHEETS_PURPLE,
        "textFormat": {"bold": True, "foregroundColor": _SHEETS_WHITE, "fontSize": 10},
        "verticalAlignment": "MIDDLE",
        "horizontalAlignment": "LEFT",
    }
    requests: list[dict] = [
        {
            "updateCells": {
                "start": {"sheetId": sheet_id, "rowIndex": 0, "columnIndex": 0},
                "rows": [{"values": [
                    {"userEnteredValue": {"stringValue": h}, "userEnteredFormat": header_format}
                    for h in _SHEETS_HEADERS
                ]}],
                "fields": "userEnteredValue,userEnteredFormat(backgroundColor,textFormat,verticalAlignment,horizontalAlignment)",
            }
        },
        {
            "updateSheetProperties": {
                "properties": {
                    "sheetId": sheet_id,
                    "gridProperties": {"frozenRowCount": 1},
                    "tabColorStyle": {"rgbColor": _SHEETS_PURPLE},
                },
                "fields": "gridProperties.frozenRowCount,tabColorStyle",
            }
        },
        {
            "repeatCell": {
                "range": {"sheetId": sheet_id, "startRowIndex": 1, "startColumnIndex": 0, "endColumnIndex": 1},
                "cell": {"userEnteredFormat": {"numberFormat": {"type": "DATE_TIME", "pattern": "yyyy-mm-dd hh:mm"}}},
                "fields": "userEnteredFormat.numberFormat",
            }
        },
        {
            "repeatCell": {
                "range": {"sheetId": sheet_id, "startRowIndex": 1, "startColumnIndex": 2, "endColumnIndex": 3},
                "cell": {"userEnteredFormat": {"numberFormat": {"type": "TEXT"}}},
                "fields": "userEnteredFormat.numberFormat",
            }
        },
        {
            # Body rows: middle-aligned and clipped, so a long Details cell
            # doesn't make one row ten lines tall.
            "repeatCell": {
                "range": {"sheetId": sheet_id, "startRowIndex": 1, "startColumnIndex": 0, "endColumnIndex": len(_SHEETS_HEADERS)},
                "cell": {"userEnteredFormat": {"verticalAlignment": "MIDDLE", "wrapStrategy": "CLIP"}},
                "fields": "userEnteredFormat(verticalAlignment,wrapStrategy)",
            }
        },
        {
            "updateDimensionProperties": {
                "range": {"sheetId": sheet_id, "dimension": "ROWS", "startIndex": 0, "endIndex": 1},
                "properties": {"pixelSize": 36},
                "fields": "pixelSize",
            }
        },
    ]
    if add_banding:
        requests.append({
            "addBanding": {"bandedRange": {
                "range": {"sheetId": sheet_id, "startRowIndex": 0, "startColumnIndex": 0, "endColumnIndex": len(_SHEETS_HEADERS)},
                "rowProperties": {
                    "headerColorStyle": {"rgbColor": _SHEETS_PURPLE},
                    "firstBandColorStyle": {"rgbColor": _SHEETS_WHITE},
                    "secondBandColorStyle": {"rgbColor": _SHEETS_LAVENDER},
                },
            }}
        })
    if add_filter:
        requests.append({
            "setBasicFilter": {"filter": {
                "range": {"sheetId": sheet_id, "startRowIndex": 0, "startColumnIndex": 0, "endColumnIndex": len(_SHEETS_HEADERS)},
            }}
        })
    for index, width in enumerate(_SHEETS_COLUMN_WIDTHS):
        requests.append({
            "updateDimensionProperties": {
                "range": {"sheetId": sheet_id, "dimension": "COLUMNS", "startIndex": index, "endIndex": index + 1},
                "properties": {"pixelSize": width},
                "fields": "pixelSize",
            }
        })
    return requests


# Same as server/google_sheets.py FIELD_COLUMNS / column_visibility_requests.
_SHEETS_FIELD_COLUMNS = {
    "name": 1, "phone": 2, "email": 3, "company": 4, "channel": 5, "agent": 6, "language": 7,
    "duration": 8, "details": 9, "page": 10, "recording": 11, "call_id": 12,
}


def _sheets_column_visibility_requests(sheet_id: int, fields: list | None) -> list[dict]:
    chosen = set(fields) if fields else set(_SHEETS_FIELD_COLUMNS)
    return [
        {
            "updateDimensionProperties": {
                "range": {"sheetId": sheet_id, "dimension": "COLUMNS", "startIndex": col, "endIndex": col + 1},
                "properties": {"hiddenByUser": field not in chosen},
                "fields": "hiddenByUser",
            }
        }
        for field, col in _SHEETS_FIELD_COLUMNS.items()
    ]


def _sheets_tab_title(agent_name: object) -> str:
    """The agent's tab name: its name, trimmed to Sheets' 100-char limit
    with characters Sheets rejects in a title removed."""
    title = " ".join(str(agent_name or "").replace("'", "").split())
    for ch in "[]*?:/\\":
        title = title.replace(ch, "")
    return title[:90].strip()


async def _sheets_agent_tab(
    http: aiohttp.ClientSession, account_id: int | None, config: dict, agent_name: object, token: str,
) -> int:
    """The sheetId of this call's agent tab in the leads spreadsheet - one
    tab per agent, named after it, created and styled on its first lead.
    Falls back to the main tab when there's no agent name or Google won't
    create the tab, so a lead is never lost over a tab."""
    default = int(config["sheet_id"])
    title = _sheets_tab_title(agent_name)
    if not title or title.lower() == str(config.get("sheet_title") or "Leads").lower():
        return default
    tabs = config.get("agent_tabs") if isinstance(config.get("agent_tabs"), dict) else {}
    if title in tabs:
        return int(tabs[title])
    spreadsheet = config["spreadsheet_id"]
    headers = {"Authorization": f"Bearer {token}"}
    status, text, data = await _sheets_post(
        http, f"{_SHEETS_API}/{spreadsheet}:batchUpdate", headers=headers,
        json={"requests": [{"addSheet": {"properties": {"title": title, "tabColorStyle": {"rgbColor": _SHEETS_PURPLE}}}}]},
    )
    sheet_id = None
    if status is not None and 200 <= status < 300:
        try:
            sheet_id = int(data["replies"][0]["addSheet"]["properties"]["sheetId"])
        except (KeyError, IndexError, TypeError, ValueError):
            sheet_id = None
        if sheet_id is not None:
            await _sheets_post(
                http, f"{_SHEETS_API}/{spreadsheet}:batchUpdate", headers=headers,
                json={"requests": _sheets_format_requests(sheet_id) + _sheets_column_visibility_requests(sheet_id, config.get("fields"))},
            )
    elif status == 400 and "already exists" in (text or "").lower():
        # Created earlier (e.g. before a reconnect reset our tab list), or
        # by a call that ended at the same moment: find it by title.
        try:
            async with http.get(
                f"{_SHEETS_API}/{spreadsheet}?fields=sheets.properties(sheetId,title)", headers=headers,
            ) as resp:
                meta = await resp.json(content_type=None) if resp.status == 200 else {}
            sheet_id = next(
                (int(s["properties"]["sheetId"]) for s in meta.get("sheets") or []
                 if (s.get("properties") or {}).get("title") == title),
                None,
            )
        except Exception:
            logger.warning("sheets: could not look up agent tab %r", title, exc_info=True)
    if sheet_id is None:
        logger.warning("sheets: no tab for agent %r (HTTP %s) - using the main tab", title, status)
        return default
    config["agent_tabs"] = {**tabs, title: sheet_id}
    await asyncio.to_thread(db.update_integration_config, account_id, "sheets", config)
    return sheet_id


def _sheets_error_message(status: int | None, body: str) -> str:
    lowered = (body or "").lower()
    if status == 401 or (status == 400 and "invalid_grant" in lowered):
        return _SHEETS_ERR_ACCESS_REMOVED
    if status == 404:
        return _SHEETS_ERR_SHEET_DELETED
    if status == 403:
        if "service_disabled" in lowered or "has not been used" in lowered or "is disabled" in lowered:
            return _SHEETS_ERR_API_DISABLED
        return _SHEETS_ERR_NO_PERMISSION
    if status == 400 and "grid" in lowered:
        return _SHEETS_ERR_SHEET_DELETED  # the tab itself was deleted
    if status == 429 or (status or 0) >= 500:
        return _SHEETS_ERR_BUSY
    return f"Google Sheets error (HTTP {status})" if status else "Could not reach Google Sheets"


async def _sheets_post(http: aiohttp.ClientSession, url: str, **kwargs) -> tuple[int | None, str, dict]:
    """POST with one retry on 429/5xx after a short backoff. This runs after
    the call row is saved (log_call's delivery task), never on the live
    audio path, and each attempt is bounded by the session's 5 s timeout."""
    for attempt in range(2):
        try:
            async with http.post(url, **kwargs) as resp:
                text = await resp.text()
                status = resp.status
        except Exception:
            logger.warning("sheets: request to Google failed", exc_info=True)
            return None, "", {}
        if attempt == 0 and (status == 429 or status >= 500):
            await asyncio.sleep(1.0)
            continue
        try:
            data = json.loads(text) if text else {}
        except ValueError:
            data = {}
        return status, text, data if isinstance(data, dict) else {}
    return None, "", {}  # pragma: no cover


async def _sheets_refresh_access_token(http: aiohttp.ClientSession, config: dict) -> tuple[dict | None, bool]:
    """(updated_config, revoked). revoked=True means Google answered
    invalid_grant: the tenant removed our access or changed their password."""
    client_id = os.environ.get("GOOGLE_SHEETS_OAUTH_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_SHEETS_OAUTH_CLIENT_SECRET")
    if not client_id or not client_secret or not config.get("refresh_token"):
        return None, False
    status, text, data = await _sheets_post(http, _GOOGLE_TOKEN_URL, data={
        "refresh_token": config["refresh_token"],
        "client_id": client_id,
        "client_secret": client_secret,
        "grant_type": "refresh_token",
    })
    if status == 400 and "invalid_grant" in text:
        return None, True
    if status is None or not (200 <= status < 300) or not data.get("access_token"):
        logger.warning("sheets: token refresh failed: HTTP %s", status)
        return None, False
    return {**config, "access_token": data["access_token"],
            "expires_at": time.time() + float(data.get("expires_in") or 3600)}, False


async def _deliver_google_sheet_row(
    http: aiohttp.ClientSession, account_id: int | None, config: dict, lead: dict, agent_name: object = None,
) -> tuple[bool, str]:
    """Append one row; (ok, owner-facing detail for last_error)."""
    if config.get("needs_reconnect"):
        # invalid_grant already said the grant is gone; asking Google again
        # on every call won't bring it back. The next Sign in clears this.
        return False, _SHEETS_ERR_ACCESS_REMOVED
    if not config.get("refresh_token") or not config.get("spreadsheet_id") or config.get("sheet_id") is None:
        logger.warning("sheets: oauth config missing fields, keys=%s", sorted(config.keys()))
        return False, "not configured"

    async def _refresh(cfg: dict) -> tuple[dict | None, bool]:
        updated, revoked = await _sheets_refresh_access_token(http, cfg)
        if revoked:
            await asyncio.to_thread(db.update_integration_config, account_id, "sheets", {**cfg, "needs_reconnect": True})
        elif updated:
            await asyncio.to_thread(db.update_integration_config, account_id, "sheets", updated)
        return updated, revoked

    if time.time() >= float(config.get("expires_at") or 0) - 60:
        updated, revoked = await _refresh(config)
        if revoked:
            return False, _SHEETS_ERR_ACCESS_REMOVED
        if updated:
            config = updated

    url = f"{_SHEETS_API}/{config['spreadsheet_id']}:batchUpdate"
    token = config.get("access_token") or ""
    # Each agent's leads go to its own tab, named after the agent.
    # agent_name comes separately: the owner may have left the Agent column out.
    tab_agent = agent_name if agent_name is not None else lead.get("agent_name")
    target = await _sheets_agent_tab(http, account_id, config, tab_agent, token)

    async def _append(token: str) -> tuple[int | None, str]:
        body = _sheets_append_body(target, lead)
        status, text, _ = await _sheets_post(http, url, json=body, headers={"Authorization": f"Bearer {token}"})
        return status, text

    status, text = await _append(token)
    if status == 401:
        # Expired sooner than our bookkeeping expected - one forced refresh.
        updated, _ = await _refresh(config)
        if not updated:
            return False, _SHEETS_ERR_ACCESS_REMOVED
        config, token = updated, updated["access_token"]
        status, text = await _append(token)
    if status == 400 and "grid" in (text or "").lower() and target != int(config["sheet_id"]):
        # The owner deleted this agent's tab: forget it and make a new one.
        tabs = dict(config.get("agent_tabs") or {})
        tabs.pop(_sheets_tab_title(tab_agent), None)
        config = {**config, "agent_tabs": tabs}
        target = await _sheets_agent_tab(http, account_id, config, tab_agent, token)
        status, text = await _append(token)
    if status is not None and 200 <= status < 300:
        return True, "Row added"
    return False, _sheets_error_message(status, text)

# --- END MIRROR of agent/tools.py ---
