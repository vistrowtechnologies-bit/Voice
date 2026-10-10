"""Google Sheets lead delivery over OAuth ("Sign in with Google").

The tenant signs in with Google once; we create a "Vistrow Voice — Leads"
spreadsheet in their Drive and append one row per reachable caller. This
module is the server's sync (stdlib urllib) half: the OAuth callback, the
dashboard's Test button and Disconnect use it. agent/tools.py has the async
twin for live calls - agent/ and server/ are separate deployables that can't
share a module, so keep the row shape and error wording below in step with
agent/tools.py's _sheets_* helpers.

Rows are written with the batchUpdate appendCells request rather than
values:append, for three reasons:
  - It addresses the tab by its numeric sheetId, so a tenant renaming the
    "Leads" tab doesn't break delivery (values:append needs the A1 title).
  - Every text cell is a stringValue, which Sheets never parses: a caller
    who says their name is "=IMPORTXML(...)" gets text, not a formula, and
    "+91 98765 43210" keeps its "+" instead of becoming a number.
  - The Date/time and Duration cells are real numbers, so the date-time
    column format applies and the owner can sort/filter by them.
The leading-apostrophe neutralising in _safe_text is still applied on top,
for the moment the owner downloads the sheet as CSV and opens it in Excel,
which does evaluate "=..." text.
"""

import base64
import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

logger = logging.getLogger("vistrow-google-sheets")

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets"

# drive.file, not the broader "spreadsheets" scope: drive.file only lets the
# app see files it created itself (our one leads sheet), never the rest of
# the tenant's Drive. Google classes it as non-sensitive, so the consent
# screen can go to production without a security assessment, and a tenant
# isn't asked to hand us every spreadsheet they own.
SCOPE = "openid email https://www.googleapis.com/auth/drive.file"

SPREADSHEET_TITLE = "Vistrow Voice — Leads"
SHEET_TITLE = "Leads"
HEADERS = [
    "Date/time (IST)", "Name", "Phone", "Email", "Company", "Channel", "Agent",
    "Language", "Duration (s)", "Details", "Page", "Recording", "Call ID",
]
# Pixel widths per column, same order as HEADERS.
_COLUMN_WIDTHS = [150, 160, 140, 200, 160, 120, 120, 90, 90, 360, 180, 220, 80]

TEST_ROW_NAME = "TEST — safe to delete"

# Owner-facing failure text, shown on the Integrations card via last_error.
# Keep identical to agent/tools.py's copies.
ERR_ACCESS_REMOVED = "Google access was removed. Sign in with Google again."
ERR_SHEET_DELETED = "The leads sheet was deleted. Reconnect to create a new one."
ERR_NO_PERMISSION = "Vistrow Voice can no longer edit the leads sheet. Sign in with Google again."
ERR_API_DISABLED = "Google Sheets is turned off for Vistrow Voice's Google project. Please contact support."
ERR_BUSY = "Google Sheets is busy right now. The next lead will try again."

_IST = timezone(timedelta(hours=5, minutes=30))
_CHANNEL_LABELS = {"phone": "Phone", "widget": "Website Widget", "browser": "Web"}


class GoogleError(Exception):
    def __init__(self, status: int | None, body: str):
        super().__init__(f"HTTP {status}: {body[:200]}")
        self.status = status
        self.body = body


def _request(method: str, url: str, token: str | None = None, body: dict | None = None,
             form: dict | None = None, timeout: int = 10) -> dict:
    """One Google API call with a single retry on 429/5xx after a short
    backoff - a momentary quota blip shouldn't cost the owner a lead, but a
    second failure is reported rather than retried forever. Raises
    GoogleError on any non-2xx."""
    headers = {"User-Agent": "Vistrow-Voice/1.0"}
    data = None
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    elif form is not None:
        data = urllib.parse.urlencode(form).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    for attempt in range(2):
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            try:
                text = e.read().decode("utf-8", "replace")
            except Exception:
                text = ""
            if attempt == 0 and (e.code == 429 or e.code >= 500):
                time.sleep(1.0)
                continue
            raise GoogleError(e.code, text) from None
        except (urllib.error.URLError, TimeoutError, ValueError) as e:
            raise GoogleError(None, str(e)) from None
    raise GoogleError(None, "unreachable")  # pragma: no cover - loop always returns/raises


