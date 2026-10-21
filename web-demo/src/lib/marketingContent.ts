// Single source of truth for the marketing site's navigation and page content.
// The header dropdowns, footer columns, product/solution detail pages, and the
// homepage previews all read from here - so adding a product or industry is one
// edit, never a grep across a dozen near-duplicate page files. Pricing lives in
// plans.ts (shared with the dashboard's Billing page); brand strings in brand.ts.

export interface NavLink {
  label: string
  to: string
  /** Optional one-line description shown in the mega-dropdown. */
  desc?: string
  /** Material Symbols icon name for dropdown/preview cards. */
  icon?: string
}

export interface NavGroup {
  label: string
  /** A bare link (Pricing) has `to`; a dropdown has `items`. */
  to?: string
  items?: NavLink[]
}

/** A titled icon+paragraph block, reused for feature rows and pain→outcome cards. */
export interface FeatureRow {
  icon: string
  title: string
  body: string
}

/** A single Q&A pair - rendered as an accordion and mirrored into FAQPage JSON-LD for AEO/GEO. */
export interface Faq {
  q: string
  a: string
}

// ---- Products (feed Product dropdown, /product overview, and detail pages) ----

export const PRODUCT_PAGES: NavLink[] = [
  {
    label: 'Voice Agents',
    to: '/product/agents',
    icon: 'smart_toy',
    desc: 'Build a no-code AI agent - persona, prompt, voice, language.',
  },
  {
    label: 'Inbound Calling',
    to: '/product/inbound',
    icon: 'call_received',
    desc: 'Answer every incoming call 24/7 and route or qualify instantly.',
  },
  {
    label: 'Outbound Campaigns',
    to: '/product/outbound',
    icon: 'campaign',
    desc: 'Run reminder, follow-up, and collection calls at scale.',
  },
  {
    label: 'Knowledge Base',
    to: '/product/knowledge-base',
    icon: 'menu_book',
    desc: 'Ground answers in your PDFs and docs with strict-mode RAG.',
  },
  {
    label: 'Website Call Widget',
    to: '/product/widget',
    icon: 'graphic_eq',
    desc: 'A one-tap browser call button for any website - no phone number.',
  },
  {
    label: 'Integrations',
    to: '/product/integrations',
    icon: 'hub',
    desc: 'Push every lead and transcript to your CRM over webhooks.',
  },
]

/** A deeper content section on a product page: titled cards, each optionally linking on. */
export interface GuideSection {
  eyebrow: string
  title: string
  intro?: string
  /** A short boxed note under the items, e.g. a limit or regulatory pointer. */
  note?: string
  items: Array<{ icon: string; title: string; body: string; to?: string; link?: string }>
}

/** Detail-page content per product, keyed by route.
 *
 * Every claim in `guideSections` and `faqs` must match the dashboard: check
 * server/help_articles.py and the dashboard page before adding or changing one.
 * No prices or credit figures here - those live on /pricing. */
export const PRODUCT_DETAIL: Record<
  string,
  { eyebrow: string; headline: string; subhead: string; features: FeatureRow[]; guideSections: GuideSection[]; faqs: Faq[] }
> = {
  '/product/agents': {
    eyebrow: 'Product · Voice Agents',
    headline: 'Build a voice agent in minutes.',
    subhead:
      'A no-code builder for real-time AI phone agents. Set the persona, prompt, voice and language - publish, and Artha starts taking calls.',
    features: [
      { icon: 'translate', title: 'Multilingual', body: 'Speaks 10 Indian languages plus English, including natural Hinglish, and switches mid-call with the caller.' },
      { icon: 'menu_book', title: 'Grounded answers', body: 'Ties responses to your knowledge base with strict-mode RAG, so the agent says it does not know instead of improvising.' },
      { icon: 'swap_calls', title: 'Human handoff', body: 'On phone calls, transfers to the colleague you set when a caller needs a person. Website calls take a callback request instead.' },
      { icon: 'analytics', title: 'Analytics & transcripts', body: 'Every call is transcribed, scored, and searchable across channels and agents.' },
    ],
    guideSections: [
      {
        eyebrow: 'How it works',
        title: 'From a blank page to a live agent.',
        intro: 'Every setting lives on the agent’s own page, and changes apply from the next call with no redeploy.',
        items: [
          { icon: 'edit_note', title: '1. Create the agent', body: 'Start from scratch, or describe your business and let the AI builder draft an agent that you review and edit before it is saved.', to: '/help/agents/create-and-edit-agent', link: 'Create and edit an agent' },
          { icon: 'tune', title: '2. Set voice, language and prompt', body: 'Pick the model, a voice you have added from the Voices page, the language the agent opens in, a welcome message and the system prompt that tells it how to behave.' },
          { icon: 'science', title: '3. Test it', body: 'Talk to the agent in the browser with its real configuration, or have it ring your phone. The Testing Lab plays situations such as an impatient caller or Hindi-English switching and checks the result.', to: '/help/testing-lab/run-a-test', link: 'Test an agent' },
          { icon: 'rocket_launch', title: '4. Put it where callers are', body: 'Attach a phone number for inbound calls, add the website widget, or use it in a campaign. Each agent card shows a readiness score and the next step to finish.', to: '/product/inbound', link: 'Inbound calling' },
        ],
      },
      {
        eyebrow: 'What you can configure',
        title: 'The controls behind each agent.',
        items: [
          { icon: 'record_voice_over', title: 'Voice and delivery', body: 'Choose who speaks first, voice delivery, emotion intensity, noise suppression and background ambience. Preview voices in Hindi or English before you add them.', to: '/help/voices/choose-voices', link: 'Choose voices' },
          { icon: 'extension', title: 'Functions', body: 'Booking appointments, callback requests, lead capture and “do not call me again” are always available. End call, web search and keypad tones can be switched on or off.', to: '/help/agents/agent-functions-and-transfer', link: 'Functions and transfer' },
          { icon: 'swap_calls', title: 'Transfer to a person', body: 'Set a transfer phone number and the agent can dial your colleague into a phone call and stay on until they answer. Web calls cannot be transferred to a phone.' },
          { icon: 'data_object', title: 'Variables and extraction', body: 'Define {{variable}} names with fallback values for prompts and greetings, and list the fields to pull from every transcript, such as budget or location.' },
          { icon: 'psychology', title: 'Memory', body: 'Turn on memory and the agent recognises returning callers by phone number, using a short summary of past calls.' },
          { icon: 'route', title: 'Webhook and CRM routing', body: 'Post one agent’s lead and appointment events to its own URL, or limit it to specific integrations instead of all of them.', to: '/help/agents/agent-webhook-crm-memory', link: 'Webhook and CRM routing' },
        ],
      },
      {
        eyebrow: 'Who it is for',
        title: 'One agent per job, not one agent for everything.',
        intro: 'Teams usually run several focused agents rather than one that tries to do it all.',
        items: [
          { icon: 'support_agent', title: 'A front-desk agent', body: 'Answers the business number, handles common questions and books appointments for clinics, coaching centres and service businesses.', to: '/solutions/healthcare', link: 'Healthcare' },
          { icon: 'apartment', title: 'A lead-qualification agent', body: 'Asks the questions your sales team would ask and saves each answer as a lead field, for example in property enquiries.', to: '/solutions/real-estate', link: 'Real estate' },
          { icon: 'translate', title: 'A regional-language agent', body: 'Opens in Hindi, Marathi, Tamil or another supported language and follows the caller if they switch.', to: '/languages', link: 'Supported languages' },
        ],
        note: 'Plans decide how many agents and minutes you get. The pricing page lists what each plan includes.',
      },
    ],
    faqs: [
      { q: 'Do I need to write code to build an agent?', a: 'No - the builder is entirely no-code. Set the persona, prompt, voice, and language, then publish.' },
      { q: 'Which voices can my agent use?', a: 'A curated set of Sarvam and ElevenLabs voices across Indian languages and English, previewable before you publish.' },
      { q: 'Can I test the agent before it goes live?', a: 'Yes - talk to any agent in the browser instantly, with the exact prompt and voice it will use on real calls. The Testing Lab also runs scenarios such as an angry caller, a silent caller or a booking conflict and shows checks like opening quality and tool accuracy.' },
      { q: 'What happens when I change the prompt?', a: 'Changes apply from the next call; there is nothing to redeploy. You can save a scenario as a custom regression test in the Testing Lab and re-run it after each prompt change.' },
      { q: 'Can the agent hand a call to a person?', a: 'Yes, on phone calls. Set a transfer number on the agent and it can dial that person into the call on request. Web calls cannot be transferred to a phone.' },
      { q: 'Can the agent remember a returning caller?', a: 'Yes, if you turn on Memory for that agent. It recognises the caller by phone number and uses a short summary of past calls.' },
    ],
  },
  '/product/inbound': {
    eyebrow: 'Product · Inbound Calling',
    headline: 'Answer every call, day or night.',
    subhead:
      'Point your number at Vistrow and Artha picks up every inbound call on the first ring - qualifying, answering, and routing without hold music.',
    features: [
      { icon: 'schedule', title: '24/7 pickup', body: 'No missed calls, no voicemail - every caller reaches a helpful agent instantly.' },
      { icon: 'fact_check', title: 'Auto-qualification', body: 'Captures intent, budget, and contact details as lead fields, ready for your team.' },
      { icon: 'route', title: 'Smart routing', body: 'Sends the right calls to the right team or agent based on what the caller needs.' },
      { icon: 'sync', title: 'Instant CRM sync', body: 'Pushes every qualified lead to your CRM the moment the call ends.' },
    ],
    guideSections: [
      {
        eyebrow: 'How it works',
        title: 'What happens on an inbound call to your number.',
        items: [
          { icon: 'dialpad', title: '1. Connect a number', body: 'Provision the number with your telephony provider (EnableX today), connect it under Phone Numbers in full international format, and run a test call.', to: '/help/phone-numbers/connect-a-number', link: 'Connect a phone number' },
          { icon: 'route', title: '2. Route it to an agent', body: 'On the Inbound page, pick the number and the agent and create the route. It is live immediately.', to: '/help/inbound/route-inbound-calls', link: 'Route incoming calls' },
          { icon: 'record_voice_over', title: '3. The agent takes the call', body: 'It opens with the welcome line you wrote for inbound calls, answers from your knowledge base, follows the caller if they change language, and can book an appointment or take a callback request.' },
          { icon: 'receipt_long', title: '4. You get the record', body: 'Each call has a transcript, the lead fields captured, CRM delivery status and, if recording is on, the audio. Earlier calls from the same number sit alongside.', to: '/help/calls/find-a-call', link: 'Find a call or transcript' },
        ],
      },
      {
        eyebrow: 'What you can configure',
        title: 'Hours, limits and what happens at the edges.',
        items: [
          { icon: 'schedule', title: 'Call window and days', body: 'Set a timezone, start and end dates, a daily window and active days, for example Monday to Saturday only. Leave the window blank to answer at any time.' },
          { icon: 'call_split', title: 'Concurrent-call limit', body: 'Choose how many calls a number takes at once. Calls outside the window or days, or beyond the limit, are not answered by the agent.' },
          { icon: 'swap_calls', title: 'Transfer to a person', body: 'With a transfer number set, the agent can dial a colleague into the call and stay on until they answer.', to: '/help/agents/agent-functions-and-transfer', link: 'Functions and transfer' },
          { icon: 'event_available', title: 'Bookings and callbacks', body: 'The agent offers slots inside the business hours and slot length you set under Settings, and takes a callback request when nothing fits.', to: '/help/appointments/manage-appointments', link: 'Bookings and availability' },
          { icon: 'verified_user', title: 'Consent and recording', body: 'Require spoken consent, switch call recording on or off, and set how many days transcripts and recordings are kept.', to: '/help/compliance/consent-recording-retention', link: 'Consent and retention' },
          { icon: 'psychology', title: 'Returning callers', body: 'Turn on memory and the agent greets repeat callers using a short summary of their earlier calls.' },
        ],
      },
      {
        eyebrow: 'Who it is for',
        title: 'Businesses where a missed call is a missed customer.',
        items: [
          { icon: 'health_and_safety', title: 'Clinics and appointment businesses', body: 'Booking requests, timing questions and callbacks handled outside reception hours.', to: '/solutions/healthcare', link: 'Healthcare' },
          { icon: 'apartment', title: 'Property and sales enquiries', body: 'Budget, location and timeline captured while the buyer is still on the line.', to: '/solutions/real-estate', link: 'Real estate' },
          { icon: 'support_agent', title: 'Support lines', body: 'Common questions answered first, with a clear route to a person for the rest.', to: '/solutions/support', link: 'Customer support' },
          { icon: 'dialpad', title: 'Teams replacing a press-1 menu', body: 'Callers say what they need instead of choosing a number.', to: '/ai-ivr', link: 'AI IVR' },
          { icon: 'call', title: 'Front desks and reception', body: 'Questions, bookings and messages handled at any hour, with a transfer when a person is needed.', to: '/ai-receptionist', link: 'AI receptionist' },
        ],
        note: 'Comparing options? See how Vistrow differs from telephony platforms such as Exotel and Knowlarity in the comparison pages, or read why an AI agent is not the same as an IVR.',
      },
    ],
    faqs: [
      { q: 'Do I need a new phone number?', a: 'Not necessarily. Numbers are connected through your telephony provider (EnableX today) and then routed to an agent on the Inbound page. The connect-a-number guide in the help centre lists the steps.' },
      { q: 'What happens if the agent can’t help a caller?', a: 'On phone calls it can transfer to a person if you have set a transfer number, or take a callback request - never a dead end or hold music.' },
      { q: 'Is every call recorded and transcribed?', a: 'Every call gets a transcript. Audio recording is a setting you can turn on or off under Compliance, along with spoken consent and how long data is kept.' },
      { q: 'Can I limit when the agent answers?', a: 'Yes. Set a call window, active days and a maximum number of concurrent calls per number. Calls outside those rules are not answered by the agent.' },
      { q: 'Which languages can it answer in?', a: 'Ten Indian languages plus English, including Hinglish, and it follows the caller if they switch mid-call. See the languages page for each one.' },
      { q: 'How is this different from an IVR?', a: 'An IVR asks the caller to press keys through a fixed menu. The agent understands what the caller says, answers from your knowledge base and completes the next step such as a booking.' },
    ],
  },
  '/product/outbound': {
    eyebrow: 'Product · Outbound Campaigns',
    headline: 'Reach every contact at scale.',
    subhead:
      'Launch reminder, follow-up, and collection campaigns that run consistent, polite, fully-logged calls to the contact lists you choose.',
    features: [
      { icon: 'groups', title: 'Bulk campaigns', body: 'Upload a contact list and let Artha work through it in batches you control.' },
      { icon: 'event_repeat', title: 'Reminders & follow-ups', body: 'Appointment reminders, renewals, and nudges that never slip through the cracks.' },
      { icon: 'volunteer_activism', title: 'Polite collections', body: 'Consistent, compliant reminder calls with every conversation recorded.' },
      { icon: 'monitoring', title: 'Live campaign metrics', body: 'Track pickup, completion, and outcome rates as the campaign runs.' },
    ],
    guideSections: [
      {
        eyebrow: 'How it works',
        title: 'From a contact list to a finished campaign.',
        intro: 'Outbound is the part of the platform we suggest approaching step by step: start with a small list, listen to the calls, and talk to us before scaling up.',
        items: [
          { icon: 'contacts', title: '1. Add contacts', body: 'Import a CSV, add contacts by hand, or paste one per line in international format. Numbers typed without a country code are read in your workspace’s country.', to: '/help/contacts/manage-contacts', link: 'Manage contacts' },
          { icon: 'campaign', title: '2. Set up the campaign', body: 'Pick the number, the agent and the audience, which can be a segment or a tag. Choose to launch on demand or schedule a start time.', to: '/help/outbound/run-a-campaign', link: 'Run an outbound campaign' },
          { icon: 'shield', title: '3. Compliance checks run first', body: 'Every dial is checked against your Do-Not-Call list and calling window before it goes out. Blocked contacts are counted, not called.', to: '/help/compliance/calling-rules', link: 'Calling window and Do-Not-Call' },
          { icon: 'monitoring', title: '4. Watch the outcomes', body: 'Progress shows per campaign: connected, calling, pending, no answer, failed and blocked. Every call has a transcript you can open.' },
        ],
      },
      {
        eyebrow: 'What you can configure',
        title: 'Pace, retries and personalisation.',
        items: [
          { icon: 'event_repeat', title: 'Retries', body: 'Set a maximum number of attempts and a gap between them, with separate rules for busy lines and voicemail if you want them.' },
          { icon: 'speed', title: 'Concurrency and pace', body: 'Choose how many calls run at once and an optional limit on attempts per minute. The channel limit on your telephony account is the real ceiling.' },
          { icon: 'schedule', title: 'Calling window', body: 'TRAI norms limit unsolicited calls to 9am to 9pm, Monday to Saturday. With the calling window enforced, dials outside your hours and days are blocked, using your account’s timezone.' },
          { icon: 'data_object', title: 'Variables', body: 'Use {{name}}-style variables in the welcome message and prompt so each call carries the contact’s own details.' },
          { icon: 'block', title: 'Do-Not-Call', body: 'Add numbers by hand or in bulk. When a caller asks not to be called again, the agent adds them itself.' },
          { icon: 'bolt', title: 'Instant lead follow-up', body: 'A private webhook queues a call within about 15 to 30 seconds of a new lead arriving, still subject to your compliance rules.', to: '/help/integrations/instant-lead-follow-up', link: 'How it works' },
        ],
      },
      {
        eyebrow: 'Use cases',
        title: 'Calls that are expected, not cold.',
        items: [
          { icon: 'event_repeat', title: 'Appointment and visit reminders', body: 'Confirm or reschedule bookings so fewer slots go unused.', to: '/solutions/healthcare', link: 'Healthcare' },
          { icon: 'account_balance', title: 'EMI and payment reminders', body: 'Polite, consistent reminders to customers who already owe a payment, with every call logged.', to: '/solutions/finance', link: 'Finance and collections' },
          { icon: 'apartment', title: 'Follow-up on property enquiries', body: 'Call back brochure downloads and missed site visits.', to: '/solutions/real-estate', link: 'Real estate' },
          { icon: 'phone_callback', title: 'Lead calls and callbacks', body: 'Qualify new enquiries and ring back people who asked for a later call, the routine part of a telecaller’s day.', to: '/ai-telecaller', link: 'AI telecaller' },
          { icon: 'call', title: 'Inbound and outbound on one agent', body: 'The agent that runs your campaigns can also answer your business number and website calls, with the same instructions and call records.', to: '/ai-calling-agent', link: 'AI calling agent' },
        ],
        note: 'Only call people you are permitted to call. Consent and regulatory obligations remain yours; Vistrow enforces the calling window and Do-Not-Call list you configure.',
      },
    ],
    faqs: [
      { q: 'How large a contact list can I run?', a: 'That depends on your plan and the telephony channels provisioned for your account. We recommend starting with a small list, reviewing the calls, and speaking to us before running a large one.' },
      { q: 'Can each call be personalized?', a: 'Yes - use {{variables}} like name or due date so every call sounds tailored, not scripted.' },
      { q: 'Can I schedule a campaign for later?', a: 'Yes - set a start time and the campaign launches automatically, with progress shown per campaign as it runs.' },
      { q: 'Does it respect Do-Not-Call and calling hours?', a: 'Yes. Every dial is checked against your Do-Not-Call list and, with the calling window enforced, your allowed hours and days before it goes out. Blocked contacts are counted, not called.' },
      { q: 'What happens when nobody answers?', a: 'The contact is retried according to the maximum attempts and gap you set, with separate rules available for busy lines and voicemail.' },
      { q: 'Can it call new leads as soon as they arrive?', a: 'Yes. Leads pushed from ArthaLeads, or from any source that can send a webhook, can queue a call within about 15 to 30 seconds. Your compliance rules still apply.' },
    ],
  },
  '/product/knowledge-base': {
    eyebrow: 'Product · Knowledge Base',
    headline: 'Answers grounded in your business.',
    subhead:
      'Upload your PDFs, manuals, and docs. Artha retrieves the right facts on every call and can be locked to strict mode so it only answers from your material.',
    features: [
      { icon: 'upload_file', title: 'Upload anything', body: 'PDFs, docs, or a website URL - we extract and index it into clean Q&A automatically.' },
      { icon: 'lock', title: 'Strict mode', body: 'Restrict the agent to only answer from your knowledge base - no hallucinations.' },
      { icon: 'search', title: 'Retrieval-grounded', body: 'Every answer is backed by a retrieved source, so responses stay accurate and on-brand.' },
      { icon: 'update', title: 'Always current', body: 'Update a document and the agent uses the new information on the very next call.' },
    ],
    guideSections: [
      {
        eyebrow: 'How it works',
        title: 'From a brochure to answers your agent can quote.',
        items: [
          { icon: 'upload_file', title: '1. Add a source', body: 'Upload a .txt, .md, .csv, .pdf or .docx file, paste text, or scan your website and choose which pages to import.', to: '/help/knowledge-base/add-knowledge', link: 'Give your agent your facts' },
          { icon: 'auto_awesome', title: '2. Extract question-and-answer pairs', body: 'Auto-extract turns the source into Q&A pairs. Review and edit each one, or add pairs by hand.' },
          { icon: 'link', title: '3. Attach it to an agent', body: 'Choose the knowledge base on the agent’s page, and the agent uses it from its next call.', to: '/product/agents', link: 'Voice agents' },
          { icon: 'record_voice_over', title: '4. The agent answers from it', body: 'Approved Q&A pairs are included first on every call. With strict mode, the agent quotes them instead of improvising.' },
        ],
      },
      {
        eyebrow: 'What you can configure',
        title: 'Control what the agent knows, and how far it can stray.',
        items: [
          { icon: 'lock', title: 'Strict mode', body: 'The agent quotes your approved answers and says it will check with the team when something is not covered, rather than guessing.' },
          { icon: 'rule', title: 'Editable wording', body: 'Edit any extracted pair so the agent says it the way you would, and add pairs by hand for the questions your callers ask most.' },
          { icon: 'inventory_2', title: 'Live catalog', body: 'For products, property listings, menus or plans, a structured catalog is looked up on demand, so a large list does not slow the call. Only agents you enable can use it.', to: '/help/knowledge-base/live-catalog', link: 'Live catalog' },
          { icon: 'speed', title: 'Usage meter', body: 'Only the first 8,000 characters reach the agent on a call. A bar under each knowledge base shows how much is used, so you can trim and prioritise.' },
        ],
        note: 'Strict mode reduces improvised answers but cannot guarantee a perfect one. Test the questions your callers really ask in the Testing Lab before you publish.',
      },
      {
        eyebrow: 'Who it is for',
        title: 'Anyone whose callers ask the same questions all day.',
        items: [
          { icon: 'apartment', title: 'Property teams', body: 'Project facts, configurations and possession details answered consistently, with the live catalog for listings.', to: '/solutions/real-estate', link: 'Real estate' },
          { icon: 'shopping_bag', title: 'E-commerce and retail', body: 'Return, delivery and policy questions answered the same way every time.', to: '/solutions/ecommerce', link: 'E-commerce' },
          { icon: 'health_and_safety', title: 'Clinics and services', body: 'Timings, fees and preparation instructions from your own material.', to: '/solutions/healthcare', link: 'Healthcare' },
        ],
      },
    ],
    faqs: [
      { q: 'What file types can I upload?', a: 'Text, Markdown, CSV, PDF and Word (.docx) files, or pasted text. You can also scan your website and pick the pages to import. Each source is extracted into Q&A pairs your agent can use.' },
      { q: 'What is strict mode?', a: 'It makes the agent quote your approved answers instead of improvising facts, and say it will check with the team when something is not covered.' },
      { q: 'How fast do updates take effect?', a: 'On the next call - update a document or Q&A pair and the agent uses the new answer without a redeploy.' },
      { q: 'Is there a limit to how much the agent can use on a call?', a: 'Yes. Only the first 8,000 characters reach the agent on a call, with approved Q&A pairs included first. For large product or listing lists, use the live catalog, which is looked up on demand.' },
      { q: 'Can I write answers myself instead of uploading a file?', a: 'Yes. Add Q&A pairs by hand, and edit any auto-extracted pair so the wording matches how you want the agent to speak.' },
      { q: 'Does it work in Indian languages?', a: 'The agent can answer in any supported language. Write answers in the language your callers use, or in English, and test the replies in the Testing Lab before going live.' },
    ],
  },
  '/product/widget': {
    eyebrow: 'Product · Website Call Widget',
    headline: 'A call button for any website.',
    subhead:
      'Drop a one-tap voice button on your site - visitors talk to Artha in the browser, no phone number and no app. Install with one line or the WordPress plugin.',
    features: [
      { icon: 'code', title: 'One-line embed', body: 'Paste a single script tag, or use our WordPress plugin - no coding required.' },
      { icon: 'mic', title: 'Browser calls', body: 'Real-time voice right in the page. Visitors just tap and talk.' },
      { icon: 'badge', title: 'Lead capture gate', body: 'Collects name and phone before the call so every conversation is a real lead.' },
      { icon: 'palette', title: 'On-brand', body: 'Position, label, and colours match your site - it feels native, not bolted on.' },
    ],
    guideSections: [
      {
        eyebrow: 'How it works',
        title: 'From the dashboard to a live button in four steps.',
        items: [
          { icon: 'add', title: '1. Add your website', body: 'Name the site, pick the agent, the corner of the screen, the button label and an optional greeting bubble. Each site gets its own key.', to: '/help/website-widget/add-widget', link: 'Add the call button' },
          { icon: 'code', title: '2. Install it', body: 'Copy the script tag onto your pages, or install the WordPress plugin and paste your site key.' },
          { icon: 'mic', title: '3. A visitor taps and talks', body: 'The call runs in the browser with the visitor’s microphone, so there is no phone number to dial and nothing to install.' },
          { icon: 'history', title: '4. Review the call', body: 'Filter the Calls page by site to read the transcript, see captured lead fields, and see which page the call started from.', to: '/help/calls/find-a-call', link: 'Find a call' },
        ],
      },
      {
        eyebrow: 'What you can configure',
        title: 'Make it behave the way your site does.',
        items: [
          { icon: 'forum', title: 'Voice, chat or both', body: 'Offer a voice call that visitors can also type into, let them choose between voice and chat, or run text chat only.' },
          { icon: 'badge', title: 'Ask before starting', body: 'For name, phone number and email, choose Don’t ask, Optional or Required. With all three off the call starts on a single tap.' },
          { icon: 'palette', title: 'Look and feel', body: 'Choose the animated orb or the Artha presenter as the button’s face, set the avatar colour, the corner and the label.' },
          { icon: 'route', title: 'Page rules', body: 'Send visitors on matching pages to a different agent, with its own greeting and avatar, for example a single listing page routed to an agent that knows only that listing.', to: '/help/website-widget/page-rules', link: 'Different agents on different pages' },
          { icon: 'key', title: 'Per-site keys', body: 'Every site has its own key and call history. Regenerate the key if one is ever exposed.' },
        ],
      },
      {
        eyebrow: 'Who it is for',
        title: 'Sites where a visitor has a question and no patience for a form.',
        items: [
          { icon: 'apartment', title: 'Property and project pages', body: 'A visitor on a project page asks about the project, and the lead lands with their details and the page they were on.', to: '/solutions/real-estate', link: 'Real estate' },
          { icon: 'shopping_bag', title: 'Online stores', body: 'Delivery and return questions answered at the moment a shopper hesitates.', to: '/solutions/ecommerce', link: 'E-commerce' },
          { icon: 'translate', title: 'Regional-language audiences', body: 'A visitor can speak in their own language without leaving the page.', to: '/languages/hindi', link: 'Hindi voice agent' },
        ],
        note: 'The call needs microphone permission from the visitor’s browser. Chat-only mode is there for visitors who prefer to type.',
      },
    ],
    faqs: [
      { q: 'Do visitors need to download anything?', a: 'No - it’s a real-time browser call. Visitors just tap the button and talk, nothing to install. The browser asks for microphone permission first.' },
      { q: 'How do I install it on WordPress?', a: 'Use our WordPress plugin - activate it, paste your site key, and the call button appears automatically.' },
      { q: 'Does it work on mobile browsers?', a: 'Yes - the widget is fully responsive and works on mobile and desktop browsers alike.' },
      { q: 'Can I show a different agent on different pages?', a: 'Yes. Page rules send visitors on matching pages to a different agent with its own greeting and avatar.' },
      { q: 'Can I ask visitors for their details first?', a: 'Yes. For name, phone number and email you choose Don’t ask, Optional or Required, so conversations can arrive as real leads.' },
      { q: 'Can I use it for text chat instead of voice?', a: 'Yes. The widget can be voice, text chat only, or let the visitor choose.' },
    ],
  },
  '/product/integrations': {
    eyebrow: 'Product · Integrations',
    headline: 'Every lead, in your stack.',
    subhead:
      'Vistrow pushes leads, transcripts, and outcomes to your CRM and tools over webhooks - so your team works where they already are.',
    features: [
      { icon: 'webhook', title: 'Webhooks', body: 'Fire a structured payload to any endpoint the moment a call completes.' },
      { icon: 'contacts', title: 'CRM sync', body: 'Create and update contacts and leads automatically in your CRM.' },
      { icon: 'notifications_active', title: 'Team alerts', body: 'Send a Slack alert to your team off the back of a call outcome.' },
      { icon: 'api', title: 'Full API', body: 'Programmatic access to agents, calls, and analytics for custom workflows.' },
    ],
    guideSections: [
      {
        eyebrow: 'How it works',
        title: 'From the end of a call to the tool your team already uses.',
        items: [
          { icon: 'extension', title: '1. Connect a tool', body: 'On the Integrations page, click Connect on a card. Connected integrations receive every qualified lead in real time.', to: '/help/integrations/connect-integrations', link: 'Send leads to your CRM' },
          { icon: 'call_end', title: '2. A call finishes', body: 'The agent has saved the lead fields it captured, and the transcript is ready.' },
          { icon: 'send', title: '3. The lead is delivered', body: 'Each connected integration gets the lead. A webhook receives it as JSON, so Zapier, n8n or Make can take it from there.' },
          { icon: 'verified', title: '4. Check it arrived', body: 'Each card shows its status, last sync and any error. Use Send test where offered, and re-send a delivery from the call’s details.' },
        ],
      },
      {
        eyebrow: 'What you can connect',
        title: 'The destinations available today.',
        items: [
          { icon: 'contacts', title: 'Zoho CRM and ArthaLeads', body: 'Leads go straight into your CRM.' },
          { icon: 'webhook', title: 'CRM or webhook', body: 'Every lead is posted as JSON to any URL, which covers CRMs and automation tools that accept a webhook.' },
          { icon: 'table_chart', title: 'Google Sheets', body: 'Keep a lead sheet your team can open without logging in to a CRM.' },
          { icon: 'chat', title: 'Slack alerts', body: 'Alerts for your team the moment a qualified lead comes in.' },
          { icon: 'ads_click', title: 'Instant lead follow-up', body: 'New leads pushed from ArthaLeads or a webhook are queued for a call within seconds.', to: '/help/integrations/instant-lead-follow-up', link: 'Instant lead follow-up' },
          { icon: 'route', title: 'Per-agent routing', body: 'By default an agent delivers to every connected integration. Limit one agent to specific ones, or give it its own webhook URL.', to: '/help/agents/agent-webhook-crm-memory', link: 'Webhook and CRM routing' },
        ],
      },
      {
        eyebrow: 'Who it is for',
        title: 'Teams that already know where leads should land.',
        items: [
          { icon: 'apartment', title: 'Sales teams', body: 'Budget, location, timeline and transcript arrive in the CRM before the advisor picks up the phone.', to: '/solutions/real-estate', link: 'Real estate' },
          { icon: 'support_agent', title: 'Support teams', body: 'Post call outcomes into the tools that already track tickets and follow-ups.', to: '/solutions/support', link: 'Customer support' },
          { icon: 'hub', title: 'Everyone else', body: 'Use the integrations directory for the full list and how each one is set up.', to: '/integrations', link: 'All integrations' },
        ],
        note: 'If deliveries start failing, the dashboard flags it and, if enabled in your preferences, you get an email. The security page explains how call data is handled.',
      },
    ],
    faqs: [
      { q: 'Which CRMs can I connect?', a: 'Zoho CRM and ArthaLeads have their own integrations. Any other CRM or tool that accepts a webhook, or works through Zapier, n8n or Make, can receive every lead as JSON.' },
      { q: 'Is there a public API?', a: 'Yes - a full API for agents, calls, and analytics, so you can build custom workflows on top of Vistrow.' },
      { q: 'How fast does a lead reach my CRM?', a: 'In real time - when a qualified call ends, its data is sent to every connected integration. Each integration card shows its last sync and any error.' },
      { q: 'What if a delivery fails?', a: 'The dashboard flags it, and if enabled in your preferences you also get an email. You can re-send a delivery from the call’s details once the destination is fixed.' },
      { q: 'Can different agents send leads to different places?', a: 'Yes. Under CRM routing, limit an agent to specific integrations, or give it its own webhook URL for its lead, appointment and callback events.' },
      { q: 'Can a lead from my ads trigger a call?', a: 'Yes. A lead pushed from ArthaLeads, or from any source that can post to the Instant Lead Follow-up URL, queues a call within about 15 to 30 seconds, subject to your calling window and Do-Not-Call rules.' },
    ],
  },
}

