import type { PageFigureData } from '../../lib/pageFigures'

// Dashboard visuals placed by the wave-4 premium templates (/languages,
// /languages/:slug, /demo-calls/:slug). Kept out of pageFigures.ts so the
// redesign branches do not collide; move them there (and into the image
// sitemap) after merging. `after` names the section each one sits in.

const view = (name: string, alt: string, caption: string, width: number, height: number, after: string): PageFigureData => ({
  src: `/media/pages/${name}.webp`,
  alt,
  caption,
  width,
  height,
  after,
})

export const W4_AGENT_LANGUAGE = (after: string) =>
  view(
    'dashboard-crop-agent-language-voice-welcome',
    'Agent page in the Vistrow Voice dashboard: the agent is live with a Hindi voice, the setup checklist is complete, and the welcome message greets callers in Hindi',
    'The agent page: its voice and language, the welcome message callers hear first, and a Talk now button to test it.',
    1200,
    618,
    after,
  )

export const W4_CALL_SUMMARY = (after: string) =>
  view(
    'dashboard-crop-call-summary-lead-fields',
    'Call summary in the Vistrow Voice dashboard: what the caller asked, what was booked, key points, next steps, sentiment, lead stage and channel',
    'After every call: a summary, key points, next steps and the lead stage, whatever language the call ran in.',
    697,
    1157,
    after,
  )

export const W4_MIXED_TRANSCRIPT = (after: string) =>
  view(
    'dashboard-crop-hindi-call-transcript',
    'Hindi call transcript in the Vistrow Voice dashboard, with English words, a name, a date and a time inside Hindi sentences',
    'A saved Hindi transcript: English words, names, dates and times sit inside the Hindi lines, the way callers speak.',
    1200,
    1011,
    after,
  )
