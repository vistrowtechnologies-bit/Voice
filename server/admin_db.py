"""Cross-tenant data layer for the super-admin panel.

Deliberately SEPARATE from calls_db.py: every function here reads across ALL
tenants (no account_id scoping), which is the exact opposite of the strict
per-tenant isolation calls_db enforces. Keeping the two physically apart means
a tenant route can never accidentally import a cross-tenant query, and these
queries can never be reached without the require_platform_owner guard in
token_api. Same `?`-placeholder / dbconn connection style as calls_db.

Credit-used is computed with the DEFAULT rate table (browser/widget=1x,
phone=1.5x) for list/aggregate views — accurate for every account that hasn't
customized its rates (all of them today). The per-account detail view calls
calls_db.billing_summary() for the exact figure.
"""

import json

import dbconn

# Monthly plan pricing in INR — mirrors the marketing pricing page. The admin
# "MRR" is estimated from this × each account's plan (no payment processor is
# wired yet). Keep in sync with web-demo marketingContent PRICING_PLANS.
PLAN_PRICING = {"free": 0, "starter": 2999, "growth": 5999, "scale": 12999}
# Anything not in this set counts as a paying account for funnel/MRR purposes.
_FREE_PLANS = {"free", "trial", ""}

# SQL fragment: credits burned by a call, using default per-channel rates.
_CREDITS_EXPR = "COALESCE(duration_seconds, 0) / 60.0 * (CASE WHEN call_type = 'phone' THEN 1.5 ELSE 1.0 END)"


def _connect() -> dbconn.Conn:
    return dbconn.connect()


# ----------------------------------------------------------------- audit trail


def write_audit(
    actor_user_id: int | None,
    actor_email: str,
    action: str,
    target_account_id: int | None = None,
    target_user_id: int | None = None,
    detail: str = "",
) -> None:
    conn = _connect()
    try:
        with conn:
            conn.execute(
                "INSERT INTO admin_audit_log (actor_user_id, actor_email, action, target_account_id, target_user_id, detail) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (actor_user_id, actor_email, action, target_account_id, target_user_id, detail),
            )
    finally:
        conn.close()


def log_error(message: str, source: str = "backend", level: str = "error", account_id: int | None = None, context: str = "") -> None:
    conn = _connect()
    try:
        with conn:
            conn.execute(
                "INSERT INTO error_events (account_id, source, level, message, context) VALUES (?, ?, ?, ?, ?)",
                (account_id, source, level, message[:2000], context[:2000]),
            )
    except Exception:
        # The error sink must never itself raise into a request path.
        pass
    finally:
        conn.close()


# ----------------------------------------------------------------- overview


