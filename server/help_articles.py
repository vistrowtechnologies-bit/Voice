"""The help centre's articles — one topic per dashboard menu.

Single source of truth for BOTH the in-app help centre (served by
GET /help/articles) and the help bot (its search_help_articles tool), so the
two can never disagree. Written 2026-09-24 against the live dashboard: every
control named here was checked on the page it describes. When a page
changes, change its article here in the same commit.

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
                "summary": "What the platform does and the order to set it up in.",
                "body": """Vistrow Voice gives your business AI voice agents that answer and place calls in Indian languages, capture leads, book appointments, and log every call with a transcript.

## Set up in this order
1. **Agents** — open your agent and set its persona, voice, default language and welcome message.
2. **Knowledge Base** — add your brochure, price list or FAQs so the agent answers from your facts.
3. **Testing Lab** — run a few test conversations in the browser before real callers hear it.
4. **Website Widget** or **Phone Numbers** — put the agent where your customers are.
5. **Integrations** — send every qualified lead to your CRM, Slack or Google Sheets.

## Where things are
- The sidebar groups pages by Platform, Campaigns, Management and Operations; **Help & Support** is pinned at the bottom.
- Close the sidebar with the panel button next to the logo, or press **⌘B / Ctrl+B**; press it again to bring it back.
- Press **⌘K / Ctrl+K** to search every page from anywhere.""",
            },
            {
                "slug": "dashboard-overview",
                "title": "Read the Dashboard",
                "summary": "What the Dashboard's numbers mean — and what they count.",
                "body": """The Dashboard summarises calls, leads, minutes and appointments for the period you pick (Week, 14 days or 30 days), compared with the period before.

## What each figure counts
- **Qualified** — calls where a caller's name was captured. Website-widget visitors enter their name before the call, so most widget calls count.
- **Booked** — calls where the caller asked for a date and time. It does not guarantee an entry exists in Appointments; confirmed bookings are listed there.
- **Minutes** — total call duration in the period.

## Needs attention
The cards at the top flag things that affect customers: a CRM that stopped receiving leads, calls that ended before anyone spoke, and finished campaigns. Click a card to go to the page that fixes it.""",
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
                "slug": "create-and-edit-agent",
                "title": "Create and edit an agent",
                "summary": "Set an agent's voice, language, prompt and greeting.",
                "body": """Go to **Agents** and click **New Agent**, or **Edit** on an existing card. Every setting lives on the agent's own page; click **Save changes** at the bottom. Changes apply from the next call — no redeploy.

## The main settings
- **Model** — the AI that holds the conversation. Vistrow Bharat is built for Indian languages; Standard uses half the credits.
- **Voice** — only voices added under **Voices** appear here.
- **Default language** — the language the agent opens in. It follows the caller if they switch.
- **Welcome message** — separate lines for inbound and outbound calls. Use {{name}}-style variables to personalise them.
- **System prompt** — the agent's instructions. Leave it blank to use the built-in assistant prompt.
- **Who speaks first**, **voice delivery**, **emotion intensity**, **noise suppression** and **background ambience** tune how the call sounds.

## Agent readiness
Each card shows a readiness score such as 5/6 with the next step to finish, like adding a knowledge base or assigning a number.""",
            },
            {
                "slug": "agent-functions-and-transfer",
                "title": "Functions, transfer and call limits",
                "summary": "What the agent can do during a call, and when it hands over.",
                "body": """Open an agent and expand **Functions**.

- Booking appointments, requesting callbacks, capturing lead details and honouring "don't call me again" are always available to the agent.
- **End call**, **web search** and **keypad tones** can be switched on or off.
- **Transfer** is offered automatically when a transfer phone number is set. The agent dials your colleague into the call and stays on until they answer.

## Call settings
**Call settings** sets the maximum call duration. **Speech settings** controls interruption sensitivity and what the agent does when the caller goes silent.

