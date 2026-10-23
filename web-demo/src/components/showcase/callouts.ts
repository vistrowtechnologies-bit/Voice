import type { Callout } from './DashboardCallouts'

// Marker positions are measured against specific dashboard images in
// public/media/pages/, so each set only fits the view named beside it.
// Each marker sits in empty space next to the part it names (a panel
// header, a column edge), never on top of the text it points at.

/** For dashboard-all-calls-history-laptop. */
export const CALLS_CALLOUTS: Callout[] = [
  { title: 'Filter by channel', body: 'Phone, web and website widget calls sit in one list, one tap apart.', x: 9.8, y: 30 },
  { title: 'Inbound and outbound together', body: 'Each row shows the direction, the duration and the page a website call came from.', x: 52.6, y: 32.6 },
  { title: 'Sentiment and the agent', body: 'See how each call went and which agent took it, then open the transcript.', x: 79.6, y: 41.5 },
]

/** For dashboard-agent-artha-setup-laptop. */
export const AGENT_CALLOUTS: Callout[] = [
  { title: 'Setup checklist', body: 'Persona, voice, knowledge, channel and go live, with a tick as each is done.', x: 41, y: 34.5 },
  { title: 'Every setting on one page', body: 'Instructions, voice and language, knowledge and tools, conversation and after the call.', x: 60, y: 50 },
  { title: 'Talk to it in the browser', body: 'Talk now runs a test call with the saved agent and your microphone.', x: 93.4, y: 51 },
]

/** For dashboard-call-transcript-hindi-laptop. */
export const CALL_DETAIL_CALLOUTS: Callout[] = [
  { title: 'The full transcript', body: 'Download it, or let it travel with the lead to your tools.', x: 36, y: 26.5 },
  { title: 'Summary and next steps', body: 'Why they called, what was agreed and what your team should do next.', x: 83.4, y: 41 },
  { title: 'Lead stage and channel', body: 'The fields the agent captured are saved with the call and sent on.', x: 78, y: 64.8 },
]

/** The default callouts for a dashboard view, keyed by its image src. */
export const CALLOUTS_BY_VIEW: Record<string, Callout[]> = {
  '/media/pages/dashboard-all-calls-history-laptop.webp': CALLS_CALLOUTS,
  '/media/pages/dashboard-agent-artha-setup-laptop.webp': AGENT_CALLOUTS,
  '/media/pages/dashboard-call-transcript-hindi-laptop.webp': CALL_DETAIL_CALLOUTS,
}
