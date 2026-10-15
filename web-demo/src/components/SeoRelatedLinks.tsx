import { Link, useLocation } from 'react-router-dom'
import { SEO_BY_PATH, SEO_PAGES } from '../lib/seoPages'

const CORE_LINKS: Record<string, string[]> = {
  '/': ['/product', '/solutions', '/languages', '/pricing', '/resources/blog'],
  '/product': ['/best-ai-voice-calling-software-india', '/ai-voice-bot-pricing-india', '/pricing', '/compare/sarvam-ai'],
  '/solutions': ['/best-ai-voice-calling-software-india', '/languages', '/product/agents', '/contact'],
  '/voice-ai-platform': ['/product', '/product/agents', '/integrations', '/ai-call-center', '/voice-bot'],
  '/ai-call-center': ['/product/inbound', '/product/outbound', '/solutions/support', '/voice-ai-platform', '/security', '/ai-telecaller'],
  '/ai-telecaller': ['/product/outbound', '/product/inbound', '/ai-call-center', '/solutions/real-estate', '/languages'],
  '/voice-bot': ['/product/agents', '/vs-ivr', '/ai-voice-bot-pricing-india', '/voice-ai-platform', '/ai-call-center', '/ai-telecaller'],
  '/product/agents': ['/voice-ai-platform', '/voice-bot'],
  '/product/outbound': ['/ai-call-center', '/ai-telecaller'],
  '/solutions/support': ['/ai-call-center', '/voice-bot', '/ai-receptionist'],
  '/integrations': ['/voice-ai-platform'],
  '/pricing': ['/ai-voice-bot-pricing-india', '/product', '/contact'],
  '/best-ai-voice-calling-software-india': ['/product', '/solutions', '/compare/sarvam-ai', '/pricing'],
  '/ai-voice-bot-pricing-india': ['/pricing', '/product', '/compare/elevenlabs', '/contact', '/voice-bot'],
  '/resources/docs': ['/help', '/changelog', '/product/agents', '/product/widget', '/product/integrations'],
  '/vs-ivr': ['/ai-ivr', '/product/inbound', '/product/agents', '/compare/sarvam-ai', '/contact'],
  '/ai-ivr': ['/vs-ivr', '/ai-receptionist', '/product/inbound', '/languages', '/pricing'],
  '/ai-receptionist': ['/product/inbound', '/ai-ivr', '/solutions/healthcare', '/product/widget', '/pricing', '/languages/kannada', '/languages/telugu'],
  '/product/inbound': ['/ai-ivr', '/ai-receptionist'],
  '/solutions/healthcare': ['/ai-receptionist'],
  '/solutions/real-estate': ['/ai-receptionist', '/ai-telecaller', '/languages/kannada', '/languages/telugu'],
  '/solutions/finance': ['/ai-receptionist'],
  // Company and legal pages: link out to the product and to each other, so
  // none of them depends on the footer alone.
  '/about': ['/product', '/languages', '/careers', '/changelog', '/security'],
  '/careers': ['/about', '/product', '/changelog', '/contact'],
  '/changelog': ['/product', '/resources/docs', '/careers', '/about'],
  '/contact': ['/pricing', '/about', '/careers', '/help'],
  '/security': ['/privacy', '/terms', '/about', '/help/compliance/consent-recording-retention'],
  '/privacy': ['/security', '/terms', '/help/compliance/consent-recording-retention', '/contact'],
  '/terms': ['/privacy', '/security', '/pricing', '/contact'],
}

/** Set-up guides shown under "Explore related": the help articles a reader of
 *  this page would open next. Help pages otherwise depend on the help index. */
