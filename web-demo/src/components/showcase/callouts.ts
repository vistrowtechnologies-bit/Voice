import type { Callout } from './DashboardCallouts'

// Marker positions are measured against specific dashboard images in
// public/media/pages/, so each set only fits the view named beside it.

/** For dashboard-all-calls-history-laptop. */
export const CALLS_CALLOUTS: Callout[] = [
  { title: 'Filter by channel', body: 'Phone, web and website widget calls sit in one list, one tap apart.', x: 20, y: 31 },
  { title: 'Inbound and outbound together', body: 'Each row shows the direction, the duration and the page a website call came from.', x: 48, y: 42 },
  { title: 'Sentiment and the agent', body: 'See how each call went and which agent took it, then open the transcript.', x: 82, y: 42 },
]

/** For dashboard-agent-artha-setup-laptop. */
export const AGENT_CALLOUTS: Callout[] = [
  { title: 'Setup checklist', body: 'Persona, voice, knowledge, channel and go live, with a tick as each is done.', x: 52, y: 42 },
  { title: 'Every setting on one page', body: 'Instructions, voice and language, knowledge and tools, conversation and after the call.', x: 38, y: 51 },
  { title: 'Talk to it in the browser', body: 'Talk now runs a test call with the saved agent and your microphone.', x: 83, y: 59 },
]

/** For dashboard-call-transcript-hindi-laptop. */
export const CALL_DETAIL_CALLOUTS: Callout[] = [
  { title: 'The full transcript', body: 'Download it, or let it travel with the lead to your tools.', x: 32, y: 34 },
  { title: 'Summary and next steps', body: 'Why they called, what was agreed and what your team should do next.', x: 72, y: 36 },
  { title: 'Lead stage and channel', body: 'The fields the agent captured are saved with the call and sent on.', x: 68, y: 78 },
]

/** The default callouts for a dashboard view, keyed by its image src. */
export const CALLOUTS_BY_VIEW: Record<string, Callout[]> = {
  '/media/pages/dashboard-all-calls-history-laptop.webp': CALLS_CALLOUTS,
  '/media/pages/dashboard-agent-artha-setup-laptop.webp': AGENT_CALLOUTS,
  '/media/pages/dashboard-call-transcript-hindi-laptop.webp': CALL_DETAIL_CALLOUTS,
}
