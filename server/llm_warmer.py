"""Keeps OpenAI's prompt cache warm for agents that are actually taking calls.

Measured directly against api.openai.com with Mira Inbound's real ~18k-char
system prompt: a cold request (cache expired) pays 2106ms time-to-first-
token; a warm one pays 902ms — a 2.3x tax that lands on whichever call
happens to be the first one after a quiet gap. OpenAI's prompt cache evicts
after a few minutes of inactivity, so any tenant whose calls aren't
back-to-back re-pays that cold cost on every call's first turn.

Same always-on-thread shape as db_backup.py and campaign_dialer.py, not a
separate Railway cron service. Only pings agents that have taken a real call
recently (see _RECENT_CALL_WINDOW_MIN) — an agent nobody is calling gets no
pings, so this never spends money warming a cache no one will use.

Gemini/Groq models are skipped: this file is specifically about the
prompt_cache_key mechanism _build_llm (agent/main.py) already wires up for
the OpenAI branch. Gemini has its own implicit caching with different
mechanics; revisit separately if it turns out to need the same treatment.
"""

import json
import logging
import os
import threading
import time
import urllib.error
import urllib.request

import calls_db

logger = logging.getLogger("vistrow-llm-warmer")

_PING_INTERVAL_S = 4 * 60  # inside OpenAI's cache TTL (a few minutes of idle evicts it)
_RECENT_CALL_WINDOW_MIN = 30  # only warm agents actually being called right now
_PROMPT_CACHE_KEY = "vistrow-voice-agent-v1"  # must match agent/main.py's _build_llm

_started = False
_lock = threading.Lock()


def _recently_active_openai_agents() -> list[dict]:
    """agent_id -> system_prompt for every agent (any tenant) that has taken
    a call in the last _RECENT_CALL_WINDOW_MIN minutes and whose model isn't
    Gemini/Groq (see module docstring).

    Bound param for the interval, and model-family filtering done in Python
    rather than SQL LIKE - a literal '%' in the query text collides with
    psycopg's own placeholder parsing (dbconn.py's "?" -> "%s" rewrite),
    same class of bug as list_calls' search filter hit earlier."""
    conn = calls_db._connect()
    try:
        rows = conn.execute(
            "SELECT DISTINCT a.id, a.system_prompt, a.model "
            "FROM agents a JOIN calls c ON c.agent_id = a.id "
            "WHERE c.started_at::timestamptz >= now() - (? || ' minutes')::interval "
            "AND a.system_prompt != ''",
            (str(_RECENT_CALL_WINDOW_MIN),),
        ).fetchall()
        return [
            {"id": r["id"], "system_prompt": r["system_prompt"], "model": r["model"]}
            for r in rows
            if not (r["model"] or "").startswith(("gemini", "groq/"))
        ]
    finally:
        conn.close()


def _ping(agent_id: int, system_prompt: str, model: str, api_key: str) -> None:
    # Plain stdlib HTTP - no openai/requests/httpx dependency for a job
    # this small. Same endpoint/shape agent/main.py's _build_llm hits via
    # the openai plugin, just without pulling that package into server/.
    # The agent's OWN model, not a hardcoded one: OpenAI caches per model, so
    # warming gpt-4.1-mini for an agent that actually runs gpt-4o-mini spends
    # money warming a cache that call will never read, and leaves the real one
    # cold. Three of five agents on this account run gpt-4o-mini.
    body = json.dumps(
        {
            "model": model,
            "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": "."}],
            "max_completion_tokens": 1,
            "prompt_cache_key": _PROMPT_CACHE_KEY,
        }
    ).encode()
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=body,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15):
            pass
        logger.info("warmed prompt cache for agent %s (%s)", agent_id, model)
    except Exception:
        logger.warning("cache-warm ping failed for agent %s (%s)", agent_id, model, exc_info=True)


def _loop() -> None:
    logger.info(
        "LLM cache warmer started (ping every %ss, agents active in the last %sm)",
        _PING_INTERVAL_S, _RECENT_CALL_WINDOW_MIN,
    )
    api_key = os.environ["OPENAI_API_KEY"]
    while True:
        try:
            for agent in _recently_active_openai_agents():
                _ping(agent["id"], agent["system_prompt"], agent["model"], api_key)
        except Exception:
            logger.exception("LLM cache warmer tick failed")
        time.sleep(_PING_INTERVAL_S)


def start_llm_warmer() -> None:
    """Idempotent — safe to call from FastAPI startup even if it fires twice.

    Set DISABLE_LLM_WARMER=1 to keep it off (e.g. running this app locally
    against production data - same reasoning as DISABLE_DB_BACKUP/
    DISABLE_CAMPAIGN_DIALER). Also no-ops quietly if OPENAI_API_KEY isn't
    set, rather than crashing FastAPI startup over an optional feature.
    """
    if os.environ.get("DISABLE_LLM_WARMER", "").strip() not in ("", "0", "false", "False"):
        logger.info("LLM cache warmer disabled via DISABLE_LLM_WARMER")
        return
    if not os.environ.get("OPENAI_API_KEY"):
        logger.info("LLM cache warmer disabled: OPENAI_API_KEY not set")
        return
    global _started
    with _lock:
        if _started:
            return
        _started = True
        threading.Thread(target=_loop, daemon=True, name="llm-cache-warmer").start()
