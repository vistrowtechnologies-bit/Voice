// In-content figures for marketing pages, keyed by route. Each figure is
// rendered by <PageFigures> right after the section whose heading matches
// `after` ('hero' = directly under the page hero). seoPages.ts adds every
// src here to the route's `images` list, so the image sitemap stays in step.
//
// Files live in public/media/pages/: `<name>.webp` (full width) and
// `<name>-800.webp`. Images approved by the owner on 21 Oct 2026.

import { COMPARE_VENDORS } from './seoExpansionContent'

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

const DEMO_HEADING = 'Don’t watch a generic demo. Test the work.'
const OUTCOME_HEADING = 'How the conversation becomes an outcome.'

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

// Written sample calls for the ten language pages, placed after the
// "Built for teams that take calls in <Language>." section.
const LANGUAGE_FIGURES: [slug: string, name: string, greeting: string, call: string, height: number][] = [
  ['hindi', 'Hindi', 'नमस्ते', 'an outbound EMI reminder call', 1000],
  ['marathi', 'Marathi', 'नमस्कार', 'an inbound call to a Pune diagnostic lab', 1000],
  ['tamil', 'Tamil', 'வணக்கம்', 'a follow-up call to a Chennai property enquiry', 1260],
  ['telugu', 'Telugu', 'నమస్కారం', 'an inbound call to a clinic’s appointment line', 1000],
  ['kannada', 'Kannada', 'ನಮಸ್ಕಾರ', 'an inbound property enquiry in Bengaluru', 1000],
  ['bengali', 'Bengali', 'নমস্কার', 'an inbound order-status call to an online seller', 1000],
  ['gujarati', 'Gujarati', 'નમસ્તે', 'an outbound invoice reminder to a trader in Surat', 1000],
  ['malayalam', 'Malayalam', 'നമസ്കാരം', 'an inbound property call from a caller abroad', 1120],
  ['punjabi', 'Punjabi', 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ', 'an inbound call to a study-abroad consultancy', 1000],
  ['odia', 'Odia', 'ନମସ୍କାର', 'an inbound call to a coaching institute in Bhubaneswar', 1000],
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
    {
      src: '/media/pages/product-inbound-artha-hindi-call.webp',
      alt: 'Phone screen showing an inbound call answered by Artha, the Vistrow Voice AI agent, in Hindi and English, ending with a booked appointment',
      caption: 'Artha answers an inbound call in Hindi and English and books the appointment on the call.',
      width: 1200,
      height: 1500,
      after: 'hero',
      eager: true,
    },
  ],
  '/product/outbound': [
    {
      src: '/media/pages/product-outbound-emi-reminder-call.webp',
      alt: 'Artha on an outbound EMI reminder call shown on a phone screen, with the promised payment date saved',
      caption: 'On an outbound reminder, Artha notes the date the customer promises to pay and saves it to the call record.',
      width: 1200,
      height: 1500,
      after: 'Calls that are expected, not cold.',
    },
  ],
  '/product/agents': [
    {
      src: '/media/pages/ai-voice-agent-call-transfer-handoff.webp',
      alt: 'Flow of Artha transferring a phone call: the caller asks for a person, Artha dials a colleague in and stays on until they answer',
      caption: 'With a transfer number set, Artha dials a colleague into the phone call and stays on until they answer, or takes a callback request.',
      width: 1600,
      height: 1000,
      after: 'The controls behind each agent.',
    },
  ],
  '/product/knowledge-base': [
    {
      src: '/media/pages/knowledge-base-brochure-to-approved-answers.webp',
      alt: 'Diagram of a project brochure turned into approved question-and-answer pairs that Artha uses to answer a caller',
      caption: 'Artha answers from the question-and-answer pairs you approve; with strict mode on it says it will check with the team when something is not covered.',
      width: 1600,
      height: 1000,
      after: 'From a brochure to answers your agent can quote.',
    },
  ],
  '/product/widget': [
    {
      src: '/media/pages/website-voice-call-widget-artha.webp',
      alt: 'Website with the Vistrow Voice call button open and Artha talking to a visitor about a 3 bedroom flat',
      caption: 'Visitors tap the call button and talk to Artha in the browser, with no number to dial.',
      width: 1600,
      height: 1000,
      after: 'hero',
      eager: true,
    },
  ],
  '/solutions/real-estate': [
    {
      src: '/media/pages/real-estate-ai-calling-agent-site-visit-booking.webp',
      alt: 'A property buyer on a call with Artha, the AI calling agent, with the qualified enquiry saved: 2 BHK in Wakad, budget confirmed and a Saturday site visit',
      caption: 'Artha qualifies a property enquiry and books the site visit while the buyer is on the call.',
      width: 1600,
      height: 1000,
      after: DEMO_HEADING,
    },
  ],
  '/solutions/healthcare': [
    {
      src: '/media/pages/clinic-ai-receptionist-patient-call.webp',
      alt: 'A patient calling her clinic in Hindi while Artha, the AI front desk, offers a free appointment slot',
      caption: 'Artha answers the clinic line in the caller’s language and offers a free slot inside your hours.',
      width: 1600,
      height: 1000,
      after: DEMO_HEADING,
    },
    {
      src: '/media/pages/clinic-call-summary-record.webp',
      alt: 'Clinic call summary record with reason, routing, urgency and an appointment requested outcome, handled by Artha',
      caption: 'Each clinic call is saved with its reason, routing, urgency and outcome, plus the transcript and summary.',
      width: 1600,
      height: 1000,
      after: OUTCOME_HEADING,
    },
  ],
  '/solutions/ecommerce': [
    {
      src: '/media/pages/ecommerce-damaged-order-support-call.webp',
      alt: 'A customer with a damaged parcel calling a store while Artha asks for her order number',
      caption: 'Artha takes a damaged-delivery call and collects the order number before anything else.',
      width: 1600,
      height: 1000,
      after: DEMO_HEADING,
    },
    {
      src: '/media/pages/ecommerce-order-support-outcome.webp',
      alt: 'Order-support outcome card with order ID, damage issue, the replacement the customer wants and a human review request',
      caption: 'The order, the issue and what the customer wants are saved, and the case goes to your team for review.',
      width: 1600,
      height: 1000,
      after: OUTCOME_HEADING,
    },
  ],
  '/solutions/finance': [{ ...PRE_DIAL_CHECKS, after: 'Rules that decide who gets called, and when.' }],
  '/solutions/support': [
    {
      src: '/media/pages/helpdesk-ai-support-call.webp',
      alt: 'A customer calling a support line about a missing password reset email while Artha checks the simple causes first',
      caption: 'Artha works through a support issue one step at a time, starting with the simple checks.',
      width: 1600,
      height: 1000,
      after: DEMO_HEADING,
    },
    {
      src: '/media/pages/support-ticket-escalation-context.webp',
      alt: 'Support ticket context saved by Artha: the issue, steps already tried, caller sentiment and an escalation to account support',
      caption: 'When Artha escalates, the ticket carries what the caller already tried, so nobody asks twice.',
      width: 1600,
      height: 1000,
      after: OUTCOME_HEADING,
    },
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
          alt: `${name} greeting ${greeting} in ${name} script beside a written sample of ${call}, with Artha, the AI voice agent, replying in ${name}`,
          caption: `Written sample of ${call} in ${name}, with the English words callers mix in. Not a recording of a customer call.`,
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
