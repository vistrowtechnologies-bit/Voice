# Privacy audit — 2026-10-12

Purpose: ground the public Privacy Policy (`web-demo/src/pages/marketing/Privacy.tsx`) in what the code does. Facts below were read from the repo at origin/main `94283ef`. Not legal advice. "Unverified" means it cannot be confirmed from code (needs the owner, a vendor dashboard, or a lawyer).

## 1. Personal data collected

| Data | Where in code | Notes |
|---|---|---|
| Account: name, email, password hash, role | `server/calls_db.py` `users`; `server/auth.py` (PBKDF2-SHA256, 240,000 iterations, salted) | Phone optional (`/profile/request-data-export` reads `phone`). Google/GitHub sign-in stores email + name only. |
| Signup attribution ("how did you hear") + Terms/Privacy checkbox | `web-demo/src/pages/Signup.tsx:25-78,194-202`; `POST /onboarding/consent` (`token_api.py:2290`) stores a versioned acceptance | Acceptance is recorded. No age gate found. |
| Team invites | `invites` (email, name, role, token hash, expiry) | |
| Sessions / devices | `user_sessions` (device id, user agent, provider, timestamps), `user_security_events` (event, user agent) | IP address is NOT stored in these tables; IP is used for rate limiting only (`token_api.py:369-381`). |
| Password resets, email verification OTP, email-change requests | `password_resets`, `email_verifications`, `email_change_requests` | |
| Contacts + CSV import | `contacts` (name, phone, email, company, custom_fields, tags, status, source, last_called_at, soft delete) | CSV parsed in the browser (`contactImport.ts`) then sent to the API. |
| DNC list | `dnc_list` | |
| Calls | `calls`: room, visitor identity, lead_name/phone/email/budget/location/timeline/company/use_case/team_size, transcript_json, recording_key (audio in B2), latency + diagnostic JSON, reply language | Caller phone number also in call metadata. |
| Call intelligence | `server/call_intelligence.py`: one OpenAI `gpt-4.1-mini` pass over the transcript (max 30,000 chars) -> summary, sentiment, outcome, QA score, follow-ups; cached on the calls row | Run on demand. |
| Caller memory | `caller_memory` (caller_phone, summary) per agent; `agent/db.py:72,270-312` | A per-caller summary kept across phone calls, only when the agent's `memory_enabled` is on (default off). NOT removed by the retention purge (see gaps). |
| Widget visitor | `widget/src/widget.ts`: sends name, phone, email (form), page path (`location.pathname`), consent version; stores consent timestamp in `localStorage` key `__vistrowConsent:<version>`, greeting-dismissed flag in `sessionStorage` `vistrow-widget-greeting-<siteKey>`; no cookies set by the widget | Consent dialog shown before the microphone opens (first voice call per browser). Dialog says the call "is recorded and transcribed" (accurate only when the customer has recording on). Dialog links the embedding site's own policy when `data-privacy-url` is set. |
| Telephony | `phone_numbers`, caller number via EnableX inbound webhook (`enablex_inbound.py`) | |
| Support tickets | `support_tickets` (user email, category, subject, detail, current page, attachments), `support_ticket_messages`; files via `support_files.py` (B2) | |
| Billing | `billing_profiles` (legal name, GSTIN, address, city, state, pincode, billing email); `invoices` (amount, Razorpay order/payment/invoice ids, period, credits); `subscriptions` | No card numbers: Razorpay handles card entry (`razorpay_client.py`, webhook `razorpay_webhook_events`). |
| API keys | `api_keys`: SHA-256 of key + visible prefix (`calls_db.py:291`) | Shown once. |
| Audit logs | `admin_audit_log` (actor, action, target account/user, detail) — written for impersonate, credit/plan/status changes, password reset, notes | Platform-owner actions only. |
| Copilot | `copilot_actions` (tool, args_json, label, status, result, decided_at) | A log of proposed/approved actions. No table of chat transcripts found; chat text goes to the model provider (OpenAI, falling back to Sarvam) per request. |
| Error events | `error_events` (account, source, level, message, context) | |
| Agent drafts | `agent_drafts` (AI agent builder usage counter, 30/day cap) | |
| Backups | `server/db_backup.py`: daily Postgres dump to B2, 30-day retention (`_RETENTION_DAYS = 30`) | Backups contain all of the above. |
| Worker heartbeats | `admin_db.py` / `ops_alert_worker.py` | Operational status, no personal data identified. |

## 2. Third parties actually called

Source: `server/requirements.txt`, `agent/requirements.txt`, hard-coded base URLs, env var names. "Default" = used for normal operation; "Optional" = only if a customer enables it.

