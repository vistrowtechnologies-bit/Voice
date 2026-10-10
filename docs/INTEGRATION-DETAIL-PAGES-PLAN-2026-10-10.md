# Integration detail pages: implementation plan (2026-10-10)

Owner request: clicking an integration opens its own page with every option it
really needs, not just "Send test" and "Disconnect". Every feature below is
either already supported by the runtime or gets the runtime change listed next
to it. Nothing is a setting the dashboard saves but the call never reads.

## What each integration really does today (checked in code)

| Integration | Direction | When it sends | What it sends | Today's settings |
|---|---|---|---|---|
| Google Sheets (Sign in with Google) | Out | End of call, only if caller left phone or email | 1 row, 13 columns | Google account, sheet |
| Google Sheets (Apps Script URL) | Out | **Every event** (mid-call updates, bookings, callbacks, end of call) | Full lead JSON | URL |
| Zoho CRM | Out | End of call, phone or email only; upsert (no duplicates) | Lead record + description | Zoho org |
| ArthaLeads | Out + In | End of call, needs name + phone | Lead, transcript, recording link | Connection key; inbound call routing |
| CRM / Webhook | Out | **Every event** | Full lead JSON + optional token | URL, token, display name |
| Slack | Out | **Every event** | Formatted message | Channel (picked at sign-in) |
| WhatsApp | Out | **Every event** | `{to, message}` to provider | URL; `template` is read by the runtime but has **no UI** |
| Facebook Lead Ads | In | When a Lead Ad form is submitted | Creates contact, queues a call | Page |

Problems this exposes:
1. **WhatsApp messages the caller several times per call.** Every mid-call
   `log_lead` and the end of the call each send a message.
2. Slack, Webhook and Apps Script also get every mid-call update. That is noisy,
   and there is no way to choose.
3. There is no delivery history. Only the last error and the last success time
   are stored, so an owner can't answer "did yesterday's lead reach Zoho?".
4. "Which agents send here" lives only on each agent's page.
5. Disconnect has no confirmation.

## Shared page layout (`/dashboard/integrations/:key`)

The list page keeps its cards. A card now shows the logo, status, last delivery,
an error if there is one, and an **Open** button. The whole card is clickable.
The connect, test and disconnect buttons move to the detail page.

The detail page has the same frame for every integration:

1. **Header.** Back link, logo, name, status pill, and the main action:
   **Connect** when not connected; **Send test**, **Reconnect** and
   **Disconnect** when connected. Disconnect asks for confirmation.
2. **Health strip.** Last successful delivery, deliveries and failures in the
   last 7 days, and the last error with a "Send test again" button.
3. **Tabs.** Overview · Settings · Activity · Setup help. A source-only
   integration (Facebook) has no Settings tab for events.

## The common features (built once, used by every outbound integration)

### A. Delivery history (Activity tab). New.
- New table `integration_deliveries`: id, account_id, key, event_type, ok,
  detail, lead_name, call_id, created_at. Indexed on
  (account_id, key, created_at). Rows are kept for 30 days.
- `agent/tools.py` `_deliver_to_integrations` writes one row for every
  attempt, in the background so the live call is never delayed. The server's
  "Send test" writes one row with the event type `test`.
- Activity tab: the last 50 attempts showing time, event, caller name, a link to
  the call, Delivered/Failed, and the reason it failed. Filter by
  delivered or failed.
- API: `GET /integrations/{key}/deliveries`.

### B. Choose what gets sent (Settings tab). New runtime rule.
- Stored in the integration's config as `events: [...]`. The choices are
  end of call, appointment booked, callback requested, and lead details
  updated during the call.
- The runtime checks `events` before sending. If `events` has never been set,
  behaviour stays exactly as it is today, with one exception: **WhatsApp
  defaults to end of call only**, which fixes problem 1.
- Zoho, Sheets (Google sign-in) and ArthaLeads don't get toggles. They are
  deliberately one record per caller at the end of the call. The tab says so in
  one line instead of offering a switch that does nothing.
- API: `PATCH /integrations/{key}/settings`. It merges only `events` and
  `template`, so saved tokens are never overwritten. The existing URL-edit save
  also keeps `events`.

### C. Which agents send here (Settings tab). Uses the existing field.
- Lists the account's agents, each with an on/off switch. The switch edits the
  same `crmIntegrationKeys` field the agent page uses, so both pages always
  agree.
- An empty list still means every integration. To turn one integration off,
  the agent gets the list of all integration keys except that one. It never
  gets an empty list, because empty would mean "all".

### D. What we send (Overview tab)
- A sheet-column preview for Sheets, the field mapping for Zoho, a sample JSON
  body for Webhook and Apps Script, and a message preview for Slack and
  WhatsApp. This is read-only and generated from the same shapes the code
  sends.

## Per-integration pages

**Google Sheets**
- Overview: Google account; sheet name with Open sheet; the column list; the
  "one row per reachable caller" rule.