def auth_url(client_id: str, redirect_uri: str, state: str) -> str:
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",  # required to receive a refresh_token
        "prompt": "consent",  # forces a fresh refresh_token even on a re-connect
        # No include_granted_scopes: it folded this account's earlier grants on
        # the same Cloud project (Google Calendar, a sensitive scope) into the
        # request, so Google showed "hasn't verified this app" for a sign-in
        # that only needs the non-sensitive drive.file + email.
        "state": state,
    }
    return f"{AUTH_URL}?{urllib.parse.urlencode(params)}"


def exchange_code(code: str, client_id: str, client_secret: str, redirect_uri: str) -> dict:
    return _request("POST", TOKEN_URL, form={
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    })


def email_from_id_token(id_token: str | None) -> str:
    """The signed-in Google account's email, for the card. Decodes the JWT
    payload WITHOUT verifying its signature - acceptable only because this
    id_token came straight back from Google's own token endpoint over TLS in
    response to our client-secret-authenticated request, so nobody else could
    have put it there. It is display-only, never used to authenticate."""
    if not id_token or id_token.count(".") != 2:
        return ""
    try:
        payload = id_token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return str(json.loads(base64.urlsafe_b64decode(payload)).get("email") or "")
    except Exception:
        return ""


# Vistrow brand colours (web-demo/src/index.css, light theme), as Sheets
# RGB fractions.
def _rgb(hex_colour: str) -> dict:
    h = hex_colour.lstrip("#")
    return {"red": int(h[0:2], 16) / 255, "green": int(h[2:4], 16) / 255, "blue": int(h[4:6], 16) / 255}


BRAND_PURPLE = _rgb("#9333ea")
BRAND_PURPLE_DARK = _rgb("#7e22ce")
BRAND_LAVENDER = _rgb("#faf5ff")
_WHITE = _rgb("#ffffff")
LINK_TEXT = "▶ Play recording"


def format_requests(sheet_id: int, add_banding: bool = True, add_filter: bool = True) -> list[dict]:
    """One batchUpdate that turns a blank tab into the leads sheet in Vistrow
    colours: purple frozen header with white bold text, lavender/white row
    bands, a filter on every column, Date/time as a date-time, Phone as plain
    text (so a typed or pasted +91 number keeps its +), and readable column
    widths. add_banding/add_filter are False when restyling a sheet that
    already has them - Google rejects a second band or filter on the same
    range, and the whole batch with it."""
    header_format = {
        "backgroundColor": BRAND_PURPLE,
        "textFormat": {"bold": True, "foregroundColor": _WHITE, "fontSize": 10},
        "verticalAlignment": "MIDDLE",
        "horizontalAlignment": "LEFT",
    }
    requests: list[dict] = [
        {
            "updateCells": {
                "start": {"sheetId": sheet_id, "rowIndex": 0, "columnIndex": 0},
                "rows": [{"values": [
                    {"userEnteredValue": {"stringValue": h}, "userEnteredFormat": header_format}
                    for h in HEADERS
                ]}],
                "fields": "userEnteredValue,userEnteredFormat(backgroundColor,textFormat,verticalAlignment,horizontalAlignment)",
            }
        },
        {
            "updateSheetProperties": {
                "properties": {
                    "sheetId": sheet_id,
                    "gridProperties": {"frozenRowCount": 1},
                    "tabColorStyle": {"rgbColor": BRAND_PURPLE},
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
                "range": {"sheetId": sheet_id, "startRowIndex": 1, "startColumnIndex": 0, "endColumnIndex": len(HEADERS)},
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
                "range": {"sheetId": sheet_id, "startRowIndex": 0, "startColumnIndex": 0, "endColumnIndex": len(HEADERS)},
                "rowProperties": {
                    "headerColorStyle": {"rgbColor": BRAND_PURPLE},
                    "firstBandColorStyle": {"rgbColor": _WHITE},
                    "secondBandColorStyle": {"rgbColor": BRAND_LAVENDER},
                },
            }}
        })
    if add_filter:
        requests.append({
            "setBasicFilter": {"filter": {
                "range": {"sheetId": sheet_id, "startRowIndex": 0, "startColumnIndex": 0, "endColumnIndex": len(HEADERS)},
            }}
        })
    for index, width in enumerate(_COLUMN_WIDTHS):
        requests.append({
            "updateDimensionProperties": {
                "range": {"sheetId": sheet_id, "dimension": "COLUMNS", "startIndex": index, "endIndex": index + 1},
                "properties": {"pixelSize": width},
                "fields": "pixelSize",
            }
        })
    return requests


# Sheet column for each owner-selectable field (server/calls_db.py
# INTEGRATION_FIELDS). "transcript" has no column; Date/time always shows.
FIELD_COLUMNS = {
    "name": 1, "phone": 2, "email": 3, "company": 4, "channel": 5, "agent": 6, "language": 7,
    "duration": 8, "details": 9, "page": 10, "recording": 11, "call_id": 12,
}


