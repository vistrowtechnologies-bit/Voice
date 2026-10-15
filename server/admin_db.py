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

import datetime
import json
import logging
import time

import dbconn
import vendor_live

logger = logging.getLogger(__name__)

# Monthly plan pricing in INR — mirrors the marketing pricing page. The admin
# "MRR" is this × the plan of each active subscription (see _mrr). Keep in
# sync with web-demo marketingContent PRICING_PLANS.
PLAN_PRICING = {"free": 0, "starter": 2999, "growth": 5999, "scale": 12999}
# Anything not in this set counts as a paying account for funnel/MRR purposes.
_FREE_PLANS = {"free", "trial", ""}

# SQL fragment: credits burned by a call, using default per-channel rates.
_CREDITS_EXPR = "COALESCE(duration_seconds, 0) / 60.0 * (CASE WHEN call_type = 'phone' THEN 1.5 ELSE 1.0 END)"

# Mirrors calls_db.py's _NOW — duplicated rather than imported to keep this
# module's deliberate separation from calls_db (see module docstring).
_NOW = "(to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))"
# Text timestamps in this database are UTC; compare them against this.
_UTC_NOW = "(now() AT TIME ZONE 'UTC')"

# Honest money. An account is paying when it has an active subscription or a
# paid invoice in the last 35 days; MRR counts active subscriptions only.
# accounts.plan says nothing about payment (every signup starts on 'starter').
_ACTIVE_SUB_PLAN = "(SELECT s.plan FROM subscriptions s WHERE s.account_id = a.id AND s.status = 'active')"
_PAYING = (
    f"({_ACTIVE_SUB_PLAN} IS NOT NULL OR EXISTS (SELECT 1 FROM invoices i WHERE i.account_id = a.id "
    f"AND i.status = 'paid' AND i.paid_at IS NOT NULL AND i.paid_at::timestamp >= {_UTC_NOW} - INTERVAL '35 days'))"
)

# The two LiveKit workers, each writing settings(0, 'worker_heartbeat.<name>')
# every 60 s (agent/worker_heartbeat.py). Stale after 3 minutes.
EXPECTED_WORKERS = (("tenant", "CA_TGdpVhSdxDyS"), ("platform-demo", "CA_53d8HgBktjZ7"))
WORKER_STALE_SECONDS = 180


def _mrr(conn) -> int:
    return sum(
        PLAN_PRICING.get((r["plan"] or "").lower(), 0)
        for r in conn.execute("SELECT plan FROM subscriptions WHERE status = 'active'").fetchall()
    )


def _paying_count(conn) -> int:
    return conn.execute(f"SELECT COUNT(*) c FROM accounts a WHERE {_PAYING}").fetchone()["c"]


def _failed_call_sql(alias: str = "c") -> str:
    """Same rule as the tenant Calls page's transport failures
    (calls_db._status), without its too-short heuristic."""
    import calls_db  # local import: see account_detail

    reasons = ", ".join(f"'{r}'" for r in sorted(calls_db.FAILED_DISCONNECT_REASONS))
    return (
        f"(COALESCE(TRIM({alias}.failure_reason), '') <> '' "
        f"OR LOWER(TRIM(COALESCE({alias}.disconnect_reason, ''))) IN ({reasons}))"
    )


