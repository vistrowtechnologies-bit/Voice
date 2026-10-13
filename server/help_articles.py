"""The help centre's articles — one topic per dashboard menu.

Single source of truth for BOTH the in-app help centre (served by
GET /help/articles) and the help bot (its search_help_articles tool), so the
two can never disagree. Written 2026-09-24 against the live dashboard and
re-checked against the code on 2026-10-13: every control named here exists
with that label on the page it describes. When a page changes, change its
article here in the same commit.

Body format (rendered by the dashboard, never as raw HTML):
  "## Heading", "- bullet", "1. step", blank line = new paragraph,
  **bold** inline.
"""

TOPICS: list[dict] = [
    {
        "slug": "getting-started",
        "title": "Get started",
        "icon": "rocket_launch",
        "route": "/dashboard",
        "articles": [
            {
                "slug": "get-started",
                "title": "Get started with Vistrow Voice",
                "video": "get-started",
                "summary": "What the platform does and the order to set it up in.",
                "body": """Vistrow Voice gives your business AI voice agents that answer and place calls in Indian languages, capture leads, book appointments, and log every call with a transcript.

## The fastest start
Click **New Agent** at the top of the page and choose **Build with AI**. Describe your business in plain words and you get a ready-to-edit agent. Prefer to fill in every setting yourself? Choose **Start from scratch**.

## Set up in this order
1. **Agents** — build your agent, then check its instructions, voice and welcome message.
2. **Knowledge Base** — add your brochure, price list or FAQs so the agent answers from your facts.
3. **Testing Lab** — run a few test conversations in the browser before real callers hear it.
4. **Website Widget** or **Phone Numbers** — put the agent where your customers are.
5. **Integrations** — send every qualified lead to your CRM, Slack or Google Sheets.

## Where things are
- **BUILD** — Agents, Voices, Knowledge Base, Testing Lab.
- **DEPLOY** — Phone Numbers, Website Widget, Integrations.
- **Campaigns** — Inbound and Outbound.
- **MONITOR** — Calls, Usage, Contacts, Appointments.
- **Settings** — your workspace, team, plan & billing, calling rules and your own account.
- **SUPPORT** — Help & Support.

Close the sidebar with the panel button next to the logo, or press **⌘B / Ctrl+B**; press it again to bring it back. Press **⌘K / Ctrl+K** to search every page from anywhere.

## Ask Artha Copilot
Click the **Artha** button in the bottom-right corner of any dashboard page to ask questions about your calls, leads, agents and credits.""",
            },
            {
                "slug": "dashboard-overview",
                "title": "Read the Dashboard",
                "summary": "What the Dashboard's numbers mean — and what they count.",
                "body": """The Dashboard summarises calls, leads, minutes and appointments for the period you pick (**Week**, **14 days** or **30 days**), compared with the period before. Testing Lab runs are left out.

## What each figure counts
- **Calls** — every call that started in the period.
- **Qualified leads** — calls where a caller's name was captured. Website-widget visitors can be asked for their name before the call, so many widget calls count.
- **Appointments** — calls where the caller asked for a date and time. It does not guarantee an entry exists in Appointments; confirmed bookings are listed there.
- **Minutes** — total call duration in the period.

## Needs attention
The cards at the top flag things that affect customers, such as a CRM that stopped receiving leads, low credits or calls that failed. Click a card to go to the page that fixes it.""",
            },
        ],
    },
    {
        "slug": "agents",
        "title": "Agents",
        "icon": "smart_toy",
        "route": "/dashboard/agents",
        "articles": [
            {
                "slug": "build-with-ai",
                "title": "Build an agent with AI",
                "video": "build-with-ai",
                "summary": "Describe your business in plain words and get a ready-to-edit agent.",
                "body": """Click **New Agent** and choose **Build with AI**. Nothing is saved until you click **Create agent**, so you can try it freely.

## 1. Describe your business
Write who calls you (or who you call), what they ask, which languages they speak, and what the agent should collect or book — up to 4,000 characters. Not sure what to write? Pick a card under **Or start from an example**. Add your **Business name** and **Website** if you like, then click **Draft my agent** (or press ⌘ + Enter / Ctrl + Enter).

## 2. Answer a few quick questions
If something isn't clear, the builder asks a few short questions. Tap an answer or type your own. If your description already covers everything, this step is skipped.

## 3. Review the draft
The builder writes the instructions, chooses a voice and sets up the fields to fill after every call. Review each section — **Basics**, **Voice & language**, **Instructions**, **Conversation & tools** and **After the call** — edit anything, or click **Regenerate** on one section. Click **Hear the greeting** to listen to the first thing callers hear.

## 4. Create the agent
Click **Create agent**. Then **Run a test call** to talk to it straight away, or **Open agent** to fine-tune it. Your plan's agent limit is checked when you create it.""",
            },
            {
                "slug": "create-and-edit-agent",
                "title": "Create and edit an agent",
                "video": "create-and-edit-agent",
                "summary": "Set an agent's instructions, voice, language and greeting.",
                "body": """Go to **Agents** and click **New Agent**, or the pencil (**Edit**) button on an agent's card. Every setting lives on the agent's own page, in five tabs. Click **Save changes** at the bottom; changes apply from the next call — no redeploy.

## Instructions
- **Name** and **Description**.
- **Model** — Vistrow Bharat, built for Hindi, English and other Indian languages. With an HD or Standard voice it uses 1 credit per minute.
- **Who speaks first** — the AI greets the caller, or waits for the caller to speak.
- **Welcome message** — separate lines for inbound and outbound calls. Type {{ to insert a variable such as the caller's name.
- **System prompt** — the agent's instructions. Leave it blank to use the built-in assistant prompt.
- **Variables** — your own {{variable}} names with fallback values.

## Voice & language
**Voice** (only voices added under **Voices** appear here), **Default language** (the agent follows the caller if they switch), **Voice delivery** (Professional, Balanced or Casual) and **Background sound** with its volume.

## Knowledge & tools
Functions, the attached knowledge base, the live catalog and memory.

## Conversation
**Caller noise suppression**, **Speech settings** (interruption sensitivity and silence handling) and **Call settings** (maximum call duration).

## After the call
Post-call data extraction, the agent's webhook and CRM routing.

## On the agent card
- **Agent ID** — a 10-digit ID with a **Copy ID** button, for recognising the agent in ArthaLeads or any other platform. It is also shown at the top of the agent's page.
- **Agent readiness** — a score such as 5/6 with the next step to finish, like attaching knowledge or assigning a phone number or website.
- Buttons to pause or resume the agent, and to test it in the browser or on a real phone call.""",
            },
            {
                "slug": "agent-functions-and-transfer",
                "title": "Functions, transfer and call limits",
                "summary": "What the agent can do during a call, and when it hands over.",
                "body": """Open an agent, go to the **Knowledge & tools** tab and expand **Functions**.

- Booking appointments, requesting callbacks, capturing lead details and honouring "don't call me again" are always available to the agent.
- **Let the agent end the call**, **Let the agent search the web** and **Let the agent press phone keys (DTMF)** can be switched on or off.
- **Transfer to a human** — set a number to dial and the agent can transfer phone callers on request. It dials your colleague into the call and stays on until they answer. Web calls can't be transferred.
- **Emergency fallback** — a backup number used only if the call itself breaks.
- **Custom functions** — let the agent call your own systems during a call.

## Call settings
On the **Conversation** tab, **Call settings** sets the maximum call duration (calls never run longer than 45 minutes). **Speech settings** controls interruption sensitivity and what the agent does when the caller goes silent.

## Variables and data extraction
- **Variables** (Instructions tab) — define {{variable}} names with fallback values for prompts and greetings.
- **Post-call data extraction** (After the call tab) — fields pulled from every transcript, such as budget or location.""",
            },
            {
                "slug": "agent-webhook-crm-memory",
                "title": "Webhook, CRM routing and memory",
                "summary": "Send an agent's events to your systems and recognise returning callers.",
                "body": """## Webhook
On the agent's **After the call** tab, add a URL under **Webhook** and this agent's lead, appointment and callback events are posted there as JSON — in addition to the workspace webhook on the Integrations page. The same URL in both places gets one delivery.

## CRM routing
By default an agent delivers leads to every connected integration. On the **After the call** tab, select specific integrations under **CRM routing** to limit this agent to those.

## Memory
On the **Knowledge & tools** tab, turn on **Remember returning callers** under **Memory**. The agent recalls past conversations with the same caller, matched by phone number, on phone and widget calls.""",
            },
        ],
    },
    {
        "slug": "testing-lab",
        "title": "Testing Lab",
        "icon": "science",
        "route": "/dashboard/testing",
        "articles": [
            {
                "slug": "run-a-test",
                "title": "Test an agent before customers do",
                "video": "testing-lab",
                "summary": "Run realistic caller scenarios and read the checks.",
                "body": """**Testing Lab** runs a live conversation with your agent's real configuration in the browser — you play the caller.

1. Under **Choose a caller situation**, pick a scenario such as Impatient customer, Angry customer, Silent caller, Hindi-English switching, Noisy background, Booking conflict, Transfer unavailable or Voicemail.
2. Choose the **Agent under test** and read the **Caller instructions** and what **The agent should** do.
3. Click **Start live test** and speak. You can also type in the **Or type here instead…** box at the bottom of the call screen.
4. Review **Latest test result** — opening quality, response length, one question at a time, repeated responses, tool accuracy, first response latency and estimated cost.

Click **Save as regression** to keep a scenario, or **Custom regression** to write your own, so you can re-run it after every prompt change. Testing Lab runs use credits from the first minute.""",
            },
            {
                "slug": "quick-browser-test",
                "title": "Quick test from the Agents page",
                "summary": "Talk to an agent in one click, in the browser or on a phone.",
                "body": """On **Agents**, each card has a microphone button (**Browser test**) and a phone button (**Call test**).

- **Browser test** opens a live call in the page. Speak, or type in the **Or type here instead…** box when the call screen shows it — typed messages reach the agent like speech.
- **Call test** rings a phone number you enter so you hear the agent on a real line.

Test calls appear in **All Calls History** with a **Dashboard test** badge. The first 30 minutes of these test calls each month are free; after that they use credits at the normal rate.""",
            },
        ],
    },
    {
        "slug": "voices",
        "title": "Voices",
        "icon": "graphic_eq",
        "route": "/dashboard/voices",
        "articles": [
            {
                "slug": "choose-voices",
                "title": "Choose and add voices",
                "summary": "Preview voices and add them to your agents' voice picker.",
                "body": """**Voices** lists every voice you can use. Click a voice to play its sample, and click again to pause. Switch the preview between **Hindi** and **English**, search by name or language, or narrow the list with **All**, **Added**, **Female** and **Male**.

## Two kinds of voice
- **HD** — 30 voices that switch language mid-call along with the caller.
- **Standard** — 10 natural conversational voices for Indian languages.

Both use 1 credit per minute with the Vistrow Bharat model.

## Add a voice to your agents
Pick a voice and click **Add to your picker**. Only added voices appear in an agent's **Voice** picker; hover **Added to your picker** and click **Remove from picker** to take it out. Set an agent's voice on its **Voice & language** tab.""",
            },
        ],
    },
    {
        "slug": "knowledge-base",
        "title": "Knowledge Base",
        "icon": "menu_book",
        "route": "/dashboard/knowledge",
        "articles": [
            {
                "slug": "add-knowledge",
                "title": "Give your agent your facts",
                "video": "knowledge-base",
                "summary": "Upload documents, approve Q&A pairs and use strict mode.",
                "body": """1. Go to **Knowledge Base**, name it and click **Create Knowledge Base**.
2. **Add source** — paste text, upload a .txt, .pdf or .docx file, or scan pages from a **Website URL**.
3. Click **Auto-extract Q&A** to turn a source into question–answer pairs, then review and edit them. You can also **Add Q&A pair** by hand.
4. Attach it to an agent: open the agent, go to **Knowledge & tools** → **Knowledge base**, and choose it under **Attached knowledge base**.

## Good to know
- Only the first **8,000 characters** reach the agent on a call; the bar under each knowledge base shows how much is used. Approved Q&A pairs are included first.
- **Strict mode** makes the agent quote your approved answers instead of improvising facts, and say it will check with the team when something isn't covered.
- Starter includes 1 knowledge base, Growth 5 and Scale 15.""",
            },
            {
                "slug": "live-catalog",
                "title": "Live catalog",
                "summary": "Structured products, listings or plans the agent can look up.",
                "body": """The **Live catalog** on the Knowledge Base page holds structured items — products, services, property listings, menus or plans — synced from your catalog feed URL. Only a compact index is loaded into the call; the agent looks up full details (price, availability, specifications) when a caller asks, so a large catalog doesn't slow calls down.

Only agents you enable can use it: open the agent, go to **Knowledge & tools** → **Live catalog**, and turn on **Give this agent access to the live catalog**. The live catalog needs the Growth or Scale plan.""",
            },
        ],
    },
    {
        "slug": "inbound",
        "title": "Inbound calls",
        "icon": "phone_callback",
        "route": "/dashboard/inbound",
        "articles": [
            {
                "slug": "route-inbound-calls",
                "title": "Route incoming calls to an agent",
                "video": "connect-a-number",
                "summary": "Link a number to an agent with hours, days and limits.",
                "body": """Open **Campaigns** → **Inbound** in the sidebar. Pick the number under **Incoming calls to** and the agent under **Routed to agent**, set the schedule, then click **Create Route**. The route is live immediately. Inbound routes need the Growth or Scale plan.

## Schedule & rules
- **Timezone**, **Start date** and **End date**.
- **Max concurrent calls (1–5)** — how many calls this number takes at once.
- **Call window start / end** — leave blank to answer at any time.
- **Active days** — for example Mon–Sat only.

Calls outside the window or days, or beyond the limit, are not answered by the agent. Edit or delete a route under **Saved routes**.""",
            },
        ],
    },
    {
        "slug": "outbound",
        "title": "Outbound campaigns",
        "icon": "campaign",
        "route": "/dashboard/outbound",
        "articles": [
            {
                "slug": "run-a-campaign",
                "title": "Run an outbound campaign",
                "summary": "Call a contact list automatically, within your calling rules.",
                "body": """Open **Campaigns** → **Outbound** and click **New Campaign**. Campaigns need the Growth or Scale plan.

1. **Audience** — name the campaign, choose **Why may we call these people?**, then **Use saved contacts** (narrow by tag if you like) or **Paste phone numbers**.
2. **Calling setup** — pick the **Call from** number and the **Calling agent**, how many attempts per contact, how many calls at once, and an optional start time or calling hours.
3. **Review** — check everything, then **Save draft** or **Launch now** (or **Schedule campaign** if you set a start time).
4. **Pre-flight** — see how many contacts will be dialled, use **Hear it first** → **Test call me** to hear it on your own phone, then click **Start calling**.

Progress shows per campaign, with totals for contacts dialled, connected, blocked and running now.

## Calling rules are automatic
Every dial is checked against your **Do-Not-Call** list and **calling window** from **Settings → Calling rules** before it goes out. Blocked contacts are counted, not called.

## Instant lead follow-up
To call new leads within seconds of them arriving, use the **Instant Lead Follow-up** webhook on the Integrations page.""",
            },
        ],
    },
    {
        "slug": "calls",
        "title": "Calls history",
        "icon": "history",
        "route": "/dashboard/calls",
        "articles": [
            {
                "slug": "find-a-call",
                "title": "Find a call, transcript or recording",
                "summary": "Search, filter and open any call's details.",
                "body": """Open **Calls** in the sidebar. **All Calls History** lists every call across Web, Website Widget and Phone.

- Filter by channel or direction, search by name or number, and switch between newest and oldest first.
- Drag a column divider to resize; the column button resets widths.
- **Website / Page** shows the site and the exact page a widget call started from.

## Call details
Click a caller to open details: the full transcript, recording playback and download, captured lead fields, CRM delivery status (with re-send for ArthaLeads), and earlier calls from the same number.""",
            },
        ],
    },
    {
        "slug": "usage",
        "title": "Usage",
        "icon": "monitoring",
        "route": "/dashboard/usage",
        "articles": [
            {
                "slug": "read-usage",
                "title": "See where your credits go",
                "summary": "Credits and minutes by day, channel, agent and more, for any date range.",
                "body": """Open **Usage** under **MONITOR** in the sidebar. It shows where your credits went, in your own timezone.

## Pick a range
Choose **Today**, **7 days**, **30 days**, **This cycle** or **Custom** dates.

## What you see
- Totals for **Credits used**, **Minutes**, **Calls**, **Avg credits / min** and **Credits left**.
- **Credits and minutes per day** as a chart.
- Breakdowns **By channel**, **By agent**, **By voice tier**, **By model tier**, **By direction** and **By phone number**.
- **Top calls by credits** — the ten most expensive calls in the range; click one to open it.

Owners and admins can click **Export CSV** to download the range. Dashboard test calls are not counted in Calls, but test minutes past the free monthly allowance are included in Credits used.""",
            },
        ],
    },
    {
        "slug": "contacts",
        "title": "Contacts",
        "icon": "contacts",
        "route": "/dashboard/contacts",
        "articles": [
            {
                "slug": "manage-contacts",
                "title": "Manage contacts",
                "summary": "Import, add, export and call contacts.",
                "body": """**Contacts** is updated automatically from every qualified call, plus anything you import or add.

- **Import contacts** from CSV, **Export CSV**, or **Add Contact** by hand.
- Each contact shows status, lead details, lead source, tags and when it was last called; click the call button to ring it.
- Deleting a contact hides it. A later call from the same number updates the hidden record rather than recreating it.""",
            },
            {
                "slug": "phone-number-format",
                "title": "How phone numbers are read",
                "summary": "Why numbers become +91… and how to change the country.",
                "body": """Every number is stored in full international format, for example **+918080197945**, however it was typed — "8080197945", "08080 197945" and "+91 80801 97945" are the same person.

A number typed without a country code is read in your workspace's country. Change it in **Settings → Workspace details → Country** (owners and admins). The same rule applies to contacts, campaigns, the Do-Not-Call list and phone fields across the dashboard.""",
            },
        ],
    },
    {
        "slug": "appointments",
        "title": "Appointments",
        "icon": "event",
        "route": "/dashboard/appointments",
        "articles": [
            {
                "slug": "manage-appointments",
                "title": "Bookings and availability",
                "summary": "See, create and update bookings; set bookable hours.",
                "body": """**Appointments** shows bookings made by your agents or your team, in **Day**, **Week**, **Month** or **List** view. Filter by source (**Booked by the agent** or **Added by your team**) and by status.

- **New appointment** — pick a free slot and book it.
- Open a booking to reschedule it or mark it confirmed, completed, cancelled or no-show.

## Bookable hours
Agents only offer slots inside your hours. Set business hours per day, slot length (15–60 minutes), timezone and blackout dates under **Settings → Scheduling** (owners and admins).""",
            },
        ],
    },
    {
        "slug": "integrations",
        "title": "Integrations",
        "icon": "extension",
        "route": "/dashboard/integrations",
        "articles": [
            {
                "slug": "connect-integrations",
                "title": "Send leads to your CRM and tools",
                "summary": "Connect Zoho, ArthaLeads, Slack, Sheets or a webhook.",
                "body": """Go to **Integrations** and click a card (**Set up**, or **Manage** once connected). Connected integrations receive every qualified lead in real time. Connecting an integration needs the Growth or Scale plan.

- **ArthaLeads CRM** — paste your ArthaLeads connection key; leads arrive with the full transcript.
- **Zoho CRM** — sign in with a Zoho CRM admin account; each caller becomes a lead.
- **CRM / Webhook** — every lead posted as JSON to any URL (Zapier, n8n, Make).
- **Slack** — a message in the channel you choose.
- **Google Sheets** — click **Sign in with Google** and we create a leads sheet in your Drive.

Each integration's page has four tabs: **Overview**, **Settings** (what to send), **Activity** (every delivery) and **Setup help**.

To call new leads from forms the moment they arrive, use the **Instant Lead Follow-up** webhook (see "Call new leads within seconds").

## Check it's working
Each card shows its status and last delivery. Click **Send test** on the integration's page. If deliveries start failing, the Dashboard flags it and — if **Delivery issues** emails are on in your preferences — you get an email.""",
            },
            {
                "slug": "instant-lead-follow-up",
                "title": "Call new leads within seconds",
                "summary": "Use the Instant Lead Follow-up webhook.",
                "body": """**Instant Lead Follow-up** at the bottom of the Integrations page gives you a private URL (use the eye button to show it and the copy button to copy it). POST a lead to it and a call is queued within about 15–30 seconds.

It works with any source that can send a webhook: a form on your website, your CRM, or an automation tool such as Zapier, Make or n8n. Every queued call still follows your calling rules — Do-Not-Call and calling window.""",
            },
        ],
    },
    {
        "slug": "website-widget",
        "title": "Website Widget",
        "icon": "widgets",
        "route": "/dashboard/website-widget",
        "articles": [
            {
                "slug": "add-widget",
                "title": "Add the call button to your website",
                "video": "website-widget",
                "summary": "Add a site, pick an agent, and install the widget.",
                "body": """1. Go to **Website Widget**. Under **Add your website**, fill in **Site name**, **Agent**, **Domain (optional)**, **Corner**, **Button label** and **Greeting bubble (optional)**, then click **Add website**.
2. Open the site under **Your sites**. Its **Site key** has a copy button.
3. Install it: choose **WordPress** and click **Download plugin** (paste the site key into the plugin's settings), or choose **Any other website** and copy the snippet to paste just before the closing </body> tag.
4. Visitors click the button and talk to your agent in the browser — no phone needed.

## Settings on the site card
- **Widget type** — voice call, voice + chat, or chat only.
- **Before starting, ask for** — name, phone number and email: don't ask, optional or required.
- **Avatar color** — the animated orb or Artha, the waving presenter.

Click **Save changes** after editing. Each site has its own key and its own call history; filter the Calls page by site. **Regenerate key** if a key is exposed — the old key stops working immediately.""",
            },
            {
                "slug": "page-rules",
                "title": "Different agents on different pages",
                "summary": "Page rules route pages to agents with their own greeting.",
                "body": """**Page rules** on a site card send visitors on matching pages to a different agent, with an optional greeting and avatar — for example, a property page routed to an agent that only knows that listing.

Type a real value in **URL contains**, pick the **Agent**, then click **Add rule** — or **Save changes** at the bottom, which also adds a rule you've filled in. **Fetch pages from this domain** lists the site's pages for you once the site's domain is set.""",
            },
        ],
    },
    {
        "slug": "phone-numbers",
        "title": "Phone numbers",
        "icon": "dialpad",
        "route": "/dashboard/numbers",
        "articles": [
            {
                "slug": "connect-a-number",
                "title": "Connect a phone number",
                "video": "connect-a-number",
                "summary": "Register an EnableX number and route it to an agent.",
                "body": """Today numbers come from **EnableX**. Twilio, Exotel and Plivo are shown as Coming soon.

1. Create a project with the Voice service in your EnableX portal and provision the number there.
2. Go to **Phone Numbers** and enter the **App ID** and **App Key (secret)** from EnableX Portal → Project Settings → API Credentials, then click **Connect EnableX**.
3. Under **Add a virtual number**, enter it in full international format (e.g. +917713128715) with an optional **Label**, then click **Add number**.
4. Pick the agent next to the number under **Your numbers**, and use **Test call** → **Place call** to check it.

Set hours, days and limits for incoming calls under **Campaigns → Inbound**.""",
            },
        ],
    },
    {
        "slug": "compliance",
        "title": "Calling rules",
        "icon": "verified_user",
        "route": "/dashboard/compliance",
        "articles": [
            {
                "slug": "calling-rules",
                "title": "Calling window and Do-Not-Call",
                "summary": "Keep outbound calling within TRAI rules automatically.",
                "body": """Open **Settings → Calling rules**.

## Calling window
TRAI norms limit unsolicited calls to 9am–9pm, Monday–Saturday. With **Enforce calling window** on, outbound dials outside your **Start**/**End** hours and **Allowed days** are blocked automatically, in the callee's timezone.

## Do-Not-Call
With **Honor Do-Not-Call list** on, every outbound dial is checked against your **Do-Not-Call registry** first. Add numbers with **Block** or **Bulk import numbers**. When a caller asks your agent not to be called again, the agent adds them itself.

Click **Save rules** after changing anything. Owners and admins can change these rules.""",
            },
            {
                "slug": "consent-recording-retention",
                "title": "Consent, recording and data retention",
                "summary": "Spoken consent, call recording and how long data is kept.",
                "body": """These are under **Settings → Calling rules** → **Consent, recording & retention**.

- **Require spoken consent** — the agent's first reply asks the caller whether it's okay that the call is recorded (if recording is on) and their details are used to follow up. The answer is saved on the call. If they decline, or leave before answering, the recording is discarded and the agent does not collect personal details.
- **Record calls** — store call audio alongside transcripts.
- **Data retention (days)** — transcripts and recordings older than this are deleted automatically each day. 0 keeps them indefinitely.

Recording storage use, and deleting old recordings, is under **Settings → Storage**.""",
            },
        ],
    },
    {
        "slug": "billing",
        "title": "Billing & credits",
        "icon": "credit_card",
        "route": "/dashboard/billing",
        "articles": [
            {
                "slug": "how-credits-work",
                "title": "How credits are counted",
                "summary": "One credit is one minute of conversation, on every channel.",
                "body": """**1 credit = 1 minute** of conversation with the Vistrow Bharat model and an HD or Standard voice — the same on phone, website widget and web calls.

- **Dashboard test calls** (Browser test and Call test) are free for the first 30 minutes each month; after that they use credits at the normal rate.
- **Testing Lab** runs use credits from the first minute.
- Phone line charges from your telephony provider are separate from AI credits.

## Where to check
- **Settings → Plan & billing** shows your remaining credits and minutes used this cycle.
- **Usage** (under MONITOR) breaks credits down by day, channel, agent, voice tier, model tier, direction and phone number, and lists the most expensive calls.
- Each call's details show the credits it used.

If you turn on **Low credits** emails in **Settings → Preferences**, you're emailed when credits drop below 10% of your allocation.""",
            },
            {
                "slug": "plans",
                "title": "Plans",
                "summary": "What Starter, Growth and Scale include.",
                "body": """All prices are per month, plus 18% GST.

- **Starter** — ₹2,999: 350 credits, 1 AI agent, 1 knowledge base, up to 5 calls at once. Website widget, call history, recording, transfer, memory and appointment booking.
- **Growth** — ₹5,999: 850 credits, 5 AI agents, 5 knowledge bases, up to 15 calls at once. Adds inbound and outbound campaigns, integrations (CRM, Slack, Google Sheets, webhook), the live catalog and Copilot actions.
- **Scale** — ₹12,999: 2,000 credits, 20 AI agents, 15 knowledge bases, up to 30 calls at once. Adds full API access.

See the plans side by side in **Settings → Plan & billing**. Online payments and self-service plan changes aren't available yet — contact us to change plans or add credits.""",
            },
        ],
    },
    {
        "slug": "settings",
        "title": "Settings",
        "icon": "settings",
        "route": "/dashboard/settings",
        "articles": [
            {
                "slug": "workspace-and-team",
                "title": "Workspace, country and team",
                "summary": "Company name, phone-number country, team, and where each setting lives.",
                "body": """**Settings** is split into groups:

- **Workspace** — **Workspace details** (company name and the **Country** your phone numbers belong to), **Team & roles** and **Scheduling**.
- **Billing & usage** — **Plan & billing** and **Storage** (recording storage and cleanup).
- **Connections** — **Calling rules** (calling window, consent and Do-Not-Call).
- **Developer** — **API keys** (needs the Scale plan).
- **Account** — **My profile**, **Sign-in & security**, **Preferences** and **Data & privacy**.

## Team & roles
Click **+ Invite member**, enter their name and email, choose a role — Admin, Member or Viewer — and click **Send invite**. Owners and admins manage the team, the country, scheduling and calling rules.

## Scheduling
Business hours, slot length, timezone and blackout dates your agents book appointments against.""",
            },
            {
                "slug": "notifications-and-privacy",
                "title": "Email notifications, security and your data",
                "summary": "Choose alert emails, secure sign-in, export or delete data.",
                "body": """## Preferences (per person)
**Notifications** — emails just for you:
- **Qualified leads** — when your agents capture new leads, grouped every couple of minutes.
- **Delivery issues** — when a connected CRM or integration stops receiving your leads.
- **Low credits** — when credits drop below 10% of your allocation.

**In the dashboard** — what the bell shows (**New calls**, **New bookings**), **Play a sound**, and **Pop-up on this computer**. You can also set **Your timezone**.

## Sign-in & security
Turn on **Two-step login** with an authenticator app, change or create your password, and see **Your devices** — log out any device, or **Log out all other devices**.

## Data & privacy
**Download my data** exports your data as JSON (never passwords or API keys). **Request deletion** starts an account deletion, which our team verifies before processing.""",
            },
        ],
    },
    {
        "slug": "help-and-support",
        "title": "Help & Support",
        "icon": "support_agent",
        "route": "/dashboard/support",
        "articles": [
            {
                "slug": "copilot",
                "title": "Ask Artha Copilot",
                "video": "copilot",
                "summary": "Ask questions about your workspace, or have it make a change after you confirm.",
                "body": """Click the **Artha** button in the bottom-right corner of any dashboard page. **Artha Copilot** reads your live workspace — calls, leads, agents, bookings, credits and integrations. Tap a suggested question or type your own, for example **Who are my hottest leads right now?**

## Ask it to make a change
On the Growth and Scale plans, Copilot can also act for you. It prepares the action and shows a **Needs your confirmation** card — nothing changes until you click **Confirm**. **Cancel** leaves everything as it is. Viewers can ask questions but not make changes.

It can:
- Pause an agent or put it live
- Change an agent's name, language or welcome message
- Book a callback or an appointment
- Choose which integrations an agent sends leads to
- Route a phone number to an agent (admins)
- Choose which call events an integration sends (admins)

## Good to know
- Click the expand button (**Larger**) for a bigger panel.
- Use the thumbs or **Report** under a reply to tell us how it did.""",
            },
            {
                "slug": "contact-support",
                "title": "Contact support and track your request",
                "summary": "Raise a request with screenshots and follow every reply.",
                "body": """Go to **Help & Support** → **Submit a request**. Choose what it's about and how urgent it is, describe what happened, and add screenshots — drag them in, browse, or paste one with ⌘V / Ctrl+V (up to 3 files, 5 MB each).

## After you submit
- You get a confirmation email with your request number, such as VV-12.
- **Your requests** shows each request as **Open** (we're working on it), **Awaiting your reply** (we've answered) or **Solved**.
- Replies arrive by email and in the notification bell. Reply from the request page — add details or more screenshots any time.
- **Mark as solved** when you're done; replying later reopens it. You can rate the help you got once it's solved.

Screenshots and files on a solved request are deleted after 14 days; the conversation itself stays.

You can also email **support@vistrowvoice.com**.""",
            },
        ],
    },
]


