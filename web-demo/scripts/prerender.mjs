// Per-route social-preview prerendering, without a real browser.
//
// This is a Vite SPA with no SSR - Seo.tsx sets <title>/meta tags via a
// useEffect, which link-preview crawlers (LinkedIn, WhatsApp, Slack,
// iMessage) never execute, so every route showed the homepage's static
// index.html card. A prior version of this script drove a real headless
// Chromium (Playwright) to render each route and capture the resulting
// HTML - but Vercel's build container is missing shared libs Chromium
// needs (libnspr4.so etc), so every build failed outright.
//
// Instead: mirror the small set of tags Seo.tsx upserts (title, meta
// description, canonical, og:*, twitter:*) directly against the same
// content data each page's <Seo> props are built from, and string-replace
// them into a copy of the built index.html per route. No browser, no
// native deps - just Node.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url)) + '/..'

const { PRODUCT_DETAIL, SOLUTIONS, LANGUAGES } = await import('../src/lib/marketingContent.ts')

const SUFFIX = ' - Vistrow Voice'

// Static pages: {path, title, description} exactly matching each page's own <Seo> props.
const STATIC_PAGES = [
  { path: '/', title: 'Multilingual AI Voice Agents | Vistrow Voice', description: 'Artha answers, qualifies, and books appointments in 10 Indian languages plus English, across inbound, outbound, and web conversations - 24/7.' },
  { path: '/product', title: `Product Overview${SUFFIX}`, description: 'Voice Agents, Inbound Calling, Outbound Campaigns, Knowledge Base, Website Call Widget, and Integrations - one platform for every AI voice conversation.' },
  { path: '/solutions', title: `Solutions by Industry${SUFFIX}`, description: 'Voice AI tuned to how your business takes calls - Real Estate, Healthcare, E-commerce, Finance & Collections, and Support & Helpdesk.' },
  { path: '/pricing', title: `Pricing${SUFFIX}`, description: 'Simple, credit-based plans for AI voice agents. Every plan includes the web call widget, call history, and analytics - scale up as your call volume grows.' },
  { path: '/about', title: `About${SUFFIX}`, description: "Vistrow Voice puts a capable AI agent on every call - in your customers' own language, at any hour. Voice AI, built for Bharat." },
  { path: '/contact', title: `Book a Demo${SUFFIX}`, description: 'See Vistrow Voice on a live call. Get a walkthrough tuned to your use case, watch Artha qualify a call in your language, and get a pricing and rollout plan.' },
  { path: '/languages', title: `AI Voice Agents in 10 Indian Languages + English${SUFFIX}`, description: 'Artha answers in Hindi, Marathi, Tamil, Telugu, Kannada, Bengali, Gujarati, Malayalam, Punjabi, Odia, and English - switching mid-call with the caller.' },
  { path: '/integrations', title: `Integrations${SUFFIX}`, description: 'Connect Vistrow Voice to your CRM, Slack, WhatsApp, Google Sheets, Zapier, n8n, Make, or any webhook endpoint.' },
  { path: '/vs-ivr', title: `AI Voice Agent vs. Traditional IVR${SUFFIX}`, description: 'Compare AI voice agents with phone menus and call desks across availability, languages, answer quality, records, and cost.' },
  { path: '/security', title: `Security & Trust${SUFFIX}`, description: 'How Vistrow Voice protects call data with workspace scoping, DNC enforcement, access controls, configurable retention, and clearly stated security limits.' },
  { path: '/careers', title: `Careers${SUFFIX}`, description: 'Work on real-time AI voice agents for Indian languages at Vistrow Voice. See open roles, or send us your CV.' },
  { path: '/changelog', title: `Changelog${SUFFIX}`, description: "What's new in Vistrow Voice: new voices, faster call connection, native appointment booking, compliance controls, and more." },
  { path: '/resources/docs', title: `Docs & Help${SUFFIX}`, description: 'Set up a Vistrow Voice AI agent: create an agent, add a knowledge base, connect a phone number or website widget, book appointments, and push leads to your CRM.' },
  { path: '/resources/blog', title: `Blog - Coming Soon${SUFFIX}`, description: 'Articles and practical guides from Vistrow Voice are coming soon.', noindex: true },
  { path: '/privacy', title: `Privacy Policy${SUFFIX}`, description: 'How Vistrow Voice collects, uses, shares, retains, and protects account, call, and integration data.' },
  { path: '/terms', title: `Terms of Service${SUFFIX}`, description: 'The terms that govern business use of Vistrow Voice, including acceptable use, billing, data, and compliance responsibilities.' },
]

const PRODUCT_ROUTES = Object.entries(PRODUCT_DETAIL).map(([route, page]) => ({
  path: route,
  title: `${page.headline}${SUFFIX}`,
  description: page.subhead,
}))

const SOLUTION_ROUTES = SOLUTIONS.map((s) => ({
  path: s.to,
  title: `${s.headline}${SUFFIX}`,
  description: s.subhead,
}))

const LANGUAGE_ROUTES = LANGUAGES.map((lang) => ({
  path: `/languages/${lang.slug}`,
  title: `AI Voice Agent in ${lang.name}${SUFFIX}`,
  description: `AI voice agents for ${lang.name} customer calls, with natural code-switching, qualification, and appointment booking - available 24/7.`,
}))

const PAGES = [...STATIC_PAGES, ...PRODUCT_ROUTES, ...SOLUTION_ROUTES, ...LANGUAGE_ROUTES]

const CANONICAL_ORIGIN = 'https://www.vistrowvoice.com'

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function escapeAttr(s) {
  return escapeHtml(s)
}

function applyPage(template, page) {
  const url = `${CANONICAL_ORIGIN}${page.path}`
  const title = escapeHtml(page.title)
  const description = escapeAttr(page.description)

  return template
    .replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${description}$2`)
    .replace(/(<meta\s+name="robots"\s+content=")[^"]*(")/, `$1${page.noindex ? 'noindex, follow' : 'index, follow'}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${title}$2`)
    .replace(/(<meta\s*\n?\s*property="og:description"\s*\n?\s*content=")[^"]*(")/, `$1${description}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${title}$2`)
    .replace(/(<meta\s*\n?\s*name="twitter:description"\s*\n?\s*content=")[^"]*(")/, `$1${description}$2`)
}

function outputPathFor(route) {
  if (route === '/') return path.join(ROOT, 'dist', 'index.html')
  return path.join(ROOT, 'dist', route.replace(/^\//, ''), 'index.html')
}

async function main() {
  const template = await readFile(path.join(ROOT, 'dist', 'index.html'), 'utf8')
  for (const page of PAGES) {
    const html = applyPage(template, page)
    const outPath = outputPathFor(page.path)
    await mkdir(path.dirname(outPath), { recursive: true })
    await writeFile(outPath, html)
    console.log(`prerendered ${page.path} -> ${path.relative(ROOT, outPath)}`)
  }
}

main()