def column_visibility_requests(sheet_id: int, fields: list | None) -> list[dict]:
    """Hide the columns of fields the owner left out (they are written empty
    anyway) and show the rest. No fields chosen = everything shown."""
    chosen = set(fields) if fields else set(FIELD_COLUMNS)
    return [
        {
            "updateDimensionProperties": {
                "range": {"sheetId": sheet_id, "dimension": "COLUMNS", "startIndex": col, "endIndex": col + 1},
                "properties": {"hiddenByUser": field not in chosen},
                "fields": "hiddenByUser",
            }
        }
        for field, col in FIELD_COLUMNS.items()
    ]


def apply_column_visibility(config: dict, fields: list | None, client_id: str | None, client_secret: str | None,
                            save_config) -> tuple[bool, str]:
    """Show/hide columns on the main tab and every agent tab right after the
    owner changes the field choice. Returns (ok, owner-facing detail)."""
    if config.get("needs_reconnect") or not config.get("refresh_token") or not config.get("spreadsheet_id"):
        return False, ERR_ACCESS_REMOVED
    try:
        if time.time() >= float(config.get("expires_at") or 0) - 60:
            config = refresh_access_token(config, client_id, client_secret)
            save_config(config)
        tabs = {int(config["sheet_id"]), *(int(v) for v in (config.get("agent_tabs") or {}).values())}
        requests = [r for tab in sorted(tabs) for r in column_visibility_requests(tab, fields)]
        _request("POST", f"{SHEETS_API}/{urllib.parse.quote(config['spreadsheet_id'])}:batchUpdate",
                 token=config["access_token"], body={"requests": requests})
        return True, "Columns updated"
    except GoogleError as e:
        return False, error_message(e.status, e.body)


def restyle(access_token: str, spreadsheet_id: str, sheet_id: int) -> None:
    """Apply the current Vistrow styling to an existing leads tab (a
    reconnect keeps the owner's sheet, which may predate the styling).
    Best-effort: a styling failure must never fail the reconnect."""
    try:
        meta = _request(
            "GET",
            f"{SHEETS_API}/{urllib.parse.quote(spreadsheet_id)}?fields=sheets(properties.sheetId,bandedRanges.bandedRangeId,basicFilter.range)",
            token=access_token,
        )
        tab = next(
            (s for s in meta.get("sheets") or [] if int((s.get("properties") or {}).get("sheetId", -1)) == int(sheet_id)),
            {},
        )
        _request("POST", f"{SHEETS_API}/{urllib.parse.quote(spreadsheet_id)}:batchUpdate", token=access_token, body={
            "requests": format_requests(sheet_id, add_banding=not tab.get("bandedRanges"), add_filter=not tab.get("basicFilter")),
        })
    except Exception as e:  # never fail a reconnect over styling
        logger.info("sheets: restyle of existing sheet failed (%s) - keeping it as is", getattr(e, "status", e))


def create_spreadsheet(access_token: str) -> dict:
    """Creates and formats the leads sheet. Returns {spreadsheet_id,
    spreadsheet_url, sheet_id, sheet_title}; raises GoogleError."""
    created = _request("POST", SHEETS_API, token=access_token, body={
        "properties": {"title": SPREADSHEET_TITLE},
        "sheets": [{"properties": {"title": SHEET_TITLE}}],
    })
    spreadsheet_id = created["spreadsheetId"]
    sheet_id = int(created["sheets"][0]["properties"]["sheetId"])
    _request("POST", f"{SHEETS_API}/{spreadsheet_id}:batchUpdate", token=access_token,
             body={"requests": format_requests(sheet_id)})
    return {
        "spreadsheet_id": spreadsheet_id,
        "spreadsheet_url": created.get("spreadsheetUrl") or f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/edit",
        "sheet_id": sheet_id,
        "sheet_title": SHEET_TITLE,
    }


