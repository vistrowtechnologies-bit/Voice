# Artha Copilot: from help chat to actions (plan, 2026-10-10)

Owner's ask: the dashboard's "Artha - Help Assistant" is branded Copilot. Make it
able to work on the tenant's behalf using the tenant's own data: "build an
agent for me" (guided chat), "turn off the real estate agent", "what does
Abhishek want / his requirements", "which integrations are failing", "book a
callback". Premium feature for Growth and above. Not built yet.

## 1. What exists today

- `server/help_chat.py`: OpenAI Chat Completions over stdlib `urllib`, model
  `gpt-5-nano`, JSON-mode output. Tool calling exists but is **single-round**
  (every tool call runs once, then the final answer is produced).
- Context: system prompt + help docs + today's date + "The user is currently
  viewing: <page>" + the open call record when on `/dashboard/calls/<id>`.
  History capped at 6 turns / 2,000 chars.
- Read tools in `server/help_tools.py`: `dashboard_stats`, `calls_on_date`,
  `hottest_leads`, `billing_snapshot`, `contacts_stats`, `find_recent_calls`
  (no transcript), `integration_status` (no deliveries), `search_help_articles`.
  All inject `account_id` from the session.
- Route `POST /help/chat` (`token_api.py`), per-user limiter 12/min, 200/day.
  No role check, no plan gate.
- Frontend `web-demo/src/components/HelpChatWidget.tsx`: per-route suggested
  questions, "Read: <article>" chips (server-validated slugs), "Open <Page>"
  chips (client-side string match), "Submit a request".

## 2. Functions to expose as tools

Role model: `calls_db.ROLE_RANK` (viewer < member < admin < owner). Copilot
tools bypass the HTTP routes, so the executor must re-check roles itself.

Read (any role, Phase 1), all in `server/calls_db.py`:
- `list_agents` → id/name/status/model label/voice/language/number.
- `list_calls(search=…)` → `get_call` (transcript + intelligence summary,
  key points, action items), `contact_detail`, `list_contacts`.
- `list_integrations` (strip `config` entirely) + `list_integration_deliveries`
  (`status="failed"`) for "which integrations are failing".
- `list_appointments`, availability check, `billing_summary`,
  `list_phone_numbers`, `account_entitlements` (so the model knows the plan).

Write (Phase 2/3), through the same guards the routes use:
- Create agent: `create_agent` after `_guard_stt_provider`, `_guard_voice_tier`,
  `_guard_realtime_voice`, `_guard_admin_only_model` (extract from
  `token_api.py` into a shared helper). Role member+. Catch `AgentLimitError`.
- Update agent: `update_agent` with an explicit allowlist (status live/paused,
  name, language, voice, systemPrompt, crmIntegrationKeys). Never
  `isPlatformDemo` / `publicDemoSlug`.
- Appointment/callback: `book_appointment_native(..., source="copilot")`.
  "Callback" = appointment with purpose "Callback" (no callback entity exists).
- Assign number: `assign_phone_number`.
- Integrations: only `update_integration_settings` (events/fields), admin only.
  Never tokens, never OAuth starts.

## 3. Design

- **Tool loop**: new `server/copilot.py`, bounded (max 4 rounds, 8 tool calls),
  used when the account is entitled; else today's path. Consider
  `gpt-4.1-mini` for action turns.
- **Registry** `server/copilot_tools.py`: each tool has schema, fn, min_role,
  feature, mutating flag and `describe(args)` for the confirmation line.
- **Confirmation**: a write tool never runs on the first pass. The reply
  carries `pendingAction {token, label, tool, args}`; the token is HMAC-signed
  `{account_id, user_id, tool, args, exp +10 min}`. The chat chip posts to
  `POST /help/chat/confirm`, which verifies signature, account/user, expiry,
  re-checks role and plan, executes, audits.
- **Audit**: table `copilot_actions` (account, user, tool, args, result,
  status, time); shown in Settings and in the admin account view.
- **Plan gate**: `FEATURE_MIN_PLAN["copilot_actions"] = "growth"` in
  `agent/plan_policy.py`. Plans in code are starter/growth/scale; "Enterprise"
  = `scale`. Starter gets an upgrade chip instead of write tools.
- **Caps**: account-level daily caps (e.g. 150 copilot messages, 40 writes)
  stored in `copilot_actions`, not in memory; tool results truncated (~4k
  chars, last 40 transcript turns).
- **Injection safety**: every tool result is wrapped as untrusted data; writes
  only via the confirm endpoint; ids always re-scoped by `account_id`; no
  admin tools; writes refused in impersonation sessions.

## 4. "Build an agent" guided flow

`server/copilot_builder.py` state machine with chip options:
1. Business name and what it does.
2. Use case: inbound qualification / outbound follow-up / appointments /
   support (picks a prompt template and functions).
3. Language: Hindi / English / Hinglish / Marathi / Tamil / other.
4. Voice from `voice_catalog.allowed_tiers_for_plan(plan)` for that language.
5. Channel: widget / phone number (unassigned numbers listed) / both.
6. Review card → confirm → create (paused) + assign number, then chips "Test
   in the Testing Lab" and "Go live".

Defaults verified in code: model `sarvam/sarvam-105b-conversations` ("Vistrow
Bharat"), STT sarvam, language `hi-IN`. **Backend default voice is `pooja`**
(set 2026-09-14 when Google Chirp3 billing was blocked), not Myra HD
(`google:chirp3:Achernar`). Use Myra HD only if Chirp3 is confirmed back.

## 5. Phases

| Phase | Scope | Effort | Files | Tests |
|---|---|---|---|---|
| 1 | Read-only answers over tenant data (agents, a contact's requirements with summary/action items/trimmed transcript, failing integrations, appointments, numbers); bounded loop; untrusted wrapper; new suggestions | 3-4 days | help_tools.py, help_chat.py, HelpChatWidget.tsx | test_help_tools.py (no tokens leak, truncation, account_id), loop termination |
| 2 | Write actions with confirmation chip, signed token, audit table, plan gate, daily caps, shared agent guards | 5-7 days | copilot.py, copilot_tools.py, calls_db.py, plan_policy.py, token_api.py, types.ts, api.ts, HelpChatWidget.tsx | test_copilot_actions.py (tamper/expiry/cross-account, viewer denied, no write without confirm, audit row), test_plan_policy.py |
| 3 | Guided agent builder | 4-5 days | copilot_builder.py + tools, widget option chips | test_copilot_builder.py (plan-filtered voices, agent limit, created paused, defaults) |

## Owner decisions (2026-10-10)
- Gate `copilot_actions` at `growth` (Scale counts as Enterprise).
- Default voice for built agents: `pooja` for now.
- Build Phase 1 first (branch `claude/copilot-phase1`).

## Open questions for the owner (remaining)
1. Keep read-only copilot answers on Starter, gating only writes?
2. "Book a callback" = appointment with purpose "Callback"?
3. `gpt-4.1-mini` for action turns, or stay on `gpt-5-nano`?
4. Block copilot writes during super-admin impersonation? (recommended)
