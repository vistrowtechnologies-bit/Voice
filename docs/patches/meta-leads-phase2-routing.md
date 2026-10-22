# Patch: Meta Lead Ads Phase 2 routing (server/meta_leads.py, server/test_meta_leads.py)

Branch `claude/meta-p2-routing` could not edit these two files: the edit guard reserves them for PR #256 (`claude/meta-leads-phase1`), and the brief says not to work around the guard. The change was built and verified in a scratch copy of `server/` and is delivered here as exact unified diffs against commit 716dcd2f (the tip of `claude/meta-leads-phase1`). Both diffs pass `git apply --check` on that commit.

Apply on `claude/meta-leads-phase1`:

```bash
git apply docs/patches/meta-leads-phase2-routing.patch
```

(The `.patch` file next to this note is the raw diff; this note explains it.)

## What the diff adds to `server/meta_leads.py`

- `resolve_route(account_id, page_id, form_id, ad_id) -> (route, reason)`: exact match, **ad rule > form rule > Page default**. `route = {"agentId", "fromNumber", "label", "matchKind": "ad"|"form"|"page"}` with `reason ""`; otherwise `(None, reason)` where reason is `no_rules`, or why the winning match cannot be used: `agent_paused`, `agent_missing`, `agent_demo`, `number_inactive`, `no_number`. The winning match is never skipped for a less specific one.
- Rules: `list_rules`, `create_rule` (ValueError with a plain-English detail; `DuplicateRule`), `delete_rule` (account-scoped), `options` (this account's forms, ads seen on its leads, live agents, active numbers).
- `meta_ads` table filled from every processed lead (`_remember_ad`), so the rules screen shows ad names.
- `meta_lead_events` gains `route_agent_id`, `route_from_number`, `route_label` (CREATE for fresh databases + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in `init_tables` for existing ones).
- `process_event`: resolves the route, stores it on the event and as `custom_fields.route_label`; a winning rule whose agent is paused (or number released) **skips** the call with that reason (the lead is still kept as a contact); no rules at all → today's generic agent with event reason `no_route_generic_agent`; the route is passed to `calls_db.ingest_inbound_lead(route=...)` only when that function accepts it (checked with `inspect.signature` at import; otherwise the generic path with reason `route_not_wired_generic_agent` and one log line).
- Router: `GET/POST /integrations/meta/rules`, `DELETE /integrations/meta/rules/{id}`, `GET /integrations/meta/options`.
- Coordinator additions (22 Oct): `GET /integrations/meta/leads` items now carry `call_id` (from `campaign_contacts.call_id`), `name` and `phone` (from the queued contact, else from `inbound_lead_events`), plus `route_agent_id`, `route_from_number`, `route_label`; the route is a thin wrapper over `list_events(account_id, limit)`. The `integrations` row for key `facebook` is kept in step: `connect_pages()` (extracted from the POST /pages route) calls `calls_db.update_integration("facebook", "connected", {"pages": <active count>}, account_id)` when at least one Page connected, `disconnect()` sets it `not_connected` with `{}`; never a token in that config. `GET /integrations/meta` (`status_for()`) reports `connected` only when the connection is `connected` AND at least one active Page exists.

## Contract (what the dashboard codes against)

```
GET    /integrations/meta/rules      -> {"items": [{"id", "pageId", "matchKind": "ad"|"form", "matchValue",
                                                     "agentId", "fromNumber", "label", "position"}]}
POST   /integrations/meta/rules      {"pageId", "matchKind", "matchValue", "agentId", "fromNumber"?, "label"?}
                                     -> {"ok": true, "item": {...}}
                                        400 {"detail": "<plain English>"}  bad page / agent / number / kind
                                        409 {"detail": "A rule for that ad or form already exists. Delete it first to change it."}
DELETE /integrations/meta/rules/{id} -> {"ok": true}; 404 when not this workspace's rule
GET    /integrations/meta/options    -> {"forms": [{"pageId", "formId", "formName", "label"}],
                                         "ads": [{"pageId", "adId", "adName", "campaignName"}],
                                         "agents": [{"id", "name", "status"}],
                                         "numbers": [{"number", "agentId"}]}
```

`GET /integrations/meta/leads` items now also carry `route_agent_id`, `route_from_number`, `route_label` once the columns exist (the SELECT is unchanged; add them to the dashboard's Leads tab when wanted).

## Verification (scratch copy of server/, fresh Postgres `vv_p2r`)

- `test_meta_leads.py`: **26 passed**, twice on the same database (the 16 Phase 1 tests untouched, 10 new: precedence, foreign agent/number/page refused, other workspace's rule never matches, paused agent skips with the reason, duplicate rule, options scoped, route stored on the event and queued through the rule's agent, no-rules generic reason, leads list with name/phone/call_id, integrations card + status on connect/disconnect).
- Full server suite with this diff **and** `docs/patches/calls_db-meta-route.md` applied: **963 passed** (scratch copy with `agent/`, `web-demo/`, `orchestrator/`, `docs/`, `railway.json` linked in).
- Mutation checks (one guard broken at a time, failures out of 24 at the time of the run): ad/form precedence swapped → 1; agent/account check dropped → 2; account scope dropped from the rule lookup → 13; paused-agent skip dropped → 1. With `_INGEST_ACCEPTS_ROUTE` forced False (route parameter not wired) → 0 failures: the fallback path is clean.

## Not done / not verified

- No bell notification when a lead is skipped for `agent_paused` (the plan's Phase 2 done-check mentions one); only the event reason is set.
- The rules routes were exercised as functions, not over HTTP (consistent with Phase 1's tests).
- The `.patch` was generated against 716dcd2f; re-run `git apply --check` if the branch has moved.
