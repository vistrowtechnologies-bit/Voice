# Recording share links and retention purge: verified findings (2026-10-13)

Follows `docs/PRIVACY-AUDIT-2026-10-12.md` gaps 2 and 3. Written by Claude on branch
`claude/recording-links-retention` from `origin/main` at `b30448c3`, **before** any code change.
Line numbers refer to that commit. "Verified" means read in code, run locally, or counted in the
production database (read-only, `SET default_transaction_read_only = on`, counts only, no IDs or content).

## A. Recording share links

### How the link is built

| Where | What | Cite |
|---|---|---|
| Live calls (agent) | A fresh `secrets.token_urlsafe(32)` (256-bit) is generated for **every** saved call, whether or not recording is on, stored in `calls.recording_share_token`. | `agent/main.py:8128`, written at `agent/main.py:8150`, `agent/db.py:1522,1566` |
| Live calls (agent) | The lead sent to integrations carries `recording_url = {PUBLIC_BASE_URL}/public/calls/{call_id}/recording?token={token}` (default host `https://api.vistrowvoice.com`). | `agent/main.py:8257-8261` |
| Manual "Push to ArthaLeads" (server) | `ensure_call_recording_share_token` reuses the stored token or creates one if the row has none; URL only when the call has a recording. | `server/integrations_dispatch.py:505-509`, `server/calls_db.py:3147-3167` |
| Google Sheets cell | Rewrites `/recording?token=` to `/play?token=` and writes a "Play recording" hyperlink. | `agent/tools.py:906-917`, server twin `server/google_sheets.py:445-466` |
| Public routes | `GET /public/calls/{id}/recording?token=` looks up `recording_key` by `id AND recording_share_token = token`, then 307-redirects to a fresh 1-hour B2 presigned URL. `GET /public/calls/{id}/play?token=` is an HTML player for the same check. Both are exempt from the session check via `_PUBLIC_PREFIXES`. | `server/token_api.py:3421-3439`, `3442-3478`, `151`; lookup `server/calls_db.py:3127-3144` |

### Is it a permanent bearer token?

**Yes (verified).** No expiry column, no expiry check, no issued-at timestamp. The lookup is only
`WHERE id = ? AND recording_share_token = ?` (`calls_db.py:3139`). Anyone holding the URL can play the
audio for as long as the call row and its `recording_key` exist. The B2 URL it redirects to is
short-lived (1 hour) but the share URL itself is not.

### When does it stop working?

| Event | Link keeps working? | Why |
|---|---|---|
| Recording deleted (single call or "older than N days") | **No, stops** | `delete_call_recordings` sets `recording_key = NULL` (`calls_db.py:10943`); lookup requires a non-empty key (`calls_db.py:3142`). |
| Call purged by retention | **No, stops** | `purge_expired_calls` deletes the call row (`calls_db.py:10849`). |
| Integration disconnected (Sheets, Zoho, ArthaLeads, webhook) | **Yes, keeps working** | The token lives on the call row and is not linked to any integration. Links already written into a sheet or CRM stay playable. |
| Account deleted | **Yes, until someone deletes the call rows** | Account deletion is a manual review (`token_api.py:2633-2657` only files a `privacy_requests` row; `admin_db.update_privacy_request` at `admin_db.py:161` only changes its status). No code deletes accounts or their calls (`grep "DELETE FROM accounts"` finds nothing). The public lookup does not check that the account exists. What the operator actually deletes by hand is **UNVERIFIED**. |
| Recording turned off later | Yes for existing recordings | Toggle only affects new calls. |

### Revoke / rotate

**None exists (verified).** The only writers of `recording_share_token` are the agent's insert and
`ensure_call_recording_share_token`, which never replaces an existing token. There is no route,
setting or admin action to revoke or rotate.

### Response headers on the public endpoint (verified by running the ASGI app locally)

```
/public/calls/2/recording 307  cache-control: no-store, no-cache, must-revalidate   referrer-policy: strict-origin-when-cross-origin
/public/calls/2/play      200  cache-control: no-store, no-cache, must-revalidate   referrer-policy: strict-origin-when-cross-origin
```

- Cache-Control: `no-store` (the route's own `private, no-store` is overwritten by the global
  `no_store_api_responses` middleware, `token_api.py:160-169`). Acceptable.
- X-Robots-Tag: **absent** on both. The play page has `<meta name="robots" content="noindex">`
  (`token_api.py:3458`); the `/recording` redirect has nothing.
