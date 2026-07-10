// Single source of truth for the marketing site's navigation and page content.
// The header dropdowns, footer columns, product/solution detail pages, and the
// homepage previews all read from here — so adding a product or industry is one
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

// ---- Products (feed Product dropdown, /product overview, and detail pages) ----

export const PRODUCT_PAGES: NavLink[] = [
  {
    label: 'Voice Agents',
    to: '/product/agents',
    icon: 'smart_toy',
    desc: 'Build a no-code AI agent — persona, prompt, voice, language.',
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
    desc: 'A one-tap browser call button for any website — no phone number.',
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
  { eyebrow: string; headline: string; subhead: string; features: FeatureRow[] }
> = {
  '/product/agents': {
    eyebrow: 'Product · Voice Agents',
    headline: 'Build a voice agent in minutes.',
    subhead:
      'A no-code builder for real-time AI phone agents. Set the persona, prompt, voice and language — publish, and Artha starts taking calls.',
    features: [
      { icon: 'translate', title: 'Multilingual', body: 'Speaks 30+ Indian languages and Hinglish natively, switching mid-call to match the caller.' },
      { icon: 'menu_book', title: 'Grounded answers', body: 'Ties responses to your knowledge base with strict-mode RAG, so the agent never makes things up.' },
      { icon: 'swap_calls', title: 'Human handoff', body: 'Escalates to a live person with full context when a call needs a human touch.' },
      { icon: 'analytics', title: 'Analytics & transcripts', body: 'Every call is transcribed, scored, and searchable across channels and agents.' },
    ],
  },
  '/product/inbound': {
    eyebrow: 'Product · Inbound Calling',
    headline: 'Answer every call, day or night.',
    subhead:
      'Point your number at Vistrow and Artha picks up on the first ring — qualifying, answering, and routing without hold music.',
    features: [
      { icon: 'schedule', title: '24/7 pickup', body: 'No missed calls, no voicemail — every caller reaches a helpful agent instantly.' },
      { icon: 'fact_check', title: 'Auto-qualification', body: 'Captures intent, budget, and contact details, then scores the lead automatically.' },
      { icon: 'route', title: 'Smart routing', body: 'Sends the right calls to the right team or agent based on what the caller needs.' },
      { icon: 'sync', title: 'Instant CRM sync', body: 'Pushes every qualified lead to your CRM the moment the call ends.' },
    ],
  },
  '/product/outbound': {
    eyebrow: 'Product · Outbound Campaigns',
    headline: 'Reach every contact at scale.',
    subhead:
      'Launch reminder, follow-up, and collection campaigns that run consistent, polite, fully-logged calls to thousands of contacts.',
    features: [
      { icon: 'groups', title: 'Bulk campaigns', body: 'Upload a contact list and let Artha work through it — no manual dialing.' },
      { icon: 'event_repeat', title: 'Reminders & follow-ups', body: 'Appointment reminders, renewals, and nudges that never slip through the cracks.' },
      { icon: 'volunteer_activism', title: 'Polite collections', body: 'Consistent, compliant reminder calls with every conversation recorded.' },
      { icon: 'monitoring', title: 'Live campaign metrics', body: 'Track pickup, completion, and outcome rates as the campaign runs.' },
    ],
  },
  '/product/knowledge-base': {
    eyebrow: 'Product · Knowledge Base',
    headline: 'Answers grounded in your business.',
    subhead:
      'Upload your PDFs, manuals, and docs. Artha retrieves the right facts on every call and can be locked to strict mode so it only answers from your material.',
    features: [
      { icon: 'upload_file', title: 'Upload anything', body: 'PDFs, docs, or a website URL — we extract and index it into clean Q&A automatically.' },
      { icon: 'lock', title: 'Strict mode', body: 'Restrict the agent to only answer from your knowledge base — no hallucinations.' },
      { icon: 'search', title: 'Retrieval-grounded', body: 'Every answer is backed by a retrieved source, so responses stay accurate and on-brand.' },
      { icon: 'update', title: 'Always current', body: 'Update a document and the agent uses the new information on the very next call.' },
    ],
  },
  '/product/widget': {
    eyebrow: 'Product · Website Call Widget',
    headline: 'A call button for any website.',
    subhead:
      'Drop a one-tap voice button on your site — visitors talk to Artha in the browser, no phone number and no app. Install with one line or the WordPress plugin.',
    features: [
      { icon: 'code', title: 'One-line embed', body: 'Paste a single script tag, or use our WordPress plugin — no coding required.' },
      { icon: 'mic', title: 'Browser calls', body: 'Real-time voice right in the page. Visitors just tap and talk.' },
      { icon: 'badge', title: 'Lead capture gate', body: 'Collects name and phone before the call so every conversation is a real lead.' },
      { icon: 'palette', title: 'On-brand', body: 'Position, label, and colours match your site — it feels native, not bolted on.' },
    ],
  },
  '/product/integrations': {
    eyebrow: 'Product · Integrations',
    headline: 'Every lead, in your stack.',
    subhead:
      'Vistrow pushes leads, transcripts, and outcomes to your CRM and tools over webhooks — so your team works where they already are.',
    features: [
      { icon: 'webhook', title: 'Webhooks', body: 'Fire a structured payload to any endpoint the moment a call completes.' },
      { icon: 'contacts', title: 'CRM sync', body: 'Create and update contacts and leads automatically in your CRM.' },
      { icon: 'chat', title: 'Messaging', body: 'Trigger WhatsApp or SMS follow-ups off the back of a call outcome.' },
      { icon: 'api', title: 'Full API', body: 'Programmatic access to agents, calls, and analytics for custom workflows.' },
    ],
  },
}

// ---- Solutions (feed Solutions dropdown, /solutions overview, detail pages) ----

export interface Solution extends NavLink {
  headline: string
  subhead: string
  pains: FeatureRow[]
  features: string[]
}

export const SOLUTIONS: Solution[] = [
  {
    label: 'Real Estate',
    to: '/solutions/real-estate',
    icon: 'apartment',
    desc: 'Qualify buyers and book site visits — 24/7, in any language.',
    headline: 'Never miss a buyer enquiry again.',
    subhead:
      'Artha answers every call, qualifies budget, location and timeline, and books site visits — round the clock, in Hindi or English.',
    pains: [
      { icon: 'phone_missed', title: 'Missed calls', body: 'After-hours enquiries go to voicemail and buyers move on. Artha picks up every time.' },
      { icon: 'fact_check', title: 'Manual qualification', body: 'No more re-asking budget and location — Artha captures and scores it automatically.' },
      { icon: 'schedule', title: 'Slow follow-up', body: 'Every qualified lead syncs to your CRM instantly, so agents follow up while it’s hot.' },
    ],
    features: ['Budget & location qualification', 'Site-visit booking', 'WhatsApp / CRM webhook', '24/7 multilingual pickup'],
  },
  {
    label: 'Healthcare & Clinics',
    to: '/solutions/healthcare',
    icon: 'health_and_safety',
    desc: 'Book appointments and answer patient FAQs without hold music.',
    headline: 'A front desk that never sleeps.',
    subhead:
      'Artha books appointments, answers common patient questions, and triages calls — freeing your staff for in-person care.',
    pains: [
      { icon: 'phone_missed', title: 'Overloaded reception', body: 'Staff can’t answer every call during clinic hours. Artha handles the overflow.' },
      { icon: 'event', title: 'No-shows', body: 'Automated reminder calls cut no-shows and keep the schedule full.' },
      { icon: 'quiz', title: 'Repetitive FAQs', body: 'Timings, location, prep instructions — answered instantly, grounded in your info.' },
    ],
    features: ['Appointment booking', 'Reminder calls', 'FAQ answering', 'Call triage'],
  },
  {
    label: 'E-commerce & D2C',
    to: '/solutions/ecommerce',
    icon: 'shopping_bag',
    desc: 'Handle order status, returns, and WISMO calls automatically.',
    headline: 'Support that scales with every sale.',
    subhead:
      'Artha handles “where is my order”, returns, and product questions instantly — in the language your customer shops in.',
    pains: [
      { icon: 'local_shipping', title: 'WISMO overload', body: '“Where is my order” calls flood support. Artha answers them from your order data.' },
      { icon: 'assignment_return', title: 'Returns friction', body: 'Guides customers through returns and exchanges without a human agent.' },
      { icon: 'language', title: 'Language barriers', body: 'Speaks the customer’s language, so support feels local everywhere you sell.' },
    ],
    features: ['Order status', 'Returns & exchanges', 'Product Q&A', 'Multilingual support'],
  },
  {
    label: 'Finance & Collections',
    to: '/solutions/finance',
    icon: 'account_balance',
    desc: 'Run polite, compliant reminder and collection calls at scale.',
    headline: 'Collections calls, done right.',
    subhead:
      'Artha runs polite, consistent, fully-logged reminder and collection calls at scale — with every conversation recorded and searchable.',
    pains: [
      { icon: 'currency_rupee', title: 'Manual dialing', body: 'Agents burn hours on repetitive reminder calls. Artha runs them at scale.' },
      { icon: 'gavel', title: 'Compliance risk', body: 'Consistent, scripted, recorded conversations keep every call compliant.' },
      { icon: 'insights', title: 'No visibility', body: 'Track promise-to-pay and outcomes across every call in one place.' },
    ],
    features: ['Payment reminders', 'Promise-to-pay capture', 'Full call recording', 'Outcome analytics'],
  },
  {
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
  },
]

// ---- Homepage sections ----

export const HOME_FEATURES: NavLink[] = PRODUCT_PAGES

export const HOW_IT_WORKS: FeatureRow[] = [
  { icon: 'dialpad', title: 'Connect a number', body: 'Bring your own number or get one from us. Point inbound calls at Vistrow in minutes.' },
  { icon: 'menu_book', title: 'Train on your knowledge', body: 'Upload PDFs and docs. Artha learns your business logic instantly with retrieval-grounded RAG.' },
  { icon: 'rocket_launch', title: 'Go live', body: 'Publish your agent and it starts answering, qualifying, and booking — in 30+ Indian languages.' },
]

// ---- Header navigation structure ----

export const NAV: NavGroup[] = [
  {
    label: 'Product',
    items: [{ label: 'Overview', to: '/product', icon: 'grid_view', desc: 'The whole platform at a glance.' }, ...PRODUCT_PAGES],
  },
  {
    label: 'Solutions',
    items: [{ label: 'All industries', to: '/solutions', icon: 'grid_view', desc: 'Voice AI for every industry.' }, ...SOLUTIONS.map((s) => ({ label: s.label, to: s.to, icon: s.icon, desc: s.desc }))],
  },
  { label: 'Pricing', to: '/pricing' },
  {
    label: 'Resources',
    items: [
      { label: 'Blog', to: '/resources/blog', icon: 'article', desc: 'Product news and guides.' },
      { label: 'Docs & Help', to: '/resources/docs', icon: 'description', desc: 'Set-up guides and API reference.' },
      { label: 'Case Studies', to: '/resources/case-studies', icon: 'workspace_premium', desc: 'How teams use Vistrow Voice.' },
    ],
  },
  {
    label: 'Company',
    items: [
      { label: 'About', to: '/about', icon: 'info', desc: 'Voice AI, built for Bharat.' },
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
  { title: 'Solutions', links: SOLUTIONS.map((s) => ({ label: s.label, to: s.to })) },
  {
    title: 'Company',
    links: [
      { label: 'About', to: '/about' },
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

/** Company phone, shown in footer + demo fallback. */
export const CONTACT_PHONE = '+91 11 4056 6600'

/** Headline stats shown under the hero. */
export const HERO_STATS = [
  { value: '30+', label: 'Languages' },
  { value: '<1s', label: 'Response' },
  { value: '10,000+', label: 'Leads qualified' },
]

/** Logos/tools shown in "works with" strips. */
export const WORKS_WITH = ['LiveKit', 'Sarvam', 'OpenAI', 'Gemini']
