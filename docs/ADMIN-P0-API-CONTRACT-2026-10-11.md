# Admin P0: API contract between the backend and frontend branches (2026-10-11)

Both branches build against this. Field names are exact (camelCase in JSON). Anything not listed keeps its current shape.

## GET /admin/health (extended)
Existing fields stay. Remove nothing the UI reads today. Add:
```json
{
  "workers": [
    {"name": "tenant", "agentId": "CA_TGdpVhSdxDyS", "lastSeenAt": "2026-10-11 13:20:05", "ageSeconds": 41, "status": "ok|stale|unknown", "version": "diFo98U8pV2u|null", "host": "string|null"},
    {"name": "platform-demo", "agentId": "CA_53d8HgBktjZ7", "...": "..."}
  ],
  "api": {"ok": true, "dbLatencyMs": 12}
}
```
- `status`: `ok` if ageSeconds ≤ 180, `stale` if older, `unknown` if never seen. Both expected workers are always listed (from a constant), even if never seen.
- Heartbeat source: the agent writes `settings(account_id=0, key='worker_heartbeat.<name>', value=<json {seenAt, version, host}>)` every 60 s (name = `platform-demo` when `LIVEKIT_AGENT_NAME` is set, else `tenant`). If `account_id=0` breaks a FK, use whatever platform-level settings convention already exists (e.g. account 1 / NULL) and document it.

## GET /admin/overview (extended)
Existing fields stay, but `mrr` / `paying` become honest (see below). Add:
```json
{
  "ops": {
    "failedCalls1h": 0, "failedCalls24h": 3,
    "trialsEnding7d": 2, "cancellationsPending": 0,
    "openTickets": 4, "awaitingUs": 2,
    "creditsLowAccounts": 5, "zeroBalanceLiveAccounts": 1,
    "integrationFailures24h": 2,
    "workersHealthy": 2, "workersExpected": 2
  },
  "revenueMtd": {"capturedInr": 0, "topupsInr": 0, "refundsInr": 0, "netInr": 0},
  "recentSignups": [{"...existing fields...": "", "calls": 0, "firstCallAt": "string|null"}]
}
```

## Honest money (admin_db)
- "Paying" = account has an active subscription (`subscriptions.status='active'`) or a paid invoice in the last 35 days. MRR = sum of plan monthly price for accounts with an active subscription only. Everything else is free/trial and never counted.
- `revenueMtd` from `invoices` (status paid, paid_at this calendar month IST; refunds = refunded this month).
- Apply the same definition in `/admin/accounts` (`mrr` column), `/admin/analytics` funnel "paying", and `/admin/billing`.

## GET /admin/calls (extended filters + fields)
- New query params: `outcome=failed|ok` (failed = `failure_reason` non-empty OR `disconnect_reason` in an error set the backend defines), `hours=<int>` (1..720, overrides `days`), `account_id` (already accepted).
- Each row gains `failureReason: string|null`, `disconnectReason: string|null`, `startedAtIso: string` (UTC ISO with Z).

## Admin call detail
- `GET /admin/calls/{id}` stops returning `recording_key` and `recording_share_token` (and any other bearer/secret columns). Keep `hasRecording: bool`.

## Mutations
- `POST /admin/accounts/{id}/credits|plan|status`: `reason` required, trimmed length ≥ 5 → else 400 `{"detail": "A reason is required (at least 5 characters)."}`.
- `POST /admin/outbound-trunk`: accepts optional `reason`; audited (already) with the reason. The UI will confirm before calling.
- Audit rows added for: `impersonate/exit`, `db-backup/run`, support private notes.
- All admin error responses keep FastAPI's `{"detail": "..."}` shape (the frontend will surface `detail`).

## Impersonation ("View as")
- The support cookie is minted with the tenant owner's real current `session_version` and a `user_sessions` row (provider/label marking it as a support session) so it works for owners who used "sign out other devices" and shows up/revocable; TTL 2 hours.
- While impersonating, these are refused with 403 `{"detail": "Not allowed while viewing as a customer."}`: any `DELETE` request; `POST/PUT/PATCH` to `/api-keys*`, `/billing/*`, `/team/*`, `/profile/*`, `/auth/*` (except logout), `/calls/*/recording*`, `/telephony/numbers*`, `/integrations/*/disconnect`, account deletion/privacy routes. GETs are allowed.
- Every non-GET that IS allowed during impersonation writes an `admin_audit_log` row (actor = the impersonating admin, target account, method + path, status code).
- `GET /auth/me` while impersonating includes `impersonating: {adminEmail, startedAt, expiresAt}` (the banner can show the expiry).

## Operator alerts (new worker)
`server/ops_alert_worker.py`, started like `notification_worker` (same daemon pattern, same process), emails `OPS_ALERT_EMAIL` (fallback: platform owner's email) via `email_sender` at most once per alert key per 6 h (dedupe in `settings`), for: new `error_events` with level `error` (batched: one email listing up to 20, every 10 min); `invoices` turning `failed`; account with ≥1 live agent and zero credits; backup failure; ≥ 5 failed calls across the platform in the last hour; a worker heartbeat stale > 5 min. No alerts in `APP_ENV=staging` unless `OPS_ALERT_EMAIL` is set.