// ---- Solutions (feed Solutions dropdown, /solutions overview, detail pages) ----

export interface Solution extends NavLink {
  headline: string
  subhead: string
  pains: FeatureRow[]
  features: string[]
  faqs: Faq[]
  /** Published public_demo_slug of the roleplay agent for this industry
   * (server/calls_db.py's agent_id_for_public_demo_slug). When set, the
   * page offers a real call where Artha answers AS demoBusiness instead of
   * showing a scripted sample conversation. Only set it once that agent
   * actually exists and is live - an unknown slug is a 404 from /token. */
  demoSlug?: string
  /** Fictional business the demo agent answers as. Shown on the page so a
   * visitor is never misled into thinking it is a real company. */
  demoBusiness?: string
  /** Badge on the demo card — says what the visitor is about to phone
   * ("Clinic demo"), not a generic "Live demo". */
  demoBadge?: string
  /** Short, industry-specific suggestions below the live card. */
  demoPrompt?: string
  /** Hue rotation tinting the demo orb for this industry, so each page's
   * demo looks like its own thing. See index.css's --demo-accent-hue. */
  demoAccentHue?: string
  scenarios: Array<{
    label: string
    callerLine: string
    agentAction: string
    outcome: string
  }>
  workflow: FeatureRow[]
  resultTitle: string
  resultFields: Array<{ label: string; value: string }>
  integrations: FeatureRow[]
  guardrails: string[]
  /** Deeper sections for industry pages that answer a specific search cluster
   * (finance: collections/EMI reminders; real estate: qualification and site
   * visits). Every claim must be a dashboard capability - check the help
   * articles and the code before adding one. */
  guideSections?: Array<{
    eyebrow: string
    title: string
    intro?: string
    /** A short boxed note under the items, e.g. a regulatory pointer. */
    note?: string
    items: Array<{ icon: string; title: string; body: string; to?: string; link?: string }>
  }>
  /** A written sample exchange, labelled on the page as not a recording. */
  sampleExchange?: {
    context: string
    langCode: string
    langLabel: string
    turns: { speaker: 'Caller' | 'Agent'; native: string; gloss: string }[]
    outcome: string
  }
}