- Referrer-Policy: `strict-origin-when-cross-origin` (global, `token_api.py:474`), not `no-referrer`.
  The token is in the query string of the play page; the browser would send only the origin
  cross-site, so leakage via Referer is limited, but `no-referrer` is stricter.
- Content-Disposition: **none**; the redirect target is a B2 presigned URL without a
  `ResponseContentDisposition` override, so the browser decides (WAV often downloads, hence `/play`).
- Rate limiting: **none** on either route. A DB-backed limiter pattern exists: `_limited(bucket, key,
  max_hits, window_s)` (`token_api.py:7013-7029`) keyed by `_client_ip` (`token_api.py:479-491`).
  Guessing is not realistic (256-bit token), so this is abuse/cost protection only.

### Which integrations actually carry the link

| Integration | Carries recording URL | Controlled by field choice? | Cite |
|---|---|---|---|
| ArthaLeads | Yes (`recording_url`, `recording_mime_type`), every completed call with name+phone | No (not field-configurable) | `agent/tools.py:686-689`, `server/integrations_dispatch.py:214` |
| Zoho CRM | Yes, as a "Recording: <url>" line in Description | No | `agent/tools.py:742-743` |
| Generic webhook | Yes (full lead JSON) | **Yes**, "recording" field | `agent/tools.py:707`, field map `agent/tools.py:1324`, keys `1327` |
| Google Sheets | Yes, "Play recording" cell (column 12) | **Yes**, "recording" field (column hidden when off) | `agent/tools.py:947`, `server/google_sheets.py:269,494` |
| Slack | **No** (text is name/phone/company/use case only) | n/a | `agent/tools.py:695-697` |
| WhatsApp | No | n/a | `agent/tools.py:698-702` |

Note: the agent puts a `recording_url` on every completed-call lead, even when the account has
recording off; the link then answers 404 ("This recording isn't available..."). Not changed here.

### Production counts (read-only, 2026-10-13)

| Metric | Count |
|---|---|
| Calls (all) | 1,216 |
| Calls with a share token | 278 |
| ... of which still have a recording (link plays) | 237 |
| Calls with a recording | 820 |
| Accounts | 7 |
| Accounts with a saved compliance config | 2, both with `record_calls` on |
| Accounts with any stored recording | 2 |
| Accounts with retention set (>0 days) | 0 |
| Connected integrations | arthaleads 1, sheets 1, zoho_crm 1 |

## B. Retention purge

### Where configured, default, when it runs

- Setting: `retention_days` in the account's `compliance.config` JSON blob, default `0` = keep
  forever (`calls_db.py:10577-10581`); edited on Dashboard > Compliance, "Data retention (days)"
  (`web-demo/src/pages/Compliance.tsx:283-291`, admin+ via `PATCH /compliance/settings`,
  `token_api.py:4993-4998`).
- Runs: daily at/after 02:00 UTC for every account (`server/retention_worker.py:28,43-55`), plus
  opportunistically on every `GET /compliance/settings` (`token_api.py:4981-4990`).
- Production: 0 of 7 accounts have retention set, so the purge currently deletes nothing.

### What it deletes (verified, `calls_db.py:10833-10867`)

- The `calls` rows older than N days by `started_at`, in **one** unbatched `DELETE ... RETURNING`.
  That row holds the transcript, lead fields, summary/intelligence columns, latency/diagnostics,
  consent JSON and the share token, so links die with it.
- The recording objects: after the rows are deleted, `_delete_recording_objects` calls
  `delete_object` per key on Backblaze B2 (S3 API) (`calls_db.py:10955-10978`). Storage is B2 only;
  no R2 code exists (`server/storage.py`).
  - Failure mode (verified in code): the object is deleted **after** the row is gone and errors are
    only logged. If B2 is down or not configured, the audio stays in B2 with nothing pointing at it,
    forever (no sweep exists despite the comment "left to be swept later").
  - **UNVERIFIED:** whether the B2 bucket keeps old versions. On B2, an S3 `DeleteObject` without a
    `VersionId` on a bucket with the default "keep all versions" lifecycle only hides the file; the
    bytes remain until a lifecycle rule removes hidden versions. Bucket lifecycle settings were not
    read (no B2 API calls made). Owner should check the bucket's lifecycle rule in the B2 console.

### What it leaves (verified)

