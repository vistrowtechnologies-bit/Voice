# Tenant isolation + ArthaLeads bridge plan — 16 Oct 2026

Why: a test call from Prophunt's own number (+917935466148, workspace 1) rang
the callee as +917713128715 (workspace 2, vistrowai). Clients are waiting to buy.
No tenant may ever dial, bill or answer as another tenant.

Every line is tagged:
- **VERIFIED** = checked today against production DB, LiveKit, the EnableX
  portal, or vendor docs (source named).
- **UNVERIFIED** = not yet proven. Nothing UNVERIFIED is treated as true.

---

## 1. What exists today

### 1.1 Telephony

| # | Fact | Tag | Evidence |
|---|---|---|---|
| F1 | Each number is one `phone_numbers` row, unique across workspaces | VERIFIED | `add_phone_number` raises `PhoneNumberTakenError`; prod rows: id 7 = +917713128715 → ws 2 / agent 26, id 8 = +917935466148 → ws 1 / agent 17 |
| F2 | Every outbound call (test call, campaigns, Call now) uses ONE LiveKit outbound trunk `ST_8YX6YkEkTymg` → EnableX SBC `35.234.209.8`, numbers = `917713128715` only | VERIFIED | `lk sip outbound list`; `livekit_sip.place_outbound_call` reads the platform setting `lk_outbound_trunk_id` |
| F3 | Prophunt's test call 1383 (ws 1, agent 17, 08:04 UTC, 59 s) went out on that trunk | VERIFIED | calls row 1383; owner saw 7713128715 on the handset |
| F4 | Warm transfer dials through "the first outbound trunk LiveKit lists" | VERIFIED | `agent/tools.py _outbound_trunk` |
| F5 | One outbound line limit (`OUTBOUND_CHANNEL_LIMIT`, default 2) for ALL workspaces together | VERIFIED | `livekit_sip._OUTBOUND_CHANNELS`, counts every outbound room |
| F6 | Inbound: one LiveKit inbound trunk lists both numbers; the agent finds the owner from the dialled number (`sip.trunkPhoneNumber`) and declines if no owner | VERIFIED (code + `lk sip inbound list`) |
| F7 | Inbound to ws 2's +917713128715 works | VERIFIED | inbound calls 1160, 1161, 1211 |
| F8 | Inbound is tenant self-serve: the number's **Event URL** in the tenant's EnableX portal points at our `/telephony/enablex/inbound-event`; we then accept and bridge the call to LiveKit SIP using the **tenant's own App ID/key** (`enablex_accept_call`, `enablex_connect_to_sip`) | VERIFIED (code; +917713128715's Event URL = `https://voice-production-2950.up.railway.app/telephony/enablex/inbound-event`) |
| F8b | +917935466148 (bought 16 Oct) has an **empty** Event URL and has never received a call | VERIFIED (portal, per-number view; DB) |
| F8c | How EnableX authenticates when it bridges into our LiveKit SIP host (user `vistrow-4xfxv26j`) is configured on EnableX's side for our login; whether a customer's SEPARATE EnableX account gets this automatically | UNVERIFIED — EnableX question |
| F8d | Webhook authenticity check is off in production (`ENABLEX_WEBHOOK_USER/PASS` not set), so anyone can POST to the inbound-event URL | VERIFIED (env var names) |
| F13 | The EnableX login has 3 numbers: +917713128715 ("Vistrow voice"), +917935466148 ("Prophunt - Vistrow Voice"), +917713128717 ("Prophunt LLP Arthaleads" — ArthaLeads' own CRM calling line, owner confirmed; stays out of Vistrow) | VERIFIED (portal) |
| F9 | The workspace's EnableX App ID/key are NOT used on the LiveKit call path; only by the old REST path and the orchestrator | VERIFIED | grep: only `server/calls_db.py`, `orchestrator/db.py` |
| F10 | Adding a number never checks with EnableX that the tenant owns it | VERIFIED | `add_phone_number` |
| F11 | **All four EnableX projects sit in ONE EnableX login with ONE wallet (₹580.38)**: "Prophunt - Vistrow Voice", "Prophunt LLP Arthaleads", "Vistrow voice", "Arthaleads WebRTC". Tenants today are projects, not separate EnableX accounts | VERIFIED | EnableX portal, project selector |
| F12 | EnableX call records are only available as a CSV download (Reports → Voice → CDR) | VERIFIED | portal |

### 1.2 ArthaLeads bridge

| Fact | Tag |
|---|---|
| One-token setup links both directions (Voice #129, ArthaLeads df4632f / d563069) | VERIFIED in production |
| Prophunt LLP linked to Vistrow ws 1; ws 2 disconnected | VERIFIED |
| ArthaLeads → Vistrow lead import (test lead → contact 9 in 1.9 s) | VERIFIED |
| Manually added ArthaLeads leads are never auto-called (webhook leads only) | VERIFIED, by design |
| Vistrow → ArthaLeads call results (call 1378, 15 Oct) | VERIFIED |
| Website text chats delivered to integrations (Voice #132) | VERIFIED |
| Default agent per source; Facebook rules by lead form / ad / campaign / project (ArthaLeads 3343601, 6bb1599) | VERIFIED in production UI |
| Facebook "Ad" picker empty; the org's ads are Click-to-WhatsApp ads (8 on leads, 5 routed on the AI Agents page, one of them on no lead yet) | VERIFIED via `/api/leads/campaign-options` + AI Agents page |
| Vistrow contact page shows raw ArthaLeads ids | VERIFIED (screenshot) |
| Follow-up rules (retries, call-back, visit reminder, nurture) | deployed, UNVERIFIED on a real call |
| Telugu | UNVERIFIED on a real call (0 ever) |

---

## 2. Vendor facts that shape the design

From LiveKit's docs (VERIFIED, quoted):

- Outbound trunk: "Create one outbound trunk and reuse it for every call." "Creating a new trunk for each call bypasses this caching and can degrade reliability at scale." — https://docs.livekit.io/telephony/making-calls/outbound-trunk/
- "To vary the caller ID per call, set `sip_number` on the CreateSIPParticipant request instead of creating a separate trunk." — same page
- Trunk `numbers`: "A random number in the list is selected whenever a call is made." `sip_number`: "If `sip_trunk_id` is set, this defaults to the number associated with the stored trunk." — https://docs.livekit.io/reference/telephony/sip-api/
- The docs do NOT say whether `sip_number` must be in the trunk's `numbers` list. A trunk with `numbers = ["*"]` allows any number. — UNVERIFIED against a live call.

EnableX: no public documentation found on how an outbound SIP call is attributed to a project. UNVERIFIED; must come from EnableX (section 5).

Consequence: my first draft (one trunk per number) is long-lived config, not per-call, so it does not break LiveKit's guidance, but it is not what LiveKit recommends. The choice is in section 3.

---

## 2b. How other voice-AI platforms do "bring your own telephony" (from their docs)

Two patterns, both strictly per customer:

1. **Provider API keys.** The customer pastes their provider account keys; the platform dials and answers with those keys, so calls are billed to the customer and carry their number. Bolna (India): Plivo, Exotel, Twilio "bring your own account", keys entered in the dashboard (https://www.bolna.ai/docs/supported-telephony-providers, https://www.bolna.ai/docs/plivo).
2. **Per-customer SIP trunk credential.** The customer creates a SIP trunk at their carrier and gives the platform its termination address plus a username/password (or allowlists the platform's IPs); inbound points at the platform's SIP host. Vapi: a `byo-sip-trunk` credential per customer, numbers imported against it (https://docs.vapi.ai/advanced/sip/twilio). Retell: number import takes termination URI + SIP username/password (https://docs.retellai.com/deploy/custom-telephony.md).

In both, the platform never sends one customer's calls through another customer's account. Ours today: inbound = pattern 1 (correct, tenant keys); outbound = one shared IP-authorised SIP trunk (neither pattern — the leak).

## 3. Target design (needs owner decision on 3.1)

Rule: **the number is the tenant key.** Five invariants:

1. A call leaves only from a number the dialling workspace owns. No fallback to any other number, ever. Fail loudly.
2. Every dial site (test call, campaign, Call now, follow-up, warm transfer) goes through the same ownership check and sets `sip_number` explicitly.
3. A number can be added only if EnableX confirms it is mapped to that tenant's project (method from EnableX, section 5 Q3).
4. One tenant cannot use up another tenant's lines.
5. Removing a number removes everything that can dial or answer on it.

### 3.1 Outbound trunk layout — decision

| | A. One shared trunk, `sip_number` per call (LiveKit's recommendation) | B. One trunk per number + `sip_number` per call (built on branch) |
|---|---|---|
| Caller ID control | our code only | our code + LiveKit refuses any other number on that trunk |
| Vendor guidance | matches | allowed (long-lived), not the recommended pattern |
| Moving parts | 1 trunk | 1 trunk per number, created/removed with the number |
| Unknown | whether EnableX accepts any `sip_number` on one trunk | same EnableX question |

Recommendation: **B**, because a bug in our code then still cannot ring as another tenant's number. Either way `sip_number` is set on every call, so nothing relies on a trunk default or LiveKit's random pick.

### 3.2 Tasks

| ID | Task | Owner | State |
|---|---|---|---|
| T1 | Outbound per 3.1 + ownership check before every dial + explicit `sip_number` | Claude | B built on branch `claude/per-number-outbound-trunk` (not pushed); explicit `sip_number` NOT yet added; server suite 768 pass; 7 of 8 new tests fail on main |
| T2 | Warm transfer from the call's own number | Claude | built on branch; 5 existing transfer tests need their fake updated |
| T3 | Number ownership check against EnableX on Add number | Claude | blocked on EnableX Q3 |
| T4 | Line limit per workspace | Claude | blocked on EnableX Q4 (are lines per project?) |
| T5 | Create trunks for existing numbers after deploy | Claude | after T1 |
| T6 | Prophunt inbound: set +917935466148's Event URL in the Prophunt EnableX project to our inbound-event URL (self-serve, same as +917713128715), then test | Owner approves the portal change | not set (F8b) |
| T7 | Per-tenant inbound SIP login | later | not started |
| A1 | ArthaLeads: one org-wide ad list in WhatsApp and Facebook pickers, note when a CTWA ad is picked under Facebook | Agent A | ready to dispatch; premises VERIFIED |
| A2 | Vistrow contact page: hide internal ArthaLeads keys, show "From ArthaLeads · Facebook Ad lead" + link | Agent B | ready to dispatch; premise VERIFIED |

A1 and A2 do not touch telephony and can run in parallel with T1–T5. Both
ship to staging / a PR only; nothing merges to production without review.

---

## 4. Acceptance test (all must pass before a paying client)

1. Deploy T1–T5 (Railway, then both LiveKit workers).
2. ws 1 Test call from +917935466148 to the owner's phone: handset shows **7935466148**.
3. EnableX CDR CSV: that call is under **Prophunt - Vistrow Voice**, not **Vistrow voice**.
4. ws 2 Test call from +917713128715: shows 7713128715, CDR under **Vistrow voice**.
5. ws 1 API dial using +917713128715: refused, no call.
6. Inbound to +917935466148: Siya KHOPOLI answers (after T6). Inbound to +917713128715: agent 26 answers.
7. Warm transfer on a ws 1 call: colleague's phone shows 7935466148.
8. Today's call 1383 in the CDR: which project was it charged to? (tells us how EnableX attributes calls)

---

## 5. Questions for EnableX (owner sends; answers unblock T3, T4, T6)

1. Outbound from LiveKit is authorised by LiveKit Cloud's IP ranges. How do you decide which project and wallet a call belongs to: the caller number in the From header?
2. Those IP ranges are shared by every LiveKit customer. What stops another LiveKit user sending calls with our numbers as caller ID? Can we have a per-project secret or SIP digest auth on outbound?
3. Which API lists the numbers mapped to a project, using that project's App ID and key?
4. Are channel (simultaneous call) limits per project or per account?
5. When a customer uses their OWN EnableX account, does your bridge into our LiveKit SIP host (`connect` to a sip: URI) work with no setup on your side, or do you have to add our SIP login to their account like you did for ours?
6. When a customer brings their OWN EnableX account, what do they configure so their numbers reach us and our outbound calls are billed to them?