def _iso_z(text) -> str | None:
    """A stored timestamp (naive UTC text or ISO with offset) as UTC ISO with Z."""
    if not text:
        return None
    try:
        value = datetime.datetime.fromisoformat(str(text).replace("Z", "+00:00"))
    except ValueError:
        return None
    if value.tzinfo is not None:
        value = value.astimezone(datetime.timezone.utc).replace(tzinfo=None)
    return value.strftime("%Y-%m-%dT%H:%M:%SZ")


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
    # The error sink must never itself raise into a request path - including
    # when the database is the thing that is down, so connect inside the try.
    try:
        conn = _connect()
    except Exception:
        logger.warning("log_error: could not connect to record %r", message[:200])
        return
    try:
        with conn:
            conn.execute(
                "INSERT INTO error_events (account_id, source, level, message, context) VALUES (?, ?, ?, ?, ?)",
                (account_id, source, level, message[:2000], context[:2000]),
            )
    except Exception:
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

        mrr = _mrr(conn)

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
                          (SELECT auth_provider FROM users WHERE account_id = a.id ORDER BY id LIMIT 1) auth_provider,
                          (SELECT COUNT(*) FROM calls WHERE account_id = a.id) calls,
                          (SELECT MIN(started_at) FROM calls WHERE account_id = a.id) "firstCallAt"
                   FROM accounts a ORDER BY a.id DESC LIMIT 8"""
            ).fetchall()
        ]
        ops = _ops_counters(conn)
        revenue = _revenue_mtd(conn)

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
            "ops": ops,
            "revenueMtd": revenue,
        }
    finally:
        conn.close()


def _revenue_mtd(conn) -> dict:
    """Money actually captured this calendar month (IST), from invoices; the
    current-month row of _revenue_months (same rules)."""
    month = _revenue_months(conn, 1)[-1]
    return {k: month[k] for k in ("capturedInr", "topupsInr", "refundsInr", "netInr")}


def credit_positions(conn=None) -> list[dict]:
    """Every account's credits left this period (calls_db.billing_summary, the
    number the tenant sees) and how many live agents it has."""
    import calls_db  # local import: see account_detail

    own = conn is None
    conn = conn or _connect()
    try:
        rows = conn.execute(
            "SELECT a.id, a.name, (SELECT COUNT(*) FROM agents g WHERE g.account_id = a.id AND g.status = 'live') live "
            "FROM accounts a ORDER BY a.id"
        ).fetchall()
    finally:
        if own:
            conn.close()
    positions = []
    for r in rows:
        try:
            billing = calls_db.billing_summary(r["id"])
        except Exception:
            logger.exception("credit_positions: billing_summary failed for account %s", r["id"])
            continue
        positions.append({
            "accountId": r["id"], "name": r["name"], "liveAgents": int(r["live"] or 0),
            "total": float(billing.get("creditsTotal") or 0), "remaining": float(billing.get("creditsRemaining") or 0),
        })
    return positions


def _ops_counters(conn) -> dict:
    one = lambda sql, p=(): conn.execute(sql, p).fetchone()["c"]  # noqa: E731
    failed = _failed_call_sql()
    positions = credit_positions(conn)
    low = low_credit_accounts(conn, positions)
    workers = worker_statuses(conn)
    return {
        "failedCalls1h": one(f"SELECT COUNT(*) c FROM calls c WHERE {failed} AND c.started_at::timestamp >= {_UTC_NOW} - INTERVAL '1 hour'"),
        "failedCalls24h": one(f"SELECT COUNT(*) c FROM calls c WHERE {failed} AND c.started_at::timestamp >= {_UTC_NOW} - INTERVAL '24 hours'"),
        # The free trial is a one-time credit allowance with no end date in
        # the code (settings.trial_started_at only marks its start), so there
        # is nothing to count yet.
        "trialsEnding7d": None,
        "cancellationsPending": one(
            "SELECT COUNT(*) c FROM subscriptions WHERE status = 'active' AND COALESCE(cancel_at_period_end, 0) = 1"
        ),
        "openTickets": one("SELECT COUNT(*) c FROM support_tickets WHERE status IN ('open', 'in_progress')"),
        # Open tickets whose latest non-note message is not ours (or that
        # nobody has answered yet).
        "awaitingUs": one(
            """SELECT COUNT(*) c FROM support_tickets t WHERE t.status IN ('open', 'in_progress')
               AND COALESCE((SELECT m.author_type FROM support_ticket_messages m
                             WHERE m.ticket_id = t.id AND m.author_type <> 'note' ORDER BY m.id DESC LIMIT 1), 'customer') <> 'support'"""
        ),
        # Same rule as the low-credit owner alert (is_low_credit): a live
        # agent and under ~3 days of its own recent use left.
        "creditsLowAccounts": len(low),
        "creditsLowList": low[:10],
        "zeroBalanceLiveAccounts": sum(1 for p in positions if p["remaining"] <= 0 and p["liveAgents"] > 0),
        "integrationFailures24h": one(
            f"SELECT COUNT(*) c FROM integration_deliveries WHERE status = 'failed' AND created_at::timestamp >= {_UTC_NOW} - INTERVAL '24 hours'"
        ),
        "workersHealthy": sum(1 for w in workers if w["status"] == "ok"),
        "workersExpected": len(EXPECTED_WORKERS),
    }


def worker_statuses(conn=None, now: float | None = None) -> list[dict]:
    """Both expected LiveKit workers, from their heartbeat settings rows."""
    own = conn is None
    conn = conn or _connect()
    try:
        keys = tuple(f"worker_heartbeat.{name}" for name, _ in EXPECTED_WORKERS)
        rows = {
            r["key"]: r["value"]
            for r in conn.execute(
                f"SELECT key, value FROM settings WHERE account_id = 0 AND key IN ({', '.join('?' for _ in keys)})", keys
            ).fetchall()
        }
    finally:
        if own:
            conn.close()
    now = time.time() if now is None else now
    workers = []
    for name, agent_id in EXPECTED_WORKERS:
        try:
            beat = json.loads(rows.get(f"worker_heartbeat.{name}") or "{}")
        except ValueError:
            beat = {}
        seen = beat.get("seenAt")
        age = None
        if seen:
            try:
                seen_dt = datetime.datetime.strptime(seen, "%Y-%m-%d %H:%M:%S").replace(tzinfo=datetime.timezone.utc)
                age = max(0, int(now - seen_dt.timestamp()))
            except ValueError:
                seen = None
        workers.append({
            "name": name, "agentId": agent_id, "lastSeenAt": seen, "ageSeconds": age,
            "status": "unknown" if age is None else ("ok" if age <= WORKER_STALE_SECONDS else "stale"),
            "version": beat.get("version") or None, "host": beat.get("host") or None,
        })
    return workers


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
                       a.referral_source, a.onboarding_profile, a.signup_attribution,
                       (SELECT email FROM users WHERE account_id = a.id ORDER BY id LIMIT 1) owner_email,
                       (SELECT COUNT(*) FROM users WHERE account_id = a.id) users,
                       (SELECT COUNT(*) FROM agents WHERE account_id = a.id) agents,
                       (SELECT COUNT(*) FROM calls WHERE account_id = a.id) calls,
                       (SELECT MAX(started_at) FROM calls WHERE account_id = a.id) last_call,
                       COALESCE((SELECT SUM({_CREDITS_EXPR}) FROM calls WHERE account_id = a.id), 0) credits_used,
                       COALESCE((SELECT value::numeric FROM settings WHERE account_id = a.id AND key = 'credits_total'), 300) credits_total,
                       {_ACTIVE_SUB_PLAN} sub_plan
                FROM accounts a {clause}
                ORDER BY a.id DESC LIMIT ? OFFSET ?""",
            tuple(params) + (limit, offset),
        ).fetchall()
        accounts = []
        for r in rows:
            d = dict(r)
            d["credits_used"] = round(float(d["credits_used"] or 0), 1)
            d["credits_total"] = round(float(d["credits_total"] or 0), 0)
            d["mrr"] = PLAN_PRICING.get((d.pop("sub_plan") or "").lower(), 0)
            # Only the two signup facts the list shows, not the whole JSON.
            profile = _json_or_empty(d.pop("onboarding_profile", ""))
            attribution = _json_or_empty(d.pop("signup_attribution", ""))
            d["industry"] = profile.get("industry", "")
            d["source"] = attribution.get("utm_source") or d.get("referral_source") or ""
            accounts.append(d)
        # Activity filter is post-computed (needs the calls count above).
        if activity == "active":
            accounts = [a for a in accounts if a["calls"] > 0]
        elif activity == "idle":
            accounts = [a for a in accounts if a["calls"] == 0]
        return {"accounts": accounts, "total": total}
    finally:
        conn.close()


