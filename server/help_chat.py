"""Answers a single turn of the in-dashboard help chatbot, grounded in
help_content.HELP_DOC plus live account data via OpenAI function-calling
(see help_tools.py) — e.g. "how many leads did we get today" gets a real
number, not a generic "check the Calls page" deflection.

Same stdlib-urllib OpenAI call as kb_extract/call_intelligence (no openai
package in the image), same cheap mini model — one call per user message
(or two, if the model calls a tool), multi-turn via a messages array
instead of single-shot JSON extraction.
"""

import datetime
import json
import logging
import os
import re
import urllib.error
import urllib.request
from zoneinfo import ZoneInfo

import calls_db
from help_content import HELP_DOC
from help_tools import TOOL_FUNCTIONS, TOOL_SCHEMAS

logger = logging.getLogger("help-chat")

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
CHAT_MODEL = "gpt-4.1-mini"
CHAT_STRONG_MODEL = os.environ.get("HELP_CHAT_STRONG_MODEL", "gpt-4.1")
# Cap history sent to the model — this is a support-chat panel, not a
# long-running conversation; the last few turns are enough context.
MAX_HISTORY_TURNS = 6
MAX_MESSAGE_CHARS = 2_000

_SYSTEM_PROMPT_BASE = f"""You are the help assistant embedded in the Vistrow Voice dashboard — a \
small text chat panel, not the voice product. You help logged-in users understand and use the \
platform. Keep answers concise and precise. Never invent a page, control, feature, or live value.

You have tools that read this account's real data (calls, leads, contacts, credits) — call one \
whenever the question needs an actual number or a live fact instead of general product info. \
Never guess or estimate a number that a tool could answer.

Return exactly one JSON object with no text outside it:
{{"reply":"plain-text answer","suggestTicket":false,"comingSoon":false}}
- suggestTicket is true only for a likely product bug, persistent technical failure, billing/account
  issue, or something the documented troubleshooting cannot resolve. It must stay false for normal
  how-to questions.
- comingSoon is true only when the documentation explicitly says the requested feature is not yet
  available. Never claim something is coming soon merely because you cannot find it.
- reply is plain text without markdown headings and should name the exact page or button when known.

{HELP_DOC}"""

# Human-readable label for the current page, shown to the model so it can
# reference where the user is (mirrors the sidebar section names in
# HELP_DOC) — keys are route prefixes, checked longest-first by the caller.
_PAGE_LABELS: dict[str, str] = {
    "/dashboard/calls": "All Calls History",
    "/dashboard/contacts": "Contacts",
    "/dashboard/appointments": "Appointments",
    "/dashboard/billing": "Billing",
    "/dashboard/agents": "Agents",
    "/dashboard/testing": "Testing Lab",
    "/dashboard/voices": "Voices",
    "/dashboard/knowledge": "Knowledge Base",
    "/dashboard/inbound": "Inbound",
    "/dashboard/outbound": "Outbound",
    "/dashboard/integrations": "Integrations",
    "/dashboard/website-widget": "Website Widget",
    "/dashboard/numbers": "Phone Numbers",
    "/dashboard/compliance": "Compliance",
    "/dashboard/settings?tab=availability": "Settings > Scheduling",
    "/dashboard/settings?tab=team": "Settings > Team & roles",
    "/dashboard/settings?tab=security": "Settings > Sign-in & security",
    "/dashboard/settings?tab=preferences": "Settings > Preferences",
    "/dashboard/settings?tab=privacy": "Settings > Data & privacy",
    "/dashboard/settings": "Settings",
    "/dashboard": "Dashboard",
}


def _page_label(current_page: str | None) -> str | None:
    if not current_page:
        return None
    for prefix in sorted(_PAGE_LABELS, key=len, reverse=True):
        if current_page.startswith(prefix):
            return _PAGE_LABELS[prefix]
    return None


def _open_record_context(current_page: str | None, account_id: int) -> str:
    """Add safe, account-scoped context for the record visible behind the bot.

    Call details have a stable route, so the backend can resolve the call itself;
    the browser never supplies record data and cannot use this to cross tenants.
    """
    match = re.match(r"^/dashboard/calls/(\d+)(?:[/?#]|$)", current_page or "")
    if not match:
        return ""
    call = calls_db.get_call(int(match.group(1)), account_id)
    if not call:
        return "The currently open call record was not found in this workspace."
    fields = {
        "Call ID": call.get("id"),
        "Caller": call.get("name"),
        "Phone": call.get("phone"),
        "Call status": call.get("callStatus"),
        "Lead stage": call.get("status"),
        "Channel": call.get("channel"),
        "Direction": call.get("direction"),
        "Agent": call.get("agent"),
        "Website": call.get("website"),
        "Landing page": call.get("pagePath"),
        "Created": call.get("callDate"),
        "ArthaLeads delivery": call.get("arthaleadsStatus"),
        "ArthaLeads last sync": call.get("arthaleadsSyncedAt"),
        "ArthaLeads error": call.get("arthaleadsError"),
    }
    facts = "\n".join(f"- {label}: {value}" for label, value in fields.items() if value not in (None, ""))
    return f"CURRENTLY OPEN CALL (the user is looking at this record now):\n{facts}"


def _needs_strong_model(message: str) -> bool:
    return bool(re.search(r"not work|can'?t|cannot|broken|error|bug|failed|why (?:is|isn'?t|doesn'?t)", message, re.I))