def platform_overview(days: int = 30) -> dict:
    """KPI board + 'needs attention' + recent signups for the admin dashboard."""
    conn = _connect()
    try:
        one = lambda sql, p=(): (conn.execute(sql, p).fetchone() or {})  # noqa: E731

        total_accounts = one("SELECT COUNT(*) c FROM accounts").get("c", 0)
        suspended = one("SELECT COUNT(*) c FROM accounts WHERE status = 'suspended'").get("c", 0)
        total_users = one("SELECT COUNT(*) c FROM users").get("c", 0)
        active_accounts = one(
            f"SELECT COUNT(DISTINCT account_id) c FROM calls WHERE started_at::date >= (CURRENT_DATE - INTERVAL '{days} days')::date"
        ).get("c", 0)
        signups_7d = one("SELECT COUNT(*) c FROM accounts WHERE created_at::date >= (CURRENT_DATE - INTERVAL '7 days')::date").get("c", 0)
        signups_today = one("SELECT COUNT(*) c FROM accounts WHERE created_at::date = CURRENT_DATE").get("c", 0)
        calls_row = one(
            f"SELECT COUNT(*) c, COALESCE(SUM(duration_seconds),0)/60.0 m, COALESCE(SUM({_CREDITS_EXPR}),0) cr "
            f"FROM calls WHERE started_at::date >= (CURRENT_DATE - INTERVAL '{days} days')::date"
        )
        calls_total = one("SELECT COUNT(*) c FROM calls").get("c", 0)

        # MRR = sum of plan price across all non-free accounts.
        mrr = 0
        for r in conn.execute("SELECT plan, COUNT(*) c FROM accounts GROUP BY plan").fetchall():
            mrr += PLAN_PRICING.get((r["plan"] or "").lower(), 0) * r["c"]

        # Credits consumed vs allocated (platform-wide %).
        allocated = one("SELECT COALESCE(SUM(value::numeric),0) t FROM settings WHERE key = 'credits_total'").get("t", 0) or 0
        consumed = round(calls_row.get("cr", 0) or 0, 1)

        signup_series = [
            {"day": r["day"], "count": r["c"]}
            for r in conn.execute(
                f"""SELECT created_at::date::text day, COUNT(*) c FROM accounts
                    WHERE created_at::date >= (CURRENT_DATE - INTERVAL '{days} days')::date
                    GROUP BY day ORDER BY day"""
            ).fetchall()
        ]
        by_channel = [
            {"channel": r["t"], "count": r["c"]}
            for r in conn.execute(
                f"""SELECT COALESCE(call_type,'browser') t, COUNT(*) c FROM calls
                    WHERE started_at::date >= (CURRENT_DATE - INTERVAL '{days} days')::date
                    GROUP BY t ORDER BY c DESC"""
            ).fetchall()
        ]

        # Needs-attention signals.
        near_limit = one(
            f"""SELECT COUNT(*) c FROM (
                  SELECT a.id, COALESCE(st.value::numeric, 300) tot,
                         COALESCE((SELECT SUM({_CREDITS_EXPR}) FROM calls WHERE account_id = a.id), 0) used
                  FROM accounts a
                  LEFT JOIN settings st ON st.account_id = a.id AND st.key = 'credits_total'
                ) q WHERE tot > 0 AND used >= tot * 0.8"""
        ).get("c", 0)
        zero_call_signups = one(
            """SELECT COUNT(*) c FROM accounts a
               WHERE NOT EXISTS (SELECT 1 FROM calls WHERE account_id = a.id)
                 AND a.created_at::date >= (CURRENT_DATE - INTERVAL '30 days')::date"""
        ).get("c", 0)

        recent_signups = [
            dict(r)
            for r in conn.execute(
                """SELECT a.id, a.name, a.plan, a.status, a.created_at,
                          (SELECT email FROM users WHERE account_id = a.id ORDER BY id LIMIT 1) owner_email,
                          (SELECT auth_provider FROM users WHERE account_id = a.id ORDER BY id LIMIT 1) auth_provider
                   FROM accounts a ORDER BY a.id DESC LIMIT 8"""
            ).fetchall()
        ]

        return {
            "kpis": {
                "accounts": total_accounts,
                "activeAccounts": active_accounts,
                "suspended": suspended,
                "users": total_users,
                "signupsToday": signups_today,
                "signups7d": signups_7d,
                "callsWindow": calls_row.get("c", 0),
                "callsTotal": calls_total,
                "minutesWindow": round(calls_row.get("m", 0) or 0, 0),
                "mrr": mrr,
                "creditsConsumed": consumed,
                "creditsAllocated": round(float(allocated), 0),
                "creditsPct": round(consumed / float(allocated) * 100, 0) if allocated else 0,
            },
            "signupSeries": signup_series,
            "callsByChannel": by_channel,
            "needsAttention": {"nearLimit": near_limit, "zeroCallSignups": zero_call_signups, "suspended": suspended},
            "recentSignups": recent_signups,
        }
    finally:
        conn.close()


# ----------------------------------------------------------------- accounts


