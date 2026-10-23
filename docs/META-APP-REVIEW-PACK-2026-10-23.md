# Meta App Review pack: Vistrow Voice (app 1140705345278569)

Written 23 Oct 2026. Every "Done" line was checked on the live system or in Meta's own screens that day; anything not yet proven says so.

Goal (owner): **one submission** that covers every permission we need, so customers never hit "missing permission" later.

---

## 1. What blocks submission today

| # | Item | Status | Who |
|---|------|--------|-----|
| 1 | **Business Verification** for the *Vistrow* portfolio (908901535552344) | Not started | Owner. Business Settings → Security Centre → Start verification. Needs company documents; takes days |
| 2 | **Tech Provider (access verification)** | Not started. Meta's app dashboard says: "Become a Tech Provider to submit to App Review and request access to user data and data from other businesses. You'll be required to complete access verification." | Owner, after #1. App dashboard → Publish → Become a Tech Provider |
| 3 | **App icon** | **Missing.** The App icon box in Settings → Basic is empty. The file is `design/vistrow-app-icon-1024.png` (1024×1024). Meta's uploader refused it from automation | Owner: drag it in, crop to the whole image, Save |
| 4 | **WhatsApp features built** | Not built (section 4). App Review needs a screencast of each permission in use, so the WhatsApp permissions can only go in once these work | Claude |
| 5 | **Reviewer login** on app.vistrowvoice.com | Not created | Claude (section 6) |
| 6 | **Screencasts** | Script ready (section 5); record after #4 and #5 | Owner records, or Claude drives and owner records |

Already done and checked:
- Privacy policy (`/privacy`, section 7 "Google and Meta user data") and Terms (`/terms`, section 5). Both live.
- Data deletion callback: `https://api.vistrowvoice.com/webhooks/meta/deletion`. Deauthorize callback: `/webhooks/meta/deauthorize`.
- App domains (app., www., api.vistrowvoice.com), category "Business and pages", contact email.
- Facebook Login for Business configuration "Lead Ads connect", `config_id` 2892917577750662.
- Page webhook (`leadgen`) is verified and subscribed. Meta's sample event was accepted with a valid signature.
- Live dashboard connect flow tested end to end on 23 Oct (#262/#267).

## 2. Two facts that shape the submission (verified 23 Oct)

1. **Same portfolio = fewer permissions.** The app is owned by the Vistrow portfolio. Connecting the Vistrow portfolio itself granted only 5 permissions: no `ads_read`, `ads_management` or `business_management` (Business Settings → Connected apps shows 5 abilities). Connecting **PropHunt LLP** (a separate portfolio) granted all 8 (8 abilities, and `debug_token` lists all 8 scopes). Meta's docs require the client's portfolio to be separate from the app's.
   **For the screencast, connect a separate portfolio** (for example PropHunt LLP), not Vistrow.
2. **Unpublished app = no leads.** Lead reads return 0 rows with no error:
   - The Vistrow Page has default leads access, yet the Testing Tool lead never came back.
   - PropHunt forms with 24/18/15 leads read 0. PropHunt's leads access is restricted to named CRMs, and Vistrow Voice **cannot be added as a CRM yet** (it isn't searchable, while published apps are).

   Expect lead reads to work only after publishing. Re-test then. Until then the lead path is proven only up to "read call succeeds".

## 3. Permissions: request exactly these

Meta rejects permissions the screencast doesn't show in use. So: request everything we use, nothing we don't.

### A. Lead Ads (built and live)

| Permission | Why we need it (what the reviewer sees) |
|---|---|
| `pages_show_list` | After Connect, we list the business's Pages so they pick which ones run their Lead Ads |
| `pages_manage_metadata` | We subscribe each chosen Page to the `leadgen` webhook so new leads reach us in seconds |
| `pages_read_engagement` | We read Page details (name) and fetch the lead the webhook points to |
| `pages_manage_ads` | We list the Page's lead forms (`/{page}/leadgen_forms`), so the business can send each form to its own AI agent before any lead arrives |
| `leads_retrieval` | We read each new lead's answers (name, phone, email, custom questions), save it as a contact, and our AI agent calls the lead within 60 seconds |
| `ads_read` | We read the business's lead ads (ad, ad set, campaign names) so each ad can be routed to its own agent, and show which ad a lead came from |
| `business_management` | Facebook Login for Business: reading the ad accounts and Pages the business shared through its portfolio |
| `public_profile` (Advanced Access) | Required by Meta for Facebook Login for Business apps to go live |

**Remove before submitting:** `ads_management`. We only *read* ads; nothing in the product creates or edits them, and the reviewer would see no use of it.
**Test needed:** drop it from the login configuration, reconnect a separate portfolio, and confirm the ad list still loads with `ads_read` only.

### B. WhatsApp (to build first, see section 4)

| Permission | Use the reviewer will see |
|---|---|
| `whatsapp_business_management` | Embedded Signup: the business connects its WhatsApp number in a pop-up from our dashboard; we subscribe the WhatsApp Business Account to webhooks |
| `whatsapp_business_messaging` | (1) Click-to-WhatsApp ad leads: we receive the customer's first message, create the lead, and the agent calls them. (2) The daily lead summary and call outcomes we send to the owner on WhatsApp |