## Variables and data extraction
- **Variables** — define {{variable}} names with fallback values for prompts and greetings.
- **Post-call data extraction** — fields pulled from every transcript, such as budget or location.""",
            },
            {
                "slug": "agent-webhook-crm-memory",
                "title": "Webhook, CRM routing and memory",
                "summary": "Send an agent's events to your systems and recognise returning callers.",
                "body": """## Webhook
Add a URL under **Webhook** and this agent's lead, appointment and callback events are posted there as JSON — in addition to the workspace webhook on the Integrations page. The same URL in both places gets one delivery.

## CRM routing
By default an agent delivers leads to every connected integration. Select specific integrations under **CRM routing** to limit this agent to those.

## Memory
Turn on **Memory** and the agent remembers returning callers by phone number — a short summary of past calls — and greets them accordingly.""",
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
                "summary": "Run realistic caller scenarios and read the checks.",
                "body": """**Testing Lab** runs a live conversation with your agent's real configuration in the browser — you play the caller.

1. Pick a situation such as Impatient customer, Angry customer, Silent caller, Hindi-English switching, Noisy background, Booking conflict, Transfer unavailable or Voicemail.
2. Choose the **Agent under test** and read the caller instructions and expected behaviour.
3. Click **Start live test** and speak, or type in "Or type here instead".
4. Review **Latest test result** — opening quality, response length, one question at a time, repeated responses, tool accuracy and cost.

Save your own scenario with **Custom regression** to re-run it after every prompt change.""",
            },
            {
                "slug": "quick-browser-test",
                "title": "Quick test from the Agents page",
                "summary": "Talk or type to an agent in one click.",
                "body": """On **Agents**, each card has a **Browser test** button (microphone) and a **Call test** button (phone).

- **Browser test** opens a live call in the page. Speak, or type in "Or type here instead" — typed messages reach the agent exactly like speech.
- **Call test** rings a phone number so you hear the agent on a real line.

Test calls appear in **All Calls History** with a **Dashboard test** badge.""",
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
                "summary": "Preview voices, understand tiers, and add them to your picker.",
                "body": """**Voices** lists every voice by tier. Preview any voice in Hindi or English with **Listen**.

## Tiers and credits
- **Vistrow Expressive** — most expressive; switches language mid-call; 2× credits.
- **Premium** — natural conversational voices; 2× credits.
- **Standard** — 1× credits.

