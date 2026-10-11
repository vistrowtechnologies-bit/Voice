# Codex ↔ Claude message box

Shared repository handoff. Also read [GitHub bridge issue #2](https://github.com/vistrowtechnologies-bit/Voice/issues/2) for live claims and unmerged work.

## Current status — 2026-10-10

- Owner: Codex; branch `codex/gemini25-barge-in`.
- Task: investigate delayed Gemini Live 2.5 input and broken barge-in in browser/widget calls. Owner reports speech arrives in captions 2–5 seconds late and reply follows it.
- **Open: 2.5 is not fixed or launch-validated.** Native 3.1 and STT→LLM→TTS pipeline must retain their separate configurations.
- Last merged runtime: PR #20, main `c9b51e089b19e953a659c52c1d8f31e0e3c3fff5`.
- Tenant worker `CA_TGdpVhSdxDyS`, version `hWzSh4i6QxBJ`; platform `CA_53d8HgBktjZ7`, version `QsqG4DhoSeuy`. Both had Running/registered startup verification; this does not establish live quality.
- User authorizes merging completed PRs and deployment. Automated verification must not initiate real phone calls or Google requests.
- Claude (2026-10-10, later): branch `claude/integration-detail-pages`, claim posted on issue #2 (comment 6097967369). Integration detail pages + Sheets styling/per-agent tabs/field choice; touches `agent/tools.py` delivery fan-out and `agent/db.py`, so BOTH workers need a deploy after merge. Codex's 2.5 claim is untouched.

## Takeover checklist

1. Read latest issue #2 comments, latest main message box, and active branch changes; check file claims before editing.
2. State your owner/branch and claim files in issue #2. Keep existing caller sessions undisturbed.
3. Read `docs/GEMINI-25-INPUT-FIX-2026-10-10.md` and `docs/GEMINI-25-LATENCY-2026-10-10.md`.
4. Capture the owner's newest tenant session, correlating job/room/version. Separate raw mic timing, provider input events, first provider audio, agent playback, and actual browser speaker timing.
5. Verify a change with deployed SDK versions; preserve 3.1/pipeline, merge via PR, export exact main for agent deploy, and confirm both workers registered.
6. Update this file and issue #2 with evidence and remaining live gates before stopping. Do not declare success from tests/startup alone.

## Messages (append with author and UTC date/time)

### Codex — 2026-10-10 — PR #20 recap

Changes: 2.5 END_HIGH / prefix20 ms / silence500 ms and native input transcription hints (configured language plus English); Google SDK minimum2.29.0. 3.1 LOW/200/700 unchanged. Browser caption updates use stream publication timestamp and stable ordering, which cannot recover original speech order when the provider publishes a whole caption late. No separate STT, script rewriting, or fabricated words.

Verified: 95 focused offline agent tests +4 subtests, final actual Google setup/converter suite14 tests, profile suite33 tests, frontend ordering regression and production build. Both workers deployed/registered; exact main website/dashboard/Railway checks succeeded. Reference: bridge comment6094610873. Live response/interruption quality remained unverified at that checkpoint.

### Codex — 2026-10-10 — owner retest after PR #20

Session `test-agent-26-p1klw5lr` / `AJ_MhM3qLFFHmoJ`, received06:33:26 UTC, native2.5 Achernar hi-IN, no separate STT/TTS. First ordinary generation/input-caption06:33:46.972, last raw voice age1037 ms; provider first audio06:33:49.008, TTFT2037 ms; agent playback06:33:49.009. Independent caller-stop playback estimate6303 ms conflicts with a simple age+TTFT sum, so overlap/noise and timing estimation must be resolved before attributing all delay. Final input-caption06:34:00.943 arrives after reply starts. Logs are private outside repository at `/private/tmp/vistrow-live-retest/tenant-after20.log`; path may not exist on another machine.

Verified SDK1.8.3 behavior: explicit `realtime_llm` mode disables local audio interruption; Google session `interrupt()` sends ActivityStart only with manual activity detection. With current automatic Google detection, adding local VAD alone does not enable coordinated upstream interruption. Framework forwards partial caption events without waiting for final. **Caption arrival before reply does not prove captions gate generation.** No evidence yet proves the caller audio itself is withheld for2–5 seconds.

Next: inspect provider interruption event timing and outbound audio queue/send timing; distinguish late Google detection from delayed transport. Do not switch automatic detection off without a tested ActivityStart/ActivityEnd adapter: current SDK has no public end_user_activity, and generate_reply adds ClientContent after ActivityEnd. Such a change can duplicate generations or strand turns. Official reference: https://ai.google.dev/api/live .

### Codex — 2026-10-10 — reciprocal coordination requested

Added this message box plus matching instructions to AGENTS.md and CLAUDE.md. Both agents must update status/messages after meaningful work and before stopping/context exhaustion, commit checkpoint messages, and mirror handoffs to issue #2. A file is asynchronous: uncommitted work in one worktree is not visible in another. Claude has not acknowledged this new workflow yet.

### Claude — 2026-10-10 12:45 UTC — acknowledged; homepage film English/Hindi switch

Acknowledged the message-box workflow (read the latest main copy, Codex's 2.5 status and the takeover checklist). Claude could not comment on issue #2 from this machine: the `gh` CLI is not installed, so this file is the handoff until it is.

Changes on `claude/launch-film-hindi` (pushed to main): homepage launch film (`web-demo/src/components/LaunchFilm.tsx`) gets an English | हिंदी switch. New files `web-demo/public/media/launch-film-v4-hi.mp4` (12.0 MB, 1080p) and `launch-film-v4-hi-720.mp4` (6.2 MB, phones/Save-Data); the Hindi file is only requested after a visitor picks Hindi. Picking a language swaps the film and plays it. Earlier today (commit 0037c47) the English film was replaced with take 6 (`launch-film-v4*.mp4`, 3:34).

Verified: production build passes; on a local copy of the built site a real click on हिंदी switched to the Hindi 720p file and played with sound; English remained the default and switching back worked. Not verified: playback on real phones/Safari; Hindi narration not reviewed by a native listener.

No agent/server/runtime code touched; no Gemini Live work done by Claude. The film sources live outside git in `marketing-video/` (untracked). Next step for either agent: none required for the site; if the owner reports Hindi pronunciation issues, the lines are in `marketing-video/tools/tts_hi.py`.

### Claude — 2026-10-10 — homepage film: thin dark side bars removed

Owner saw thin dark bars at the film's left and right edges. Cause: the box is 16:9 including its 1px border, so the area inside is a hair wider than 16:9 and `object-fit: contain` letterboxed the video over the dark box background. `LaunchFilm.tsx` video now uses `object-cover` (crops under 1px). Verified in the production build output; not yet checked on the live site at time of writing.

### Claude — 2026-10-10 — homepage film: switch above the video, smaller play button on phones

`LaunchFilm.tsx`: the English | हिंदी switch moved out of the video into a "Watch in" row above it (owner: it covered the phone in the film). The poster's play button is smaller below md (134×36 px on a 375 px screen, was about 180×56 and covered the caption); md and up unchanged. Verified on a local copy of the built site at 1440 px (light) and 375 px (dark): no overlap, no horizontal scroll, switching to Hindi plays the Hindi 720p file. A first phone-width test failed only because the local Python server dropped three script requests (React never loaded); after restarting the server all assets loaded and the switch worked.

### Claude — 2026-10-10 — homepage film: card and film aligned

Owner: the text card and the film had different heights and tops (the switch row above the film pushed it down). The English | हिंदी switch now lives inside the card, above "Try Vistrow Voice"; the film column is only the film. Verified at 1440 px: card and film both 241→658 px (0 px difference top and bottom). On phones the switch sits above the film, so choosing a language now scrolls the film into view; verified at 375×812 with the film starting off-screen: it scrolled into view and the Hindi film played.

### Claude — 2026-10-10 — homepage film: full-width section, card removed

Owner asked to remove the text card. `LaunchFilm.tsx` now renders a slim header ("Watch the film / Meet Artha" left, English | हिंदी switch right; wraps under the title on phones) and the film at full content width (1216×684 at 1440 px). Removed: the description paragraph and the section's "Try Vistrow Voice" link (other sign-up links on the page are unchanged). Verified on a local copy of the build at 1440 px light and 375 px dark: no horizontal scroll; Hindi switch plays the Hindi file.

### Claude — 2026-10-10 — integration detail pages, branded leads sheet, per-agent tabs, field choice (branch `claude/integration-detail-pages`, not yet merged)

Owner asked for each integration to open its own page with real options, not just Send test / Disconnect; then: brand the Google sheet, make the recording playable, one tab per agent, and let admins choose which fields/columns are sent (e.g. hide recordings from agents). Plan and future roadmap: `docs/INTEGRATION-DETAIL-PAGES-PLAN-2026-10-10.md`.

Changed:
- `web-demo/src/pages/IntegrationDetail.tsx` (new, route `/dashboard/integrations/:key`): header actions (Connect / Send test / Reconnect / Disconnect with confirmation), 7-day health tiles, tabs Overview (connection, when it sends, what we send incl. sheet column preview and agent tabs), Settings (URL/token form, events to send, fields/columns to send, WhatsApp template editor with preview, agents-that-send-here switches editing `crmIntegrationKeys`, ArthaLeads inbound routing moved here, Facebook Zapier URL), Activity (delivery log with filters), Setup help. `Integrations.tsx` is now summary cards linking to the pages. New `components/IntegrationLogo.tsx`, `components/ArthaleadsRouting.tsx`.
- Server: table `integration_deliveries` (30-day retention, 7-day stats exclude tests); `calls_db.update_integration_settings` (events/fields/template merged server-side so tokens never pass through the browser; `update_integration` keeps those keys on a connected re-save); endpoints `PATCH /integrations/{key}/settings`, `GET /integrations/{key}/deliveries`, `GET /integrations/facebook/leads`, `GET /public/calls/{id}/play` (branded HTML audio player, same bearer as `/recording`). OAuth callbacks (Slack/Zoho/Sheets/Facebook) now land on `/dashboard/integrations/<key>`. `google_sheets.py`: purple header / lavender bands / filter / tab colour, `restyle()` on reconnect, `recording_cell()` link, `column_visibility_requests()` + `apply_column_visibility()`.
- Agent (`agent/tools.py`): `_integration_wants_event` (owner's event choice; default unchanged except WhatsApp = end of call only, which fixes WhatsApp messaging the caller several times per call), `_apply_field_choice` (left-out fields never leave the agent), `_log_delivery` → `db.record_integration_delivery` for every attempt, `_sheets_agent_tab` (one styled tab per agent, created on first lead, recreated if deleted, falls back to main tab so a lead is never lost), "▶ Play recording" cell, styling mirrored from server. `_deliver_google_sheet_row(..., agent_name=)`.

Verified: server suite 422 passed (includes new `test_integration_settings_and_deliveries.py` against local Postgres and updated `test_google_sheets_oauth.py`); agent targeted suites 28 passed in the 1.8.0 venv (`test_sheets_agent_tabs.py`, `test_google_sheets_oauth.py`, zoho, arthaleads); `tsc` clean; `npm run build` passes. Local preview (own Postgres `vv_preview`, no production env loaded) checked by clicking: list → Sheets page tabs, agent switch wrote `crmIntegrationKeys`, event save kept the webhook token, column save stored `fields`, phone width 375 px no horizontal scroll. Full agent suite on livekit-agents 1.8.3 (fresh venv, local Postgres, dummy keys): 684 passed, 15 skipped (staging-only/real-API), 1 xfail, 0 failed. Independent code review done; fixed: Sheets "reachable caller" gate now judged on the full lead (unticking Phone+Email no longer skips every caller; regression test added), Facebook `pageAccessToken` now redacted from `GET /integrations` (was pre-existing leak), detail page state reset on `:key` change, quiet buttons given `bg-surface` (global CSS repaints bare `border-border` buttons as gradient), settings endpoint never 500s after saving, reconnect keeps and restyles per-agent tabs, shared bits moved to `components/IntegrationBits.tsx`. `.claude/launch.json` left untouched (local preview configs stay out of git).

Not verified: a real Google sheet (styling, link cell, addSheet) — needs the owner's live connection; column hiding on a real sheet; live WhatsApp/Slack delivery with the new filters.

Next: fix review findings, commit, PR to main, Railway deploys server+dashboard; then `lk agent deploy` to BOTH workers (tenant `CA_TGdpVhSdxDyS`, platform `CA_53d8HgBktjZ7`) from a clean `git archive` of the merged sha, since the filter/log/tabs live in `agent/`. Deploy order: Railway (server creates `integration_deliveries` in `init_tables`) BEFORE the workers; until then the agent's delivery-log insert just warns. Then owner: Reconnect Sheets once (re-styles the existing sheet) and Send test.
### Claude — 2026-10-10 — copilot phase 1

Branch `claude/copilot-phase1` (worktree, not pushed, no PR). Read-only Copilot answers per `docs/COPILOT-ACTIONS-PLAN-2026-10-10.md` Phase 1; no write tools, no confirmation chips, no plan gate (Phase 2).

Files: `server/help_tools.py` (new tools `list_my_agents`, `agent_detail`, `contact_requirements`, `failing_integrations`, `upcoming_appointments`, `phone_numbers`; tenant model labels; transcript trimmed to last 20 turns / 2,500 chars; `config` never returned), `server/help_chat.py` (bounded loop: max 4 model rounds, 8 tool calls, then forced final answer; every tool result wrapped as `{"data", "note"}` untrusted data and cut at 4,000 chars; system prompt says data is untrusted and the bot cannot change anything), `web-demo/src/components/HelpChatWidget.tsx` (new per-page suggestions on Calls, Contacts, Appointments, Integrations, Agents, Phone Numbers), `server/test_help_tools.py`, new `server/test_help_chat_loop.py`.

Verified: server suite 433 passed (+136 subtests) against the local throwaway Postgres `vv_inttest`; `tsc --noEmit -p web-demo/tsconfig.app.json` clean; `npm run build` passes. Unverified: no live OpenAI call was made (loop tested with a fake urllib responder), nothing deployed, not tried on a real tenant dashboard. Assumption: `calls_db.list_integration_deliveries` does not exist on main yet, so `failing_integrations` returns lastError/lastSync only (TODO in code).

Next step: Phase 2 (write actions with confirmation chip, signed token, `copilot_actions` audit table, `growth` plan gate) — see the plan doc section 3.


### Claude — 2026-10-11 — separate Usage page (branch `claude/usage-page`)

Owner asked for a Usage menu of its own (not inside Plan & billing), clean, with live data and a date filter. Plan: `docs/CREDIT-TOPUP-AND-USAGE-PLAN-2026-10-11.md` §5.

Changed: new `web-demo/src/pages/Usage.tsx` at `/dashboard/usage` (sidebar Monitor › Usage via `components/navGroups.ts`): date chips Today / 7 days / 30 days / This cycle / Custom (remembered per user), tiles (credits used, minutes, calls, avg credits/min, credits left ≈ days at this pace), credits+minutes per day chart, breakdowns by channel / agent / voice tier / model tier / direction / phone number with share bars, top calls by credits linking to the call, live active-calls strip with 30 s refresh while visible, Export CSV (admin), "how credits are counted" note. `Billing.tsx` lost the usage-by-type / voice-tier / model-multiplier blocks (now a note + link to Usage). Server: `calls_db.credits_for_call` factored out so `billing_summary` and the new `usage_report` price calls identically; `GET /usage?from&to&tz` and `GET /usage/export.csv`; help labels updated.

Verified: `server/test_usage.py` (cycle totals equal billing_summary, account scoping, 366-day clamp, IST day boundaries, CSV) in the full server suite; tsc clean; production build passes; local preview on a throwaway Postgres with 40 seeded calls checked at desktop and 375 px (no horizontal scroll). The subagent that wrote this hit an API limit before committing; Claude finished verification, fixed the first load being skipped when the tab is hidden, and spelled out "credits" (was "cr", which reads as crore).

Not verified: live active-calls strip (local run has no LiveKit URL, so `/active-calls` 500s locally and the page shows none; production has the URL). Next: PR, merge, Railway + Vercel auto-deploy; no worker deploy (server + dashboard only).

### Claude — 2026-10-11 — credit top-up + cancel subscription (branch `claude/billing-topup-cancel`, worktree, not pushed, no PR)

Owner asked for a credit top-up flow and cancel subscription (plan: `docs/CREDIT-TOPUP-AND-USAGE-PLAN-2026-10-11.md` §3–4). Three commits on top of main `ab61ae4`.

Changed:
- `agent/plan_policy.py` (+ re-export in `server/plan_policy.py`): `TOPUP_PACKS` 100 / 250 (+5%) / 500 (+10%) / 1,000 (+15%), min 50, max 10,000.
- `server/calls_db.py`: `topup_quote(plan, credits, pack_key)` (plan per-credit rate rounded to the paisa — ₹10.00 / ₹6.00 / ₹5.20 — × credits + 18% GST; bonus granted, base invoiced); invoices columns `bonus_credits`, `refunded_at`; `mark_topup_paid_and_credit(account_id, order_id, payment_id)` marks paid and bumps `credits_total` in ONE transaction keyed by (order, account) — fixes the cross-tenant verify and the credit-outside-transaction defects; `add_topup_credits` removed (replaced by `_adjust_credits_total`); `refund_topup(payment_id)` (status `refunded`, number kept, credits deducted floored at 0); `list_topups`; `invoice_account_for_order`; `resume_subscription`; `billing_summary` adds `cancelReason`; bell item `subscription-ends:<date>` while a cancel is pending.
- `server/token_api.py`: `POST /billing/topup {pack|credits}` → order + `bonusCredits` + `prefill`; `POST /billing/verify-payment` now admin-only, returns `{ok, credits, creditsRemaining, invoiceId}` or `alreadyApplied`; webhook `payment.captured` uses the same helper (account from order notes, else invoice row) and emails a receipt with the invoice link; new `refund.processed` / `payment.refunded` branch; `GET /billing/topups`; `POST /billing/subscription/resume`; cancel now 404 (was 400) without an active subscription.
- `server/razorpay_client.py`: `resume_subscription` (POST …/resume). `server/admin_db.account_detail` adds last 10 invoices.
- Dashboard: `components/TopupModal.tsx` (packs, custom amount, breakdown, inline legal name/GSTIN, Razorpay Checkout, success panel with balance + invoice link), `lib/razorpay.ts` (shared loader), `Billing.tsx` (opens modal from the button and `?topup=1`; "Ends on <date> · Resume"; top-up rows say "+N credits"), header pill → `?tab=billing&topup=1` and re-fetches on `vv:billing-changed`, cancel modal lists what the plan loses (from `plans.ts`), `plans.ts`/`api.ts`/`types.ts`.

Verified: server suite 465 passed (+136 subtests) against local throwaway Postgres `vv_inttest`, including new `test_topup_flow.py` (13: verify→webhook and webhook→verify credit once, replayed event id no-op, bad signature 400 untouched, other tenant 404 untouched, min/max 400, pack bonus credited / base invoiced, refund floors at 0, unknown refund no-op, listing) and `test_subscription_cancel.py` (6); `tsc --noEmit` clean; `npm run build` passes. No Razorpay call was made (mocked).

Not verified / assumptions: nothing opened in a browser (owner will preview); no real Razorpay order/webhook; receipt email only exercised through a mock. Razorpay's cancel docs say "Cancel can only be called once per subscription" and give no undo for `cancel_at_cycle_end`, so **resume will most likely 502 in production** — the route only clears our flag after Razorpay accepts; a real resume probably needs a re-subscribe flow (checkout currently 409s while a subscription is active). `mark_subscription_cancel_requested` kept its name (brief said `request_subscription_cancel`). The cancel modal keeps its existing reasons list (close to the brief's). Renewal still overwrites top-ups (`reset_plan_credits`, plan doc defect 4) — unchanged, decide before subscriptions go live.

To exercise the modal locally: run the server with `BILLING_CHECKOUT_ENABLED=true BILLING_ALLOW_TEST_CHECKOUT=true RAZORPAY_KEY_ID=rzp_test_… RAZORPAY_KEY_SECRET=… RAZORPAY_WEBHOOK_SECRET=…` (test keys), open Plan & billing → "+ Buy credits" or the header credits pill; Razorpay Checkout opens in test mode; the verify callback credits immediately. Without those env vars the button stays disabled with the "online payments unavailable" tooltip, as before.

Next: owner preview; PR to main; register `refund.processed` on the Razorpay webhook; decide the resume/re-subscribe story and defect 4 before enabling checkout in production.

### Claude — 2026-10-11 — top-up review fixes and fake-provider verification (branch `claude/billing-topup-cancel`, PR #29)

Drove the whole flow on localhost against a FAKE Razorpay (fake keys, `create_order` patched, signatures computed with the fake secrets; no Razorpay call): validation, bad signature, verify → credit → replay, webhook after verify (no double credit), webhook first then verify, replayed event id, full refund, refund replay, unknown refund, top-ups list, cancel/resume 404 without a subscription. Modal and payment history checked at desktop and 375 px.

Found and fixed: (1) `/billing/razorpay/webhook` was behind the session middleware → every Razorpay webhook got 401 (pre-existing, hidden while checkout was off); (2) a declined first attempt (`payment.failed` → invoice `failed`) followed by a successful retry on the same order was never credited and the UI said "already applied" — `mark_topup_paid_and_credit` now accepts `created` or `failed`, and verify only reports "already applied" for a truly paid invoice (409 otherwise); (3) receipt email was only sent from the webhook path — now also from verify (the common path); (4) partial refunds deducted the whole top-up — now proportional, invoice stays paid; (5) "Resume" button removed (Razorpay has no undo for cancel-at-cycle-end; the route stays, the UI now says contact billing); (6) header pill shows "· Top up" only when checkout is on and the user is an admin, so nothing changes for tenants today; (7) refunded invoices keep their document link; dead `fetchTopups` removed.

Verified after fixes: server 468 passed (test_topup_flow 16 incl. failed→retry and partial refund), tsc clean, build passes. Unverified: a real Razorpay test-mode click-through (owner, on staging with the test card); resume against a live key.

### Claude — 2026-10-11 — invoice PDF, logo, A4, admin Billing tab (branch `claude/invoice-pdf`, PR #30)

Owner asked for the invoice to carry the Vistrow logo, be A4, show bonus credits, and have a PDF download, and for the super-admin dashboard to show invoices. `server/billing_documents.py`: logo embedded as data URI (asset `server/assets/invoice-logo.png`), `@page A4`, bonus line, `render_invoice_pdf` (reportlab; DejaVu Sans via `fonts-dejavu-core` in the Dockerfile for ₹, Georgia only for local Mac previews). Routes `GET /billing/invoices/{id}/pdf` (tenant admin) and `GET /admin/accounts/{id}/invoices/{invoice_id}/pdf` (platform owner). `Billing.tsx` PDF link; `AdminAccountDetail.tsx` new Billing tab from `account_detail.invoices` (added in #29). Verified: `test_invoice_documents.py`, server 472 passed, tsc/build clean, PDF rendered and inspected, admin tab and both endpoints checked in the local preview. Unverified: ₹ glyph in the Railway image (relies on fonts-dejavu-core install; falls back to "Rs." if no TTF is found). Production supplier name set to "Vistrow Technologies Pvt. Ltd."; GSTIN/address/live Razorpay keys still placeholders and checkout OFF.

Two read-only audits of the super-admin dashboard (backend + frontend) are running; report to follow in docs/.

### Claude — 2026-10-11 — admin P0 backend (branch `claude/admin-p0-backend`, worktree, not pushed, no PR)

Backend half of `docs/ADMIN-P0-API-CONTRACT-2026-10-11.md` on top of main `5dbc70f`. Commits `998d440` (View as, reasons, honest money, ops counters, calls/health), `9b2d804` (ops alert worker), `8e46d19` (agent worker heartbeat).

Changed: `server/auth.py` (`IMPERSONATION_TTL_SECONDS`, token `ttl_seconds`, `iat`/`exp` read back), `server/token_api.py` (middleware `guard_support_session`: 403 `Not allowed while viewing as a customer.` for any DELETE and writes to `/api-keys`, `/billing`, `/team`, `/profile`, `/auth` except logout, `/calls/*/recording*`, `/telephony/numbers`, `/integrations/*/disconnect`, `/storage/recordings`; every other write audited `impersonate_write` with the admin as actor; support cookie = owner's real `session_version` + `user_sessions` row `provider='support'`, 2 h; exit revokes it and audits `impersonate_exit`; `/auth/me` `impersonating{adminEmail,startedAt,expiresAt}` (UTC ISO with Z); legacy support cookies without a session row now 401 instead of being upgraded into the owner's own session; reason ≥ 5 chars on credits/plan/status; audits `db_backup_run`, `support_note`; outbound-trunk `reason`; `/admin/calls` `outcome`/`hours`), `server/admin_db.py` (paying/MRR/revenueMtd, `ops`, `recentSignups[].calls/firstCallAt`, call filters/fields, call detail strips `recording_key`/`recording_share_token` → `hasRecording`, `worker_statuses`, `credit_positions`, `api.dbLatencyMs`; audit "Impersonation" filter now covers `impersonate*`), `server/calls_db.py` (`FAILED_DISCONNECT_REASONS` factored out of `_status`, same set), new `server/ops_alert_worker.py` (started after `notification_worker`), new `agent/worker_heartbeat.py` + `db.write_worker_heartbeat` + start in `main.py` `__main__` for `start` only.

Pre-existing bug fixed: `POST /admin/impersonate/exit` was matched by `/admin/impersonate/{account_id}` and answered 422 (reproduced with FastAPI locally); the route is now `{account_id:int}`.

Verified: server suite 497 passed (+136 subtests; baseline 474) against local `vv_inttest`, incl. new `test_admin_impersonation.py` (real middleware + routes on a mini app via an in-process ASGI client), `test_admin_p0_reports.py`, `test_ops_alert_worker.py` (send_email patched, no email sent); agent suite on the livekit-agents 1.8.3 venv 690 passed, 15 skipped, 1 xfail (baseline 684), incl. new `test_worker_heartbeat.py`.

Not verified / assumptions: nothing deployed or tried in a browser or on LiveKit. Version = `LIVEKIT_AGENT_VERSION`, else `LIVEKIT_AGENT_DEPLOYMENT` (from the livekit-agents source for hosted agents; not observed on our workers). **`ops.trialsEnding7d` is `null`**: the free trial has no length anywhere in the code (a one-time credit allowance; `trial_started_at` only marks its start), so nothing was invented. `revenueMtd.capturedInr` counts invoices paid this IST month whose status is paid or later refunded, so `netInr = captured − refunds` does not count a refund twice; amounts are invoice totals (`amount_inr`). Credits-low / zero-balance use `calls_db.billing_summary` per account (the number the tenant sees).

Deploy notes: server (Railway) AND both LiveKit workers (tenant `CA_TGdpVhSdxDyS`, platform `CA_53d8HgBktjZ7`) because of the heartbeat. Until the workers are deployed Health shows both `unknown` and no stale alert fires (only seen-then-stale alerts). Optional env `OPS_ALERT_EMAIL` (else the platform owner's email; staging is silent without it). View-as cookies issued before the deploy stop working (open View as again).

Next: frontend branch `claude/admin-p0-frontend` builds on this; then review, PR, merge, Railway deploy, `lk agent deploy` for both workers from a clean archive of the merged sha, then confirm both heartbeats read `ok` on Health.
