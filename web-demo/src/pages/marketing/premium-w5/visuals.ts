// Visuals for the wave 5 premium templates (/, /product, /pricing,
// /integrations, /about, /contact, /security, /careers). Passed to the
// showcase kit as props instead of living in pageFigures.ts, which other
// branches are editing at the same time. After merging, these can move into
// PAGE_FIGURES so seoPages.ts adds them to the image sitemap.
//
// Files live in public/media/pages/ as `<name>.webp` plus `<name>-800.webp`.

import type { PageFigureData } from '../../../lib/pageFigures'

function figure(name: string, alt: string, caption: string, width = 1600, height = 1000, eager = false): PageFigureData {
  return { src: `/media/pages/${name}.webp`, alt, caption, width, height, after: eager ? 'showcase-hero' : 'section', ...(eager ? { eager: true } : {}) }
}

// ---- Shared dashboard views (same files and wording as pageFigures.ts) ----

const overviewLaptop = (eager = false) =>
  figure(
    'dashboard-overview-laptop',
    'Vistrow Voice dashboard overview on a laptop: calls handled, minutes left, qualified leads, appointments and recent calls',
    'The dashboard overview: calls handled, qualified leads, appointments and recent calls.',
    1576,
    982,
    eager,
  )
const callsLaptop = () =>
  figure(
    'dashboard-all-calls-history-laptop',
    'All Calls History in the Vistrow Voice dashboard: phone and website widget calls with status, direction, duration, sentiment and the agent that took each one',
    'Every call in one list, filterable by phone, web and website widget.',
    1576,
    982,
  )
const callDetailLaptop = (eager = false) =>
  figure(
    'dashboard-call-transcript-hindi-laptop',
    'Vistrow Voice dashboard on a laptop showing a Hindi call between Artha and a caller, with the call summary, a qualified outcome and the booked appointment',
    'A finished call in the dashboard: the Hindi transcript, the summary with next steps and the lead stage.',
    1576,
    982,
    eager,
  )
const callSummaryCrop = () =>
  figure(
    'dashboard-crop-call-summary-lead-fields',
    'Call summary in the Vistrow Voice dashboard: reason for the call, booked time, next steps, sentiment, lead stage Appointment Booked and channel Phone',
    'After the call: a summary, key points, next steps and the lead stage, saved with the record.',
    697,
    1157,
  )
const callsListCrop = () =>
  figure(
    'dashboard-crop-calls-list-phone-widget',
    'Calls list in the Vistrow Voice dashboard with totals and rows for phone and website widget calls, each with status, direction, duration and sentiment',
    'Phone and website calls side by side, each with its status, duration and sentiment.',
    1200,
    480,
  )
const agentCardsCrop = () =>
  figure(
    'dashboard-crop-agent-cards-readiness',
    'Three agent cards in the Vistrow Voice dashboard: a clinic front desk, a property enquiries agent and an EMI reminders agent, each with its voice, language and readiness score',
    'One agent per job: a front desk, a property enquiry agent and a reminder agent, side by side.',
    1200,
    526,
  )

// ---- Home (/) ----

export const HOME_LANGUAGE_SWITCH = figure(
  'home-language-switch-mid-call-vs-ivr-menu',
  'A press-1 language menu beside one Artha call that moves from Hindi to English to Marathi in the same voice, with no restart and no menu',
  'A keypad menu makes the caller choose one language up front. Artha follows the caller from Hindi to English to Marathi in one call.',
)
export const HOME_ONE_AGENT = figure(
  'home-one-agent-phone-widget-campaigns',
  'One Artha agent behind phone calls, the website widget and outbound campaigns, sending transcripts, appointments and leads to the CRM, a sheet, team chat or a webhook',
  'Phone, website and campaigns share one agent: the same voice, knowledge and rules, and one record of every call.',
)
export const HOME_REAL_ESTATE_SCENE = figure(
  'real-estate-ai-calling-agent-site-visit-booking',
  'A property buyer on a call with Artha, the AI calling agent, with the qualified enquiry saved: 2 BHK in Wakad, budget confirmed and a Saturday site visit',
  'Artha qualifies a property enquiry and books the site visit while the buyer is on the call.',
)
export const HOME_DASHBOARD = overviewLaptop()

// ---- /product ----

export const PRODUCT_HERO = overviewLaptop(true)
export const PRODUCT_CALL_FLOW = figure(
  'product-call-flow-ring-to-crm',
  'Flow of an AI voice call: the caller rings, Artha answers and understands the need, books or transfers, and the CRM record is saved',
  'Every call runs from the first ring to a saved CRM record with the caller, need, outcome, summary and recording.',
)
export const PRODUCT_AGENT_CARDS = agentCardsCrop()
export const PRODUCT_DASHBOARD = callsLaptop()

// ---- /pricing ----

export const PRICING_HERO = figure(
  'dashboard-crop-usage-minutes-by-channel-agent',
  'Usage page in the Vistrow Voice dashboard with sample data: plan minutes used, call minutes, calls and minutes left, a per-day chart, and credits by channel, agent and voice tier',
  'The Usage page shows where plan minutes go: by day, channel, agent, voice and model.',
  1600,
  797,
  true,
)
export const PRICING_CREDITS = figure(
  'pricing-call-minutes-to-credits',
  'How credits work: call minutes times channel rate, voice tier and model tier, with a worked example of a 3-minute call using 6 credits',
  'Credits are call minutes times the channel rate, voice tier and model tier. A 3-minute Vistrow Bharat call with a Standard voice uses 6 credits.',
)

// ---- /integrations ----

export const INTEGRATIONS_HERO = callDetailLaptop(true)
export const INTEGRATIONS_SUMMARY = callSummaryCrop()
export const INTEGRATIONS_CALLS = callsListCrop()

// ---- /about ----

export const ABOUT_HERO = figure(
  'call-languages-in-native-scripts-map',
  'Map-style graphic of the call languages written in their own scripts, Punjabi, Hindi, Bengali, Gujarati, Odia, Marathi, Telugu, Kannada, Tamil and Malayalam, plus English, under the line 130+ languages',
  'More than 130 languages, including 10 Indian languages and English.',
  1600,
  1000,
  true,
)
export const ABOUT_AGENT_CARDS = agentCardsCrop()
export const ABOUT_ONE_AGENT = HOME_ONE_AGENT

// ---- /contact ----

export const CONTACT_CALL = callDetailLaptop()

// ---- /security ----

export const SECURITY_HERO = figure(
  'outbound-pre-dial-dnc-calling-window-checks',
  'Pre-dial checks before every outbound call: Do-Not-Call list, calling window and attempt limits, with blocked contacts counted, not called',
  'Every outbound dial is checked against the Do-Not-Call list, the calling window and the retry limits first.',
  1600,
  1000,
  true,
)
export const SECURITY_RECORD = callSummaryCrop()

// ---- /careers ----

export const CAREERS_HERO: PageFigureData = { ...HOME_LANGUAGE_SWITCH, after: 'showcase-hero', eager: true }
export const CAREERS_CALLS = callsListCrop()