def list_accounts(search: str = "", plan: str = "", status: str = "", activity: str = "", limit: int = 50, offset: int = 0) -> dict:
    conn = _connect()
    try:
        where, params = [], []
        if search:
            where.append("(a.name ILIKE ? OR EXISTS (SELECT 1 FROM users u WHERE u.account_id = a.id AND u.email ILIKE ?))")
            params += [f"%{search}%", f"%{search}%"]
        if plan:
            where.append("a.plan = ?")
            params.append(plan)
        if status:
            where.append("a.status = ?")
            params.append(status)
        clause = ("WHERE " + " AND ".join(where)) if where else ""

        total = conn.execute(f"SELECT COUNT(*) c FROM accounts a {clause}", tuple(params)).fetchone()["c"]
        rows = conn.execute(
            f"""SELECT a.id, a.name, a.plan, a.status, a.created_at, a.is_platform_owner,
                       (SELECT email FROM users WHERE account_id = a.id ORDER BY id LIMIT 1) owner_email,
                       (SELECT COUNT(*) FROM users WHERE account_id = a.id) users,
                       (SELECT COUNT(*) FROM agents WHERE account_id = a.id) agents,
                       (SELECT COUNT(*) FROM calls WHERE account_id = a.id) calls,
                       (SELECT MAX(started_at) FROM calls WHERE account_id = a.id) last_call,
                       COALESCE((SELECT SUM({_CREDITS_EXPR}) FROM calls WHERE account_id = a.id), 0) credits_used,
                       COALESCE((SELECT value::numeric FROM settings WHERE account_id = a.id AND key = 'credits_total'), 300) credits_total
                FROM accounts a {clause}
                ORDER BY a.id DESC LIMIT ? OFFSET ?""",
            tuple(params) + (limit, offset),
        ).fetchall()
        accounts = []
        for r in rows:
            d = dict(r)
            d["credits_used"] = round(float(d["credits_used"] or 0), 1)
            d["credits_total"] = round(float(d["credits_total"] or 0), 0)
            d["mrr"] = PLAN_PRICING.get((d["plan"] or "").lower(), 0)
            accounts.append(d)
        # Activity filter is post-computed (needs the calls count above).
        if activity == "active":
            accounts = [a for a in accounts if a["calls"] > 0]
        elif activity == "idle":
            accounts = [a for a in accounts if a["calls"] == 0]
        return {"accounts": accounts, "total": total}
    finally:
        conn.close()


def account_detail(account_id: int) -> dict | None:
    conn = _connect()
    try:
        acct = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
        if acct is None:
            return None
        acct = dict(acct)
        owner = conn.execute(
            "SELECT id, email, name FROM users WHERE account_id = ? ORDER BY id LIMIT 1", (account_id,)
        ).fetchone()

        users = [
            dict(r)
            for r in conn.execute(
                "SELECT id, name, email, role, auth_provider, last_login_at, created_at FROM users WHERE account_id = ? ORDER BY id",
                (account_id,),
            ).fetchall()
        ]
        agents = [
            dict(r)
            for r in conn.execute(
                "SELECT id, name, status, voice, model, kb_id, updated_at FROM agents WHERE account_id = ? ORDER BY id",
                (account_id,),
            ).fetchall()
        ]
        kbs = [
            dict(r)
            for r in conn.execute(
                """SELECT k.id, k.name, k.strict,
                          (SELECT COUNT(*) FROM knowledge_sources WHERE kb_id = k.id) sources
                   FROM knowledge_bases k WHERE k.account_id = ? ORDER BY k.id""",
                (account_id,),
            ).fetchall()
        ]
        numbers = [
            dict(r)
            for r in conn.execute(
                "SELECT id, number, label, agent_id, status FROM phone_numbers WHERE account_id = ? ORDER BY id",
                (account_id,),
            ).fetchall()
        ]
        integrations = [
            dict(r)
            for r in conn.execute(
                "SELECT key, name, category, status FROM integrations WHERE account_id = ? ORDER BY name",
                (account_id,),
            ).fetchall()
        ]
        calls = [
            dict(r)
            for r in conn.execute(
                """SELECT id, room_name, started_at, duration_seconds, call_type, reply_language,
                          lead_name, lead_phone, agent_id
                   FROM calls WHERE account_id = ? ORDER BY started_at DESC LIMIT 25""",
                (account_id,),
            ).fetchall()
        ]
        audit = [
            dict(r)
            for r in conn.execute(
                "SELECT action, actor_email, detail, created_at FROM admin_audit_log WHERE target_account_id = ? ORDER BY id DESC LIMIT 15",
                (account_id,),
            ).fetchall()
        ]

        import calls_db  # local import: avoids a cycle at module load

        billing = calls_db.billing_summary(account_id)
        return {
            "account": acct,
            "owner": dict(owner) if owner else None,
            "billing": billing,
            "mrr": PLAN_PRICING.get((acct.get("plan") or "").lower(), 0),
            "users": users,
            "agents": agents,
            "knowledgeBases": kbs,
            "numbers": numbers,
            "integrations": integrations,
            "calls": calls,
            "audit": audit,
        }
    finally:
        conn.close()


