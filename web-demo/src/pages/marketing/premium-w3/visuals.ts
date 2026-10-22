// Visuals for the wave-3 premium templates: /ai-ivr, /vs-ivr, /compare/* and
// the /:slug buyer guides. Kept out of pageFigures.ts (claimed by every wave)
// and passed to the showcase kit as props; fold them into pageFigures and the
// image sitemap after merging. `after` is a free label here: these templates
// place each figure explicitly.
//
// Lives under pages/marketing/ (the seo lane) because the edit guard keeps
// src/lib/ and src/components/ in the dashboard lane.

import type { PageFigureData } from '../../../lib/pageFigures'

function fig(name: string, alt: string, caption: string, width = 1600, height = 1000): PageFigureData {
  return { src: `/media/pages/${name}.webp`, alt, caption, width, height, after: 'premium-w3' }
}

// Shared product and dashboard views.
export const W3_LAPTOP_CALL_DETAIL = fig(
  'dashboard-call-transcript-hindi-laptop',
  'Vistrow Voice dashboard on a laptop showing a Hindi call between Artha and a caller, with the call summary, a qualified outcome and the booked appointment',
  'A finished call in the dashboard: the Hindi transcript, the summary with next steps and the lead stage.',
  1576,
  982,
)
export const W3_LAPTOP_OVERVIEW = fig(
  'dashboard-overview-laptop',
  'Vistrow Voice dashboard overview on a laptop: calls handled, minutes left, qualified leads, appointments and recent calls',
  'The dashboard overview: calls handled, minutes left, qualified leads and appointments.',
  1576,
  982,
)
export const W3_CALL_SUMMARY = fig(
  'dashboard-crop-call-summary-lead-fields',
  'Call summary in the Vistrow Voice dashboard: reason for the call, booked time, next steps, sentiment, lead stage Appointment Booked and channel Phone',
  'After the call: a summary, key points, next steps and the lead stage, saved with the record.',
  697,
  1157,
)
export const W3_TRANSCRIPT = fig(
  'dashboard-crop-hindi-call-transcript',
  'Hindi call transcript in the Vistrow Voice dashboard: Artha greets a clinic caller, books a Thursday 5 pm consultation and says the fee will be shared on WhatsApp',
  'A clinic call in Hindi, as it appears in the transcript: the slot is booked and the fee question goes to the team.',
  1200,
  1011,
)
export const W3_OVERVIEW_CROP = fig(
  'dashboard-crop-overview-calls-leads',
  'Overview panel in the Vistrow Voice dashboard: calls handled, minutes left with a top-up button, qualified leads and appointments booked',
  'Usage sits on the overview: calls handled and minutes left, beside the leads and appointments they produced.',
  1200,
  484,
)
export const W3_CALL_FLOW = fig(
  'product-call-flow-ring-to-crm',
  'What happens on every call, from the first ring through Artha answering, understanding the need, booking or transferring, to the saved CRM record',
  'Every part of a call, from the first ring to the saved record.',
)
export const W3_LANGUAGES_MAP = fig(
  'call-languages-in-native-scripts-map',
  'Call languages in their own scripts: Hindi, Marathi, Gujarati, Punjabi, Bengali, Odia, Kannada, Telugu, Malayalam and Tamil, with Artha switching mid-call when the caller does',
  '130+ languages, including 10 Indian languages and English, on phone and website calls.',
)
export const W3_WIDGET = fig(
  'website-voice-call-widget-artha',
  'Website voice call widget on a property site: a visitor talks to Artha in the browser, without a phone number',
  'A website call runs in the visitor’s browser: no phone number, the same agent.',
)
export const W3_HANDOFF = fig(
  'ai-voice-agent-call-transfer-handoff',
  'Handing a call to a person: the caller asks for someone, Artha dials a colleague into the same call, waits on the line and steps back once they answer',
  'When a call needs a person, Artha dials your colleague in and stays on until they answer.',
)
export const W3_SCORECARD = fig(
  'voice-ai-vendor-real-call-test-scorecard',
  'Blank scorecard for testing voice AI tools on the same real call: languages, speed, handoffs, CRM output and controls',
  'Run the same real call on each tool you test and tick each row yourself.',
)

// /ai-ivr: the three page images already in pageFigures.ts.
export const W3_IVR_MENU_VS_SPOKEN = fig(
  'ai-ivr-keypad-menu-vs-spoken-request',
  'Press-1 phone menu compared with a caller simply saying what they need to Artha on an AI IVR',
  'With an AI IVR the caller says what they need instead of choosing from a keypad menu.',
)
export const W3_IVR_CALL_FLOW = fig(
  'ai-ivr-call-flow-hello-to-booking',
  'AI IVR call flow: the caller says what they need, Artha understands it in their language, answers, books or transfers, and the team gets the recording, transcript and summary',
  'How an AI IVR call runs, from the caller’s first words to a booking, a message or a transfer.',
)
export const W3_IVR_SIP = fig(
  'ai-ivr-keep-existing-number-sip',
  'Diagram of an existing business number connected over SIP to Artha, the AI agent, with the line’s hours, active days and concurrent-call limit',
  'Keep the number your callers know: it connects over SIP to your agent, with its own hours and call limit.',
)

// /vs-ivr
export const W3_FOUR_WAYS = fig(
  'ivr-vs-ai-voice-agent-vs-chatbot-vs-receptionist',
  'Comparison of menu IVR, AI voice agent, chatbot and human receptionist on answering calls, availability, languages, booking and call records',
  'Four ways to handle calls, compared on five points from the table below.',
  1600,
  1060,
)

// Buyer guides (/:slug): a hero visual and visuals beside named sections.
export interface GuideVisuals {
  hero: PageFigureData
  heroChips?: [{ label: string; live?: boolean }, { label: string; icon?: string }]
  /** Keyed by section title. */
  sections: Record<string, PageFigureData>
}

export const GUIDE_VISUALS: Record<string, GuideVisuals> = {
  'best-ai-voice-calling-software-india': {
    hero: W3_SCORECARD,
    sections: {
      'Start with the real call type': W3_CALL_FLOW,
      'Check Indian-language behavior': W3_LANGUAGES_MAP,
      'Demand CRM-ready output': W3_CALL_SUMMARY,
    },
  },
  'ai-voice-bot-pricing-india': {
    hero: W3_LAPTOP_OVERVIEW,
    heroChips: [
      { label: 'Usage on every call', live: true },
      { label: 'Call-level credit breakdown', icon: 'receipt_long' },
    ],
    sections: {
      'The cost stack': W3_CALL_FLOW,
      'How Vistrow thinks about pricing': W3_OVERVIEW_CROP,
      'Phone calls and website calls cost differently': W3_WIDGET,
    },
  },
}

/** Fallback for a guide added later without its own visuals. */
export const DEFAULT_GUIDE_VISUALS: GuideVisuals = { hero: W3_SCORECARD, sections: {} }