| Vendor | Use | Data sent | Evidence | Status |
|---|---|---|---|---|
| LiveKit Cloud | real-time voice transport, SIP, agent hosting | live call audio, participant metadata | `livekit-agents`, `server/livekit_sip.py`, deploy notes | Default. Region unverified. |
| Sarvam AI | speech-to-text, LLM (`sarvam-105b-conversations`), text-to-speech, Indian-language voices; also copilot fallback and agent builder | audio, transcript text, prompts | `agent/main.py`, `api.sarvam.ai` | Default. Region unverified. |
| OpenAI | LLM for calls, call intelligence, KB extraction, copilot, agent builder | transcript text, prompts, KB text | `api.openai.com` in `call_intelligence.py`, `kb_extract.py`, `help_chat.py` | Default (currently out of credit per issue #2, so effectively not serving). |
| Google (Gemini / Google AI, Cloud TTS, STT fallback) | Gemini Live and LLM, TTS, STT | audio, text | `google-cloud-texttospeech`, `livekit-plugins-google`, `google-genai`, `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Default for agents configured with Google voices/models. |
| ElevenLabs | text-to-speech | agent reply text | `livekit-plugins-elevenlabs`, `api.elevenlabs.io` | Per-agent voice choice. |
| Tavily | optional web-search tool for an agent | search query text | `agent/main.py:3053` (`TAVILY_API_KEY`, `web_search` tool) | Optional, per agent. |
| Groq | OpenAI-compatible LLM | prompts | `agent/main.py:1900` | Admin-gated (not offered to customers). Not listed in the policy; list it if enabled. |
| EnableX | telephony / SIP trunk | caller numbers, call audio | `enablex_inbound.py` | Default for phone calls. |
| Razorpay | payments | name/email/amount; card data entered at Razorpay | `razorpay_client.py` | Used when checkout is on. |
| Railway | application hosting + Postgres | all platform data | `railway.json` | Default. "United States" in the old policy: unverified. |
| Vercel | web app hosting; Vercel Web Analytics | page requests | `web-demo/vercel.json`, `@vercel/analytics` | Default. |
| Backblaze B2 (S3 API) | call recordings, DB backups, avatars, support files | audio, files, DB dumps | `server/storage.py` (`B2_ENDPOINT_URL`, `B2_REGION`) | Default. Region value lives in env; old policy says US: unverified. |
| Resend | transactional email (SMTP fallback exists) | recipient email, message | `server/email_sender.py:169` | Default. |
| Google Analytics (G-YSY7Z22NS2), Microsoft Clarity | website/app analytics, session replay (masked) | page, click, device | `web-demo/index.html:43-52`, `web-demo/src/lib/analytics.ts` | Default. Clarity masks all text in the app. |
| Google sign-in, GitHub sign-in, Slack | optional account sign-in / notifications | email, name; Slack incoming-webhook URL | `token_api.py:795-1500` | Optional. |
| Google Sheets, Zoho CRM, ArthaLeads, generic webhooks | customer-connected lead delivery | lead fields (name, phone, email, details, call id, recording link, transcript for ArthaLeads) | `integrations_dispatch.py`, `google_sheets.py`, `calls_db.py:941` | Optional, per tenant. |
| Facebook Lead Ads / WhatsApp | code still exists | — | `token_api.py:1325-1407` | Not offered (owner decision, PR #50). Not mentioned in the policy. |

No Deepgram, Cartesia, AssemblyAI, Cloudflare R2, Sentry, or Zapier-specific code found (code comments mention R2 historically; the live endpoint is B2 via env).

## 3. Google user data

- Sign in with Google: scopes `openid email profile` (`token_api.py:843`); reads email, verified flag and name from the userinfo endpoint (`token_api.py:880-905`). Used to find or create the account.
- Google Sheets integration: scope `openid email https://www.googleapis.com/auth/drive.file` (`server/google_sheets.py:46`). `drive.file` only exposes files the app created. The app creates one spreadsheet titled "Vistrow Voice — Leads" (`SPREADSHEET_TITLE`), writes lead rows and formatting, and per-agent tabs. Columns: date/time, name, phone, email, company, channel, agent, language, duration, details, page, recording link, call id.
- Tokens: `access_type=offline`, `prompt=consent`; access + refresh token stored in `integrations.config_json` in Postgres. No application-level encryption of that blob was found.
- Revoke: disconnect calls Google's revoke endpoint (`token_api.py:1289` -> `google_sheets.revoke`).
- **Google Calendar: there is no Google Calendar OAuth in the code.** Searched `auth/calendar`, `calendar.events`, `googleapis.com/calendar`, `freeBusy` across server, agent and web-demo: none. Appointment booking uses Vistrow's own `appointments` table (`agent/tools.py:1544` "native appointments system"). The old policy section 3 described a `calendar.events` scope we do not request. Removed.
- No use of Google data for ads, none for model training, no transfer other than to provide the feature (the lead data a customer's own agent captured is sent to the customer's own sheet).

## 4. Retention and deletion actually implemented

- Customer retention setting `retention_days` (default `0` = keep forever) and `record_calls` (default `false`): `calls_db.py:10301-10313`. Daily job at 02:00 UTC (`server/retention_worker.py`) deletes `calls` rows older than N days and the recording objects in B2 (`purge_expired_calls`, `calls_db.py:10565`). Covers the call row (transcript, lead fields, intelligence, recording). Does NOT cover contacts, caller memory, appointments, support tickets.
- DB backups: daily, 30 days (`db_backup.py`). Deleted data can persist in a backup for up to that period (inference from the above, not tested).
- Self-serve data export: `POST /profile/request-data-export` (`token_api.py:2174`): profile, preferences, security events; owners/admins also get agents, calls (up to 10,000), contacts, appointments, knowledge bases, integrations (without config), billing summary.
- Account deletion: `POST /profile/request-account-deletion` (`token_api.py:2229`) needs email + typing DELETE; emails the user; creates a `privacy_requests` row; alerts the support inbox; promised review "within 2 business days"; cancellable until processing starts. Deletion itself is a manual admin action (`/admin/privacy-requests`). No automated erasure route found.
- Recording delete: `POST /storage/recordings/delete` (`token_api.py:2936`).
- Billing/tax retention: no retention period or "8 years" statement exists in the repo. The policy says only "as long as law requires".

## 5. Security measures implemented

- Passwords: PBKDF2-SHA256, salted (`auth.py:24-46`). Session token signed, 30-day expiry (`auth.py:55`), cookie httpOnly, SameSite=lax, `secure` flag controlled by `AUTH_COOKIE_SECURE` env (`token_api.py:120`).
- Device list with sign-out of one/all other devices (`token_api.py:2150-2170`); security events recorded.
- API keys stored as SHA-256 only.
- Roles: owner, admin, member, viewer (`require_role`); owner/admin can export workspace data.
- Platform-owner "View as" (impersonation): 2-hour session (`auth.IMPERSONATION_TTL_SECONDS`), own session row visible in the customer's device list with provider "support", audit entry `impersonate` in `admin_audit_log`, banner in the dashboard. Exit route exists.
- Recordings in B2; dashboard playback via presigned URLs (1 hour, `ExpiresIn=3600`).
- Not found: MFA/2FA, app-level encryption of stored OAuth tokens, login lockout (only token-endpoint rate limiting by IP, `token_api.py:540`), formal certifications.

## 6. Controller / processor, consent, compliance controls

- Customer-as-controller: widget code itself states the embedding site is the data fiduciary (`widget.ts:42-46`). Policy and Security page already say Vistrow is processor for call data.
- Recording consent: `record_calls` default off (`agent/db.py:750-771` comments: never record without the operator enabling it); `require_consent` default off; widget consent dialog (DPDP notice) before the mic. No spoken "this call is recorded" announcement for phone calls was found in prompts (`grep recorded agent/prompts` -> nothing): the customer must configure it.
- DNC: `dnc_list`, `honor_dnc` default true; calling window `enforce_window` default true, 09:00-21:00, Mon-Sat, Asia/Kolkata.
- Children: no age gate at signup; existing policy says not directed at under-18s.
- Grievance contact: only addresses in the repo are `vistrowai@gmail.com` (all legal pages, Security report link), `support@vistrowvoice.com` (`web-demo/src/lib/support.ts`, ticket system), and sender addresses. No named grievance officer, DPO, registered address or CIN anywhere. The legal name "Vistrow Technologies Pvt. Ltd." appears only in a test fixture and in the owner's instruction.
- Breach notification: no incident-response doc in `docs/` was found.

## 7. Gaps found (for the owner)

1. Privacy policy described a Google Calendar integration and `calendar.events` scope that does not exist; the real Google scope (Sheets `drive.file`) and Google sign-in were undisclosed. Fixed in copy. Verify the OAuth consent screen / verification submission lists the same scopes.
2. Security page said recording playback is only via short-lived signed URLs for authenticated members. Recording links placed in CRM/Sheets are permanent bearer-token URLs (`token_api.py:2974`) that redirect to a 1-hour signed URL. Anyone with the link can play. Copy corrected; product decision needed (expiry/revocation).
3. Retention purge leaves `caller_memory` (phone + summary), contacts, appointments and tickets. Default retention is indefinite.
4. Account deletion is a manual review; no automated erasure or documented deletion of backups/vendor copies.
5. No MFA; OAuth tokens stored without app-level encryption.
6. No named grievance officer / DPO or registered address (DPDP Act requires grievance redressal contact; check Rules for contact details of a DPO if you are a Significant Data Fiduciary — unlikely but a lawyer should say).
7. No spoken recording/AI-disclosure announcement default on phone calls; widget dialog says calls are recorded even when the customer has recording off.
8. Old policy said "calls may be recorded for quality, training" — training claim removed; recording is a customer setting.
9. Old policy and Security page said checkout is off / no card data. Razorpay billing code exists; wording made conditional.
10. Sub-processor regions (Railway, B2, LiveKit, Sarvam, Google) not provable from code.

## 8. Additional facts from the second pass

- Cookies actually set (all httpOnly, server-side): `vv_session` (30 days), `vv_device` (365 days, device identifier for the device list), and 10-minute OAuth state cookies (`vv_oauth_state`, `vv_slack_integration_state`, `vv_zoho_integration_state`, `vv_google_sheets_integration_state`, `vv_facebook_integration_state`). The old policy listed only one session cookie.
- Browser storage on web-demo: theme, sidebar state, timezone, table widths, usage range, recent command-menu items, demo-call counter `vistrow_demo_calls_used`, demo consent `__vistrowConsent:<version>` (localStorage); chunk-reload guard and support-session return path (sessionStorage).
- No cookie-consent banner exists. Google Analytics 4 (`web-demo/index.html:47`), Clarity and Vercel Analytics load without opt-in. Clarity masks all text on `app.vistrowvoice.com`, never runs on `/admin`, and staff/impersonating sessions are excluded (`web-demo/src/lib/analytics.ts`, `DashboardLayout.tsx:699`). Vercel Analytics strips non-`utm_` query strings and invite tokens (`main.tsx:50-67`).
- Widget pushes `vistrow_widget_lead_submit` with visitor name, phone, email into the host page's `window.dataLayer` (`widget.ts:1752-1760`): any tag manager on the customer's site can read it. Customers (as controllers) should know.
- Widget chat (`/widget/chat`) logs the conversation as a call; widget `site-config`/`warm`/`token` calls send the page path only (not full URL, referrer or user agent).
- Public contact form `/public/contact` is emailed to the sales inbox and not stored in the DB; on email failure the payload is logged (`token_api.py:1693`).
- Support attachments are stored in B2 and purged 14 days after a ticket is resolved (`support_files.py:25`); the schema comment saying they are not retained is stale.
- Other automatic deletions: integration delivery log 30 days, notification dismissals 30 days. No purge for sessions, error events, audit log, security events, invoices or billing profiles.
- Contact delete is a soft delete (`deleted_at`); team-member delete is a hard delete.
- Providers not in the old policy that the code can call: Tavily (optional agent tool), Groq (admin-gated), Jev AI (`agent/jev_intent.py`, inert unless `JEV_API_KEY`, sends one caller utterance), Zoho CRM (scopes `ZohoCRM.modules.leads.CREATE,READ`), Resend inbound email (support replies), Google Cloud STT Chirp 3 (default location `asia-southeast1`, `agent/main.py:2155`).
- Regions determinable: LiveKit agent worker `ap-south` (`start.sh:8`); Google Cloud speech `asia-southeast1` default; B2 region from `B2_REGION` env (backup default `us-east-005`); everything else not determinable.
- Zoho sends: name, company, phone, email, summary/description, use case, agent, call length, language, page, recording URL. Slack sends a lead summary and a short transcript preview. ArthaLeads and generic webhooks receive the full transcript. Recording links in these payloads are permanent bearer-token links.
- Facebook Lead Ads code still exists (`token_api.py:1294-1420`, `/webhooks/meta`); not mentioned in the policy per owner decision.
- Existing policy said deletion requests are actioned within 30 days; the app tells the user a review happens within 2 business days. Policy now describes the in-app flow and says requests are verified first.
- Discrepancy: Security page said only owners can change compliance settings; the compliance routes require admin or higher (`token_api.py:4505,4524`). Fixed in copy.
- Existing security claim "Passwords ... Session tokens are signed" is accurate; the `secure` cookie flag depends on env `AUTH_COOKIE_SECURE` (production value unverified). HSTS (1 year) and `X-Frame-Options: DENY` are set in code.
- Impersonation is audited (start, exit, and every non-GET request as `impersonate_write`) and cannot delete, change billing, team, API keys or recordings; it does not require a stated reason.
- No incident-response / breach-notification procedure document exists.