| Data | Linked to the call? | Holds call-derived content? | Today |
|---|---|---|---|
| `caller_memory` (agent_id, caller_phone, rolling summary, updated_at) | No call_id; keyed by caller phone, refreshed by each phone call when the agent's memory is on (`agent/db.py:290-312`) | **Yes**: an LLM summary of the caller's calls | Never purged. 38 rows in production. |
| `integration_deliveries` (lead_name, call_id, detail <= 500 chars of status/error text) | `call_id` | Caller's name; no transcript or payload is stored | Rows > 30 days removed only when someone opens that integration's Activity tab (`calls_db.py:7544-7556`); not tied to retention. 194 rows, none older than 30 days. |
| `contacts` (name, phone, status, source='call', last_called_at) | No call_id; derived from calls by phone (`calls_db.py:4530-4580`) | Name/phone only; no transcript or recording fields | Business record; kept. Soft-deleted on delete. |
| `contact_notes` | No | Operator-written only (`calls_db.py:5060-5080`) | Kept. |
| `appointments` (purpose, notes) | `call_id` column exists but the agent always writes `NULL` (`agent/db.py:1078-1081,1119-1123`); 0 production rows have a call_id | `purpose` is what the agent was told the visit is for; `notes` is "Wanted <day> <time>" for callbacks | Business record; kept. Cannot be tied to a purged call. |
| `campaign_contacts` (outcome, call_id) | `call_id` | Outcome label only | Kept. |
| `support_tickets` / messages | No | Customer-to-Vistrow support, not caller data | Kept (attachments purged 14 days after resolution, `support_files.py:25`). |
| `error_events` (message, context) | No | May contain fragments of caller data in error text: **UNVERIFIED** per row | No purge at all. |
| DB backups in B2 | n/a | Everything | 30-day rolling (`server/db_backup.py:35`), so purged rows persist in backups up to 30 days. |
| Copies already delivered to Sheets/Zoho/ArthaLeads/webhooks | n/a | Lead fields, transcript (ArthaLeads/webhook), link | Outside our control; the link stops playing once the call is purged. |

## Decisions this supports (Phase 2)

1. Links: add expiry (account setting, default 90 days for new links, existing links grandfathered),
   "Revoke all recording links", stop links when the account row is gone, add `X-Robots-Tag: noindex`
   and `Referrer-Policy: no-referrer`, and an IP rate limit using `_limited`.
2. Purge: batch it; delete B2 objects first and keep a row for retry when its object could not be
   deleted (no more silent orphans); also delete `caller_memory` rows last refreshed before the window
   and `integration_deliveries` rows older than the window or tied to purged calls. Contacts,
   appointments, campaign contacts and tickets hold no transcript/recording fields: leave them and
   document it. `error_events` and backups: document only.

## Phase 2: what changed (same branch, after this document was written)

- `calls.recording_link_no_expiry` (new column). Created once by `init_tables`; in that same run every
  call that already had a share token is set to 1 (grandfathered). Later starts never backfill again.
- Compliance setting `recording_link_expiry_days`: 0 (never), 7, 30, 90; default 90. Saved through the
  existing `PATCH /compliance/settings`; read at request time by `calls_db.recording_link_expired`, called
  from `get_shared_call_recording_key` for every non-grandfathered link. Measured from the call's start.
  Changing the setting applies to all non-grandfathered links, including ones already sent.
- `get_shared_call_recording_key` joins `accounts`, so a call row left behind after a manual account
  deletion no longer plays.
- `POST /storage/recordings/revoke-links` (admin+, refused in "View as" by the existing
  `storage/recordings` block, written to `admin_audit_log` and the user's security events) clears every
  share token of the account. A manual "Push to ArthaLeads" afterwards mints a new token under the
  expiry setting; new calls get new tokens as before.
- Public routes: `Cache-Control: private, no-store`, `X-Robots-Tag: noindex, nofollow`,
  `Referrer-Policy: no-referrer` (outermost middleware), and 120 requests/minute per IP via `_limited`.
- Retention purge: batches of 500; B2 objects deleted first and a row is kept for the next run when its
  object could not be deleted; when storage is not configured at all, rows are still deleted (as before).
  Also deletes the purged calls' `integration_deliveries` rows, delivery rows older than the window, and
  `caller_memory` rows not refreshed within the window. Contacts, appointments, campaign contacts,
  tickets, `error_events` and backups are unchanged.
- Dashboard: Compliance > "Consent, recording & retention" card gets "Recording link expiry" and
  "Revoke links" (hidden for non-admins and in "View as").

Still open: B2 bucket version lifecycle (UNVERIFIED, see above); `error_events` has no purge; the agent
still attaches a recording link to leads from accounts with recording off (the link answers 404).
