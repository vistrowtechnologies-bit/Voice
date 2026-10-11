# Super-admin dashboard audit (2026-10-11)

Two read-only audits (backend `/admin/*` + `admin_db.py`; frontend `web-demo/src/pages/admin/*`) against main `367611b`. Verified by reading code; CSS findings are by selector, not browser-checked. Line numbers are as of that commit.

## What exists today

33 admin routes behind `require_platform_owner` (token_api.py:259): overview, accounts list/detail, users, calls list/detail, analytics, billing, audit, health, vendor credits, outbound trunk, privacy requests, support inbox; mutations for credits, plan, status, notes, reset password, impersonate/exit, trunk, backup, vendor credits, privacy status, support. 13 admin pages plus `AdminLayout`/`AdminUI`. The surface is broad but it is a **reporting console, not an operations console**: nothing polls except Health, nothing alerts the owner, and several numbers are estimates.

## The 9 operator questions (can the owner answer in 10 s?)

| Question | Today | Missing |
|---|---|---|
| Accounts about to run out of credits | Partial (≥80 % list) | days-left at current burn, top-up balance |
| Who signed up today and did they call | No | calls / first-call on recent signups; `created=today` filter |
| Calls that failed in the last hour and why | No | `failure_reason` column, `outcome=failed`, `hours=1` filter, absolute times |
| Earned this month vs provider cost | No | real revenue from `invoices`; provider cost needs per-call cost logging |
| Integrations failing per tenant | No | cross-tenant `integration_deliveries`/`last_error` view |
| Both LiveKit workers healthy | No | worker heartbeats; Health's "Backend online" tile is hard-coded |
| Accounts on trial + end date | No | `trial_started_at` surfaced; `plan=trial` filter |
| Cancellation pending | No | `subscriptions.cancel_at_period_end` surfaced |
| Open support tickets | Yes (Support page) | count badge on nav/overview |

## Findings

### Security / correctness (backend)
1. **Impersonation ("View as") is attributed to the tenant, not the admin.** Every write during View-as is recorded as the tenant owner; only one `impersonate` audit row exists. Nothing blocks destructive actions during View-as (delete agents/KBs/recordings/numbers/members, checkout, minting API keys which returns the raw key). The support cookie is minted with `session_version=1` and no `sid`: it 401s for any tenant who ever used "sign out other devices", is invisible in the tenant's device list, and lives 30 days. Exit is unaudited. (token_api.py:185-265, 2682-2710)
2. **"MRR" is fiction**: `accounts.plan` defaults to `starter` and signup never changes it, so every free signup counts ₹2,999 (admin_db.py:148, 259, 645, 678). Revenue views never read `invoices`/`subscriptions`.
3. `reason` is optional on credits/plan/status; `db-backup/run`, support notes and impersonate exit write no audit row.
4. `call_detail` is `SELECT c.*`: returns `recording_key` and the public `recording_share_token` to the admin UI (admin_db.py:563).
5. No rate limits, no MFA/step-up, 30-day owner session; reset-password returns the takeover link in the response (audited).
6. `GET /admin/vendor-credits` writes to the DB on every GET (ElevenLabs live check).
7. The owner receives **no operational alerts**: `notification_worker` is customer-only; backup and unmatched-Razorpay errors only land in System Health.