export const SOLUTIONS: Solution[] = [
  {
    demoSlug: 'real-estate',
    demoBusiness: 'Aarohan Homes',
    demoBadge: 'Property demo',
    demoPrompt: 'Ask about the Baner project, share a budget, or book a site visit.',
    // Purple (271°) -> warm property gold (40°).
    demoAccentHue: '129deg',
    label: 'Real Estate',
    to: '/solutions/real-estate',
    icon: 'apartment',
    desc: 'Qualify buyers and book site visits - 24/7, in Hindi, English and 9 more Indian languages.',
    headline: 'AI calling agent for real estate enquiries and site visits.',
    subhead:
      'Artha answers property enquiries and calls new leads back within seconds, in Hindi, English or 9 other Indian languages. It qualifies budget, location, configuration, timeline and purpose, and books site visits on your calendar, day or night.',
    pains: [
      { icon: 'phone_missed', title: 'Missed calls', body: 'After-hours enquiries go to voicemail and buyers move on. Artha picks up at any hour, within the call limits you set.' },
      { icon: 'fact_check', title: 'Manual qualification', body: 'No more re-asking budget and location - Artha saves each detail as a lead field during the call.' },
      { icon: 'schedule', title: 'Slow follow-up', body: 'Every qualified lead syncs to your CRM instantly, so agents follow up while it’s hot.' },
    ],
    features: ['Budget, location & configuration qualification', 'Site visits booked on your calendar', 'Call-back to new leads within seconds', 'CRM, Slack & webhook delivery', '24/7 multilingual pickup'],
    scenarios: [
      { label: 'New buyer enquiry', callerLine: '“Baner में two BHK चाहिए, budget करीब one crore है.”', agentAction: 'Captures configuration, budget, preferred location and purchase timeline without turning the call into a form.', outcome: 'Qualified buyer lead, ready for the right sales advisor.' },
      { label: 'Project comparison', callerLine: '“Aarohan Crest और आस-पास के options में क्या फर्क है?”', agentAction: 'Answers only from approved project knowledge and records the exact comparison the buyer wants.', outcome: 'A focused follow-up request with no invented inventory or pricing.' },
      { label: 'Book a site visit', callerLine: '“Saturday afternoon site visit हो सकती है क्या?”', agentAction: 'Checks the live calendar, offers a few real times, collects contact details and confirms only after the booking succeeds.', outcome: 'Confirmed site visit with date, time and buyer context.' },
    ],
    workflow: [
      { icon: 'record_voice_over', title: 'Understand intent', body: 'New purchase, investment, project question or site-visit request.' },
      { icon: 'filter_alt', title: 'Qualify naturally', body: 'Budget, configuration, location and timeline are gathered across the conversation.' },
      { icon: 'menu_book', title: 'Answer from project facts', body: 'Prices, approvals and availability stay grounded in the knowledge you approve.' },
      { icon: 'event_available', title: 'Complete the next step', body: 'Book a real site visit or route the lead to the right advisor with full context.' },
    ],
    resultTitle: 'Qualified property enquiry',
    resultFields: [
      { label: 'Requirement', value: '2 BHK · Baner' },
      { label: 'Budget', value: 'Around ₹1 crore' },
      { label: 'Timeline', value: 'Within 3 months' },
      { label: 'Outcome', value: 'Site visit requested' },
    ],
    integrations: [
      { icon: 'hub', title: 'CRM lead routing', body: 'Send budget, location, timeline and transcript to your CRM immediately.' },
      { icon: 'calendar_month', title: 'Site-visit calendar', body: 'Offer only genuinely open appointments and prevent double booking.' },
      { icon: 'forum', title: 'Team follow-up alert', body: 'Alert your sales team in Slack or your CRM so they send the brochure or visit confirmation after the call.' },
    ],
    guardrails: ['Never invent project inventory, price, possession date or approval status.', 'Never call an enquiry qualified until the buyer has shared meaningful intent.', 'Never claim a site visit is confirmed until the calendar booking succeeds.'],
    faqs: [
      { q: 'What does an AI calling agent for real estate actually do?', a: 'It answers your enquiry line and calls new leads back, asks the qualifying questions your sales team would ask - budget, preferred location, configuration, timeline and purpose - answers project questions from your approved material, and books a site visit or passes the lead on with the full transcript.' },
      { q: 'Can it book site visits automatically?', a: 'Yes. It offers free slots from the built-in calendar, inside the business hours and slot length you set, and confirms a visit only after the booking succeeds. If nothing suits the buyer, it takes a callback request instead. Your team can reschedule a visit or mark it completed or no-show.' },
      { q: 'How does it qualify property buyer enquiries?', a: 'Through the conversation, not a form. As the buyer mentions budget, preferred areas, property type, configuration, timeline and whether it is for investment or self-use, the agent saves each detail as a lead field. If a buyer names two areas, both are kept.' },
      { q: 'Can it call new leads straight away?', a: 'Yes. Leads pushed from ArthaLeads, or from any source that can send a webhook, are queued for a call within about 15-30 seconds. Your calling window and Do-Not-Call list still apply.' },
      { q: 'Does it handle Hindi, Marathi, Kannada and other regional callers?', a: 'Yes. Hindi (including everyday Hinglish), Marathi, Gujarati, Kannada, Telugu, Tamil and the other supported Indian languages, plus English. It switches mid-call when the buyer does.' },
      { q: 'Will it make up prices or availability?', a: 'It is set up not to. Answers come from your knowledge base, or from a live catalog of listings that the agent looks up when a buyer asks. With strict mode on, it quotes your approved answers and says it will check with the team when something is not covered.' },
    ],
    guideSections: [
      {
        eyebrow: 'Qualifying buyer enquiries',
        title: 'What the agent asks, and what it saves.',
        intro: 'The agent gathers these across a normal conversation, in whatever order the buyer brings them up, and saves each one as a lead field on the call, ready for your CRM.',
        items: [
          { icon: 'payments', title: 'Budget', body: 'A range or a ceiling, in lakh or crore, as the buyer says it. A correction later in the call replaces the earlier figure.' },
          { icon: 'location_city', title: 'Location', body: 'Preferred areas or projects. If the buyer names two, “Baner or Kharadi”, both are kept.' },
          { icon: 'apartment', title: 'Property type and configuration', body: 'Flat, villa or plot; 2BHK, 3BHK or a plot size.' },
          { icon: 'timer', title: 'Timeline', body: 'When the buyer plans to buy or move, so your team knows who to call first.' },
          { icon: 'flag', title: 'Purpose', body: 'Self-use or investment, which usually changes which projects your advisor suggests.' },
          { icon: 'person', title: 'Name and phone', body: 'Confirmed on the call, so the lead reaches your team with a number that works.' },
        ],
      },
      {
        eyebrow: 'Site visits',
        title: 'Site visits booked on your own calendar.',
        intro: 'Booking uses the appointments calendar built into Vistrow Voice, so no outside calendar has to be connected first.',
        items: [
          { icon: 'event_available', title: 'Only real free slots', body: 'The agent offers slots inside the business hours, slot length (15 to 60 minutes), timezone and blackout dates you set, and confirms only once the booking succeeds.' },
          { icon: 'phone_callback', title: 'A callback when nothing fits', body: 'If no slot suits the buyer, it takes a callback request with their preferred date and time instead of ending the call empty-handed.' },
          { icon: 'calendar_month', title: 'Your team stays in charge', body: 'Visits appear in Appointments, in calendar or list view, where your team can reschedule them or mark them confirmed, completed, cancelled or no-show.', to: '/help/appointments/manage-appointments', link: 'Bookings and availability' },
        ],
      },
      {
        eyebrow: 'Follow-up',
        title: 'Call new leads while they still remember enquiring.',
        items: [
          { icon: 'bolt', title: 'Instant call-back', body: 'Push leads from ArthaLeads, or send them from any source by webhook, and a call is queued within about 15-30 seconds of the lead arriving.', to: '/help/integrations/instant-lead-follow-up', link: 'How instant lead follow-up works' },
          { icon: 'campaign', title: 'Follow-up campaigns', body: 'Re-call older enquiries, brochure downloads or missed visits as an outbound campaign, with retries, a calling window and Do-Not-Call checks before every dial.', to: '/product/outbound', link: 'Outbound campaigns' },
          { icon: 'hub', title: 'Leads where your team works', body: 'Qualified leads go to ArthaLeads, Zoho CRM, Google Sheets, Slack or any webhook, with the transcript and the fields captured on the call.', to: '/product/integrations', link: 'CRM and webhook integrations' },
        ],
      },
      {
        eyebrow: 'More markets',
        title: 'Property calls in more Indian languages.',
        intro: 'The local pages above cover Hindi, Marathi, Kannada, Telugu and Gujarati markets. The same agent also takes property calls in these languages:',
        items: [
          { icon: 'translate', title: 'Chennai and Tamil Nadu', body: 'Tamil and Tanglish enquiries about projects on OMR or in Porur and Tambaram.', to: '/languages/tamil', link: 'Tamil AI voice calling agent' },
          { icon: 'translate', title: 'Mohali, Zirakpur and Ludhiana', body: 'Punjabi enquiries that slip into Hindi or English halfway through.', to: '/languages/punjabi', link: 'Punjabi AI voice calling agent' },
          { icon: 'translate', title: 'Every supported language', body: 'Bengali, Malayalam and Odia too, plus English, with the agent switching when the buyer does.', to: '/languages', link: 'All languages' },
        ],
      },
    ],
    sampleExchange: {
      context: 'A call-back to a new website enquiry',
      langCode: 'hi-IN',
      langLabel: 'Hindi and Hinglish',
      turns: [
        { speaker: 'Agent', native: 'नमस्ते अमित जी, मैं Aarohan Homes से Artha बोल रही हूँ। आपने अभी Baner project के लिए enquiry की थी, दो मिनट बात कर सकते हैं?', gloss: 'Hello Amit ji, this is Artha from Aarohan Homes. You just made an enquiry about the Baner project; can we talk for two minutes?' },
        { speaker: 'Caller', native: 'हाँ, बताइए। 2BHK चाहिए, budget around 1 crore है।', gloss: 'Yes, go ahead. I want a 2BHK; the budget is around 1 crore.' },
        { speaker: 'Agent', native: 'ठीक है। आप खुद रहने के लिए देख रहे हैं या investment के लिए? और कब तक लेने का plan है?', gloss: 'Okay. Are you looking to live in it or as an investment? And when do you plan to buy?' },
        { speaker: 'Caller', native: 'खुद के लिए, तीन-चार महीने में। Sunday को site visit हो सकती है?', gloss: 'For myself, in three or four months. Can I do a site visit on Sunday?' },
        { speaker: 'Agent', native: 'हाँ, Sunday सुबह 11 बजे का slot खाली है। book कर दूँ?', gloss: 'Yes, Sunday 11 a.m. is free. Shall I book it?' },
      ],
      outcome: 'Aarohan Homes is the made-up demo business. Budget, configuration, location, purpose and timeline are saved as lead fields, and the visit appears in Appointments only once the booking succeeds.',
    },
  },
  {
    demoSlug: 'healthcare',
    demoBusiness: 'Sunrise Care Clinic',
    demoBadge: 'Clinic demo',
    demoPrompt: 'Ask about clinic timings, a doctor, or book an appointment.',
    // Purple (hue 271°) -> teal (hue 170°), the colour healthcare UI
    // conventionally uses. Computed, not eyeballed - an earlier guess of
    // 135deg actually lands on hue 46 (amber), confirmed live: the orb
    // tinted amber, not teal. rotation = target_hue - source_hue.
    demoAccentHue: '-101deg',
    label: 'Healthcare & Clinics',
    to: '/solutions/healthcare',
    icon: 'health_and_safety',
    desc: 'Book appointments and answer patient FAQs without hold music.',
    headline: 'A front desk that never sleeps.',
    subhead:
      'Artha books appointments, answers common patient questions, and triages calls - freeing your staff for in-person care.',
    pains: [
      { icon: 'phone_missed', title: 'Overloaded reception', body: 'Staff can’t answer every call during clinic hours. Artha handles the overflow.' },
      { icon: 'event', title: 'No-shows', body: 'Automated reminder calls cut no-shows and keep the schedule full.' },
      { icon: 'quiz', title: 'Repetitive FAQs', body: 'Timings, location, prep instructions - answered instantly, grounded in your info.' },
    ],
    features: ['Appointment booking', 'Reminder calls', 'FAQ answering', 'Call triage'],
    scenarios: [
      { label: 'Patient with symptoms', callerLine: '“पेट में बहुत दर्द है, किस डॉक्टर को दिखाऊँ?”', agentAction: 'Acknowledges the concern, checks whether it sounds urgent and routes to the relevant clinic service without diagnosing.', outcome: 'Appropriate next step with safety kept ahead of scheduling.' },
      { label: 'Find a doctor', callerLine: '“General physician कब available हैं?”', agentAction: 'Uses verified clinic information, asks for the preferred day and checks live availability instead of reading a directory.', outcome: 'Two or three relevant appointment choices.' },
      { label: 'Book or reschedule', callerLine: '“कल दो बजे का appointment कर दीजिए.”', agentAction: 'Collects patient name, phone and visit reason, verifies the exact slot and confirms only after it is saved.', outcome: 'A traceable appointment instead of a verbal promise.' },
    ],
    workflow: [
      { icon: 'hearing', title: 'Listen to the concern', body: 'Capture the reason for calling before suggesting a doctor or appointment.' },
      { icon: 'health_and_safety', title: 'Check urgency safely', body: 'Recognize possible warning signs and direct urgent cases to immediate human care.' },
      { icon: 'stethoscope', title: 'Route to relevant care', body: 'Use verified clinic services and avoid diagnosis or unrelated specialties.' },
      { icon: 'event_available', title: 'Confirm the appointment', body: 'Check live slots, collect patient details and save a real booking.' },
    ],
    resultTitle: 'Clinic call summary',
    resultFields: [
      { label: 'Reason', value: 'Abdominal pain' },
      { label: 'Routing', value: 'General physician' },
      { label: 'Urgency', value: 'Routine · no warning signs stated' },
      { label: 'Outcome', value: 'Appointment requested' },
    ],
    integrations: [
      { icon: 'calendar_month', title: 'Clinic calendar', body: 'Check live appointment availability and stop double bookings.' },
      { icon: 'notifications_active', title: 'Reminder calls', body: 'Call patients before scheduled visits and capture confirmations.' },
      { icon: 'badge', title: 'Clinic CRM', body: 'Send patient-provided contact and visit context to the clinic team.' },
    ],
    guardrails: ['Artha does not diagnose, prescribe medication or promise a clinical outcome.', 'Possible emergencies are directed to immediate local emergency or human care.', 'A booking needs a real patient name, phone number, visit reason and successful calendar response.'],
    guideSections: [
      {
        eyebrow: 'The front-desk calls it takes',
        title: 'Enquiries, bookings and callbacks, in the caller’s language.',
        intro: 'This is administrative front-desk work only. The agent never gives medical advice, and the clinic team stays in charge of everything clinical.',
        items: [
          { icon: 'quiz', title: 'Clinic information', body: 'Timings, location, doctors, services and how to prepare for a visit, answered from the knowledge base you upload. With strict mode on, it quotes your approved answers and says it will check with the team when something is not covered.', to: '/product/knowledge-base', link: 'Knowledge base' },
          { icon: 'event_available', title: 'Appointment requests', body: 'It collects the patient’s name, phone number and reason for the visit, offers free slots inside your business hours, and confirms only once the booking has saved. Bookings appear in Appointments, where staff can reschedule them or mark them confirmed, completed, cancelled or no-show.', to: '/help/appointments/manage-appointments', link: 'Bookings and availability' },
          { icon: 'phone_callback', title: 'Callbacks when no slot fits', body: 'If nothing suits the caller, it records a callback request with their preferred day and time, so the call does not end without a next step.' },
          { icon: 'swap_calls', title: 'A person when it matters', body: 'Set a transfer phone number and the agent can dial a colleague into the call and stay on until they answer. Worrying symptoms are directed to immediate human or emergency care, not handled by the agent.', to: '/help/agents/agent-functions-and-transfer', link: 'Functions and transfer' },
          { icon: 'translate', title: 'Hindi, regional languages and English', body: 'Callers can speak Hindi, Marathi, Tamil, Kannada, Telugu and the other supported Indian languages, plus English, and the agent follows when they switch mid-call.', to: '/languages', link: 'Supported languages' },
          { icon: 'history', title: 'Returning patients', body: 'Turn on Memory and the agent keeps a short summary of earlier calls from the same number, so a returning caller is greeted accordingly.' },
        ],
      },
      {
        eyebrow: 'Reminders and follow-ups',
        title: 'Reminder calls run as an outbound campaign.',
        intro: 'There is no automatic reminder attached to every booking. You choose who to call and when, and the campaign does the dialling.',
        items: [
          { icon: 'campaign', title: '1. Choose the contacts', body: 'Import a CSV or add contacts by hand, then pick them or a segment when you create a campaign under Outbound.', to: '/help/outbound/run-a-campaign', link: 'Run a campaign' },
          { icon: 'edit_note', title: '2. Personalise the call', body: 'Use {{variables}} such as the patient’s name or the appointment date in the agent’s prompt and greeting, with fallback values for blanks.' },
          { icon: 'rule', title: '3. Calling rules apply', body: 'Every dial is checked against your Do-Not-Call list and calling window first. Blocked contacts are counted, not called.', to: '/help/compliance/calling-rules', link: 'Calling window and Do-Not-Call' },
          { icon: 'task_alt', title: '4. Staff update the record', body: 'Read the outcome in the call details, then reschedule or cancel in Appointments. The agent can also take a callback request if the patient asks to move the visit.' },
        ],
      },
      {
        eyebrow: 'What you configure',
        title: 'Your hours, your information, your rules.',
        items: [
          { icon: 'schedule', title: 'Bookable hours', body: 'Business hours per day, slot length from 15 to 60 minutes, timezone and blackout dates, set under Settings, Scheduling.' },
          { icon: 'menu_book', title: 'Clinic knowledge', body: 'Upload the fee sheet, doctor list or visit instructions, review the extracted question and answer pairs, then attach the knowledge base to the agent.', to: '/help/knowledge-base/add-knowledge', link: 'Give your agent your facts' },
          { icon: 'fact_check', title: 'Post-call details', body: 'Pick the fields pulled from every transcript, such as the visit reason, and send each call to your team through a webhook, Slack, Google Sheets or your CRM.', to: '/integrations', link: 'Integrations' },
          { icon: 'record_voice_over', title: 'Consent, recording and retention', body: 'Switch on spoken consent so the agent asks before details are collected, choose whether calls are recorded, and set how long records are kept.', to: '/help/compliance/consent-recording-retention', link: 'Consent, recording and retention' },
        ],
        note: 'Whether and how to record patient calls, and what patients are told, is the clinic’s responsibility; Vistrow Voice provides the controls above. The security page lists what is in place today and what is not, and we make no medical-compliance or certification claims.',
      },
    ],
    faqs: [
      { q: 'Can it send appointment reminder calls?', a: 'Yes, as an outbound campaign. Pick the patients to call, personalise the greeting with their name or appointment date, and the agent dials within your calling window and Do-Not-Call rules. Reminders are not attached to every booking automatically.' },
      { q: 'Is patient information kept confidential?', a: 'Yes - call data is tenant-isolated to your clinic account and only accessible to your team.' },
      { q: 'Can one agent handle multiple clinic locations?', a: 'Yes - build a separate agent per location, or one agent that routes based on what the caller needs.' },
      { q: 'Does it give medical advice?', a: 'No. It answers administrative questions from the information you provide, does not diagnose or suggest treatment, and directs possible emergencies to immediate human or emergency care.' },
      { q: 'Does it work with our existing appointment software?', a: 'Agents book into the Appointments calendar built into Vistrow Voice. To pass bookings to another system, send the appointment-booked event to a webhook, Slack, Google Sheets or your CRM. There is no connector for a specific hospital system.' },
      { q: 'Can it answer in Hindi and regional languages?', a: 'Yes. Hindi, including everyday Hinglish, Marathi, Gujarati, Kannada, Telugu, Tamil and the other supported Indian languages, plus English.' },
      { q: 'Are calls recorded?', a: 'Recording and spoken consent are settings on the Compliance page, so you decide. With consent required, the agent asks first and discards the recording if the caller declines. Your clinic decides what it records and tells patients.' },
      { q: 'Can I try it before going live?', a: 'Yes. Call the clinic demo above to hear a made-up clinic answered live, then use the Testing Lab on your own agent to run scenarios before any real patient calls.' },
    ],
  },
  {
    demoSlug: 'ecommerce',
    demoBusiness: 'Nivara Living',
    demoBadge: 'Store support demo',
    demoPrompt: 'Try sample order NV-1042, ask about a return, or describe a delivery issue.',
    // Purple (271°) -> energetic commerce pink (330°).
    demoAccentHue: '59deg',
    label: 'E-commerce & D2C',
    to: '/solutions/ecommerce',
    icon: 'shopping_bag',
    desc: 'Handle order status, returns, and WISMO calls automatically.',
    headline: 'Support that scales with every sale.',
    subhead:
      'Artha handles “where is my order”, returns, and product questions instantly - in the language your customer shops in.',
    pains: [
      { icon: 'local_shipping', title: 'WISMO overload', body: '“Where is my order” calls flood support. Connect your order system and Artha reads back the current status.' },
      { icon: 'assignment_return', title: 'Returns friction', body: 'Explains your approved returns and exchange policy and records the request, so your team only handles the approval.' },
      { icon: 'language', title: 'Language barriers', body: 'Speaks the customer’s language, so support feels local everywhere you sell.' },
    ],
    features: ['Order status', 'Returns & exchanges', 'Product Q&A', 'Multilingual support'],
    scenarios: [
      { label: 'Track an order', callerLine: '“Order NV-1042 अभी कहाँ है?”', agentAction: 'Looks up the supplied sample order, states the latest verified status and avoids guessing a delivery promise.', outcome: 'Clear order status with the next useful action.' },
      { label: 'Damaged delivery', callerLine: '“Package खुला था और product damaged है.”', agentAction: 'Acknowledges the inconvenience, collects the order reference and explains the applicable replacement path first.', outcome: 'Structured damage case ready for resolution.' },
      { label: 'Return or exchange', callerLine: '“Size गलत है, return कैसे होगा?”', agentAction: 'Checks the store’s approved policy, confirms eligibility and records the requested resolution.', outcome: 'Return or exchange intent captured without policy improvisation.' },
    ],
    workflow: [
      { icon: 'receipt_long', title: 'Identify the order', body: 'Capture the order reference and understand status, damage, return or product intent.' },
      { icon: 'inventory_2', title: 'Retrieve verified details', body: 'Use connected order data and approved policy rather than guessing.' },
      { icon: 'support_agent', title: 'Resolve or escalate', body: 'Give the next action, or hand a complex case to a person with context attached.' },
      { icon: 'sync_alt', title: 'Update the workflow', body: 'Send the outcome to the helpdesk, CRM or follow-up channel.' },
    ],
    resultTitle: 'Order-support outcome',
    resultFields: [
      { label: 'Order', value: 'NV-1042' },
      { label: 'Issue', value: 'Damaged on delivery' },
      { label: 'Customer wants', value: 'Replacement' },
      { label: 'Outcome', value: 'Human review requested' },
    ],
    integrations: [
      { icon: 'inventory', title: 'Order system', body: 'Ground status answers in the customer’s actual order record.' },
      { icon: 'confirmation_number', title: 'Helpdesk tickets', body: 'Open or update a case with the transcript and requested outcome.' },
      { icon: 'forum', title: 'Customer follow-up', body: 'Post the outcome by webhook to the system that sends your return instructions or resolution updates.' },
    ],
    guardrails: ['Never invent an order status, delivery date, refund or replacement approval.', 'Give the next useful action before quoting long policy text.', 'Escalate exceptions with the customer’s context so they do not repeat everything.'],
    guideSections: [
      {
        eyebrow: 'Connect it to your store',
        title: 'What the agent needs to answer store calls well.',
        intro: 'A store support agent is only as good as the information behind it. These are the pieces most D2C teams set up, roughly in this order.',
        items: [
          { icon: 'menu_book', title: 'Policies in the knowledge base', body: 'Upload the returns, exchange, shipping and cancellation policy, review the question and answer pairs it extracts, and switch on strict mode so the agent quotes your policy instead of paraphrasing it.', to: '/product/knowledge-base', link: 'Knowledge base' },
          { icon: 'inventory_2', title: 'Products in the live catalog', body: 'Sizes, materials, care instructions and availability go in the live catalog. The agent looks an item up when a customer asks, so a large range does not slow the call down.', to: '/help/knowledge-base/live-catalog', link: 'Live catalog guide' },
          { icon: 'api', title: 'Order status through a custom function', body: 'A custom function calls your order system with the order number the customer gives and reads back what it returns. Test it with sample orders before real customers call.', to: '/help/agents/agent-functions-and-transfer', link: 'Functions and transfer' },
          { icon: 'confirmation_number', title: 'Cases to your helpdesk', body: 'Damaged-delivery and return requests are posted as JSON to any helpdesk or automation tool that accepts a webhook, with the transcript and the outcome the customer asked for.', to: '/integrations', link: 'All integrations' },
          { icon: 'graphic_eq', title: 'A voice button on product pages', body: 'Put the website widget on product or order-tracking pages so a shopper can ask a question out loud without leaving the page. Page rules can send each page to a different agent.', to: '/product/widget', link: 'Website call widget' },
          { icon: 'translate', title: 'The language your customer shops in', body: 'The same agent answers in Hindi, English and 9 more Indian languages and follows a customer who switches mid-call, which matters when you sell across several states.', to: '/languages', link: 'Supported languages' },
        ],
        note: 'Refunds, replacements and exceptions should stay with your team. The agent collects the facts and the customer’s request so nobody has to ask twice.',
      },
    ],
    faqs: [
      { q: 'Can it check real order status?', a: 'Yes, once you connect it. A custom function lets the agent call your order system during the conversation and read back the current status. Without that connection it takes the order number and passes the request to your team instead of guessing.' },
      { q: 'Can it handle returns without a human agent?', a: 'It handles the conversation: it explains your approved returns and exchange policy, checks the details the policy asks for and records the request with the transcript. Approving a refund or replacement stays with your team or your own system.' },
      { q: 'What languages can it support customers in?', a: 'Artha speaks 10 Indian languages plus English, including natural Hinglish, matching whichever language the customer uses.' },
    ],
  },
  {
    demoSlug: 'finance',
    demoBusiness: 'Saarthi Finance',
    demoBadge: 'Finance demo',
    demoPrompt: 'Ask about a payment reminder, due-date concern, or request a safe callback.',
    // Purple (271°) -> dependable finance blue (215°).
    demoAccentHue: '-56deg',
    label: 'Finance & Collections',
    to: '/solutions/finance',
    icon: 'account_balance',
    desc: 'Run polite EMI reminder and collection calls inside your calling rules.',
    headline: 'AI voice agent for loan collections and EMI reminders.',
    subhead:
      'Artha calls borrowers about an upcoming or missed EMI in Hindi, English or 9 other Indian languages, notes what they say - paid, a promised date, a dispute, a callback - and passes sensitive cases to your team. Every call is transcribed and summarised.',
    pains: [
      { icon: 'currency_rupee', title: 'Manual dialing', body: 'Collectors spend hours on repetitive reminder calls. Artha runs them as a campaign from your number.' },
      { icon: 'gavel', title: 'Inconsistent calls', body: 'Every collector words the reminder differently. Artha follows the same approved script on every call, and each call can be reviewed afterwards.' },
      { icon: 'insights', title: 'No visibility', body: 'Promised dates and outcomes end up in notebooks. Artha saves them as fields on each call, in one list.' },
    ],
    features: ['EMI and payment reminders', 'Promised-date capture', 'Calling window and Do-Not-Call checks', 'Recording, transcript and summary'],
    scenarios: [
      { label: 'Payment reminder', callerLine: '“मेरी due date और amount confirm कर दीजिए.”', agentAction: 'Uses approved account context, communicates the reminder calmly and records the caller’s response.', outcome: 'Verified reminder outcome without pressure.' },
      { label: 'Payment difficulty', callerLine: '“इस महीने payment करना मुश्किल है.”', agentAction: 'Responds without judgment, captures the situation and offers only approved next steps or a human callback.', outcome: 'Hardship context routed safely to the right team.' },
      { label: 'Request a callback', callerLine: '“मुझे किसी person से बात करनी है.”', agentAction: 'Collects a suitable callback time and passes the reason and transcript to an authorized human.', outcome: 'Context-rich callback request.' },
    ],
    workflow: [
      { icon: 'verified_user', title: 'Verify the purpose', body: 'State why the call is happening without exposing unnecessary account information.' },
      { icon: 'record_voice_over', title: 'Hold a respectful conversation', body: 'Use consistent language without threats, shame or artificial urgency.' },
      { icon: 'task_alt', title: 'Capture the outcome', body: 'Record paid, callback, disputed, hardship or promise-to-pay intent accurately.' },
      { icon: 'assignment_ind', title: 'Route sensitive cases', body: 'Move disputes and hardship situations to an authorized human with context.' },
    ],
    resultTitle: 'Payment-call disposition',
    resultFields: [
      { label: 'Call reason', value: 'Upcoming payment reminder' },
      { label: 'Customer response', value: 'Requests due-date discussion' },
      { label: 'Commitment', value: 'No promise recorded' },
      { label: 'Outcome', value: 'Human callback required' },
    ],
    integrations: [
      { icon: 'account_balance_wallet', title: 'Payment workflow', body: 'Use verified payment context and write outcomes back to your system.' },
      { icon: 'rule', title: 'Audit trail', body: 'Keep recordings, transcripts and dispositions available for review.' },
      { icon: 'call', title: 'Human callback queue', body: 'Route hardship, dispute or sensitive cases to the correct team.' },
    ],
    guardrails: ['No threats, humiliation, coercion or fabricated consequences.', 'No sensitive account disclosure before the required verification flow.', 'No payment promise is recorded unless the caller clearly states the amount or date.'],
    faqs: [
      { q: 'Can the AI agent make EMI reminder calls in Hindi and regional languages?', a: 'Yes. Each campaign uses an agent with a default language - Hindi, English or any of the other nine supported Indian languages - and the agent switches if the borrower answers in a different one, including everyday Hinglish.' },
      { q: 'Can it record a promise-to-pay date?', a: 'Yes, once you set it up. Add a post-call data extraction field such as “promised payment date” or “promised amount”, and it is pulled from each call’s transcript, so your team gets a list of who promised what, and when.' },
      { q: 'Does it follow RBI guidance on recovery call timings?', a: 'RBI guidance limits recovery calls to between 8 am and 7 pm. Vistrow Voice lets you set the calling hours, active days and timezone, and blocks dials outside them, so you can set the window to match. Which rules apply to your loans is for your compliance team to confirm.' },
      { q: 'What happens if a borrower asks not to be called again?', a: 'The agent adds the number to your Do-Not-Call list itself, and every later dial is checked against that list before it goes out. You can also block numbers by hand or bulk-import a list.' },
      { q: 'Can a borrower speak to a person?', a: 'Yes. Set a transfer number and the agent dials your colleague into the call and stays on until they answer. It can also take a callback request with a preferred time, for disputes or hardship cases you want a person to handle.' },
      { q: 'Which plan do I need for collections campaigns?', a: 'Outbound campaigns are included on the Growth and Scale plans. Calls use credits by the minute; see the pricing page for plans and what is included.' },
    ],
    guideSections: [
      {
        eyebrow: 'On a reminder call',
        title: 'What the agent does on an EMI reminder or collections call.',
        intro: 'A campaign dials a list of borrowers from your number with the agent you choose. On each call:',
        items: [
          { icon: 'campaign', title: 'It opens with the borrower’s own details', body: 'The fields you import with each contact - name, due date, amount, loan reference - are passed into the call, so the greeting and the reminder use them.' },
          { icon: 'translate', title: 'It talks in the borrower’s language', body: 'It starts in the agent’s default language and follows the borrower into Hindi, English or another supported Indian language mid-call.' },
          { icon: 'task_alt', title: 'It records the outcome', body: 'Post-call fields you define - paid, promised date, promised amount, dispute, wrong number - are pulled from every call’s transcript.' },
          { icon: 'call_split', title: 'It hands over what it should not handle', body: 'Disputes, hardship and anything outside your approved script go to a person, by live transfer or by a callback request with the borrower’s preferred time.' },
        ],
      },
      {
        eyebrow: 'Respectful calling controls',
        title: 'Rules that decide who gets called, and when.',
        intro: 'These are dashboard settings checked before every dial, not lines in a script.',
        note: 'RBI guidance limits recovery calls to between 8 am and 7 pm. The default calling window is 9 am to 9 pm, Monday to Saturday, so a collections team would end it at 7 pm. Vistrow Voice applies the window you set; which rules apply to your loans is for your compliance team to confirm.',
        items: [
          { icon: 'schedule', title: 'Calling window and days', body: 'Set the hours, active days and timezone outbound calls may go out in. With the window enforced, dials outside it are blocked. Each campaign can also have its own schedule and end date.', to: '/help/compliance/calling-rules', link: 'Calling window and Do-Not-Call' },
          { icon: 'block', title: 'Do-Not-Call list', body: 'Every dial is checked against your Do-Not-Call list first. When a borrower asks not to be called again, the agent adds them itself. Blocked contacts are counted, not called.' },
          { icon: 'event_repeat', title: 'Attempts and retries', body: 'Choose how many times to retry, how long to wait between attempts, and separate retry rules for busy lines, voicemail and very short calls. Pace dials per minute and cap concurrent calls.' },
          { icon: 'verified_user', title: 'Consent basis on every campaign', body: 'Each campaign records why its contacts may be called - they enquired, existing customer, opted in, or a third-party list - and stores it with every contact.' },
          { icon: 'shield', title: 'Recording consent and retention', body: 'Optionally ask for spoken consent at the start of the call, choose whether calls are recorded, and set how many days transcripts and recordings are kept.' },
        ],
      },
      {
        eyebrow: 'After the call',
        title: 'Every call leaves a record your team can check.',
        items: [
          { icon: 'description', title: 'Transcript and summary', body: 'Each call is saved with its full transcript and a short summary in Calls history, searchable by name or number.' },
          { icon: 'graphic_eq', title: 'Recording', body: 'With recording on, the audio is stored with the call for playback and download, for quality review and disputes.' },
          { icon: 'hub', title: 'Outcomes into your systems', body: 'Captured fields and the transcript can be posted to your loan or CRM system by webhook, or sent to Zoho CRM, ArthaLeads, Google Sheets or Slack.' },
          { icon: 'fact_check', title: 'Campaign progress', body: 'Each campaign shows connected, calling, pending, no-answer, failed and blocked counts while it runs.', to: '/help/outbound/run-a-campaign', link: 'Run an outbound campaign' },
        ],
      },
      {
        eyebrow: 'Languages',
        title: 'Reminders in the language the borrower answers in.',
        items: [
          { icon: 'translate', title: 'Hindi and Hinglish', body: 'Where most reminder calls start. The Hindi page has a written sample of an upcoming-EMI reminder.', to: '/languages/hindi', link: 'Hindi AI voice calling agent' },
          { icon: 'translate', title: 'Tamil and Punjabi', body: 'Reminders that open in the borrower’s own language and follow the English words they mix in.', to: '/languages/tamil', link: 'Tamil AI voice calling agent' },
          { icon: 'translate', title: 'Every supported language', body: 'Marathi, Telugu, Kannada, Bengali, Gujarati, Malayalam, Odia and Punjabi too, plus English.', to: '/languages', link: 'All languages' },
          { icon: 'payments', title: 'What it costs', body: 'Calls are billed in credits by the minute. See the plans, what each includes, and what is billed separately.', to: '/pricing', link: 'Plans and pricing' },
        ],
      },
    ],
    sampleExchange: {
      context: 'A missed-EMI follow-up call',
      langCode: 'hi-IN',
      langLabel: 'Hindi and Hinglish',
      turns: [
        { speaker: 'Agent', native: 'नमस्ते, सुनीता शर्मा जी बात कर रही हैं?', gloss: 'Hello, is this Sunita Sharma ji speaking?' },
        { speaker: 'Caller', native: 'हाँ, बोलिए।', gloss: 'Yes, go ahead.' },
        { speaker: 'Agent', native: 'मैं Saarthi Finance से Artha बोल रही हूँ। आपकी 5 तारीख की EMI अभी pending दिख रही है।', gloss: 'This is Artha calling from Saarthi Finance. Your EMI for the 5th is still showing as pending.' },
        { speaker: 'Caller', native: 'हाँ, इस महीने थोड़ी problem है। 20 तारीख तक कर दूँगी, पर late fee के बारे में किसी से बात करनी है।', gloss: 'Yes, there is a slight issue this month. I will pay by the 20th, but I need to talk to someone about the late fee.' },
        { speaker: 'Agent', native: 'ठीक है, मैंने 20 तारीख नोट कर ली है। late fee के लिए हमारी team आपको call करेगी, आपके लिए कौन सा time ठीक रहेगा?', gloss: 'Okay, I have noted the 20th. Our team will call you regarding the late fee, what time will work for you?' },
        { speaker: 'Caller', native: 'शाम 5 से 6 के बीच।', gloss: 'Between 5 and 6 in the evening.' },
      ],
      outcome: 'Saarthi Finance is the made-up demo business. With a post-call field set up for it, the promised date is saved on the call; the callback request reaches your team with her preferred time and the transcript.',
    },
  },
  {
    demoSlug: 'support',
    demoBusiness: 'NovaDesk',
    demoBadge: 'Helpdesk demo',
    demoPrompt: 'Try a missing password-reset email, a billing question, or a support escalation.',
    // Purple (271°) -> clear support cyan (190°).
    demoAccentHue: '-81deg',
    label: 'Support & Helpdesk',
    to: '/solutions/support',
    icon: 'support_agent',
    desc: 'Resolve tier-1 tickets on the phone and hand off the rest.',
    headline: 'Resolve tier-1 on the first ring.',
    subhead:
      'Artha resolves routine support calls grounded in your knowledge base, and hands the tricky ones to a human with full context.',
    pains: [
      { icon: 'support', title: 'Long queues', body: 'Callers wait on hold for simple answers. Artha resolves them instantly.' },
      { icon: 'menu_book', title: 'Inconsistent answers', body: 'Every response is grounded in your knowledge base, so answers stay accurate.' },
      { icon: 'swap_calls', title: 'Messy escalations', body: 'Hands off to a human with the full transcript and context attached.' },
    ],
    features: ['Tier-1 resolution', 'Knowledge-grounded answers', 'Context-rich handoff', 'Transcript logging'],
    scenarios: [
      { label: 'Reset email missing', callerLine: '“Password reset email अभी तक नहीं आया.”', agentAction: 'Acknowledges the failed attempt, checks the simple causes one at a time and avoids making the caller repeat themselves.', outcome: 'Resolved step or a clean escalation with attempted actions.' },
      { label: 'Billing question', callerLine: '“मेरे invoice में extra charge क्यों है?”', agentAction: 'Uses approved billing information, explains what is known and escalates account-specific disputes safely.', outcome: 'A categorized billing case with exact caller concern.' },
      { label: 'Escalate an issue', callerLine: '“मैंने तीन बार try किया है, मुझे person से connect कर दो.”', agentAction: 'Stops repeating tier-one steps and hands off the full conversation and troubleshooting history.', outcome: 'Human escalation without restarting the story.' },
    ],
    workflow: [
      { icon: 'hearing', title: 'Understand the failure', body: 'Capture what is broken and what the caller already tried.' },
      { icon: 'menu_book', title: 'Use approved knowledge', body: 'Answer from your help content and account-safe integrations.' },
      { icon: 'build', title: 'Try one useful step', body: 'Guide the caller one action at a time and wait for the result.' },
      { icon: 'support_agent', title: 'Resolve or hand off', body: 'Close the issue or escalate with transcript and attempted steps attached.' },
    ],
    resultTitle: 'Support ticket context',
    resultFields: [
      { label: 'Issue', value: 'Password-reset email missing' },
      { label: 'Already tried', value: 'Resend · spam folder checked' },
      { label: 'Sentiment', value: 'Frustrated' },
      { label: 'Outcome', value: 'Escalated to account support' },
    ],
    integrations: [
      { icon: 'confirmation_number', title: 'Ticketing via webhook', body: 'Send the complete conversation context to your helpdesk through a webhook or an automation tool.' },
      { icon: 'library_books', title: 'Knowledge base', body: 'Ground answers in your approved support documentation.' },
      { icon: 'swap_calls', title: 'Human handoff', body: 'Transfer or schedule a callback without asking the caller to start again.' },
    ],
    guardrails: ['Never repeat troubleshooting the caller already completed.', 'Never invent account status, billing decisions or a resolution timeline.', 'Escalate when the caller requests a human or the issue leaves approved knowledge.'],
    guideSections: [
      {
        eyebrow: 'What the agent handles',
        title: 'The repetitive calls that fill a support queue.',
        items: [
          { icon: 'menu_book', title: 'How-to and policy questions', body: 'Answers come from the knowledge base you upload: help articles, policy documents or approved question and answer pairs. Strict mode keeps it to that material and has it say it will check with the team when something is missing.', to: '/product/knowledge-base', link: 'Knowledge base' },
          { icon: 'inventory_2', title: 'Plan and product lookups', body: 'The live catalog holds structured items such as plans, products or services. The agent looks up full details only when a caller asks, which keeps calls quick.' },
          { icon: 'build', title: 'One step at a time', body: 'It guides the caller through a fix one action at a time, waits for the result, and does not repeat steps the caller says they already tried.' },
          { icon: 'history', title: 'Returning callers', body: 'With Memory on, the agent recognises a returning phone number and uses a short summary of earlier calls, so people are not asked to start over.' },
          { icon: 'translate', title: 'Callers in their own language', body: 'Hindi, regional Indian languages and English, with the agent switching when the caller does.', to: '/languages', link: 'Supported languages' },
          { icon: 'widgets', title: 'Phone and website', body: 'Answer an inbound number, or put a voice and chat button on your help pages so visitors can ask without dialling.', to: '/product/widget', link: 'Website widget' },
        ],
      },
      {
        eyebrow: 'Handing off',
        title: 'Escalation that keeps the story.',
        intro: 'Anything outside approved knowledge, and any caller who asks for a person, should reach one.',
        items: [
          { icon: 'swap_calls', title: 'Live transfer', body: 'Set a transfer phone number and the agent dials your colleague into the call, staying on until they answer.', to: '/help/agents/agent-functions-and-transfer', link: 'Functions and transfer' },
          { icon: 'phone_callback', title: 'Callback request', body: 'When no one is free, the agent records that the caller wants a callback, with their preferred time, and sends it as a callback event.' },
          { icon: 'description', title: 'Transcript and summary attached', body: 'Open any call to read the full transcript, the summary, the sentiment badge, the recording and the fields captured, so the next person starts informed.', to: '/help/calls/find-a-call', link: 'Find a call' },
        ],
      },
      {
        eyebrow: 'Where the outcome goes',
        title: 'Into the tools your team already watches.',
        intro: 'There is no built-in connector for a specific helpdesk product. Calls reach your team through these routes.',
        items: [
          { icon: 'webhook', title: 'Webhook to your helpdesk', body: 'Every call can be posted as JSON to any URL, so a helpdesk that accepts a webhook can create a ticket from it, directly or through Zapier, n8n or Make.', to: '/integrations', link: 'All integrations' },
          { icon: 'chat', title: 'Slack alerts', body: 'Post each escalation or callback request to the channel your support team watches.' },
          { icon: 'table_chart', title: 'Google Sheets log', body: 'Keep a running sheet of calls and captured fields for anyone who does not use the helpdesk.' },
          { icon: 'science', title: 'Test before you go live', body: 'Run built-in Testing Lab scenarios such as impatient callers, interruptions, unsupported questions and transfers, then review the checks before changing a live workflow.', to: '/product/agents', link: 'Voice agents' },
        ],
      },
    ],
    faqs: [
      { q: 'What kind of tickets can it resolve without a human?', a: 'Routine, repetitive questions grounded in your knowledge base - timings, policies, status checks, and the like.' },
      { q: 'How does escalation to a human work?', a: 'Artha hands off with the full transcript and context attached, so your team never has to ask the caller to repeat themselves.' },
      { q: 'Can it be grounded in our existing help docs?', a: 'Yes - upload your docs and Artha answers only from that material when strict mode is on.' },
      { q: 'Does it connect to Zendesk, Freshdesk or another helpdesk?', a: 'There is no built-in connector for a specific helpdesk. Calls can be posted to any URL that accepts a webhook, or routed through Zapier, n8n or Make, which is how most helpdesks create tickets from outside events.' },
      { q: 'Does it recognise repeat callers?', a: 'Yes, if Memory is turned on for the agent. It keeps a short summary of earlier calls from the same phone number and uses it to greet them.' },
      { q: 'Can it transfer a call to a person?', a: 'Yes. Add a transfer phone number to the agent and it dials your colleague into the call, staying on until they answer. If nobody is free it can take a callback request.' },
      { q: 'How do I check it before real customers call?', a: 'Use the Testing Lab to run scenarios such as an impatient caller, an interruption or an unsupported question, and review the results before you publish.' },
      { q: 'Is there a support number or a website option?', a: 'Both. Attach a phone number for inbound calls, add the website widget to your help pages, or use the same agent on both.' },
    ],
  },
]

