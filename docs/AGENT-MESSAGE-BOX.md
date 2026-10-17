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
- Claude (2026-10-15): branch `claude/marketing-header-v2` (PR open, NOT merged): new marketing-site header (language strip, mega-menus, Hear a live call, mobile sheet); web-demo only, Vercel deploy only.
- Claude (2026-10-15): branch `claude/seo-keyword-placement` (PR open, NOT merged): keyword placement fixes + new /ai-calling-agent page; web-demo only, Vercel deploy only.
- Claude (2026-10-15): PR #128 `claude/follow-up-calls` MERGED (main a4d64313) and DEPLOYED: Railway SUCCESS (columns follow_up_policy, crm_notified_at present), phone worker `4pVPHHbYCoC8`, platform-demo `cKDf7Q96GgmR`, both Running/registered, 44 INFO / 0 warnings.
- Claude (2026-10-14): branch `claude/security-tokens-mfa` (PR open, NOT merged): integration tokens encrypted at rest (server + agent + orchestrator). Inert until the owner sets INTEGRATION_ENCRYPTION_KEY everywhere, then INTEGRATION_ENCRYPTION_WRITE=on; see docs/SECURITY-AUDIT-2026-10-12.md.
- Claude (2026-10-16): PR #129 `claude/arthaleads-single-token` MERGED (main c74f5d08) and live on Railway; ArthaLeads half live on staging df4632f / main d563069. Production handshake for account 2 returned linked (Prophunt LLP). No agent code, no worker deploy.
- Claude (2026-10-16): PR #132 `claude/chat-lead-delivery` MERGED with PR #130 (one push): widget text chats delivered to the integrations (idle sweep from the dialer tick + /widget/chat/end beacon); Railway deploy, widget bundle in server/static.
- Claude (2026-10-16): branch `claude/contact-arthaleads-details` (PR open, NOT merged): contact page Lead details card hides ArthaLeads internal keys/tags, shows "From ArthaLeads" line + link; display only, web-demo only, Vercel deploy only.
- Claude (2026-10-16): branch `claude/voice-clone-backend` (committed, NOT pushed/merged): "Clone your voice" backend (server/custom_voices.py, /voices/custom API, Sarvam-only clones, first clone free / 25 credits after, billed like Bharat) + call runtime (agent/custom_voice.py, agent/sarvam_clone_tts.py); stock ElevenLabs voices owner-only. UI is `claude/voice-clone-ui`. Needs Railway + BOTH LiveKit workers + orchestrator after merge. See message below.
- Claude (2026-10-16): branch `claude/voice-clone-ui` (NOT pushed, NOT merged): dashboard half of "Clone your voice" (Voices page section + 5-step dialog, in-browser recorder/upload, consent, Your voices list, cloned voices in agent pickers). Coded against the /voices/custom contract incl. firstCloneFree; tested only against a local mock API. web-demo only, Vercel deploy only, must ship with the server half.
- Claude (2026-10-16): branch `claude/llm-token-diet` (committed locally, NOT pushed/PR'd/deployed): LLM request harness + history window, contact notes moved to the prompt tail, warm-up sends tools, orchestrator VOICE_STYLE_PROMPT before per-call text. Needs both workers deployed after merge.
- Claude (2026-10-16, updated 22:55 IST): branch `claude/lead-details-brochure` (local commits 6677701e + 93de8a7c, NOT pushed yet, owner checks ArthaLeads staging first): standard post-call lead facts stored and sent to ArthaLeads with summary/key_points; send_brochure tool. Function-level claim on issue #2 (comment 6220772439), overlap with prompt-cuts/tool-guardrails cleared by that session. Per [RULES] I stop at PR-ready; the SEO session is the deployer (combined release, then `lk agent deploy` on BOTH workers + Railway for one server line). Dependency: ArthaLeads side is on arthaleads staging bc0446c and should reach ArthaLeads main with or before this deploy.
- Claude (2026-10-17): branch `claude/tool-desc-ab` (local commit, NOT pushed/PR'd/deployed): tools.py tool DESCRIPTIONS only (8 tools; log_lead cut reverted after it broke lead capture). Tool block measured by Sarvam itself = 29–33% of tenant requests; cut saves ~385 tokens/request (~₹26–47 per 1,000 call-min). A/B 2×30: tool accuracy 22/26 vs 21/26, no new wrong end_call/switch. docs/TOOL-DESC-AB-2026-10-17.md. Needs both workers deployed after merge.

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
### Claude — 2026-10-11 — admin P0 frontend (branch `claude/admin-p0-frontend`, worktree, not pushed, no PR)

Frontend half of the super-admin P0s from `docs/ADMIN-DASHBOARD-AUDIT-2026-10-11.md`, built against `docs/ADMIN-P0-API-CONTRACT-2026-10-11.md`. Based on main `5dbc70f`; commits `406a6bf`..`c506461` plus this note. No `server/` or `agent/` file touched; `index.css` untouched.

Changed (all under `web-demo/src/`): `lib/adminApi.ts` (errors throw the FastAPI `detail`; contract fields added as optional types; `adminCalls` takes `outcome`/`hours`; trunk sync sends `reason`), `components/AdminUI.tsx` (`useVisiblePoll`, `ErrorState`, `fmtDateTime`; inactive `FilterChip` gets `bg-transparent`), `components/AdminLayout.tsx` (mobile menu `bg-surface`), `pages/admin/*` (Health workers/API tiles + hidden-tab pause + transient-error note; Calls outcome/window/account filters in the URL + Failure column + absolute-time tooltips; Accounts/Users/Audit/Calls error-with-Retry; ReasonModal shows the backend message, reason ≥ 5 chars; View-as failures caught on account detail and Support; Settings trunk-sync confirm dialog with reason, `text-danger` → `text-destructive`; Dashboard ops alert strip + ops/revenue tiles + signup Calls/First call + 30 s polling; Billing banner removed, "Contracted MRR (active subscriptions)"), `components/DashboardLayout.tsx` (support banner only: "Viewing as X · ends HH:MM", exit failure shown), `lib/auth.ts` (`impersonating` may be the session object).

Verified: `tsc --noEmit -p web-demo/tsconfig.app.json` clean; `npm run build` passes; a script over admin pages/components finds 0 `<button>`/`<a>`/`<Link>` with `border-border|border-cyan` lacking an own `bg-` class.

Not verified / assumptions: nothing opened in a browser (backend not ready). Every new field is optional and the UI hides or falls back when it is absent. Assumed `/auth/me` `impersonating` becomes the object `{adminEmail, startedAt, expiresAt}` (still truthy). The "integration failures (24 h)" alert has no link (no cross-tenant integrations page exists). Window chips map 1 h/24 h → `hours`, 7 d/30 d → `days`. Overview tiles stay hidden until `ops`/`revenueMtd` arrive.

Next: merge with the backend branch, then preview `/admin`, `/admin/health`, `/admin/calls?outcome=failed&hours=1`, an account's View-as + exit, and trunk-sync confirm at desktop and 375 px.

### Claude — 2026-10-12 — SEO P1

Branch `claude/seo-p1` (worktree `.claude/worktrees/agent-a3c2e7cfa56c67944`, based on origin/main `9ff7f62`; not pushed, no PR). Commits `31d5173` (/ai-ivr), `46815a7` (/vs-ivr), `a0949ab` (Kannada/Telugu/Hindi), plus this note. Follows `docs/SEO-AUDIT-AND-IMPLEMENTATION-PLAN.md` P1.

Files: new `web-demo/src/pages/marketing/AiIvr.tsx`; `src/App.tsx` (route `/ai-ivr` before the `/:slug` catch-all), `src/lib/seoPages.ts` (new `/ai-ivr` entry, kind product + optional `serviceType`; reuses the `vs-ivr` OG image; new `/vs-ivr`, Hindi, Kannada, Telugu titles/descriptions), `src/components/SeoRelatedLinks.tsx`, `src/lib/marketingContent.ts` (nav + footer "AI IVR"; `sampleExchange`/`codeMixing`/`regionalCalls` for hi/kn/te; `INDIAN_LANGUAGE_VOICES`), `src/pages/marketing/CompareIvr.tsx`, `LanguageDetail.tsx` (reads titles from the registry; new sections render only when the fields exist), `ProductOverview.tsx` (AI IVR card), `scripts/test-language-seo.mjs` (new titles + section phrases).

Verified: `npm run build` passes (icons, tsc, vite, prerender, check-seo-pages: 113 indexable routes, unique titles/descriptions, one H1, canonical, inbound links); `npm run test:seo` passes; `check-blog-seo.ts` passes. Prerendered `/ai-ivr`, `/vs-ivr`, `/product`, `/languages/{kannada,telugu,hindi}` inspected: titles/descriptions/canonical correct, single H1, JSON-LD parses (`/ai-ivr`: BreadcrumbList + Service + FAQPage with visible FAQ), sitemap includes `/ai-ivr`. Marathi/Odia main content unchanged (diff shows only the new footer/nav link and React ids). Main-content words: /vs-ivr 521→1224, kannada 529→840, telugu 519→831, hindi 543→879, /ai-ivr 1391.

Not verified / left out: not opened in a browser (the Browser preview reads the main checkout's launch.json, which this task must not touch) — eyeball `/ai-ivr`, `/vs-ivr` and the three language pages at desktop and 375 px before or after deploy. Chirp 3 HD voice names left off the language pages because Google billing for Chirp 3 was blocked on 2026-09-14 and I could not confirm it is back; only the Sarvam Standard voices are named. Language samples were written by Claude (labelled as samples); a native speaker should read the Kannada and Telugu lines. "Keep your number" wording follows the pricing page ("compatible provider once we confirm the connection setup"), not an unconditional promise. `graphify update .` not run (no graph in this worktree; run it in the main folder after merge). No `[CLAIM]`/`[DONE]` posted to issue #2 (task said no push/PR; mirror this note there when the branch is pushed).

Owner actions after deploy: Search Console (`vistrowai@gmail.com`, property `https://www.vistrowvoice.com/`) → URL Inspection → Request indexing for `/ai-ivr`, `/vs-ivr`, `/languages/kannada`, `/languages/telugu`, `/languages/hindi`; re-submit `/sitemap.xml`.

Next step: review, push branch, open PR, merge (Vercel deploys the marketing site; no server or LiveKit deploy needed), then the indexing requests above. Re-check these queries in Search Console after 2–4 weeks.
### Claude — 2026-10-12 — copilot phase 2

Branch `claude/copilot-phase2` (worktree, based on main `013fabc`; not pushed, no PR). Confirmed write actions for the dashboard copilot per `docs/COPILOT-ACTIONS-PLAN-2026-10-10.md` (Phase 2 decisions of 2026-10-12).

Changed: `agent/plan_policy.py` (`FEATURE_MIN_PLAN["copilot_actions"] = "growth"`), new `server/copilot_tools.py` (7 write tools: set_agent_status, update_agent_basics, set_agent_integrations, book_callback, book_appointment, assign_number_to_agent, set_integration_events; each with schema/clean/describe/fn/min_role/features; ids re-scoped by the session account), new `server/copilot.py` (propose, HMAC token `{i,a,u,t,x,e}` keyed by `auth._secret()` with a copilot prefix, 10 min; confirm/cancel; caps 150 proposals + 40 confirmed writes per account per rolling 24 h), `server/help_chat.py` (write tools offered only with plan + role + not impersonating; a write call is proposed, never run; one per reply; `pendingAction`/`upgrade` in the reply; `COPILOT_ACTION_MODEL` env, default gpt-5-nano), `server/calls_db.py` (`copilot_actions` table + helpers, `account_features`), `server/token_api.py` (`_guard_agent_patch` extracted from PATCH /agents and shared with the copilot; `POST /help/chat/confirm`, `POST /help/chat/cancel`, `GET /help/copilot/actions`; confirm added to the View-as block list), `server/admin_db.py` (`copilotActions` in account detail), `server/help_tools.py` (`phone_numbers` returns `numberId`). Frontend: `HelpChatWidget.tsx` (Confirm/Cancel card, "Available on Growth" chip, "Pause an agent"/"Book a callback" suggestions; history now sends only role/content), Settings > Data & privacy "Copilot actions" list, admin account "Copilot" tab, types in `types.ts`/`api.ts`/`adminApi.ts`.

Verified: server suite 521 passed (+136 subtests; baseline 497) against local `vv_inttest`, incl. new `test_copilot_actions.py` (23 tests: proposed-not-executed, tamper/expiry/cross-user/cross-account, viewer and demoted-member denied, starter gets no write tools + upgrade, confirm once then 409, cancel, caps, foreign agent id not found, describe names, `['none']` sentinel, allowlist, callback conflict, assign needs admin + LiveKit sync called, admin detail) and the impersonation middleware test now covering `/help/chat/confirm`; `tsc --noEmit` clean; `npm run build` passes (icon check).

Not verified / assumptions: no live OpenAI call (fake responder only), nothing opened in a browser, nothing deployed. "150 copilot messages with tools" is implemented as 150 proposed actions per rolling 24 h (when reached, write tools are withdrawn and reads keep working), not as a cap on chat messages. Callback length 30 min. Any confirm failure closes the card with the server's detail (no retry on the same token). `upgrade` shows only when the model sets it in its JSON for a non-Growth account. graphify-out absent in the worktree, so `graphify update .` was not run. No claim comment was posted on issue #2 from this worktree.

Deploy notes: server (Railway; the `copilot_actions` table is created by `init_tables` on start) + dashboard only. No LiveKit worker deploy (`agent/plan_policy.py` gained a key the worker never reads).

Next: review + PR + merge + deploy, then a live check on staging (Growth account: "pause <agent>" → card → Confirm; starter account → chip). Then Phase 3 guided agent builder (`server/copilot_builder.py`).


### Claude — 2026-10-12 — Build with AI (agent builder)

Branch `claude/agent-ai-builder` (worktree `.claude/worktrees/agent-aed2143763bd98bb5`, based on origin/main `32dc5fd`; not pushed, no PR). Commits `38727c3` (backend), `a4c4ca2` (frontend), plus this note. Did not touch HelpChatWidget / help_chat / copilot files (PR #34).

Backend: new `server/agent_builder.py`; `POST /agents/draft` in `server/token_api.py` (member+, any plan) returns `{questions:[{id,question,options}]}` (max 3, 2–4 options each) or `{draft:{name,businessName,description,model,language,voice,tone,firstSpeaker,welcomeMessage,welcomeMessageOutbound,systemPrompt,enabledFunctions,maxCallDurationS,postCallFields}}`; `section` (basics|voice|instructions|conversation|after) + `current` regenerates only that section's keys. Never writes an agent. Every field validated: voice from the account's own menu filtered by `allowed_tiers_for_plan` (no hidden/preview voices for tenants; fallback `pooja`), language from `voice_catalog.LANGUAGE_LABELS` (fallback hi-IN), model Bharat or Swift (default `sarvam/sarvam-105b-conversations`), tools from end_call/transfer_call/web_search/send_dtmf ("" = all on), lengths clamped, unknown keys dropped. LLM: OpenAI `gpt-4.1-mini` JSON mode, then Gemini `gemini-2.5-flash` (`responseMimeType: application/json`, thinking off) on any failure; `AGENT_BUILDER_PROVIDER=openai|gemini` forces one; both fail → friendly 503. Cap: 30 per account per 24 h via new `agent_drafts` table (in `_SCHEMA`), friendly 429 (`calls_db.count_agent_drafts` / `record_agent_draft`).

Frontend: `Agents.tsx` `?new=1` (sidebar "+ New Agent", command menu) opens a chooser (Build with AI · Recommended / Start from scratch = old flow incl. upgrade modal). New lazy guarded route `/dashboard/agents/new` → `pages/AgentBuilder.tsx` (description + 5 example chips + optional business name/website → optional questions → editable review grouped like the agent tabs, per-section Regenerate → Create = `createAgent(draft)` then `updateAgent(id, draft)` → `/dashboard/agents/:id?drafted=1`). `AgentDetail.tsx`: dismissible "Drafted with AI" banner with Test call (BrowserTestModal); `PostCallFieldsEditor` exported for reuse and its rows now wrap below `sm` (375 px).

Verified: server suite 515 passed (+136 subtests) against local `vv_inttest`, incl. new `test_agent_builder.py` (18 tests; fake urlopen only, never a real provider); `tsc --noEmit -p tsconfig.app.json` clean; `npm run build` passes. One earlier full run had 5 `DeadlockDetected` errors in `test_usage.py` setup; two reruns were clean (likely a concurrent run on the same DB).

Not verified / assumptions: nothing opened in a browser and no real LLM call made, so prompt quality is unmeasured. Every real Premium voice is currently hidden or owner-only preview, so tenants only get Standard/Lite voices from the builder (tests use a stand-in Premium entry). No agent-count pre-check before drafting (entitlements do not expose the limit); the limit shows at Create via the upgrade modal. The "+ Add field" button in the reused post-call editor still gets the global purple gradient (pre-existing on the agent page). `graphify update .` not run (no graph in the worktree).

Next: owner preview at desktop and 375 px with real `OPENAI_API_KEY`/`GEMINI_API_KEY`; try the five example chips and judge the prompts; then push, PR, merge (Railway server deploy only; no LiveKit deploy needed).

### Claude — 2026-10-12 — Build with AI: review, Sarvam provider, PR #35

PR https://github.com/vistrowtechnologies-bit/Voice/pull/35 (branch `claude/agent-ai-builder`). Added commit `ffaca14`: the builder now tries Sarvam `sarvam-105b-conversations` first, then OpenAI, then Gemini (`AGENT_BUILDER_PROVIDER=sarvam|openai|gemini` forces one), and fenced JSON is stripped. Why: on 2026-10-12 the production and staging server keys returned OpenAI 429 `credit_balance_exhausted` and Gemini 402 `RESOURCE_EXHAUSTED` (prepaid credits depleted), so every draft returned the 503.

Verified:
- Real Sarvam call from the staging container with the builder prompt: questions in 1.2 s, full draft in 2.5 s, valid shape.
- Local preview (simulated model) end to end: chooser → description → 3 questions → review (all 5 sections) → Create → `/dashboard/agents/9?drafted=1` banner. The DB row has every drafted field (voice, language, tone, tools, max duration, post-call fields, Devanagari welcome).
- Checked at 375 px.
- 20 builder tests; full suite 515 passed.

Open, for the owner: Gemini prepaid credit is depleted on the server key. Production calls in the last 48 h were all Sarvam (12, 0 failed); not checked whether the LiveKit workers' Google key is the same project, so Gemini Live/TTS agents may fail until it is topped up.
### Claude — 2026-10-12 — SEO batch 2

Branch `claude/seo-p2` (worktree `.claude/worktrees/agent-a758883e32f2c1821`, based on origin/main `32dc5fd`; not pushed, no PR). Commits `e522fc4` (Punjabi/Tamil), `d3c7741` (/ai-voice-bot-pricing-india), `004f2ed` (/solutions/finance + /solutions/real-estate), plus this note. Marketing content only; no `server/`, `agent/` or dashboard files touched.

Files: `web-demo/src/lib/marketingContent.ts` (pa/ta language fields; new optional `Solution.guideSections`/`sampleExchange`; finance + real-estate copy/FAQs), `src/lib/seoPages.ts` (titles/descriptions for both solutions, Punjabi, Tamil; explicit `/ai-voice-bot-pricing-india` entry), `src/lib/seoExpansionContent.ts` (pricing removed from `BUYER_GUIDES`), new `src/pages/marketing/AiVoiceBotPricing.tsx`, `src/App.tsx` (route before `/:slug`), `src/pages/marketing/SolutionDetail.tsx` (renders the new optional sections only when present), `scripts/test-language-seo.mjs` (Punjabi/Tamil; demo link optional, solution links checked instead).

Pricing numbers are computed in the page from `lib/plans.ts` (PLANS, TOPUP_PACKS) plus constants mirrored from `server/calls_db.py` (GST 0.18, OVERAGE_RATE_MULTIPLIER 1.4, voice tiers 0.75/1/2, model tiers, channel rate 1); keep them in sync if billing changes. Finding: both models offered in the agent editor (Vistrow Bharat `sarvam/…`, Vistrow Swift `gpt-4.1-mini`) bill in the 2x model tier, so a Standard-voice minute is 2 credits. The `/pricing` FAQ ("browser and phone calls both use 1 credit per minute") and the help article ("Standard uses half the credits") read as if 1 credit/min is typical. Not changed here (out of scope).

Verified: `npm --prefix web-demo run build` passes (icon check, tsc, prerender, check-seo-pages: 113 routes); `npm --prefix web-demo run test:seo` passes for hindi, kannada, telugu, marathi, punjabi, tamil; `check-blog-seo.ts` (run from `web-demo/`) passes. Prerendered HTML of all five routes: titles ≤60, descriptions ≤155, canonical, one H1, JSON-LD parses (solutions/languages: BreadcrumbList+Service+FAQPage; pricing: BreadcrumbList+FAQPage), no "best"/quoted queries in new copy. Served `dist/` locally and checked finance, pricing, real-estate and Punjabi in a browser at desktop and 375 px (no horizontal scroll; Gurmukhi renders). Main-content words: finance 659→1808, real-estate 779→1771, punjabi 435→876, tamil 444→881, pricing 416→1289.

Not verified / left out: ₹299/month phone-number fee (in code, not on /pricing), annual billing and the trial allowance left off the pricing guide. No Punjabi/Tamil demo-call pages exist, so none linked. Samples were written by Claude (labelled as samples); a native speaker should read the Punjabi, Tamil and Hindi lines. RBI 8 am–7 pm stated as guidance only, next to the default 9–9 window. `graphify update .` not run (main folder after merge). No `[CLAIM]`/`[DONE]` posted to issue #2.

Owner actions after deploy: Search Console (`vistrowai@gmail.com`) → request indexing for `/solutions/finance`, `/solutions/real-estate`, `/languages/punjabi`, `/languages/tamil`, `/ai-voice-bot-pricing-india`; re-submit `/sitemap.xml`. The pricing guide's OG image still shows the old headline; regenerate with `npm run generate:og` if wanted.

Next step: review, push branch, open PR, merge (Vercel only; no server or LiveKit deploy).

**Claude, 2026-10-12, owner decision on the batch above:** the pricing-guide commit (d3c7741) is reverted on this branch and held. Billing charges Vistrow Bharat and Vistrow Swift at 2× (`model_tier`: `sarvam/*` and `gpt-4.1-mini` are premium), so a Standard-voice call costs 2 credits/min, while `/pricing` and the help article say 1 credit/min. The owner will decide whether to fix the copy or change billing; until then the guide stays unpublished and the finance page points cost questions at `/pricing`. Shipping: finance, real estate, Punjabi, Tamil.

### Claude — 2026-10-12 — SEO batch 3: product pages

Branch `claude/seo-p3-product` (from origin/main `c47bc9d`). Marketing content only: `web-demo/src/lib/marketingContent.ts` (new `GuideSection` type; `PRODUCT_DETAIL` gains `guideSections` and 6 FAQs per page for agents, inbound, outbound, knowledge-base, widget, integrations), `src/pages/marketing/ProductDetail.tsx` (renders the sections), `src/pages/marketing/ProductOverview.tsx` (call-flow and where-to-start sections, 4 more FAQs). Titles, H1s and `seoPages.ts` untouched; no new routes. No server, agent or dashboard files.

Claims checked against `server/help_articles.py` and the dashboard pages (WebsiteWidget, KnowledgeBasePage, Outbound, AgentDetail). No prices or credit figures. The old outbound claim of "thousands of contacts" in a FAQ was replaced with a cautious answer (start small, talk to us before scaling), and the "scored"/"get a number from us" claims on inbound were softened to what the code supports; the outbound subhead and feature cards were left as they were.

Verified: build (icon check, tsc, prerender, check-seo-pages: 113 routes), `test:seo`, `check-blog-seo.ts` all pass. Main-content words after: product 943, inbound 845, outbound 776, agents 897, widget 725, knowledge-base 746, integrations 709 (before, from the task brief: ~454 and ~250 each).

Not verified: no browser visual check at 375 px (same card grid as the solution pages); the dashboard "Required" gate and widget chat-only mode were confirmed in code, not on a live site; native-language and vendor mentions in older FAQ text (Sarvam/ElevenLabs voices on agents) left as they were. `graphify update .` not run.

Next step: review and merge PR (Vercel only), then request indexing for `/product/inbound`, `/product`, `/product/agents` in Search Console.
### Claude — 2026-10-12 — SEO P3 language pages

Branch `claude/seo-p3-languages` (based on origin/main `c47bc9d`). Deepened `/languages/{marathi,odia,malayalam,gujarati,bengali}`: per-language use cases, a labelled written sample exchange with English gloss, code-mixing note, regional call types, three "call notes" cards, extra FAQs and a related-links strip (solutions, product, compare, AI IVR, demo-call pages, neighbouring languages). Titles, descriptions and H1 unchanged. Files: `web-demo/src/lib/marketingContent.ts` (new optional `guide`, `extraFaqs`, `related` fields plus content), `web-demo/src/pages/marketing/LanguageDetail.tsx` (renders them), `web-demo/scripts/test-language-seo.mjs` (covers all ten language pages). `seoPages.ts` and `seoExpansionContent.ts` untouched (all links already registered).

Verified: `npm run build` (icon check, tsc, prerender, route audit 113 routes), `npm run test:seo` (10 languages), `check-blog-seo.ts` pass. Main-content words before to after: marathi 530 to 1197, odia 449 to 1141, malayalam 448 to 1135, gujarati 449 to 1097, bengali 448 to 1098 (includes shared template text). No prices, credit figures or quoted queries added.

Not verified: native-speaker review of the Marathi, Odia, Malayalam, Gujarati and Bengali sample lines and "call notes" dialect remarks (written by Claude; sample is labelled as a written example). Not viewed in a browser. Next step: review and merge (Vercel only), then request indexing for the five URLs.

### Claude — 2026-10-12 — SEO batch 4: hubs (integrations, healthcare, support, demo calls)

Branch `claude/seo-p4-hubs` (from origin/main `3c45816`). Marketing content only: `web-demo/src/lib/marketingContent.ts` (new `INTEGRATIONS_PAGE` guide sections and FAQs; `guideSections` and extra FAQs for the healthcare and support solutions; `INTEGRATION_DIRECTORY` corrected), `web-demo/src/lib/seoExpansionContent.ts` (each demo call gains `callerExperience`, `whyItMatters`, `configure`, `related`, 3 extra FAQs), `web-demo/src/pages/marketing/IntegrationsDirectory.tsx` and `DemoCall.tsx` (render them). `seoPages.ts`, titles and H1s untouched; no new routes.

Corrections made while verifying against `server/calls_db.py` and `IntegrationDetail.tsx`: the directory said Google Sheets uses an Apps Script URL with "no OAuth dance", but the primary path is Sign in with Google (Apps Script is the advanced option); Zoho CRM, Facebook Lead Ads and the webhook were missing from the directory and are now listed; the healthcare FAQ claimed reminder calls run automatically before every appointment, but reminders are an outbound campaign you set up; the support "Ticketing system" card implied a native connector and now says webhook; the Marathi demo FAQ said booking needs a "calendar integration", but booking uses the built-in Appointments calendar. There is no Google Calendar integration in the repo, and the page says so.

Verified: build (icon check, tsc, prerender, route audit 113 routes), `test:seo`, `check-blog-seo.ts` pass. Main-content words before to after: integrations 379 to 1526, healthcare 700 to 1495, support 710 to 1350, demo calls 334/294/298/297 to 851/783/773/764 (counts include shared layout text). No prices, credit figures, HIPAA/ISO claims or invented stats.

Not verified: not viewed in a browser (card grids reuse existing sections); the "Send test" behaviour per integration and the "about five seconds" webhook wait come from dashboard code, not a live test; healthcare wording on consent and recording is a pointer to the Compliance settings, not legal advice. `graphify update .` not run. Next step: review and merge (Vercel only), then request indexing for `/integrations`, `/solutions/healthcare`, `/solutions/support`.
### Claude — 2026-10-12 — SEO batch 4: compare pages and buyer-guide hub

Branch `claude/seo-p4-compare` (from origin/main `3c45816`). Marketing content only, no new routes: `web-demo/src/lib/seoExpansionContent.ts` (new `COMPARE_EXTRAS` merged into `COMPARE_VENDORS`: per-page "which approach fits", questions to ask any vendor, side-by-side testing steps, 3 extra FAQs, related links; hub guide gains category overview, ten-point checklist table, trial steps, 4 FAQs, related links; hub title/first FAQ reworded so there is no "best" claim; "Best fit" row labels became "Where it fits"), `web-demo/src/pages/marketing/CompareVendor.tsx` and `BuyerGuide.tsx` (render the new sections; comparison table column now reads "Typical <category> approach" with a category-level disclaimer; shared "What Vistrow Voice covers" strip), `web-demo/src/lib/marketingContent.ts` (nav label only). Scope note: the brief said 6 compare pages, the repo has 8 vendor pages (exotel, knowlarity, ozonetel, sarvam-ai, elevenlabs, retell-ai, bland-ai, synthflow), so all 8 were deepened. `/vs-ivr` already ~1,200 words and left unchanged.

Vistrow claims reused only from existing product-page copy (verified earlier against help articles/dashboard). No prices or credit figures, no named-competitor feature claims, no quoted queries.

Verified: build (icon check, tsc, prerender, route audit 113 routes), `test:seo`, `check-blog-seo.ts` pass. Prerendered main-content words: exotel 1012, knowlarity 934, ozonetel 913, sarvam-ai 971, elevenlabs 947, retell-ai 918, bland-ai 930, synthflow 935, hub 1291 (before: roughly 350-450 each). All internal hrefs resolve to prerendered routes.

Not verified: no browser visual check (reused card/table classes); pre-existing table cells about named vendors were reworded only at column-header level; `graphify update .` not run. Next step: review PR, merge (Vercel only), request indexing for `/best-ai-voice-calling-software-india` and `/compare/sarvam-ai`.

### Claude — 2026-10-12 — Facebook Lead Ads and WhatsApp: no new connections

Branch `claude/integrations-hide-fb-whatsapp` (from origin/main `ea104ef`). Owner decision: both integrations are not available. Dashboard: Integrations list shows them as disabled "Coming soon" cards (no link, no buttons) unless the account already has one connected; connected ones stay fully manageable with "No longer offered for new connections", and the detail page of an unconnected one shows Coming soon only. Server: `calls_db.integration_accepts_connect` plus `_require_integration_connectable` in `token_api.py` reject a NEW connection with 400 "not available yet" on `PATCH /integrations/{key}` (status connected), `GET /integrations/facebook/start`, the Facebook OAuth callback (redirects `?facebook=unavailable`) and `PATCH /integrations/{key}/settings`; disconnect and updates for connected rows are allowed. `list_integrations` adds `newConnectionsUnavailable`. Copilot `set_agent_integrations` cannot pick an unconnected one. `integrations_dispatch.py` and delivery behaviour untouched. Help articles and `help_content.py` say coming soon; the instant lead follow-up article describes the generic webhook; `helpArticles.ts` regenerated.

Verified: web-demo build + test:seo, new `server/test_integration_new_connections.py`, `test_help_articles.py`, `test_copilot_actions.py` pass; Integrations page screenshotted against a mock API (new tenant: two Coming soon cards; tenant with WhatsApp connected: manage page with notice). Not verified: the Postgres-backed test added to `test_integration_settings_and_deliveries.py` (skipped, no TEST_DATABASE_URL here); real server endpoints end-to-end; `graphify update .` not run. Left alone: Privacy/Terms text, marketing pages, ArthaLeads inbound routing source labels (website/facebook/whatsapp). Next step: review and merge (Railway + Vercel; no LiveKit deploy).
### Claude — 2026-10-12 — Remove Facebook Lead Ads and WhatsApp claims from the public marketing site

Branch `claude/seo-remove-unavailable-integrations` (from origin/main). Owner said Facebook Lead Ads and WhatsApp are not available, so public marketing copy no longer claims them. Files: `web-demo/src/lib/marketingContent.ts` (WORKS_WITH, INTEGRATION_DIRECTORY entries removed, integration guide "Seven connections" now five plus an "Instant lead follow-up" card via ArthaLeads/webhook, FAQs, solution and language copy, related-link labels), `web-demo/src/lib/seoExpansionContent.ts` (FAQ, Marathi sample line and notes reworded to "send the details"), `web-demo/src/lib/seoPages.ts` (meta description and proof string), `web-demo/src/pages/marketing/{IntegrationsDirectory,ProductOverview,Docs}.tsx`.

Verified: build (icon check, tsc, prerender, route audit), `test:seo`, `check-blog-seo.ts` pass; marketing HTML has no WhatsApp/Facebook except the items below.

Left alone, needs an owner decision: `web-demo/src/content/helpArticles.ts` (public /help pages: connect-integrations and instant-lead-follow-up still describe WhatsApp and Facebook, likely generated from `help_articles.py`), `Privacy.tsx` and `Terms.tsx` (mention WhatsApp as a possible integration), dashboard integration pages and server code (still ship the connectors). `Signup.tsx` "Facebook Ad" is a lead-source dropdown, not an integration claim. Next step: review PR, merge, then decide on help articles and legal pages.

### Claude — 2026-10-12 — Privacy Policy rewritten from a code audit

Branch `claude/privacy-policy-update` (from origin/main `94283ef`). Files: `web-demo/src/pages/marketing/Privacy.tsx` (rewritten: controller/processor split, AI disclosure, recordings, sub-processor table, Google Limited Use, retention, security and support access, rights and grievance, cookies, children), `Terms.tsx` (integrations clause no longer names Google Calendar; deletion can be requested in Settings), `Security.tsx` (roles, recording-link and card-data wording corrected), new `docs/PRIVACY-AUDIT-2026-10-12.md` (fact table with file references and the gaps list).

Key finding: the old policy described a Google Calendar integration and `calendar.events` scope that the code does not have. The only Google scopes are sign-in (`openid email profile`) and Sheets (`drive.file`). Recording links in CRM/Sheet payloads are permanent bearer-token URLs, which the Security page had described as short-lived.

Verified: web-demo build, `test:seo`, `check-blog-seo.ts` pass; prerendered /privacy contains the Limited Use text; table screenshotted locally. Not verified: sub-processor regions, `AUTH_COOKIE_SECURE` in production, anything legal. Next step: owner reviews the "Needs legal/owner confirmation" checklist in the PR; do not merge before that. Marketing copy only, no deploy beyond Vercel.

### Claude — 2026-10-12 — Security audit and fixes (branch claude/security-hardening)

Findings and status: `docs/SECURITY-AUDIT-2026-10-12.md`. Shipped in one batch:
- **Three P0 cross-tenant fixes:** widget site agent, inbound route number, Zoho host / client secret.
- **Owner-only `/admin`:** owner role only, no API keys, and two-step login required.
- **Two-step login (`server/mfa.py`):** TOTP plus recovery codes, covering password, Google and GitHub sign-in.
- **Other fixes:**
  - Google/GitHub pre-registration takeover.
  - Support cookie tied to the admin's session.
  - Webhook SSRF.
  - HTML escaping in emails.
  - Role checks and rate limits.
  - Per-email lockout.
  - Single-use reset links.
  - New-device sign-in email.
  - Origin check (report-only).

The agent worker's `db.py` (route lookup scoped to the number's owner) and `tools.py` (Zoho allowlist) also changed, so both LiveKit workers were redeployed.

Verified:
- 593 server tests (new `test_security_hardening.py`) and 689 agent-worker tests.
- Local preview end to end: admin blocked without two-step login → set up (QR, recovery codes) → admin opens → sign out → password → code step (a reused code was refused, a fresh one worked).
- The scoped route SQL was proven against Postgres.

Owner action after deploy:
- Settings → Sign-in & security → Two-step login → Turn on, or `/admin` stays locked.
- EnableX webhook credentials are not set.
- Set `ORIGIN_CHECK=enforce` once the logs are clean.

### Claude — 2026-10-12 — Security hardening part 2 (branch claude/security-hardening-2)

Branch `claude/security-hardening-2` from origin/main `12a9038`. Not merged, not deployed, no PR. Details in `docs/SECURITY-AUDIT-2026-10-12.md` rows 20-23.
- **Persistent rate limits:** new table `rate_limit_hits` and `calls_db.rate_limit_hit/count/record/clear`. `token_api.py` `_limited`, `_auth_rate_limited`, `_login_locked`, `_note_login_failure` and the new `_clear_login_failures` use it. If the DB fails they log a warning and use the old in-memory limit. The widget/token limiters stay in memory.
- **DNS-rebinding fix:** `kb_crawl.safe_opener()` resolves once per connection and per redirect hop, refuses private IPs, and connects to the checked IP. TLS SNI and the certificate still use the hostname. Used by the crawler and `integrations_dispatch._post_json`.
- **CSP:** `web-demo/vercel.json` adds a report-only CSP, plus HSTS and Permissions-Policy.
- **API key scopes:** new column `api_keys.scopes`. Existing keys are `["full"]`; new keys default to `read` + `calls`. The middleware map is `_API_KEY_SCOPE_WRITES` / `_api_key_allows`. The `POST /api-keys` body takes `scopes`, and the list returns them. The frontend `types.ts`/`api.ts` were updated, but there is no API keys screen (removed in `b3983301`), so no checkboxes.

Verified:
- Server suite: 611 passed. New tests are in `server/test_security_hardening_2.py`, and the DB-backed rate-limit and scope tests ran against the local Postgres.
- Web: tsc and build pass.
- Real fetches through the pinned opener worked: https://example.com, and `_post_json` to httpbin returned 200. localhost was refused.
- Built dist was served locally with the vercel.json headers: no CSP reports on `/`, `/pricing` or `/login`.

Not verified:
- CSP sources for LiveKit calls, Razorpay checkout, Clarity (it only runs on real hosts), Backblaze recordings, and the orchestrator websocket (`wss://*.up.railway.app` is assumed).
- Postgres `hashtextextended` needs PG 11+ (assumed on Railway).
- `graphify update .` was not run.

Next: review, merge with the other claimed branches, deploy (Railway + Vercel, no LiveKit change), then check the console for CSP reports before enforcing.

### Claude — 2026-10-12 — Admin finance: usage & cost, Finance page, low-credit alerts (branch claude/admin-finance)

Branch `claude/admin-finance` from origin/main `12a9038`; pushed, no PR. Audit P1 items from `docs/ADMIN-DASHBOARD-AUDIT-2026-10-11.md`.
- **Usage & cost:** `GET /admin/usage?from&to|days&account_id` (owner-only). Per account it returns calls, minutes, credits, revenue and an ESTIMATED vendor cost. Credits use `calls_db.credits_for_call` plus the test-overage add-on, and a test checks them against `usage_report`. Revenue is ex-GST: invoices paid in range minus refunds made in range. Vendor cost covers all minutes, test calls included. All cost rates live in ONE table, `admin_db.VENDOR_COST_RATES`, with a source per rate: Gemini 3.1 ₹16.8/min and 2.5 ₹4.6/min (Google bill 6–9 Oct), pipeline ₹2.7/min (`docs/REALTIME-VS-CASCADED-COST-2026-10-05.md`), LiveKit ₹0.957/min on every call, EnableX ₹0.25/min on phone calls. New page `/admin/usage` has a date range, a sortable table with totals, CSV export and a rates panel. The account detail Billing tab shows a 30-day usage & cost block.
- **Finance:** `GET /admin/finance` returns 6 months of revenue (`_revenue_months`; `_revenue_mtd` now reuses it), failed payments in the last 30 days, and MTD revenue vs estimated cost. `GET /admin/invoices?status=` lists invoices. `AdminBilling.tsx` was extended into the Finance page: route `/admin/finance`, `/admin/billing` still works, sidebar label "Finance".
- **Low credit:** `admin_db.low_credit_threshold`/`is_low_credit`. Low means at least one live agent and 0 < remaining < max(50, 3 × 14-day average daily use). The ops worker sends `low_credit:<id>` alerts, at most one per account per 24 h, with a link to `/admin/accounts/<id>`. The overview's `creditsLowAccounts` now uses the same rule (it was ≤20% of the allowance, any account) and gains `creditsLowList`.

Verified: new `server/test_admin_finance.py`, updated p0/ops tests and the full server suite against local Postgres; web-demo tsc and build pass. Pages were checked in a browser against the real admin_db functions on local `vv_inttest` (desktop and 375 px, no page-level horizontal scroll; sort, status filter and PDF links work). Not verified: real production numbers; cost rates are averages, not per-call measurements; no alert email was actually sent. Next step: review, fold into the combined PR, deploy to Railway + Vercel (no LiveKit deploy needed).

### Claude — 2026-10-12 — Batch: Gemini 2.5 greeting fix, admin finance, security round 2, builder quality

Branch `claude/batch-2026-10-12b` (merges claude/security-hardening-2, claude/admin-finance, claude/builder-quality + a realtime commit). One PR, one deploy; both LiveKit workers already deployed from 1c4d33a3 (tenant chimRJmTFZWe, platform-demo 4oPZT887GJ6g).

- **Gemini 2.5 Live:** `docs/GEMINI-LIVE-25-LATENCY-2026-10-12.md`. 2.5 stalls the caller's first turn after a generate_reply greeting (needs the plugin's "." placeholder); the opener is now spoken by Chirp 3 HD in the Gemini persona via `session.say(audio=...)` (`REALTIME_25_TTS_GREETING=0` reverts). Verified: empty generation gone; one synthetic-caller call still 7.5 s (Gemini first audio 4.65 s after its first server event). Direct probes rule out prompt size, tools, idle time, chunk size, noise, VAD profile (all 1.8–2.6 s). Remaining gap is 2.5-on-LiveKit-Cloud only (python-genai #2117); 3.1 is 2.4 s in the same worker. Next: one real browser test call on a 2.5 agent and read `[latency] realtime caller-stop-to-playback`.
- **Admin:** Usage & cost per account (`GET /admin/usage`), Finance page (`/admin/finance`, invoices list), low-credit owner alerts (`ops_alert_worker`). Vendor cost rates in `admin_db.VENDOR_COST_RATES`, marked estimated.
- **Security:** Postgres-backed rate limits (`rate_limit_hits`, fail-open), pinned-IP fetches for the KB crawler and webhooks, report-only CSP + HSTS + Permissions-Policy in `web-demo/vercel.json`, API key scopes (read/calls/agents/full; existing keys = full). Origin check stays report-only: 2 h of production logs showed 0 would-blocks over only 8 writes, and a second Vercel project (prophunt-dashboard) may call the API from another origin — confirm its domain before `ORIGIN_CHECK=enforce`.
- **Build with AI:** prompt no longer presents Vistrow Voice as the customer's business, names the agent, requires a field per requested detail plus an outcome field, and drops direction questions the description already answers. Re-run on all 5 examples: clean.

Verified on the batch: 617 server tests, 693 agent tests, tsc + build. Spend on Gemini tests today ≈ ₹30 of the ₹50 cap.

### Claude — 2026-10-12 — toggle chips no longer read inverted

Branch `claude/toggle-chip-gradient-leak` (PR, not merged). Owner saw Inbound "Active days" chips inverted: unselected days were solid purple, so with Mon–Sat on only Sun looked "on".

Cause (verified): the `index.css` rule that paints `button`/`a` with `border-border`/`border-cyan` and no `bg-*` class in the brand gradient also matched the unselected branch of toggle chips. The selected branch has a `bg-*` class, so it escaped the rule and looked plainer than the unselected one.

Fix (className only, same approach as efae355c "+ Add field"): `bg-transparent` on the unselected/static classes in Inbound (day chips; selected now `border-primary bg-primary/10 text-primary`, same as Outbound's day chips), Outbound (day chips), Support (rating), TestingLab (scenario cards), WebsiteWidget ("Site default" avatar), Dashboard (incomplete readiness checks), KnowledgeBasePage (catalog header when open). `index.css` unchanged.

Verified: `npm run build` (tsc + vite + prerender + SEO audit) passes. Local dev server with a mock API: Inbound chips with Mon–Sat on show six purple-tinted chips and a plain Sun, in light and dark theme; computed styles confirm no gradient on unselected. For the other six pages, real-stylesheet computed-style test of each exact class string: new = plain, old = gradient. Not verified: visually on those six pages (needed data/wizard steps), or on production.

Next: owner reviews/merges the PR; web-only (Vercel), no worker deploy.

### Claude — 2026-10-12 — WordPress plugin: admin notices no longer land inside the header

Branch `claude/wp-plugin-notices` (PR, not merged). On shaporjipallonji.com the plugin settings page showed four other plugins' notices (FluentSMTP, Essential Addons, Backuply ×2) inside the purple header, between the title and tagline, with washed-out text.

Cause (verified live in the owner's Chrome, WP 7.1.3): core `wp-admin/js/common.js` moves every `div.notice/.updated/.error` after `.wp-header-end`, or, if the page has none, after the first `.wrap h1`. Our h1 is inside `.vvw-header`, and `.vvw-header p` gave the notices' text the pale header colour.

Fix: `<hr class="wp-header-end">` right after the header; plugin 1.7.1; `server/static/vistrow-voice-widget.zip` rebuilt (the old zip matched main's PHP exactly before rebuilding).

Verified: on the live page, adding the marker and re-running core's own relocation line put all four notices below the header with dark text and the header back to one row (DOM-only simulation, nothing installed on the site). Not verified: the new zip installed on a real site; no PHP linter on this machine (change is HTML only).

Next: merge (needs a Railway deploy to serve the new zip), then the site owner uploads/updates the plugin in WP Admin → Plugins.

### Claude — 2026-10-12 — Chirp voices, prompt trim, API keys screen

Branch `claude/api-keys-screen` (commit 1fcf47a4, PR to follow, merged and deployed in one go).

- **Voices:** all 30 Chirp 3 HD personas are in the catalog (24 added, names checked unique). Google's list_voices shows each in 52 locales, 11 Indian incl. Urdu; ru-RU exists for only 8 so it is left out. `CHIRP3_LANGUAGES` is now those 52, so a persona can follow the caller into any of them, and `switch_reply_language` accepts their names on a Chirp voice (`_CHIRP3_NAME_TO_LANGUAGE_CODE`; Odia still switches text with "voice cannot follow", as before).
- **Prompt trim (pipeline agents):** the duplicate "Never claim something you have not actually done" block is gone (Platform rule 1 gained its WhatsApp/SMS/email detail), and "Global languages" is shortened with every rule kept. Agent 26 instructions 35,284 → 32,777 chars. Section-by-section diff: only Platform rules, Global languages and the clock changed; all speaking-style sections (How you actually talk, Fillers, Listen and react, Turn length) are byte-identical.
- **Settings → Developer → API keys:** create keys with read/calls/agents/full scopes; key shown once; revoke with confirmation. Backend scopes shipped in #57.

Verified: 693 agent tests, 87 voice/plan server tests, tsc + vite build. Local preview: HD tab shows 30 voices labelled "52 languages"; a local key created with calls + agents shows both scopes.
Not verified yet: production behaviour after deploy (Sarvam test call planned).

### Claude — 2026-10-12 — Voices page redesign ("Spotlight", owner-chosen)

Branch `claude/voices-page-redesign`. The owner picked style B from two mockups (`design/voices_preview/index.html`, local only, not committed).

Changes:
- `web-demo/src/pages/Voices.tsx` rewritten as a list plus a sticky spotlight panel. The panel has a large orb, a waveform and a big play button. While the audio plays, the real audition sentence lights up word by word. It also shows stat tiles (languages, live/fixed switch, credit multiplier), language chips, and Add / Added (Remove on hover) / Upgrade.
- List rows have a small play button; playing one also selects it. New filters: All / Added / Female / Male. "Added" and search look across all tabs.
- A "N voices in your agents' picker" pill with avatars opens the Added filter.
- `VoicePreviewButton.tsx`: playback moved into `useVoicePreview(voice, lang)` returning `{state, progress, toggle}`. The button is unchanged for its other users.
- `server/calls_db.py` `voice_catalog_for_account` returns `sampleTexts` (hi/en × female/male, via `voice_catalog.sample_text`).
- `index.css`: `.vv-wave-bar` animation, which respects reduced motion.
- The HD tab note no longer hardcodes "ten Indian languages". Language text comes from the data, so PR #59's Voices.tsx hunk is no longer needed.

Verified (local dev server with a mock API serving the real `voice_catalog.CATALOG` + a 5 s WAV):
- Row play selects the voice and plays; the waveform animates and words light in step (12/33 at 2 s).
- Add updates the count, the row badge and the CTA. The Added filter works across tabs, and the Standard tab is fine.
- Light and dark at 1440 px; 375 px has no horizontal scroll, the panel is compact, and the list starts on the first screen.
- `npm run build` passes.

Not verified: real Google/Sarvam preview audio on production. `server/calls_db.py` was only syntax-checked (no Postgres here).

### Claude — 2026-10-12 — Voices page uses full width

Owner noticed empty space on the right of the new Voices page. Removed its `max-w-6xl` cap, which no other dashboard page has. The spotlight column is now 380 / 420 / 460 px at lg / xl / 2xl. Verified at 2000 px in the local app: content ends at the normal 24 px page padding, and `npm run build` passes. Also seen: production now serves #59 and #60 (the owner's screenshot shows the new page live), so the earlier Vercel rate limit has cleared.

### Claude — 2026-10-12 — combo tests and new pricing (PR #62, not merged)

Real test calls on the production phone worker (synthetic Hindi caller, account 2, temp agents deleted). Worker-measured turn / LLM first token / TTS first audio:
- Sarvam 105B + Chirp 3: 737–779 ms / 200–206 ms / 169–204 ms.
- Sarvam 105B + pooja: 674–706 ms / 139–218 ms / 186–193 ms.
- gpt-4.1-nano + Chirp 3: 1,634–2,326 ms / 914–1,804 ms (one reply started with a stray "अकेले आप कह रहे हैं").
- gpt-4.1-mini + Chirp 3: 1,651–1,756 ms / 988–1,159 ms (one reply said "अपराह्न दस बजे", i.e. 10 pm).
- gemini-2.5-flash: no reply. The Gemini API project is at its monthly spend cap (429 RESOURCE_EXHAUSTED, verified from the production server). Gemini Live agents 4 and 26 (Vistrow's own) cannot answer until the cap is raised; no customer agent uses Gemini.

PR #62 makes Sarvam STT + Sarvam 105B + Chirp 3 HD the default for new tenants, prices 1 credit = 1 default minute (Sarvam 1x, Gemini Live 3.1 6x, 2.5 2x) and sets Growth 750 / Scale 1,750 credits at unchanged prices. Waiting for the owner to confirm prices before merging.

### Claude — 2026-10-12 — Voices: row click plays/pauses, header untouched, realtime voices listenable

Branch `claude/voices-row-play`. Owner requests:
- **Row click plays and pauses.** Clicking a voice row plays it; clicking again pauses, and again resumes. `useVoicePreview` takes `{ pausable }` and only the Voices page uses it; `VoicePreviewButton` elsewhere still stops.
- **Fixed a live bug:** clicking a different row while one was playing only selected it and played nothing, because `toggle` read the previous voice's stale `state`. It now decides from the audio element.
- **Header:** the Hindi/English preview switch moved out of the page header into the body row, next to "Only added voices…". The header now matches other pages.
- **Realtime tab (owner-only)** lists all 30 Gemini Live voices: gender, Google's style word, and the HD voice that maps to each one (`agent/main.py` `_gemini_live_voice`: persona of the agent's HD voice). Previews play the Gemini 3.8 Flash-Lite TTS version (`google38:<persona>`, owner-only preview). The spotlight says a live call can sound slightly different, and its button adds the mapped HD voice to the picker.

Verified in the local app with a mock API (real catalog, owner session): play, pause, resume, switching while playing, and pausing from the big button. On the Realtime tab: 30 voices, the Female/Male filters, the preview request goes to `voice=google38:achernar`, and Achernar maps to Myra HD. `npm run build` passes.
Not verified: real Gemini preview audio. How close Gemini TTS sounds to the Live model is unmeasured.

### Claude — 2026-10-12 — Realtime voice picking on agents, now-playing bar, 3.8 vs Live labels

Branch `claude/voices-now-playing`.

**Agent editor (`AgentDetail.tsx`), realtime models:**
- Owner report: "can't select the voice in realtime". On the live agent 4, choosing a voice did work, but the dropdown listed only the realtime-capable voices already in the account's picker (5 of them).
- The dropdown now lists all 30 Gemini Live voices, labelled `Aoede · Female · Breezy (Kiara HD)`. Data comes from `/voices/catalog`, fetched for the platform owner only; the server accepts any catalog voice on an agent, per `_guard_voice_tier`.
- The account's other voices are shown but disabled under "Not available on realtime" (owner request).
- A voice outside the picker shows its catalog name, not the raw value.

**Voices page:**
- A sticky now-playing bar sits under the dashboard header while the spotlight's voice name is out of view: name, gender, progress, waveform, play/pause, and View.
- The spotlight now sticks below the measured header height; it used to slide under it.
- Tab renamed "Gemini 3.8 TTS", with the note "text-to-speech for normal agents · not the realtime Live models". The Realtime tab is now "Realtime Live", noting that each voice works on Live 2.5 and 3.1 (same `_gemini_live_voice` mapping for both models).
- The realtime spotlight gives three setup steps and an "Open agents" link.

**Verified:** in the local app with a mock API (real catalog, owner session):
- 30-voice optgroup plus the disabled group;
- picking Puck, which is outside the picker;
- a normal model brings back the usual list;
- the now-playing bar appears after scrolling at 1500×620;
- the tab labels.

`npm run build` passes. On production I only inspected agent 4's dropdown; nothing was saved there.

### Claude — 2026-10-12 — help videos embedded (branch claude/help-videos)

Changed: 8 new how-to videos (Riya / ElevenLabs Eleven v4 narration, captions burnt in) added as `web-demo/public/media/help/<slug>.mp4` (1080p, 4.3–6.4 MB each, 47 MB total) + `.jpg` posters (33–85 KB). New `lib/helpVideos.ts` (video list + route map) and `components/HelpVideo.tsx` (poster-only until play; "Watch how" header button opening a dialog). `HelpArticle.video` field; videos shown above 9 articles (public /help and in-app Support). New articles `build-with-ai` (Agents) and `copilot` (Help & Support), written from the real screens. `DashboardLayout` PageHeader shows "Watch how" on /dashboard, /agents, /agents/new, /testing, /knowledge, /numbers, /inbound, /website-widget, /support.

Verified: help tests 38 passed; production build incl. icon check, prerender and SEO audit (115 routes) passes; headless Chrome on the built site: article page requests no help MP4 before click (only the existing site-wide agent-orb.mp4), plays the 1920x1080 file after click, no horizontal overflow at 390 px. Not verified: the dashboard "Watch how" button in a logged-in browser (needs an account); Safari/real phones.

Masters (4K) and the pipeline live outside git in `marketing-video/help/` (untracked). Known follow-ups: Integrations page still lists WhatsApp/Facebook Lead Ads as "Coming soon"; help articles for create-and-edit-agent, testing-lab, get-started describe some UI that has moved.

### Claude — 2026-10-12 — Integrations: WhatsApp and Facebook Lead Ads cards removed

Branch `claude/integrations-hide-wa-fb` (owner request). `Integrations.tsx` no longer shows the Facebook Lead Ads and WhatsApp cards unless the account already has one connected (then it stays a normal Manage card so it can be disconnected). The "Coming soon" card branch is gone. Help article `connect-integrations` drops the coming-soon paragraph; help bot context says the cards are not shown. Server guard on new connections (f6eb4853) unchanged.

Verified: help + integration tests 46 passed; build incl. SEO audit; local real-page capture: default account shows 5 cards (no WhatsApp/Facebook, no "Coming soon"), an account with WhatsApp connected shows it as Connected/Manage with Facebook still hidden, no overflow at 390 px.

### Claude — 2026-10-12 — Live voices lead with the Indian name

Branch `claude/live-indian-names`. Owner request.
- **Voices page, Live tabs:** each row's title is now the HD voice's Indian name without " HD" (Myra). Google's voice name and style are the detail ("Female · Achernar · Soft voice"). The list is sorted by the Indian name.
- **Spotlight:** the subtitle reads "Gemini voice Achernar", and the steps end "Calls then speak with Google's Achernar voice".
- **Agent editor, realtime voice dropdown:** "Myra HD · Female · Soft (Gemini Achernar)", sorted the same way.

Verified in the local app (mock API, owner). `npm run build` passes.

### Claude — 2026-10-13 — Realtime voice dropdown: only voices the account added

Branch `claude/realtime-added-only`. Owner correction to PR #67: with a realtime model, the agent's voice dropdown now lists only the account's added voices that a Live model can use, under "Your voices for <model>". Non-realtime added voices stay disabled, and an empty state points to the Voices page. The catalog is still fetched, but only for the style words.

Verified in the local app: the mock account has Myra HD, Sana HD, Vivaan HD and Aditya added. The dropdown shows the three HD voices, with Aditya disabled. `npm run build` passes.

### Claude — 2026-10-13 — docs site: videos, Agni-style layout, internal notes unpublished

Branch `claude/docs-videos`. **Security fix:** Mintlify was publishing every `.md` in `docs/` — e.g. docs.vistrowvoice.com/AGENT-MESSAGE-BOX, /STAGING and /ADMIN-P0-API-CONTRACT-2026-10-11 returned 200. New `docs/.mintignore` (`*.md`) removes them; all public pages are `.mdx`. No secrets found in the exposed files (scanned for keys, DB URLs, passwords), but they describe internal infrastructure. **Keep internal notes as `.md`**, never `.mdx`, in `docs/`.

Docs changes: `snippets/help-video.mdx` (video streamed from www.vistrowvoice.com/media/help, preload none + poster); video on index, quickstart, agents, knowledge-base, website-widget, phone-numbers; new pages platform/build-with-ai, testing-lab, copilot; Demo + Website sidebar anchors; Copy page / ChatGPT / Claude contextual menu.

Verified locally with `mint dev` + headless Chrome: internal notes 404, new pages 200, no MP4 fetched before play, video plays at 1920 wide, no overflow at 390 px; `mint broken-links` clean.

### Claude — 2026-10-13 — LLM token fixes from the 12 Oct audit

Branch `claude/llm-token-fixes` (PR linked on issue #2). Each audit finding was rechecked against the current main code first.
- `server/llm_warmer.py`: `sarvam/*` agents are no longer warmed. Before this, their model name was posted to api.openai.com and every ping failed (every 4 min). The skip list is now `gemini`, `groq/`, `sarvam/`.
- `agent/main.py` `_build_tools`: tenant agents no longer get `capture_platform_lead`. Both platform demos (plain and industry role-play) keep it. The lead-capture prompt bullet for that tool is now added only for `is_platform_demo`.
- `agent/tools.py`: the `log_lead` and `switch_reply_language` docstrings are shorter. Only the incident narrative was removed (it moved to code comments); every instruction, parameter name and type is unchanged. Tenant tool schemas, measured with livekit 1.8.3 `build_legacy_openai_schema`: 11,304 -> 9,425 chars per LLM request.
- Token instrumentation: `latency_metrics.llmUsage` = {requests, cancelledRequests, promptTokens, cachedTokens, completionTokens}. Cancelled LLM requests are now counted, and the `llm` diagnostic gains `completionTokens`. New columns `calls.llm_requests/llm_prompt_tokens/llm_cached_tokens/llm_completion_tokens` come from `server/calls_db.py` (ADD COLUMN IF NOT EXISTS). The agent writes them with a separate best-effort UPDATE (`agent/db.py set_call_llm_usage`) after the call row, so deploy order cannot lose a call row. Realtime (Gemini Live) token counts are NOT included.
- New `docs/SARVAM-CACHING-SUPPORT-REQUEST.md` (draft email to Sarvam). `docs/LLM-TOKEN-AUDIT-2026-10-12.md` has been copied into the repo.
- Deliberately NOT done: duplicate platform-instruction removal and prompt halving (these need an A/B test and owner approval), and dropping calendar tools when no calendar is set up.

Verified: agent suite in a livekit-agents 1.8.3 venv: 709 passed, 16 skipped. Server suite (server/.venv): 532 passed, 88 skipped (DB-backed tests skipped without TEST_DATABASE_URL). The new warmer test fails against the old filter.
Unverified: live calls. Nothing deployed. Needed after merge: Railway (server migration plus warmer), then `lk agent deploy` for BOTH CA_53d8HgBktjZ7 and CA_TGdpVhSdxDyS. Next step: after deploy, check that a new Sarvam call row has `llm_prompt_tokens` filled in.

### Claude — 2026-10-13 — docs site: YouTube videos + last week's features

Branch `claude/docs-youtube-features` (local commit, not pushed; owner reviews and merges). Docs only, no runtime code.
- `docs/snippets/help-video.mdx`: `HelpVideo` now takes `id` and embeds a lazy, 16:9 youtube-nocookie iframe (8 public uploads on the "Vistrow Voice" channel) instead of the self-hosted MP4.
- Fixed facts, each rechecked in code: billing (1 credit = 1 min on the default stack on every channel; plans from `agent/plan_policy.py` PLANS; 30 free dashboard test minutes, Testing Lab billed — `server/calls_db.py` FREE_TEST_MINUTES); agents (5 tabs, Vistrow Bharat only, Agent ID chip, wrap-up before max duration — `agent/call_limit.py`; demo-agent section removed); integrations (cards, detail-page tabs, Sheets, Growth gate in `server/token_api.py`); API keys (Settings → Developer, Read/Calls/Agents/Full, Scale + admin); API agent defaults and `publicId`; phone providers (EnableX only); quickstart/index.
- New pages: platform/voices, usage, settings, instant-lead-follow-up; nav regrouped Build / Deploy / Monitor / Workspace.
- Left out on purpose: owner-only Gemini voices, top-up/cancel, storage GB, Premium voice tier (no tenant-visible Premium voice exists).

Verified: `mint broken-links` clean; `mint dev` 200 on every changed/new page, /AGENT-MESSAGE-BOX 404; headless Chrome shows the youtube-nocookie iframe for 4xmXVnsolaI on the welcome page.
Not verified: live docs.vistrowvoice.com (not deployed). Next step: owner review, push, merge.

### Claude — 2026-10-13 — docs site: real dashboard screenshots

Branch `claude/docs-screenshots` (local commit, not pushed; owner reviews and merges). Docs only, no runtime code.
- 12 WebP screenshots in `docs/images/screens/` (21–199 KB each), captured from the real dashboard on localhost only: the real server against a throwaway local Postgres DB with a fictional clinic workspace on the Scale plan, provider keys stripped, browser limited to localhost and Google Fonts. The DB was dropped and the session cookie deleted afterwards.
- Added with `<Frame>` captions to platform/calls, usage, voices, integrations, instant-lead-follow-up, settings (new short "Plan & billing" section), compliance, billing, and essentials/authentication.
- Text fixed to match the UI: calls (Details / Other calls tabs, Analyze becomes Re-analyze), integrations (ArthaLeads asks for an API token), compliance (DNC: Block one number or Bulk import numbers), settings (opens on Workspace details).
- No WhatsApp/Facebook in frame. API key, Instant Lead token and webhook URL are masked. The Instant Lead URL shows `https://app.vistrowvoice.com/api/...` because the local server's PUBLIC_BASE_URL was set to that display string.

Verified: `mint broken-links` clean; `mint dev` 200 on all 9 pages, every image naturalWidth > 0; /AGENT-MESSAGE-BOX 404.
Not verified: live docs.vistrowvoice.com (not deployed). Next step: owner review, push, merge.

### Claude — 2026-10-13 — recording link expiry/revoke + retention purge of call-derived data

Branch `claude/recording-links-retention` (PR open, NOT merged). Privacy audit gaps 2-3. Findings first: `docs/RECORDING-LINKS-AND-RETENTION-FINDINGS-2026-10-13.md` (file:line + read-only prod counts: 278 calls with a share token, 237 still playable; 2 of 7 accounts record; 0 have retention set).
- Server only (`server/calls_db.py`, `server/token_api.py`), no agent/ change. New column `calls.recording_link_no_expiry` (existing tokens grandfathered once, at column creation). Compliance setting `recording_link_expiry_days` (0/7/30/90, default 90) read at request time in `get_shared_call_recording_key`, which also now requires the account row to exist.
- `POST /storage/recordings/revoke-links` (admin+, audited, blocked in View as). Public `/public/calls/*`: private/no-store, X-Robots-Tag noindex, Referrer-Policy no-referrer, 120 req/min/IP.
- Retention purge batched (500), deletes B2 audio before the row (row kept for retry if audio delete fails), plus caller_memory not refreshed within the window and integration_deliveries of purged calls/older than the window. Contacts/appointments/tickets untouched (no transcript/recording fields).
- Dashboard Compliance card: expiry select + Revoke links. Privacy (date 13 Oct) and Security copy, docs/platform/compliance.mdx updated.

Verified: new `server/test_recording_links_retention.py` (17 tests, 9 Postgres-backed) + related suites against a throwaway local Postgres (Postgres.app, TCP 54329); full server suite 643 passed, 1 failure unrelated to this diff (`test_topup_flow` pack 500 expects 5900 while the quote is 5056.3; fails the same on a fresh DB; touches no changed code). ASGI end-to-end on the local DB: fresh link 307, 120-day new-style 404, grandfathered 500-day 307, after revoke 404, 121st request/min 429. web-demo build + test:seo pass.
Not verified: dashboard UI in a browser; B2 bucket version lifecycle (a hidden-not-deleted object is possible). Deploy needed after merge: Railway (server) + Vercel (web). No LiveKit deploy.

### Claude — 2026-10-13 — 12 Oct pricing reverted (300 / 1,000 / 2,500; Bharat 2 credits a minute)

Branch `claude/revert-oct12-pricing` (PR open, NOT merged). Owner decision 2026-10-13: reverse the credit and minute changes from ea922f86 and 6b68c160.
- Plans: Starter 300, Growth 1,000, Scale 2,500 credits (were 350 / 850 / 2,000). Prices unchanged. Top-up rate is price/credits again: Starter ₹10.00, Growth ₹6.00, Scale ₹5.20 per credit.
- `calls_db.model_tier`: `sarvam/*` is `premium` (2×) again, with the original comment. gpt-4.1-mini was never changed (still premium). Kept: Gemini Live tiers (3.1/3.8 `realtime_plus` 6×, 2.5 2×), Chirp 3 HD default voice, Swift retired from the picker.
- `agent/plan_policy.py`: credits restored. `COST_PER_DEFAULT_MINUTE_INR` stays at 3.24; the margin test now multiplies by the real credits per default minute (2.0, from `calls_db._credits_per_minute`).
- Copy: plans.ts, Pricing FAQ (2 credits wording, Bharat only), help_articles (+ regenerated helpArticles.ts), help_content, docs/platform billing/usage/voices.
- Tests: full server suite 648 passed vs local Postgres (pgserver, nothing skipped). Agent suite in a livekit-agents 1.8.3 venv: 714 passed, 15 skipped. web-demo build + test:seo pass; the built /pricing shows 300/1,000/2,500 and "uses 2 credits".
- Production, read-only: 0 credits_total at 350/850/2,000/750/1,750; 0 subscriptions started; 0 trials since 19:00 IST 12 Oct (trial grant is 10, not plan-based); 0 invoices since then. 46 Sarvam calls (21.6 min) since then, all on internal accounts 1 and 2. Usage is computed when it is read, so after deploy those minutes count 2× again.
- Open: `docs/images/screens/billing.webp` (used in billing.mdx and settings.mdx) still shows 350/850/2,000 cards and needs a new screenshot. PR #82 is obsolete. `agent/db._trial_credits_exhausted` has its own model-tier map with no `sarvam/` rule, so it counts Bharat at 1×. That was already true before 12 Oct and is not changed here.
- Deploy after merge: Railway + Vercel + `lk agent deploy` for both CA_53d8HgBktjZ7 and CA_TGdpVhSdxDyS (agent/plan_policy.py changed). Run `graphify update .` on main after merge.
### Claude — 2026-10-13 11:05 UTC — LiveKit 1.8.3 → 1.8.6 (Sarvam v4 settings via the official plugin)

Branch `claude/livekit-186`, PR #83. `agent/requirements.txt` pins all four livekit packages at 1.8.6 (latest on PyPI). `agent/main.py` adds `_sarvam_v4_tts()` (falls back to the same-gender default speaker and logs a platform error if the plugin rejects a v4 id; temperature clamped to 1.0). `voice_catalog.py` (agent+server identical) drops `aravind_ta_ads`/`aravind_ta_suspense`, which the 1.8.6 plugin rejects. New `agent/test_sarvam_v4_plugin.py`.
Verified: 715 agent + 549 server tests on a 1.8.6 venv; upstream diff 1.8.3→1.8.6 leaves `google/tts.py`, `_provider_format.py` and the two AgentActivity methods patched by `backchannel_patch.py` byte-identical. Phone worker `CA_TGdpVhSdxDyS` = version `542BoqkR8KtB` (startup log "starting worker 1.8.6"); platform-demo `CA_53d8HgBktjZ7` = `zuWw54t2Mr8v`. Three real pipeline calls on the phone worker (calls 1240–1242: Sarvam 105B with `ritu`, `sarvam4:ritu_hi_customer`, `google:chirp3:Achernar`): no failures, turn 654–798 ms, TTS first byte 158–199 ms; worker log shows `model=bulbul:v4-flash`, user-agent `Livekit/1.8.6`, zero `Unknown model` warnings (1.8.3 logged four per call). No temp agents left.
Not a regression: `publisher data channel ... closed unexpectedly` at probe teardown existed on 1.8.3 (12 Oct logs); `failed to upload the session report` is LiveKit's open Agent Insights incident. Hypothesis only: the two hung deploy uploads were caused by the agent being stuck in "Building/DEPLOYING" on LiveKit's side; `lk agent restart` (owner-approved) cleared it.
Rollback: `lk agent rollback` to `52Dix3Auq3mw` (phone) / `GpdMwt7qBjks` (platform-demo). Remaining: merge PR #83 (Railway redeploys the server; no server code changed), 1.8.6 deprecation warnings (`metrics_collected`, `RoomInputOptions`) are a follow-up cleanup.

### Claude — 2026-10-13 11:40 UTC — Sarvam v4 voices bill standard (1x)

PR #85 merged (main af2f2568), owner decision. `sarvam4:` moved from `_PREMIUM_VOICE_PREFIXES` to `_STANDARD_VOICE_PREFIXES` in `server/calls_db.py`; `voice_catalog._sarvam_v4_entry` tier "standard" (agent + server identical); tests and the Voices page "Sarvam v4" tab (1x) updated. Verified: 549 server + 715 agent tests, tsc clean. Cost basis: ~₹0.37 per call minute (₹1.00/1K chars × ~373 chars/min). No LiveKit deploy needed (billing is server-side; the agent catalog copy only changes the tier label).
Audit of Sarvam v4 usage against docs.sarvam.ai (reference + v4 best-practices + LiveKit production guide): production sends speaker persona, language, pace, temperature (clamped ≤1.0) and the plugin's default buffering (min_buffer 50, mp3 @ 22050). Sarvam's LiveKit guide recommends min_buffer 30, linear16 @ 24000 (WebRTC) / mulaw @ 8000 (phone); those exact values exist as `sarvam_lab_options` in `agent/main.py` but apply only to the latency-lab pipeline profile. Pronunciation dictionaries (`dict_id`, brand/place names, 10 per account × 100 words) are unused. Pitch/loudness are sent by the plugin but documented as unsupported on v4 (ignored). No SSML/emotion tags exist for v4; style lives in the persona id.

### Claude — 2026-10-13 — Sarvam streaming recipe for all Sarvam voices + Chirp 3 HD pause markup

Branch `claude/sarvam-stream-chirp-markup` (owner request). `agent/main.py _build_tts`: the latency-lab Sarvam recipe (min_buffer_size 30, max_chunk_length 150, linear16, 8 kHz phone / 24 kHz web — Sarvam's own LiveKit production guide) now applies to every Sarvam TTS, primary and the Google-path safety net (`sarvam_stream_options`); 1.8.6 plugin constructs bulbul:v4-flash with linear16 at both rates (checked offline). Chirp 3 HD branch gets `use_markup=True`; `google_tts_streaming_patch.chirp_markup()` rewrites `<expr type="break"/>` to "[pause long]" and strips other tags before the markup field; Chirp agents get a one-paragraph prompt section allowing a single break marker per reply. New `agent/test_chirp_markup.py`.
Measured on Google (production creds, hi-IN-Chirp3-HD-Achernar, 3 runs per case, longest interior silence): plain 0.44 s; markup "[pause long]" 0.70 s median / 1.06 s max and about +1 s audio; "[pause short]" and "[pause]" no change; "[Name]" in markup not spoken (same length); the same tag in the `text` field is read aloud (+0.4 s). Hypothesis, not yet measured: linear16 + 30-char buffer lowers Sarvam first-audio on real calls; verify from `ttsTtfbMs` after deploy.
Correction (same day, later): the Chirp markup wiring was REVERTED before merge. On worker version 25dBtLmxteMN (use_markup=True) 3 of 5 real Chirp calls (1245, 1246, 1248) had a 2.6–3.2 s TTS first byte on one segment, on already-warm processes; the 37 Chirp calls before that deploy had none over 1 s. A direct 5-run streaming probe against Cloud TTS (text vs markup field, chunked like the worker) showed no difference (0.16–0.19 s), so the stall is in the worker's markup path, cause not found. Shipped state: Chirp keeps the `text` field, no LLM break marker; `chirp_markup()` and its unit tests stay for a measured retry. The Sarvam streaming recipe stays (calls 1243/1244: turn 573–706 ms, TTS first byte 154–196 ms, no failures).

### Claude — 2026-10-13 — Google TTS warm-up: file lock instead of a random stagger

Branch `claude/tts-prewarm-lock` (owner request). `agent/main.py`: `_run_google_tts_prewarm` keeps the 10 s init delay (the 2026-09 init-window kills) but drops the random 0–20 s stagger; processes now serialize their warm-ups through `_tts_prewarm_serialized()`, an advisory flock on `/tmp/vistrow-tts-prewarm.lock` (override `TTS_PREWARM_LOCK_PATH`), so Google still sees one warm-up at a time and each process warms the moment the previous one finishes. Logged as "client warmed (pid=…, lock wait Ns)". New `agent/test_tts_prewarm_lock.py` (serialization, release on exception, no stagger). Verified: 727 agent tests. Evidence before: every process took 23–26 s from "warm-up started" to "client warmed" (about 2 s of real work). Expected after: 10–16 s for four processes at a deploy, 10–12 s for a single replacement process; verify from the worker log.

### Claude — 2026-10-14 — LiveKit 1.8.6 deprecation cleanup + casual tone temperature

Branch `claude/deprecations-casual-temp` (owner request). `agent/main.py`: `session.start` uses `room_options=RoomOptions(audio_input=AudioInputOptions(noise_cancellation=…))` instead of the deprecated `RoomInputOptions`; every resolved option was compared with 1.8.6's own legacy converter and is identical. `metrics_collected` is KEPT deliberately: its replacements lose per-segment TTS TTFB, provider/model, cached tokens and cancelled-request usage. Only its once-per-call deprecation log line is dropped (`_MetricsDeprecationFilter` on the `livekit.agents` logger); a test fails if LiveKit stops emitting the event. `TONE_PRESETS["casual"]["temperature"]` 0.85 → 0.7 (Sarvam guide: ≥0.8 may mispronounce). New `agent/test_livekit_deprecations.py`. Verified: 733 agent tests on 1.8.6.

### Claude — 2026-10-14 — casual tone: neutral pace/pitch (first-audio delay); v4 does honour pitch/loudness

Branch `claude/casual-tone-latency` (owner request). Measured bulbul:v4-flash over the plugin's WebSocket path (/ws/v2, config → text chunks → flush), same Hindi greeting, 5–6 interleaved runs per case, from the Railway container: baseline 615 ms first audio; pace 0.95 → 731, pace 1.08 → 734, pitch ±0.05..0.4 → 735–737, loudness 0.5/1.1/2.0 → 625–635, temperature 0.3/1.0 → 622–626. Effects are real: pitch +0.4 → F0 276 Hz vs 245, −0.4 → 205; loudness 2.0 → RMS ×1.9, 0.5 → ×0.49; pace 1.08 → 9% shorter audio. Temperature showed no measurable change in pitch variation. CORRECTION of my 2026-10-13 notes: v4 DOES apply pitch and loudness (Sarvam's API reference says it doesn't). Change: `TONE_PRESETS["casual"]` pace 1.08 → 1.0, pitch 0.05 → 0.0 (loudness 1.1 and temperature 0.7 kept). Professional's pace 0.95 has the same ~115 ms cost and is NOT changed here.

### Claude — 2026-10-14 — GPT-4 family retired; every OpenAI call on GPT-5.4

Branch `claude/retire-gpt4` (owner decision). Voice failover + website widget → gpt-5.4-nano; KB extraction → gpt-5.4-nano; call summaries, agent post-call extraction, agent-builder fallback → gpt-5.4-mini; all with `reasoning_effort: "none"`. Agents still saved with a GPT-4 name keep the stored value (billing tiers, labels) but run on `plan_policy.OPENAI_MODEL_SUCCESSORS`; no agent rows edited (only account 1 had two gpt-4.1-mini agents). Agents with no model now fall back to Vistrow Bharat. Copilot (gpt-5-nano) untouched.
Verified against the API (not just docs): GPT-5.4 rejects `max_tokens` (use `max_completion_tokens`), rejects limits of 1–2 tokens with 400 "could not finish the message" (health check and cache warmer moved to 16 — they would have failed silently), accepts and honours `temperature` only with reasoning `none`; JSON mode, streaming, prompt_cache_key work. Model pages: nano/mini default reasoning `none`, 400K context.
Evidence: India benchmark (14K-token prompt): 5.4-nano 9/9 + correct tool call ~670 ms, 4o-mini 6/9. KB extraction 21 pairs/14 projects vs 4.1-mini 10/7, no invented prices. Call summaries: GPT-5 outcome labels differ from 4.1-mini on 5/5 owner calls, QA ~12 lower; neither consistently right — dashboards shift from this date. Real calls on a fresh deploy (vRpJQRdVTNKv): alias call 1290 and failover call 1291 answered by gpt-5.4-nano, control 1292 Sarvam; saves 4–5 s after hang-up. OPEN: calls 1282–1284, placed within ~3 min of the first deploy of this build, saved 33–36 s after hang-up; not reproduced after warm-up; not tested whether the old build behaves the same right after a deploy. Version rollback (`lk agent rollback`) reported the new version Running while calls were still answered by the old code — use a fresh deploy for A/B tests and check the call record's provider.


### Claude — 2026-10-14 — copilot model: gpt-5-nano → gpt-5.4-mini (PR open, NOT merged/deployed)

Branch `claude/copilot-model`. `server/help_chat.py`: CHAT_MODEL `gpt-5.4-mini`, every OpenAI request sends `reasoning_effort: "none"` (`_MODEL_PARAMS`); `_sarvam_body` drops `reasoning_effort` so the Sarvam fallback is unchanged. Tests updated (model/params; Sarvam body has no reasoning_effort — checked that the assertion fails without the pop). Server suite: 560 passed, 97 skipped (Postgres-backed).
Evidence (verified): real `answer_help_question` path on the production container, account 2 only, `copilot.propose`'s DB write stubbed and confirm disabled (no copilot_actions rows, nothing executed). 14 tasks (data reads, how-to, 2-round lookups, Hindi/Hinglish, 4 write requests) × 4 runs per model, ground truth recomputed per task. Correct / writes OK / median latency / ₹ per 100 msgs: gpt-5-nano (deployed, default reasoning, ~1,900 reasoning tokens/msg) 43/56, 7/16, 12.5 s (p90 22 s, max 58 s), ₹8.5; gpt-5-nano minimal 38/56, 11/16, 1.9 s, ₹1.3; gpt-5.4-nano 47/56, 15/16, 1.9 s, ₹4.8; gpt-5.4-mini 50/56, 16/16, 2.0 s, ₹19.3; gpt-5-mini minimal 48/56, 13/16, 2.3 s, ₹7.2. gpt-5-nano's main failure: replies "ready to confirm on the card below" without calling the action tool (9/16 writes) — the user sees no card. gpt-5.4-nano answered "kal kitni calls aayi thi?" with the all-time total or today's count in 4/4 runs.
Found, NOT fixed here (affects every model): `_tool_result_content` uses `json.dumps` with ensure_ascii, so Hindi transcripts reach the model as `\uXXXX` escapes (double-escaped when the 4,000-char cap truncates; Devanagari also eats the cap 6× faster). On "what did the last caller want?" gpt-5.4-nano and gpt-5-nano-minimal invented the topic ("offer/discount", "price"); with `ensure_ascii=False` all three models tested got 3/3. No model answers "this week" — there is no date-range tool; the better models say so, gpt-5-nano-minimal and gpt-5-mini present the all-time total as "this week".
Caveat: account 2 had concurrent test traffic (probe calls, new "Combo test (temp)" agents 155/160/164) during the run; scoring used per-task truth. Not verified: dashboard UI with the new model. Next: owner review + merge PR; Railway deploy only (no LiveKit deploy).

### Claude — 2026-10-14 — SEO P6: /voice-ai-platform, /ai-call-center, /voice-bot (PR open, NOT merged)

Branch `claude/seo-p6-platform-callcenter` (owner request; claim on issue #2). Three new indexable landing pages: `web-demo/src/pages/marketing/VoiceAiPlatform.tsx`, `AiCallCenter.tsx`, `VoiceBot.tsx`, each with FAQPage JSON-LD. Registered in `seoPages.ts` (appended at the END of SEO_PAGES, kind product, reusing existing OG images product / product-inbound / product-agents), routes in `App.tsx` before the `/:slug` catch-all, Product nav group + footer Product column (`marketingContent.ts`), `SeoRelatedLinks.tsx` CORE_LINKS (new keys + `/voice-bot` appended to `/ai-voice-bot-pricing-india`), buyer-guide hub related links (`seoExpansionContent.ts`). All edits additive; did NOT touch `/ai-ivr` or `/ai-receptionist` (p5 branch) - expect small adjacent-line conflicts in seoPages.ts / SeoRelatedLinks.tsx / seoExpansionContent.ts when both merge.
Facts checked in repo: transfer is phone-only (`agent/tools.py transfer_call` refuses web calls and offers a callback; bridges the colleague in); DNC + calling window on every outbound dial, spoken consent, recording toggle, retention days, per-route schedule/concurrency, roles Owner/Admin/Member/Viewer (help articles); integrations Zoho CRM, ArthaLeads, Slack, Google Sheets, webhook (Zapier/Make/n8n), Instant Lead Follow-up; custom functions (AgentDetail form fields). No prices/credits, no stats, no customers.
Verified: `npm run build` (SEO route audit: 118 indexable routes pass), `npm run test:seo`, `check-blog-seo.ts`; sitemap contains all 3; prerendered pages at 375 px have no horizontal page scroll. Not verified: live deploy, Search Console indexing; `graphify update` not run (no graphify-out in this worktree). Next: owner review + merge (Vercel deploy), then request indexing for the 3 URLs.
### Claude — 2026-10-14 — SEO batch 5: /ai-receptionist + IVR article cluster (PR open, NOT merged)

Branch `claude/seo-p5-receptionist-ivr` (owner request; Keyword Planner India: ivr / interactive voice response 10K–100K, ai receptionist 1K–10K, ivr in banking / ivr service provider 100–1K). web-demo only; no server/agent/runtime code.
- New `/ai-receptionist` (`web-demo/src/pages/marketing/AiReceptionist.tsx`, registered in `seoPages.ts` with its own OG card `public/og/ai-receptionist.png`, route in `App.tsx`, sitemap via prerender). Title/H1 "AI Receptionist for Indian Businesses". Phone + website channels, a labelled sample day and sample Hinglish booking, handles vs hands-over (transfer phone-only), Appointments calendar, after-hours (blank call window), 11 languages, records + Zoho/ArthaLeads/Slack/Sheets/webhook, industries, 7 FAQs (FAQPage). Linked from nav + footer Resources, `/product/inbound` (Who it is for + Explore related), `/ai-ivr`, and Explore related on /solutions/healthcare, real-estate, support, finance.
- 4 blog posts in new `web-demo/src/content/ivrBlogPosts.ts` (merged into `VOICE_BLOG_POSTS`, category "IVR & phone systems", published 2026-10-14): what-is-ivr-interactive-voice-response, ivr-vs-ai-voice-agent-india, ivr-in-banking-and-finance, how-to-choose-an-ivr-service-provider-india. Each links /ai-ivr, /vs-ivr and the other three. Covers are 16:9 crops of existing AI-generated blog illustrations (caption still accurate). `check-blog-seo.ts` now expects 14 posts.
- `/ai-ivr` strengthened (title/H1 unchanged): "IVR system, cloud IVR, IVR call" section, IVR guides list linking the 4 posts + /ai-receptionist, 2 new FAQs.
Facts checked in repo: transfer refuses web calls (`agent/tools.py` transfer_call), 11 languages (`agent/language.py`), Appointments/Scheduling, route call window blank = answer at any time, integrations list, custom functions (AgentDetail), strict mode, consent/retention, calling window/DNC (help articles).
Verified: `npm --prefix web-demo run build` (SEO route audit: 120 indexable routes pass), `npm run test:seo`, `npx tsx scripts/check-blog-seo.ts` (14 articles), oxlint (no new warnings). Built pages checked at 375 px: no horizontal scroll, one H1. Not done: `graphify update .` (graphify-out is not tracked; run on main after merge). After merge: Vercel deploy only, then request indexing for the 5 new URLs.

### Claude — 2026-10-14 — privacy gaps 2: recording/AI announcement, error_events purge, age gate, cookie banner, widget dataLayer (PR open, NOT merged)

Branch `claude/privacy-gaps-2`, PR #109 (owner request; claim on issue #2). Hotfix for the html-shadow 500s split out as PR #108. Each gap re-verified in main 43881e6f first.
- Announcement: new `agent/call_disclosure.py`; compliance keys `announce_recording` (default true, so existing accounts get it) and `recording_notice` (custom wording, max 160). Spoken only while `record_calls` is on; folded into the existing opener text (welcome message, default openers, realtime/outbound instructions, first reply when the caller speaks first); skipped when the welcome message already mentions recording, and for the platform demo. No TTS/pipeline change. Compliance page toggle + wording field.
- Widget: `/widget/site-config` returns `recorded`; notice/consent say "recorded" only when true ("may be recorded" until known). `vistrow_widget_lead_submit` keeps its name but carries only has_name/has_phone/has_email booleans.
- error_events: `calls_db.purge_old_error_events` (90 days, batches of 5,000, idempotent) from the daily retention run; account rows also follow a shorter account retention. `phone_format.redact_contact_details` masks phones/emails in `admin_db.log_error` and agent `db.log_platform_error`.
- Signup: `accepted_terms` + `confirmed_age` required server-side; consent recorded at signup with IP, user agent, source, age_confirmed_at (new `accounts` columns). `/onboarding/consent` (Google/GitHub sign-ups) requires `ageConfirmed` too.
- FOUND + FIXED: since 8209cb4e (12 Oct) seven routes in token_api.py assign a local `html = render_email(...)` and also call `html.escape` -> UnboundLocalError (500) on password signup, resend code, password reset, email change, team invite, admin reset and the contact form. Reproduced by running auth_signup's real body; Railway logs only reach back to the 12:28 deploy, so production impact is inferred from the code, not observed in logs. Same fix also on a separate small PR for a faster merge.
- Cookie banner: GA + Clarity load only after Accept (Consent Mode v2 defaults denied; ad_* stay denied); Vercel Analytics kept (cookieless). CSP report-only hash updated. Privacy page + help article updated.
Verified: server 675 passed (local pgserver), agent 760 passed / 15 skipped (1.8.6 venv from requirements.txt), web build + SEO audit, test:seo, new test:consent, widget tsc; banner checked in a browser at 375 px (Accept loads gtag once, reload keeps the choice). Not verified: a live phone call with the announcement; the widget on a real tenant page. Deploy after merge: Vercel FIRST (new web client sends the new fields; the old server ignores them), then Railway, then BOTH LiveKit workers (agent/ changed). graphify update not run (no graphify-out in the worktree).
2026-10-15: merged origin/main d5b0164b (new full-page onboarding, phone input, #108). Age checkbox now lives in pages/Onboarding.tsx (OnboardingModal is gone on main); signup keeps main's attribution + phone input. Then merged main again at cee0c67d (#105 tokens/MFA, #106, #113; only the message box conflicted). Re-verified after both merges: server 693 passed, agent 765 passed/15 skipped (venvs updated to the new requirements), web build + test:seo + test:consent.
### Claude — 2026-10-14 — MFA verified; integration tokens encrypted at rest (PR open, NOT merged)

Branch `claude/security-tokens-mfa`, commit ab00513d (privacy audit 2026-10-12 gap 5; claim on issue #2). Did not touch claude/privacy-gaps-2 areas.
- MFA (verified, no code change needed): TOTP two-step login from 8209cb4e is on main and deployed. `require_platform_owner` (server/token_api.py) gates all 37 `/admin` routes (checked by script; only `/admin/impersonate/exit` is ungated and it is session-bound): platform-owner workspace + role owner + `mfa_enabled_at` + a session that passed the code. Not enrolled -> 403 "turn it on in Settings" (dashboard still works; the UI shows a setup screen), so no lockout. Any user (tenant owners/admins included) can enable it in Settings -> Security (`TwoStepLoginCard`); 10 hashed one-time recovery codes, regenerate/disable need a code. Production read-only check: the platform owner (user 2) has two-step enabled (1 user overall). Added a test for the not-enrolled path. Gap: no self-service reset if both the authenticator and the recovery codes are lost (DB reset only).
- Encryption: `integration_crypto.py` (identical copies in server/, agent/, orchestrator/; a server test enforces it), Fernet, stored `enc:v1:<token>`, legacy JSON reads. All config_json reads/writes go through it: server/calls_db.py (list/update/settings/facebook lookup), agent/db.py (webhook URL, delivery list, Zoho token write-back), orchestrator/db.py (webhook URL, delivery list). Boot migration `calls_db.encrypt_legacy_integration_configs()` in token_api.py. `cryptography>=42` added to all three requirements (server already had it via PyJWT[crypto]).
- Production orchestrator Railway service is live (railway status: SUCCESS) and reads integrations, so it needs the key too.
Verified: server suite 670 passed (local pgserver Postgres, DATABASE_URL set in the same command); agent suite 746 passed / 15 skipped in a livekit-agents 1.8.6 venv from agent/requirements.txt; orchestrator test_server_routing 9 passed. Not verified: any deploy, real decryption on Railway/LiveKit (no key set anywhere yet).
Next (owner, in order): merge -> Railway Voice/orchestrator/staging deploy + `lk agent deploy` both workers -> set INTEGRATION_ENCRYPTION_KEY on all five readers (LiveKit via `lk agent update-secrets --secrets-file`, never `--overwrite`) -> then INTEGRATION_ENCRYPTION_WRITE=on -> check `left(config_json,7)` = `enc:v1:` and Send test on Sheets/Zoho/ArthaLeads.
### Claude — 2026-10-14 — SEO P7: OG images regenerated, /ai-telecaller, deeper Kannada/Telugu pages (PR open, NOT merged)

Branch `claude/seo-p7` (owner request; claim on issue #2). web-demo only; no server/agent/runtime code.
- OG images: the PNGs in `web-demo/public/og/` were stale against `OG_CARD_BY_IMAGE` (e.g. integrations still said WhatsApp). Fixed source strings in `seoPages.ts` (home and languages cards no longer say 99 languages; integrations/product-integrations list Zoho CRM, ArthaLeads, Slack, Sheets, Webhooks; outbound/inbound/security/pricing wording softened), narrowed the card text column 690→620 px in `scripts/generate-og-images.mjs` (long headlines overlapped the orb), and regenerated all 60 cards with `npm run generate:og`. New dedicated cards: voice-ai-platform, ai-call-center, voice-bot, ai-telecaller (those pages previously reused product/product-inbound/product-agents). All 60 viewed as contact sheets.
- New `/ai-telecaller` (`AiTelecaller.tsx`, FAQPage schema): ~1,190 body words + ~350 FAQ words. Linked from Product nav, footer, /product/outbound use cases, /ai-call-center and /voice-bot body copy, Explore related.
- `/languages/kannada` and `/languages/telugu` (titles/H1 unchanged): new `sampleLines` field rendered by LanguageDetail, extra local use cases, 3 more regional call cards each, call notes, 3 extra FAQs each, related links. Inbound links added from home language card, /languages intro, /solutions/real-estate regional block, LocalRealEstate template (every local page links its language page), /ai-receptionist.
Facts checked in repo: transfer phone-only (`agent/tools.py transfer_call`), callback requests land in Appointments + integrations (`request_callback`, `agent/db.py`), campaign max attempts / retry minutes / concurrency (`Outbound.tsx`, `server/campaign_dialer.py`), DNC + calling window per dial, Instant Lead Follow-up 15–30 s (help article).
Verified: `npm run build` (SEO route audit: 124 routes pass), `npm run test:seo`, `check-blog-seo.ts` (14 articles); sitemap includes /ai-telecaller; 11 changed pages at 375 px have no horizontal page scroll and one H1.
Open, not changed: home, /languages and several FAQs still say "99 languages" (Gemini voices/Live); owner should decide whether that claim stays. `graphify update .` not run (no graphify-out in worktree). Next: owner review + merge; Vercel deploy only.
### Claude — 2026-10-14 — Full-page onboarding before the dashboard, signup data in admin

Branch `claude/fullpage-onboarding`. The owner asked for a full-page onboarding that is required before platform access and collects as much as possible, like other SaaS brands.

**Customer side**
- New `/onboarding` page (`web-demo/src/pages/Onboarding.tsx`), four steps:
  1. About you: role, phone if missing, how you heard if a Google/GitHub sign-up.
  2. Business: company, website, industry, size, country.
  3. Goals: uses, channels, languages, calls/month, current solution, go-live timeline.
  4. Ready: test call with the default agent, summary, Terms consent.
- The draft is saved in localStorage, so a reload resumes where the customer left off.
- `RequireAuth` sends any user whose account is not onboarded to `/onboarding` (support sessions excepted). `OnboardingModal` is deleted.

**Data capture**
- First-touch attribution (`lib/attribution.ts`, captured in `main.tsx`): utm_*, gclid/fbclid/msclkid, external referrer, landing page.
- Sent with `/auth/signup` and again on `/onboarding/complete`, so Google sign-ups are covered.
- Server: `accounts.onboarding_profile` and `signup_attribution` (JSON text, `ADD COLUMN IF NOT EXISTS`). New `server/onboarding_profile.py` cleaning (whitelist + caps).
- `save_onboarding_profile` fills the owner's phone and `referral_source` only when empty. Attribution is first-touch only.

**Admin**
- New first tab "Signup & onboarding" on the account page: contact, sign-up method, how they heard, ad/referrer data, all answers.
- Accounts list gains Source and Industry columns. The "Onboarded" card, which actually showed the signup date, is relabelled "Signed up".

**Fixes along the way**
- `guessCountry` now uses the time zone first. Indian browsers set to en-US/en-GB had defaulted to US/GB: the old popup saved `country: GB` for a +91 customer in the local test.
- The signup Terms error no longer turns every field red.

**Verified**
- Local app with a mock API: dashboard redirects to `/onboarding`; validation; all 4 steps; the completion payload; landing on `/dashboard`; the admin tab; 375 px has no horizontal scroll.
- 5 server unit tests; `npm run build`.
- Read-only prod query: all 6 real accounts are already onboarded, so nobody is blocked. Only test account 8 "Staging QA" is not.

**Not verified:** against a real Postgres. Staging holds PR #72's unmerged build, so I did not overwrite it. The migration is the same ADD COLUMN IF NOT EXISTS pattern as the neighbouring lines.

### Claude — 2026-10-15 — Onboarding redesign (premium), required vs optional, no country question

Branch `claude/fullpage-onboarding` (PR #107), owner feedback:
- **Country:** no longer a question. Account country comes from the phone's calling code (step 1, or the code given at signup), else the time-zone guess.
- **Required now:** role; phone if missing; how you heard (OAuth sign-ups only); company; industry; team size; uses; languages; calls per month.
- **Optional:** website, plus a collapsed "A few more details (optional, skip if you like)" block with channels, current solution and timeline.
- **New design:**
  - top bar with logo, a 4-segment labelled progress bar and sign-out;
  - large icon cards for role, industry and uses; segmented controls for size and volume; pills for languages and referral;
  - a live "Your workspace" preview on the right that fills in as answers are given;
  - step fade-in; Enter to continue; only unanswered required questions turn red;
  - the step and answers survive a reload; two cards per row on phones.
- **Copy:** dropped claims the product doesn't do yet ("tailor your agent and its sample scripts").

Verified in the local app at 1440 px and 375 px (no horizontal scroll); `npm run build` passes.

### Claude — 2026-10-15 — Phone input: flags, searchable countries, digit limits; AI referral option

Branch `claude/fullpage-onboarding` (PR #107).

New `web-demo/src/components/PhoneInput.tsx`, used on signup and onboarding:
- **Picker:** emoji flag plus calling code, with a searchable list of every country.
  - Typing a letter on the closed picker opens it already filtered.
  - Name, ISO code, aliases (uk, usa, uae, ksa…) and dial digits all match; popular countries (IN, US, GB, AE…) rank first among equal matches.
  - Arrow keys and Enter work; Enter does not advance the onboarding step (`defaultPrevented` check).
  - The search clears whenever the picker closes.
- **Number field:** digits only, capped per country (IN/US/GB 10, AE/SA 9, SG/QA 8; others 6..15 minus code digits). `isValidPhone` also requires IN numbers to start 6–9.
- Onboarding stores `phoneCountry` (ISO) and sets the account country from it.

"How did you hear about us?" gains "AI assistant (ChatGPT, Gemini, Claude…)" on both pages; signup also gains "Google search".

Verified in the local app:
- "12345abc678…" becomes "9876543210"-style 10 digits;
- "u" lists US, UK, UAE first; "uk" → United Kingdom; "uae" and "971" → UAE;
- Enter picks a country without changing step;
- the signup field matches the other inputs;
- build passes.

Note: Windows shows the two-letter code instead of a flag emoji.

### Claude — 2026-10-15 — Sarvam native language: names, filter, listen in any language

Branch `claude/sarvam-native-languages`. The owner asked why voices say "(Hindi)" and how a customer can hear a voice in Tamil or another language.

Sarvam's v4 voice ids are `<name>_<lang>_<style>`. Per Sarvam, `<lang>` is the language each voice was tuned to sound native in; every voice still speaks all 11.

**Catalog** (`server/voice_catalog.py`, copied byte-identical to `agent/voice_catalog.py`; the agent reads only gender/tier/notes of Gemini voices, so no worker deploy is needed)
- v4 names drop "(Hindi)".
- New fields `native_lang`/`native_language`, exposed as `nativeLang`/`nativeLanguage`.
- note = "Native Hindi · Sarvam v4".
- 22 names now repeat across languages. They are told apart by the native tag and by the note in the agent picker.

**Samples**
- SAMPLE_TEXTS: every language now says the same sentence as the English line: mr and pa gendered; ta, te, kn, ml, gu, bn, od added or rewritten. Translations are mine; native-speaker review is pending.
- SAMPLE_TEXT_VERSION 3→4, which regenerates cached previews.
- Bug fixed: `voice_preview._SARVAM_LANG` only had hi/en, so a Tamil preview was sent to Sarvam/Chirp as hi-IN. It now has all 11 codes.
- `voice_catalog_for_account` returns sampleTexts for every language.

**Voices page**
- Rows read "Native Hindi · speaks 11 languages".
- Sarvam tab has a native-language filter (current split: Hindi 53, English 24, Hinglish 7, Gujarati/Marathi/Punjabi 3, Telugu 2, Bengali/Kannada 1; no Tamil, Malayalam or Odia natives).
- The spotlight has a "Listen in" row for Sarvam v4 and Chirp HD voices (not Gemini, whose quota is small). Clicking a language plays the same sentence in it; native is marked. The stats tile shows the native language.

**Verified**
- Local app, with a mock that calls the real `voice_preview.synthesize` (Sarvam key from .env): Aarti → Tamil returned real audio and showed the Tamil sentence highlighted.
- Server voice tests: 38 pass.
- `agent/test_sarvam_v4_plugin.py::test_a_rejected_id_falls_back_by_gender` fails with and without this change (local livekit 1.8.3 vs pinned 1.8.6).
- `npm run build` passes.

### Claude — 2026-10-15 — SEO P8: site-wide content audit, fact fixes, thin pages, internal links

Branch `claude/seo-p8-sitewide`. It started from `claude/seo-p7` and was rebased onto `main` once PR #106 and PR #109 had merged. This branch changes web-demo marketing content only. It does not touch Signup, onboarding or auth, the Privacy page file, or `helpArticles.ts`.

**Audit**
- New script: `web-demo/scripts/audit-seo-content.py`. After a build it scores all 124 sitemap routes on:
  - main-content word count, with boilerplate removed;
  - contextual inbound and outbound links (body plus the related-links box, never nav or footer);
  - title and description length, H1 and JSON-LD types;
  - fact-flag regexes.
- Full results are in `docs/SEO-SITEWIDE-AUDIT-2026-10-15.md`.

**Before and after**

| Measure | Before | After |
|---|---|---|
| Thin pages | 20 | 0 |
| Pages with fewer than 3 contextual inbound links | 32 | 0 |
| Pages with fewer than 3 contextual outbound links | 7 | 0 |
| Orphan pages | 2 | 0 |

**Facts corrected**
- **Language count:** "99 languages / 88 more" is removed from every page. Pages now say Hindi, English and 9 more Indian languages (11 in total). The 99-language lists belong to owner-only Gemini voices (`ADMIN_ONLY_MODELS`). Places changed:
  - Home, and the home meta description
  - `/languages`: title, description, hero and the global chips section
  - `HERO_STATS` and the CTA chip
  - `/product/agents`
  - the Knowlarity comparison row
- **Pricing FAQ:** "Economy 0.5×" now reads "Native 1 credit/min".
- **Pricing guide:** the `/ai-voice-bot-pricing-india` title no longer promises a calculator.
- **E-commerce:** the page no longer claims built-in order lookup or returns handled without a person. Order status needs a custom function.
- **Transfers:** three cards now say that transfer to a person works on phone calls only.
- **Overclaims:** softened on the About page and in the Home FAQ.

**Content and links**
- The five local real-estate pages get market-specific copy and labelled native-script samples.
- New or expanded sections on:
  - `/solutions` and `/solutions/ecommerce`
  - `/pricing`: a credit table computed from `PLANS`
  - `/ai-voice-bot-pricing-india`, `/languages` and `/about`
  - one new section in each of 10 blog articles
- `SeoRelatedLinks` changes:
  - company and legal pages now link to each other;
  - compare pages and demo pages link to their siblings;
  - language pages link to their demo and local real-estate pages;
  - a new "Set-up guides" row links to help articles.
- `/vs-ivr` gets a further-reading section.

**Verified**
- Build, the SEO route audit, `test:seo` and `check-blog-seo` all pass.
- The new audit script, re-run after the changes, gives the numbers above.
- No horizontal scroll at 375 px on any of the 13 changed templates.

**Not verified**
- The native-script samples need a native speaker's review.
- I have not checked that the live demo actually opens in each language marked "demo only, in testing".
- The help articles' credit list is missing the Native 0.5× tier. I left it unchanged because `helpArticles.ts` was in PR #109 while this work was done.

**Next:** review the PR against `main` and merge it; it has not been merged yet. There are no server or agent changes, so no worker deploy is needed. After the Vercel deploy, request indexing for `/languages` (its title changed).

### Claude — 2026-10-15 — PR #114 follow-up: no em dashes, AI-tone pass

At the owner's request; same branch and same PR.

**Em dashes**
- Public pages went from 423 em dashes to 0. The count covers visible text, meta tags, alt text and JSON-LD.
- Help articles were rewritten in `server/help_articles.py`, and `helpArticles.ts` was regenerated from it.
- `check-seo-pages.mts` now fails the build if any prerendered public page contains an em dash.

**Tone pass**
- About 18 "not just X" contrasts and stacked "no X, no Y" triads were rewritten.
- None of the listed buzzwords appeared in public copy.

**Verified**
- Build and the SEO route audit.
- `test:seo` and `check-blog-seo`.
- `server/test_help*.py`: 43 passed, run with a placeholder `DATABASE_URL`.

**Not changed:** code comments and dashboard-only strings.

**Deploy:** the Vercel build carries the site changes. `help_articles.py` also feeds the dashboard help chat on the server side, so Railway picks up the new wording on its next deploy.

### Claude — 2026-10-15 — onboarding answers set up the first agent (branch `claude/onboarding-first-agent`, PR open, NOT merged)

Changes: new `server/onboarding_agent.py` builds the starter agent's instructions, language, welcome line (Hindi/English only) and after-call fields from the onboarding answers, deterministically (no model call). `calls_db.apply_onboarding_agent` writes them only before onboarding is finished and only onto the untouched starter "Artha" (or the agent a previous run set up; settings key `onboarding_agent_id`). New `POST /onboarding/agent` (finish step, so "Talk to Artha" is tailored); `/onboarding/complete` applies it once more. Admin account "Signup & onboarding" tab gets a "First agent, set up from onboarding" table: answer → setting → value → "As set up" / "Changed by customer" (rebuilt from the stored answers).

Verified: 14 server tests (`test_onboarding_agent.py`, `test_onboarding_profile.py`), tsc, localhost walk-through against a mock that runs the real module (finish step and admin table in both states). Not verified: against a real database; existing accounts are already onboarded so nothing changes for them. Server-only + dashboard: no LiveKit agent deploy needed.
### Claude — 2026-10-15 — native sample lines regenerated with Sarvam (PR pending, NOT merged)

Branch `claude/seo-native-samples`. Owner asked for the Indian-language sample conversation lines on public marketing pages to be rewritten by Sarvam so they read as native speech.

- Model `sarvam-105b-conversations`, temperature 0.3, JSON output. 32 requests, about 30k tokens total.
- 116 lines sent across 10 languages. 57 were regenerated, 58 came back unchanged because Sarvam judged them already natural, and 1 was flagged (Kannada demo-call caller line; Sarvam added a greeting and mixed scripts). The original is kept for the flagged line.
- Files: `web-demo/src/lib/marketingContent.ts`, `seoExpansionContent.ts`, `pages/marketing/AiTelecaller.tsx`, `AiReceptionist.tsx`, `VoiceBot.tsx`. Report: `docs/SEO-NATIVE-SAMPLES-2026-10-15.md`.
- Verified: build (SEO audit and em-dash check), `test:seo` (no expected-phrase changes needed), `check-blog-seo`.
- Unverified: native-speaker review per language.
- Next step: review and merge the PR. The change is web only, so Vercel is the only deploy. No agent or server deploy is needed.

### Claude: 2026-10-15, language-switch voice samples and language-page redesign (PR pending, NOT merged)

Branch `claude/seo-voice-samples`. This is web-only work.

**What changed**
- **Voice samples:** each of the 10 /languages pages now has a two-speaker sample call in the hero. The caller starts in Hindi and switches to the page's language; on the Hindi page the switch is to English. The agent follows the switch.
- **Player:** an orb and waveform that follow the audio, a live transcript, a "Switched to X" chip, tap-to-seek, and the label "Scripted sample... Not a real customer call". The page JSON-LD has an `AudioObject`.
- **Hero:** "Talk to Artha live" was removed from the language heroes.
- **Layout:** the template now uses varied sections. All copy, headings and links are kept.

**Files**
- `web-demo/public/media/samples/*-switch.m4a`
- `web-demo/src/lib/voiceSamples.ts`
- `web-demo/src/components/VoiceSamplePlayer.tsx`
- `web-demo/src/pages/marketing/LanguageDetail.tsx`
- `web-demo/src/index.css`
- `web-demo/scripts/test-language-seo.mjs`
- `docs/SEO-VOICE-SAMPLES-2026-10-15.md`

**Audio**
- Sarvam `bulbul:v4-flash`, voices `kavya_hi_conversational` (agent) and `aditya_hi_conversational` (caller).
- Pace 1.2, temperature 0.7, gaps 200 ms. Each file is 27 to 31 s and 220 to 251 KB.
- The owner approved the Marathi take before the rest were made.
- Usage: 15,817 TTS characters across both takes, 33 LLM requests and about 175 STT requests.

**Verified**
- Every line was round-tripped through Sarvam STT; the content is intact, and the language matched for 78 of 80 lines (the 2 mismatches are expected).
- Each m4a decodes back to its source.
- Build and SEO audit, `test:seo` and `check-blog-seo` pass.
- At 375 px there is no horizontal scroll.
- Dark mode looks right.
- Playback works: play, pause, resume, replay and seek.

**Unverified**
- Native-speaker review.
- iOS Safari.
- A single self-pause seen once in the preview pane. It could not be reproduced in 3 later runs.

**Next step:** review and merge the PR. Only Vercel deploys; no server or agent deploy is needed.

### Claude — 2026-10-15 — SEO keyword placement (branch `claude/seo-keyword-placement`)

**What changed (web-demo only)**
- New page `/ai-calling-agent` (`src/pages/marketing/AiCallingAgent.tsx`): umbrella page for "AI calling agent", "AI calling" and "automated calling software". Inbound and outbound, lead follow-ups, languages, DND / calling window / retries / phone-only transfer, FAQPage schema. Links to /ai-telecaller and /product/outbound to keep the three pages distinct. Registered in App.tsx, seoPages.ts (+ OG card, `public/og/ai-calling-agent.png`), nav, footer, related links; linked from home, /product/outbound, /ai-telecaller, /voice-bot and /ai-call-center.
- Titles, descriptions, opening copy and H2s updated for: home, /ai-ivr, /ai-call-center, /vs-ivr, /product/inbound, the buyer guide, /voice-bot (H2), /languages/{hindi,kannada,telugu} (new optional `intro` and `regionalHeading` fields on LanguagePage; the overview cards keep the short blurb), and 3 IVR articles (excerpt + one heading).
- `test-language-seo.mjs`: the Hindi phrase changed from "Hinglish AI voice calling agent" to "AI calling agent in Hindi", because the Hindi description changed.
- New `web-demo/scripts/check-keyword-placement.py`. It checks the local dist (or `--live`); `--strict` exits 1 on any gap.

**Verified:** `npm run build` (SEO audit of 125 routes and the em-dash check), `test:seo`, `check-blog-seo` and `check-keyword-placement.py --strict` (33 of 33) all pass. I also looked at the new page in the browser.

**Facts checked in code:** transfer refuses web calls (`agent/tools.py` transfer_call), the DND check is `calls_db.is_dnc` with honor_dnc on by default, the calling window uses the account timezone (`within_calling_window`), a campaign schedule only narrows the window (`campaign_dialer.py`), and the agent adds DND numbers itself (`tools.do_not_call`).

**Unverified / notes**
- The existing /product/outbound copy says the calling window is enforced "in the callee's timezone", but the code uses the account timezone. I did not change it; it is flagged for a separate fix.
- Titles and H1s were kept on purpose for the language pages, the AI IVR H1 and the home title ("ivr call", "ai voice calling agent" and the language keywords). The checker marks these as kept.

**Next step:** review and merge the PR. Only Vercel deploys; no server or agent deploy is needed. After the deploy, run `python3 web-demo/scripts/check-keyword-placement.py --live` and request indexing for /ai-calling-agent in GSC.

### Claude - 2026-10-15 - new marketing header (branch claude/marketing-header-v2, PR open, NOT merged)

Owner-approved mix of mockup options 5 and 4. Files: `web-demo/src/components/MarketingLayout.tsx` (header only; footer and layout untouched), `web-demo/src/components/MarketingBits.tsx` (live-demo click logic extracted to `useGoToLiveDemo`, TalkToArthaButton unchanged in behaviour), `web-demo/src/lib/marketingContent.ts` (AI receptionist and AI IVR moved from Resources into Product in NAV), `web-demo/src/index.css` (header-only `.mh-*` rules appended). The logged-in dashboard header was not touched.

What it does: utility strip (all 10 language scripts from LANGUAGES, each linking to /languages/<slug>; "Answers 24/7 on phone and web"; Talk to sales -> /contact) scrolls away; the main bar is sticky with blur and a shadow after scroll. Product mega-menu (3 columns + featured "Hear it first" card -> /languages/tamil, a 30 s Hindi-to-Tamil sample), Solutions (industries + language column), Resources (3 columns), Company (narrow list). Panels are always in the prerendered HTML and only hidden, so every menu link is a crawlable <a href>. Hover intent (120 ms open, 180 ms close), click, ArrowDown/Up/Left/Right/Home/End roving, Escape returns focus to the trigger, outside click closes. "Hear a live call" reuses the Talk to Artha live path (scroll to #live-demo or go to /#live-demo).

Deviation: the desktop/mobile switch is at 1024 px (lg), not 900 px; between 900 and 1023 the five menus plus both buttons do not fit. Between 1024 and 1279 the pill reads "Live call" and Sign in moves to the utility strip.

Verified: `npm --prefix web-demo run build` (icons, em-dash, SEO route audit: 125 routes pass), `npm --prefix web-demo run test:seo`, `npx tsx scripts/check-blog-seo.ts` all pass. Browser (local `vite preview` of the build): hover and keyboard on the mega-menus, Escape/outside click, Hear a live call from /pricing lands on the home demo orb, 1024 px fits with no overflow, 375 px has no horizontal scroll, the sheet opens, locks scroll, Escape closes and focus returns, light and dark both checked.

Not verified: real phones/Safari; the live site after deploy.

**Next step:** owner review of the PR screenshots, then merge. Vercel only; no server or agent deploy.

### Claude - 2026-10-15 - ArthaLeads leads called within 30 s with full context (branch claude/instant-lead-calls, pushed, NO PR, NOT deployed)

Files: `server/campaign_dialer.py`, `server/token_api.py` (leads_inbound, Meta webhook notify), `server/calls_db.py` (next_calling_window_open), `agent/contact_notes.py`, `agent/language.py`, `agent/main.py`; tests `server/test_instant_lead_calls.py`, `agent/test_lead_call_context.py`, `agent/test_contact_notes.py`.

- Dial on arrival: `campaign_dialer.notify()` (threading.Event) wakes `_loop` for an immediate pass; the loop waits on the event with the 15 s tick as timeout. Instant-lead campaigns (by name) go first in a pass. All gates unchanged (window, concurrency, channel cap, stagger, breaker).
- leads_inbound: `custom_fields.form_responses` -> `form_answers` ("Label: value · ...", 1200 cap) plus `form_<slug>` keys; `tags` -> comma string; control chars stripped; a form answer about language fills `language` when none is given. `ingest_inbound_lead` runs via `asyncio.to_thread`; queued -> notify(); window closed -> `queued_until` (ISO, account timezone).
- Agent notes: tracking noise skipped (ids, arthaleads_*, page/source URLs, consent, budget_min/max, channel...); new labelled lines Came via / Ad they responded to / Ad text / Form answers / First WhatsApp message / Tags, not counted against _MAX_EXTRA.
- Outbound to an ArthaLeads lead with no operator opener: a generate_reply instruction naming the person, project/ad and channel, in the call language (held-opening release, first live turn, realtime greeting). Operator openers untouched.
- Lead language (preferred_language/language, names or codes) becomes that call's language when the voice can speak it (voice_catalog.languages_for; ElevenLabs limited to hi/en/ta); otherwise the agent language is kept and the reason logged.

Verified: server suite 728 passed / 0 failed (715 + 13 new); agent suite 802 passed (784 + 18 new) in a LiveKit 1.8.6 venv; local throwaway Postgres only. Unverified: a live call; the wake in production assumes one API replica (notify only wakes the dialer in the same process).

**Next step:** owner review -> PR -> merge; needs the Railway deploy AND both LiveKit agents (`lk agent deploy`) for the agent half. The outbound hold still applies.

### Claude - 2026-10-15 - follow-up calling (PR #128, merged a4d64313, deployed; see entry below)

Owner decisions of 2026-10-15 as per-agent settings (new "Follow-ups" panel on the agent page, `agents.follow_up_policy` JSON, defaults applied when absent): max tries 3; retry after busy 10 min / switched off 2 h / no answer 30 min / voicemail 2 h; auto call-back at the asked time (on); site-visit reminder the day before at 11:00, or 2 h before when the visit is under 24 h away (on); nurture call 3 days after an interested call at 11:00 (on). After the last try an ArthaLeads lead is reported as `crm_outcome: {booking: "Not Reachable", attempts: N}`.

Files: `server/retry_rules.py` + `agent/retry_rules.py` (identical: `switched_off` outcome, `follow_up_policy`, `follow_up_retry_policy`, `effective_policy`, `AGENT_POLICY_CAMPAIGNS`, `FOLLOW_UP_CAMPAIGN_NAME`), `server/calls_db.py` (agents.follow_up_policy column + save/read; campaign_contacts.crm_notified_at; record_campaign_dial_result uses the agent's rules for instant/follow-up campaigns; claim_next_campaign_contact honours next_attempt_at on pending rows; exhausted_arthaleads_contacts / mark_contact_crm_notified), `server/integrations_dispatch.py` (report_contact_not_reachable, on the last saved call or a minimal lead entry), `server/campaign_dialer.py` (reports exhausted leads every tick), `agent/db.py` (_campaign_retry_rules; record_campaign_voicemail takes busy/switched_off; schedule_follow_up_call -> per-agent "Follow-up calls" campaign), `agent/follow_ups.py` (new: which follow-up a call earns and when), `agent/main.py` (carrier announcement split busy vs switched_off incl. Telugu, Telugu voicemail phrases, _schedule_follow_up after the post-call analysis, follow-up calls take the lead context and open on why we are calling back), `agent/contact_notes.py` (opener per follow-up kind), `web-demo/src/lib/types.ts`, `web-demo/src/pages/AgentDetail.tsx`.

Scheduler = campaign_contacts rows (pending + next_attempt_at) drained by the existing dialer: survives restarts, calling window and channel caps apply, DNC checked at dial time. A time outside the window is dialled when the window next opens (the same moment next_calling_window_open gives). Bulk campaigns keep their own retry_policy.

Verified: server suite 917 passed / 0 failed; agent suite 1066 passed (16 skipped) / 0 failed, LiveKit 1.8.6 venv; throwaway local Postgres only. New: `server/test_follow_up_calls.py` (9), `server/test_retry_rules.py` (+6), `agent/test_follow_up_scheduling.py` (33), `agent/test_carrier_announcement.py` (+4). `npx tsc -b --noEmit` and `npm run build` pass. Unverified: a live call; ArthaLeads' handling of the extra `crm_outcome.attempts` key; real Telugu carrier audio through STT.

Deploy needs: Railway FIRST (adds the two columns), then BOTH LiveKit workers (agent/db.py reads agents.follow_up_policy in every retry decision; a new worker against the old schema logs an exception per retry resolution and the reaper then resolves the contact as failed). Outbound hold still applies: the "Follow-up calls" campaign places real outbound calls once deployed.

**Next step:** owner review -> PR -> merge; Railway, then `cd agent && lk agent deploy` for both workers; then `graphify update .` on main (no graph in this worktree).

### Claude - 2026-10-15 - PR #128 follow-up calls merged and deployed

- Merge a4d64313 (3a35b47c follow-up calls + 3a28ce44 numeric call_id for the Not Reachable report). Railway deploy SUCCESS, healthz 200; `information_schema` on production confirms `agents.follow_up_policy` and `campaign_contacts.crm_notified_at`.
- Workers deployed from `git archive origin/main agent` at a4d64313: phone `CA_TGdpVhSdxDyS` version `4pVPHHbYCoC8` (registered 17:31:37Z), platform-demo `CA_53d8HgBktjZ7` version `cKDf7Q96GgmR` (registered 17:34:03Z). 40 s of logs each: 44 INFO, 0 warnings, 0 exceptions. Rollback: `lk agent rollback` to the previous versions.
- `graphify update .` run on main.
- Unverified: no real call has exercised the new retry/call-back/visit-reminder/nurture paths yet (outbound hold; account 1 has no phone number). Telugu never run on a real call.
- Left: owner adds a number to account 1 or points ArthaLeads at account 2; enable "Auto-call new leads" in ArthaLeads; live outbound test (transfer / no-answer / busy) before the hold is lifted.

### Claude — 2026-10-16 — ArthaLeads single-token handshake (PR #129, merged c74f5d08, live)

Contract: the customer pastes the ArthaLeads connection key once in Voice; Voice tells ArthaLeads which account it belongs to, and the same key then authenticates ArthaLeads → Voice (`POST /leads/inbound/{id}`, `GET /leads/inbound/{id}/agents`) alongside the existing lead-webhook token. The ArthaLeads half (`POST /webhook/vistrow/link` and `/unlink`) is being built in parallel in prophuntllp-bit/arthaleads against the same contract.

Changed (Railway server + dashboard only; no agent code, no DB migration):
- `server/integrations_dispatch.py`: `_ARTHALEADS_API_BASE` (env `ARTHALEADS_API_BASE`, else derived from `_ARTHALEADS_URL`), `_arthaleads_api_post` (8 s, never raises), `link_arthaleads` (401/403 → "rejected", 200 → "linked" with org_name/linked_at, anything else → "pending"), `unlink_arthaleads`, `relink_arthaleads` (Test button).
- `server/token_api.py`: `PATCH /integrations/arthaleads` runs the handshake before saving; a rejection is HTTP 400 and nothing is saved; `config.link` added to `_SERVER_MANAGED_INTEGRATION_KEYS` (browser-sent `link` is dropped); disconnect unlinks best-effort with the old key; `POST /integrations/arthaleads/test` re-links first and then sends the sample lead; both inbound routes use `calls_db.account_id_for_inbound_token`.
- `server/calls_db.py`: `account_id_for_inbound_token` (lead-webhook token OR the key on a *connected* arthaleads row, constant-time), `account_name`.
- `web-demo/src/pages/IntegrationDetail.tsx`, `web-demo/src/lib/types.ts`: new field hint; green "Verified with ArthaLeads · org · Vistrow account N" / amber pending / red rejected line under the key; `Integration.config.link` type.
- Tests: new `server/test_arthaleads_link.py` (9 tests, ArthaLeads HTTP faked at `_arthaleads_api_post`); `test_arthaleads_agent_picker.py` and `test_instant_lead_calls.py` mock the renamed lookup.

Verified: all 9 new tests fail on origin/main's server files and pass on the branch; full server suite 753 passed / 0 failed against a throwaway local Postgres; `tsc -b` clean; `vite build` clean. Not verified: no request has been made to the real ArthaLeads (its route does not exist until the ArthaLeads PR ships); the dashboard was not opened in a browser; the "917 passed" baseline figure could not be reproduced here (753 collected in `server/`).

Left: merge only after the ArthaLeads side is deployed (otherwise every key save lands as "pending" — harmless, the key is still saved and Send test retries). Then: owner re-saves the key on account 2 and checks ArthaLeads → Auto-call step 1 reads "Connected to Vistrow account 2".

### Claude — 2026-10-16 — admin reset for two-step login (branch `claude/mfa-admin-reset`, PR open, NOT merged)

Changes: new `POST /admin/accounts/{id}/users/{uid}/reset-two-step` (platform owner only; reason required; user must belong to the account and have two-step on; clears it via `calls_db.disable_mfa`, records security event `mfa_reset_by_support`, writes audit `reset_two_step`, emails the user). Admin account Users tab gets a "Two-step login" column with Reset (reason dialog; ReasonModal now shows helper text without a field). Login code step links to support@vistrowvoice.com for users who lost both phone and recovery codes. Customers could already turn it off themselves in Settings → Sign-in & security; the platform owner account can't (required for the admin panel).

Verified: `server/test_admin_reset_two_step.py` (3 tests, route loaded via AST like test_admin_impersonation, no DB), tsc, localhost run against a mock (code screen link; admin Reset dialog → column flips to Off with banner). Not verified: against a real DB or real email send. Server + dashboard only; no agent deploy.
### Claude — 2026-10-16 — Widget text chats delivered to integrations (branch `claude/chat-lead-delivery`, PR open, NOT merged)

Problem (verified 2026-10-16): a widget text chat is logged by `calls_db.upsert_widget_chat_call` (call_type `widget`, room `widget-chat-{session}`) but nothing ever delivered it to the account's integrations — voice calls fan out from the agent at call end, a text chat has no agent. A visitor chatted 49 s with name+phone+email and ArthaLeads only got it when the owner pressed "Send to ArthaLeads" 1.5 h later.

Changed (Railway server + widget bundle; no agent code):
- `server/calls_db.py`: migration columns `calls.integrations_delivered_at TEXT`, `calls.integrations_delivery_json TEXT` (same list as `arthaleads_status`); `idle_widget_chats(idle_seconds=180, max_age_days=7)`; `widget_chat_call(site_id, session_id)`; `claim_widget_chat_delivery` (atomic NULL→now stamp, so sweep and beacon never double-deliver); `mark_widget_chat_delivered` (result JSON).
- `server/integrations_dispatch.py`: `deliver_widget_chat(call)` builds the call-end-shaped lead (type `call_completed`, channel "Website chat", transcript as {speaker: Caller|Agent, text}, agent name/public id, language, duration, page_path, call_id, message; no recording), sends via `deliver_lead` to webhook/slack/whatsapp/sheets/zoho_crm and via `push_call_to_arthaleads` to ArthaLeads (stamps `arthaleads_status` like a manual send), writes Activity rows, and stamps the markers even on failure or skip (`{"skipped": "no_contact"}` when no phone and no email). `deliver_lead` now honours the owner's event and field choices (`_wants_event`, `apply_field_choice`) and takes `skip_keys`; it had no other callers. `_saved_turns` normalises both saved transcript shapes — before this, a manual "Send to ArthaLeads" for a text chat sent an EMPTY transcript/message because `{role, content}` turns were not recognised (only `{speaker, text}`); fixed for the manual button too.
- `server/campaign_dialer.py`: `_deliver_idle_widget_chats()` runs every tick next to `_report_exhausted_contacts()` (per-row try/except). `DISABLE_CAMPAIGN_DIALER=1` (local runs) disables this sweep too.
- `server/token_api.py`: `POST /widget/chat/end` (public, `siteKey` + `sessionId`, raw JSON body so `sendBeacon`'s text/plain needs no CORS preflight, rate-limited 60/h per IP) → delivery in a background thread, idle rule bypassed. `ended_at` is deliberately NOT moved to "now": it already equals the last turn, and stretching it would bill idle tab time.
- `widget/src/widget.ts`: `endChatSession()` (once per chat session, only if the visitor sent a message) on the X button (chat branch), "End chat", `pagehide` and `visibilitychange→hidden`; `navigator.sendBeacon` with `fetch keepalive` fallback. Rebuilt with `npm run build` in `widget/` and copied to `server/static/widget.js` (the only deploy path: Railway serves `/widget.js` from that file; no automated build step).
- Tests: new `server/test_widget_chat_delivery.py` (7 tests, HTTP faked at `integrations_dispatch._post_json`, `/widget/chat/end` lifted via ast with the thread run inline).

Verified: all 7 new tests FAIL on origin/main's server+agent files (`campaign_dialer has no attribute _deliver_idle_widget_chats`, no `widget_chat_end` route) and pass on the branch; full server suite 760 passed / 0 failed (753 baseline + 7) on a throwaway local Postgres; widget `tsc --noEmit` clean; `vite build` clean, bundle 530,488 B vs 530,054 B committed (diff is only the new code).

First tick after deploy: chats from the last 7 days with phone or email that were never delivered WILL be sent to every connected integration (and ArthaLeads) once; older chats are left alone forever. Expect a one-off burst on accounts with chat traffic.

Unverified: no real browser has exercised the beacon (sendBeacon behaviour on pagehide is from the spec, not observed here); no request to the real ArthaLeads; dashboard not opened. `graphify update .` not run (no `graphify-out/` in this worktree).

Left for Codex/owner: merge + Railway deploy (migration runs on startup); watch the first tick's log lines `widget chat N delivered: {...}`; confirm ArthaLeads receives a chat lead with a non-empty transcript.

### Claude — 2026-10-16 — QA fix programme, phase 1 (orchestrator security/compliance)

Branch `claude/qa-phase1-orchestrator` (PR pending). Files: orchestrator/db.py, tools.py, session.py, server.py, new compliance.py, tests.
- Verified bug, fixed: cross-account webhook (unscoped get_webhook_url + duplicate _post_webhook) removed; delivery only via account-scoped get_delivery_integrations, honouring per-integration events/fields, once each.
- Fixed: no cross-account agent fallback (get_agent_config scoped by account; unassigned number not answered; platform demo only via is_platform_demo flag).
- Fixed: DNC + calling window enforced at /telephony/enablex/outbound-test-call (covers Call now, test call, campaign dials); DB failure refuses without marking blocked.
- Fixed: orchestrator honours record_calls/require_consent/announce_recording. Default record_calls is False (same as agent/), so orchestrator tenants stop recording until they turn it on.
- Evidence: orchestrator suite 34 passed (placeholder DATABASE_URL); new tests fail before / pass after; SQL checked on throwaway pgserver Postgres. Not verified: a live EnableX call.
- Not ported to orchestrator: Zoho CRM + Google-sign-in Sheets delivery, plan CRM gate, per-agent crm_integration_keys / agent webhook (phase 2).
- QA false alarm: Testing Lab already forces LiveKit for Lab runs (AgentTestCall.tsx forceLiveKit).
- Next: merge + Railway deploy of orchestrator, read-only live probe; phase 2 = ignored agent settings + inbound rules on orchestrator.

### Claude — 2026-10-16 — end-to-end test of PR #116 + #131 together (real server, throwaway DB)

Ran main + both branches merged, real `token_api` on a throwaway local Postgres 16 (UTF-8) with a local STARTTLS mail catcher; server copied outside the repo so no production `.env` could load (log confirmed no OpenAI key). Verified in the DB after each step:
- Onboarding sets up only the untouched starter; re-applies to the same agent when an answer changes; no-op after onboarding (`agentId: null`); owner's agent untouched by the customer's; first-touch attribution not overwritten.
- Admin mapping table correct; a customer edit (language) flags only that row. Fixed on #116: the row now shows "Now: English / Onboarding set: Hindi" (was ambiguous "Set to").
- Two-step reset: customer locked out (password alone → mfaRequired); admin Reset clears secret+recovery codes, writes audit `reset_two_step` with reason, security event `mfa_reset_by_support`, email delivered; customer then signs in with password only. Refused correctly: customer session 404, anonymous 401, user of another account 404, already off 400, short reason 400 (and button disabled), unknown account 404 — none changed data.
- Code screen support link verified (mailto with subject); owner TOTP sign-in still works.
Both branches had a message-box conflict with main; merged main into each (now MERGEABLE). Not verified: real Resend email delivery, production data.
### Claude — 2026-10-16 — QA release (phases 2-4 + billing + auto analysis)

Release branch `claude/qa-release-oct16` merges PRs #125, #134, #135, #136, #137 and `claude/lead-qualified-rule`.
- #136 orchestrator: agent settings honoured (pause, max duration, silence, outbound welcome, functions, variables, post-call fields, emotion, interruption), inbound route rules, Zoho/Google-sheets/plan gate/per-agent integrations/activity log. Deploy: `railway up` of orchestrator folder (not git-linked).
- #137 agent: billed end = caller disconnect (caller hang-ups were billed ~20 s of LiveKit departure timeout since >= 3 Sep). Needs `lk agent deploy` both workers. Refund list pending owner approval.
- #135 server: automatic call intelligence sweep (AUTO_CALL_ANALYSIS, default on, gpt-5.4-mini).
- lead-qualified-rule: Qualified = real name + phone/email (server status + counts); widget placeholder name not seeded (agent).
- #134 dashboard polish; #125 marketing contact/WhatsApp/wordmark.
- Evidence: release server suite 783 passed; orchestrator 79 passed; web build + SEO + menu tests pass; agent suite 843 passed on lead-rule branch, release run in progress before worker deploy.
- Not verified yet: live EnableX call on orchestrator (hang-up by closing stream), first production auto-analysis pass.

### Claude — 2026-10-16 — ArthaLeads leads on the contact page (branch `claude/contact-arthaleads-details`)

Files: web-demo/src/lib/leadDetails.ts (new arthaleadsOrigin / visibleLeadEntries / visibleTags), web-demo/src/pages/ContactDetail.tsx, web-demo/scripts/test-lead-details.mts.
- Display only; stored custom_fields and tags unchanged (bridge + agent still read them). The inline Lead details editor still shows every key, on purpose: its save sends the whole map, so hiding keys there would delete them.
- For a contact with custom_fields.arthaleads_lead_id: card hides arthaleads_org_id, arthaleads_lead_id, arthaleads_source, external_id, channel_source, source; created_at is labelled "Lead created" and shown as local date/time. Header line "From ArthaLeads · <lead_source or arthaleads_source> lead" + "Open in ArthaLeads".
- Link is https://app.arthaleads.com/leads, not a single lead: verified in the ArthaLeads frontend (local copy + GitHub main/staging) that Leads.jsx opens one lead only from router state (openLeadId); there is no URL param or /leads/:id route.
- Tags: drops "arthaleads", "channel:*", and any "label:value" tag whose value the card already shows. Non-ArthaLeads contacts untouched.
- Evidence: npm run test:leads passes (new cases), tsc -b --noEmit, lint (exit 0, nothing in touched files), full npm run build pass.
- Not verified: the page in a real browser against a real ArthaLeads contact. Next: review + merge (Vercel only), then open contact 9 of workspace 1 and check the card.

### Claude — 2026-10-16 — Clone your voice, backend + call runtime (branch `claude/voice-clone-backend`, not pushed)

Owner decisions applied: clones are Sarvam Instant Voice Cloning only (ElevenLabs IVC behind VOICE_CLONE_ELEVENLABS=1, default off: ~Rs 3.5-3.8/min and not on our PAYG plan); first clone free on Growth/Scale/owner, then CLONE_EXTRA_CREDITS=25 each, refunded on failure; plan limits Starter 0 / Growth 1 / Scale 3 (plan_policy PLANS.cloned_voices); calls billed like Bharat (voice_tier("custom:...") = standard, 2 credits/min on the Bharat model); stock "elevenlabs:" voices owner-only (preview flag), agents already on one keep saving and taking calls.
- Server: new server/custom_voices.py (API router /voices/custom, quote, list, create multipart -> 201 status "processing" then background clone, preview proxy cached per (id,text), rename, delete refused while an agent uses it). Tables custom_voices + custom_voice_previews in calls_db _SCHEMA. Audio in B2 under custom-voices/<account>/<id>/; 15 s reference clip cut with ffmpeg (in the image). Consent clip stored, consent_verified=false (no server STT path). token_api: router mounted, _guard_voice_tier validates custom voices per account, support sessions blocked from /voices/custom.
- Agent: agent/custom_voice.py resolves "custom:vv_<id>" (db.get_custom_voice by id AND account_id) -> SarvamCloneTTS (agent/sarvam_clone_tts.py, POST /voices/clone/stream, linear16 24 kHz, StreamAdapter + stock Sarvam backup); any problem -> google:chirp3:Achernar + warning. Call record keeps custom: value. AI disclosure forced on (call_disclosure cloned_voice/force; AI-only line when not recording). plan_policy.validate_agent no longer refuses custom or grandfathered ElevenLabs voices.
- Orchestrator: speaks only ElevenLabs clones, so Sarvam clones fall back to "shubh" there (logged); billed voice and forced disclosure mirrored.
- Evidence: server 817 passed (pgserver), agent 867 passed / 16 skipped / 1 xfailed full run + the one source-count test updated afterwards (59 targeted passed), orchestrator 63 passed / 20 skipped. No vendor, B2 or Railway contact in tests.
- Not verified: a real clone (needs the text_to_speech_voice_cloning capability on our Sarvam account), real call latency of the clone stream, 20 MB uploads through the Vercel /api rewrite. Deploy after merge: Railway (table + API), BOTH LiveKit workers, orchestrator. Env: SARVAM_API_KEY + B2_* on Railway Voice.
### Claude — 2026-10-16 — voice clone UI (branch claude/voice-clone-ui)

Files: new web-demo/src/components/VoiceClone.tsx (section, dialog, Your voices list), ClonedVoiceOptions.tsx (picker group), src/lib/voiceClone.ts (pure helpers), src/lib/useAudioRecorder.ts; api.ts gets typed /voices/custom functions (upload via XHR for progress); Voices.tsx mounts the section; AgentDetail.tsx and AgentBuilder.tsx offer ready cloned voices as a "Your voices" group and send "custom:vv_..." unchanged. Odia is sent as or-IN per the contract (agent LANGUAGES uses od-IN).

Verified: `npm run build` (icons, tsc, SEO gates) passes; test:voice-clone (new), test:menu/import/leads/consent, test:seo pass. In the browser against a local mock API: free and blocked quotes, mic-blocked fallback to upload, recording with a stubbed audio stream (timer, level meter, playback, 30 s gate), consent + checkbox gating, multipart POST (name, language, sample.webm, consent.webm), processing to ready polling and stop, preview playback, rename, 409 delete refusal, picker shows ready voices only, 320 px width with no sideways scroll.

Not verified: a real microphone, Safari (mp4 recording), the file-upload path in a real browser, and anything against the real server API. Next step: after the server half merges, run the browser checklist in the handoff on staging.


### Claude - 2026-10-16 - voice clone v2 (branch claude/voice-clone-v2, WIP, PAUSED for architecture review)

Paused by the owner before more building. Branch is off origin/claude/voice-clone (PR #143). Not pushed, not merged.
Done (WIP commit, untested): server/custom_voices.py only. SAMPLE_MIN_S 30 -> 10; RECORDING_MAX_S 60 for `source=record` (new optional form field, default "upload", uploads still up to 5 min / 20 MB); reference clip now chosen by choose_reference() (50 ms RMS frames, silence trimmed, best 12-15 s window by speech fraction / long-pause / clipping score, cut at pauses; refuses under 10 s of speech) and computed before any charge; "flac" accepted; preview takes `?language=` (validated, default = voice language, cache key = sha(language + text)), default preview line for all 11 languages (non-hi/en lines need a native-speaker check); voice object gains `speaksLanguages`.
Known broken until continued: server/test_custom_voices.py still expects "30 seconds" and its decode_pcm mock returns digital silence, which choose_reference now refuses. No new tests yet. Frontend redesign (hero, stepper, 11 scripts, mic check, quality hints, cross-lingual preview) not started.
Next step: after architecture approval, update tests (synthetic PCM for trim/window), run with pgserver, then the web-demo work.

### Claude — 2026-10-16 — voice clone phase 1 (server only)

Branch `claude/voice-clone-p1` off `origin/claude/voice-clone-v2` (PR #143 + WIP 4c6db6c5). Committed locally only: NOT pushed, NOT merged, NOT deployed. Files: server/custom_voices.py, server/calls_db.py (custom_voices.gender, reference_text, vendor_deleted_at; ALTER ... IF NOT EXISTS), server/campaign_dialer.py (kick_reconcile hook), server/test_custom_voices.py, server/scripts/voice_clone_live_check.py (new, never run).
Verified (pgserver throwaway DB, vendors mocked with Sarvam's documented bodies): full server suite 842 passed; it was 808 passed + 9 failed on the WIP. Create now reads data.voice_id + reference_text (the old parser raised "no voice_id" on Sarvam's real 201). Error mapping: 422 asks the customer to re-record, refunded. 401/403/insufficient_quota show "not available right now", refunded, and add an error_events row (ops_alert_worker emails it). 429/5xx/network are retried twice (2 s, 6 s). gender is required (male|female) and sent to Sarvam with style=conversational. All 12 languages are accepted, Assamese included (its preview line still needs a native speaker's review). choose_reference uses a 2x noise floor, a 10 dB dynamic-range check, 10 s of voiced frames overall and in the window, and a 1% clipping limit. clone_allowed_for_account() is used by validate_agent_voice. The Sarvam vendor name is now our row id (vv_<16>). reconcile_once() is hourly, takes one replica's slot in settings, is off unless VOICE_CLONE_RECONCILE=1, and only touches voices whose name matches a row in THIS database.
Unverified: no live Sarvam call was made. The live script and the reconcile against the real account are still to run.
Next: owner/parent runs `SARVAM_API_KEY=... python server/scripts/voice_clone_live_check.py ref.wav out.mp3 --gender female`, then phases 2+ (agent/, web-demo).

### Claude — 2026-10-16 — website chats reached ArthaLeads cut off (branch `claude/chat-delivery-full-transcript`, PR open)

Live test on shaporjipallonji.com (chat 1393, owner's number): ArthaLeads got only the first exchange. Cause: widget.ts sent `/widget/chat/end` on `visibilitychange=hidden` (tab/app switch), the server delivers each chat once, so later turns never left Vistrow. ArthaLeads attached it to the existing lead with that phone (its dedupe), which is why no new "Vistrow Voice" row appeared.
Fix: (1) widget no longer ends a chat on visibilitychange (End chat, closing the panel and pagehide still do; a visitor who never returns is delivered by the 3-min idle sweep). server/static/widget.js rebuilt; the build of unmodified main reproduces the committed bundle byte for byte, and the only bundle diff is that listener. (2) Safety net: each delivery records `upTo` (the chat's ended_at read before the send); the dialer tick re-sends to ArthaLeads only (it updates the same call by call_id) any chat with turns after `upTo` once idle 3 min; logged as `call_updated` ("Chat updated" on the integration page). Sheets/webhooks are not re-sent (they would add a duplicate row).
Verified: test_widget_chat_delivery.py 10/10 on a throwaway Postgres (3 new; the re-send test fails on unfixed main), full server suite 645 passed with only the 2 pre-existing test_instant_lead_calls failures, web-demo tsc. Real browser check on a local page serving the new bundle: hidden mid-chat sent no end signal; End chat sent exactly one, after the second message. Not verified in production yet. Chat 1393 (owner's test, ArthaLeads has 3 of 5 turns) is within the 7-day window and will be re-sent automatically after deploy.
### Claude — 2026-10-16 — LLM token diet (branch `claude/llm-token-diet`, local commit, NOT pushed)

Problem: Sarvam pipeline LLM ≈ ₹2.0/call-minute (Oct 1–16 bill: ~12M tokens / ~117 min, ~45% cached).

Measured offline (new `agent/scripts/measure_prompt_tokens.py`, fixtures `agent/scripts/token_fixtures.py`; tiktoken o200k proxy; rebuilds the exact chat-completions request per turn):
- A request is ~11.5k tokens at turn 1, ~12.4k at turn 10, ~13.4k at turn 20 (custom-prompt tenant, strict 8k KB). Static system prompt + KB + tool schemas ≈ 10.2k of it; per-turn directive ≈ 1.2–1.5k; history only 0.5k (turn 5) to 1.7k (turn 20).
- Within a call, 86–88% of each request already repeats the previous request byte-for-byte from the start. The billed 45% cache rate is therefore NOT explained by our request order; it is on Sarvam's side, or the bill includes non-call traffic. Hypothesis, unverified.
- The bill reconciles with ~8 requests per call-minute: harness predicts ₹1.78–2.03/min at 45% cached, ₹1.29–1.45/min if Sarvam cached the whole repeated prefix.

Changed:
- agent/main.py `_window_history`, `_trimmed_history_note`, `_without_turn_copies`, `RealEstateAgent._llm_request_ctx` (used by llm_node): keep the last 12 caller turns, trimmed in steps of 6 so the request stays append-only between trims; greeting, system messages and every non-log_lead tool call+result kept; a short note says older turns are gone (facts stay in the directive's facts list). Only the request copy is trimmed; history and transcript untouched. `LLM_HISTORY_KEEP_TURNS=0` disables. The directive is now sent once on corrected-fact turns (was twice).
- agent/main.py entrypoint + `__init__`: contact notes go in the per-call tail (`# This contact`), no longer glued onto system_prompt. Before: every call with lead custom fields made the KB and all platform layers an uncached prefix (shared prefix between two calls 4.4k → 10.4k tokens), and on a built-in-persona agent the notes REPLACED the whole persona.
- agent/main.py `_warm_llm_prompt_cache`: the warm-up request now carries the agent's tools, like every real request.
- orchestrator/session.py: VOICE_STYLE_PROMPT placed before caller memory and the date line.

Savings, honestly: tokens −0.7% over a 20-turn call, −4.5% at turn 20. The 50% target is NOT reached without cutting prompt content. Ranked content options (each needs a Testing Lab A/B, none done): per-turn directive 1.2–1.5k tokens uncached on every request (gender block ~600); the two "how you talk" layers 775 + 783; strict-KB rules ~600; the second full request after a log_lead tool call.

Verified: agent and orchestrator suites (counts in the commit message); 11 new tests in agent/test_llm_token_diet.py, 10 fail on origin/main. Not verified: any live call; Sarvam cache behaviour. Next: merge, deploy both workers, then compare per-request promptTokens/cachedTokens in diagnostics and the Sarvam dashboard cache share for a day.


### Claude — 2026-10-16 — Lead details parity + brochure request (branch `claude/lead-details-brochure`, LOCAL commit, NOT pushed, no PR)

Problem (verified in code): ArthaLeads' body sent `extracted_data` = property_type/configuration/purpose from log_lead + operator post_call_fields only, so budget, location and timeline never reached ArthaLeads (call 1392: Budget "Not captured"). Agent 17 has no post_call_fields, so no post-call read ran at all for it unless memory was on.

Changed (agent/, one line in server/):
- New `agent/lead_facts.py`: `parse_inr_budget` (deterministic: lakh/crore/thousand, Hindi/Hinglish/English number words, डेढ़/ढाई/साढ़े/सवा/पौने, ranges, "1 crore 20 lakh"; a bare figure under 10,000 is dropped), mid-call (log_lead) values in the standard shape, `merge_facts` (post-call wins; mid-call fills a key the post-call read left empty; brochure_requested kept only when True), and `extract_lead_facts` — a strict json_schema gpt-5.4-mini pass (same model/settings as `_post_call_analysis`) that returns the caller's budget WORDS, Buy/Invest, ArthaLeads PROPERTY_TYPE/BHK values, configuration, preferred_location, timeline, brochure_requested, summary, key_points. The model never returns numbers.
- `agent/main.py`: `_call_extracted_data(lead_data, extracted)` replaces `{**_extra_lead_facts(lead_data), **extracted}` at all three sites (calls row insert, CRM payload, post-analysis rewrite), so Vistrow and ArthaLeads hold the same dict. The standard pass runs in parallel with `_post_call_analysis` under the existing 8 s bound (`asyncio.wait`, each keeps its result if the other is slow). CRM lead gains `summary`/`key_points`. `send_brochure` registered for every tenant agent next to log_lead (not for role-play demos). Platform rule 1 now allows the send_brochure wording.
- `agent/tools.py`: ArthaLeads body adds top-level `summary`/`key_points` (only when present); `crm_outcome.brochure_requested: true` when requested; new `send_brochure(project)` tool: sets lead_data, tells the agent to say "noted, our team will share the brochure with you on WhatsApp shortly" — never "sending now"/"right after this call". `key_points` added to the "details" field group (owner's field choice drops it like summary).
- `server/integrations_dispatch.py`: same one-tuple field-group change, to keep the agent/server copies identical.
- Tests: new `agent/test_lead_facts.py` (22); `test_crm_delivery_enrichment.py` source assertion updated to the new merge call.

Verified: agent suite 879 passed / 0 failed (main 857; my export of main showed 854 + 3 that fail only because the export lacked server/); server suite 799 passed (same as main). Throwaway local Postgres only, dropped after. On origin/main main.py/tools.py, 6 of the new tests fail (crm_outcome brochure, 1392 ArthaLeads body, 1392 extracted_data, log_call wiring, send_brochure behaviour + registration); without lead_facts.py the module does not import.

Not verified: the real gpt-5.4-mini output on call 1392's transcript (LLM mocked; the test transcript uses the four quoted caller lines with abridged agent lines; production DB not read); the strict schema against the live API (the shape copies the server's working call_intelligence schema: plain strings, "" for empty); whether the model calls send_brochure at the right times on a live call; ArthaLeads' handling of the new keys (Part B, ArthaLeads repo). `graphify update .` not run (no graphify-out in this worktree).

Left: owner review → push/PR → merge → `lk agent deploy` both workers + Railway (one-line server change). Cost: one extra gpt-5.4-mini request per call where the caller spoke, plus the send_brochure schema on every tenant LLM request (~350 chars).

### Claude — 2026-10-16 22:55 IST — lead details: location/brochure prompt fix + coordination

- Commit 93de8a7c (local): `agent/lead_facts.py` SYSTEM_PROMPT. preferred_location comes only from the caller's own lines, never the project's name or town, and is written in English letters. brochure_requested is also true when the agent offered or promised a brochure and the caller agreed.
- Evidence: the real gpt-5.4-mini on call 1392's stored transcript plus 3 synthetic transcripts gave 16/16 correct runs (before: location = project town in 2/3 runs, brochure flag 4/5). Unit tests: 31 passed (local placeholder DB).
- ArthaLeads (other repo): staging bc0446c is pushed. Railway staging and Vercel both report success for that commit. It covers: filling empty lead fields, untouched Apartment/Buy defaults on integration leads, detailsSetByPerson, AI-call status pill, brochure task. ArthaLeads main is not updated.
- Unverified: staging UI in a browser (no staging login available to the agent), live call behaviour.
- Next: owner signs in to app-staging so the UI can be checked, then push this branch and open a PR for the deployer.

### Claude — 2026-10-17 — minute-based plans (branch `claude/minute-pricing`, LOCAL commit, NOT pushed)

Owner decision: Starter ₹2,999 = 400 min, Growth ₹5,999 = 1,100, Scale ₹12,999 = 2,700 per month; annual 500/1,200/3,000 per month at a PENDING price (default pay 11 for 12: 32,989 / 65,989 / 1,42,989); 1 standard minute = 1; Vistrow Live = 3; overage ₹7/6/5.
- Mapping: credit ledger kept, 1 credit = 1 standard minute. agent/plan_policy.py now owns PLANS (credits = monthly minutes, annual_credits_per_month, overage_per_minute_inr), ANNUAL_MONTHS_CHARGED/ANNUAL_PRICE_INR, plan_allowance(), public_plans(), and the tier tables + credits_per_minute() that server/calls_db.credits_for_call AND agent/db.py's trial cutoff both use. Sarvam/Bharat model tier = standard (was premium 2x); Live 2.5 = "realtime" 3x, 3.1/3.8 = "realtime_plus" 3x (was 2x/6x), Live ignores voice tier; economy voices 1x (was 0.5x); floor 1.0 (was 0.75). Premium voices 2x and legacy LLM tiers unchanged.
- Existing balances: credits_total untouched (no migration). Usage is recomputed at current rates, so mid-period Bharat usage halves on deploy and Live 2.5 usage rises 1.5x.
- New: GET /billing/plans; billing_summary adds creditUnit/liveMinutesPerMinute/planAnnualPriceInr/plans; reset_plan_credits takes billing_cycle (annual = 12 x annual monthly minutes, pooled); overage = plan's per-minute rate; /admin/pricing drops overageMultiplier for overagePerMinuteInr + annualPriceInr.
- Verified: server suite 826 passed, 1 failed = VoicesPageCreditsTests (reads web-demo/src/lib/plans.ts BHARAT_MODEL_MULTIPLIER=2 / LIVE {2.5:2, default:6}; must become 1 / {3,3} in the dashboard lane before merge). New server/test_minute_pricing.py 12/13 fail on origin/main.
- NEEDS (other lanes): web-demo plans.ts (creditsNum 400/1100/2700, multipliers, TopupModal per-credit), AdminSettings overageMultiplier; Razorpay annual Plans with the new amounts + GST; voice-clone-release also edits the PLANS rows (trivial merge conflict: add cloned_voices).
### Claude — 2026-10-17 IST — tool descriptions: size verified, cut, A/B

- Branch `claude/tool-desc-ab` from main 322c9ba3. Files: `agent/tools.py` (docstrings of switch_reply_language, end_call, do_not_call, request_callback, book_appointment, check_calendar_availability, transfer_call, capture_platform_lead; no logic/name/schema change), `docs/TOOL-DESC-AB-2026-10-17.md`.
- Verified: Sarvam's own prompt_tokens with vs without tools: tool block 2,625–2,735 tokens = 29–33% on agents 3/17/19/26, 9.8% on agent 4 (the old "23%" was the offline fixture before prompt cuts). After: 2,249–2,346 (−376…−389/request). A/B 2×30 real turns (read-only DB, accounts 1+2, PII masked): right tool 22/26 vs 21/26, no-tool 28/34 both, wrong end_call 0 vs 1, switch 2 vs 2, TTFT p50 266 both. Agent suite 899 passed / 0 failed (placeholder DB). A shortened log_lead dropped #26 log_lead to 2/5 and 0/5 → fully reverted (5/5). Spend ≈ ₹61 billed-rate estimate.
- Not verified: do_not_call/transfer_call/booking completion turns (none in the replay set); non-Indian language switch on global voices; live call.
- Next: owner review → push/PR → deployer merges and runs `lk agent deploy` on both workers. No line overlap with PR #153 (switch_reply_language logic).
