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

/** Detail-page content per product, keyed by route. */
export const PRODUCT_DETAIL: Record<
  string,
  { eyebrow: string; headline: string; subhead: string; features: FeatureRow[]; faqs: Faq[] }
> = {
  '/product/agents': {
    eyebrow: 'Product · Voice Agents',
    headline: 'Build a voice agent in minutes.',
    subhead:
      'A no-code builder for real-time AI phone agents. Set the persona, prompt, voice and language - publish, and Artha starts taking calls.',
    features: [
      { icon: 'translate', title: 'Multilingual', body: 'Speaks 10 Indian languages plus English, including natural Hinglish, and switches mid-call with the caller — plus 76 more worldwide on the global voices.' },
      { icon: 'menu_book', title: 'Grounded answers', body: 'Ties responses to your knowledge base with strict-mode RAG, so the agent never makes things up.' },
      { icon: 'swap_calls', title: 'Human handoff', body: 'Escalates to a live person with full context when a call needs a human touch.' },
      { icon: 'analytics', title: 'Analytics & transcripts', body: 'Every call is transcribed, scored, and searchable across channels and agents.' },
    ],
    faqs: [
      { q: 'Do I need to write code to build an agent?', a: 'No - the builder is entirely no-code. Set the persona, prompt, voice, and language, then publish.' },
      { q: 'Which voices can my agent use?', a: 'A curated set of Sarvam and ElevenLabs voices across Indian languages and English, previewable before you publish.' },
      { q: 'Can I test the agent before it goes live?', a: 'Yes - talk to any agent in the browser instantly, with the exact prompt and voice it will use on real calls.' },
    ],
  },
  '/product/inbound': {
    eyebrow: 'Product · Inbound Calling',
    headline: 'Answer every call, day or night.',
    subhead:
      'Point your number at Vistrow and Artha picks up on the first ring - qualifying, answering, and routing without hold music.',
    features: [
      { icon: 'schedule', title: '24/7 pickup', body: 'No missed calls, no voicemail - every caller reaches a helpful agent instantly.' },
      { icon: 'fact_check', title: 'Auto-qualification', body: 'Captures intent, budget, and contact details, then scores the lead automatically.' },
      { icon: 'route', title: 'Smart routing', body: 'Sends the right calls to the right team or agent based on what the caller needs.' },
      { icon: 'sync', title: 'Instant CRM sync', body: 'Pushes every qualified lead to your CRM the moment the call ends.' },
    ],
    faqs: [
      { q: 'Do I need a new phone number?', a: 'No - point your existing business number at Vistrow, or get a new one from us if you prefer.' },
      { q: 'What happens if the agent can’t help a caller?', a: 'It hands off to a human with full context, or takes a message - never a dead end or hold music.' },
      { q: 'Is every call recorded and transcribed?', a: 'Yes - every inbound call is transcribed, scored, and searchable in your dashboard by default.' },
    ],
  },
  '/product/outbound': {
    eyebrow: 'Product · Outbound Campaigns',
    headline: 'Reach every contact at scale.',
    subhead:
      'Launch reminder, follow-up, and collection campaigns that run consistent, polite, fully-logged calls to thousands of contacts.',
    features: [
      { icon: 'groups', title: 'Bulk campaigns', body: 'Upload a contact list and let Artha work through it - no manual dialing.' },
      { icon: 'event_repeat', title: 'Reminders & follow-ups', body: 'Appointment reminders, renewals, and nudges that never slip through the cracks.' },
      { icon: 'volunteer_activism', title: 'Polite collections', body: 'Consistent, compliant reminder calls with every conversation recorded.' },
      { icon: 'monitoring', title: 'Live campaign metrics', body: 'Track pickup, completion, and outcome rates as the campaign runs.' },
    ],
    faqs: [
      { q: 'How large a contact list can I run?', a: 'Campaigns scale from a handful of contacts to thousands - upload a CSV and Artha works through the whole list.' },
      { q: 'Can each call be personalized?', a: 'Yes - use {{variables}} like name or due date so every call sounds tailored, not scripted.' },
      { q: 'Can I schedule a campaign for later?', a: 'Yes - set a start time and Artha runs the calls automatically, with live pickup and outcome metrics as it goes.' },
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
    faqs: [
      { q: 'What file types can I upload?', a: 'PDFs and documents today - we auto-extract them into clean Q&A pairs your agent can retrieve from.' },
      { q: 'What is strict mode?', a: 'It restricts the agent to only answer from your uploaded knowledge base, so it never invents information.' },
      { q: 'How fast do updates take effect?', a: 'Immediately - update a document and the agent uses the new answer on its very next call.' },
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
    faqs: [
      { q: 'Do visitors need to download anything?', a: 'No - it’s a real-time browser call. Visitors just tap the button and talk, nothing to install.' },
      { q: 'How do I install it on WordPress?', a: 'Use our WordPress plugin - activate it, paste your site key, and the call button appears automatically.' },
      { q: 'Does it work on mobile browsers?', a: 'Yes - the widget is fully responsive and works on mobile and desktop browsers alike.' },
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
      { icon: 'chat', title: 'Messaging', body: 'Trigger a WhatsApp follow-up off the back of a call outcome.' },
      { icon: 'api', title: 'Full API', body: 'Programmatic access to agents, calls, and analytics for custom workflows.' },
    ],
    faqs: [
      { q: 'Which CRMs can I connect?', a: 'Any CRM or tool that accepts a webhook, plus a dedicated ArthaLeads integration - no code required to set up.' },
      { q: 'Is there a public API?', a: 'Yes - a full API for agents, calls, and analytics, so you can build custom workflows on top of Vistrow.' },
      { q: 'How fast does a lead reach my CRM?', a: 'Instantly - the moment a qualified call ends, its data fires to every connected integration.' },
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
    desc: 'Qualify buyers and book site visits - 24/7, in any language.',
    headline: 'Never miss a buyer enquiry again.',
    subhead:
      'Artha answers every call, qualifies budget, location and timeline, and books site visits - round the clock, in Hindi or English.',
    pains: [
      { icon: 'phone_missed', title: 'Missed calls', body: 'After-hours enquiries go to voicemail and buyers move on. Artha picks up every time.' },
      { icon: 'fact_check', title: 'Manual qualification', body: 'No more re-asking budget and location - Artha captures and scores it automatically.' },
      { icon: 'schedule', title: 'Slow follow-up', body: 'Every qualified lead syncs to your CRM instantly, so agents follow up while it’s hot.' },
    ],
    features: ['Budget & location qualification', 'Site-visit booking', 'WhatsApp / CRM webhook', '24/7 multilingual pickup'],
    scenarios: [
      { label: 'New buyer enquiry', callerLine: '“Baner में two BHK चाहिए, budget करीब one crore है.”', agentAction: 'Captures configuration, budget, preferred location and purchase timeline without turning the call into a form.', outcome: 'Qualified buyer lead, ready for the right sales advisor.' },
      { label: 'Project comparison', callerLine: '“Aarohan Crest और nearby options में फर्क क्या है?”', agentAction: 'Answers only from approved project knowledge and records the exact comparison the buyer wants.', outcome: 'A focused follow-up request with no invented inventory or pricing.' },
      { label: 'Book a site visit', callerLine: '“Saturday afternoon site visit हो सकती है?”', agentAction: 'Checks the live calendar, offers a few real times, collects contact details and confirms only after the booking succeeds.', outcome: 'Confirmed site visit with date, time and buyer context.' },
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
      { icon: 'forum', title: 'WhatsApp follow-up', body: 'Trigger a project brochure or visit confirmation after the call.' },
    ],
    guardrails: ['Never invent project inventory, price, possession date or approval status.', 'Never call an enquiry qualified until the buyer has shared meaningful intent.', 'Never claim a site visit is confirmed until the calendar booking succeeds.'],
    faqs: [
      { q: 'Can Artha book site visits automatically?', a: 'Yes - it checks real availability and books a site visit directly on the call, no back-and-forth needed.' },
      { q: 'Does it qualify budget and location before booking?', a: 'Yes - it captures budget, preferred location, and timeline, and scores the lead before handing it to your team.' },
      { q: 'Does it handle Hindi-speaking callers?', a: 'Yes - Artha speaks Hindi natively, including everyday Hinglish code-switching, plus 10 other Indian languages, switching mid-call to match the caller.' },
    ],
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
      { label: 'Patient with symptoms', callerLine: '“मेरे पेट में बहुत दर्द है—किस डॉक्टर को दिखाऊँ?”', agentAction: 'Acknowledges the concern, checks whether it sounds urgent and routes to the relevant clinic service without diagnosing.', outcome: 'Appropriate next step with safety kept ahead of scheduling.' },
      { label: 'Find a doctor', callerLine: '“General physician कब available हैं?”', agentAction: 'Uses verified clinic information, asks for the preferred day and checks live availability instead of reading a directory.', outcome: 'Two or three relevant appointment choices.' },
      { label: 'Book or reschedule', callerLine: '“कल दो बजे का appointment कर दीजिए.”', agentAction: 'Collects patient name, phone and visit reason, verifies the exact slot and confirms only after it is saved.', outcome: 'A traceable appointment—not a verbal promise.' },
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
    faqs: [
      { q: 'Can it send appointment reminder calls?', a: 'Yes - automated reminder calls run ahead of each appointment, cutting no-shows without staff having to dial out.' },
      { q: 'Is patient information kept confidential?', a: 'Yes - call data is tenant-isolated to your clinic account and only accessible to your team.' },
      { q: 'Can one agent handle multiple clinic locations?', a: 'Yes - build a separate agent per location, or one agent that routes based on what the caller needs.' },
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
      { icon: 'local_shipping', title: 'WISMO overload', body: '“Where is my order” calls flood support. Artha answers them from your order data.' },
      { icon: 'assignment_return', title: 'Returns friction', body: 'Guides customers through returns and exchanges without a human agent.' },
      { icon: 'language', title: 'Language barriers', body: 'Speaks the customer’s language, so support feels local everywhere you sell.' },
    ],
    features: ['Order status', 'Returns & exchanges', 'Product Q&A', 'Multilingual support'],
    scenarios: [
      { label: 'Track an order', callerLine: '“Order NV-1042 अभी कहाँ है?”', agentAction: 'Looks up the supplied sample order, states the latest verified status and avoids guessing a delivery promise.', outcome: 'Clear order status with the next useful action.' },
      { label: 'Damaged delivery', callerLine: '“Package खुला था और product damaged है.”', agentAction: 'Acknowledges the inconvenience, collects the order reference and explains the applicable replacement path first.', outcome: 'Structured damage case ready for resolution.' },
      { label: 'Return or exchange', callerLine: '“Size गलत है—return कैसे होगा?”', agentAction: 'Checks the store’s approved policy, confirms eligibility and records the requested resolution.', outcome: 'Return or exchange intent captured without policy improvisation.' },
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
      { icon: 'forum', title: 'Customer follow-up', body: 'Send return instructions or resolution updates through your chosen channel.' },
    ],
    guardrails: ['Never invent an order status, delivery date, refund or replacement approval.', 'Give the next useful action before quoting long policy text.', 'Escalate exceptions with the customer’s context so they do not repeat everything.'],
    faqs: [
      { q: 'Can it check real order status?', a: 'Yes - grounded in your order data, Artha answers “where is my order” calls with the actual current status.' },
      { q: 'Can it handle returns without a human agent?', a: 'Yes - it guides customers through your returns and exchange policy end-to-end on the call.' },
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
    desc: 'Run polite, compliant reminder and collection calls at scale.',
    headline: 'Collections calls, done right.',
    subhead:
      'Artha runs polite, consistent, fully-logged reminder and collection calls at scale - with every conversation recorded and searchable.',
    pains: [
      { icon: 'currency_rupee', title: 'Manual dialing', body: 'Agents burn hours on repetitive reminder calls. Artha runs them at scale.' },
      { icon: 'gavel', title: 'Compliance risk', body: 'Consistent, scripted, recorded conversations keep every call compliant.' },
      { icon: 'insights', title: 'No visibility', body: 'Track promise-to-pay and outcomes across every call in one place.' },
    ],
    features: ['Payment reminders', 'Promise-to-pay capture', 'Full call recording', 'Outcome analytics'],
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
      { q: 'Is this compliant with collection call regulations?', a: 'Every call runs a consistent, scripted flow with full recording and logging, built for compliant collections outreach.' },
      { q: 'Can it capture a promise-to-pay commitment?', a: 'Yes - Artha captures promise-to-pay commitments on the call and logs them to your outcome analytics.' },
      { q: 'Are all calls recorded for audit?', a: 'Yes - every reminder and collection call is recorded and searchable, so it’s fully auditable.' },
    ],
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
      { label: 'Escalate an issue', callerLine: '“मैं ये तीन बार try कर चुका हूँ—person से connect करो.”', agentAction: 'Stops repeating tier-one steps and hands off the full conversation and troubleshooting history.', outcome: 'Human escalation without restarting the story.' },
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
      { icon: 'confirmation_number', title: 'Ticketing system', body: 'Create or update a ticket with the complete conversation context.' },
      { icon: 'library_books', title: 'Knowledge base', body: 'Ground answers in your approved support documentation.' },
      { icon: 'swap_calls', title: 'Human handoff', body: 'Transfer or schedule a callback without asking the caller to start again.' },
    ],
    guardrails: ['Never repeat troubleshooting the caller already completed.', 'Never invent account status, billing decisions or a resolution timeline.', 'Escalate when the caller requests a human or the issue leaves approved knowledge.'],
    faqs: [
      { q: 'What kind of tickets can it resolve without a human?', a: 'Routine, repetitive questions grounded in your knowledge base - timings, policies, status checks, and the like.' },
      { q: 'How does escalation to a human work?', a: 'Artha hands off with the full transcript and context attached, so your team never has to ask the caller to repeat themselves.' },
      { q: 'Can it be grounded in our existing help docs?', a: 'Yes - upload your docs and Artha answers only from that material when strict mode is on.' },
    ],
  },
]

// ---- Homepage sections ----

export const HOME_FEATURES: NavLink[] = PRODUCT_PAGES

export const HOW_IT_WORKS: FeatureRow[] = [
  { icon: 'dialpad', title: 'Connect a number', body: 'Bring your own number or get one from us. Point inbound calls at Vistrow in minutes.' },
  { icon: 'menu_book', title: 'Train on your knowledge', body: 'Upload PDFs and docs. Artha learns your business logic instantly with retrieval-grounded RAG.' },
  { icon: 'rocket_launch', title: 'Go live', body: 'Publish your agent and it starts answering, qualifying, and booking - in 10 Indian languages plus English.' },
]

// ---- Header navigation structure ----

export const NAV: NavGroup[] = [
  { label: 'Home', to: '/' },
  {
    label: 'Product',
    items: [{ label: 'Overview', to: '/product', icon: 'grid_view', desc: 'The whole platform at a glance.' }, ...PRODUCT_PAGES],
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
      { label: 'Docs & Help', to: 'https://docs.vistrowvoice.com', icon: 'description', desc: 'Set-up guides and how everything fits together.' },
      { label: 'Integrations', to: '/integrations', icon: 'hub', desc: 'Every tool Vistrow Voice connects to.' },
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
    links: [{ label: 'Overview', to: '/product' }, ...PRODUCT_PAGES.map((p) => ({ label: p.label, to: p.to }))],
  },
  {
    title: 'Solutions',
    links: [...SOLUTIONS.map((s) => ({ label: s.label, to: s.to })), { label: 'By language', to: '/languages' }],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Docs & Help', to: 'https://docs.vistrowvoice.com' },
      { label: 'Integrations', to: '/integrations' },
      { label: 'Changelog', to: '/changelog' },
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

/** Company phone, shown in the footer's tel: link. */
export const CONTACT_PHONE = '+91 80801 97945'

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
  { value: '87', label: '11 native + 76 global' },
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
export const WORKS_WITH = ['Slack', 'WhatsApp', 'Google Sheets', 'Zapier', 'Any CRM']

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
}

export const LANGUAGES: LanguagePage[] = [
  { slug: 'hindi', name: 'Hindi', native: 'हिन्दी', code: 'hi-IN', region: 'North & Central India', greeting: 'नमस्ते', blurb: 'The default for most Indian call flows - including the everyday Hinglish your customers actually speak, not textbook Hindi.' },
  { slug: 'marathi', name: 'Marathi', native: 'मराठी', code: 'mr-IN', region: 'Maharashtra', greeting: 'नमस्कार', blurb: 'Answer Pune and Mumbai callers in Marathi instead of defaulting them into Hindi or English.' },
  { slug: 'tamil', name: 'Tamil', native: 'தமிழ்', code: 'ta-IN', region: 'Tamil Nadu', greeting: 'வணக்கம்', blurb: 'Tamil callers rarely accept a Hindi-first IVR. Give them an agent that opens in their own language.' },
  { slug: 'telugu', name: 'Telugu', native: 'తెలుగు', code: 'te-IN', region: 'Andhra Pradesh & Telangana', greeting: 'నమస్కారం', blurb: 'Handle Hyderabad and coastal Andhra call volume in Telugu, around the clock.' },
  { slug: 'kannada', name: 'Kannada', native: 'ಕನ್ನಡ', code: 'kn-IN', region: 'Karnataka', greeting: 'ನಮಸ್ಕಾರ', blurb: 'Serve Bengaluru and wider Karnataka in Kannada, with English code-switching where it feels natural.' },
  { slug: 'bengali', name: 'Bengali', native: 'বাংলা', code: 'bn-IN', region: 'West Bengal', greeting: 'নমস্কার', blurb: 'Kolkata and West Bengal callers, answered in Bengali on the first ring.' },
  { slug: 'gujarati', name: 'Gujarati', native: 'ગુજરાતી', code: 'gu-IN', region: 'Gujarat', greeting: 'નમસ્તે', blurb: 'Built for Gujarat’s business-heavy call patterns - enquiries, follow-ups, and payment reminders in Gujarati.' },
  { slug: 'malayalam', name: 'Malayalam', native: 'മലയാളം', code: 'ml-IN', region: 'Kerala', greeting: 'നമസ്കാരം', blurb: 'Answer Kerala enquiries in Malayalam instead of routing them to an English-only queue.' },
  { slug: 'punjabi', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', code: 'pa-IN', region: 'Punjab', greeting: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ', blurb: 'Punjabi-speaking customers, handled in Punjabi - including mixed Punjabi-Hindi speech.' },
  { slug: 'odia', name: 'Odia', native: 'ଓଡ଼ିଆ', code: 'od-IN', region: 'Odisha', greeting: 'ନମସ୍କାର', blurb: 'Odia coverage, so Odisha callers aren’t the ones who always get the English fallback.' },
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
  ga: boolean
}

export const GLOBAL_LANGUAGES: GlobalLanguage[] = [
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
  { name: "Haitian Creole", native: "", code: "ht-HT", ga: false },
  { name: "Hebrew", native: "עברית", code: "he-IL", ga: false },
  { name: "Hungarian", native: "Magyar", code: "hu-HU", ga: false },
  { name: "Icelandic", native: "Íslenska", code: "is-IS", ga: false },
  { name: "Indonesian", native: "Bahasa Indonesia", code: "id-ID", ga: true },
  { name: "Italian", native: "Italiano", code: "it-IT", ga: true },
  { name: "Japanese", native: "日本語", code: "ja-JP", ga: true },
  { name: "Javanese", native: "", code: "jv-JV", ga: false },
  { name: "Konkani", native: "कोंकणी", code: "kok-IN", ga: false },
  { name: "Korean", native: "한국어", code: "ko-KR", ga: true },
  { name: "Lao", native: "ລາວ", code: "lo-LA", ga: false },
  { name: "Latin", native: "", code: "la-VA", ga: false },
  { name: "Latvian", native: "Latviešu", code: "lv-LV", ga: false },
  { name: "Lithuanian", native: "Lietuvių", code: "lt-LT", ga: false },
  { name: "Luxembourgish", native: "", code: "lb-LU", ga: false },
  { name: "Macedonian", native: "Македонски", code: "mk-MK", ga: false },
  { name: "Maithili", native: "मैथिली", code: "mai-IN", ga: false },
  { name: "Malagasy", native: "", code: "mg-MG", ga: false },
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
  { name: 'ArthaLeads CRM', category: 'CRM', desc: 'Native connector. Every qualified lead, with the full transcript, pushed on call end - paste a token, no URL setup.' },
  { name: 'Slack', category: 'Notifications', desc: 'Native connector. Choose a Slack channel once, then receive every qualified lead with the transcript.' },
  { name: 'WhatsApp', category: 'Messaging', desc: 'Native connector. Fire a WhatsApp follow-up after a call through your provider’s send webhook.' },
  { name: 'Google Sheets', category: 'Reporting', desc: 'Native connector. Appends every qualified lead as a row via an Apps Script web-app URL - no OAuth dance.' },
  { name: 'Zapier', category: 'Automation', desc: 'Point the lead webhook at a Zapier catch hook to reach 6,000+ downstream apps.', viaWebhook: true },
  { name: 'n8n', category: 'Automation', desc: 'Self-hosted automation - same JSON payload, your own infrastructure.', viaWebhook: true },
  { name: 'Make', category: 'Automation', desc: 'Route call outcomes into Make scenarios for multi-step workflows.', viaWebhook: true },
  { name: 'Salesforce, HubSpot, Zoho', category: 'CRM', desc: 'Any CRM that accepts an inbound webhook - or use the full API for a deeper two-way sync.', viaWebhook: true },
]

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