# ----------------------------------------------------------------- users


def list_all_users(search: str = "", limit: int = 50, offset: int = 0) -> dict:
    conn = _connect()
    try:
        where, params = [], []
        if search:
            where.append("(u.email ILIKE ? OR u.name ILIKE ?)")
            params += [f"%{search}%", f"%{search}%"]
        clause = ("WHERE " + " AND ".join(where)) if where else ""
        total = conn.execute(f"SELECT COUNT(*) c FROM users u {clause}", tuple(params)).fetchone()["c"]
        rows = conn.execute(
            f"""SELECT u.id, u.name, u.email, u.role, u.auth_provider, u.last_login_at, u.created_at,
                       u.account_id, a.name account_name, a.status account_status
                FROM users u JOIN accounts a ON a.id = u.account_id {clause}
                ORDER BY u.id DESC LIMIT ? OFFSET ?""",
            tuple(params) + (limit, offset),
        ).fetchall()
        return {"users": [dict(r) for r in rows], "total": total}
    finally:
        conn.close()


# ----------------------------------------------------------------- calls


def list_all_calls(account_id: int = 0, channel: str = "", days: int = 0, search: str = "", limit: int = 50, offset: int = 0) -> dict:
    conn = _connect()
    try:
        where, params = [], []
        if account_id:
            where.append("c.account_id = ?")
            params.append(account_id)
        if channel:
            where.append("COALESCE(c.call_type, 'browser') = ?")
            params.append(channel)
        if days:
            where.append(f"c.started_at::date >= (CURRENT_DATE - INTERVAL '{int(days)} days')::date")
        if search:
            where.append("(c.lead_name ILIKE ? OR c.lead_phone ILIKE ? OR c.room_name ILIKE ?)")
            params += [f"%{search}%", f"%{search}%", f"%{search}%"]
        clause = ("WHERE " + " AND ".join(where)) if where else ""
        total = conn.execute(f"SELECT COUNT(*) c FROM calls c {clause}", tuple(params)).fetchone()["c"]
        rows = conn.execute(
            f"""SELECT c.id, c.account_id, a.name account_name, c.room_name, c.started_at,
                       c.duration_seconds, COALESCE(c.call_type,'browser') call_type, c.reply_language,
                       c.lead_name, c.lead_phone, c.agent_id,
                       {_CREDITS_EXPR} credits
                FROM calls c LEFT JOIN accounts a ON a.id = c.account_id {clause}
                ORDER BY c.started_at DESC LIMIT ? OFFSET ?""",
            tuple(params) + (limit, offset),
        ).fetchall()
        calls = []
        for r in rows:
            d = dict(r)
            d["credits"] = round(float(d["credits"] or 0), 2)
            d["qualified"] = bool(d.get("lead_name"))
            calls.append(d)
        return {"calls": calls, "total": total}
    finally:
        conn.close()


def call_detail(call_id: int) -> dict | None:
    conn = _connect()
    try:
        row = conn.execute(
            """SELECT c.*, a.name account_name FROM calls c LEFT JOIN accounts a ON a.id = c.account_id WHERE c.id = ?""",
            (call_id,),
        ).fetchone()
        if row is None:
            return None
        d = dict(row)
        d["transcript"] = json.loads(d.pop("transcript_json")) if d.get("transcript_json") else []
        return d
    finally:
        conn.close()


# ----------------------------------------------------------------- analytics


