"""Data layer for the dashboard API.

Shares agent/calls.db with the voice agent (the agent writes call rows;
this module reads them and owns every other dashboard table). SQLite for
now — the schema is deliberately Postgres-compatible for the eventual
deployment migration.

Lives in server/ rather than importing agent.db because agent's package
pulls in livekit-agents, which isn't installed in this venv; sqlite3 is
stdlib, so an independent module pointed at the same file is enough.
"""

import csv
import io
import json
import os
import sqlite3
from pathlib import Path

# CALLS_DB_PATH overrides this for deployments where the backend and agent
# worker run in one container but calls.db should live on a mounted volume
# (e.g. Railway) rather than next to the source code. Must match agent/db.py.
DB_PATH = (
    Path(os.environ["CALLS_DB_PATH"])
    if os.environ.get("CALLS_DB_PATH")
    else Path(__file__).resolve().parent.parent / "agent" / "calls.db"
)

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
    transcript_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    model TEXT DEFAULT 'gpt-4.1',
    voice TEXT DEFAULT 'pooja',
    language TEXT DEFAULT 'hi-IN',
    status TEXT DEFAULT 'live',
    system_prompt TEXT DEFAULT '',
    kb_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT UNIQUE,
    email TEXT DEFAULT '',
    status TEXT DEFAULT 'new',
    tags TEXT DEFAULT '',
    source TEXT DEFAULT 'manual',
    last_called_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS knowledge_bases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS knowledge_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kb_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'text',
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inbound_routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT,
    agent_id INTEGER,
    timezone TEXT DEFAULT 'Asia/Kolkata',
    max_concurrent INTEGER DEFAULT 1,
    start_date TEXT,
    end_date TEXT,
    window_start TEXT,
    window_end TEXT,
    active_days TEXT DEFAULT 'Mon,Tue,Wed,Thu,Fri',
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    agent_id INTEGER,
    contact_tag TEXT DEFAULT '',
    scheduled_date TEXT,
    window_start TEXT,
    window_end TEXT,
    status TEXT DEFAULT 'scheduled',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS integrations (
    key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'not_connected',
    config_json TEXT DEFAULT '{}',
    last_sync TEXT
);