// ---- Homepage sections ----

export const HOME_FEATURES: NavLink[] = PRODUCT_PAGES

export const HOW_IT_WORKS: FeatureRow[] = [
  { icon: 'dialpad', title: 'Connect a number', body: 'Bring your own number or get one from us. Point inbound calls at Vistrow in minutes.' },
  { icon: 'menu_book', title: 'Train on your knowledge', body: 'Upload PDFs and docs. Artha answers from them with retrieval-grounded RAG.' },
  { icon: 'rocket_launch', title: 'Go live', body: 'Publish your agent and it starts answering, qualifying, and booking - in 10 Indian languages plus English.' },
]

// ---- Header navigation structure ----

export const NAV: NavGroup[] = [
  { label: 'Home', to: '/' },
  {
    label: 'Product',
    items: [
      { label: 'Overview', to: '/product', icon: 'grid_view', desc: 'The whole platform at a glance.' },
      ...PRODUCT_PAGES,
      { label: 'Voice AI platform', to: '/voice-ai-platform', icon: 'hub', desc: 'Every part of the platform, from builder to reports.' },
      { label: 'AI call center', to: '/ai-call-center', icon: 'support_agent', desc: 'First-line calls and follow-ups, with handoff.' },
      { label: 'AI voice bot', to: '/voice-bot', icon: 'record_voice_over', desc: 'What a voice bot is and how a call works.' },
      { label: 'AI telecaller', to: '/ai-telecaller', icon: 'phone_callback', desc: 'Lead calls, follow-ups and callbacks.' },
      { label: 'AI calling agent', to: '/ai-calling-agent', icon: 'call', desc: 'Inbound and outbound calls on one agent.' },
      { label: 'AI receptionist', to: '/ai-receptionist', icon: 'support_agent', desc: 'Answer, book and transfer calls at any hour.' },
      { label: 'AI IVR', to: '/ai-ivr', icon: 'dialpad', desc: 'Replace a press-1 menu with a spoken conversation.' },
    ],
  },
  {
    label: 'Solutions',
    items: [
      { label: 'All industries', to: '/solutions', icon: 'grid_view', desc: 'Voice AI for every industry.' },
      ...SOLUTIONS.map((s) => ({ label: s.label, to: s.to, icon: s.icon, desc: s.desc })),
      { label: 'By language', to: '/languages', icon: 'translate', desc: '10 Indian languages plus English.' },
    ],
  },
  { label: 'Pricing', to: '/pricing' },
  {
    label: 'Resources',
    items: [
      { label: 'Help Center', to: '/help', icon: 'support_agent', desc: 'Step-by-step guides for every part of the dashboard.' },
      { label: 'Docs', to: 'https://docs.vistrowvoice.com', icon: 'description', desc: 'Set-up guides and how everything fits together.' },
      { label: 'Integrations', to: '/integrations', icon: 'hub', desc: 'Every tool Vistrow Voice connects to.' },
      { label: 'AI calling software buyer guide', to: '/best-ai-voice-calling-software-india', icon: 'workspace_premium', desc: 'A selection checklist for India.' },
      { label: 'AI voice bot pricing', to: '/ai-voice-bot-pricing-india', icon: 'payments', desc: 'What really drives per-minute cost.' },
      { label: 'Vistrow vs Sarvam AI', to: '/compare/sarvam-ai', icon: 'compare_arrows', desc: 'Build-vs-buy comparison for voice agents.' },
      { label: 'Demo call examples', to: '/demo-calls/hindi-real-estate-lead-qualification', icon: 'record_voice_over', desc: 'Transcript and CRM-ready output examples.' },
      { label: 'Changelog', to: '/changelog', icon: 'history', desc: 'What shipped, and when.' },
      { label: 'vs. traditional IVR', to: '/vs-ivr', icon: 'compare_arrows', desc: 'How this differs from a phone menu.' },
      { label: 'Blog', to: '/resources/blog', icon: 'article', desc: 'Product news and guides.' },
    ],
  },
  {
    label: 'Company',
    items: [
      { label: 'About', to: '/about', icon: 'info', desc: 'Voice AI, built for Bharat.' },
      { label: 'Security', to: '/security', icon: 'shield', desc: 'How we handle your call data.' },
      { label: 'Careers', to: '/careers', icon: 'work', desc: 'Build voice AI for a billion people.' },
      { label: 'Contact', to: '/contact', icon: 'mail', desc: 'Talk to sales or book a demo.' },
    ],
  },
]

