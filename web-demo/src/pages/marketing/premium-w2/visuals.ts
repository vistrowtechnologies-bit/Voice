// Visuals for the wave 2 premium pages (/ai-receptionist, /voice-bot,
// /ai-call-center, /ai-telecaller, /ai-calling-agent, /voice-ai-platform).
// Most reuse an image already described in pageFigures.ts, looked up by file
// name so its alt text and caption stay in one place; the appointments
// calendar crop is new. These are passed to the showcase kit as props and
// can move into PAGE_FIGURES (and so the image sitemap) after merging.

import { PAGE_FIGURES, type PageFigureData } from '../../../lib/pageFigures'

const ALL = Object.values(PAGE_FIGURES).flat()

/** An existing figure by file name (without folder or extension). */
function existing(name: string): PageFigureData {
  const src = `/media/pages/${name}.webp`
  const found = ALL.find((figure) => figure.src === src)
  if (!found) throw new Error(`premium-w2 visuals: no figure for ${src}`)
  return { src: found.src, alt: found.alt, caption: found.caption, width: found.width, height: found.height, after: 'premium-w2' }
}

const APPOINTMENTS_CALENDAR: PageFigureData = {
  src: '/media/pages/dashboard-crop-appointments-calendar.webp',
  alt: 'Appointments calendar in the Vistrow Voice dashboard: month view with bookings made by the AI agent, and totals for confirmed, completed and no-show appointments',
  caption: 'Bookings the agent makes land in the Appointments calendar, where your team can confirm, reschedule or mark them.',
  width: 1200,
  height: 673,
  after: 'premium-w2',
}

// Already in public/media/pages/ but not yet placed on any page.
const OVERVIEW_TILES: PageFigureData = {
  src: '/media/pages/dashboard-crop-overview-calls-leads.webp',
  alt: 'Vistrow Voice dashboard overview tiles: calls handled, minutes left, calls, qualified leads, appointments and minutes used, compared with the period before',
  caption: 'The overview a supervisor opens first: calls, qualified leads, appointments and minutes against the previous period.',
  width: 1200,
  height: 484,
  after: 'premium-w2',
}

export const W2_VISUALS = {
  '/ai-receptionist': {
    hero: existing('ai-receptionist-appointment-booking-call'),
    phone: existing('clinic-ai-receptionist-patient-call'),
    website: existing('website-voice-call-widget-artha'),
    day: existing('ai-receptionist-four-call-types'),
    handover: existing('ai-voice-agent-call-transfer-handoff'),
    calendar: APPOINTMENTS_CALENDAR,
    languages: existing('call-languages-in-native-scripts-map'),
    record: existing('dashboard-crop-call-summary-lead-fields'),
  },
  '/voice-bot': {
    hero: existing('dashboard-call-transcript-hindi-laptop'),
    menu: existing('ai-ivr-keypad-menu-vs-spoken-request'),
    turn: existing('voice-bot-listen-decide-speak-act'),
    agent: existing('dashboard-agent-artha-setup-laptop'),
  },
  '/ai-call-center': {
    hero: existing('dashboard-all-calls-history-laptop'),
    split: existing('ai-call-center-agent-team-split'),
    handover: existing('ai-voice-agent-call-transfer-handoff'),
    campaigns: existing('dashboard-crop-outbound-campaign-progress'),
    checks: existing('outbound-pre-dial-dnc-calling-window-checks'),
    overview: OVERVIEW_TILES,
  },
  '/ai-telecaller': {
    hero: existing('dashboard-outbound-campaigns-laptop'),
    flow: existing('ai-telecaller-new-lead-call-flow'),
    campaigns: existing('dashboard-crop-outbound-campaign-progress'),
    record: existing('dashboard-crop-call-summary-lead-fields'),
    checks: existing('outbound-pre-dial-dnc-calling-window-checks'),
  },
  '/ai-calling-agent': {
    hero: existing('dashboard-voice-agents-laptop'),
    flow: existing('product-call-flow-ring-to-crm'),
    types: existing('ai-calling-agent-four-call-types'),
    transcript: existing('dashboard-crop-hindi-call-transcript'),
    languages: existing('call-languages-in-native-scripts-map'),
    checks: existing('outbound-pre-dial-dnc-calling-window-checks'),
  },
  '/voice-ai-platform': {
    hero: existing('dashboard-overview-laptop'),
    map: existing('voice-ai-platform-nine-parts-map'),
    agent: existing('dashboard-agent-artha-setup-laptop'),
    languages: existing('call-languages-in-native-scripts-map'),
  },
} satisfies Record<string, Record<string, PageFigureData>>
