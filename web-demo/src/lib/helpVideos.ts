// How-to videos (1080p, captions burnt in) served from public/media/help/.
// Help articles name one in their `video` field (server/help_articles.py);
// dashboard pages get a "Watch how" button from HELP_VIDEO_BY_ROUTE.

export interface HelpVideo {
  title: string
  /** Shown on the button, e.g. "1:36". */
  length: string
  /** What the video teaches, short enough for the page's button. */
  topic: string
}

export const HELP_VIDEOS: Record<string, HelpVideo> = {
  'get-started': { title: 'Get started with Vistrow Voice', length: '1:44', topic: 'Getting started' },
  'build-with-ai': { title: 'Build an AI voice agent from one prompt', length: '1:36', topic: 'Build an agent with AI' },
  'create-and-edit-agent': { title: 'Create and edit an agent', length: '1:49', topic: 'Create an agent' },
  'testing-lab': { title: 'Test your agent in the Testing Lab', length: '1:34', topic: 'Test your agent' },
  'knowledge-base': { title: 'Give your agent your business facts', length: '1:43', topic: 'Add your business facts' },
  'connect-a-number': { title: 'Connect a phone number to your agent', length: '1:35', topic: 'Connect a number' },
  'website-widget': { title: 'Add the voice widget to your website', length: '1:27', topic: 'Add the website widget' },
  copilot: { title: 'Ask Artha Copilot to do it for you', length: '1:24', topic: 'Use Artha Copilot' },
}

export const helpVideoSrc = (slug: string) => `/media/help/${slug}.mp4`
export const helpVideoPoster = (slug: string) => `/media/help/${slug}.jpg`

export const HELP_VIDEO_BY_ROUTE: Record<string, string> = {
  '/dashboard': 'get-started',
  '/dashboard/agents': 'create-and-edit-agent',
  '/dashboard/agents/new': 'build-with-ai',
  '/dashboard/testing': 'testing-lab',
  '/dashboard/knowledge': 'knowledge-base',
  '/dashboard/numbers': 'connect-a-number',
  '/dashboard/inbound': 'connect-a-number',
  '/dashboard/website-widget': 'website-widget',
  '/dashboard/support': 'copilot',
}

/** The video for the current page, matching the longest route prefix (as helpTopicFor does). */
export function helpVideoFor(pathname: string): string | null {
  const match = Object.keys(HELP_VIDEO_BY_ROUTE)
    .filter((route) => pathname === route || (route !== '/dashboard' && pathname.startsWith(`${route}/`)))
    .sort((a, b) => b.length - a.length)[0]
  return match ? HELP_VIDEO_BY_ROUTE[match] : null
}