CREATE TABLE IF NOT EXISTS phone_numbers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT NOT NULL UNIQUE,
    label TEXT DEFAULT '',
    provider TEXT DEFAULT 'enablex',
    agent_id INTEGER,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now')),
    lk_trunk_id TEXT,
    lk_dispatch_rule_id TEXT
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
"""

# EnableX Voice API. Outbound calls authenticate with HTTP Basic using
# Base64(APP_ID:APP_KEY); the App Key is a server-side secret and is never
# returned to the browser.
ENABLEX_API_BASE = "https://api.enablex.io/voice/v1"

_SEED_INTEGRATIONS = [
    (
        "webhook",
        "ArthaleLeads webhook",
        "CRM",
        "POST every qualified lead and booked site visit to your CRM endpoint in real time.",
    ),
    (
        "calcom",
        "Cal.com",
        "Scheduling & Booking",
        "Sync booking pages so agents schedule site visits directly on your calendar.",
    ),
    (
        "sheets",
        "Google Sheets",
        "Reporting",
        "Append every completed call as a row in a shared sheet.",
    ),
]

# Same Hinglish-aware frustration cues the live agent uses for its calm-voice
# switch (agent/emotion.py) — reused here to derive a per-call sentiment badge.
_NEGATIVE_WORDS = {
    "frustrated", "frustrating", "annoyed", "annoying", "angry", "furious",
    "ridiculous", "terrible", "horrible", "worst", "useless", "pathetic",
    "waste", "complaint", "complain", "scam", "cheated", "fraud", "bakwas",
    "bekaar", "faltu", "ghatiya", "dhokha", "problem", "problems", "issue",
    "issues", "delay", "delayed", "nonsense", "stupid", "stop calling",
}
_POSITIVE_WORDS = {
    "great", "perfect", "excellent", "wonderful", "amazing", "love", "happy",
    "thanks", "thank you", "helpful", "badhiya", "accha", "acha", "shukriya",
    "dhanyavad", "sahi", "wah", "interested", "excited",
}


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _migrate_phone_numbers_columns(conn: sqlite3.Connection) -> None:
    """Add columns introduced after phone_numbers already shipped — CREATE TABLE
    IF NOT EXISTS above is a no-op on a table that already exists, so a
    pre-existing calls.db needs these added explicitly."""
    existing = {row["name"] for row in conn.execute("PRAGMA table_info(phone_numbers)").fetchall()}
    for column in ("lk_trunk_id", "lk_dispatch_rule_id"):
        if column not in existing:
            conn.execute(f"ALTER TABLE phone_numbers ADD COLUMN {column} TEXT")


def init_tables() -> None:
    conn = _connect()
    try:
        with conn:
            conn.executescript(_SCHEMA)
            _migrate_phone_numbers_columns(conn)
            if conn.execute("SELECT COUNT(*) c FROM agents").fetchone()["c"] == 0:
                conn.execute(
                    "INSERT INTO agents (name, description) VALUES (?, ?)",
                    (
                        "Riya",
                        "Senior real estate sales rep for Arthale Homes — qualifies "
                        "leads and books site visits in 11 Indian languages.",
                    ),
                )
            for key, name, category, description in _SEED_INTEGRATIONS:
                conn.execute(
                    "INSERT OR IGNORE INTO integrations (key, name, category, description) VALUES (?, ?, ?, ?)",
                    (key, name, category, description),
                )
            conn.execute(
                "INSERT OR IGNORE INTO settings (key, value) VALUES ('credits_total', '300')"
            )
    finally:
        conn.close()


# ---------------------------------------------------------------- calls


def _sentiment(transcript: list[dict]) -> str:
    visitor_text = " ".join(
        t.get("text", "").lower() for t in transcript if t.get("role") == "user"
    )
    negative = sum(1 for w in _NEGATIVE_WORDS if w in visitor_text)
    positive = sum(1 for w in _POSITIVE_WORDS if w in visitor_text)
    if negative > positive:
        return "negative"
    if positive > negative:
        return "positive"
    return "neutral"


def _status(row: sqlite3.Row, transcript: list[dict]) -> str:
    # A call that ended almost immediately with nothing captured and no real
    # exchange is a drop/failure; everything else completed.
    if (row["duration_seconds"] or 0) < 10 and not row["lead_name"] and len(transcript) < 2:
        return "failed"
    return "completed"


def _lead_status(row: sqlite3.Row) -> str:
    if row["site_visit_json"]:
        return "Site Visit Booked"
    if row["lead_name"]:
        return "Qualified"
    return "New"


def _initials(name: str) -> str:
    return ("".join(p[0] for p in name.split()[:2])).upper() or "?"


def _call_dict(row: sqlite3.Row, include_transcript: bool = True) -> dict:
    transcript = json.loads(row["transcript_json"]) if row["transcript_json"] else []
    name = row["lead_name"] or row["visitor_identity"] or "Unknown caller"
    out = {
        "id": str(row["id"]),
        "name": name,
        "initials": _initials(name),
        "phone": row["lead_phone"] or "",
        "budget": row["lead_budget"] or "",
        "location": row["lead_location"] or "",
        "timeline": row["lead_timeline"] or "",
        "status": _lead_status(row),
        "callStatus": _status(row, transcript),
        "sentiment": _sentiment(transcript),
        "channel": "Web",
        "agent": "Riya",
        "callDate": row["started_at"],
        "durationSeconds": row["duration_seconds"],
        "replyLanguage": row["reply_language"],
        "siteVisit": json.loads(row["site_visit_json"]) if row["site_visit_json"] else None,
    }
    if include_transcript:
        out["transcript"] = [
            {
                "speaker": "agent" if t.get("role") == "assistant" else "visitor",
                "text": t.get("text", ""),
            }
            for t in transcript
        ]
    return out


def list_calls(limit: int = 200, search: str = "", status: str = "", days: int = 0) -> list[dict]:
    if not DB_PATH.exists():
        return []
    conn = _connect()
    try:
        query = "SELECT * FROM calls"
        params: list = []
        if days:
            query += " WHERE date(started_at) >= date('now', ?)"
            params.append(f"-{days - 1} days")
        query += " ORDER BY started_at DESC LIMIT ?"
        params.append(limit)
        rows = conn.execute(query, params).fetchall()
        calls = [_call_dict(r, include_transcript=False) for r in rows]
        if search:
            s = search.lower()
            calls = [c for c in calls if s in c["name"].lower() or s in c["phone"]]
        if status:
            calls = [c for c in calls if c["callStatus"] == status or c["status"] == status]
        return calls
    finally:
        conn.close()


def get_call(call_id: int) -> dict | None:
    if not DB_PATH.exists():
        return None
    conn = _connect()
    try:
        row = conn.execute("SELECT * FROM calls WHERE id = ?", (call_id,)).fetchone()
        return _call_dict(row) if row else None
    finally:
        conn.close()


def calls_csv() -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        ["id", "caller", "phone", "status", "channel", "duration_seconds", "sentiment", "agent", "language", "time"]
    )
    for c in list_calls(limit=10000):
        writer.writerow(
            [c["id"], c["name"], c["phone"], c["callStatus"], c["channel"],
             c["durationSeconds"], c["sentiment"], c["agent"], c["replyLanguage"], c["callDate"]]
        )
    return buf.getvalue()


# ------------------------------------------------------------- dashboard


def summary() -> dict:
    conn = _connect()
    try:
        row = conn.execute(
            """
            SELECT COUNT(*) AS total,
                   SUM(CASE WHEN lead_name IS NOT NULL THEN 1 ELSE 0 END) AS qualified,
                   SUM(CASE WHEN site_visit_json IS NOT NULL THEN 1 ELSE 0 END) AS visits,
                   COALESCE(SUM(duration_seconds), 0) AS total_seconds,
                   COALESCE(AVG(duration_seconds), 0) AS avg_seconds
            FROM calls
            """
        ).fetchone()
        agents_live = conn.execute(
            "SELECT COUNT(*) c FROM agents WHERE status = 'live'"
        ).fetchone()["c"]
        total = row["total"] or 0
        qualified = row["qualified"] or 0
        visits = row["visits"] or 0
        return {
            "totalCalls": total,
            "qualifiedCalls": qualified,
            "siteVisits": visits,
            "qualifiedRatio": (qualified / total) if total else 0.0,
            "conversionRatio": (visits / total) if total else 0.0,
            "totalMinutes": round((row["total_seconds"] or 0) / 60, 1),
            "avgDurationSeconds": row["avg_seconds"] or 0.0,
            "activeAgents": agents_live,
        }
    finally:
        conn.close()


def usage_trends(days: int = 14) -> dict:
    conn = _connect()
    try:
        rows = conn.execute(
            """
            SELECT date(started_at) AS day,
                   COUNT(*) AS total,
                   SUM(CASE WHEN lead_name IS NOT NULL THEN 1 ELSE 0 END) AS qualified,
                   COALESCE(SUM(duration_seconds), 0) / 60.0 AS minutes
            FROM calls
            WHERE date(started_at) >= date('now', ?)
            GROUP BY day ORDER BY day
            """,
            (f"-{days - 1} days",),
        ).fetchall()
        return {
            "labels": [r["day"] for r in rows],
            "calls": [r["total"] for r in rows],
            "qualified": [r["qualified"] for r in rows],
            "minutes": [round(r["minutes"], 1) for r in rows],
        }
    finally:
        conn.close()


def analytics() -> dict:
    conn = _connect()
    try:
        languages = [
            {"language": r["reply_language"] or "unknown", "count": r["c"]}
            for r in conn.execute(
                "SELECT reply_language, COUNT(*) c FROM calls GROUP BY reply_language ORDER BY c DESC"
            ).fetchall()
        ]
        hours = [
            {"hour": int(r["h"]), "count": r["c"]}
            for r in conn.execute(
                "SELECT strftime('%H', started_at) h, COUNT(*) c FROM calls GROUP BY h ORDER BY h"
            ).fetchall()
        ]
        duration_trend = [
            {"day": r["day"], "avgSeconds": round(r["avg_s"] or 0, 1)}
            for r in conn.execute(
                """
                SELECT date(started_at) day, AVG(duration_seconds) avg_s FROM calls
                WHERE date(started_at) >= date('now', '-13 days')
                GROUP BY day ORDER BY day
                """
            ).fetchall()
        ]
        rows = conn.execute("SELECT * FROM calls").fetchall()
        sentiment = {"positive": 0, "neutral": 0, "negative": 0}
        engaged = 0
        for row in rows:
            transcript = json.loads(row["transcript_json"]) if row["transcript_json"] else []
            sentiment[_sentiment(transcript)] += 1
            if len(transcript) >= 4:
                engaged += 1
        s = summary()
        return {
            "languages": languages,
            "peakHours": hours,
            "durationTrend": duration_trend,
            "sentiment": sentiment,
            "funnel": {
                "answered": s["totalCalls"],
                "engaged": engaged,
                "qualified": s["qualifiedCalls"],
                "visitBooked": s["siteVisits"],
            },
        }
    finally:
        conn.close()


# ---------------------------------------------------------------- agents

_AGENT_FIELDS = ("name", "description", "model", "voice", "language", "status", "system_prompt", "kb_id")


def _agent_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"],
        "model": row["model"],
        "voice": row["voice"],
        "language": row["language"],
        "status": row["status"],
        "systemPrompt": row["system_prompt"],
        "kbId": row["kb_id"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def list_agents() -> list[dict]:
    conn = _connect()
    try:
        return [_agent_dict(r) for r in conn.execute("SELECT * FROM agents ORDER BY id").fetchall()]
    finally:
        conn.close()


def create_agent(data: dict) -> dict:
    conn = _connect()
    try:
        with conn:
            cur = conn.execute(
                "INSERT INTO agents (name, description, model, voice, language, system_prompt) VALUES (?, ?, ?, ?, ?, ?)",
                (
                    data.get("name", "Unnamed agent"),
                    data.get("description", ""),
                    data.get("model", "gpt-4.1"),
                    data.get("voice", "pooja"),
                    data.get("language", "hi-IN"),
                    data.get("systemPrompt", ""),
                ),
            )
        row = conn.execute("SELECT * FROM agents WHERE id = ?", (cur.lastrowid,)).fetchone()
        return _agent_dict(row)
    finally:
        conn.close()


def update_agent(agent_id: int, data: dict) -> dict | None:
    mapping = {"systemPrompt": "system_prompt", "kbId": "kb_id"}
    sets, params = [], []
    for key, value in data.items():
        column = mapping.get(key, key)
        if column in _AGENT_FIELDS:
            sets.append(f"{column} = ?")
            params.append(value)
    if not sets:
        return None
    conn = _connect()
    try:
        with conn:
            conn.execute(
                f"UPDATE agents SET {', '.join(sets)}, updated_at = datetime('now') WHERE id = ?",
                (*params, agent_id),
            )
        row = conn.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()
        return _agent_dict(row) if row else None
    finally:
        conn.close()


def delete_agent(agent_id: int) -> None:
    conn = _connect()
    try:
        with conn:
            conn.execute("DELETE FROM agents WHERE id = ?", (agent_id,))
    finally:
        conn.close()


# -------------------------------------------------------------- contacts


def _sync_contacts_from_calls(conn: sqlite3.Connection) -> None:
    """Upsert a contact for every call that captured a phone number."""
    rows = conn.execute(
        """
        SELECT lead_name, lead_phone, MAX(started_at) last_call,
               MAX(CASE WHEN site_visit_json IS NOT NULL THEN 1 ELSE 0 END) visited
        FROM calls WHERE lead_phone IS NOT NULL AND lead_phone != ''
        GROUP BY lead_phone
        """
    ).fetchall()
    with conn:
        for row in rows:
            conn.execute(
                """
                INSERT INTO contacts (name, phone, status, source, last_called_at)
                VALUES (?, ?, ?, 'call', ?)
                ON CONFLICT(phone) DO UPDATE SET
                    name = excluded.name,
                    status = excluded.status,
                    last_called_at = excluded.last_called_at
                """,
                (
                    row["lead_name"] or "Unknown",
                    row["lead_phone"],
                    "site_visit" if row["visited"] else "qualified",
                    row["last_call"],
                ),
            )


def list_contacts() -> list[dict]:
    conn = _connect()
    try:
        _sync_contacts_from_calls(conn)
        return [
            {
                "id": r["id"],
                "name": r["name"],
                "phone": r["phone"] or "",
                "email": r["email"],
                "status": r["status"],
                "tags": [t for t in (r["tags"] or "").split(",") if t],
                "source": r["source"],
                "lastCalledAt": r["last_called_at"],
                "createdAt": r["created_at"],
            }
            for r in conn.execute("SELECT * FROM contacts ORDER BY created_at DESC").fetchall()
        ]
    finally:
        conn.close()


def create_contact(data: dict) -> None:
    conn = _connect()
    try:
        with conn:
            conn.execute(
                """
                INSERT INTO contacts (name, phone, email, status, tags, source)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(phone) DO UPDATE SET
                    name = excluded.name, email = excluded.email,
                    status = excluded.status, tags = excluded.tags
                """,
                (
                    data.get("name", "Unknown"),
                    data.get("phone") or None,
                    data.get("email", ""),
                    data.get("status", "new"),
                    ",".join(data.get("tags", [])) if isinstance(data.get("tags"), list) else data.get("tags", ""),
                    data.get("source", "manual"),
                ),
            )
    finally:
        conn.close()


def delete_contact(contact_id: int) -> None:
    conn = _connect()
    try:
        with conn:
            conn.execute("DELETE FROM contacts WHERE id = ?", (contact_id,))
    finally:
        conn.close()


def delete_all_contacts() -> None:
    conn = _connect()
    try:
        with conn:
            conn.execute("DELETE FROM contacts")
    finally:
        conn.close()


def contacts_csv() -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["name", "phone", "email", "status", "tags", "source", "last_called_at"])
    for c in list_contacts():
        writer.writerow([c["name"], c["phone"], c["email"], c["status"], ";".join(c["tags"]), c["source"], c["lastCalledAt"]])
    return buf.getvalue()


def import_contacts_csv(text: str) -> int:
    reader = csv.DictReader(io.StringIO(text))
    count = 0
    for row in reader:
        normalized = {k.strip().lower(): (v or "").strip() for k, v in row.items() if k}
        if not normalized.get("name") and not normalized.get("phone"):
            continue
        create_contact(
            {
                "name": normalized.get("name") or "Unknown",
                "phone": normalized.get("phone"),
                "email": normalized.get("email", ""),
                "tags": normalized.get("tags", ""),
                "source": "import",
            }
        )
        count += 1
    return count


# ------------------------------------------------------- knowledge base


def list_knowledge_bases() -> list[dict]:
    conn = _connect()
    try:
        kbs = []
        for kb in conn.execute("SELECT * FROM knowledge_bases ORDER BY id").fetchall():
            sources = conn.execute(
                "SELECT id, name, type, length(content) size, created_at FROM knowledge_sources WHERE kb_id = ? ORDER BY id",
                (kb["id"],),
            ).fetchall()
            kbs.append(
                {
                    "id": kb["id"],
                    "name": kb["name"],
                    "createdAt": kb["created_at"],
                    "sources": [
                        {"id": s["id"], "name": s["name"], "type": s["type"], "sizeChars": s["size"], "createdAt": s["created_at"]}
                        for s in sources
                    ],
                }
            )
        return kbs
    finally:
        conn.close()


def create_knowledge_base(name: str) -> None:
    conn = _connect()
    try:
        with conn:
            conn.execute("INSERT INTO knowledge_bases (name) VALUES (?)", (name,))
    finally:
        conn.close()


def delete_knowledge_base(kb_id: int) -> None:
    conn = _connect()
    try:
        with conn:
            conn.execute("DELETE FROM knowledge_sources WHERE kb_id = ?", (kb_id,))
            conn.execute("DELETE FROM knowledge_bases WHERE id = ?", (kb_id,))
            conn.execute("UPDATE agents SET kb_id = NULL WHERE kb_id = ?", (kb_id,))
    finally:
        conn.close()


def add_knowledge_source(kb_id: int, name: str, content: str, source_type: str = "text") -> None:
    conn = _connect()
    try:
        with conn:
            conn.execute(
                "INSERT INTO knowledge_sources (kb_id, name, type, content) VALUES (?, ?, ?, ?)",
                (kb_id, name, source_type, content),
            )
    finally:
        conn.close()


def delete_knowledge_source(source_id: int) -> None:
    conn = _connect()
    try:
        with conn:
            conn.execute("DELETE FROM knowledge_sources WHERE id = ?", (source_id,))
    finally:
        conn.close()


# ------------------------------------------------------------ campaigns


def list_inbound_routes() -> list[dict]:
    conn = _connect()
    try:
        return [dict(r) for r in conn.execute("SELECT * FROM inbound_routes ORDER BY id DESC").fetchall()]
    finally:
        conn.close()


def create_inbound_route(data: dict) -> None:
    conn = _connect()
    try:
        with conn:
            conn.execute(
                """
                INSERT INTO inbound_routes
                    (phone_number, agent_id, timezone, max_concurrent, start_date, end_date,
                     window_start, window_end, active_days)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    data.get("phoneNumber"),
                    data.get("agentId"),
                    data.get("timezone", "Asia/Kolkata"),
                    data.get("maxConcurrent", 1),
                    data.get("startDate"),
                    data.get("endDate"),
                    data.get("windowStart"),
                    data.get("windowEnd"),
                    ",".join(data.get("activeDays", [])) if isinstance(data.get("activeDays"), list) else data.get("activeDays", ""),
                ),
            )
    finally:
        conn.close()


