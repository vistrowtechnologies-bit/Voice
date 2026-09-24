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
import vendor_live

# Monthly plan pricing in INR — mirrors the marketing pricing page. The admin
# "MRR" is estimated from this × each account's plan (no payment processor is
# wired yet). Keep in sync with web-demo marketingContent PRICING_PLANS.
PLAN_PRICING = {"free": 0, "starter": 2999, "growth": 5999, "scale": 12999}
# Anything not in this set counts as a paying account for funnel/MRR purposes.
_FREE_PLANS = {"free", "trial", ""}

# SQL fragment: credits burned by a call, using default per-channel rates.
_CREDITS_EXPR = "COALESCE(duration_seconds, 0) / 60.0 * (CASE WHEN call_type = 'phone' THEN 1.5 ELSE 1.0 END)"

# Mirrors calls_db.py's _NOW — duplicated rather than imported to keep this
# module's deliberate separation from calls_db (see module docstring).
_NOW = "(to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))"


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


def privacy_requests(status: str = "") -> list[dict]:
    conn = _connect()
    try:
        where = "WHERE pr.status = ?" if status else ""
        params = (status,) if status else ()
        rows = conn.execute(
            f"""SELECT pr.id, pr.request_type, pr.status, pr.admin_note, pr.created_at, pr.updated_at,
                       pr.user_id, u.name AS user_name, u.email AS user_email,
                       pr.account_id, a.name AS account_name
                FROM privacy_requests pr
                JOIN users u ON u.id = pr.user_id
                JOIN accounts a ON a.id = pr.account_id
                {where}
                ORDER BY CASE pr.status WHEN 'pending' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, pr.id DESC""",
            params,
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def update_privacy_request(request_id: int, status: str, admin_note: str = "") -> dict | None:
    if status not in ("pending", "in_progress", "completed", "rejected"):
        raise ValueError("invalid privacy request status")
    conn = _connect()
    try:
        with conn:
            conn.execute(
                f"UPDATE privacy_requests SET status = ?, admin_note = ?, updated_at = {_NOW} WHERE id = ?",
                (status, admin_note[:1000], request_id),
            )
        row = conn.execute("SELECT * FROM privacy_requests WHERE id = ?", (request_id,)).fetchone()
        return dict(row) if row else None
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
                f"""SELECT created_at::date::text AS day, COUNT(*) c FROM accounts
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
        health = _account_health(conn, acct, billing, users, agents, numbers, integrations)
        return {
            "health": health,
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


def _account_health(conn, acct: dict, billing: dict, users: list, agents: list, numbers: list, integrations: list) -> dict:
    """One support-facing summary of whether this workspace can take calls
    right now and what has gone wrong lately. Each check is ok / warn /
    critical with a sentence saying why, so a ticket can be triaged without
    clicking through every tab. Call outcomes use calls_db._status — the same
    rule the tenant's own Calls page shows — so both screens agree."""
    import calls_db

    account_id = acct["id"]
    checks: list[dict] = []

    def check(key: str, level: str, label: str, detail: str) -> None:
        checks.append({"key": key, "level": level, "label": label, "detail": detail})

    if (acct.get("status") or "active") == "suspended":
        check("status", "critical", "Account suspended", "Every call and login is blocked until it is reactivated.")
    else:
        check("status", "ok", "Account active", "Not suspended.")

    total = float(billing.get("creditsTotal") or 0)
    left = total - float(billing.get("creditsUsed") or 0)
    if left <= 0:
        check("credits", "critical", "Out of credits", f"0 of {round(total)} credits left — calls will not connect.")
    elif total and left < total * 0.1:
        check("credits", "warn", "Credits running low", f"{round(left)} of {round(total)} credits left (under 10%).")
    else:
        check("credits", "ok", "Credits", f"{round(left)} of {round(total)} credits left.")

    live = [a for a in agents if a.get("status") == "live"]
    if not agents:
        check("agents", "warn", "No agents", "The workspace has not created an agent yet.")
    elif not live:
        check("agents", "warn", "No live agent", f"{len(agents)} agent(s), none set to live.")
    else:
        check("agents", "ok", "Agents", f"{len(live)} of {len(agents)} agent(s) live.")

    active = [n for n in numbers if n.get("status") == "active"]
    unrouted = [n["number"] for n in active if not n.get("agent_id")]
    if unrouted:
        check("numbers", "warn", "Number without an agent", f"{', '.join(unrouted)} has no agent — inbound calls to it can't be answered.")
    elif active:
        check("numbers", "ok", "Phone numbers", f"{len(active)} active number(s), all routed to an agent.")
    else:
        check("numbers", "ok", "Phone numbers", "No phone number — website calls only.")

    broken = [i["name"] for i in integrations if (i.get("status") or "") not in {"connected", "not_connected", ""}]
    if broken:
        check("integrations", "warn", "Integration needs attention", ", ".join(broken))
    else:
        connected = sum(1 for i in integrations if i.get("status") == "connected")
        check("integrations", "ok", "Integrations", f"{connected} connected, none reporting a problem.")

    rows = conn.execute(
        """SELECT started_at, duration_seconds, lead_name, transcript_json,
                  COALESCE(failure_reason, '') failure_reason, COALESCE(disconnect_reason, '') disconnect_reason
           FROM calls WHERE account_id = ? AND started_at::timestamp >= now() - INTERVAL '7 days'
           ORDER BY started_at DESC LIMIT 500""",
        (account_id,),
    ).fetchall()
    failed_reasons: dict[str, int] = {}
    for r in rows:
        r = dict(r)
        try:
            transcript = json.loads(r["transcript_json"]) if r["transcript_json"] else []
        except ValueError:
            transcript = []
        if calls_db._status(r, transcript) == "failed":
            reason = r["failure_reason"] or r["disconnect_reason"] or "too short / no conversation"
            failed_reasons[reason] = failed_reasons.get(reason, 0) + 1
    failed = sum(failed_reasons.values())
    if rows and len(rows) >= 5 and failed / len(rows) >= 0.2:
        check("calls", "warn", "Many failed calls", f"{failed} of {len(rows)} calls failed in the last 7 days.")
    elif rows:
        check("calls", "ok", "Calls", f"{len(rows)} call(s) in the last 7 days, {failed} failed.")
    else:
        check("calls", "ok", "Calls", "No calls in the last 7 days.")

    errors = [
        dict(r)
        for r in conn.execute(
            """SELECT source, level, message, context, created_at FROM error_events
               WHERE account_id = ? AND created_at::timestamp >= now() - INTERVAL '7 days'
               ORDER BY id DESC LIMIT 10""",
            (account_id,),
        ).fetchall()
    ]
    if errors:
        check("errors", "warn", "Errors logged", f"{len(errors)}{'+' if len(errors) == 10 else ''} error(s) in the last 7 days — see below.")
    else:
        check("errors", "ok", "Errors", "Nothing logged in the last 7 days.")

    open_tickets = conn.execute(
        "SELECT COUNT(*) c FROM support_tickets WHERE account_id = ? AND status IN ('open', 'in_progress')", (account_id,)
    ).fetchone()["c"]
    last_call = conn.execute("SELECT MAX(started_at) m FROM calls WHERE account_id = ?", (account_id,)).fetchone()["m"]
    logins = [u["last_login_at"] for u in users if u.get("last_login_at")]

    order = {"critical": 0, "warn": 1, "ok": 2}
    overall = min((c["level"] for c in checks), key=order.__getitem__, default="ok")
    return {
        "overall": overall,
        "checks": sorted(checks, key=lambda c: order[c["level"]]),
        "calls7d": len(rows),
        "failed7d": failed,
        "failureReasons": sorted(({"reason": k, "count": v} for k, v in failed_reasons.items()), key=lambda x: -x["count"]),
        "errors": errors,
        "openTickets": open_tickets,
        "lastCallAt": last_call,
        "lastLoginAt": max(logins) if logins else None,
        "country": calls_db.get_account_country(account_id),
    }


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
        try:
            d["latency_metrics"] = json.loads(d.pop("latency_metrics_json") or "{}")
        except (TypeError, ValueError):
            d["latency_metrics"] = {}
        # Owner-only on purpose: the tool names are our internal
        # implementation and the timings are largely our own infrastructure,
        # so calls_db._call_dict withholds both from tenants. This is the
        # view where they are actually actionable.
        try:
            d["tool_calls"] = json.loads(d.pop("tool_calls_json") or "[]")
        except (TypeError, ValueError):
            d["tool_calls"] = []
        try:
            d["diagnostic_events"] = json.loads(d.pop("diagnostic_events_json") or "[]")
        except (TypeError, ValueError):
            d["diagnostic_events"] = []
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
                f"""SELECT created_at::date::text AS day, COUNT(*) c FROM accounts
                    WHERE created_at::date >= (CURRENT_DATE - INTERVAL '{days} days')::date
                    GROUP BY day ORDER BY day"""
            ).fetchall()
        ]
        call_series = [
            {"day": r["day"], "calls": r["c"], "minutes": round(r["m"] or 0, 0)}
            for r in conn.execute(
                f"""SELECT started_at::date::text AS day, COUNT(*) c, COALESCE(SUM(duration_seconds),0)/60.0 m FROM calls
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

        # Platform-wide disconnect_reason breakdown, last 24h. This is the
        # aggregate the max_output_tokens truncation bug should have shown
        # up in on its own: a spike in "client_initiated" endings across
        # many tenants' calls is exactly the shape a silent mid-call
        # truncation produces (agent goes dead air, carrier drops the
        # leg) — the per-call detail page already had disconnect_reason,
        # nothing rolled it up so a pattern could be seen instead of found
        # one transcript at a time.
        disconnects = [
            dict(r)
            for r in conn.execute(
                """SELECT COALESCE(NULLIF(disconnect_reason, ''), '(none)') reason, COUNT(*) count
                   FROM calls
                   WHERE started_at::timestamp >= now() - INTERVAL '24 hours'
                   GROUP BY 1 ORDER BY 2 DESC"""
            ).fetchall()
        ]
        return {
            "dbOk": db_ok, "errors": errors, "errorCount24h": error_count_24h,
            "disconnectReasons24h": disconnects,
        }
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


# ----------------------------------------------------------------- vendor credits

# Every upstream vendor Vistrow itself pays for. category groups them in the
# UI; mode is fixed here (not admin-editable) — "live" vendors get refreshed
# from vendor_live.LIVE_CHECKERS on every list_vendor_credits() call, "manual"
# vendors only change when an operator edits them.
VENDOR_CATALOG = [
    {"key": "sarvam", "name": "Sarvam AI", "category": "Speech", "mode": "manual"},
    {"key": "elevenlabs", "name": "ElevenLabs", "category": "Speech", "mode": "live"},
    {"key": "openai", "name": "OpenAI", "category": "LLM", "category_note": "conversation + KB + help chat", "mode": "manual"},
    {"key": "gemini", "name": "Google Gemini", "category": "LLM", "mode": "manual"},
    # Separate from "Google Gemini" above: this is the GCP *billing account*
    # that Chirp3/Gemini TTS actually bills against, not the Gemini API key.
    # It went uncovered here entirely — no entry existed while its payment
    # method sat unattached for 3+ days (from 09-11), silently breaking
    # every Chirp3 call platform-wide with a PermissionDenied that nothing
    # in this catalog would have surfaced. "manual" until a real Cloud
    # Billing API live-check is built (needs a signed-JWT OAuth exchange
    # from the service account creds, which is more than a GET+API-key —
    # see vendor_live.py's own bar for what earns a live checker).
    {"key": "gcp_billing", "name": "Google Cloud (Chirp3/TTS billing)", "category": "Speech",
     "category_note": "billing account behind google:chirp3/gemini TTS, not the Gemini API key above", "mode": "manual"},
    {"key": "livekit", "name": "LiveKit Cloud", "category": "Calling infra", "mode": "manual"},
    {"key": "enablex", "name": "EnableX", "category": "Telephony", "mode": "manual"},
    {"key": "b2", "name": "Backblaze B2", "category": "Recording storage", "mode": "manual"},
    {"key": "resend", "name": "Resend", "category": "Email", "mode": "manual"},
    {"key": "tavily", "name": "Tavily", "category": "Web search", "mode": "manual"},
]


def list_vendor_credits() -> list[dict]:
    conn = _connect()
    try:
        rows = {r["key"]: dict(r) for r in conn.execute("SELECT * FROM vendor_credits").fetchall()}
        result = []
        for v in VENDOR_CATALOG:
            row = rows.get(v["key"], {})
            entry = {
                "key": v["key"],
                "name": v["name"],
                "category": v["category"],
                "mode": v["mode"],
                "balance": row.get("balance"),
                "unit": row.get("unit") or "",
                "threshold": row.get("threshold"),
                "notes": row.get("notes") or "",
                "source": row.get("source") or "manual",
                "checkedAt": row.get("checked_at"),
                "lastError": row.get("last_error"),
                "updatedBy": row.get("updated_by") or "",
            }
            checker = vendor_live.LIVE_CHECKERS.get(v["key"])
            if checker:
                try:
                    balance, unit = checker()
                    entry.update(balance=balance, unit=unit, source="live", lastError=None)
                    _save_vendor_credit(v["key"], balance=balance, unit=unit, source="live", last_error=None)
                except vendor_live.LiveCheckError as e:
                    entry.update(source="live_failed", lastError=str(e))
                    _save_vendor_credit(v["key"], source="live_failed", last_error=str(e))
            result.append(entry)
        return result
    finally:
        conn.close()


def _save_vendor_credit(
    key: str,
    balance: float | None = None,
    unit: str | None = None,
    threshold: float | None = None,
    notes: str | None = None,
    source: str | None = None,
    last_error: str | None = None,
    updated_by: str | None = None,
    checked_at: bool = True,
) -> None:
    conn = _connect()
    try:
        with conn:
            conn.execute(
                "INSERT INTO vendor_credits (key) VALUES (?) ON CONFLICT (key) DO NOTHING",
                (key,),
            )
            sets, params = [], []
            for col, val in (
                ("balance", balance), ("unit", unit), ("threshold", threshold),
                ("notes", notes), ("source", source), ("last_error", last_error),
                ("updated_by", updated_by),
            ):
                if val is not None:
                    sets.append(f"{col} = ?")
                    params.append(val)
            if checked_at:
                sets.append("checked_at = " + _NOW)
            if sets:
                conn.execute(f"UPDATE vendor_credits SET {', '.join(sets)} WHERE key = ?", tuple(params) + (key,))
    finally:
        conn.close()


def update_vendor_credit(
    key: str, balance: float | None, unit: str, threshold: float | None, notes: str, updated_by: str,
) -> None:
    _save_vendor_credit(
        key, balance=balance, unit=unit, threshold=threshold, notes=notes,
        source="manual", last_error=None, updated_by=updated_by,
    )
