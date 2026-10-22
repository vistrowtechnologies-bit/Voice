# Meta Lead Ads → AI call: implementation plan (2026-10-22, revised after the owner's challenge)

Owner request: a customer connects Facebook/Instagram with one login, maps each form and each ad to its own AI agent (like the website widget's page rules), and every lead is **called within 60 seconds** with every form answer and the ad context already in the agent's hands. Later: Click-to-WhatsApp ads mapped by ad id. Zero mistakes, fits the existing menus and structures. **Growth plan only.**

Built on three verified sources: the Vistrow Voice code (a dormant Facebook integration already exists), the ArthaLeads code (a working but flawed version of the same thing), and Meta's current developer docs. Every "today" statement was checked in the code on 22 Oct 2026.

Owner decisions already taken (22 Oct):
- **The form is the consent.** A person who typed their number into "call me about this" has asked for the call. No extra checkbox. We store form id, submission time and the answers as the record. The one TRAI point kept: explicit transactional consent is treated as valid for 7 days, so the nurture sequence for a lead who **never answered** stops after day 5 (the day-10 step is skipped for never-reached leads).
- **Growth only.** Starter accounts do not see the card.
- **Promise: called within 60 seconds** of the form submission, inside the customer's calling hours, when the customer's line is free. Measured, not claimed: p50/p95 lead→dial shown on the Overview.

---

## 0. What exists today, and what is wrong with it

| Piece | Where | State |
|---|---|---|
| "Connect with Facebook" OAuth start/callback | `server/token_api.py:1520-1640` | Works for exactly **one** Page. Zero Pages → `no_pages`, several → `multiple_pages`, no picker. Stores a **short-lived** Page token, never exchanged for a long-lived one. No disconnect, no unsubscribe, no deauthorize/data-deletion callback. |
| Meta webhook `GET/POST /webhooks/meta` | `server/token_api.py:7020-7112` | Signature check is correct. Processing is **synchronous** inside the request. Routes by `page_id` through `facebook_page_connection`, a **full scan + decrypt** of all connected rows per event (`calls_db.py:7262`). |
| Lead fetch | `token_api.py:7040` | Fetches `field_data` only. **Ad id, ad name, campaign, ad set, form id, platform are dropped.** Only name + phone survive (`_parse_facebook_field_data`, `:6761`). |
| Queueing | `calls_db.ingest_inbound_lead` (`:7638`), `get_or_create_instant_campaign` (`:7534`) | One shared "Instant Lead Follow-up" campaign per account. Agent = **first live agent that has a number**. No per-form/per-ad choice. Phone dedupe only **within one campaign**. DNC and calling window enforced at dial time (`check_call_allowed`, `:13008`). |
| Dial speed | `campaign_dialer.py:63,76-89,186-199,323-343,567` | 15 s tick, instant campaigns first, `notify()` wakes at once. **`OUTBOUND_CHANNEL_LIMIT` defaults to 2 and is trunk-wide across every tenant** (`:89,328`). **One global 2 s stagger** between dials (`:76-80`), dial loop is sequential, LiveKit call setup in-line. |
| Agent start | `agent/main.py` (num_idle_processes=4), memory notes | Fresh processes warm 12–22 s; call start ~8.5 s. |
| Card visibility | `calls_db.py:8906` | `NEW_CONNECTIONS_UNAVAILABLE = {"facebook", "whatsapp"}`. Help bot says Facebook is **not** offered (`help_content.py:91-93`). |
| Agent context | `agent/contact_notes.py:143` | Already renders `ad_name/ad_headline`, `ad_body`, `form_answers`, `lead_source`, `tags`. The Meta path never fills them. |
| Reporting | `calls_db.growth_insights` (`:4897`), `_ad_label` (`:4888`) | Exists; all Meta leads fall into one "Facebook lead" bucket. |
| Encryption | `integration_crypto.py` | Configs are Fernet-encrypted **only if `INTEGRATION_ENCRYPTION_KEY` is set**; otherwise plaintext. Production value not verified. |
| Deploys | Railway (memory) | Every Voice deploy is a 3–6 min API outage (the `/data` volume blocks zero-downtime). |
| Tests | — | None cover the Facebook OAuth, the Meta webhook or `/leads/inbound`. |

ArthaLeads (`~/BRANDS/arthaleads-main`) proves the model works in production and shows the traps:
- Its Vistrow routing scores **ad 30000 > form 25000 > campaign 20000 > project 10000 > any** (`backend/services/vistrowOutbound/routing.js:61-75`). Copy this.
- The webhook payload carries `form_id` and `ad_id` but **not** `campaign_id`/`adset_id` (`AGENT_BRIDGE.md:131,157`). Fetch them per lead.
- `ad_name`, `adset_name`, `campaign_name` are readable on the lead object **with the Page token** (`webhookRoutes.js:114-120`).
- Form **names** need `pages_manage_ads` (only `/{page}/leadgen_forms` works); ArthaLeads still only has it in test mode.
- Needs `auth_type=rerequest` (else a user who once picked no Pages gets zero Pages forever) and the `debug_token` fallback for New Pages Experience Pages missing from `/me/accounts`.
- Do not copy: tokens through the browser; sync processing before replying to Meta; stub deauthorize/deletion callbacks; disconnect without unsubscribe; one-shot in-memory retries.

---

## 1. Where it breaks with real traffic, and the fix (each is a plan item below)

| # | Break | Evidence | Fix |
|---|---|---|---|
| B1 | **Two outbound lines for the whole company.** 10 leads across 3 customers in a minute, ~2-min calls, 2 at a time → the 10th lead is called 8–10 min later. The 60 s promise holds for two leads at a time. | `_OUTBOUND_CHANNELS` default 2, trunk-wide (`campaign_dialer.py:89,328`); the carrier rejects calls past bought capacity | **Per-trunk capacity, provider-neutral** (Section 2a). Each customer's numbers sit on their own trunk (per-number trunks exist, #141) with a `lines` count in a new `trunks` table. The dialer counts in-flight **per trunk**, never globally. Platform numbers keep the shared pool. **Owner decision O1 (lines as an add-on).** |
| B2 | **One dial every 2 s, sequential.** Even with capacity, 20 leads = 40–60 s before the last dial; LiveKit setup is in-line. | `_last_dial_at` global stagger (`:76-80`), `_dial_one` sequential | Stagger and CPS **per trunk**; one dial worker per trunk running in parallel; LiveKit setup off the pass loop. |
| B3 | **Cold agent process.** Lead answers, hears silence, hangs up. | 12–22 s warm; ~8.5 s call start | Pre-warmed pool sized to the expected burst (today 4); a lead call never starts on a cold process (hold the dial 1–2 s instead of connecting into silence); the 60 s budget includes this. |
| B4 | **Calling hours.** Forms are filled at 11 pm; the call is right to wait until 9 am, but the promise and the agent's context must say so. | `_queued_until` exists (`token_api.py:6873`) | Leads tab shows "will call at 9:00"; agent notes carry "filled the form last night at 11:14 pm"; later, a WhatsApp acknowledgement at night. Promise wording: "within 60 s, inside your calling hours". |
| B5 | **Stale pile-ups.** Campaign paused, or plan lapses, leads keep queueing; on resume 200 old leads dial at once. | dialer pauses on missing `campaigns` feature (`:276-280`); ingest keeps queueing | A lead older than **24 h** when it becomes dialable is marked `stale`, kept as a contact, not called. |
| B6 | **Same person, two forms → two agents call.** Per-route campaigns defeat the per-campaign phone dedupe. | `ingest_inbound_lead` dedupe scope (`:7722`) | Dedupe by phone across **all** of an account's instant campaigns within 24 h; the second lead attaches to the first's record and adds its answers to the notes. |
| B7 | **They called us first.** Lead rings our inbound number before the auto-call; we call anyway. | skip rule exists for nurture only (`follow_up_skip_reason`) | Apply the "already talked to us ≥15 s" skip to instant leads at claim time. |
| B8 | **We said 200, then lost the lead.** Meta delivers once; a dead token or rate limit after the 200 loses the lead for good. | webhook contract (Meta retries only non-200) | **Webhooks for speed, polling for completeness**: durable `meta_lead_events` + worker retries, and an **hourly reconciliation** that lists each active form's leads since the last check and inserts any missed (called only if <24 h old). |
| B9 | **Deploys are a 3–6 min outage** for the webhook too. Meta retries, so leads are late, not lost. | Railway `/data` volume | Zero-downtime deploy (volume detach, owner-only), or deploy outside 9–21. Until then: no Voice deploys during business hours once customers are live. |
| B10 | **Tokens may be stored in plaintext.** | `INTEGRATION_ENCRYPTION_KEY` unset → plaintext | **Gate**: confirm the key is set in production before Phase 1 ships; Phase 1 refuses to store a Meta token unencrypted. |
| B11 | **Meta test leads dial dummy numbers.** | Testing Tool leads carry marker values | Detect the "test lead" marker in `field_data`, show as test in the Leads tab, never dial. |
| B12 | **Login token type unverified.** Business system-user tokens may not offer `leads_retrieval`. | Meta docs ambiguous | Build the **long-lived user token** path first (60 days; nightly refresh job; "reconnect by <date>" warning at 7 days), as ArthaLeads runs today. System-user token is an upgrade once confirmed on our app. |
| B13 | **Form names unavailable** until `pages_manage_ads` is approved. | ArthaLeads history | Capture the form name from each lead as it arrives (`form_name` on the lead object), so names fill after the first lead; allow a hand label per form. |
| B14 | **"Leads Access assigned" cannot be checked from Meta.** | vendor docs only | Checklist shows "last lead received: never / 3 min ago"; alert when an active form has sent nothing for 48 h. |
| B15 | **Nurture after no answer vs the 7-day consent window.** | retry_rules nurture 2/5/10 | For leads never reached, the sequence ends after day 5. Leads who answered and said "interested" keep the full 2/5/10 (they renewed the request on the call). |

---

## 2. Multi-tenant design

| Concern | Design |
|---|---|
| One webhook URL for everyone | `/webhooks/meta` stays shared (Meta allows one callback per app). Route by `page_id` through **`meta_pages`** with `page_id UNIQUE → account_id`. Replaces the full scan; the UNIQUE key enforces **one Page, one workspace** (ArthaLeads' 409 for "company A captured company B's leads"). |
| Many Pages per customer | `meta_pages` rows per account; Page picker in the connect flow. |
| Tokens | Long-lived user token + Page tokens, **encrypted**, server-side only; browser sees Page ids and names. Nightly refresh; `needs_reconnect` on Graph errors 190/102 or 7 days before expiry. |
| Burst across tenants | Webhook writes `meta_lead_events` (status `received`) and returns 200 in <200 ms; a background worker (1 s tick, same pattern as the dialer) fetches, stores, routes, queues. A bad token for tenant A never delays tenant B. Retries survive restarts. Body size capped at 2 MB. |
| Fair dialling | Per-trunk channel and CPS limits (B1/B2); per-account cap = plan concurrency; instant campaigns dialled first, round-robin across accounts within a pass. |
| Dedupe | `meta_lead_events` PK `(page_id, leadgen_id)`; phone dedupe across the account's instant campaigns within 24 h (B6). |
| Token invalidation | Real deauthorize callback (verify `signed_request`, mark `needs_reconnect`, bell + email) and real data-deletion callback (delete that user's Meta lead rows, return `{url, confirmation_code}`, status page). |
| Rate limits | Meta's lead-read limit is per Page per 24 h; worker backs off per Page on codes 4/17/32. |
| Isolation | Every query `account_id`-scoped; rules may only name the account's own agents and numbers; tests assert tenant A's event never queues under tenant B. |
| Plans and roles | Connect/rules = admin. Feature `meta_leads` in `plan_policy.FEATURE_MIN_PLAN` = growth; card hidden below Growth. |

---

## 2a. Telephony capacity model (provider-neutral; owner 22 Oct: "make the structure generic, not EnableX-focused")

More carriers are planned (the Phone Numbers page already lists EnableX, Twilio, Exotel and Plivo with status badges, `PhoneNumbers.tsx:51-54`; `phone_numbers.provider` defaults to `enablex`, `calls_db.py:689`). The capacity layer is therefore written once, against a small provider interface, with EnableX as the first implementation.

**Model: Provider account (physical pool) → Trunk (per customer, logical allocation) → Number → Lines.** A *line* is one concurrent call; it is the unit customers buy and the unit the dialer enforces per trunk. **Capacity is physical only at the provider-account level**: EnableX confirmed in writing (18 Sep 2026) that channels and CPS are per EnableX account, not per number or per trunk, and the same pool serves inbound and outbound. So a customer's trunk does not buy capacity from the carrier; it is an allocation out of our pool for that provider, and **the sum of allocated lines must never exceed the pool minus the inbound reserve**. We buy more blocks as customers buy lines (EnableX sells them in threes). A customer who brings their own carrier account (`byo_sip`, or their own EnableX/Twilio account) gets a pool of their own.

```
telephony_providers  key (enablex|twilio|exotel|plivo|byo_sip), name, status,
                     provisioning (api|manual|customer_supplied),
                     capacity_unit (per_line|per_number|unmetered),
                     over_capacity (sip_error|silent_drop|queue),
                     cost_per_line_month, cost_per_minute_in, cost_per_minute_out, cost_per_number_month
provider_pools       id, provider_key, owner_account_id (NULL = ours), credentials (enc),
                     lines_bought, cps_bought, inbound_reserved_lines, notes
                     -- the PHYSICAL capacity: one row per carrier account we or a customer hold
trunks               id, account_id (NULL = platform shared), pool_id, sip_address (enc),
                     lines (allocated from the pool), cps_share, lk_outbound_trunk_id,
                     status (provisioning|active|suspended), notes, provisioned_at
                     -- CHECK: sum(lines) over a pool's trunks <= pool.lines_bought - inbound_reserved_lines
phone_numbers        + trunk_id          -- the trunk is the source of truth; provider comes from its pool
```

**Rules identical for every provider**
- The dialer never exceeds `trunk.lines` in flight per trunk **and** never exceeds `pool.lines_bought − inbound_reserved_lines` across all trunks of a pool (two caps, both enforced; the pool cap is what the carrier actually rejects at). CPS is shared per pool and divided by `cps_share`; one dial worker per trunk. Platform-shared trunks keep today's pool.
- A customer's lines are theirs: because allocations never exceed the pool, another customer's burst cannot take them. Selling a line we have not bought is refused by the CHECK above, so over-selling is impossible by construction.
- Capacity alerts, the Overview's "peak concurrent calls this week", and the "add a line" prompt read `trunks.lines`, whatever the provider.
- Billing sells **lines** as a provider-neutral monthly add-on, in the same place numbers and credits are billed. Our cost per line differs by provider; the customer price is one number.
- Over-capacity handling: providers that return a SIP error (486/503) are retried in the next free slot; providers that drop silently (EnableX today) get a **strict** cap, one below bought capacity when the trunk also takes inbound.

**Per-provider interface** (`server/telephony/<provider>.py`): `provision_trunk(account, lines, cps)`, `set_lines(trunk, lines)`, `release_trunk(trunk)`, `classify_rejection(sip_response)`, `costs()`. EnableX: manual provisioning (ticket, ~2 working days), silent drop. Twilio/Plivo: API provisioning, proper SIP errors. `byo_sip`: the customer supplies the trunk and declares `lines`.

**EnableX figures (Commercial Proposal Prophunt V2, 17 Jul 2026, p.14, GST extra):** onboarding ₹3,500 once; local virtual number ₹300/number/month; SIP inbound ₹0.25/min; SIP outbound ₹0.25/min; media streaming over WebSocket ₹0.30/min; recording ₹0.15/min; **dedicated capacity ₹1,500/month per 3 resources (= ₹500/line/month, bought in threes)**; CPS block of 5 ₹4,500/month; prepaid via the portal.

**Pricing shape for lines (owner to set the number):** cost ₹500/line/month on EnableX, bought in blocks of 3. A customer price around ₹999–1,499/line/month covers cost, the blocks-of-3 rounding and margin; the first line included in Growth so the Meta integration works out of the box; the second and third sold as add-ons. Minimum for lead calling: 2 lines (one line + one long call = the second lead waits minutes).

**Sizing rule (sales):** lines ≈ peak leads/hour × average call minutes ÷ 60 × 1.5. A launch doing 30 leads/hour at 2.5 min → 3 lines; a steady 5 leads/hour → 1 line.

**Shared with ArthaLeads (owner, 22 Oct):** the same EnableX account pool also carries ArthaLeads' number (one number, the Prophunt project), so that number must be a trunk on the same `provider_pool` row with its own `lines` allocation, and its agent wiring goes through the same model. When EnableX exposes a capacity API, `provider_pools.lines_bought/cps_bought` are synced from it instead of typed by hand, and the per-trunk allocations (ArthaLeads' number, platform numbers, each customer) are mapped against the real figure.

**Open with EnableX:** a capacity/usage API (read bought resources and CPS, ideally buy blocks); our currently provisioned resources and CPS in writing (not recorded anywhere; the dialer assumes 3 bought, 1 reserved); lead time and process to add a block of 3 (ideally same-day, by portal or API); whether over-capacity calls can return a SIP error instead of the silent drop; whether a customer can hold their own EnableX account and point its trunk at our LiveKit (true BYO on EnableX).

**Purchasing rule:** keep `pool.lines_bought − allocated − inbound_reserved ≥ 1` spare line at all times; when a line sale would break that, buy the next block of 3 before activating the sale (the dashboard shows "activating within 1 working day" for manual providers).

---

## 3. Data model (new tables; all `account_id`-scoped)

```
meta_connections   id, account_id, user_token (enc), token_expires_at, fb_user_name,
                   status (connected|needs_reconnect|disconnected), connected_by_user_id,
                   connected_at, last_error, last_error_at
meta_pages         id, account_id, connection_id, page_id UNIQUE, page_name,
                   page_token (enc), subscribed_at, subscription_ok BOOL,
                   last_lead_at, default_agent_id, default_from_number
meta_forms         id, account_id, page_id, form_id, form_name, label, status,
                   questions_json, first_seen_at, last_reconciled_at   UNIQUE(page_id, form_id)
meta_lead_rules    id, account_id, page_id, match_kind (ad|form|page), match_value,
                   agent_id, from_number, label, position
                   -- resolution: ad > form > page default; exact match; one agent per (kind,value)
meta_lead_events   page_id, leadgen_id  PK, account_id, form_id, ad_id, received_at,
                   via (webhook|reconcile|backfill), status
                   (received|fetched|queued|skipped|failed|stale|test),
                   reason, campaign_contact_id, raw_json (short), dialed_at
trunks / telephony_providers / phone_numbers.trunk_id   -- Section 2a (B1/B2)
```

Lead fields (existing `campaign_contacts.custom_fields` and `contacts.custom_fields`): `lead_source` ("Facebook Ad" / "Instagram Ad"), `platform`, `is_organic`, `page_id`, `page_name`, `form_id`, `form_name`, `ad_id`, `ad_name`, `adset_id`, `adset_name`, `campaign_id`, `campaign_name`, `meta_lead_id`, `meta_created_time` (IST in notes), `form_answers` (every label: value, form order), one `form_<slug>` per question (ArthaLeads' flattening, `token_api._lead_form_fields`). `contact_notes.py` renders `ad_name`, `ad_body`, `form_answers`, `lead_source` today; add `platform` and "filled the form at <time>". `inbound_lead_events.source = "meta_lead_ads"` so speed-to-lead and `growth_insights` count them; `_ad_label` already prefers `ad_name`.

---

## 4. The 60-second budget (what must be true, measured on every lead)

| Step | Target | Owner |
|---|---|---|
| Meta webhook → our 200 | < 0.2 s | Phase 1 |
| Worker fetch + store + route + queue | < 3 s (Graph ~1 s) | Phase 1–2 |
| Dialer wake → INVITE placed | < 5 s (needs a free channel on the customer's trunk) | Phase 2 + B1/B2 |
| Ring → answer | carrier/person, ~10–20 s | — |
| Agent ready to speak at answer | 0 s (pre-warmed) | B3 |
| **Total to the person's phone ringing** | **< 10 s typical; 60 s promise with margin** | |

Outside the calling window, the clock starts at the window open. On a busy trunk, the lead is next in line and the Leads tab says so. p50/p95 lead→dial and lead→answer are stored on `meta_lead_events.dialed_at` and shown on the Overview.

---

## 5. Phases, each with "Done check" and "Verify twice"

"Done check" = automated: unit + real-Postgres tests on a **fresh** database, plus mutation checks (disable the guard, confirm the tests fail). "Verify twice" = two independent confirmations: (A) staging with the real Meta app in dev mode, our own Page, app-role test users; (B) a second person/session following the written checklist, or production shadow data where safe. Nothing is called done on a tool's own success output.

### Phase 0 — Prerequisites (owner; start this week)
- Meta Business-type app owned by **vistrowai@gmail.com**: privacy policy URL, data-deletion callback `/webhooks/meta/deletion`, deauthorize `/webhooks/meta/deauthorize`, app domains, **Business Verification submitted**.
- Facebook Login (business app) with scopes `pages_show_list, pages_read_engagement, pages_manage_metadata, leads_retrieval, pages_manage_ads` (+ `ads_management`, `business_management` per Meta's dependency list for review).
- Webhooks product: Page → `leadgen`, callback `https://api.vistrowvoice.com/webhooks/meta`, verify token.
- Test assets: our own Page + form + a live ₹50/day lead ad; 2 app-role test users; a second Page for cross-tenant tests.
- Env on staging and prod: `META_OAUTH_CLIENT_ID/SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `PUBLIC_BASE_URL`, `APP_BASE_URL`, **`INTEGRATION_ENCRYPTION_KEY` confirmed set in prod (B10)**.
- **O1 decision**: lines as a provider-neutral add-on (Section 2a): customer price per line, first line in Growth, minimum 2 for lead calling. Put the "open with EnableX" questions to them this week.

**Done check**: config visible in the App Dashboard; GET handshake returns the challenge on staging and prod; `INTEGRATION_ENCRYPTION_KEY` present in prod env listing.
**Verify twice**: (A) `curl` the handshake; (B) a second person logs in as a test user and reaches the Meta dialog.

### Phase 1 — Server foundations (runtime lane)
- Tables above + migrations, including `telephony_providers`, `trunks` and `phone_numbers.trunk_id` (Section 2a); existing numbers migrate onto one platform-shared EnableX trunk with `lines = OUTBOUND_CHANNEL_LIMIT`, so behaviour is unchanged until a customer buys lines.
- OAuth: `/integrations/facebook/start` (`auth_type=rerequest`, state cookie); callback in the public `/auth/oauth/meta/callback` shape (Zoho/Sheets pattern: `_live_session` + admin re-check); code → short-lived → **long-lived user token**; list Pages (`/me/accounts` + `debug_token` fallback); store connection + candidate Pages; redirect `?facebook=pick_pages`.
- `POST /integrations/facebook/pages`: subscribe chosen Pages, store Page tokens, verify with `GET /{page}/subscribed_apps`, 409 if the Page belongs to another account.
- Disconnect = unsubscribe each Page + mark disconnected (leads kept). Real deauthorize + deletion callbacks (B-table).
- Webhook: signature → body cap → `meta_lead_events` rows → 200. Worker: `GET /{leadgen_id}?fields=created_time,id,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,platform,is_organic,field_data` with the Page token; map every field; test-lead detection (B11); upsert `contacts`; `ingest_inbound_lead(custom_fields=..., route=page default)`; wake the dialer. Per-Page backoff on rate-limit codes.
- **Reconciliation job** (B8): hourly, per active form, `GET /{form}/leads` since `last_reconciled_at`; insert missing as `via=reconcile`; dial only if < 24 h old.
- Nightly token refresh; `needs_reconnect` on 190/102 or 7 days before expiry (B12).
- Refuse to store a token when encryption is not configured (B10).
- Remove `facebook` from `NEW_CONNECTIONS_UNAVAILABLE` behind feature `meta_leads` (Growth) and the env being configured.

**Done check** (fresh DB): signature reject/accept; 1,000-change batch answers 200 in <1 s with all rows written; duplicate delivery is a no-op; unknown page logged not queued; **tenant A's Page never queues under tenant B**; Page claimed elsewhere → 409; error 190 flips `needs_reconnect` without crashing the worker; every form answer in `custom_fields` and `contacts`; test lead → status `test`, never queued; reconciliation inserts a missed lead exactly once and skips one >24 h old; deletion callback deletes only that user's rows; worker resumes pending rows after restart; token store refused with encryption off. Mutation: disable dedupe / tenant lookup / signature check / test-lead detection → tests fail.
**Verify twice**: (A) staging + real Meta dev app: connect our Page, submit a real lead on the live form, watch `received → fetched → queued`, contact carries all answers; disconnect and confirm `GET /{page}/subscribed_apps` no longer lists us; stop the worker, submit a lead, start the worker, see it caught by reconciliation. (B) replay recorded payloads with a wrong signature, a duplicate and a 1,000-change batch; read `meta_lead_events` directly.

### Phase 2 — Routing, dialling capacity, agent context (runtime lane)
- Resolver `resolve_meta_route(account_id, page_id, form_id, ad_id)` → `(agent_id, from_number, label)`: ad > form > page default; none → `skipped: no_route` (visible, never silent).
- Per-route instant campaign; `from_number` must be the account's active number.
- **B1/B2**: per-trunk line and CPS accounting in the dialer through the provider interface (Section 2a); one dial worker per trunk; LiveKit setup off the pass loop. Platform numbers keep the shared pool. Lines add-on in billing (Lines line item next to numbers; `trunks.lines` updated on purchase; provider `set_lines` called, or a provisioning ticket raised for manual providers).
- **B3**: pre-warm pool sized for burst; never connect a lead into a cold process.
- **B5** stale cut-off 24 h; **B6** cross-campaign phone dedupe; **B7** skip if they already talked to us; **B15** never-reached nurture ends after day 5.
- `contact_notes`: `platform`, "filled the form at <local time>"; `growth_insights`/`_ad_label`: ad first, Facebook vs Instagram split; speed-to-lead tile counts `meta_lead_ads`; `dialed_at` stamped for the p50/p95.

**Done check**: resolver precedence table; another account's rule never matches; foreign number refused; agent paused → `skipped: agent_paused` + bell; **two tenants on two trunks with 20 leads each both place a first dial within 5 s of wake** (mocked LiveKit, real dialer loop); a 2-channel trunk never exceeds 2 in flight while a second trunk dials freely; stale lead not dialled; same phone on two forms → one call, merged answers; lead who called in first → skipped; test lead never dialled; never-reached nurture stops at step 2; agent prompt tail contains ad, form answers, platform and form time (render test with `build_contact_notes`). Mutation: swap precedence, remove the per-trunk cap → tests fail.
**Verify twice**: (A) staging, two test accounts, two Pages, ad rule + form rule + page default each; leads matching each; confirm campaign/agent/from-number on the queued row; a real test call to an owned number: **phone rings in <10 s** from form submit (stopwatch), agent names the ad and the answers. (B) read `custom_fields` and the agent's "contact notes added to prompt tail: N line(s)" log for that room; read `meta_lead_events.dialed_at - received_at` for the batch.

### Phase 3 — Dashboard (dashboard lane; runs in parallel with Phases 1–2 against the API contract)
- Integrations page: Facebook card back ("Facebook & Instagram Lead Ads"; Growth only). Instant Lead Follow-up card unchanged.
- Detail page (`IntegrationDetail.tsx`, same tabs as Sheets/Zoho): **Overview** = checklist with live states: Connected → Pages subscribed (re-checked against Meta on open) → Leads Access (exact path + "last lead received: never / 3 min ago", B14) → Test lead received → First call placed; p50/p95 lead→dial; reconnect banner. **Settings** = Page picker, per-Page default agent + number, **Lead rules** table (copy `PageRoutes` from `WebsiteWidget.tsx`: Page → Form → Ad → Agent → Number; exact match; values chosen from lists of forms/ads seen or fetched; hand label for a form, B13). **Leads** tab = `meta_lead_events` with status, reason, "will call at", link to the call.
- "Send a test lead": link to Meta's Testing Tool (post-approval) and, in staging/dev, "Simulate lead" posting a signed sample to our own webhook.
- Help: article "Call Facebook and Instagram leads automatically" (Integrations topic); `help_content.py` lines updated (today they say NOT offered); Copilot read tool `meta_lead_status` (read-only in v1).

**Done check**: `tsc`, build, icon check; API contract tests for every route (admin-only, tenant-scoped); rule editor cannot save a rule naming another account's agent; help-article tests; checklist renders the right state for: not connected / connected-no-pages / page-unsubscribed / no lead yet / lead received / needs reconnect.
**Verify twice**: (A) local dashboard with seeded `meta_*` rows for two accounts: neither sees the other's Pages, rules or leads; full connect flow on staging with the real Meta dev app. (B) a second person follows the onboarding checklist on staging as a brand-new Growth account with no hints; every step turns green.

### Phase 4 — Backfill, operations (runtime + dashboard)
- Backfill `GET /{form}/leads` (90 days) on connect, opt-in per form, `via=backfill`, **never called**; shows in Contacts and reports.
- Admin panel: Meta connections health (tokens, expiry, last lead, failures, worker backlog, per-trunk utilisation).
- Alerts: `needs_reconnect`; active form silent 48 h; backlog > 50; rate-limit hits; trunk at capacity for > 5 min (the 60 s promise is at risk).

**Done check**: backfill of 250 leads → 250 contacts, **0** campaign rows; alert tests; backlog alert at 51; trunk-saturation alert.
**Verify twice**: (A) staging backfill against our Page; (B) kill the worker mid-backlog, restart, no duplicates (row counts before/after).

### Phase 5 — App Review and launch
- Screencasts per permission on staging: login → pick Page → assign agent → test lead → phone rings → lead visible. English UI, captions, 1080p. A live API call for every permission before submitting.
- Submit `leads_retrieval`, `pages_manage_ads`, `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `ads_management`, `business_management`. ~1 week per round.
- App to Live after approval; help article published; card on for Growth.
- **No Voice deploys 9–21 IST once a customer is live** until zero-downtime deploys exist (B9).

**Done check**: approval email; first real customer lead end to end with `received → fetched → queued → dialed` **under 60 s p95, under 10 s p50**.
**Verify twice**: (A) first customer's first 10 leads checked by hand against Meta's Leads Center export, with timings; (B) owner submits a lead on the customer's live ad and times the call on a stopwatch.

### Phase 6 — Click-to-WhatsApp (after Phase 5 approval)
- WhatsApp Cloud API as Tech Provider: Embedded Signup config, App Review for `whatsapp_business_messaging` + `whatsapp_business_management`.
- Inbound message webhook (same `/webhooks/meta`, object `whatsapp_business_account`): parse `referral` (`source_id` = ad id, `headline`, `body`, `ctwa_clid`); reuse `meta_lead_rules` with `match_kind=ad`; store `whatsapp_first_message` (already rendered by `contact_notes`).
- A WhatsApp chat is a conversation, not a form: call on the customer's request or after a quiet period, as ArthaLeads does.

---

## 6. Lanes and ordering
- **Owner**: Phase 0 this week; **O1** (per-customer trunks and channels); approve the design.
- **Runtime lane** (`server/`, `agent/`): Phases 1, 2, 4 server parts, 6.
- **Dashboard lane** (`web-demo/`): Phase 3 (starts now against the contract), help text, Phase 4 admin views.
- Both: Phase 5 screencasts.
- One release per phase, after combined suites pass on a fresh DB.

## 7. Open decisions for the owner
1. **O1 — Lines.** Owner direction (22 Oct): per-customer trunks, customer pays for capacity, provider-neutral. Still to set: the customer price per line (cost is ₹500/line/month on EnableX, bought in threes), whether the first line is included in Growth, and which provider gets API provisioning first (manual EnableX provisioning is the onboarding bottleneck).
2. **Backfill**: opt-in per form (plan default) or automatic on connect?
3. **Screencasts**: who records them, on which staging account?
4. **Zero-downtime deploys** (volume detach) before the first customer goes live, or accept "no deploys 9–21"?