def list_campaigns() -> list[dict]:
    conn = _connect()
    try:
        return [dict(r) for r in conn.execute("SELECT * FROM campaigns ORDER BY id DESC").fetchall()]
    finally:
        conn.close()


def create_campaign(data: dict) -> None:
    conn = _connect()
    try:
        with conn:
            conn.execute(
                """
                INSERT INTO campaigns (name, agent_id, contact_tag, scheduled_date, window_start, window_end)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    data.get("name", "Untitled campaign"),
                    data.get("agentId"),
                    data.get("contactTag", ""),
                    data.get("scheduledDate"),
                    data.get("windowStart"),
                    data.get("windowEnd"),
                ),
            )
    finally:
        conn.close()


def update_campaign_status(campaign_id: int, status: str) -> None:
    conn = _connect()
    try:
        with conn:
            conn.execute("UPDATE campaigns SET status = ? WHERE id = ?", (status, campaign_id))
    finally:
        conn.close()


# ---------------------------------------------------------- integrations


def list_integrations() -> list[dict]:
    conn = _connect()
    try:
        return [
            {
                "key": r["key"],
                "name": r["name"],
                "category": r["category"],
                "description": r["description"],
                "status": r["status"],
                "config": json.loads(r["config_json"] or "{}"),
                "lastSync": r["last_sync"],
            }
            for r in conn.execute("SELECT * FROM integrations").fetchall()
        ]
    finally:
        conn.close()


def update_integration(key: str, status: str, config: dict) -> None:
    conn = _connect()
    try:
        with conn:
            conn.execute(
                "UPDATE integrations SET status = ?, config_json = ? WHERE key = ?",
                (status, json.dumps(config), key),
            )
    finally:
        conn.close()


# --------------------------------------------------------------- billing


def billing_summary() -> dict:
    conn = _connect()
    try:
        total_row = conn.execute("SELECT value FROM settings WHERE key = 'credits_total'").fetchone()
        credits_total = int(total_row["value"]) if total_row else 300
        minutes = conn.execute(
            "SELECT COALESCE(SUM(duration_seconds), 0) / 60.0 m FROM calls"
        ).fetchone()["m"]
        used = round(minutes, 1)
        return {
            "creditsTotal": credits_total,
            "creditsUsed": used,
            "creditsRemaining": max(0, round(credits_total - used, 1)),
            "minutesUsed": used,
        }
    finally:
        conn.close()


# --------------------------------------------------------- telephony (EnableX)


def _get_setting(conn: sqlite3.Connection, key: str) -> str | None:
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else None


def telephony_status() -> dict:
    """Connection state for the UI. Never returns the App Key — only whether
    one is set and a masked hint of the App ID."""
    conn = _connect()
    try:
        app_id = _get_setting(conn, "enablex_app_id")
        connected = bool(app_id and _get_setting(conn, "enablex_app_key"))
        masked = ""
        if app_id:
            masked = app_id[:4] + "…" + app_id[-4:] if len(app_id) > 8 else "set"
        return {"provider": "enablex", "connected": connected, "appIdHint": masked}
    finally:
        conn.close()


def connect_enablex(app_id: str, app_key: str) -> None:
    conn = _connect()
    try:
        with conn:
            for key, value in (("enablex_app_id", app_id), ("enablex_app_key", app_key)):
                conn.execute(
                    "INSERT INTO settings (key, value) VALUES (?, ?) "
                    "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    (key, value),
                )
    finally:
        conn.close()


def disconnect_enablex() -> None:
    conn = _connect()
    try:
        with conn:
            conn.execute("DELETE FROM settings WHERE key IN ('enablex_app_id', 'enablex_app_key')")
    finally:
        conn.close()


def _phone_number_dict(r: sqlite3.Row) -> dict:
    return {
        "id": r["id"],
        "number": r["number"],
        "label": r["label"],
        "provider": r["provider"],
        "agentId": r["agent_id"],
        "status": r["status"],
        "createdAt": r["created_at"],
        "lkTrunkId": r["lk_trunk_id"],
        "lkDispatchRuleId": r["lk_dispatch_rule_id"],
    }


def list_phone_numbers() -> list[dict]:
    conn = _connect()
    try:
        return [_phone_number_dict(r) for r in conn.execute("SELECT * FROM phone_numbers ORDER BY id DESC").fetchall()]
    finally:
        conn.close()


def get_phone_number(number_id: int) -> dict | None:
    conn = _connect()
    try:
        row = conn.execute("SELECT * FROM phone_numbers WHERE id = ?", (number_id,)).fetchone()
        return _phone_number_dict(row) if row else None
    finally:
        conn.close()


def get_phone_number_by_number(number: str) -> dict | None:
    conn = _connect()
    try:
        row = conn.execute("SELECT * FROM phone_numbers WHERE number = ?", (number,)).fetchone()
        return _phone_number_dict(row) if row else None
    finally:
        conn.close()


def add_phone_number(number: str, label: str = "", agent_id: int | None = None) -> int:
    conn = _connect()
    try:
        with conn:
            conn.execute(
                "INSERT INTO phone_numbers (number, label, provider, agent_id) "
                "VALUES (?, ?, 'enablex', ?) "
                "ON CONFLICT(number) DO UPDATE SET label = excluded.label, agent_id = excluded.agent_id",
                (number, label, agent_id),
            )
        return conn.execute("SELECT id FROM phone_numbers WHERE number = ?", (number,)).fetchone()["id"]
    finally:
        conn.close()


def assign_phone_number(number_id: int, agent_id: int | None) -> None:
    conn = _connect()
    try:
        with conn:
            conn.execute("UPDATE phone_numbers SET agent_id = ? WHERE id = ?", (agent_id, number_id))
    finally:
        conn.close()


def set_phone_number_lk_ids(number_id: int, trunk_id: str | None, dispatch_rule_id: str | None) -> None:
    conn = _connect()
    try:
        with conn:
            conn.execute(
                "UPDATE phone_numbers SET lk_trunk_id = ?, lk_dispatch_rule_id = ? WHERE id = ?",
                (trunk_id, dispatch_rule_id, number_id),
            )
    finally:
        conn.close()


def delete_phone_number(number_id: int) -> None:
    conn = _connect()
    try:
        with conn:
            conn.execute("DELETE FROM phone_numbers WHERE id = ?", (number_id,))
    finally:
        conn.close()


def get_setting(key: str) -> str | None:
    conn = _connect()
    try:
        return _get_setting(conn, key)
    finally:
        conn.close()


def set_setting(key: str, value: str) -> None:
    conn = _connect()
    try:
        with conn:
            conn.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, value),
            )
    finally:
        conn.close()


def enablex_credentials() -> tuple[str | None, str | None]:
    conn = _connect()
    try:
        return _get_setting(conn, "enablex_app_id"), _get_setting(conn, "enablex_app_key")
    finally:
        conn.close()


def _enablex_request(path: str, method: str, body: dict | None) -> dict:
    """Call the EnableX Voice REST API with the stored HTTP Basic credentials.

    `path` is relative to ENABLEX_API_BASE (e.g. "/call", "/call/<id>/accept").
    Returns {"ok": bool, ...} — never raises, so callers on the live-call path
    can degrade gracefully. Uses urllib to avoid adding a dependency.
    """
    import base64
    import json as _json
    import urllib.error
    import urllib.request

    app_id, app_key = enablex_credentials()
    if not app_id or not app_key:
        return {"ok": False, "error": "EnableX is not connected. Add your App ID and App Key first."}

    auth = base64.b64encode(f"{app_id}:{app_key}".encode()).decode()
    data = _json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        f"{ENABLEX_API_BASE}{path}",
        data=data,
        method=method,
        headers={"Authorization": f"Basic {auth}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as resp:
            payload = _json.loads(resp.read().decode() or "{}")
            return {"ok": True, "response": payload}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:400]
        return {"ok": False, "error": f"EnableX returned {exc.code}: {detail}"}
    except Exception as exc:  # network/DNS/timeout
        return {"ok": False, "error": f"Could not reach EnableX: {exc}"}


def place_test_call(from_number: str, to_number: str) -> dict:
    """Place a real outbound call through the EnableX Voice API, bridged
    straight to the LiveKit agent assigned to `from_number` — same bridge
    used for real inbound calls (see enablex_inbound_event in token_api.py),
    just triggered by an outbound leg instead of a webhook. This is what lets
    an operator actually talk to the agent (and hear it use the knowledge
    base) before running a campaign, instead of hearing a canned message.
    """
    import livekit_sip  # local import: livekit_sip imports this module at load time

    sip_uri = f"sip:{from_number}@{livekit_sip.sip_host()}"
    return _enablex_request(
        "/call",
        "POST",
        {
            "name": "Arthale Voice test call",
            "owner_ref": "arthale-dashboard-test",
            "from": from_number,
            "to": to_number,
            "action_on_connect": {
                "connect": {
                    "from": from_number,
                    "to": sip_uri,
                }
            },
        },
    )


def enablex_accept_call(voice_id: str) -> dict:
    """Answer a ringing inbound EnableX call leg (PUT /call/<id>/accept)."""
    return _enablex_request(f"/call/{voice_id}/accept", "PUT", None)


def enablex_connect_to_sip(voice_id: str, from_number: str, sip_uri: str) -> dict:
    """Bridge an accepted EnableX call leg out to a SIP URI (PUT /call/<id>/connect).

    EnableX's `connect` action accepts a phone number or a SIP URI as `to`,
    so pointing it at LiveKit's per-project SIP host hands the audio to the
    LiveKit agent while EnableX bridges the two legs.
    """
    return _enablex_request(
        f"/call/{voice_id}/connect",
        "PUT",
        {"from": from_number, "to": sip_uri},
    )