const GUIDE_LINKS: Record<string, string[]> = {
  '/product/agents': ['/help/agents/create-and-edit-agent', '/help/voices/choose-voices', '/help/testing-lab/quick-browser-test'],
  '/product/inbound': ['/help/inbound', '/help/phone-numbers', '/help/phone-numbers/connect-a-number'],
  '/product/outbound': ['/help/outbound', '/help/contacts/phone-number-format', '/help/compliance/calling-rules'],
  '/product/knowledge-base': ['/help/knowledge-base/add-knowledge', '/help/knowledge-base/live-catalog'],
  '/product/widget': ['/help/website-widget/add-widget', '/help/website-widget/page-rules', '/help/testing-lab/quick-browser-test'],
  '/product/integrations': ['/help/integrations/connect-integrations', '/help/calls', '/help/settings/notifications-and-privacy'],
  '/pricing': ['/help/billing/how-credits-work', '/help/billing/plans'],
  '/ai-receptionist': ['/help/appointments', '/help/appointments/manage-appointments', '/help/inbound'],
  '/solutions/healthcare': ['/help/appointments', '/help/compliance/consent-recording-retention'],
  '/ai-telecaller': ['/help/outbound', '/help/contacts/phone-number-format', '/help/calls'],
  '/ai-call-center': ['/help/calls', '/help/calls/find-a-call', '/help/phone-numbers'],
  '/voice-ai-platform': ['/help/agents/build-with-ai', '/help/help-and-support/copilot', '/help/voices'],
  '/languages': ['/help/voices', '/help/voices/choose-voices'],
  '/resources/docs': ['/help/getting-started', '/help/help-and-support/copilot', '/help/help-and-support/contact-support'],
  '/contact': ['/help/help-and-support/contact-support'],
  '/security': ['/help/settings/notifications-and-privacy'],
}

const COMPARE_PATHS = SEO_PAGES.filter((page) => page.path.startsWith('/compare/')).map((page) => page.path)
const DEMO_PATHS = SEO_PAGES.filter((page) => page.path.startsWith('/demo-calls/')).map((page) => page.path)
const LOCAL_RE_PATHS = SEO_PAGES.filter((page) => page.path.startsWith('/solutions/real-estate/')).map((page) => page.path)

/** The next `count` entries after `path` in `list`, wrapping round, so every
 *  member of a group is linked from its neighbours. */
function siblings(list: string[], path: string, count: number): string[] {
  const index = list.indexOf(path)
  if (index < 0 || list.length < 2) return []
  return Array.from({ length: Math.min(count, list.length - 1) }, (_, i) => list[(index + i + 1) % list.length])
}

