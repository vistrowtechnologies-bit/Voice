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