def analytics(days: int = 30) -> dict:
    conn = _connect()
    try:
        one = lambda sql, p=(): (conn.execute(sql, p).fetchone() or {})  # noqa: E731

        # Growth series.
        signup_series = [
            {"day": r["day"], "count": r["c"]}
            for r in conn.execute(
                f"""SELECT created_at::date::text day, COUNT(*) c FROM accounts
                    WHERE created_at::date >= (CURRENT_DATE - INTERVAL '{days} days')::date
                    GROUP BY day ORDER BY day"""
            ).fetchall()
        ]
        call_series = [
            {"day": r["day"], "calls": r["c"], "minutes": round(r["m"] or 0, 0)}
            for r in conn.execute(
                f"""SELECT started_at::date::text day, COUNT(*) c, COALESCE(SUM(duration_seconds),0)/60.0 m FROM calls
                    WHERE started_at::date >= (CURRENT_DATE - INTERVAL '{days} days')::date
                    GROUP BY day ORDER BY day"""
            ).fetchall()
        ]
        auth_breakdown = [
            {"provider": r["auth_provider"] or "password", "count": r["c"]}
            for r in conn.execute("SELECT COALESCE(auth_provider,'password') auth_provider, COUNT(*) c FROM users GROUP BY auth_provider").fetchall()
        ]
        channel_split = [
            {"channel": r["t"], "calls": r["c"], "minutes": round(r["m"] or 0, 0)}
            for r in conn.execute(
                "SELECT COALESCE(call_type,'browser') t, COUNT(*) c, COALESCE(SUM(duration_seconds),0)/60.0 m FROM calls GROUP BY t ORDER BY c DESC"
            ).fetchall()
        ]

        # Activation funnel.
        total_accounts = one("SELECT COUNT(*) c FROM accounts").get("c", 0)
        with_agent = one("SELECT COUNT(DISTINCT account_id) c FROM agents WHERE account_id IS NOT NULL").get("c", 0)
        with_call = one("SELECT COUNT(DISTINCT account_id) c FROM calls").get("c", 0)
        with_qualified = one("SELECT COUNT(DISTINCT account_id) c FROM calls WHERE lead_name IS NOT NULL").get("c", 0)
        paying = one("SELECT COUNT(*) c FROM accounts WHERE LOWER(COALESCE(plan,'')) NOT IN ('free','trial','')").get("c", 0)

        avg_duration = one("SELECT COALESCE(AVG(duration_seconds),0) a FROM calls").get("a", 0)

        # Retention: active this vs last calendar month.
        active_this = one("SELECT COUNT(DISTINCT account_id) c FROM calls WHERE started_at::date >= date_trunc('month', CURRENT_DATE)::date").get("c", 0)
        active_last = one(
            "SELECT COUNT(DISTINCT account_id) c FROM calls WHERE started_at::date >= (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date "
            "AND started_at::date < date_trunc('month', CURRENT_DATE)::date"
        ).get("c", 0)

        # MRR + ARPA.
        mrr = 0
        for r in conn.execute("SELECT plan, COUNT(*) c FROM accounts GROUP BY plan").fetchall():
            mrr += PLAN_PRICING.get((r["plan"] or "").lower(), 0) * r["c"]

        return {
            "signupSeries": signup_series,
            "callSeries": call_series,
            "authBreakdown": auth_breakdown,
            "channelSplit": channel_split,
            "funnel": [
                {"step": "Signed up", "count": total_accounts},
                {"step": "Configured agent", "count": with_agent},
                {"step": "First call", "count": with_call},
                {"step": "Qualified lead", "count": with_qualified},
                {"step": "Paying", "count": paying},
            ],
            "avgDurationSec": round(avg_duration or 0, 1),
            "retention": {"activeThisMonth": active_this, "activeLastMonth": active_last},
            "mrr": mrr,
            "arpa": round(mrr / paying) if paying else 0,
        }
    finally:
        conn.close()


# ----------------------------------------------------------------- billing


