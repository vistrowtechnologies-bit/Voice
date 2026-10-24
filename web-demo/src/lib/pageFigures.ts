// In-content figures for marketing pages, keyed by route. Each figure is
// rendered by <PageFigures> right after the section whose heading matches
// `after` ('hero' = directly under the page hero). seoPages.ts adds every
// src here to the route's `images` list, so the image sitemap stays in step.
//
// Files live in public/media/pages/: `<name>.webp` (full width) and
// `<name>-800.webp`. Images approved by the owner on 21 Oct 2026.

import { COMPARE_VENDORS, LOCAL_REAL_ESTATE_PAGES } from './seoExpansionContent'

export interface PageFigureData {
  src: string
  alt: string
  caption: string
  width: number
  height: number
  /** Heading text of the section the figure follows, or 'hero'. */
  after: string
  /** First visual above the fold: load eagerly with high priority. */
  eager?: boolean
}

const PRE_DIAL_CHECKS = {
  src: '/media/pages/outbound-pre-dial-dnc-calling-window-checks.webp',
  alt: 'Pre-dial checks before every outbound call: Do-Not-Call list, calling window and attempt limits, with blocked contacts counted, not called',
  caption: 'Every outbound dial is checked against the Do-Not-Call list, the calling window and the retry limits first.',
  width: 1600,
  height: 1000,
}

// Real dashboard views for the /product/* template (ProductShowcase.tsx).
// Laptop mock-ups are 1576x982 on a transparent ground so they sit on light
// and dark pages; crops are single panels of the same screens. Placement keys
// the template reads besides section headings: 'showcase-hero' (eager, the
// hero visual), 'showcase-feature' (the large cell of the features bento) and
// 'showcase-dashboard' (the "See it in the dashboard" section).
function dashboardView(name: string, alt: string, caption: string, after: string, width = 1576, height = 982): PageFigureData {
  return { src: `/media/pages/${name}.webp`, alt, caption, width, height, after, ...(after === 'showcase-hero' ? { eager: true } : {}) }
}

const LAPTOP_CALL_DETAIL = (after: string) =>
  dashboardView(
    'dashboard-call-transcript-hindi-laptop',
    'Vistrow Voice dashboard on a laptop showing a Hindi call between Artha and a caller, with the call summary, a qualified outcome and the booked appointment',
    'A finished call in the dashboard: the Hindi transcript, the summary with next steps and the lead stage.',
    after,
  )
const LAPTOP_CALLS = (after: string) =>
  dashboardView(
    'dashboard-all-calls-history-laptop',
    'All Calls History in the Vistrow Voice dashboard: phone and website widget calls with status, direction, duration, sentiment and the agent that took each one',
    'Every call in one list, filterable by phone, web and website widget.',
    after,
  )
const LAPTOP_AGENT_ARTHA = (after: string) =>
  dashboardView(
    'dashboard-agent-artha-setup-laptop',
    'Artha Front Desk agent page in the Vistrow Voice dashboard: setup checklist for persona, voice, knowledge, channel and go live, settings tabs and a browser test call',
    'Each agent has one page: a setup checklist, its settings and a Talk now button to test it in the browser.',
    after,
  )
const CROP_CALL_SUMMARY = (after: string) =>
  dashboardView(
    'dashboard-crop-call-summary-lead-fields',
    'Call summary in the Vistrow Voice dashboard: reason for the call, booked time, next steps, sentiment, lead stage Appointment Booked and channel Phone',
    'After the call: a summary, key points, next steps and the lead stage, saved with the record.',
    after,
    697,
    1157,
  )
const CROP_TRANSCRIPT = (after: string) =>
  dashboardView(
    'dashboard-crop-hindi-call-transcript',
    'Hindi call transcript in the Vistrow Voice dashboard: Artha greets a clinic caller, books a Thursday 5 pm consultation and says the fee will be shared on WhatsApp',
    'A clinic call in Hindi, as it appears in the transcript: the slot is booked and the fee question goes to the team.',
    after,
    1200,
    1011,
  )