### UX / correctness (frontend)
8. **Global CSS repaint**: `index.css:184-197` turns any `border-border`/`border-cyan` button without its own `bg-` class into a solid purple gradient. Admin controls hit by selector: inactive `FilterChip` (so inactive chips look filled and active ones faint on Accounts, Calls, Audit, Support, Privacy), `ActionBtn` (Adjust credits / Change plan / Reset password look identical to View as), both modal Cancel buttons, preset pills, "Open account", "Manage in Agents", Vendor "Edit", mobile menu.
9. Health: "Backend online" is hard-coded `ok={true}`; one transient fetch error sticks forever while polling continues; polls while hidden.
10. Lists cap at 100/200 with no pagination or sort; MiniStats sum only loaded rows. Fetch errors render as "No results". `apost` drops backend error bodies, so `ReasonModal` always says "Something went wrong". `impersonate` has no catch.
11. Calls list has no failure column/filter; call detail never renders the typed `diagnostic_events`.
12. Billing page banner says "connect a payment processor" (stale); pricing/credit rates hard-coded in `adminApi.ts` (drift risk).
13. `text-danger` token doesn't exist (`AdminSettings.tsx:139`); trunk sync mutates production LiveKit with no confirm; privacy note via `window.prompt`; Vendor Credits grid squashes at 375 px; row-click tables are keyboard-unreachable; modals lack `role="dialog"`/focus trap/Esc.
14. `AdminUI` duplicates `components/ui/*`; admin nav duplicates `navGroups.ts`; two backend endpoints have no UI (db-backup; invoice PDF, now wired by #30).

## Recommendations

### P0 — before launch (≈3 days)
- **Impersonation hardening**: mint the support cookie with the tenant's real `session_version` and a `user_sessions` row flagged `provider='support'`; block state-changing requests during View-as for `/api-keys`, `/billing/*`, `DELETE *`, `/team/members`, `/profile/*`, `/calls/*/recording`; audit every non-GET during View-as with actor = admin; audit exit.
- **Mandatory reason** on credits/plan/status; audit backup runs and support notes.
- **Honest money**: "paying" = active subscription or a paid invoice; MRR from `subscriptions`; revenue from `invoices` (paid, top-ups, refunds).
- **Operator alert worker** emailing the owner on: error-level `error_events`, failed invoices, zero-balance account with a live agent, backup failure, >N call failures in an hour.
- **Strip** `recording_key`/`recording_share_token` from admin call detail.
- **Frontend P0s**: fix the CSS repaint on admin controls (`bg-transparent`/`bg-surface`); real Health (remove fake tile, add `workers[]` heartbeats for both LiveKit agents, trunk reachability, recover from transient errors, pause when hidden); calls triage (failure column, `outcome=failed`, `hours`, account filter, absolute time); real error states and backend error messages; `text-danger` → `text-destructive`; confirm + reason on trunk sync.

### P1 — first month (≈6 days)
- `GET /admin/usage?days&group=account|channel|agent` reusing the tenant usage logic; per-account usage over time.
- `GET /admin/finance?month`: Razorpay captured, top-ups, refunds, cancellations with reason, trials ending; invoice list wired to the PDF endpoint; drop the stale banner.
- `GET /admin/live-calls` and `GET /admin/issues` (call failures, recording failures, integration delivery failures, integration `last_error`) across tenants.
- Per-call cost columns written by the agent at call end (LLM tokens incl. cached, TTS chars, STT seconds, est. ₹) → margin per account. Needs both workers deployed.
- Worker heartbeat (`settings` key per worker every 60 s) + Railway health on the Health page.
- Owner MFA or step-up for impersonate / reset / credits / plan; 12 h owner sessions.
- Accounts list: server-side pagination (offset already accepted), sortable columns, `plan=trial`, `subscription=cancelling`, `created=today`, trial-end / renewal / top-up columns, search in URL; migrate to `ui/DataTable`.
- Operations overview home (below); support count badge; keyboard/a11y pass.

### P2 — later
Phone-number inventory + trunk health page; admin-initiated refunds; per-account feature flags (`settings.feature.*` read in entitlements); abuse view (rejected disposable signups, DNC/calling-window blocks, security events); storage bytes per account; rate-limit admin writes; replace `AdminUI` with `components/ui/*` and move admin nav into `navGroups.ts`; cross-tenant integrations view; audit log pagination/filters; diagnostic-events timeline on call detail; pricing from the API; themed prompt for privacy notes; en-IN formatting everywhere; DB-backup button.

## Proposed navigation and Operations overview
- **Operations**: Overview · Live calls & failures · System health · Support inbox
- **Customers**: Accounts · Users · Trials & renewals · Privacy requests
- **Money**: Finance (revenue vs cost) · Invoices & top-ups · Vendor credits
- **Insight**: Analytics · Audit log
- **Platform**: Settings (trunk, demo agent, backups) · Pricing reference

Overview home: an alert strip (worker down, vendor balance low, failed calls 1 h, overdue tickets, trunk unconfigured); live tiles polled every 15 s (live calls, failed 1 h / 24 h, workers n/2, DB/API latency); daily tiles (signups today with "made a call", trials ending ≤7 d, cancellations pending, credits-low, open/awaiting tickets); month tiles (revenue MTD, provider cost MTD, margin, contracted MRR); lists (recent failures, today's signups, integrations failing, overdue tickets). Endpoints: extend `/admin/overview` and `/admin/health`, add `/admin/finance`, `/admin/integrations?status=failing`, `/admin/support/summary`; add trial, subscription and top-up fields to the account row/detail.

## Critical files
`server/token_api.py` (259, 170-253, 2395-2710, 3905-4100), `server/admin_db.py` (126, 225, 271, 367, 522, 559, 594, 672, 790-937), `server/auth.py` (55, 91-134), `server/calls_db.py` (schemas 55-900, 1140-1226, 2083, 3725, 8570, 8860), `server/notification_worker.py`, `web-demo/src/components/AdminUI.tsx`, `AdminLayout.tsx`, `DashboardLayout.tsx` (529-548), `web-demo/src/lib/adminApi.ts`, `web-demo/src/pages/admin/*`, `web-demo/src/index.css` (184-197).