def billing_overview() -> dict:
    conn = _connect()
    try:
        by_plan = []
        mrr = 0
        for r in conn.execute("SELECT plan, COUNT(*) c FROM accounts GROUP BY plan ORDER BY c DESC").fetchall():
            price = PLAN_PRICING.get((r["plan"] or "").lower(), 0)
            contribution = price * r["c"]
            mrr += contribution
            by_plan.append({"plan": r["plan"] or "free", "accounts": r["c"], "price": price, "mrr": contribution})

        paying = sum(p["accounts"] for p in by_plan if p["price"] > 0)

        usage = conn.execute(
            f"""SELECT a.id, a.name, a.plan,
                       COALESCE((SELECT value::numeric FROM settings WHERE account_id = a.id AND key = 'credits_total'), 300) tot,
                       COALESCE((SELECT SUM({_CREDITS_EXPR}) FROM calls WHERE account_id = a.id), 0) used
                FROM accounts a"""
        ).fetchall()
        near_limit, convert = [], []
        for r in usage:
            tot = float(r["tot"] or 0)
            used = round(float(r["used"] or 0), 1)
            pct = round(used / tot * 100, 0) if tot else 0
            row = {"id": r["id"], "name": r["name"], "plan": r["plan"], "used": used, "total": round(tot, 0), "pct": pct}
            if tot > 0 and pct >= 80:
                near_limit.append(row)
            if PLAN_PRICING.get((r["plan"] or "").lower(), 0) == 0 and used > 5:
                convert.append(row)
        near_limit.sort(key=lambda x: x["pct"], reverse=True)
        convert.sort(key=lambda x: x["used"], reverse=True)

        return {
            "mrr": mrr,
            "payingAccounts": paying,
            "arpa": round(mrr / paying) if paying else 0,
            "byPlan": by_plan,
            "nearLimit": near_limit[:20],
            "convert": convert[:20],
        }
    finally:
        conn.close()


# ----------------------------------------------------------------- support & audit


def audit_log(action: str = "", limit: int = 100, offset: int = 0) -> dict:
    conn = _connect()
    try:
        where, params = [], []
        if action == "impersonation":
            where.append("action = 'impersonate'")
        elif action == "actions":
            where.append("action != 'impersonate'")
        clause = ("WHERE " + " AND ".join(where)) if where else ""
        total = conn.execute(f"SELECT COUNT(*) c FROM admin_audit_log {clause}", tuple(params)).fetchone()["c"]
        rows = conn.execute(
            f"""SELECT l.id, l.actor_email, l.action, l.target_account_id, l.target_user_id, l.detail, l.created_at,
                       a.name target_account_name
                FROM admin_audit_log l LEFT JOIN accounts a ON a.id = l.target_account_id {clause}
                ORDER BY l.id DESC LIMIT ? OFFSET ?""",
            tuple(params) + (limit, offset),
        ).fetchall()
        return {"entries": [dict(r) for r in rows], "total": total}
    finally:
        conn.close()


# ----------------------------------------------------------------- system health


def system_health() -> dict:
    conn = _connect()
    try:
        # DB ping (round-trip on the live pooled connection).
        db_ok = conn.execute("SELECT 1 ok").fetchone()["ok"] == 1

        errors = [
            dict(r)
            for r in conn.execute(
                """SELECT e.id, e.account_id, a.name account_name, e.source, e.level, e.message, e.context, e.created_at
                   FROM error_events e LEFT JOIN accounts a ON a.id = e.account_id
                   ORDER BY e.id DESC LIMIT 40"""
            ).fetchall()
        ]
        error_count_24h = conn.execute(
            "SELECT COUNT(*) c FROM error_events WHERE created_at::timestamp >= now() - INTERVAL '24 hours'"
        ).fetchone()["c"]
        return {"dbOk": db_ok, "errors": errors, "errorCount24h": error_count_24h}
    finally:
        conn.close()


# ----------------------------------------------------------------- mutations


def adjust_credits(account_id: int, new_total: int) -> None:
    conn = _connect()
    try:
        with conn:
            conn.execute(
                "INSERT INTO settings (account_id, key, value) VALUES (?, 'credits_total', ?) "
                "ON CONFLICT (account_id, key) DO UPDATE SET value = EXCLUDED.value",
                (account_id, str(int(new_total))),
            )
    finally:
        conn.close()


def change_plan(account_id: int, plan: str) -> None:
    conn = _connect()
    try:
        with conn:
            conn.execute("UPDATE accounts SET plan = ? WHERE id = ?", (plan, account_id))
    finally:
        conn.close()


def set_account_status(account_id: int, status: str) -> None:
    conn = _connect()
    try:
        with conn:
            conn.execute("UPDATE accounts SET status = ? WHERE id = ?", (status, account_id))
    finally:
        conn.close()


def set_account_notes(account_id: int, notes: str) -> None:
    conn = _connect()
    try:
        with conn:
            conn.execute("UPDATE accounts SET notes = ? WHERE id = ?", (notes, account_id))
    finally:
        conn.close()