const CROP_CALLS_LIST = (after: string) =>
  dashboardView(
    'dashboard-crop-calls-list-phone-widget',
    'Calls list in the Vistrow Voice dashboard with totals and rows for phone and website widget calls, each with status, direction, duration and sentiment',
    'Phone and website calls side by side, each with its status, duration and sentiment.',
    after,
    1200,
    480,
  )

const LAPTOP_OUTBOUND = (after: string) =>
  dashboardView(
    'dashboard-outbound-campaigns-laptop',
    'Outbound Campaigns in the Vistrow Voice dashboard on a laptop: EMI reminder campaigns with contacts dialled, connected and blocked by Do-Not-Call or calling window, and progress per campaign',
    'Each campaign shows contacts dialled, connected and blocked, with progress as it runs.',
    after,
  )
const CROP_CAMPAIGN_PROGRESS = (after: string) =>
  dashboardView(
    'dashboard-crop-outbound-campaign-progress',
    'Outbound campaign progress in the Vistrow Voice dashboard: a Do-Not-Call and calling-window notice, totals, and per-campaign counts for connected, pending, no answer, voicemail and blocked',
    'Per-campaign progress: connected, calling, pending, no answer, voicemail, failed and blocked.',
    after,
    1200,
    458,
  )
const LAPTOP_AGENTS = (after: string) =>
  dashboardView(
    'dashboard-voice-agents-laptop',
    'Agents page in the Vistrow Voice dashboard on a laptop: three voice agents including Artha Front Desk, each live with a readiness score and a Test agent button',
    'Your agents in one place, each with a readiness score and a one-tap test.',
    after,
  )
const CROP_AGENT_CARDS = (after: string) =>
  dashboardView(
    'dashboard-crop-agent-cards-readiness',
    'Three agent cards in the Vistrow Voice dashboard: a clinic front desk, a property enquiries agent and an EMI reminders agent, each with its voice, language and readiness score',
    'One agent per job: a front desk, a property enquiry agent and a reminder agent, side by side.',
    after,
    1200,
    526,
  )
const LAPTOP_OVERVIEW = (after: string) =>
  dashboardView(
    'dashboard-overview-laptop',
    'Vistrow Voice dashboard overview on a laptop: calls handled, minutes left, qualified leads, appointments and recent calls',
    'The dashboard overview: calls handled, qualified leads, appointments and recent calls.',
    after,
  )

// The /solutions/* template (SolutionDetail.tsx) reads the same placement
// keys as the product template, plus 'showcase-outcome' (the visual beside
// the "After the call" record). Scene images carry their own call overlays,
// so they sit in the hero without floating chips.
const RE_SCENE: PageFigureData = {
  src: '/media/pages/real-estate-ai-calling-agent-site-visit-booking.webp',
  alt: 'A property buyer on a call with Artha, the AI calling agent, with the qualified enquiry saved: 2 BHK in Wakad, budget confirmed and a Saturday site visit',
  caption: 'Artha qualifies a property enquiry and books the site visit while the buyer is on the call.',
  width: 1600,
  height: 1000,
  after: 'showcase-hero',
  eager: true,
}

const COMPARE_FIGURES: PageFigureData[] = [
  {
    src: '/media/pages/voice-ai-vendor-real-call-test-scorecard.webp',
    alt: 'Blank scorecard for testing voice AI tools on the same real call: languages, speed, handoffs, CRM output and controls',
    caption: 'Run the same real call on each tool you test and tick each row yourself.',
    width: 1600,
    height: 1000,
    after: 'Run the same real-call test before choosing.',
  },
]