// ---- Footer columns ----

export const FOOTER_COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'Overview', to: '/product' },
      ...PRODUCT_PAGES.map((p) => ({ label: p.label, to: p.to })),
      { label: 'Voice AI platform', to: '/voice-ai-platform' },
      { label: 'AI call center', to: '/ai-call-center' },
      { label: 'AI voice bot', to: '/voice-bot' },
      { label: 'AI telecaller', to: '/ai-telecaller' },
      { label: 'AI calling agent', to: '/ai-calling-agent' },
    ],
  },
  {
    title: 'Solutions',
    links: [...SOLUTIONS.map((s) => ({ label: s.label, to: s.to })), { label: 'By language', to: '/languages' }],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Help Center', to: '/help' },
      { label: 'Docs', to: 'https://docs.vistrowvoice.com' },
      { label: 'Integrations', to: '/integrations' },
      { label: 'Changelog', to: '/changelog' },
      { label: 'AI IVR', to: '/ai-ivr' },
      { label: 'AI receptionist', to: '/ai-receptionist' },
      { label: 'vs. traditional IVR', to: '/vs-ivr' },
      { label: 'Blog', to: '/resources/blog' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', to: '/about' },
      { label: 'Security', to: '/security' },
      { label: 'Careers', to: '/careers' },
      { label: 'Contact', to: '/contact' },
      { label: 'Pricing', to: '/pricing' },
      { label: 'Sign in', to: '/login' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', to: '/privacy' },
      { label: 'Terms', to: '/terms' },
    ],
  },
]

/** Company phone, shown in the footer's tel: link and on the Contact page. */
export const CONTACT_PHONE = '+91 90670 97779'

/** Same number on WhatsApp (sales chat), as a wa.me click-to-chat link. */
export const CONTACT_WHATSAPP_URL = 'https://wa.me/919067097779'

/** Company email, shown in the footer's mailto: link and on the Contact page. */
export const CONTACT_EMAIL = 'info@vistrowvoice.com'

/** Headline stats shown under the hero. */
/** A handful of global greetings for the homepage chip strip. Deliberately
 *  short: this is a visual signal that the agent goes past India, not the
 *  catalogue — /languages carries the full list. Only greetings we are sure
 *  of, in their own script. */
export const GLOBAL_GREETINGS: { greeting: string; name: string }[] = [
  { greeting: 'Bonjour', name: 'French' },
  { greeting: 'Hola', name: 'Spanish' },
  { greeting: 'Hallo', name: 'German' },
  { greeting: 'こんにちは', name: 'Japanese' },
  { greeting: 'مرحبا', name: 'Arabic' },
]

export const HERO_STATS = [
  { value: '11', label: 'Languages' },
  { value: '24/7', label: 'Always answering' },
  { value: '3', label: 'Inbound · outbound · web' },
]

/** Tools shown in "works with" strips.
 *
 * Deliberately the tools a CUSTOMER connects, never the LLM/STT/TTS vendors
 * powering the product - naming those publicly is exactly what the agent
 * prompts are written to deflect (so a competitor can't lift the stack from
 * a demo call), and a marketing page that lists them defeats that entirely.
 * It's also the more useful answer: a buyer is asking "does this fit my
 * stack?", not "what's under the hood?". */
export const WORKS_WITH = ['Slack', 'Zoho CRM', 'Google Sheets', 'Zapier', 'Any CRM']

// ---- Languages (feed /languages overview + per-language landing pages) ----
//
// Mirrors LANGUAGE_NAMES in lib/api.ts exactly - that map is what the agent
// builder actually offers, so this list must never claim a language the
// product can't be configured to speak. Ten regional languages here, plus
// English (supported too but doesn't get a landing page - no search wedge
// there) = 11 supported languages in total.

export interface LanguagePage {
  /** URL slug, e.g. "hindi" -> /languages/hindi */
  slug: string
  /** English name, matching LANGUAGE_NAMES. */
  name: string
  /** Native-script endonym, shown as the visual hook. */
  native: string
  /** BCP-47-ish code used by the agent builder. */
  code: string
  /** Where this language actually concentrates - grounds the copy. */
  region: string
  /** How a caller is actually greeted in this language, in its own script.
   * Used by the homepage's rotating hero greeting and the script marquee -
   * the most honest way to show what the product does is to show it doing
   * it, rather than decorating the page with generic "Indian" motifs. */
  greeting: string
  /** One-line positioning for the landing page hero. */
  blurb: string
  /** Longer hero paragraph for the language page; the blurb stays on the
   * /languages overview cards. Falls back to the blurb. */
  intro?: string
  /** Heading for the regional-calls section; defaults to "Where X calls matter most." */
  regionalHeading?: string
  /** Search-intent phrase this page should visibly answer. */
  /** Local business contexts where this language matters most. */
  localUseCases?: string[]
  /** Practical call behaviors that make the language support feel real. */
  callBehaviors?: string[]
  /** Extra FAQ tuned to the language's highest search opportunity. */
  seoFaq?: { q: string; a: string }
  /** A short written sample exchange (native script + English gloss). Labelled
   * on the page as a written example, never as a recorded customer call. */
  sampleExchange?: { context: string; turns: { speaker: 'Caller' | 'Agent'; native: string; gloss: string }[]; outcome: string }
  /** How callers of this language actually mix in English, and what the agent does. */
  codeMixing?: { name: string; body: string }
  /** Regional call types, each linked to an existing page that goes deeper. */
  regionalCalls?: { title: string; body: string; to: string; link: string }[]
  /** Practical notes on script, dialect, numbers and testing for this language. */
  guide?: { title: string; body: string }[]
  /** Short single lines (native script + English gloss), labelled on the page
   * as written examples of how the agent phrases common moments. */
  sampleLines?: { label: string; native: string; gloss: string }[]
  /** Further FAQs, appended after seoFaq. */
  extraFaqs?: { q: string; a: string }[]
  /** Links to registered pages that go deeper (solutions, compare, product, demo calls). */
  related?: { to: string; label: string }[]
  /** One in-text link to a related guide, shown above the related links. */
  readMore?: { lead: string; to: string; label: string }
}

/** Voices that speak every one of the ten Indian languages and keep the same
 * voice when the caller switches language. These are the Standard-tier voices
 * offered in the agent picker (agent/voice_catalog.py: Sarvam bulbul:v3
 * speakers, whose languages_for() covers all eleven native codes). Update this
 * if that catalog changes. */
export const INDIAN_LANGUAGE_VOICES = {
  female: ['Pooja', 'Priya', 'Kavya', 'Ritu', 'Simran', 'Ishita'],
  male: ['Shubh', 'Aditya', 'Rohan', 'Amit'],
}