- Actions: Send test (writes a row marked TEST so it's safe to delete);
  Reconnect (Google sign-in, keeps the same sheet); Disconnect (revokes access
  at Google).
- Advanced: switch to an Apps Script URL. For Apps Script connections, the
  event choices (B) apply.
- OAuth return lands on this page (`?sheets=connected|failed`) instead of the
  list.

**Zoho CRM**
- Overview: Zoho data centre and org; how fields map (Name → Last Name, Phone,
  Email, Lead Source = channel, Description = call summary, details, agent,
  length and recording); "repeat callers update their existing lead".
- Actions: Send test, Reconnect with Zoho, Disconnect.

**ArthaLeads**
- Overview: what is sent (contact, transcript, recording link, details); the
  rule that name and phone are both needed.
- Settings: edit the connection key (masked). The **inbound call routing**
  card ("Call new Website/Facebook/WhatsApp leads", routes, from-number) moves
  here from the list page.
- Activity: deliveries, including skips with the reason, such as a missing
  phone. A call that failed can be re-sent from its own lead page; the
  existing "Push to ArthaLeads" feature is linked from here.

**CRM / Webhook**
- Settings: display name, URL, auth token (masked, with show/hide), event
  choices (B), agents (C).
- Overview: sample JSON body with field descriptions; copy button.

**Slack**
- Overview: channel; message preview.
- Settings: event choices (B), agents (C). Changing the channel = Reconnect
  (Slack picks the channel during sign-in).

**WhatsApp**
- Settings: provider send URL; **message template** with `{name}`
  placeholder and a live preview (the runtime already reads `template`; this
  adds the missing UI); event choices (defaults to end of call); agents (C).
- Overview: "the caller gets this message on their WhatsApp from your
  provider".

**Facebook Lead Ads** (lead source, not delivery)
- Overview: connected Page; what happens to a lead (contact created, call
  queued, DNC and calling hours applied).
- Activity: recent Facebook leads (contacts with source
  `facebook_lead_ads_native`) and whether a call was queued.
- Also on this page: the "Instant Lead Follow-up" Zapier URL, as the
  alternative way in.
- Actions: Reconnect, Disconnect.

## Deliberately left out (would not really work, or isn't needed for launch)
- Custom field mapping for Zoho and Sheets. That would need a mapping engine and
  is risky three days before launch. The fixed mapping is shown instead.
- Choosing a different existing spreadsheet. The `drive.file` scope only
  allows files we created; anything more needs the broad Drive scope and Google
  verification.
- Retrying a failed delivery from the Activity tab. We don't store the payload
  (it holds the transcript and personal data). ArthaLeads already has per-call
  re-send.
- Rate limits and batching. Volumes are low.

## Build order and checks
1. Backend: `integration_deliveries` table, agent logging, `events` filter,
   `/deliveries` and `/settings` endpoints, Sheets redirect, and tests (the
   filter, the merge that keeps tokens, the WhatsApp default, account scoping
   on deliveries).
2. Frontend: the `IntegrationDetail` page and route; slim cards on the list
   page; the ArthaLeads routing card moved.
3. Verify on a local build: each page at 1440 px and 375 px, a real Send test
   to Sheets showing up in Activity, event settings saved and reloaded.
4. One PR. Deploy: Railway (server and dashboard), plus **both agent workers**,
   because the runtime filter and logging live in `agent/tools.py`.
5. Live check: one widget call on a Vistrow-owned agent. Activity should show
   the Sheets row, and with WhatsApp set to end of call only, Webhook/Slack
   should show only the events that were picked.

## Added during the build (owner requests, 2026-10-10)

- **Branded sheet.** Purple frozen header with white bold text, lavender and
  white row bands, a filter on every column, a purple tab, and clipped body
  rows. A reconnect re-applies this styling to the existing sheet.
- **Playable recording.** The Recording cell is a "▶ Play recording" link
  stored as cell formatting, not a formula. It opens
  `/public/calls/<id>/play?token=…`, a branded browser player that uses the
  same per-call bearer as the CRM link.
- **One tab per agent.** Each agent's leads go to their own tab, named after
  the agent and created and styled on its first lead. If the owner deletes a
  tab, it is recreated. If Google refuses to create a tab, the lead goes to the
  main tab, so no lead is lost.
- **Choosing fields** for Sheets, Webhook and Slack (`config.fields`). A field
  that is left out is removed from the lead before the payload is built, so it
  is never sent. In a sheet its column stays in place, so old rows don't shift,
  but it is hidden and left empty. At least one of name, phone or email must
  stay. ArthaLeads, Zoho and WhatsApp keep their fixed payloads.

## Future roadmap (not built; each row is what owners will ask for next)

| Integration | Next features |
|---|---|
| All outbound | Retry a failed delivery from Activity (needs encrypted payload storage with a TTL); a daily digest email when deliveries fail; filters such as "only leads with interest = high" or "only phone calls"; per-agent overrides of fields and events. |
| Google Sheets | Pick an existing spreadsheet (needs the Google Picker with `drive.file`, which needs no broader scope); a summary tab per agent (calls per day, conversion); custom column order and renamed headers; a "rebuild sheet" button that refills the last 30 days from call history. |
| Zoho CRM | Field mapping to custom Zoho fields; choose the Leads or Contacts module; assign the lead owner per agent; attach the transcript as a Note; push appointment bookings as Zoho Events. |
| ArthaLeads | Two-way status sync (lead stage changes in ArthaLeads → Vistrow contact); bulk re-send of the last N calls; routing preview ("this lead would be called by …"). |
| Webhook | Several webhooks with their own events and fields; an HMAC signature header instead of the body token; custom headers; delivery retries with backoff and a dead-letter view. |
| Slack | Pick a channel per agent; @mention a user for hot leads; interactive "Mark contacted" button; daily summary message. |
| WhatsApp | Native WhatsApp Cloud API (approved templates with variables) instead of a generic provider URL; send the appointment confirmation template; opt-out handling. |
| Facebook Lead Ads | Map form questions to contact fields; choose the agent per form; several Pages; a "test lead" button using Meta's lead testing tool. |
| New integrations | HubSpot, Salesforce, LeadSquared (Indian real estate), Google Calendar sync for appointments, Zapier app listing, email notification of each lead. |
