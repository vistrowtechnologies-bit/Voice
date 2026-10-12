import { Link, useLocation } from 'react-router-dom'
import { SEO_BY_PATH, SEO_PAGES } from '../lib/seoPages'

const CORE_LINKS: Record<string, string[]> = {
  '/': ['/product', '/solutions', '/languages', '/pricing', '/resources/blog'],
  '/product': ['/best-ai-voice-calling-software-india', '/ai-voice-bot-pricing-india', '/pricing', '/compare/sarvam-ai'],
  '/solutions': ['/best-ai-voice-calling-software-india', '/languages', '/product/agents', '/contact'],
  '/pricing': ['/ai-voice-bot-pricing-india', '/product', '/contact'],
  '/best-ai-voice-calling-software-india': ['/product', '/solutions', '/compare/sarvam-ai', '/pricing'],
  '/ai-voice-bot-pricing-india': ['/pricing', '/product', '/compare/elevenlabs', '/contact'],
  '/resources/docs': ['/help', '/product/agents', '/product/widget', '/product/integrations'],
  '/vs-ivr': ['/product/inbound', '/product/agents', '/compare/sarvam-ai', '/contact'],
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
    links.add('/languages')
    links.add('/product/widget')
    links.add('/contact')
  } else if (entry.kind === 'solution') {
    links.add('/solutions')
    links.add('/product/agents')
    links.add('/contact')
  } else if (path.startsWith('/compare/')) {
    links.add('/product')
    links.add('/pricing')
    links.add('/vs-ivr')
    links.add('/contact')
  } else if (path.startsWith('/demo-calls/')) {
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

/** Small, crawlable contextual links connect every public page to its topic cluster. */
export function SeoRelatedLinks() {
  const { pathname } = useLocation()
  const paths = relatedPaths(pathname)
  if (paths.length === 0) return null

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
    </nav>
  )
}