def _json_or_empty(raw: object) -> dict:
    try:
        value = json.loads(raw or "{}") if isinstance(raw, str) else (raw or {})
    except ValueError:
        return {}
    return value if isinstance(value, dict) else {}


def account_detail(account_id: int) -> dict | None:
    conn = _connect()
    try:
        acct = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
        if acct is None:
            return None
        acct = dict(acct)
        acct["onboarding_profile"] = _json_or_empty(acct.get("onboarding_profile"))
        acct["signup_attribution"] = _json_or_empty(acct.get("signup_attribution"))
        owner = conn.execute(
            "SELECT id, email, name, phone, auth_provider FROM users WHERE account_id = ? ORDER BY id LIMIT 1", (account_id,)
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
        invoices = [
            dict(r)
            for r in conn.execute(
                "SELECT id, kind, amount_inr, status, credits, bonus_credits, invoice_number, created_at, paid_at "
                "FROM invoices WHERE account_id = ? ORDER BY id DESC LIMIT 10",
                (account_id,),
            ).fetchall()
        ]

        import calls_db  # local import: avoids a cycle at module load

        billing = calls_db.billing_summary(account_id)
        copilot_actions = calls_db.list_copilot_actions(account_id, limit=10)
        health = _account_health(conn, acct, billing, users, agents, numbers, integrations)
        sub_plan = conn.execute(f"SELECT {_ACTIVE_SUB_PLAN} p FROM accounts a WHERE a.id = ?", (account_id,)).fetchone()["p"]
        return {
            "health": health,
            "account": acct,
            "owner": dict(owner) if owner else None,
            "billing": billing,
            "mrr": PLAN_PRICING.get((sub_plan or "").lower(), 0),
            "users": users,
            "agents": agents,
            "knowledgeBases": kbs,
            "numbers": numbers,
            "integrations": integrations,
            "calls": calls,
            "audit": audit,
            "invoices": invoices,
            "copilotActions": copilot_actions,
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
    lost = conn.execute(
        "SELECT COUNT(*) AS n FROM calls WHERE account_id = ? AND recording_status = 'failed' "
        "AND started_at::timestamp >= now() - INTERVAL '7 days'",
        (account_id,),
    ).fetchone()
    lost_n = int((lost["n"] if lost else 0) or 0)
    if lost_n:
        check(
            "recordings", "critical" if lost_n >= 3 else "warn", "Call recordings lost",
            f"{lost_n} call(s) in the last 7 days ended without a saved recording. The audio cannot be recovered; "
            "check the agent worker logs for 'RECORDING FAILED'.",
        )
    else:
        check("recordings", "ok", "Call recordings", "No lost recordings in the last 7 days.")

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


def list_all_calls(
    account_id: int = 0, channel: str = "", days: int = 0, search: str = "", limit: int = 50, offset: int = 0,
    outcome: str = "", hours: int = 0,
) -> dict:
    conn = _connect()
    try:
        where, params = [], []
        if account_id:
            where.append("c.account_id = ?")
            params.append(account_id)
        if channel:
            where.append("COALESCE(c.call_type, 'browser') = ?")
            params.append(channel)
        if outcome == "failed":
            where.append(_failed_call_sql())
        elif outcome == "ok":
            where.append(f"NOT {_failed_call_sql()}")
        if hours:
            where.append(f"c.started_at::timestamp >= {_UTC_NOW} - INTERVAL '{int(hours)} hours'")
        elif days:
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
                       NULLIF(c.failure_reason, '') "failureReason", NULLIF(c.disconnect_reason, '') "disconnectReason",
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
            d["startedAtIso"] = _iso_z(d.get("started_at"))
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
        # The storage key and the public CRM playback token are bearer
        # secrets; the admin page only needs to know a recording exists.
        d["hasRecording"] = bool(d.pop("recording_key", None))
        d.pop("recording_share_token", None)
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
        paying = _paying_count(conn)

        avg_duration = one("SELECT COALESCE(AVG(duration_seconds),0) a FROM calls").get("a", 0)

        # Retention: active this vs last calendar month.
        active_this = one("SELECT COUNT(DISTINCT account_id) c FROM calls WHERE started_at::date >= date_trunc('month', CURRENT_DATE)::date").get("c", 0)
        active_last = one(
            "SELECT COUNT(DISTINCT account_id) c FROM calls WHERE started_at::date >= (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date "
            "AND started_at::date < date_trunc('month', CURRENT_DATE)::date"
        ).get("c", 0)

        # MRR + ARPA.
        mrr = _mrr(conn)

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
        # Accounts per plan label; MRR only from the active subscriptions.
        plans: dict[str, dict] = {}
        for r in conn.execute(
            """SELECT a.plan, s.plan sub_plan FROM accounts a
               LEFT JOIN subscriptions s ON s.account_id = a.id AND s.status = 'active'"""
        ).fetchall():
            plan = r["plan"] or "free"
            row = plans.setdefault(plan, {"plan": plan, "accounts": 0, "price": PLAN_PRICING.get(plan.lower(), 0), "mrr": 0})
            row["accounts"] += 1
            row["mrr"] += PLAN_PRICING.get((r["sub_plan"] or "").lower(), 0)
        by_plan = sorted(plans.values(), key=lambda p: p["accounts"], reverse=True)
        mrr = _mrr(conn)
        paying = _paying_count(conn)

        usage = conn.execute(
            f"""SELECT a.id, a.name, a.plan,
                       COALESCE((SELECT value::numeric FROM settings WHERE account_id = a.id AND key = 'credits_total'), 300) tot,
                       COALESCE((SELECT SUM({_CREDITS_EXPR}) FROM calls WHERE account_id = a.id), 0) used,
                       {_PAYING} paying
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
            if not r["paying"] and used > 5:
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


# ----------------------------------------------------------------- usage & cost

# ESTIMATED vendor cost of one conversation minute, INR, GST excluded. The ONE
# table every admin cost/margin figure is built from; the API and the UI label
# the result "estimated". Nothing records real per-call vendor cost yet (admin
# audit 2026-10-11, P1 "per-call cost columns"), so these are averages from the
# sources cited, not a measurement of any given call. Update them here when a
# new bill or price page says otherwise.
VENDOR_COST_RATES = {
    # Gemini Live 3.1 (gemini-3.1-flash-live-preview), all of STT+LLM+TTS:
    # Google Cloud bill, Gemini API "Bidi generate content" SKUs, 6-9 Oct
    # 2026: about Rs424 over 25.2 call minutes. Mostly text input, the prompt
    # re-billed every turn, so it moves with prompt size.
    "realtime_31": {"label": "Gemini Live 3.1", "inrPerMin": 16.8,
                    "source": "Google Cloud bill, 6-9 Oct 2026 (Rs424 / 25.2 min)"},
    # Gemini Live 2.5 native audio: same bill, about Rs110 over 23.8 minutes.
    "realtime_25": {"label": "Gemini Live 2.5", "inrPerMin": 4.6,
                    "source": "Google Cloud bill, 6-9 Oct 2026 (Rs110 / 23.8 min)"},
    # Every other model (STT -> LLM -> TTS): gpt-4.1-mini + Sarvam STT +
    # ElevenLabs Flash provider cost, docs/REALTIME-VS-CASCADED-COST-2026-10-05.md
    # rupee table (Rs95.16/USD). Sarvam LLM turns cost ~3x gpt-4.1-mini's
    # (calls_db.model_tier comment), so this understates "Vistrow Bharat" calls.
    "pipeline": {"label": "STT + LLM + TTS pipeline", "inrPerMin": 2.7,
                 "source": "docs/REALTIME-VS-CASCADED-COST-2026-10-05.md (provider Rs/min)"},
    # Added to every call: LiveKit Cloud agent session minute beyond the
    # included 5,000 (calls_db._VOICE_TIER_MULTIPLIERS comment).
    "livekit_session": {"label": "LiveKit agent session (every call)", "inrPerMin": 0.957,
                        "source": "calls_db.py credit-floor comment (Rs0.957/min)"},
    # Added to phone calls: EnableX SIP, inbound or outbound, per the
    # commercial proposal accepted Jul 2026 (GST extra).
    "enablex_sip": {"label": "EnableX SIP (phone calls)", "inrPerMin": 0.25,
                    "source": "EnableX commercial proposal, Jul 2026 (Rs0.25/min each way)"},
}

# Admin money views use Indian calendar days, like the revenue figures.
ADMIN_TZ = "Asia/Kolkata"


def vendor_cost_per_minute(model: str | None, call_type: str | None) -> float:
    """Estimated INR vendor cost of one minute of a call (VENDOR_COST_RATES)."""
    name = (model or "").strip()
    if name.startswith("gemini-live"):
        # 3.8 Live is priced like 3.1; only the 2.5 default is cheaper.
        engine = "realtime_25" if name == "gemini-live" or "2.5" in name else "realtime_31"
    else:
        engine = "pipeline"
    rate = VENDOR_COST_RATES[engine]["inrPerMin"] + VENDOR_COST_RATES["livekit_session"]["inrPerMin"]
    if call_type == "phone":
        rate += VENDOR_COST_RATES["enablex_sip"]["inrPerMin"]
    return rate


def _admin_window(from_date: str | None, to_date: str | None, days: int | None) -> tuple:
    """(from_date, to_date, start_utc, end_utc) for inclusive IST dates; days
    (when from is not given) counts back from `to`. Raises ValueError."""
    import calls_db  # local import: see account_detail

    if days and not from_date:
        _, to_d, _ = calls_db.usage_window(to_date, to_date, ADMIN_TZ)
        from_date = (to_d - datetime.timedelta(days=max(1, int(days)) - 1)).isoformat()
    from_d, to_d, tz = calls_db.usage_window(from_date, to_date, ADMIN_TZ)
    start = calls_db._utc_text(datetime.datetime.combine(from_d, datetime.time.min, tzinfo=tz))
    end = calls_db._utc_text(datetime.datetime.combine(to_d + datetime.timedelta(days=1), datetime.time.min, tzinfo=tz))
    return from_d, to_d, start, end


def _usage_by_account(conn, start_utc: str, end_utc: str, account_id: int | None = None) -> dict[int, dict]:
    """Per account: calls/minutes/credits exactly as the tenant Usage page
    counts them (calls_db.credits_for_call, test calls excluded, test-minute
    overage added) plus estimated vendor cost over ALL minutes, tests
    included, because the vendors bill those too."""
    import calls_db  # local import: see account_detail

    query = (
        "SELECT account_id, COALESCE(call_type, 'browser') call_type, voice, model, "
        "(COALESCE(room_name, '') LIKE ? OR COALESCE(room_name, '') LIKE ?) is_test, "
        "COUNT(*) n, COALESCE(SUM(duration_seconds), 0) / 60.0 m FROM calls "
        "WHERE account_id IS NOT NULL AND started_at::timestamp >= ?::timestamp AND started_at::timestamp < ?::timestamp"
    )
    params: list = ["test-phone-%", "test-agent-%", start_utc, end_utc]
    if account_id is not None:
        query += " AND account_id = ?"
        params.append(account_id)
    query += " GROUP BY 1, 2, 3, 4, 5"
    out: dict[int, dict] = {}
    rates_by_account: dict[int, dict] = {}
    for row in conn.execute(query, params).fetchall():
        aid = row["account_id"]
        acc = out.setdefault(aid, {"calls": 0, "minutes": 0.0, "credits": 0.0, "testMinutes": 0.0, "estCostInr": 0.0})
        minutes = float(row["m"] or 0)
        acc["estCostInr"] += minutes * vendor_cost_per_minute(row["model"], row["call_type"])
        if row["is_test"]:
            acc["testMinutes"] += minutes
            continue
        if aid not in rates_by_account:
            rates_by_account[aid] = calls_db.credit_rates(aid, conn=conn)
        acc["calls"] += int(row["n"] or 0)
        acc["minutes"] += minutes
        acc["credits"] += calls_db.credits_for_call(row, rates_by_account[aid], minutes)
    for aid, acc in out.items():
        if acc["testMinutes"] > 0:  # same add-on usage_report applies
            rates = rates_by_account.get(aid) or calls_db.credit_rates(aid, conn=conn)
            acc["credits"] += calls_db._test_overage_credits(conn, aid, rates, start_utc, end_utc)
    return out


def _revenue_by_account(conn, start_utc: str, end_utc: str, account_id: int | None = None) -> dict[int, float]:
    """Net revenue per account in the window, GST excluded so it compares
    with vendor cost: invoices paid in the window (refunded later or not)
    minus refunds made in the window - the same rule as _revenue_months."""
    paid = "paid_at IS NOT NULL AND paid_at::timestamp >= ?::timestamp AND paid_at::timestamp < ?::timestamp"
    refunded = "refunded_at IS NOT NULL AND refunded_at::timestamp >= ?::timestamp AND refunded_at::timestamp < ?::timestamp"
    net = "amount_inr - COALESCE(gst_inr, 0)"
    query = (
        f"SELECT account_id, "
        f"COALESCE(SUM({net}) FILTER (WHERE status IN ('paid', 'refunded') AND {paid}), 0) captured, "
        f"COALESCE(SUM({net}) FILTER (WHERE status = 'refunded' AND {refunded}), 0) refunds "
        f"FROM invoices"
    )
    params: list = [start_utc, end_utc, start_utc, end_utc]
    if account_id is not None:
        query += " WHERE account_id = ?"
        params.append(account_id)
    query += " GROUP BY account_id"
    return {
        r["account_id"]: float(r["captured"] or 0) - float(r["refunds"] or 0)
        for r in conn.execute(query, params).fetchall()
        if float(r["captured"] or 0) or float(r["refunds"] or 0)
    }


_USAGE_FIELDS = ("calls", "minutes", "credits", "testMinutes", "revenueInr", "estCostInr", "marginInr")


def usage_cost(from_date: str | None = None, to_date: str | None = None, days: int | None = None,
               account_id: int | None = None) -> dict:
    """Usage, revenue and ESTIMATED vendor cost per account for IST dates
    (default the last 30 days). Accounts with no calls and no money in the
    window are left out."""
    from_d, to_d, start, end = _admin_window(from_date, to_date, days)
    conn = _connect()
    try:
        usage = _usage_by_account(conn, start, end, account_id)
        revenue = _revenue_by_account(conn, start, end, account_id)
        ids = sorted(set(usage) | set(revenue))
        names = {}
        if ids:
            marks = ", ".join("?" for _ in ids)
            names = {r["id"]: dict(r) for r in conn.execute(
                f"SELECT id, name, plan FROM accounts WHERE id IN ({marks})", ids).fetchall()}
    finally:
        conn.close()
    rows = []
    for aid in ids:
        u = usage.get(aid) or {"calls": 0, "minutes": 0.0, "credits": 0.0, "testMinutes": 0.0, "estCostInr": 0.0}
        rev = revenue.get(aid, 0.0)
        acct = names.get(aid) or {}
        rows.append({
            "id": aid, "name": acct.get("name") or f"Account {aid}", "plan": acct.get("plan") or "",
            "calls": u["calls"], "minutes": round(u["minutes"], 1), "credits": round(u["credits"], 1),
            "testMinutes": round(u["testMinutes"], 1), "revenueInr": round(rev, 2),
            "estCostInr": round(u["estCostInr"], 2), "marginInr": round(rev - u["estCostInr"], 2),
        })
    rows.sort(key=lambda r: r["estCostInr"], reverse=True)
    totals = {k: round(sum(r[k] for r in rows), 2) for k in _USAGE_FIELDS}
    return {
        "range": {"from": from_d.isoformat(), "to": to_d.isoformat(), "tz": ADMIN_TZ},
        "costEstimated": True,
        "rates": [{"key": k, **v} for k, v in VENDOR_COST_RATES.items()],
        "accounts": rows,
        "totals": totals,
    }


# ----------------------------------------------------------------- finance


def _revenue_months(conn, months: int) -> list[dict]:
    """Captured / top-ups / refunds / net per IST calendar month, oldest
    first, ending with the current month. Captured counts invoices paid in
    the month even if refunded later (so a refund is not counted twice);
    refunds count in the month they were made. Invoice totals, GST included."""
    ist = "(({col}::timestamp AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')"
    since = f"date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') - INTERVAL '{int(months) - 1} months'"
    paid_month = f"to_char({ist.format(col='paid_at')}, 'YYYY-MM')"
    refund_month = f"to_char({ist.format(col='refunded_at')}, 'YYYY-MM')"
    captured = {
        r["m"]: r for r in conn.execute(
            f"""SELECT {paid_month} m, COALESCE(SUM(amount_inr), 0) captured,
                       COALESCE(SUM(amount_inr) FILTER (WHERE kind = 'topup'), 0) topups
                FROM invoices WHERE status IN ('paid', 'refunded') AND paid_at IS NOT NULL
                  AND {ist.format(col='paid_at')} >= {since} GROUP BY m"""
        ).fetchall()
    }
    refunds = {
        r["m"]: float(r["refunds"] or 0) for r in conn.execute(
            f"""SELECT {refund_month} m, COALESCE(SUM(amount_inr), 0) refunds
                FROM invoices WHERE status = 'refunded' AND refunded_at IS NOT NULL
                  AND {ist.format(col='refunded_at')} >= {since} GROUP BY m"""
        ).fetchall()
    }
    now = datetime.datetime.now(datetime.timezone.utc).astimezone(_ist_zone())
    out = []
    for back in range(int(months) - 1, -1, -1):
        y, m = divmod(now.year * 12 + now.month - 1 - back, 12)
        key = f"{y:04d}-{m + 1:02d}"
        c = captured.get(key)
        cap = round(float(c["captured"] or 0), 2) if c else 0.0
        top = round(float(c["topups"] or 0), 2) if c else 0.0
        ref = round(refunds.get(key, 0.0), 2)
        out.append({"month": key, "capturedInr": cap, "topupsInr": top, "refundsInr": ref, "netInr": round(cap - ref, 2)})
    return out


def _ist_zone():
    from zoneinfo import ZoneInfo

    return ZoneInfo(ADMIN_TZ)


_INVOICE_STATUSES = ("paid", "failed", "refunded", "created")


def list_invoices(status: str = "", limit: int = 200, days: int = 0) -> list[dict]:
    """Invoices across all accounts, newest first; status one of
    _INVOICE_STATUSES or '' for all; days > 0 keeps the last N days."""
    if status and status not in _INVOICE_STATUSES:
        raise ValueError("invalid invoice status")
    where, params = [], []
    if status:
        where.append("i.status = ?")
        params.append(status)
    if days:
        where.append(f"i.created_at::timestamp >= {_UTC_NOW} - make_interval(days => ?)")
        params.append(int(days))
    conn = _connect()
    try:
        rows = conn.execute(
            f"""SELECT i.id, i.account_id, a.name account_name, i.kind, i.amount_inr, i.gst_inr, i.status,
                       i.invoice_number, i.credits, i.created_at, i.paid_at, i.refunded_at
                FROM invoices i LEFT JOIN accounts a ON a.id = i.account_id
                {'WHERE ' + ' AND '.join(where) if where else ''}
                ORDER BY i.id DESC LIMIT ?""",
            (*params, max(1, min(int(limit), 500))),
        ).fetchall()
    finally:
        conn.close()
    return [
        {
            "id": r["id"], "accountId": r["account_id"], "accountName": r["account_name"] or f"Account {r['account_id']}",
            "kind": r["kind"], "amountInr": float(r["amount_inr"] or 0), "gstInr": float(r["gst_inr"] or 0),
            "status": r["status"], "invoiceNumber": r["invoice_number"], "credits": r["credits"],
            "createdAt": _iso_z(r["created_at"]), "paidAt": _iso_z(r["paid_at"]), "refundedAt": _iso_z(r["refunded_at"]),
        }
        for r in rows
    ]


def finance_overview() -> dict:
    """Revenue by month (honest: from invoices), failed payments in the last
    30 days, and month-to-date revenue vs ESTIMATED vendor cost. MRR, plan mix
    and paying accounts stay on billing_overview."""
    conn = _connect()
    try:
        months = _revenue_months(conn, 6)
    finally:
        conn.close()
    today = datetime.datetime.now(_ist_zone()).date()
    mtd = usage_cost(today.replace(day=1).isoformat(), today.isoformat())["totals"]
    return {
        "months": months,
        "revenueMtd": months[-1],
        "failedPayments30d": list_invoices("failed", limit=100, days=30),
        "costVsRevenueMtd": {
            "from": today.replace(day=1).isoformat(), "to": today.isoformat(), "costEstimated": True,
            "revenueInr": mtd["revenueInr"], "estCostInr": mtd["estCostInr"], "marginInr": mtd["marginInr"],
            "minutes": mtd["minutes"],
        },
    }


# ----------------------------------------------------------------- low credit

# An account with a live agent is "low on credit" when what is left would
# last under LOW_CREDIT_DAYS of its own recent average use, and never less
# than LOW_CREDIT_FLOOR credits. Shared by the overview tile and the owner
# alert email so the two always agree.
LOW_CREDIT_DAYS = 3
LOW_CREDIT_FLOOR = 50
LOW_CREDIT_LOOKBACK_DAYS = 14


def low_credit_threshold(avg_daily: float) -> float:
    return max(float(LOW_CREDIT_FLOOR), LOW_CREDIT_DAYS * max(0.0, float(avg_daily or 0)))


def is_low_credit(remaining: float, avg_daily: float) -> bool:
    """Zero or less is the separate zero-balance alert, not 'low'."""
    return 0 < remaining < low_credit_threshold(avg_daily)


def low_credit_accounts(conn=None, positions: list[dict] | None = None) -> list[dict]:
    """Accounts with at least one live agent that are low on credit, with
    their average daily use over the last LOW_CREDIT_LOOKBACK_DAYS days and
    the days that leaves (None when there was no recent use). `positions`
    reuses a credit_positions() result already in hand."""
    own = conn is None
    conn = conn or _connect()
    try:
        if positions is None:
            positions = credit_positions(conn)
        positions = [p for p in positions if p["liveAgents"] > 0 and p["remaining"] > 0]
        if not positions:
            return []
        end = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
        start = end - datetime.timedelta(days=LOW_CREDIT_LOOKBACK_DAYS)
        fmt = "%Y-%m-%d %H:%M:%S"
        usage = _usage_by_account(conn, start.strftime(fmt), end.strftime(fmt))
    finally:
        if own:
            conn.close()
    out = []
    for p in positions:
        avg = (usage.get(p["accountId"]) or {}).get("credits", 0.0) / LOW_CREDIT_LOOKBACK_DAYS
        if is_low_credit(p["remaining"], avg):
            out.append({
                "accountId": p["accountId"], "name": p["name"], "liveAgents": p["liveAgents"],
                "remaining": round(p["remaining"], 1), "avgDaily": round(avg, 1),
                "daysLeft": round(p["remaining"] / avg, 1) if avg > 0 else None,
            })
    out.sort(key=lambda x: (x["daysLeft"] is None, x["daysLeft"] or 0, x["remaining"]))
    return out


# ----------------------------------------------------------------- support & audit


def audit_log(action: str = "", limit: int = 100, offset: int = 0) -> dict:
    conn = _connect()
    try:
        where, params = [], []
        if action == "impersonation":
            where.append("starts_with(action, 'impersonate')")
        elif action == "actions":
            where.append("NOT starts_with(action, 'impersonate')")
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
        started = time.perf_counter()
        db_ok = conn.execute("SELECT 1 ok").fetchone()["ok"] == 1
        db_latency_ms = round((time.perf_counter() - started) * 1000)

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
            "workers": worker_statuses(conn),
            "api": {"ok": db_ok, "dbLatencyMs": db_latency_ms},
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