## Add a voice to your agents
Click **Add to my voices**. Only added voices appear in an agent's **Voice** picker; **Remove** takes a voice out of the picker.""",
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
                "summary": "Upload documents, approve Q&A pairs and use strict mode.",
                "body": """1. Go to **Knowledge Base** and click **Create Knowledge Base**.
2. **Add source** — upload a brochure, price sheet or handbook, or paste text.
3. Click **Auto-extract Q&A** to turn it into question–answer pairs, then review and edit them. You can also **Add Q&A pair** by hand.
4. Attach the knowledge base to an agent under **Agents → Knowledge base**.

## Good to know
- Only the first **8,000 characters** reach the agent on a call; the bar under each knowledge base shows how much is used. Approved Q&A pairs are included first.
- **Strict mode** makes the agent quote your approved answers instead of improvising facts, and say it will check with the team when something isn't covered.""",
            },
            {
                "slug": "live-catalog",
                "title": "Live catalog",
                "summary": "Structured products, listings or plans the agent can look up.",
                "body": """The **Live catalog** holds structured items — products, services, property listings, menus or plans. Only a compact index is loaded into the call; the agent looks up full details (price, availability, specifications) when a caller asks, so a large catalog doesn't slow calls down.

Only agents you explicitly enable can use the catalog.""",
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
                "summary": "Link a number to an agent with hours, days and limits.",
                "body": """Go to **Inbound**, pick the number under **Incoming calls to** and the agent under **Routed to agent**, then **Create Route**. The route is live immediately.

## Schedule & rules
- **Timezone**, **Start date** and **End date**.
- **Call window start / end** — leave blank to answer at any time.
- **Active days** — for example Mon–Sat only.
- **Max concurrent calls** — how many calls this number takes at once.

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
                "summary": "Call a contact list automatically, within compliance rules.",
                "body": """1. Add contacts under **Contacts** (import a CSV or add them by hand).
2. Go to **Outbound** and click **New Campaign**. Pick the number, the agent, and the contacts or a segment.
3. Launch it. Progress shows per campaign: connected, calling, pending, no-answer, failed and blocked.

## Compliance is automatic
Every dial is checked against your **Do-Not-Call list** and **calling window** from the Compliance page before it goes out. Blocked contacts are counted, not called.

## Instant lead follow-up
To call new leads within seconds of them arriving, use the webhook on **Integrations → Instant Lead Follow-up**.""",
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
                "body": """**All Calls History** lists every call across Web, Website Widget and Phone.

- Filter by channel, feedback or direction; search by name or number; change the sort order.
- Drag a column divider to resize; the column button resets widths.
- **Website / Page** shows the site and the exact page a widget call started from.

## Call details
Click a caller to open details: the full transcript, recording playback and download, captured lead fields, CRM delivery status (with re-send), and earlier calls from the same number.""",
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
- Each contact shows status, tags, source and when it was last called; click **Call** to ring it.
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
                "body": """**Appointments** shows bookings made by your agents or your team, in **Calendar** or **List** view. Filter by source (Agent or Manual) and status.

- **New Appointment** — pick a free slot and book it.
- Open a booking to reschedule it or mark it confirmed, completed, cancelled or no-show.

## Bookable hours
Agents only offer slots inside your hours. Set business hours per day, slot length (15–60 minutes), timezone and blackout dates under **Settings → Scheduling**.""",
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
                "summary": "Connect Zoho, ArthaLeads, Slack, Sheets, WhatsApp or a webhook.",
                "body": """Go to **Integrations** and click **Connect** on a card. Connected integrations receive every qualified lead in real time.

- **Zoho CRM** and **ArthaLeads CRM** — leads go straight into your CRM.
- **Facebook Lead Ads** — new form leads are queued for a call within seconds.
- **CRM / Webhook** — every lead posted as JSON to any URL (Zapier, n8n, Make).
- **Slack**, **WhatsApp**, **Google Sheets** — alerts, follow-ups and a lead sheet.

## Check it's working
Each card shows its status, last sync and any error; use **Send test** where offered. If deliveries start failing, the Dashboard flags it and — if enabled in your preferences — you get an email.""",
            },
            {
                "slug": "instant-lead-follow-up",
                "title": "Call new leads within seconds",
                "summary": "Use the Instant Lead Follow-up webhook.",
                "body": """**Integrations → Instant Lead Follow-up** gives you a private URL. POST a lead to it and a call is queued within about 15–30 seconds.

It works with Zapier's "Webhooks by Zapier" step (e.g. from Facebook Lead Ads) or any source that can send a webhook. Every queued call still follows your Compliance rules — Do-Not-Call and calling window.""",
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
                "summary": "Create a site, pick an agent, and embed the widget.",
                "body": """1. Go to **Website Widget** → **Add your website**. Name it, pick the **Agent**, the corner, and the button label.
2. Copy the embed snippet (or use the WordPress plugin) onto your site.
3. Visitors click the button and talk to your agent in the browser — no phone needed.

Each site has its own key and its own call history; filter the Calls page by site. **Regenerate key** if a key is exposed.

## Avatar
Choose the animated **Orb** or **Artha**, the waving presenter, as the button's face.""",
            },
            {
                "slug": "page-rules",
                "title": "Different agents on different pages",
                "summary": "Page rules route pages to agents with their own greeting.",
                "body": """**Page rules** send visitors on matching pages to a different agent, with an optional greeting and avatar — for example, a property page routed to an agent that only knows that listing.

Each rule saves the moment you click **Add rule**. **Save changes** lower on the page only saves the site's main settings. Type a real value in **URL contains** before adding a rule.""",
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
                "summary": "Register an EnableX number and route it to an agent.",
                "body": """Today numbers come from **EnableX** (Twilio, Exotel and Plivo are coming soon).

1. Provision the number in your EnableX portal.
2. Go to **Phone Numbers**, connect EnableX with the App ID and key from EnableX → Project Settings → API Credentials.
3. **Add a virtual number** in full international format (e.g. +917713128715) with an optional label.
4. Pick the agent next to the number, and use **Test call** to check it.

Set hours, days and limits for incoming calls under **Inbound**.""",
            },
        ],
    },
    {
        "slug": "compliance",
        "title": "Compliance",
        "icon": "verified_user",
        "route": "/dashboard/compliance",
        "articles": [
            {
                "slug": "calling-rules",
                "title": "Calling window and Do-Not-Call",
                "summary": "Keep outbound calling within TRAI rules automatically.",
                "body": """## Calling window
TRAI norms limit unsolicited calls to 9am–9pm, Monday–Saturday. With **Enforce calling window** on, outbound dials outside your hours and days are blocked automatically, in the callee's timezone.

## Do-Not-Call
Every outbound dial is checked against your **Do-Not-Call registry** first. Add numbers with **Block** or **Bulk import numbers**. When a caller asks your agent not to be called again, the agent adds them itself.

Click **Save rules** after changing anything.""",
            },
            {
                "slug": "consent-recording-retention",
                "title": "Consent, recording and data retention",
                "summary": "Spoken consent, call recording and how long data is kept.",
                "body": """- **Require spoken consent** — the agent's first reply asks the caller whether it's okay that the call is recorded (if recording is on) and their details are used to follow up. The answer is saved on the call. If they decline, or leave before answering, the recording is discarded and the agent does not collect personal details.
- **Record calls** — store call audio alongside transcripts.
- **Data retention (days)** — transcripts and recordings older than this are deleted automatically each day. 0 keeps them indefinitely.""",
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
                "summary": "Credits per minute, by channel, voice tier and model.",
                "body": """Credits = call minutes × channel rate × voice multiplier × model multiplier.

- **Voice tiers** — Standard 1×, Premium 2×, Vistrow Expressive 2×.
- **Model tiers** — Standard 1×, Premium 2×, Premium Plus 4×.

**Billing** shows your remaining credits, minutes used this cycle, and usage split by call type and voice tier. Each call's details show the exact credits it used. If you enable low-credit emails in your preferences, you're emailed when credits drop below 10% of your allocation.""",
            },
            {
                "slug": "plans",
                "title": "Plans",
                "summary": "What Starter, Growth and Scale include.",
                "body": """- **Starter** — ₹2,999/month + GST: 300 credits, 1 AI agent, a knowledge base with approved answers.
- **Growth** — ₹5,999/month: 1,000 credits, 5 AI agents, inbound + outbound campaigns, CRM webhook integration, agent-assigned live catalog.
- **Scale** — ₹12,999/month: 2,500 credits, 20 AI agents, full API access.

Online payments and self-service plan changes aren't available yet — contact us to change plans or add credits.""",
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
                "summary": "Company name, phone-number country, and inviting teammates.",
                "body": """- **Workspace details** — the company name shown across the dashboard and the **Country** your phone numbers belong to (owners and admins).
- **Team & roles** — **Invite member** by email and give them a role: Owner, Admin, Member or Viewer.
- **Scheduling** — business hours, slot length, timezone and blackout dates for bookings.""",
            },
            {
                "slug": "notifications-and-privacy",
                "title": "Email notifications, security and your data",
                "summary": "Choose alert emails, secure sign-in, export or delete data.",
                "body": """## Preferences → Notifications (per person)
- **Qualified leads** — an email when your agents capture new leads, grouped every couple of minutes.
- **Delivery issues** — when a connected CRM or integration stops receiving your leads.
- **Low credits** — when credits drop below 10% of your allocation.

## Sign-in & security
Change your password and review account protection.

## Data & privacy
**Download my data** exports your workspace data as JSON (never passwords or API keys). **Request deletion** starts an account deletion, which our team verifies before processing.""",
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