def all_articles() -> list[dict]:
    """Flat list with each article's topic attached — what search runs over."""
    return [
        {**article, "topicSlug": topic["slug"], "topicTitle": topic["title"]}
        for topic in TOPICS
        for article in topic["articles"]
    ]


def get_article(slug: str) -> dict | None:
    return next((a for a in all_articles() if a["slug"] == slug), None)


# Words that appear in most questions and most titles ("How do I…") and so
# ranked unrelated articles above the right one.
_STOP_WORDS = {
    "how", "the", "and", "for", "can", "what", "why", "does", "with", "you", "your", "are",
    "our", "get", "use", "set", "from", "into", "this", "that", "any", "all", "want",
}


def search(query: str, limit: int = 5) -> list[dict]:
    """Plain keyword ranking: title hits weigh most, then summary, then body.
    Good enough for ~40 articles, and the bot and the page rank identically."""
    words = [
        w for w in "".join(c.lower() if c.isalnum() else " " for c in query).split()
        if len(w) > 2 and w not in _STOP_WORDS
    ]
    if not words:
        return []
    scored = []
    for a in all_articles():
        title, summary, body = a["title"].lower(), a["summary"].lower(), a["body"].lower()
        score = sum(5 * (w in title) + 3 * (w in summary) + (w in body) + (w in a["topicTitle"].lower()) * 2 for w in words)
        if score:
            scored.append((score, a))
    scored.sort(key=lambda s: -s[0])
    return [a for _, a in scored[:limit]]