`whatsapp_business_manage_events` is **only** for sending conversion events back on WhatsApp. Leave it out unless that feature is built.

### C. Not requested (and why)

- `email`: we never read the Facebook user's email.
- Messenger / Instagram DM permissions (`pages_messaging`, `instagram_*`): not built. Add in a later, separate review.
- Marketing API Access Tier: stay on Standard. Advanced needs 500 calls in 15 days and isn't required for reading leads and ads.

## 4. Click-to-WhatsApp (CTWA) leads: what to build before submitting

What it is: a Facebook or Instagram ad whose button opens a WhatsApp chat with the business. There is no form. The "lead" is the first message, and it already carries the customer's WhatsApp number.

How it reaches us (Meta Cloud API): the business connects its WhatsApp number to our app through **Embedded Signup**. Each customer message then arrives as a `messages` webhook. Meta's reference confirms the payload includes the sender's number (`from`, and `wa_id` in `contacts`). Messages that came from an ad also carry the ad details (**to verify on the first live payload**; the reference page we read didn't show the referral fields).

Build list (one PR each, tests and live checks as for Lead Ads):
1. WhatsApp **Embedded Signup** configuration in Meta, plus a "Connect WhatsApp" pop-up in the dashboard (same pattern as Lead Ads). Support **coexistence**, so a business keeps using the WhatsApp Business app on the same number.
2. `/webhooks/whatsapp`: signed, idempotent, same queue design as `/webhooks/meta`. An inbound message with ad details becomes a lead (phone = sender, source = ad id/name), and runs through the same routing rules (ad → agent) and the same 60-second call. Opt-out words ("STOP") are respected.
3. **Daily summary** on WhatsApp to the owner (leads in, calls made, booked), using an approved message template.
4. Dashboard: the WhatsApp card shows the connected number, CTWA leads in the same Leads tab, and a per-ad agent mapping shared with Lead Ads.

Not needed for CTWA: anything on the Lead Ads side. It reuses rules, contacts, the dialler and the 60-second promise.

## 5. Screencast script (one video per permission group, English, 1080p)

Record in a clean browser. Show the URL bar. Narrate with on-screen captions.

**Video 1: Lead Ads connect (`pages_show_list`, `business_management`, `public_profile`)**
1. app.vistrowvoice.com → sign in with the reviewer login (section 6) → Integrations → Facebook & Instagram Lead Ads.
2. Click **Connect with Facebook**. The dialog explains the steps. Click **Continue with Facebook**.
3. In Facebook's window, pick the test business portfolio (a **separate** portfolio), its Page, and its ad account. Confirm.
4. Back in the dialog: the Page list appears (`pages_show_list`). Tick the Page, pick an agent, click Connect.

**Video 2: webhook and forms (`pages_manage_metadata`, `pages_manage_ads`)**
1. The done screen says "connected, N lead forms found".
2. Settings tab: Connected Pages shows "Subscribed to new leads" (`pages_manage_metadata`).
3. Lead rules: the Form dropdown lists the Page's forms by name (`pages_manage_ads`).

**Video 3: ads (`ads_read`)**
1. Lead rules: choose "An ad". The dropdown lists the lead ads with their campaign names. Map one ad to a different agent.

**Video 4: leads (`leads_retrieval`)**
1. Meta's Lead Ads Testing Tool: create a test lead on the test Page's form.
2. The dashboard Leads tab shows it within seconds, with every answer, marked "Test lead (never dialled)".
3. Open the contact: the form answers and the ad and form it came from.

**Video 5: WhatsApp (after section 4 is built)**
1. Integrations → WhatsApp → Connect → Embedded Signup pop-up → choose the number.
2. Send a message to that number from a phone via a Click-to-WhatsApp ad preview. It appears as a lead; the agent call is queued.
3. Show the daily summary arriving on the owner's WhatsApp.

## 6. Reviewer access (to create)

- A dedicated workspace on app.vistrowvoice.com: `meta-review@vistrowvoice.com`, Growth plan, one live agent with a test number. Dialling is pointed at a safe test number so a reviewer's test lead never calls a real person.
- The password goes in App Review's "test credentials" field only, never in this repo.
- Reviewer notes: "Use your own test business portfolio and Page; Facebook Login for Business requires the portfolio to be separate from ours."

## 7. Submission order

1. Owner: Business Verification → Tech Provider access verification → app icon.
2. Claude: build WhatsApp/CTWA (section 4) during verification; drop `ads_management` and re-test; create the reviewer workspace.
3. Record the videos (section 5). Fill each permission's use-case text from section 3.
4. Submit **one** review: section 3A + 3B.
5. After approval: publish the app; re-test lead reads on a default-access Page and a CRM-restricted Page; add Vistrow Voice to leads access where restricted; build the in-dashboard "allow Vistrow Voice to read your leads" prompt for restricted Pages.