def _structured_reply(choice_message: dict) -> dict:
    content = (choice_message.get("content") or "").strip()
    try:
        parsed = json.loads(content)
    except (TypeError, json.JSONDecodeError):
        # Defensive compatibility if an upstream model ignores JSON mode.
        return {"reply": content, "suggestTicket": False, "comingSoon": False}
    reply = str(parsed.get("reply") or parsed.get("answer") or "").strip()
    return {
        "reply": reply,
        "suggestTicket": bool(parsed.get("suggestTicket", False)),
        "comingSoon": bool(parsed.get("comingSoon", False)),
    }


def _deterministic_live_reply(
    message: str, account_id: int, timezone_name: str = "Asia/Kolkata"
) -> dict | None:
    """Answer high-frequency metric chips without giving the model a chance
    to confuse an all-time aggregate with a time-scoped question."""
    if re.search(r"\bhow many\b.*\bcalls?\b.*\btoday\b|\btoday\b.*\bhow many\b.*\bcalls?\b", message, re.I):
        try:
            timezone = ZoneInfo(timezone_name)
        except Exception:
            timezone_name = "Asia/Kolkata"
            timezone = ZoneInfo(timezone_name)
        today = datetime.datetime.now(timezone).date().isoformat()
        result = calls_db.calls_for_local_date(account_id, today, timezone_name)
        count = int(result["count"])
        noun = "call" if count == 1 else "calls"
        return {
            "reply": f"There were {count} {noun} today ({today}, {timezone_name}).",
            "suggestTicket": False,
            "comingSoon": False,
        }
    return None


def _post_chat(api_key: str, body: dict) -> dict:
    request = urllib.request.Request(
        OPENAI_CHAT_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:500]
        logger.error("OpenAI help-chat call failed (%s): %s", exc.code, detail)
        raise RuntimeError(f"Help chat model returned HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        logger.error("OpenAI help-chat call unreachable: %s", exc)
        raise RuntimeError("Could not reach the help chat model") from exc


def answer_help_question(
    message: str,
    history: list[dict],
    account_id: int,
    current_page: str | None = None,
    timezone_name: str = "Asia/Kolkata",
) -> dict:
    """history is [{"role": "user"|"assistant", "content": "..."}, ...] in
    chronological order. Raises RuntimeError with a human-readable message
    on any failure so the API route can 502 it."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured on the server")

    text = (message or "").strip()
    if not text:
        raise RuntimeError("Message is empty")
    text = text[:MAX_MESSAGE_CHARS]

    deterministic = _deterministic_live_reply(text, account_id, timezone_name)
    if deterministic:
        return deterministic

    trimmed_history = [
        {"role": turn.get("role"), "content": str(turn.get("content", ""))[:MAX_MESSAGE_CHARS]}
        for turn in (history or [])[-MAX_HISTORY_TURNS:]
        if turn.get("role") in ("user", "assistant") and str(turn.get("content", "")).strip()
    ]

    page_label = _page_label(current_page)
    try:
        timezone = ZoneInfo(timezone_name)
    except Exception:
        timezone_name = "Asia/Kolkata"
        timezone = ZoneInfo(timezone_name)
    today_local = datetime.datetime.now(timezone).date().isoformat()
    system_prompt = f"{_SYSTEM_PROMPT_BASE}\n\nToday's date is {today_local} in {timezone_name}."
    if page_label:
        system_prompt += f"\n\nThe user is currently viewing: {page_label}."
    open_record = _open_record_context(current_page, account_id)
    if open_record:
        system_prompt += f"\n\n{open_record}"

    messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        *trimmed_history,
        {"role": "user", "content": text},
    ]

    model = CHAT_STRONG_MODEL if _needs_strong_model(text) else CHAT_MODEL
    response_shape = {"type": "json_object"}
    payload = _post_chat(
        api_key,
        {
            "model": model,
            "temperature": 0.25,
            "response_format": response_shape,
            "messages": messages,
            "tools": TOOL_SCHEMAS,
            "tool_choice": "auto",
        },
    )

    try:
        choice_message = payload["choices"][0]["message"]
    except (KeyError, IndexError) as exc:
        logger.error("unexpected help-chat payload: %s", str(payload)[:500])
        raise RuntimeError("Help chat model returned an unexpected format") from exc

    tool_calls = choice_message.get("tool_calls") or []
    if tool_calls:
        # Single round: run every requested tool, feed results back, ask
        # once more for the final natural-language answer. No further tool
        # calls are honored — this is a lightweight panel, not an agent loop.
        messages.append(choice_message)
        for call in tool_calls:
            name = call.get("function", {}).get("name", "")
            try:
                args = json.loads(call.get("function", {}).get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            if name == "calls_on_date":
                args["timezone_name"] = timezone_name
            fn = TOOL_FUNCTIONS.get(name)
            result = fn(account_id, **args) if fn else {"error": f"unknown tool {name}"}
            messages.append(
                {"role": "tool", "tool_call_id": call.get("id", ""), "content": json.dumps(result)}
            )
        payload = _post_chat(
            api_key,
            {"model": model, "temperature": 0.25, "response_format": response_shape, "messages": messages},
        )
        try:
            choice_message = payload["choices"][0]["message"]
        except (KeyError, IndexError) as exc:
            logger.error("unexpected help-chat follow-up payload: %s", str(payload)[:500])
            raise RuntimeError("Help chat model returned an unexpected format") from exc

    result = _structured_reply(choice_message)
    if not result["reply"]:
        raise RuntimeError("Help chat model returned an empty reply")
    return result