def reusable_spreadsheet(access_token: str, previous: dict) -> dict | None:
    """On a re-connect, keep writing to the sheet the owner already has if
    Google still lets this app open it and its leads tab still exists.
    None (create a new one) when it was deleted, the tenant signed in with a
    different Google account, or anything else goes wrong."""
    spreadsheet_id = previous.get("spreadsheet_id")
    if previous.get("mode") != "oauth" or not spreadsheet_id:
        return None
    try:
        meta = _request(
            "GET",
            f"{SHEETS_API}/{urllib.parse.quote(spreadsheet_id)}?fields=spreadsheetId,spreadsheetUrl,sheets.properties",
            token=access_token,
        )
    except GoogleError as e:
        logger.info("sheets: previous spreadsheet not reusable (%s) - creating a new one", e.status)
        return None
    for sheet in meta.get("sheets") or []:
        props = sheet.get("properties") or {}
        if previous.get("sheet_id") is not None and int(props.get("sheetId", -1)) == int(previous["sheet_id"]):
            return {
                "spreadsheet_id": spreadsheet_id,
                "spreadsheet_url": meta.get("spreadsheetUrl") or previous.get("spreadsheet_url") or "",
                "sheet_id": int(props["sheetId"]),
                "sheet_title": props.get("title") or SHEET_TITLE,
            }
    return None


def revoke(token: str) -> None:
    """Best-effort: a Disconnect must clear our side even if Google is down
    or the grant was already revoked."""
    if not token:
        return
    try:
        _request("POST", f"{REVOKE_URL}?{urllib.parse.urlencode({'token': token})}", form={})
    except GoogleError as e:
        logger.info("sheets: token revoke returned %s (ignored)", e.status)


def refresh_access_token(config: dict, client_id: str | None, client_secret: str | None) -> dict:
    """Returns the updated config. Raises GoogleError; a 400 invalid_grant
    means the tenant revoked access (or changed their password)."""
    data = _request("POST", TOKEN_URL, form={
        "refresh_token": config.get("refresh_token") or "",
        "client_id": client_id or "",
        "client_secret": client_secret or "",
        "grant_type": "refresh_token",
    })
    if not data.get("access_token"):
        raise GoogleError(None, "token refresh returned no access_token")
    return {**config, "access_token": data["access_token"],
            "expires_at": time.time() + float(data.get("expires_in") or 3600)}


# ------------------------------------------------------------------- rows


def _safe_text(value: object) -> str:
    """Text a spreadsheet will never treat as a formula, even after a CSV
    export opened in Excel: a leading = + - @ gets an apostrophe."""
    text = str(value if value is not None else "").strip()
    return "'" + text if text[:1] in ("=", "+", "-", "@") else text


def _safe_phone(value: object) -> str:
    # A real phone number ("+91 98765 43210") stays as typed - the column is
    # plain-text formatted, and a "+digits" string can't do anything harmful
    # even when Excel evaluates it. Anything else falls back to _safe_text.
    text = str(value or "").strip()
    if text and all(ch.isdigit() or ch in "+ -()" for ch in text) and "+" not in text[1:]:
        return text
    return _safe_text(text)


def _details(lead: dict) -> str:
    """The post-call read, one "Field: value" per line - like agent/tools.py's
    _zoho_description minus the meta lines that have their own columns."""
    lines = []
    for key, value in (lead.get("extracted_data") or {}).items():
        if value not in (None, "", [], {}):
            lines.append(f"{str(key).replace('_', ' ').capitalize()}: {value}")
    extra = lead.get("use_case") or lead.get("message") or lead.get("summary")
    if extra:
        lines.append(str(extra))
    # Sheets caps a cell at 50,000 characters.
    return "\n".join(lines)[:45000]


def _sheet_serial(now: datetime) -> float:
    """Sheets' date serial (days since 1899-12-30) for an IST wall-clock
    time, so the cell is a real date-time regardless of the spreadsheet's
    own timezone setting."""
    local = now.astimezone(_IST).replace(tzinfo=None)
    return (local - datetime(1899, 12, 30)).total_seconds() / 86400


def play_url(recording_url: object) -> str:
    """The browser player page for a recording link. The CRM link
    (/public/calls/<id>/recording?token=...) redirects to the raw WAV, which
    many browsers download instead of playing; /play wraps it in a page with
    an audio player. Any other URL is returned unchanged."""
    url = str(recording_url or "").strip()
    if "/public/calls/" in url and "/recording?token=" in url:
        return url.replace("/recording?token=", "/play?token=", 1)
    return url


def recording_cell(recording_url: object) -> dict:
    """A "▶ Play recording" link, not a formula: the URL rides on the text
    format, so nothing in the cell is ever evaluated."""
    url = play_url(recording_url)
    if not url.startswith(("https://", "http://")):
        return {"userEnteredValue": {"stringValue": ""}}
    return {
        "userEnteredValue": {"stringValue": LINK_TEXT},
        "userEnteredFormat": {"textFormat": {"link": {"uri": url}, "foregroundColor": BRAND_PURPLE_DARK, "bold": True}},
    }


