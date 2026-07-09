"""Local call-log storage.

SQLite for now — zero setup, works immediately without Docker or a hosted
database. Swap this for real Postgres (per the original Phase 3 plan) once
there's an actual deployment to run it against; save_call()'s signature can
stay the same either way.
"""

import json
import os
import sqlite3
from pathlib import Path

# CALLS_DB_PATH overrides this for deployments where the agent worker and
# backend run in one container but calls.db should live on a mounted volume
# (e.g. Railway) rather than next to the source code.
DB_PATH = Path(os.environ["CALLS_DB_PATH"]) if os.environ.get("CALLS_DB_PATH") else Path(__file__).resolve().parent / "calls.db"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_name TEXT NOT NULL,
    visitor_identity TEXT,
    started_at TEXT NOT NULL,
    ended_at TEXT NOT NULL,
    duration_seconds REAL,
    reply_language TEXT,
    lead_name TEXT,
    lead_phone TEXT,
    lead_budget TEXT,
    lead_location TEXT,
    lead_timeline TEXT,
    site_visit_json TEXT,
    transcript_json TEXT NOT NULL,
    call_type TEXT DEFAULT 'browser',
    site_id INTEGER,
    agent_id INTEGER,
    account_id INTEGER
);
"""


def _migrate_calls_columns(conn: sqlite3.Connection) -> None:
    """Add call_type/site_id/account_id to a calls table that predates those
    features — CREATE TABLE IF NOT EXISTS above is a no-op on a table that
    already exists. Mirrors server/calls_db.py's copy of this."""
    existing = {row[1] for row in conn.execute("PRAGMA table_info(calls)").fetchall()}
    if "call_type" not in existing:
        conn.execute("ALTER TABLE calls ADD COLUMN call_type TEXT DEFAULT 'browser'")
    if "site_id" not in existing:
        conn.execute("ALTER TABLE calls ADD COLUMN site_id INTEGER")
    if "agent_id" not in existing:
        conn.execute("ALTER TABLE calls ADD COLUMN agent_id INTEGER")
    if "account_id" not in existing:
        conn.execute("ALTER TABLE calls ADD COLUMN account_id INTEGER")


def init_db() -> None:
    conn = sqlite3.connect(DB_PATH)
    try:
        with conn:
            conn.execute(_SCHEMA)
            _migrate_calls_columns(conn)
    finally:
        conn.close()


def get_agent_config(agent_id: int | None = None) -> dict | None:
    """Dashboard-managed agent settings (server/calls_db.py owns the table).

    With `agent_id`, loads that specific agent — used by inbound phone calls,
    where the LiveKit dispatch rule for the dialed number names which agent
    handles it. Without it, falls back to the first agent (the one that takes
    all browser web calls). Returns None when the table doesn't exist yet
    (dashboard API never ran) or the id isn't found, so callers fall back to
    the in-code defaults and the agent keeps working standalone.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        if agent_id is not None:
            row = conn.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()
        else:
            row = conn.execute("SELECT * FROM agents ORDER BY id LIMIT 1").fetchone()
        return dict(row) if row else None
    except sqlite3.OperationalError:
        return None
    finally:
        conn.close()


def get_kb_content(kb_id: int, max_chars: int = 8000) -> str:
    """Knowledge-base text to append to the system prompt.

    Curated Q&A pairs (kb_qa, the operator-reviewed FAQ) come first so they
    always survive the char cap — they're the facts the operator explicitly
    signed off on — followed by raw sources with whatever budget remains.

    Prompt-stuffing rather than embeddings — right-sized while KBs are a few
    brochures/price sheets; swap for retrieval once sources outgrow this cap.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        parts: list[str] = []
        try:
            qa_rows = conn.execute(
                "SELECT question, answer FROM kb_qa WHERE kb_id = ? ORDER BY position, id",
                (kb_id,),
            ).fetchall()
        except sqlite3.OperationalError:
            # kb_qa table doesn't exist yet (dashboard API predates KB 2.0).
            qa_rows = []
        if qa_rows:
            faq = "\n\n".join(f"Q: {r['question']}\nA: {r['answer']}" for r in qa_rows)
            parts.append("## Approved answers (quote these when the question matches)\n" + faq)
        rows = conn.execute(
            "SELECT name, content FROM knowledge_sources WHERE kb_id = ? ORDER BY id",
            (kb_id,),
        ).fetchall()
        parts.extend(f"## {r['name']}\n{r['content']}" for r in rows)
        return "\n\n".join(parts)[:max_chars]
    except sqlite3.OperationalError:
        return ""
    finally:
        conn.close()


def is_kb_strict(kb_id: int) -> bool:
    """Whether the operator turned strict mode on for this KB (default yes)."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute("SELECT strict FROM knowledge_bases WHERE id = ?", (kb_id,)).fetchone()
        return bool(row["strict"]) if row is not None else True
    except sqlite3.OperationalError:
        # strict column predates KB 2.0 — treat as strict, the safe default.
        return True
    finally:
        conn.close()


def get_webhook_url() -> str | None:
    """URL of the connected CRM webhook integration, if any."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(
            "SELECT config_json FROM integrations WHERE key = 'webhook' AND status = 'connected'"
        ).fetchone()
        if row is None:
            return None
        return json.loads(row["config_json"] or "{}").get("url") or None
    except sqlite3.OperationalError:
        return None
    finally:
        conn.close()


def save_call(record: dict) -> None:
    """Persist one completed call. `record` keys:

    room_name, visitor_identity, started_at, ended_at, duration_seconds,
    reply_language, transcript (list of {role, text}), call_type
    ('phone'/'widget'/'browser'), site_id (for 'widget' calls), agent_id,
    account_id (which tenant this call belongs to), and optionally
    name/phone/budget/location/timeline/site_visit (dict with
    property_id/date/time) — matching the keys tools.py's log_lead and
    book_site_visit write into the shared lead_data dict.
    """
    conn = sqlite3.connect(DB_PATH)
    try:
        with conn:
            conn.execute(
                """
                INSERT INTO calls (
                    room_name, visitor_identity, started_at, ended_at,
                    duration_seconds, reply_language, lead_name, lead_phone,
                    lead_budget, lead_location, lead_timeline, site_visit_json,
                    transcript_json, call_type, site_id, agent_id, account_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["room_name"],
                    record.get("visitor_identity"),
                    record["started_at"],
                    record["ended_at"],
                    record["duration_seconds"],
                    record.get("reply_language"),
                    record.get("name"),
                    record.get("phone"),
                    record.get("budget"),
                    record.get("location"),
                    record.get("timeline"),
                    json.dumps(record["site_visit"]) if record.get("site_visit") else None,
                    json.dumps(record["transcript"], ensure_ascii=False),
                    record.get("call_type") or "browser",
                    record.get("site_id"),
                    record.get("agent_id"),
                    record.get("account_id"),
                ),
            )
    finally:
        conn.close()