export const LANGUAGES: LanguagePage[] = [
  {
    slug: 'hindi',
    readMore: { lead: 'Serving Hindi-speaking customers outside India, in the UK, Canada, the US or the Gulf? Read our guide to', to: '/resources/blog/multilingual-ai-receptionist-hindi-punjabi-english', label: 'a multilingual AI receptionist for Hindi, Punjabi and English callers' },
    name: 'Hindi',
    native: 'हिन्दी',
    code: 'hi-IN',
    region: 'North & Central India',
    greeting: 'नमस्ते',
    blurb: 'The default for most Indian call flows - including the everyday Hinglish your customers actually speak, not textbook Hindi.',
    intro: 'The default for most Indian call flows: an AI voice agent in Hindi that speaks the everyday Hinglish your customers actually use, not textbook Hindi. Put it on inbound lines, reminders and follow-ups as an AI calling agent in Hindi.',
    regionalHeading: 'Where an AI voice agent in Hindi helps most.',
    localUseCases: [
      'Real estate enquiries from Hindi and Hinglish-speaking buyers',
      'Support calls where customers switch between Hindi and English',
      'Outbound follow-ups, reminders, and appointment booking across North India',
    ],
    callBehaviors: [
      'Greets in Hindi, then follows natural Hinglish without restarting the call',
      'Captures budget, location, timeline, and intent in CRM-ready notes',
      'Handles numbers, dates, names, and project details clearly for sales teams',
    ],
    seoFaq: {
      q: 'Is this an AI calling agent in Hindi or just a Hindi voice bot?',
      a: 'It is a real AI phone calling agent: it speaks, listens, qualifies the caller, answers approved questions, and logs the conversation. That makes it different from a recorded Hindi IVR or a translated chatbot.',
    },
    sampleExchange: {
      context: 'An outbound EMI reminder call',
      turns: [
        { speaker: 'Agent', native: 'नमस्ते राहुल जी, मैं Artha बोल रही हूँ। आपकी इस महीने की EMI 15 तारीख़ को due है, बस याद दिलाने के लिए call किया।', gloss: 'Hello Rahul ji, I am Artha. Your EMI for this month is due on the 15th, I just called to remind you.' },
        { speaker: 'Caller', native: 'हाँ, पता है। Salary 12 को आएगी, तो 13 तक payment कर दूँगा।', gloss: 'Yes, I know. My salary comes on the 12th, so I’ll pay by the 13th.' },
        { speaker: 'Agent', native: 'ठीक है, मैंने 13 तारीख़ note कर ली है। कोई और सवाल हो तो बताइए।', gloss: 'Okay, I have noted the 13th. Let me know if you have any other question.' },
      ],
      outcome: 'With a post-call field set up for it, the promised date is pulled from the transcript for your collections team.',
    },
    codeMixing: {
      name: 'Hinglish',
      body: 'Most Hindi calls are Hinglish: “EMI”, “due date”, “payment”, “site visit” and numbers often come in English inside a Hindi sentence. The agent keeps replying in Hindi while understanding those English words, and switches fully to English if the caller does.',
    },
    regionalCalls: [
      { title: 'Payment and EMI reminders', body: 'Polite outbound reminders across the Hindi belt, inside the permitted calling window and checked against your Do-Not-Call list.', to: '/solutions/finance', link: 'Finance and collections calls' },
      { title: 'Property enquiries', body: 'Buyers in Delhi NCR, Lucknow, Jaipur or Indore asking about budget, location and site visits, mostly in Hinglish.', to: '/solutions/real-estate/hindi-ai-calling-agent-real-estate', link: 'Hindi real estate calling' },
      { title: 'Order and delivery calls', body: 'Where-is-my-order, return and COD confirmation calls for online sellers whose customers prefer Hindi.', to: '/solutions/ecommerce', link: 'E-commerce support calls' },
    ],
  },
  {
    slug: 'marathi',
    name: 'Marathi',
    native: 'मराठी',
    code: 'mr-IN',
    region: 'Maharashtra',
    greeting: 'नमस्कार',
    blurb: 'Answer Pune and Mumbai callers in Marathi instead of defaulting them into Hindi or English.',
    localUseCases: [
      'Pune, Mumbai, Nashik, and Nagpur property enquiries',
      'Local support calls where Marathi builds trust faster than English',
      'Follow-up calls for appointments, site visits, payments, and renewals',
    ],
    callBehaviors: [
      'Starts in Marathi and can shift into Hindi or English when the caller does',
      'Asks clear qualification questions without sounding like a rigid IVR',
      'Creates structured summaries for sales, support, and operations teams',
    ],
    seoFaq: {
      q: 'Can one agent handle Marathi plus Hindi or English?',
      a: 'Yes. Many Maharashtra calls naturally mix Marathi with Hindi or English. Artha can keep the same call going and match the caller instead of transferring them to another bot.',
    },
    extraFaqs: [
      { q: 'Does the agent understand Marathi spoken the way Pune and Mumbai callers speak it?', a: 'It follows everyday spoken Marathi, including English words inside a sentence. Regional speech differs across Maharashtra, so run test calls with callers from the regions you serve before launch and tighten the prompt where the agent mishears.' },
      { q: 'Can the agent read out phone numbers, pin codes and amounts in Marathi?', a: 'Yes, and you decide the style in the prompt. Many callers say numbers in English even when the rest of the call is Marathi, so most teams let the agent repeat digits back in whichever language the caller used.' },
    ],
    sampleExchange: {
      context: 'An inbound call to a Pune diagnostic lab',
      turns: [
        { speaker: 'Caller', native: 'नमस्कार, उद्या सकाळी घरी blood test साठी sample collection होईल का?', gloss: 'Hello, can a sample be collected at home tomorrow morning for a blood test?' },
        { speaker: 'Agent', native: 'नमस्कार! हो, उद्या सकाळी 7 ते 9 चा slot available आहे. तुमचा address आणि pin code सांगाल का?', gloss: 'Hello! Yes, a 7 to 9 a.m. slot is available tomorrow. Could you tell me your address and pin code?' },
        { speaker: 'Caller', native: 'कोथरूड, pin code 411038. Fasting लागेल का?', gloss: 'Kothrud, pin code 411038. Is fasting needed?' },
        { speaker: 'Agent', native: 'त्या test साठी lab च्या instructions नुसार fasting लागेल. मी उद्याचा 7 ते 9 चा slot book केला आहे.', gloss: 'For that test, fasting is needed as per the lab instructions. I have booked tomorrow’s 7 to 9 a.m. slot.' },
      ],
      outcome: 'The fasting instruction comes from the lab’s own knowledge base rather than being guessed. The address, pin code and slot are saved on the call for the collection team.',
    },
    codeMixing: {
      name: 'Marathi-Hindi-English mixing',
      body: 'Mumbai and Pune callers often move between Marathi, Hindi and English inside one call: the sentence is Marathi, while “appointment”, “site visit”, “EMI” and numbers arrive in English or Hindi. The agent understands that mix, keeps replying in Marathi, and switches to Hindi or English if the caller does.',
    },
    regionalCalls: [
      { title: 'Mumbai and Pune property enquiries', body: 'Buyer calls about projects, budgets and site visits, qualified in Marathi before your sales team calls back.', to: '/solutions/real-estate/marathi-ai-calling-agent-mumbai-real-estate', link: 'Marathi real estate calling' },
      { title: 'Clinics, labs and home-service bookings', body: 'Appointment and slot calls for clinics, diagnostic labs and service providers across Maharashtra, booked inside your real availability.', to: '/solutions/healthcare', link: 'AI receptionist for clinics' },
      { title: 'Payment, renewal and EMI reminders', body: 'Outbound reminders in Marathi, inside your calling window and checked against your Do-Not-Call list.', to: '/solutions/finance', link: 'Collections and EMI reminder calls' },
    ],
    guide: [
      { title: 'Script and spelling', body: 'Marathi uses the Devanagari script, the same as Hindi, so welcome lines and prompts can look similar on the page. Write the welcome message in proper Marathi rather than reusing the Hindi one: “नमस्कार” opens the call, and verb endings differ from Hindi in ways callers notice immediately.' },
      { title: 'Regional speech', body: 'Spoken Marathi changes between Mumbai, Pune, Nashik, Nagpur and Marathwada, and urban callers lean on Hindi and English words. Test with a few callers from each region you serve, and add the local place names and project names to the knowledge base so the agent recognises them.' },
      { title: 'Where to start', body: 'Pick one call type, such as site-visit booking or appointment slots, and run 20 to 30 test calls with noisy audio and interruptions before real traffic. Add a transfer to a person for anything the agent should not answer, and review the first week of transcripts.' },
    ],
    related: [
      { to: '/demo-calls/marathi-site-visit-booking', label: 'Marathi site-visit demo call' },
      { to: '/product/inbound', label: 'Inbound call answering' },
      { to: '/product/outbound', label: 'Outbound campaigns' },
      { to: '/product/knowledge-base', label: 'Knowledge base' },
      { to: '/languages/hindi', label: 'Hindi and Hinglish calling' },
      { to: '/ai-ivr', label: 'AI IVR replacement' },
    ],
  },
  {
    slug: 'tamil',
    name: 'Tamil',
    native: 'தமிழ்',
    code: 'ta-IN',
    region: 'Tamil Nadu',
    greeting: 'வணக்கம்',
    blurb: 'Tamil callers rarely accept a Hindi-first IVR. Give them an agent that opens in their own language.',
    localUseCases: [
      'Chennai and Tamil Nadu property, clinic and service enquiries answered in Tamil',
      'Follow-up calls to new enquiries, placed in Tamil shortly after the form arrives',
      'Reminders and support calls for customers who expect Tamil, not a Hindi-first menu',
    ],
    callBehaviors: [
      'Opens in Tamil and follows Tamil-English switching without restarting the call',
      'Captures budget, location, purpose and timeline as lead fields',
      'Saves the recording, transcript and summary, and sends the lead to your CRM',
    ],
    seoFaq: {
      q: 'Is this a Tamil voice bot or a real AI calling agent?',
      a: 'A real AI calling agent. It listens, understands the request in Tamil, answers from your approved information, books or transfers the call, and logs everything. It is not a recorded Tamil IVR menu.',
    },
    sampleExchange: {
      context: 'A follow-up call to a Chennai property enquiry',
      turns: [
        { speaker: 'Agent', native: 'வணக்கம் கார்த்திக், நான் Artha பேசுறேன். OMR project பத்தி enquiry பண்ணீங்க-ல, அத பத்தி பேசத்தான் call பண்ணிருக்கேன்.', gloss: 'Hello Karthik, I am Artha. You enquired about the OMR project, so I am calling to discuss it.' },
        { speaker: 'Caller', native: 'ஆமா, 2BHK price என்ன range-ல இருக்கு?', gloss: 'Yes, what range is the 2BHK price in?' },
        { speaker: 'Agent', native: '2BHK 75 lakh-ல இருந்து ஆரம்பிக்குது. நீங்க சொந்தமா இருக்கவா, investment-க்கா பாக்குறீங்க?', gloss: 'The 2BHK starts from 75 lakh. Are you looking to live in it yourself, or as an investment?' },
        { speaker: 'Caller', native: 'சொந்தமா இருக்க. Sunday site visit பண்ணலாமா?', gloss: 'To live in. Can I do a site visit on Sunday?' },
        { speaker: 'Agent', native: 'பண்ணலாம். Sunday காலை 10 மணிக்கு slot free-ஆ இருக்கு, book பண்ணட்டுமா?', gloss: 'Yes. There’s a free slot on Sunday at 10 a.m.; shall I book it?' },
      ],
      outcome: 'The price is read from the project’s approved price list, not guessed. Purpose, configuration and the site-visit slot are saved on the call.',
    },
    codeMixing: {
      name: 'Tanglish',
      body: 'Chennai callers mix Tamil and English freely: “EMI”, “booking”, “site visit”, “2BHK” and most numbers usually stay in English. The agent understands those words inside a Tamil sentence, keeps replying in Tamil, and switches to English if the caller does.',
    },
    regionalCalls: [
      { title: 'Chennai property enquiries', body: 'Buyer calls about projects on OMR, in Porur or Tambaram, qualified on budget, location and timeline, with site visits booked on your calendar.', to: '/solutions/real-estate', link: 'AI calling for real estate' },
      { title: 'Clinic and hospital appointments', body: 'Appointment and timing calls for clinics and diagnostic centres across Tamil Nadu, booked inside your real availability.', to: '/solutions/healthcare', link: 'AI receptionist for clinics' },
      { title: 'Payment and EMI reminders', body: 'Polite outbound reminders in Tamil, inside your calling window and checked against your Do-Not-Call list.', to: '/solutions/finance', link: 'Collections and EMI reminder calls' },
    ],
  },
  {
    slug: 'telugu',
    name: 'Telugu',
    native: 'తెలుగు',
    code: 'te-IN',
    region: 'Andhra Pradesh & Telangana',
    greeting: 'నమస్కారం',
    blurb: 'Handle Hyderabad and coastal Andhra call volume in Telugu, around the clock.',
    intro: 'An AI voice calling agent in Telugu that handles Hyderabad and coastal Andhra call volume around the clock, on your phone lines and your website.',
    regionalHeading: 'Where an AI voice calling agent in Telugu helps most.',
    localUseCases: [
      'Hyderabad real estate, education, healthcare, and service enquiries',
      'Inbound calls from Andhra Pradesh and Telangana customers',
      'Outbound confirmation, reminder, and lead qualification campaigns',
      'Clinic and hospital appointment lines in Vijayawada, Visakhapatnam, Guntur, Warangal and Tirupati',
      'Coaching, college and admission enquiries from Telugu-speaking families',
    ],
    callBehaviors: [
      'Keeps the conversation in Telugu while understanding English product terms',
      'Collects caller needs, urgency, location, and next-step preference',
      'Records transcripts and summaries so teams can review every call later',
    ],
    seoFaq: {
      q: 'Can Artha handle Telugu callers on both phone and website calls?',
      a: 'Yes. The same Telugu AI voice calling agent can answer phone calls and website voice-widget conversations, then save the transcript, summary, and lead details for your team.',
    },
    sampleExchange: {
      context: 'An inbound call to a clinic’s appointment line',
      turns: [
        { speaker: 'Caller', native: 'హలో, రేపు డాక్టర్ గారి appointment దొరుకుతుందా?', gloss: 'Hello, can I get an appointment with the doctor tomorrow?' },
        { speaker: 'Agent', native: 'నమస్కారం! రేపు సాయంత్రం 5 గంటలకు slot ఖాళీగా ఉంది. మీ పేరు చెప్తారా?', gloss: 'Hello! There’s a free slot tomorrow at 5 p.m. Could you tell me your name?' },
        { speaker: 'Caller', native: 'లక్ష్మి. సాయంత్రం 5 okay.', gloss: 'Lakshmi. 5 in the evening is okay.' },
        { speaker: 'Agent', native: 'సరే లక్ష్మి గారు, రేపు సాయంత్రం 5 గంటలకు మీ appointment book అయింది.', gloss: 'Okay Lakshmi garu, your appointment is booked for 5 p.m. tomorrow.' },
      ],
      outcome: 'The booking appears in Appointments, inside the clinic’s bookable hours, and the transcript is in Calls history.',
    },
    codeMixing: {
      name: 'Tenglish',
      body: 'Telugu callers in Hyderabad often switch to English for words like “appointment”, “slot”, “EMI” or a flat size. The agent understands those terms without asking the caller to repeat them in Telugu, keeps replying in Telugu, and moves to English if the caller does.',
    },
    regionalCalls: [
      { title: 'Clinic and diagnostic bookings', body: 'Appointment and timing calls for clinics in Andhra Pradesh and Telangana, where many patients would rather not navigate an English menu.', to: '/solutions/healthcare', link: 'AI receptionist for clinics' },
      { title: 'Hyderabad property enquiries', body: 'Buyer calls about projects, budgets and site visits, qualified in Telugu before your sales team calls back.', to: '/solutions/real-estate/telugu-ai-calling-agent-hyderabad-real-estate', link: 'Telugu real estate calling' },
      { title: 'Admissions and service enquiries', body: 'Course, fee and timing questions answered from your approved information, around the clock.', to: '/product/inbound', link: 'Inbound call answering' },
      { title: 'Lead follow-ups across both states', body: 'New enquiries from Hyderabad, Vijayawada or Vizag called back in Telugu, qualified, and handed to your team with a callback time.', to: '/ai-telecaller', link: 'AI telecaller for lead calls' },
      { title: 'Front-desk calls', body: 'Timings, directions and bookings for clinics, salons and service centres, with a transfer to a person on phone calls.', to: '/ai-receptionist', link: 'AI receptionist' },
      { title: 'Website visitors', body: 'A visitor on your Telugu or English site taps to talk and is answered in Telugu, no phone number or app needed.', to: '/product/widget', link: 'Website call widget' },
    ],
    sampleLines: [
      { label: 'Greeting', native: 'నమస్కారం! నేను Artha ని, మీకు ఎలా help చేయగలను?', gloss: 'Hello! I am Artha, how can I help you?' },
      { label: 'When the caller is busy', native: 'ఇప్పుడు busy గా ఉంటే, ఏ టైమ్ కి call చేయమంటారు?', gloss: 'If you are busy now, what time should we call?' },
      { label: 'A question outside the knowledge base', native: 'ఆ విషయం మా team తో confirm చేసి మళ్ళీ చెప్తాము.', gloss: 'We will confirm that with our team and get back to you.' },
      { label: 'Transfer on a phone call', native: 'ఒక్క నిమిషం, మిమ్మల్ని మా sales team కి connect చేస్తాను.', gloss: 'One minute, I’ll connect you to our sales team.' },
    ],
    guide: [
      { title: 'Script and respect', body: 'Write the welcome message in Telugu script, opening with “నమస్కారం”, rather than in romanised Telugu. Callers expect “గారు” after their name; say so in the prompt, as in the sample above, and the agent keeps doing it.' },
      { title: 'Telangana and Andhra speech', body: 'Hyderabad Telugu borrows Hindi and Urdu words, while coastal Andhra and Rayalaseema callers sound different again. Some Hyderabad callers move to Hindi altogether, and the agent can follow them there. Test with callers from each region you serve before launch.' },
      { title: 'Numbers and units', body: 'Amounts are usually said in lakhs and crores, often in English, and Hyderabad plots are commonly quoted in square yards. Put the units you actually use into the knowledge base and post-call fields so budgets and sizes are captured the way your team reads them.' },
    ],
    extraFaqs: [
      { q: 'Does the agent understand Hyderabad Telugu mixed with Hindi and English?', a: 'It follows everyday spoken Telugu with English words inside a sentence, and it can switch to Hindi or English when the caller does. Speech differs across Telangana, coastal Andhra and Rayalaseema, so run test calls with callers from your regions and tighten the prompt where it mishears.' },
      { q: 'Can a Telugu call be transferred to someone on my team?', a: 'On phone calls, yes. Set a transfer number and the agent dials your colleague into the call and stays on until they answer; if nobody picks up, it takes a callback request. Website widget calls cannot be transferred to a phone, so the agent captures a callback number.' },
      { q: 'Can it capture plot sizes and budgets the way Hyderabad buyers say them?', a: 'Yes, if you set it up. Add the units you sell in, such as square yards or BHK, to the knowledge base, and define post-call fields for size and budget. The values are then pulled from each transcript for your sales team.' },
    ],
    related: [
      { to: '/demo-calls/telugu-website-widget-call', label: 'Telugu website-widget demo call' },
      { to: '/solutions/real-estate/telugu-ai-calling-agent-hyderabad-real-estate', label: 'Telugu real estate calling in Hyderabad' },
      { to: '/ai-receptionist', label: 'AI receptionist' },
      { to: '/ai-telecaller', label: 'AI telecaller' },
      { to: '/solutions/healthcare', label: 'Clinic appointment calls' },
      { to: '/languages/kannada', label: 'Kannada calling' },
      { to: '/languages/tamil', label: 'Tamil calling' },
    ],
  },
  {
    slug: 'kannada',
    name: 'Kannada',
    native: 'ಕನ್ನಡ',
    code: 'kn-IN',
    region: 'Karnataka',
    greeting: 'ನಮಸ್ಕಾರ',
    blurb: 'Serve Bengaluru and wider Karnataka in Kannada, with English code-switching where it feels natural.',
    intro: 'Serve Bengaluru and wider Karnataka with an AI voice calling agent in Kannada that answers and makes calls, with English code-switching where it feels natural.',
    regionalHeading: 'Where an AI voice calling agent in Kannada helps most.',
    localUseCases: [
      'Bengaluru and Karnataka property enquiries where English-only calling loses context',
      'Support and booking calls for local customers who prefer Kannada',
      'Campaign follow-ups where the agent must understand Kannada plus English terms',
      'Clinic, diagnostic lab and hospital lines in Mysuru, Mangaluru, Hubballi-Dharwad and Belagavi',
      'Coaching, college and admission enquiries from Kannada-speaking families',
    ],
    callBehaviors: [
      'Opens in Kannada and handles natural Kannada-English code-switching',
      'Qualifies callers with budget, timeline, location, and purpose questions',
      'Pushes clean call records into your dashboard and connected CRM workflows',
    ],
    seoFaq: {
      q: 'Why use a Kannada AI voice calling agent instead of an English bot?',
      a: 'Kannada callers explain needs more clearly when the call starts in Kannada. Artha keeps the conversation local, then captures structured lead data for your team.',
    },
    sampleExchange: {
      context: 'An inbound property enquiry in Bengaluru',
      turns: [
        { speaker: 'Caller', native: 'ಹಲೋ, Whitefield ಹತ್ತಿರ 2BHK flat ಇದೆಯಾ?', gloss: 'Hello, is there a 2BHK flat near Whitefield?' },
        { speaker: 'Agent', native: 'ನಮಸ್ಕಾರ! ಹೌದು, Whitefield ಹತ್ತಿರ 2BHK options ಇವೆ. ನಿಮ್ಮ budget ಎಷ್ಟು ಅಂತ ಹೇಳ್ತೀರಾ?', gloss: 'Hello! Yes, there are 2BHK options near Whitefield. What is your budget?' },
        { speaker: 'Caller', native: 'ಸುಮಾರು 80 lakh ಒಳಗೆ. Weekend-ಅಲ್ಲಿ site visit ಮಾಡಬಹುದಾ?', gloss: 'Under about 80 lakh. Can I do a site visit on the weekend?' },
        { speaker: 'Agent', native: 'ಖಂಡಿತ. ಶನಿವಾರ ಬೆಳಿಗ್ಗೆ 11 ಗಂಟೆಗೆ slot ಖಾಲಿ ಇದೆ, book ಮಾಡ್ಲಾ?', gloss: 'Of course. There’s a free slot on Saturday at 11 a.m. Shall I book it?' },
      ],
      outcome: 'Budget, location and the site-visit slot are saved on the call and can be sent to your CRM.',
    },
    codeMixing: {
      name: 'Kanglish',
      body: 'Bengaluru callers mix Kannada and English constantly: “2BHK”, “budget”, “site visit”, “EMI” and area names usually stay in English. The agent follows that mix, keeps replying in Kannada, and switches to English if the caller does.',
    },
    regionalCalls: [
      { title: 'Bengaluru property enquiries', body: 'Buyer calls about projects, budgets and site visits in Whitefield, Sarjapur or Hebbal, answered in Kannada.', to: '/solutions/real-estate/kannada-ai-voice-bot-bangalore-real-estate', link: 'Kannada real estate calling' },
      { title: 'Clinic and service bookings', body: 'Appointment calls for clinics and service centres across Karnataka, booked into your real availability.', to: '/solutions/healthcare', link: 'AI receptionist for clinics' },
      { title: 'Support lines', body: 'Status and how-to calls from customers who would rather not switch to English, with a transfer when a person is needed.', to: '/solutions/support', link: 'Customer support calls' },
      { title: 'Lead follow-ups beyond Bengaluru', body: 'Enquiries from Mysuru, Hubballi or Mangaluru called back in Kannada, qualified, and handed to your team with a callback time.', to: '/ai-telecaller', link: 'AI telecaller for lead calls' },
      { title: 'Front-desk calls', body: 'Timings, directions and bookings for clinics, salons and service centres, with a transfer to a person on phone calls.', to: '/ai-receptionist', link: 'AI receptionist' },
      { title: 'Website visitors', body: 'A visitor on your site taps to talk and is answered in Kannada, no phone number or app needed.', to: '/product/widget', link: 'Website call widget' },
    ],
    sampleLines: [
      { label: 'Greeting', native: 'ನಮಸ್ಕಾರ, ನಾನು Artha. ನಿಮಗೆ ಹೇಗೆ help ಮಾಡಲಿ?', gloss: 'Hello, I am Artha. How can I help you?' },
      { label: 'When the caller is busy', native: 'ಈಗ busy ಇದ್ರೆ, ಯಾವ time ಗೆ call ಮಾಡ್ಲಿ?', gloss: 'If you are busy now, what time should we call?' },
      { label: 'A question outside the knowledge base', native: 'ಆ ವಿಷಯ ನಮ್ಮ team ಹತ್ರ confirm ಮಾಡಿ ನಿಮಗೆ ತಿಳಿಸ್ತೀವಿ.', gloss: 'We’ll confirm that with our team and let you know.' },
      { label: 'Transfer on a phone call', native: 'ಒಂದು ನಿಮಿಷ hold ಮಾಡಿ, sales team ಗೆ connect ಮಾಡ್ತೀನಿ.', gloss: 'Hold for one minute, I will connect you to the sales team.' },
    ],
    guide: [
      { title: 'Script and welcome line', body: 'Write the welcome message in Kannada script, opening with “ನಮಸ್ಕಾರ”, rather than in romanised Kannada. Keep the English words your callers already use, such as “site visit” or “EMI”, instead of formal Kannada terms nobody says on the phone.' },
      { title: 'Bengaluru and the rest of Karnataka', body: 'Bengaluru calls are heavily mixed with English, and some callers move to Hindi, Tamil or Telugu, which the agent can follow. Calls from Mysuru, Hubballi-Dharwad or Belagavi tend to stay in Kannada and sound different. Test with callers from each region you serve.' },
      { title: 'Localities and project names', body: 'Add the area names callers will say, such as Whitefield, Sarjapur Road, Electronic City, Hebbal or Kanakapura Road, along with your project and product names, to the knowledge base so the agent recognises them and answers about the right place.' },
    ],
    extraFaqs: [
      { q: 'Does the agent understand Bengaluru Kannada mixed with English?', a: 'It follows everyday spoken Kannada with English words inside a sentence, and keeps replying in Kannada unless the caller moves to English. Speech differs between Bengaluru, Mysuru, coastal and North Karnataka, so run test calls with callers from your regions before launch.' },
      { q: 'Can a Kannada call be transferred to someone on my team?', a: 'On phone calls, yes. Set a transfer number and the agent dials your colleague into the call and stays on until they answer; if nobody picks up, it takes a callback request. Website widget calls cannot be transferred to a phone, so the agent captures a callback number.' },
      { q: 'Does it speak Tulu or Konkani?', a: 'No. The agent speaks Kannada, English and nine other Indian languages, but not Tulu or Konkani. Coastal Karnataka callers usually use Kannada or English on business calls; test with a few of them if that region matters to you.' },
    ],
    related: [
      { to: '/demo-calls/kannada-inbound-property-enquiry', label: 'Kannada property-enquiry demo call' },
      { to: '/solutions/real-estate/kannada-ai-voice-bot-bangalore-real-estate', label: 'Kannada real estate calling in Bengaluru' },
      { to: '/ai-receptionist', label: 'AI receptionist' },
      { to: '/ai-telecaller', label: 'AI telecaller' },
      { to: '/product/inbound', label: 'Inbound call answering' },
      { to: '/languages/telugu', label: 'Telugu calling' },
      { to: '/languages/tamil', label: 'Tamil calling' },
    ],
  },
  {
    slug: 'bengali',
    name: 'Bengali',
    native: 'বাংলা',
    code: 'bn-IN',
    region: 'West Bengal',
    greeting: 'নমস্কার',
    blurb: 'Kolkata and West Bengal callers, answered in Bengali on the first ring.',
    localUseCases: [
      'Kolkata, Howrah, Siliguri and West Bengal enquiries answered in Bengali',
      'Order-status, delivery and support calls for sellers whose customers expect Bengali',
      'Clinic and coaching lines, plus reminders and follow-ups, outside office hours',
    ],
    callBehaviors: [
      'Opens in Bengali and follows the caller into English or Hindi mid-call',
      'Answers from your approved information and offers a callback when it should not guess',
      'Saves the recording, transcript and summary, and passes lead details to your CRM',
    ],
    seoFaq: {
      q: 'Is this a Bengali voice bot or a real AI calling agent?',
      a: 'A real AI calling agent. It listens, understands the request in Bengali, answers from your approved information, books or transfers the call, and logs everything. It is not a recorded Bengali IVR menu.',
    },
    extraFaqs: [
      { q: 'Is this Bengali as spoken in West Bengal?', a: 'This page covers Bengali for calls in India, mainly West Bengal. If your callers speak a particular regional variety, test with those callers first and put local terms in the knowledge base.' },
      { q: 'Can the agent look up an order or a booking?', a: 'It can, where your order or booking system is connected through a webhook or integration. Without that connection it answers from your approved knowledge base and takes the details for your team.' },
    ],
    sampleExchange: {
      context: 'An inbound order-status call to an online seller',
      turns: [
        { speaker: 'Caller', native: 'হ্যালো, আমার order-টা কবে আসবে? order number 5821.', gloss: 'Hello, when will my order arrive? Order number 5821.' },
        { speaker: 'Agent', native: 'নমস্কার! একটু দেখে নিচ্ছি। আপনার order-টা আজ বিকেল ৫টার মধ্যে পৌঁছানোর কথা। delivery partner-এর number-টা কি SMS-এ পাঠিয়ে দেব?', gloss: 'Hello! Let me check. Your order is due to arrive by 5 p.m. today. Shall I send the delivery partner’s number via SMS?' },
        { speaker: 'Caller', native: 'হ্যাঁ, পাঠিয়ে দিন। ধন্যবাদ।', gloss: 'Yes, please send it. Thank you.' },
      ],
      outcome: 'This sample assumes the seller’s order system is connected, so the status is read from it rather than guessed. The call and the follow-up request are saved on the call.',
    },
    codeMixing: {
      name: 'Banglish',
      body: 'Kolkata callers mix English into Bengali all the time: “order”, “appointment”, “delivery”, “EMI” and most numbers. Hindi also appears, especially with callers who grew up elsewhere. The agent understands those words inside a Bengali sentence, keeps replying in Bengali, and switches to English or Hindi if the caller does.',
    },
    regionalCalls: [
      { title: 'Order and delivery calls', body: 'Where-is-my-order, return and COD confirmation calls for online sellers whose customers prefer Bengali.', to: '/solutions/ecommerce', link: 'E-commerce support calls' },
      { title: 'Clinic and diagnostic bookings', body: 'Appointment and timing calls for clinics and diagnostic centres in Kolkata and across West Bengal, booked inside your bookable hours.', to: '/solutions/healthcare', link: 'AI receptionist for clinics' },
      { title: 'Property enquiries', body: 'Buyer calls about projects, budgets and site visits in and around Kolkata, qualified before your sales team calls back.', to: '/solutions/real-estate', link: 'AI calling for real estate' },
    ],
    guide: [
      { title: 'Script and tone', body: 'Bengali has its own script, and the register matters: “আপনি” is the polite default for a business call. Write the welcome message in Bengali in that register, keep it short, and avoid reusing a Hindi line as the starting point.' },
      { title: 'Busy seasons', body: 'Festival periods such as Durga Puja can bring a spike in order, delivery and booking calls. Plan your knowledge base for those questions in advance, and set a transfer or callback for anything the agent should not answer.' },
      { title: 'Connect the data first', body: 'Order-status and booking calls are only useful if the agent can read your system. Connect the webhook or integration before launch, then test with real order numbers and with numbers that do not exist, to see how the agent behaves.' },
    ],
    related: [
      { to: '/product/integrations', label: 'Integrations and webhooks' },
      { to: '/product/widget', label: 'Website voice widget' },
      { to: '/compare/ozonetel', label: 'Compare with Ozonetel' },
      { to: '/vs-ivr', label: 'AI voice agent vs IVR' },
      { to: '/languages/odia', label: 'Odia calling agent' },
      { to: '/solutions/support', label: 'Customer support calls' },
    ],
  },
  {
    slug: 'gujarati',
    name: 'Gujarati',
    native: 'ગુજરાતી',
    code: 'gu-IN',
    region: 'Gujarat',
    greeting: 'નમસ્તે',
    blurb: 'Built for Gujarat’s business-heavy call patterns - enquiries, follow-ups, and payment reminders in Gujarati.',
    localUseCases: [
      'Ahmedabad, Surat, Vadodara and Rajkot property and business enquiries',
      'Outstanding-invoice and payment reminders between traders and small businesses',
      'Clinic, school and service calls that arrive in a mix of Gujarati, Hindi and English',
    ],
    callBehaviors: [
      'Opens in Gujarati and follows the caller into Hindi or English without restarting the call',
      'Captures the promised payment date or the preferred visit time as a field',
      'Saves the recording, transcript and summary, and can send a Slack or CRM update',
    ],
    seoFaq: {
      q: 'Is this a Gujarati voice bot or a real AI calling agent?',
      a: 'A real AI calling agent. It listens, understands the request in Gujarati, answers from your approved information, books or transfers the call, and logs everything. It is not a recorded Gujarati IVR menu.',
    },
    extraFaqs: [
      { q: 'Can it follow a call that moves between Gujarati, Hindi and English?', a: 'Yes. Gujarat has many callers who switch between all three in a single call. The agent keeps replying in Gujarati and switches to Hindi or English when the caller does.' },
      { q: 'Does it help with payment follow-ups between businesses?', a: 'Yes. An outbound campaign can remind each contact about a due date, record the date they promise, and respect your calling window and Do-Not-Call list. Your team still decides which reminders to send and what to say.' },
    ],
    sampleExchange: {
      context: 'An outbound invoice reminder to a trader in Surat',
      turns: [
        { speaker: 'Agent', native: 'નમસ્તે મહેશભાઈ, હું Artha બોલું છું. Invoice નંબર 1042 નું payment 20 તારીખે due છે, બસ એની યાદ અપાવવા call કર્યો છે.', gloss: 'Hello Maheshbhai, this is Artha. The payment for invoice number 1042 is due on the 20th; I just called to remind you.' },
        { speaker: 'Caller', native: 'હા, ખબર છે. સોમવાર સુધીમાં transfer કરી દઈશ.', gloss: 'Yes, I know. I’ll transfer it by Monday.' },
        { speaker: 'Agent', native: 'સારું, હું સોમવારની તારીખ નોંધી લઉં છું. બીજું કંઈ હોય તો કહેજો.', gloss: 'Okay, I’m noting down Monday. Let me know if there’s anything else.' },
      ],
      outcome: 'With a post-call field set up for it, the promised date is pulled from the transcript for your accounts team.',
    },
    codeMixing: {
      name: 'Gujarati-Hindi-English mixing',
      body: 'Gujarati callers, especially in Surat and Ahmedabad, often move between Gujarati, Hindi and English in one call. Words like “invoice”, “payment”, “booking” and most numbers arrive in English. The agent keeps replying in Gujarati, follows the mix, and switches fully to Hindi or English if the caller does.',
    },
    regionalCalls: [
      { title: 'Ahmedabad property enquiries', body: 'Buyer calls about projects, budgets and site visits, qualified in Gujarati before your sales team calls back.', to: '/solutions/real-estate/gujarati-ai-calling-agent-ahmedabad-real-estate', link: 'Gujarati real estate calling' },
      { title: 'Payment and invoice reminders', body: 'Outbound reminders for traders, lenders and service businesses, inside your calling window and checked against your Do-Not-Call list.', to: '/solutions/finance', link: 'Collections and EMI reminder calls' },
      { title: 'Order and delivery calls', body: 'Where-is-my-order and return calls for sellers whose customers prefer Gujarati.', to: '/solutions/ecommerce', link: 'E-commerce support calls' },
    ],
    guide: [
      { title: 'Script and politeness', body: 'Gujarati has its own script, and address matters: “ભાઈ”, “બેન” and “સાહેબ” after a name are normal. Write that politeness into the prompt, and keep the welcome message in Gujarati rather than copying the Hindi one.' },
      { title: 'Business-style calls', body: 'Many Gujarat calls are between businesses, so they are short and numbers-heavy: invoice numbers, dates, amounts. Tell the agent how to repeat numbers back, and capture the outcome, such as the promised payment date, as a post-call field.' },
      { title: 'Calling windows and scope', body: 'Set the calling window and Do-Not-Call handling before any outbound run, and keep the agent to your approved facts. Decide which calls transfer to a person, then review the first batch of transcripts before you scale up.' },
    ],
    related: [
      { to: '/demo-calls/hindi-real-estate-lead-qualification', label: 'Sample qualification call (Hindi)' },
      { to: '/product/outbound', label: 'Outbound campaigns' },
      { to: '/product/integrations', label: 'CRM and Slack integrations' },
      { to: '/compare/knowlarity', label: 'Compare with Knowlarity' },
      { to: '/languages/hindi', label: 'Hindi and Hinglish calling' },
      { to: '/ai-ivr', label: 'AI IVR replacement' },
    ],
  },
  {
    slug: 'malayalam',
    name: 'Malayalam',
    native: 'മലയാളം',
    code: 'ml-IN',
    region: 'Kerala',
    greeting: 'നമസ്കാരം',
    blurb: 'Answer Kerala enquiries in Malayalam instead of routing them to an English-only queue.',
    localUseCases: [
      'Kochi, Thiruvananthapuram, Kozhikode and Thrissur enquiries answered in Malayalam',
      'Calls from family members abroad who ask about property, a clinic or a service on behalf of someone in Kerala',
      'Appointment, admission and follow-up calls that arrive outside office hours',
    ],
    callBehaviors: [
      'Opens in Malayalam and follows the caller into English mid-call',
      'Captures budget, location, timeline and preferred visit dates as lead fields',
      'Saves the recording, transcript and summary and passes the lead on to your CRM',
    ],
    seoFaq: {
      q: 'Is this a Malayalam voice bot or a real AI calling agent?',
      a: 'A real AI calling agent. It listens, understands the request in Malayalam, answers from your approved information, books or transfers the call, and logs everything. It is not a recorded Malayalam IVR menu.',
    },
    extraFaqs: [
      { q: 'Can the agent handle callers who speak fast, regional Malayalam?', a: 'Spoken Malayalam varies a lot between north Kerala, Kochi and the south. Run test calls with callers from the regions you serve, and add local names and terms to the prompt or knowledge base where the agent mishears.' },
      { q: 'Can it call or answer calls from overseas numbers?', a: 'That depends on the phone number and telephony provider you connect, not on the language. Check international calling support with your provider, and use the website voice widget for callers who prefer to talk from a browser.' },
    ],
    sampleExchange: {
      context: 'An inbound property call from a caller abroad',
      turns: [
        { speaker: 'Caller', native: 'ഹലോ, കൊച്ചിയിൽ 2BHK flat ഉണ്ടോ? ഞാൻ ദുബായിൽ നിന്നാണ് വിളിക്കുന്നത്.', gloss: 'Hello, is there a 2BHK flat in Kochi? I’m calling from Dubai.' },
        { speaker: 'Agent', native: 'നമസ്കാരം! ഉണ്ട്, കാക്കനാട് ഭാഗത്ത് 2BHK ഓപ്ഷനുകളുണ്ട്. നിങ്ങളുടെ budget എത്രയാണ്?', gloss: 'Hello! Yes, there are 2BHK options in the Kakkanad area. What is your budget?' },
        { speaker: 'Caller', native: 'ഏകദേശം 70 lakh. അടുത്ത മാസം നാട്ടിൽ വരുന്നുണ്ട്, അപ്പോൾ site visit നടക്കുമോ?', gloss: 'About 70 lakh. I’m coming home next month; can we do a site visit then?' },
        { speaker: 'Agent', native: 'തീർച്ചയായും. ഏത് തീയതികളിൽ നാട്ടിൽ ഉണ്ടാകും എന്ന് പറയാമോ? ആ ദിവസങ്ങളിലെ slot ഞാൻ നോക്കാം.', gloss: 'Certainly. Could you tell me which dates you will be in Kerala? I’ll check the slots on those days.' },
      ],
      outcome: 'Budget, location and the dates the caller will be in Kerala are saved on the call, so the sales team can book a visit that fits the trip.',
    },
    codeMixing: {
      name: 'Manglish',
      body: 'Malayalam callers mix in English constantly: “flat”, “budget”, “site visit”, “appointment” and nearly every number. The agent understands those English words inside a Malayalam sentence, keeps replying in Malayalam, and switches to English if the caller does.',
    },
    regionalCalls: [
      { title: 'Property enquiries from Kerala and abroad', body: 'Buyer calls about flats and villas, qualified on budget, location and travel dates before your sales team calls back.', to: '/solutions/real-estate', link: 'AI calling for real estate' },
      { title: 'Clinic and hospital appointments', body: 'Appointment and timing calls for clinics and diagnostic centres, booked into your real availability.', to: '/solutions/healthcare', link: 'AI receptionist for clinics' },
      { title: 'Support and service lines', body: 'Status and how-to calls from customers who would rather not switch to English, with a transfer to a person when needed.', to: '/solutions/support', link: 'Customer support calls' },
    ],
    guide: [
      { title: 'Script', body: 'Malayalam script has many joined letters, so long words are easy to garble in a pasted prompt. Write the welcome message in Malayalam, keep sentences short, and read the transcript of your first test calls to check the spelling came out as intended.' },
      { title: 'Regional speech', body: 'Spoken Malayalam differs between Malabar, central Kerala and the south, in vocabulary and speed. Test with callers from each region you serve, and put local place names, hospital names and project names in the knowledge base.' },
      { title: 'Callers from abroad', body: 'Callers outside Kerala may ring at odd local hours and want a visit on specific dates. Capture those dates and the contact preference as post-call fields, and send a Slack or CRM follow-up so the team can reply when they are back.' },
    ],
    related: [
      { to: '/product/widget', label: 'Website voice widget' },
      { to: '/product/integrations', label: 'CRM and Slack integrations' },
      { to: '/product/knowledge-base', label: 'Knowledge base' },
      { to: '/compare/exotel', label: 'Compare with Exotel' },
      { to: '/languages/tamil', label: 'Tamil calling agent' },
      { to: '/solutions', label: 'All industries' },
    ],
  },
  {
    slug: 'punjabi',
    readMore: { lead: 'Many Punjabi speakers call businesses in the UK and Canada. Read our guide to', to: '/resources/blog/multilingual-ai-receptionist-hindi-punjabi-english', label: 'answering Punjabi, Hindi and English callers with one AI receptionist' },
    name: 'Punjabi',
    native: 'ਪੰਜਾਬੀ',
    code: 'pa-IN',
    region: 'Punjab',
    greeting: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ',
    blurb: 'Punjabi-speaking customers, handled in Punjabi - including mixed Punjabi-Hindi speech.',
    localUseCases: [
      'Enquiry and booking calls from Punjabi-speaking customers in Punjab, Chandigarh and Delhi NCR',
      'Study-abroad, coaching and clinic appointment lines that fill up outside office hours',
      'Outbound reminders and follow-ups where the customer answers in Punjabi, Hindi or both',
    ],
    callBehaviors: [
      'Opens in Punjabi and follows the caller into Hindi or English mid-call',
      'Books appointments inside your bookable hours, or takes a callback request',
      'Saves the recording, transcript, summary and any fields you ask it to capture',
    ],
    seoFaq: {
      q: 'Is this a Punjabi voice bot or a real AI calling agent?',
      a: 'A real AI calling agent. It listens, understands the request in Punjabi, answers from your approved information, books or transfers the call, and logs everything. It is not a recorded Punjabi IVR menu.',
    },
    sampleExchange: {
      context: 'An inbound call to a study-abroad consultancy',
      turns: [
        { speaker: 'Caller', native: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ, Canada ਦੇ study visa ਲਈ counselling ਕਦੋਂ ਹੋ ਸਕਦੀ ਹੈ?', gloss: 'Hello, when can I get counselling for a Canada study visa?' },
        { speaker: 'Agent', native: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਕੱਲ੍ਹ ਸਵੇਰੇ 11 ਵਜੇ ਦਾ slot ਖਾਲੀ ਹੈ। ਤੁਹਾਡਾ IELTS ਹੋ ਗਿਆ?', gloss: 'Hello! The slot is free tomorrow morning at 11. Have you done your IELTS?' },
        { speaker: 'Caller', native: 'ਹਾਂ ਜੀ, 6.5 bands ਆਏ ਨੇ। 11 ਵਜੇ ਠੀਕ ਹੈ ਜੀ।', gloss: 'Yes, I got 6.5 bands. 11 o’clock is fine.' },
        { speaker: 'Agent', native: 'ਵਧੀਆ। ਆਪਣਾ ਨਾਂ ਦੱਸ ਦਿਓ, ਮੈਂ ਕੱਲ੍ਹ 11 ਵਜੇ ਦੀ counselling book ਕਰ ਦਿੰਦੀ ਹਾਂ।', gloss: 'Great. Tell me your name and I’ll book the counselling for 11 tomorrow.' },
      ],
      outcome: 'The appointment lands in Appointments inside the consultancy’s bookable hours. With a post-call field set up for it, the IELTS score is saved for the counsellor.',
    },
    codeMixing: {
      name: 'Punjabi-English mixing',
      body: 'Punjabi callers carry English words into almost every call: “visa”, “IELTS”, “EMI”, “booking” and numbers. Many also slip into Hindi, especially around Chandigarh and Delhi NCR. The agent understands those words inside a Punjabi sentence, keeps replying in Punjabi, and switches to Hindi or English if the caller does.',
    },
    regionalCalls: [
      { title: 'Study-abroad and coaching enquiries', body: 'Course, intake and counselling questions answered from your approved information, with the appointment booked on the call.', to: '/product/inbound', link: 'Inbound call answering' },
      { title: 'Payment and EMI reminders', body: 'Outbound reminders for lenders and dealers in Punjab and Chandigarh, inside your calling window and checked against your Do-Not-Call list.', to: '/solutions/finance', link: 'Collections and EMI reminder calls' },
      { title: 'Property enquiries', body: 'Buyer calls about projects in Mohali, Zirakpur or Ludhiana, qualified on budget, location and timeline before your sales team calls back.', to: '/solutions/real-estate', link: 'AI calling for real estate' },
    ],
  },
  {
    slug: 'odia',
    name: 'Odia',
    native: 'ଓଡ଼ିଆ',
    code: 'od-IN',
    region: 'Odisha',
    greeting: 'ନମସ୍କାର',
    blurb: 'Odia coverage, so Odisha callers aren’t the ones who always get the English fallback.',
    localUseCases: [
      'Bhubaneswar, Cuttack and Odisha enquiries from callers who would rather speak Odia than navigate an English or Hindi menu',
      'Admissions, coaching and clinic lines that get calls in the evening and on weekends',
      'Outbound reminders and follow-ups for lenders, service providers and local businesses',
    ],
    callBehaviors: [
      'Opens in Odia and follows the caller into English or Hindi mid-call',
      'Answers from your approved information and takes a callback request when it should not guess',
      'Saves the recording, transcript, summary and any fields you ask it to capture',
    ],
    seoFaq: {
      q: 'Is this an Odia voice bot or a real AI calling agent?',
      a: 'A real AI calling agent. It listens, understands the request in Odia, answers from your approved information, books or transfers the call, and logs everything. It is not a recorded Odia IVR menu.',
    },
    extraFaqs: [
      { q: 'Does Odia work on both phone calls and the website widget?', a: 'Yes. The same agent can answer phone calls and website voice-widget conversations in Odia, and each conversation is saved with its transcript and summary.' },
      { q: 'What if the agent should not answer a question?', a: 'Keep the agent to your approved knowledge base and set it to offer a callback or a transfer to a person for anything outside it. Check these cases in test calls before launch.' },
    ],
    sampleExchange: {
      context: 'An inbound call to a coaching institute in Bhubaneswar',
      turns: [
        { speaker: 'Caller', native: 'ନମସ୍କାର, ଆପଣଙ୍କ ଇନଷ୍ଟିଚ୍ୟୁଟରେ ନୂଆ batch କେବେ ଆରମ୍ଭ ହେବ?', gloss: 'Hello, when does the new batch start at your institute?' },
        { speaker: 'Agent', native: 'ନମସ୍କାର! ନୂଆ batch ଆସନ୍ତା ସୋମବାରରୁ ଆରମ୍ଭ ହେବ। ଆପଣ କୋଉ class ପାଇଁ ପଚାରୁଛନ୍ତି?', gloss: 'Hello! The new batch starts from next Monday. Which class are you asking about?' },
        { speaker: 'Caller', native: 'Class 10 ପାଇଁ। କିଛି demo class ଅଛି କି?', gloss: 'For class 10. Is there any demo class?' },
        { speaker: 'Agent', native: 'ହଁ, ଆସନ୍ତାକାଲି ସକାଳ 10ଟାରେ demo class ଅଛି। ଆପଣଙ୍କ ନାଁ କହିବେ, ମୁଁ book କରିଦେବି।', gloss: 'Yes, there is a demo class tomorrow at 10 a.m. Tell me your name, I will book it.' },
      ],
      outcome: 'The class, the demo slot and the caller’s name are saved on the call, so the admissions team can follow up with the right batch details.',
    },
    codeMixing: {
      name: 'Odia-English mixing',
      body: 'Odia callers often drop English words into a call: “batch”, “class”, “appointment”, “EMI” and most numbers. Hindi also turns up, especially with callers who have worked outside Odisha. The agent understands those words inside an Odia sentence, keeps replying in Odia, and switches to English or Hindi if the caller does.',
    },
    regionalCalls: [
      { title: 'Admissions and coaching enquiries', body: 'Batch, fee and timing questions answered from your approved information, with demo classes or counselling booked on the call.', to: '/product/inbound', link: 'Inbound call answering' },
      { title: 'Clinic and diagnostic bookings', body: 'Appointment and timing calls for clinics in Bhubaneswar, Cuttack and beyond, booked inside your bookable hours.', to: '/solutions/healthcare', link: 'AI receptionist for clinics' },
      { title: 'Property and project enquiries', body: 'Buyer calls about plots and flats, qualified on budget, location and timeline before your sales team calls back.', to: '/solutions/real-estate', link: 'AI calling for real estate' },
    ],
    guide: [
      { title: 'Script', body: 'Odia has its own rounded script, so a prompt or welcome line pasted from Hindi will not work. Write the welcome message in Odia, keep it short, and check how it reads on the dashboard and in the transcript before a customer hears it.' },
      { title: 'Dialects across Odisha', body: 'Speech in Sambalpur and western Odisha, coastal Odisha and the south differs in words and rhythm. If your callers come from one region, test with callers from that region and add local place names and product names to the knowledge base.' },
      { title: 'Plan for a person', body: 'Do not skip test calls for a language your team may not speak itself. Run a set covering noisy audio, interruptions and mixed English, set a transfer or callback for anything the agent cannot answer, and review the first week of transcripts.' },
    ],
    related: [
      { to: '/ai-ivr', label: 'AI IVR for India' },
      { to: '/vs-ivr', label: 'AI voice agent vs IVR' },
      { to: '/product/widget', label: 'Website voice widget' },
      { to: '/product/knowledge-base', label: 'Knowledge base' },
      { to: '/solutions/support', label: 'Customer support calls' },
      { to: '/languages/bengali', label: 'Bengali calling agent' },
    ],
  },
]

// ---- Global languages (feeds /languages) ----
//
// The 10 entries above are the native Indian languages, which every voice
// speaks. These are what the Gemini multilingual voices (Mira/Arin) add on
// top — generated from agent/voice_catalog.py's GOOGLE_TTS_LANGUAGES so the
// marketing list cannot drift from what the agent will actually accept.
// `ga` marks Google's generally-available locales; the rest are preview.
// `native` is empty for the handful whose endonym we did not want to guess —
// render the English name in that case rather than a wrong script.

export interface GlobalLanguage {
  name: string
  native: string
  code: string
}

/** The languages beyond the ten Indian ones and English, taken from Google's published
 * Gemini Live API list (99 languages in all: ten Indian + English + these). `code`
 * is the language code Google uses. Source: ai.google.dev/gemini-api/docs/live-guide */
export const GLOBAL_LANGUAGES: GlobalLanguage[] = [
  { name: "Afrikaans", native: "Afrikaans", code: "af" },
  { name: "Akan", native: "Akan", code: "ak" },
  { name: "Albanian", native: "Shqip", code: "sq" },
  { name: "Amharic", native: "አማርኛ", code: "am" },
  { name: "Arabic", native: "العربية", code: "ar" },
  { name: "Armenian", native: "Հայերեն", code: "hy" },
  { name: "Assamese", native: "অসমীয়া", code: "as" },
  { name: "Azerbaijani", native: "Azərbaycanca", code: "az" },
  { name: "Basque", native: "Euskara", code: "eu" },
  { name: "Belarusian", native: "Беларуская", code: "be" },
  { name: "Bosnian", native: "Bosanski", code: "bs" },
  { name: "Bulgarian", native: "Български", code: "bg" },
  { name: "Burmese", native: "မြန်မာ", code: "my" },
  { name: "Catalan", native: "Català", code: "ca" },
  { name: "Cebuano", native: "Cebuano", code: "ceb" },
  { name: "Chinese (Simplified)", native: "中文 (简体)", code: "zh-Hans" },
  { name: "Chinese (Traditional)", native: "中文 (繁體)", code: "zh-Hant" },
  { name: "Croatian", native: "Hrvatski", code: "hr" },
  { name: "Czech", native: "Čeština", code: "cs" },
  { name: "Danish", native: "Dansk", code: "da" },
  { name: "Dutch", native: "Nederlands", code: "nl" },
  { name: "Estonian", native: "Eesti", code: "et" },
  { name: "Faroese", native: "Føroyskt", code: "fo" },
  { name: "Filipino", native: "Filipino", code: "fil" },
  { name: "Finnish", native: "Suomi", code: "fi" },
  { name: "French", native: "Français", code: "fr" },
  { name: "Galician", native: "Galego", code: "gl" },
  { name: "Georgian", native: "ქართული", code: "ka" },
  { name: "German", native: "Deutsch", code: "de" },
  { name: "Greek", native: "Ελληνικά", code: "el" },
  { name: "Hausa", native: "Hausa", code: "ha" },
  { name: "Hebrew", native: "עברית", code: "he" },
  { name: "Hungarian", native: "Magyar", code: "hu" },
  { name: "Icelandic", native: "Íslenska", code: "is" },
  { name: "Indonesian", native: "Bahasa Indonesia", code: "id" },
  { name: "Irish", native: "Gaeilge", code: "ga" },
  { name: "Italian", native: "Italiano", code: "it" },
  { name: "Japanese", native: "日本語", code: "ja" },
  { name: "Kazakh", native: "Қазақша", code: "kk" },
  { name: "Khmer", native: "ខ្មែរ", code: "km" },
  { name: "Kinyarwanda", native: "Kinyarwanda", code: "rw" },
  { name: "Korean", native: "한국어", code: "ko" },
  { name: "Kurdish", native: "Kurdî", code: "ku" },
  { name: "Kyrgyz", native: "Кыргызча", code: "ky" },
  { name: "Lao", native: "ລາວ", code: "lo" },
  { name: "Latvian", native: "Latviešu", code: "lv" },
  { name: "Lithuanian", native: "Lietuvių", code: "lt" },
  { name: "Macedonian", native: "Македонски", code: "mk" },
  { name: "Malay", native: "Bahasa Melayu", code: "ms" },
  { name: "Maltese", native: "Malti", code: "mt" },
  { name: "Maori", native: "Māori", code: "mi" },
  { name: "Mongolian", native: "Монгол", code: "mn" },
  { name: "Nepali", native: "नेपाली", code: "ne" },
  { name: "Norwegian", native: "Norsk", code: "no" },
  { name: "Oromo", native: "Afaan Oromoo", code: "om" },
  { name: "Pashto", native: "پښتو", code: "ps" },
  { name: "Persian", native: "فارسی", code: "fa" },
  { name: "Polish", native: "Polski", code: "pl" },
  { name: "Portuguese (Brazil)", native: "Português (Brasil)", code: "pt-BR" },
  { name: "Portuguese (Portugal)", native: "Português (Portugal)", code: "pt-PT" },
  { name: "Quechua", native: "Runasimi", code: "qu" },
  { name: "Romanian", native: "Română", code: "ro" },
  { name: "Romansh", native: "Rumantsch", code: "rm" },
  { name: "Russian", native: "Русский", code: "ru" },
  { name: "Serbian", native: "Српски", code: "sr" },
  { name: "Sindhi", native: "سنڌي", code: "sd" },
  { name: "Sinhala", native: "සිංහල", code: "si" },
  { name: "Slovak", native: "Slovenčina", code: "sk" },
  { name: "Slovenian", native: "Slovenščina", code: "sl" },
  { name: "Somali", native: "Soomaali", code: "so" },
  { name: "Southern Sotho", native: "Sesotho", code: "st" },
  { name: "Spanish", native: "Español", code: "es" },
  { name: "Swahili", native: "Kiswahili", code: "sw" },
  { name: "Swedish", native: "Svenska", code: "sv" },
  { name: "Tajik", native: "Тоҷикӣ", code: "tg" },
  { name: "Thai", native: "ไทย", code: "th" },
  { name: "Tswana", native: "Setswana", code: "tn" },
  { name: "Turkish", native: "Türkçe", code: "tr" },
  { name: "Turkmen", native: "Türkmençe", code: "tk" },
  { name: "Ukrainian", native: "Українська", code: "uk" },
  { name: "Urdu", native: "اردو", code: "ur" },
  { name: "Uzbek", native: "Oʻzbekcha", code: "uz" },
  { name: "Vietnamese", native: "Tiếng Việt", code: "vi" },
  { name: "Welsh", native: "Cymraeg", code: "cy" },
  { name: "Western Frisian", native: "Frysk", code: "fy" },
  { name: "Wolof", native: "Wolof", code: "wo" },
  { name: "Yoruba", native: "Yorùbá", code: "yo" },
  { name: "Zulu", native: "isiZulu", code: "zu" },
]

/** The regional locales the live demo can speak today. The picker on /languages offers
 * these, so it never offers a language that would fail to connect. */
export const DEMO_GLOBAL_LOCALES: { name: string; native: string; code: string; ga: boolean }[] = [
  { name: "Afrikaans", native: "Afrikaans", code: "af-ZA", ga: false },
  { name: "Albanian", native: "Shqip", code: "sq-AL", ga: false },
  { name: "Amharic", native: "አማርኛ", code: "am-ET", ga: false },
  { name: "Arabic (Egypt)", native: "العربية", code: "ar-EG", ga: true },
  { name: "Arabic (World)", native: "العربية", code: "ar-001", ga: false },
  { name: "Armenian", native: "Հայերեն", code: "hy-AM", ga: false },
  { name: "Azerbaijani", native: "", code: "az-AZ", ga: false },
  { name: "Basque", native: "Euskara", code: "eu-ES", ga: false },
  { name: "Belarusian", native: "Беларуская", code: "be-BY", ga: false },
  { name: "Bulgarian", native: "Български", code: "bg-BG", ga: false },
  { name: "Burmese", native: "မြန်မာ", code: "my-MM", ga: false },
  { name: "Catalan", native: "Català", code: "ca-ES", ga: false },
  { name: "Cebuano", native: "", code: "ceb-PH", ga: false },
  { name: "Chinese (Mandarin)", native: "中文", code: "cmn-CN", ga: false },
  { name: "Chinese (Taiwan)", native: "中文 (台灣)", code: "cmn-tw", ga: false },
  { name: "Croatian", native: "Hrvatski", code: "hr-HR", ga: false },
  { name: "Czech", native: "Čeština", code: "cs-CZ", ga: false },
  { name: "Danish", native: "Dansk", code: "da-DK", ga: false },
  { name: "Dutch", native: "Nederlands", code: "nl-NL", ga: true },
  { name: "English (Australia)", native: "English (AU)", code: "en-AU", ga: false },
  { name: "English (UK)", native: "English (UK)", code: "en-GB", ga: false },
  { name: "English (US)", native: "English (US)", code: "en-US", ga: true },
  { name: "Estonian", native: "Eesti", code: "et-EE", ga: false },
  { name: "Filipino", native: "Filipino", code: "fil-PH", ga: false },
  { name: "Finnish", native: "Suomi", code: "fi-FI", ga: false },
  { name: "French", native: "Français", code: "fr-FR", ga: true },
  { name: "French (Canada)", native: "Français (CA)", code: "fr-CA", ga: false },
  { name: "Galician", native: "Galego", code: "gl-ES", ga: false },
  { name: "Georgian", native: "ქართული", code: "ka-GE", ga: false },
  { name: "German", native: "Deutsch", code: "de-DE", ga: true },
  { name: "Greek", native: "Ελληνικά", code: "el-GR", ga: false },
  { name: "Hebrew", native: "עברית", code: "he-IL", ga: false },
  { name: "Hungarian", native: "Magyar", code: "hu-HU", ga: false },
  { name: "Icelandic", native: "Íslenska", code: "is-IS", ga: false },
  { name: "Indonesian", native: "Bahasa Indonesia", code: "id-ID", ga: true },
  { name: "Italian", native: "Italiano", code: "it-IT", ga: true },
  { name: "Japanese", native: "日本語", code: "ja-JP", ga: true },
  { name: "Korean", native: "한국어", code: "ko-KR", ga: true },
  { name: "Lao", native: "ລາວ", code: "lo-LA", ga: false },
  { name: "Latvian", native: "Latviešu", code: "lv-LV", ga: false },
  { name: "Lithuanian", native: "Lietuvių", code: "lt-LT", ga: false },
  { name: "Macedonian", native: "Македонски", code: "mk-MK", ga: false },
  { name: "Malay", native: "Bahasa Melayu", code: "ms-MY", ga: false },
  { name: "Mongolian", native: "Монгол", code: "mn-MN", ga: false },
  { name: "Nepali", native: "नेपाली", code: "ne-NP", ga: false },
  { name: "Norwegian (Bokmal)", native: "Norsk", code: "nb-NO", ga: false },
  { name: "Norwegian (Nynorsk)", native: "Nynorsk", code: "nn-NO", ga: false },
  { name: "Pashto", native: "پښتو", code: "ps-AF", ga: false },
  { name: "Persian", native: "فارسی", code: "fa-IR", ga: false },
  { name: "Polish", native: "Polski", code: "pl-PL", ga: true },
  { name: "Portuguese (Brazil)", native: "Português", code: "pt-BR", ga: true },
  { name: "Portuguese (Portugal)", native: "Português", code: "pt-PT", ga: false },
  { name: "Romanian", native: "Română", code: "ro-RO", ga: true },
  { name: "Russian", native: "Русский", code: "ru-RU", ga: true },
  { name: "Serbian", native: "Српски", code: "sr-RS", ga: false },
  { name: "Sindhi", native: "سنڌي", code: "sd-IN", ga: false },
  { name: "Sinhala", native: "සිංහල", code: "si-LK", ga: false },
  { name: "Slovak", native: "Slovenčina", code: "sk-SK", ga: false },
  { name: "Slovenian", native: "Slovenščina", code: "sl-SI", ga: false },
  { name: "Spanish", native: "Español", code: "es-ES", ga: true },
  { name: "Spanish (Latin America)", native: "Español (LatAm)", code: "es-419", ga: false },
  { name: "Spanish (Mexico)", native: "Español (MX)", code: "es-MX", ga: false },
  { name: "Swahili", native: "Kiswahili", code: "sw-KE", ga: false },
  { name: "Swedish", native: "Svenska", code: "sv-SE", ga: false },
  { name: "Thai", native: "ไทย", code: "th-TH", ga: true },
  { name: "Turkish", native: "Türkçe", code: "tr-TR", ga: true },
  { name: "Ukrainian", native: "Українська", code: "uk-UA", ga: true },
  { name: "Urdu", native: "اردو", code: "ur-PK", ga: false },
  { name: "Vietnamese", native: "Tiếng Việt", code: "vi-VN", ga: true },
]

// ---- Integrations directory (feeds /integrations) ----
//
// Grounded in _SEED_INTEGRATIONS in server/calls_db.py - every entry here
// is a connection an operator can actually configure in the dashboard
// today. `viaWebhook` entries aren't bespoke integrations; they're things
// the generic webhook reaches, and are labelled as such rather than
// implying a first-class native connector.

export interface IntegrationEntry {
  name: string
  category: string
  desc: string
  /** True when this is reached through the generic webhook, not a native connector. */
  viaWebhook?: boolean
}

export const INTEGRATION_DIRECTORY: IntegrationEntry[] = [
  { name: 'ArthaLeads CRM', category: 'CRM', desc: 'Native connector. Every qualified lead, with the full transcript, pushed on call end - paste a connection key, no URL setup.' },
  { name: 'Zoho CRM', category: 'CRM', desc: 'Native connector. Connect with Zoho and each caller who leaves a phone or email becomes a lead in your Leads module; repeat callers update their lead.' },
  { name: 'Slack', category: 'Notifications', desc: 'Native connector. Choose a Slack channel once, then receive every qualified lead with the transcript.' },
  { name: 'Google Sheets', category: 'Reporting', desc: 'Native connector. Sign in with Google and every caller who leaves a phone or email becomes a row in a leads sheet created in your Drive.' },
  { name: 'CRM / Webhook', category: 'Developer', desc: 'Native connector. Post every call event as JSON to any URL you control, with an optional token.' },
  { name: 'Zapier', category: 'Automation', desc: 'Point the lead webhook at a Zapier catch hook to pass calls on to the apps Zapier connects to.', viaWebhook: true },
  { name: 'n8n', category: 'Automation', desc: 'Self-hosted automation - same JSON payload, your own infrastructure.', viaWebhook: true },
  { name: 'Make', category: 'Automation', desc: 'Route call outcomes into Make scenarios for multi-step workflows.', viaWebhook: true },
  { name: 'Salesforce, HubSpot and others', category: 'CRM', desc: 'Any CRM that accepts an inbound webhook - or use the full API for a deeper two-way sync.', viaWebhook: true },
]

// ---- /integrations page depth ----
//
// Every claim here is checked against server/calls_db.py (_SEED_INTEGRATIONS,
// INTEGRATION_EVENTS, INTEGRATION_FIELDS), server/integrations_dispatch.py and
// web-demo/src/pages/IntegrationDetail.tsx. There is no Google Calendar
// integration - appointments use the calendar built into Vistrow Voice.
// No prices or credit figures: those live on /pricing.

export const INTEGRATIONS_PAGE: { guideSections: GuideSection[]; faqs: Faq[] } = {
  guideSections: [
    {
      eyebrow: 'How it works',
      title: 'From the end of a call to a record in your tools.',
      items: [
        { icon: 'extension', title: '1. Connect from the dashboard', body: 'Open Integrations, click Connect on a card and follow the steps: sign in with Google or Zoho, pick a Slack channel, or paste a URL or key.', to: '/help/integrations/connect-integrations', link: 'Send leads to your CRM and tools' },
        { icon: 'send', title: '2. Send a test', body: 'Use Send test where offered. A sheet gets a row marked as a test, Zoho gets a test lead, Slack gets a sample lead, and a webhook receives a sample payload.' },
        { icon: 'call_end', title: '3. A call finishes', body: 'Every connected integration receives the lead, with the transcript and the fields the agent captured. Callers who left no phone number or email are skipped on purpose.' },
        { icon: 'verified', title: '4. Check delivery', body: 'Each card shows its status, last sync and any error, and an Activity tab lists recent deliveries. If a destination was down, re-send from the call’s details.', to: '/help/calls/find-a-call', link: 'Find a call' },
      ],
    },
    {
      eyebrow: 'What each integration does',
      title: 'Five connections you can set up today.',
      intro: 'Each card on this page is a real connection in the dashboard. Others are reached through the generic webhook, and labelled that way above.',
      items: [
        { icon: 'contacts', title: 'ArthaLeads CRM', body: 'Paste the connection key from ArthaLeads. One complete record per call arrives when the call ends, with transcript and recording. It needs a name and a phone number, and you can also choose which new ArthaLeads leads your agents should call.' },
        { icon: 'contacts', title: 'Zoho CRM', body: 'Connect with a Zoho CRM admin account and approve access to Leads. Each caller who leaves a phone or email becomes a lead, matched on phone first and then email, so a repeat caller updates their existing lead.' },
        { icon: 'table_chart', title: 'Google Sheets', body: 'Sign in with Google and a sheet called Vistrow Voice, Leads is created in your Drive, one tab per agent. Access is limited to files Vistrow Voice created, not the rest of your Drive. You can hide columns such as the recording.' },
        { icon: 'chat', title: 'Slack', body: 'Click Connect Slack, choose the channel, and lead alerts post there. You choose which events post and which fields are included.' },
        { icon: 'bolt', title: 'Instant lead follow-up', body: 'Push new leads from ArthaLeads, or post them from any source to your Instant Lead Follow-up URL. Each lead is added to Contacts and called by your instant follow-up campaign, within your calling window and Do-Not-Call rules.', to: '/help/integrations/instant-lead-follow-up', link: 'Instant lead follow-up' },
        { icon: 'webhook', title: 'CRM or webhook', body: 'Paste any URL that accepts a JSON POST. An optional token is sent in the body. The receiver has about five seconds to answer, so respond quickly and do heavy work afterwards.' },
      ],
    },
    {
      eyebrow: 'What gets sent',
      title: 'You choose the events and the fields.',
      intro: 'Webhook, Slack and a sheet connected by Apps Script URL can send up to four events. Zoho, ArthaLeads and the Sign in with Google sheet always send one record per caller at the end of the call.',
      items: [
        { icon: 'call_end', title: 'End of call', body: 'One record when the call ends, with the summary, details and recording link.' },
        { icon: 'edit_note', title: 'Lead details during the call', body: 'Each time the agent saves new details, such as name, need or budget, while the caller is still on the line.' },
        { icon: 'event_available', title: 'Appointment booked', body: 'When the agent books a slot in the Appointments calendar built into Vistrow Voice. There is no separate Google Calendar connection.', to: '/help/appointments/manage-appointments', link: 'Bookings and availability' },
        { icon: 'phone_callback', title: 'Callback requested', body: 'When the caller asks to be called back later.' },
        { icon: 'tune', title: 'Fields you can leave out', body: 'For webhook, Slack and Sheets you can drop name, phone, email, company, channel, agent, language, call length, details, transcript, page, recording or call ID. At least one of name, phone or email stays so each lead can be identified.' },
        { icon: 'route', title: 'Per-agent routing', body: 'By default an agent delivers to every connected integration. Limit one agent to specific ones, or give it its own webhook URL for its lead, appointment and callback events.', to: '/help/agents/agent-webhook-crm-memory', link: 'Webhook and CRM routing' },
      ],
      note: 'Integrations that deliver leads automatically depend on your plan. The pricing page lists what each plan includes.',
    },
    {
      eyebrow: 'Choosing one',
      title: 'Which connection fits your team.',
      items: [
        { icon: 'apartment', title: 'Sales teams in a CRM', body: 'Use Zoho CRM or ArthaLeads for a direct connection, or the webhook for any other CRM. Leads arrive with the transcript, so the advisor reads the call before dialling.', to: '/solutions/real-estate', link: 'Real estate' },
        { icon: 'support_agent', title: 'Support and operations', body: 'Post escalations to Slack, log calls in a sheet, or send each call to a helpdesk that accepts a webhook, directly or through an automation tool.', to: '/solutions/support', link: 'Customer support' },
        { icon: 'api', title: 'Developers', body: 'Pull agents, calls, contacts and analytics through the API on your own schedule rather than waiting for pushes.', to: '/product/integrations', link: 'Product: integrations' },
      ],
    },
  ],
  faqs: [
    { q: 'Which tools have a native connection?', a: 'ArthaLeads CRM, Zoho CRM, Slack, Google Sheets and a generic webhook. Zapier, n8n, Make, Salesforce and HubSpot are reached through that webhook or the API.' },
    { q: 'Is there a Google Calendar integration?', a: 'No. Agents book appointments in the calendar built into Vistrow Voice, using the hours, slot length and blackout dates you set. To pass a booking elsewhere, send the appointment-booked event to a webhook.' },
    { q: 'Does Google Sheets get access to my whole Drive?', a: 'No. The connection is limited to files Vistrow Voice creates, which is the one leads sheet, not your other spreadsheets or documents.' },
    { q: 'Can I choose which fields are shared?', a: 'Yes for webhook, Slack and Sheets. Leave out any field except that at least one of name, phone or email must stay.' },
    { q: 'What happens if my CRM is down?', a: 'The failure shows on the integration card and the dashboard flags it. You get an email too if you enabled that in your preferences. Re-send the delivery from the call’s details once it is fixed.' },
    { q: 'Do I need a developer?', a: 'Not for Slack, Sheets, Zoho or ArthaLeads, which are sign-in or paste-a-key setups. A webhook needs an endpoint that accepts JSON, which a developer or an automation tool can provide.' },
  ],
}

// ---- Changelog (feeds /changelog) ----
//
// Curated from real shipped work, newest first. Keep it honest: only list
// things that actually went out, and describe them in customer terms
// (what changed for them), never in commit-message terms. Never name the
// underlying AI vendors here - same reason as WORKS_WITH above.

export interface ChangelogEntry {
  date: string
  title: string
  body: string
  tag: 'New' | 'Improved' | 'Fixed'
}

export const CHANGELOG: ChangelogEntry[] = [
  { date: '29 July 2026', tag: 'Improved', title: 'Faster first hello on phone calls', body: 'The agent’s opening line is now prepared while the call is still connecting, so callers hear it the moment they pick up instead of a few seconds of silence.' },
  { date: '28 July 2026', tag: 'New', title: 'New voices: Tara and Bunty', body: 'Two more voices added to the catalog - one female, one male - both previewable in the agent builder before you publish.' },
  { date: '28 July 2026', tag: 'Improved', title: 'Steadier language switching mid-call', body: 'The agent now waits for a clearer signal before switching languages, so a single ambiguous word no longer flips the whole conversation.' },
  { date: '27 July 2026', tag: 'Improved', title: 'Better gender agreement in Indian languages', body: 'Hindi, Marathi, Gujarati, and Punjabi replies now consistently match the grammatical gender of the selected voice, turn after turn.' },
  { date: '25 July 2026', tag: 'New', title: 'Native appointment booking', body: 'Agents check real availability and book appointments directly on the call, with your own availability rules - no external calendar account needed.' },
  { date: '23 July 2026', tag: 'New', title: 'Personalised campaign calls', body: 'Outbound campaigns can use {{variables}} like a contact’s name or due date, so every call sounds tailored rather than scripted.' },
  { date: '20 July 2026', tag: 'New', title: 'Call recordings on every call', body: 'Every call is recorded, stored, and playable from the call detail page, alongside the full combined transcript.' },
  { date: '19 July 2026', tag: 'New', title: 'Compliance controls', body: 'A Do-Not-Call registry, enforced calling windows, and configurable data retention - all per workspace.' },
]