def row_cells(lead: dict, now: datetime | None = None) -> list[dict]:
    extracted = lead.get("extracted_data") or {}
    duration = lead.get("duration_seconds")
    call_id = lead.get("call_id")

    def text(value: object) -> dict:
        return {"userEnteredValue": {"stringValue": _safe_text(value)}}

    def number(value: object) -> dict:
        try:
            return {"userEnteredValue": {"numberValue": round(float(value))}}
        except (TypeError, ValueError):
            return text("")

    return [
        {"userEnteredValue": {"numberValue": _sheet_serial(now or datetime.now(timezone.utc))}},
        text(lead.get("name") or ""),
        {"userEnteredValue": {"stringValue": _safe_phone(lead.get("phone"))}},
        text(lead.get("email") or ""),
        text(lead.get("company") or extracted.get("company") or ""),
        text(_CHANNEL_LABELS.get(lead.get("channel"), lead.get("channel") or "")),
        text(lead.get("agent_name") or ""),
        text(lead.get("language") or ""),
        number(duration) if duration not in (None, "") else text(""),
        text(_details(lead)),
        text(lead.get("page_path") or ""),
        recording_cell(lead.get("recording_url")),
        number(call_id) if call_id not in (None, "") else text(""),
    ]


def append_body(sheet_id: int, lead: dict, now: datetime | None = None) -> dict:
    return {"requests": [{"appendCells": {
        "sheetId": sheet_id,
        "rows": [{"values": row_cells(lead, now)}],
        # textFormat too, for the recording link; the column number formats
        # (date-time, plain-text phone) are left alone by this mask.
        "fields": "userEnteredValue,userEnteredFormat.textFormat",
    }}]}


def error_message(status: int | None, body: str) -> str:
    """Owner-facing wording for a failed append/refresh."""
    lowered = (body or "").lower()
    if status == 400 and "invalid_grant" in lowered:
        return ERR_ACCESS_REMOVED
    if status == 401:
        return ERR_ACCESS_REMOVED
    if status == 404:
        return ERR_SHEET_DELETED
    if status == 403:
        if "service_disabled" in lowered or "has not been used" in lowered or "is disabled" in lowered:
            return ERR_API_DISABLED
        return ERR_NO_PERMISSION
    if status == 400 and "grid" in lowered:
        # The tab we write to (by sheetId) was deleted from the spreadsheet.
        return ERR_SHEET_DELETED
    if status == 429 or (status or 0) >= 500:
        return ERR_BUSY
    return f"Google Sheets error (HTTP {status})" if status else "Could not reach Google Sheets"


def append_lead(config: dict, lead: dict, client_id: str | None, client_secret: str | None,
                save_config) -> tuple[bool, str]:
    """Append one row. save_config(config) persists a refreshed token or the
    needs_reconnect flag. Returns (ok, owner-facing detail)."""
    if config.get("needs_reconnect"):
        # invalid_grant already told us the grant is gone - hammering Google's
        # token endpoint on every call won't bring it back.
        return False, ERR_ACCESS_REMOVED
    if not config.get("refresh_token") or not config.get("spreadsheet_id") or config.get("sheet_id") is None:
        return False, "not configured"

    revoked = []

    def _refresh(cfg: dict) -> dict | None:
        try:
            updated = refresh_access_token(cfg, client_id, client_secret)
        except GoogleError as e:
            if e.status == 400 and "invalid_grant" in e.body:
                revoked.append(True)
                save_config({**cfg, "needs_reconnect": True})
            logger.warning("sheets: token refresh failed: %s", e)
            return None
        save_config(updated)
        return updated

    if time.time() >= float(config.get("expires_at") or 0) - 60:
        refreshed = _refresh(config)
        if refreshed is not None:
            config = refreshed
        elif revoked or not config.get("access_token"):
            return False, ERR_ACCESS_REMOVED
        # Otherwise a refresh hiccup: try the stored token anyway, as Zoho does.

    url = f"{SHEETS_API}/{urllib.parse.quote(config['spreadsheet_id'])}:batchUpdate"
    body = append_body(int(config["sheet_id"]), lead)
    try:
        _request("POST", url, token=config.get("access_token"), body=body, timeout=8)
        return True, "Row added"
    except GoogleError as e:
        if e.status != 401:
            return False, error_message(e.status, e.body)
    # Expired sooner than our own bookkeeping expected - one forced refresh.
    refreshed = _refresh(config)
    if refreshed is None:
        return False, ERR_ACCESS_REMOVED
    try:
        _request("POST", url, token=refreshed["access_token"], body=body, timeout=8)
        return True, "Row added"
    except GoogleError as e:
        return False, error_message(e.status, e.body)