function relatedPaths(pathname: string): string[] {
  const path = pathname.replace(/\/$/, '') || '/'
  const entry = SEO_BY_PATH.get(path)
  if (!entry) return []

  const links = new Set(CORE_LINKS[path] ?? [])
  const segments = path.split('/').filter(Boolean)

  // Preserve a clear route hierarchy: every detail page links back to its
  // nearest registered collection and gets a few sibling discovery paths.
  for (let depth = segments.length - 1; depth > 0; depth -= 1) {
    const parent = `/${segments.slice(0, depth).join('/')}`
    if (SEO_BY_PATH.has(parent)) {
      links.add(parent)
      break
    }
  }

  const directChildren = SEO_PAGES.filter((candidate) => {
    if (candidate.path === path) return false
    const remainder = candidate.path.slice(path === '/' ? 1 : path.length + 1)
    return candidate.path.startsWith(path === '/' ? '/' : `${path}/`) && remainder.length > 0 && !remainder.includes('/')
  }).slice(0, 4)
  directChildren.forEach((child) => links.add(child.path))

  if (entry.kind === 'article') {
    links.add('/resources/blog')
    links.add('/product')
    const articles = SEO_PAGES.filter((candidate) => candidate.kind === 'article' && candidate.path !== path)
    const slug = path.split('/').at(-1) ?? ''
    const terms = slug.split('-').filter((term) => term.length > 3)
    const related = articles
      .map((candidate) => ({ candidate, score: terms.filter((term) => candidate.path.includes(term)).length }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
    related.forEach(({ candidate }) => links.add(candidate.path))
  } else if (entry.kind === 'language') {
    // A language page links to the sample call and the local real-estate
    // guide in the same language, when they exist.
    const slug = path.split('/').at(-1) ?? ''
    ;[...DEMO_PATHS, ...LOCAL_RE_PATHS].filter((candidate) => candidate.split('/').at(-1)?.startsWith(`${slug}-`)).forEach((candidate) => links.add(candidate))
    links.add('/languages')
    links.add('/product/widget')
    links.add('/contact')
  } else if (entry.kind === 'solution') {
    links.add('/solutions')
    links.add('/product/agents')
    links.add('/contact')
  } else if (path.startsWith('/compare/')) {
    siblings(COMPARE_PATHS, path, 2).forEach((candidate) => links.add(candidate))
    links.add('/product')
    links.add('/pricing')
    links.add('/vs-ivr')
    links.add('/contact')
  } else if (path.startsWith('/demo-calls/')) {
    siblings(DEMO_PATHS, path, 1).forEach((candidate) => links.add(candidate))
    links.add('/product/agents')
    links.add('/solutions/real-estate')
    links.add('/contact')
  } else if (path.startsWith('/help/')) {
    links.add('/help')
    links.add('/resources/docs')
    links.add('/contact')
  } else if (path.startsWith('/solutions/real-estate/')) {
    links.add('/solutions/real-estate')
    links.add('/product/outbound')
    links.add('/contact')
  } else if (path.startsWith('/languages/')) {
    links.add('/languages')
    links.add('/product/widget')
    links.add('/contact')
  } else if (path.startsWith('/best-') || path.startsWith('/ai-voice-')) {
    links.add('/resources/blog')
    links.add('/product')
    links.add('/pricing')
    links.add('/contact')
  } else if (entry.kind === 'product') {
    links.add('/product')
    links.add('/pricing')
    links.add('/contact')
  } else if (entry.kind === 'collection') {
    links.add('/product')
    links.add('/pricing')
  } else if (entry.kind === 'docs') {
    links.add('/help')
    links.add('/product')
  }

  links.delete(path)
  return [...links].filter((candidate) => SEO_BY_PATH.has(candidate)).slice(0, 5)
}

function guidePaths(pathname: string, exclude: string[]): string[] {
  const path = pathname.replace(/\/$/, '') || '/'
  return (GUIDE_LINKS[path] ?? []).filter((candidate) => SEO_BY_PATH.has(candidate) && !exclude.includes(candidate))
}

/** Small, crawlable contextual links connect every public page to its topic cluster. */
export function SeoRelatedLinks() {
  const { pathname } = useLocation()
  const paths = relatedPaths(pathname)
  const guides = guidePaths(pathname, paths)
  if (paths.length === 0 && guides.length === 0) return null

  return (
    <nav aria-label="Related pages" className="mx-auto max-w-7xl px-5 pb-10 md:px-8">
      <div className="rounded-2xl border border-border bg-surface/70 px-5 py-4 sm:flex sm:items-center sm:gap-5">
        <h2 className="shrink-0 text-xs font-bold uppercase tracking-widest text-text-muted">Explore related</h2>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 sm:mt-0">
          {paths.map((path) => {
            const page = SEO_BY_PATH.get(path)
            if (!page) return null
            return (
              <li key={path}>
                <Link className="text-sm font-medium text-primary underline-offset-4 hover:underline" to={path}>
                  {page.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
      {guides.length > 0 && (
        <div className="mt-3 rounded-2xl border border-border bg-surface/70 px-5 py-4 sm:flex sm:items-center sm:gap-5">
          <h2 className="shrink-0 text-xs font-bold uppercase tracking-widest text-text-muted">Set-up guides</h2>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 sm:mt-0">
            {guides.map((path) => (
              <li key={path}>
                <Link className="text-sm font-medium text-primary underline-offset-4 hover:underline" to={path}>
                  {SEO_BY_PATH.get(path)?.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  )
}
