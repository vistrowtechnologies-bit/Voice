// Per-route prerendering: real page HTML plus head tags, without a real
// browser.
//
// This is a Vite SPA with no SSR wired into the client bundle - React only
// ever mounts into an empty <div id="root">, and Seo.tsx sets <title>/meta
// tags via a useEffect. Neither reaches a crawler that doesn't execute JS,
// which is most AI/answer-engine crawlers (GPTBot, ClaudeBot,
// PerplexityBot, CCBot) as well as link-preview bots (LinkedIn, WhatsApp,
// Slack, iMessage) - every route showed an empty body and the homepage's
// static card. A prior version of this script drove a real headless
// Chromium (Playwright) to render each route and capture the resulting
// HTML - but Vercel's build container is missing shared libs Chromium
// needs (libnspr4.so etc), so every build failed outright.
//
// Instead: use react-dom/server's renderToString (via the separate SSR
// bundle built from entry-server.tsx - see package.json's build script)
// to render each route's actual component tree to a HTML string, and
// inject that into a copy of the built index.html's <div id="root">. Head
// tags (title, meta description, canonical, og:*, twitter:*) are mirrored
// from the same content data each page's <Seo> props are built from, same
// as before. No browser, no native deps - just Node.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url)) + '/..'
const { render } = await import('../dist-ssr/entry-server.js')

const {
  SEO_ORIGIN: CANONICAL_ORIGIN,
  SEO_LAST_SIGNIFICANT_UPDATE,
  SEO_PAGES: PAGES,
} = await import('../src/lib/seoPages.ts')

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function escapeAttr(s) {
  return escapeHtml(s)
}

function applyPage(template, page, bodyHtml) {
  const url = `${CANONICAL_ORIGIN}${page.path}`
  const title = escapeHtml(page.title)
  const description = escapeAttr(page.description)
  const image = escapeAttr(page.image)
  const imageAlt = escapeAttr(page.imageAlt)

  return template
    .replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${description}$2`)
    .replace(/(<meta\s+name="robots"\s+content=")[^"]*(")/, `$1${page.noindex ? 'noindex, follow' : 'index, follow'}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${title}$2`)
    .replace(/(<meta\s*\n?\s*property="og:description"\s*\n?\s*content=")[^"]*(")/, `$1${description}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`)
    .replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${image}$2`)
    .replace(/(<meta property="og:image:secure_url" content=")[^"]*(")/, `$1${image}$2`)
    .replace(/(<meta property="og:image:alt" content=")[^"]*(")/, `$1${imageAlt}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${title}$2`)
    .replace(/(<meta\s*\n?\s*name="twitter:description"\s*\n?\s*content=")[^"]*(")/, `$1${description}$2`)
    .replace(/(<meta name="twitter:image" content=")[^"]*(")/, `$1${image}$2`)
    .replace(/(<meta name="twitter:image:alt" content=")[^"]*(")/, `$1${imageAlt}$2`)
    .replace('<div id="root"></div>', `<div id="root">${bodyHtml}</div>`)
}

function applyAppShell(template) {
  return template
    .replace(/<title>.*?<\/title>/, '<title>Vistrow Voice App</title>')
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, '$1Secure Vistrow Voice account and workspace application.$2')
    .replace(/(<meta\s+name="robots"\s+content=")[^"]*(")/, '$1noindex, nofollow, noarchive$2')
    .replace(/\s*<link rel="canonical" href="[^"]*"\s*\/>/, '')
}

function sitemapXml() {
  const rows = PAGES.filter((page) => !page.noindex)
    .map((page) => `  <url><loc>${CANONICAL_ORIGIN}${page.path}</loc><lastmod>${SEO_LAST_SIGNIFICANT_UPDATE}</lastmod></url>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows}\n</urlset>\n`
}

function outputPathFor(route) {
  if (route === '/') return path.join(ROOT, 'dist', 'index.html')
  return path.join(ROOT, 'dist', route.replace(/^\//, ''), 'index.html')
}

async function main() {
  const template = await readFile(path.join(ROOT, 'dist', 'index.html'), 'utf8')

  // '/' prerenders straight into dist/index.html below (outputPathFor), but
  // that exact file doubles as vercel.json's SPA-fallback shell for every
  // OTHER client-routed path — dashboard, admin, login, etc. Without this,
  // the fallback a dashboard hard-refresh gets back is the home page's own
  // SSR'd HTML (nav, hero, orb, the lot), visible until the JS bundle loads
  // and React replaces it: a multi-second flash of the marketing site on
  // every authenticated page. Snapshot the clean, empty-root shell here,
  // before the loop below bakes '/' into dist/index.html, so app routes
  // have a plain shell to fall back to instead. See vercel.json's rewrite
  // for app-bucket paths (kept in sync with hostBuckets.ts's APP_PREFIXES).
  await writeFile(path.join(ROOT, 'dist', 'app-shell.html'), applyAppShell(template))

  for (const page of PAGES) {
    const bodyHtml = render(page.path)
    if (!bodyHtml) throw new Error(`SSR render for ${page.path} produced no HTML`)
    const html = applyPage(template, page, bodyHtml)
    const outPath = outputPathFor(page.path)
    await mkdir(path.dirname(outPath), { recursive: true })
    await writeFile(outPath, html)
    console.log(`prerendered ${page.path} -> ${path.relative(ROOT, outPath)}`)
  }

  // A direct unknown marketing URL must be a real static-host 404, not a
  // 200 response containing the homepage. Vercel automatically serves this
  // file for filesystem misses once the catch-all SPA rewrite is removed.
  const notFound = {
    path: '/404',
    title: 'Page Not Found | Vistrow Voice',
    description: 'The page you requested could not be found.',
    image: `${CANONICAL_ORIGIN}/og/home.png`,
    imageAlt: 'Vistrow Voice multilingual AI voice agent orb',
    noindex: true,
  }
  const notFoundHtml = applyPage(template, notFound, render('/__vistrow-not-found__'))
    .replace(/\s*<link rel="canonical" href="[^"]*"\s*\/>/, '')
  await writeFile(path.join(ROOT, 'dist', '404.html'), notFoundHtml)
  await writeFile(path.join(ROOT, 'dist', 'sitemap.xml'), sitemapXml())
}

main()