// Written sample calls for the eleven language pages, placed after the
// "Built for teams that take calls in <Language>." section.
const LANGUAGE_FIGURES: [slug: string, name: string, greeting: string, call: string, height: number][] = [
  ['hindi', 'Hindi', 'नमस्ते', 'an outbound EMI reminder call', 1000],
  ['english', 'English', 'Hello', 'an outbound demo-booking call for a Bengaluru software company', 1000],
  ['marathi', 'Marathi', 'नमस्कार', 'an inbound call to a Pune diagnostic lab', 1000],
  ['tamil', 'Tamil', 'வணக்கம்', 'a follow-up call to a Chennai property enquiry', 1260],
  ['telugu', 'Telugu', 'నమస్కారం', 'an inbound call to a clinic’s appointment line', 1000],
  ['kannada', 'Kannada', 'ನಮಸ್ಕಾರ', 'an inbound property enquiry in Bengaluru', 1000],
  ['bengali', 'Bengali', 'নমস্কার', 'an inbound order-status call to an online seller', 1000],
  ['gujarati', 'Gujarati', 'નમસ્તે', 'an outbound invoice reminder to a trader in Surat', 1000],
  ['malayalam', 'Malayalam', 'നമസ്കാരം', 'an inbound property call from a caller abroad', 1120],
  ['punjabi', 'Punjabi', 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ', 'an inbound call to a study-abroad consultancy', 1000],
  ['odia', 'Odia', 'ନମସ୍କାର', 'an inbound call to a coaching institute in Bhubaneswar', 1000],
  ['american-british-english', 'US and UK English', 'Hello', 'an inbound call to a London dental practice', 1000],
]

export const PAGE_FIGURES: Record<string, PageFigureData[]> = {
  '/product': [
    {
      src: '/media/pages/product-call-flow-ring-to-crm.webp',
      alt: 'Flow of an AI voice call: the caller rings, Artha answers and understands the need, books or transfers, and the CRM record is saved',
      caption: 'Every call runs from the first ring to a saved CRM record with the caller, need, outcome, summary and recording.',
      width: 1600,
      height: 1000,
      after: 'What happens from first ring to your CRM.',
    },
  ],
  '/product/inbound': [
    LAPTOP_CALL_DETAIL('showcase-hero'),
    {
      src: '/media/pages/product-inbound-artha-hindi-call.webp',
      alt: 'Phone screen showing an inbound call answered by Artha, the Vistrow Voice AI agent, in Hindi and English, ending with a booked appointment',
      caption: 'Artha answers an inbound call in Hindi and English and books the appointment on the call.',
      width: 1200,
      height: 1500,
      after: 'showcase-feature',
    },
    CROP_CALL_SUMMARY('Hours, limits and what happens at the edges.'),
    CROP_TRANSCRIPT('Businesses where a missed call is a missed customer.'),
    LAPTOP_CALLS('showcase-dashboard'),
  ],
  '/product/outbound': [
    dashboardView(
      'dashboard-outbound-campaigns-laptop',
      'Outbound Campaigns in the Vistrow Voice dashboard on a laptop: EMI reminder campaigns with contacts dialled, connected and blocked by Do-Not-Call or calling window, and progress per campaign',
      'Each campaign shows contacts dialled, connected and blocked, with progress as it runs.',
      'showcase-hero',
    ),
    dashboardView(
      'dashboard-crop-outbound-campaign-progress',
      'Outbound campaign progress in the Vistrow Voice dashboard: a Do-Not-Call and calling-window notice, totals, and per-campaign counts for connected, pending, no answer, voicemail and blocked',
      'Per-campaign progress: connected, calling, pending, no answer, voicemail, failed and blocked.',
      'showcase-feature',
      1200,
      458,
    ),
    { ...PRE_DIAL_CHECKS, after: 'Pace, retries and personalisation.' },
    {
      src: '/media/pages/product-outbound-emi-reminder-call.webp',
      alt: 'Artha on an outbound EMI reminder call shown on a phone screen, with the promised payment date saved',
      caption: 'On an outbound reminder, Artha notes the date the customer promises to pay and saves it to the call record.',
      width: 1200,
      height: 1500,
      after: 'Calls that are expected, not cold.',
    },
    LAPTOP_CALLS('showcase-dashboard'),
  ],
  '/product/agents': [
    dashboardView(
      'dashboard-voice-agents-laptop',
      'Agents page in the Vistrow Voice dashboard on a laptop: three voice agents including Artha Front Desk, each live with a readiness score and a Test agent button',
      'Your agents in one place, each with a readiness score and a one-tap test.',
      'showcase-hero',
    ),
    dashboardView(
      'dashboard-crop-agent-setup-checklist',
      'Agent header and setup checklist in the Vistrow Voice dashboard: Artha Front Desk is live and ready for calls, with persona, voice, knowledge, channel and go live done',
      'The setup checklist shows what is done and what is next before the agent takes calls.',
      'showcase-feature',
      1200,
      266,
    ),
    {
      src: '/media/pages/ai-voice-agent-call-transfer-handoff.webp',
      alt: 'Flow of Artha transferring a phone call: the caller asks for a person, Artha dials a colleague in and stays on until they answer',
      caption: 'With a transfer number set, Artha dials a colleague into the phone call and stays on until they answer, or takes a callback request.',
      width: 1600,
      height: 1000,
      after: 'The controls behind each agent.',
    },
    dashboardView(
      'dashboard-crop-agent-cards-readiness',
      'Three agent cards in the Vistrow Voice dashboard: a clinic front desk, a property enquiries agent and an EMI reminders agent, each with its voice, language and readiness score',
      'One agent per job: a front desk, a property enquiry agent and a reminder agent, side by side.',
      'One agent per job, not one agent for everything.',
      1200,
      526,
    ),
    LAPTOP_AGENT_ARTHA('showcase-dashboard'),
  ],
  '/product/knowledge-base': [
    dashboardView(
      'dashboard-knowledge-base-strict-mode-laptop',
      'Knowledge Base page in the Vistrow Voice dashboard on a laptop: a clinic FAQ with strict mode on, a usage bar, a source document with Auto-extract Q&A and approved question-and-answer pairs',
      'A knowledge base with strict mode on, its source document and the approved Q&A pairs.',
      'showcase-hero',
    ),
    CROP_TRANSCRIPT('showcase-feature'),
    {
      src: '/media/pages/knowledge-base-brochure-to-approved-answers.webp',
      alt: 'Diagram of a project brochure turned into approved question-and-answer pairs that Artha uses to answer a caller',
      caption: 'Artha answers from the question-and-answer pairs you approve; with strict mode on it says it will check with the team when something is not covered.',
      width: 1600,
      height: 1000,
      after: 'From a brochure to answers your agent can quote.',
    },
    dashboardView(
      'dashboard-crop-knowledge-base-strict-mode',
      'Knowledge base card in the Vistrow Voice dashboard: strict mode switched on, a bar showing 1.8k of 8k characters used, a source file and 9 approved Q&A pairs',
      'Strict mode, the usage bar and the approved Q&A pairs for one knowledge base.',
      'Control what the agent knows, and how far it can stray.',
      1200,
      569,
    ),
    LAPTOP_AGENT_ARTHA('showcase-dashboard'),
  ],
  '/product/widget': [
    dashboardView(
      'dashboard-website-widget-sites-laptop',
      'Website Widget page in the Vistrow Voice dashboard on a laptop: a form to add a website with agent, corner and button label, and two sites each with its own agent and key',
      'Add a site, pick its agent, corner and label, and manage each site’s key.',
      'showcase-hero',
    ),
    {
      src: '/media/pages/website-voice-call-widget-artha.webp',
      alt: 'Website with the Vistrow Voice call button open and Artha talking to a visitor about a 3 bedroom flat',
      caption: 'Visitors tap the call button and talk to Artha in the browser, with no number to dial.',
      width: 1600,
      height: 1000,
      after: 'showcase-feature',
    },
    dashboardView(
      'dashboard-crop-website-widget-settings',
      'Website widget settings in the Vistrow Voice dashboard: site name, agent, domain, corner, button label and greeting bubble, with two sites listed below',
      'Each site gets its own agent, corner, label and key.',
      'Make it behave the way your site does.',
      1200,
      492,
    ),
    LAPTOP_CALLS('showcase-dashboard'),
  ],
  '/product/integrations': [
    dashboardView(
      'dashboard-overview-laptop',
      'Vistrow Voice dashboard overview on a laptop: calls handled, minutes left, qualified leads, appointments and recent calls',
      'The dashboard overview: calls handled, qualified leads, appointments and recent calls.',
      'showcase-hero',
    ),
    CROP_CALL_SUMMARY('showcase-feature'),
    CROP_CALLS_LIST('Teams that already know where leads should land.'),
    LAPTOP_CALL_DETAIL('showcase-dashboard'),
  ],
  '/solutions': [LAPTOP_AGENTS('showcase-hero'), LAPTOP_OVERVIEW('One platform underneath')],
  '/solutions/real-estate': [
    RE_SCENE,
    CROP_AGENT_CARDS('showcase-feature'),
    LAPTOP_CALLS('showcase-dashboard'),
  ],
  // The local market pages reuse the real-estate scene in their hero.
  ...Object.fromEntries(LOCAL_REAL_ESTATE_PAGES.map((page) => [`/solutions/real-estate/${page.slug}`, [RE_SCENE]])),
  '/solutions/healthcare': [
    {
      src: '/media/pages/clinic-ai-receptionist-patient-call.webp',
      alt: 'A patient calling her clinic in Hindi while Artha, the AI front desk, offers a free appointment slot',
      caption: 'Artha answers the clinic line in the caller’s language and offers a free slot inside your hours.',
      width: 1600,
      height: 1000,
      after: 'showcase-hero',
      eager: true,
    },
    CROP_TRANSCRIPT('showcase-feature'),
    {
      src: '/media/pages/clinic-call-summary-record.webp',
      alt: 'Clinic call summary record with reason, routing, urgency and an appointment requested outcome, handled by Artha',
      caption: 'Each clinic call is saved with its reason, routing, urgency and outcome, plus the transcript and summary.',
      width: 1600,
      height: 1000,
      after: 'showcase-outcome',
    },
    LAPTOP_CALL_DETAIL('showcase-dashboard'),
  ],
  '/solutions/ecommerce': [
    {
      src: '/media/pages/ecommerce-damaged-order-support-call.webp',
      alt: 'A customer with a damaged parcel calling a store while Artha asks for her order number',
      caption: 'Artha takes a damaged-delivery call and collects the order number before anything else.',
      width: 1600,
      height: 1000,
      after: 'showcase-hero',
      eager: true,
    },
    CROP_CALLS_LIST('showcase-feature'),
    {
      src: '/media/pages/ecommerce-order-support-outcome.webp',
      alt: 'Order-support outcome card with order ID, damage issue, the replacement the customer wants and a human review request',
      caption: 'The order, the issue and what the customer wants are saved, and the case goes to your team for review.',
      width: 1600,
      height: 1000,
      after: 'showcase-outcome',
    },
    LAPTOP_CALLS('showcase-dashboard'),
  ],
  '/solutions/finance': [
    LAPTOP_OUTBOUND('showcase-hero'),
    CROP_CAMPAIGN_PROGRESS('showcase-feature'),
    { ...PRE_DIAL_CHECKS, after: 'Rules that decide who gets called, and when.' },
    LAPTOP_CALLS('showcase-dashboard'),
  ],
  '/solutions/support': [
    {
      src: '/media/pages/helpdesk-ai-support-call.webp',
      alt: 'A customer calling a support line about a missing password reset email while Artha checks the simple causes first',
      caption: 'Artha works through a support issue one step at a time, starting with the simple checks.',
      width: 1600,
      height: 1000,
      after: 'showcase-hero',
      eager: true,
    },
    CROP_CALLS_LIST('showcase-feature'),
    {
      src: '/media/pages/support-ticket-escalation-context.webp',
      alt: 'Support ticket context saved by Artha: the issue, steps already tried, caller sentiment and an escalation to account support',
      caption: 'When Artha escalates, the ticket carries what the caller already tried, so nobody asks twice.',
      width: 1600,
      height: 1000,
      after: 'showcase-outcome',
    },
    LAPTOP_CALL_DETAIL('showcase-dashboard'),
  ],
  '/pricing': [
    {
      src: '/media/pages/pricing-call-minutes-to-credits.webp',
      alt: 'How credits work: call minutes times channel rate, voice tier and model tier, with a worked example of a 3-minute call using 6 credits',
      caption: 'Credits are call minutes times the channel rate, voice tier and model tier. A 3-minute Vistrow Bharat call with a Standard voice uses 6 credits.',
      width: 1600,
      height: 1000,
      after: 'Work out what you need',
    },
  ],
  '/languages': [
    {
      src: '/media/pages/call-languages-in-native-scripts-map.webp',
      alt: 'Map-style graphic of the call languages written in their own scripts, Punjabi, Hindi, Bengali, Gujarati, Odia, Marathi, Telugu, Kannada, Tamil and Malayalam, plus English, under the line 130+ languages',
      caption: 'More than 130 languages, including 10 Indian languages and English.',
      width: 1600,
      height: 1000,
      after: 'Your customer shouldn’t have to switch languages to be understood.',
      eager: true,
    },
  ],
  ...Object.fromEntries(
    LANGUAGE_FIGURES.map(([slug, name, greeting, call, height]) => [
      `/languages/${slug}`,
      [
        {
          src: `/media/pages/${slug}-ai-voice-agent-sample-call.webp`,
          alt:
            slug === 'american-british-english'
              ? `Greeting ${greeting} beside a second written example, ${call} in British English, with Artha, the AI voice agent, booking the caller in`
              : slug === 'english'
              ? `Greeting ${greeting} beside a written sample of ${call} in Indian English, with Artha, the AI voice agent, replying in English`
              : `${name} greeting ${greeting} in ${name} script beside a written sample of ${call}, with Artha, the AI voice agent, replying in ${name}`,
          caption:
            slug === 'american-british-english'
              ? `A second, separate written example: ${call} in British English. Not a recording of a customer call.`
              : slug === 'english'
              ? `Written sample of ${call} in Indian English, with the Hindi words callers mix in. Not a recording of a customer call.`
              : `Written sample of ${call} in ${name}, with the English words callers mix in. Not a recording of a customer call.`,
          width: 1600,
          height,
          after: `Built for teams that take calls in ${name}.`,
        },
      ],
    ]),
  ),
  '/ai-ivr': [
    {
      src: '/media/pages/ai-ivr-keypad-menu-vs-spoken-request.webp',
      alt: 'Press-1 phone menu compared with a caller simply saying what they need to Artha on an AI IVR',
      caption: 'With an AI IVR the caller says what they need instead of choosing from a keypad menu.',
      width: 1600,
      height: 1000,
      after: 'A phone line that listens, not a menu that lists.',
    },
    {
      src: '/media/pages/ai-ivr-call-flow-hello-to-booking.webp',
      alt: 'AI IVR call flow: the caller says what they need, Artha understands it in their language, answers, books or transfers, and the team gets the recording, transcript and summary',
      caption: 'How an AI IVR call runs, from the caller’s first words to a booking, a message or a transfer.',
      width: 1600,
      height: 1000,
      after: 'From “hello” to a booked slot, without a menu.',
    },
    {
      src: '/media/pages/ai-ivr-keep-existing-number-sip.webp',
      alt: 'Diagram of an existing business number connected over SIP to Artha, the AI agent, with the line’s hours, active days and concurrent-call limit',
      caption: 'Keep the number your callers know: it connects over SIP to your agent, with its own hours and call limit.',
      width: 1600,
      height: 1000,
      after: 'Keep your existing number.',
    },
  ],
  '/vs-ivr': [
    {
      src: '/media/pages/ivr-vs-ai-voice-agent-vs-chatbot-vs-receptionist.webp',
      alt: 'Comparison of menu IVR, AI voice agent, chatbot and human receptionist on answering calls, availability, languages, booking and call records',
      caption: 'Four ways to handle calls, compared on five points from the table below.',
      width: 1600,
      height: 1060,
      after: 'Menu IVR vs AI voice agent vs chatbot vs receptionist.',
    },
  ],
  '/ai-receptionist': [
    {
      src: '/media/pages/ai-receptionist-four-call-types.webp',
      alt: 'Four kinds of call one AI receptionist handles in a sample day: a timing question, a booking, a complaint transferred to a person and an after-hours callback request',
      caption: 'One receptionist handles a timing question, a booking, a complaint that needs a person and an after-hours enquiry.',
      width: 1600,
      height: 1000,
      after: 'Four calls, one receptionist.',
    },
    {
      src: '/media/pages/ai-receptionist-appointment-booking-call.webp',
      alt: 'Phone call in Hinglish where Artha offers free Thursday slots and books a 4 pm cleaning appointment into Appointments',
      caption: 'Artha offers only free slots and confirms the booking once it is saved in Appointments.',
      width: 1200,
      height: 1500,
      after: 'Appointments, booked on the call.',
    },
  ],
  '/voice-ai-platform': [
    {
      src: '/media/pages/voice-ai-platform-nine-parts-map.webp',
      alt: 'Map of the nine parts of the Vistrow Voice platform around one voice agent: build, reach callers and after the call',
      caption: 'The agent builder, knowledge base, Testing Lab, phone numbers, widget, call records, analytics, integrations and team roles sit in one workspace.',
      width: 1600,
      height: 1000,
      after: 'Nine parts, one workspace.',
    },
  ],
  '/ai-call-center': [
    {
      src: '/media/pages/ai-call-center-agent-team-split.webp',
      alt: 'Split of work in an AI call center: Artha answers first-line calls and your team handles escalations and decisions',
      caption: 'Artha takes the first line on repeat questions, enquiries, bookings and after-hours calls; your team keeps the judgement calls.',
      width: 1600,
      height: 1000,
      after: 'A sensible split between the agent and your team.',
    },
  ],
  '/voice-bot': [
    {
      src: '/media/pages/voice-bot-listen-decide-speak-act.webp',
      alt: 'How an AI voice bot handles each turn: it listens, decides, speaks and acts, shown on a dental clinic booking call',
      caption: 'On every turn the voice bot listens, decides, speaks and acts, such as booking a free slot.',
      width: 1600,
      height: 1000,
      after: 'Four things happen on every turn.',
    },
  ],
  '/ai-telecaller': [
    {
      src: '/media/pages/ai-telecaller-new-lead-call-flow.webp',
      alt: 'AI telecaller flow: a new web lead is queued for a call within about 15 to 30 seconds, qualified by Artha and handed to sales',
      caption: 'A new lead is called within about 15 to 30 seconds, qualified by Artha and passed to sales, inside your calling rules.',
      width: 1600,
      height: 1000,
      after: 'Inbound, follow-ups and callbacks.',
    },
    { ...PRE_DIAL_CHECKS, after: 'Checks that run before every outbound dial.' },
  ],
  '/ai-calling-agent': [
    {
      src: '/media/pages/ai-calling-agent-four-call-types.webp',
      alt: 'Four kinds of call one AI calling agent handles: inbound calls, outbound calls, new-lead callbacks and website voice calls',
      caption: 'One Artha agent takes inbound, outbound, new-lead and website calls with the same instructions and records.',
      width: 1600,
      height: 1000,
      after: 'The calls an AI calling agent can take on.',
    },
    { ...PRE_DIAL_CHECKS, after: 'Rules checked by the system, not left to the script.' },
  ],
  ...Object.fromEntries(COMPARE_VENDORS.map((vendor) => [`/compare/${vendor.slug}`, COMPARE_FIGURES])),
}

export function pageFigures(route: string, after: string): PageFigureData[] {
  return (PAGE_FIGURES[route] ?? []).filter((figure) => figure.after === after)
}
