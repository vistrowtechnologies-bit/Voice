// Prerenders every public marketing route to its own static HTML file under
// dist/, so link-preview crawlers (LinkedIn, WhatsApp, Twitter/X, Slack,
// iMessage — none of which execute JavaScript) see that page's actual
// title/description/image instead of always falling back to whatever
// dist/index.html happens to contain. src/components/Seo.tsx already does
// this correctly for real browsers and Googlebot (both run JS) by mutating
// <head> on mount; this script runs a real headless Chromium against the
// already-built dist/ output so it renders through the exact same Seo.tsx
// logic — no second, hand-maintained copy of every page's title/description
// that could silently drift from the live one.
//
// Run after `vite build` (see package.json's "build" script) — dist/ must
// already exist. Vercel serves an exact static-file match (e.g.
// dist/pricing/index.html for a request to /pricing) before falling through
// to vercel.json's SPA catch-all rewrite, so this doesn't need any routing
// config changes on top of what's already there.

import { chromium } from 'playwright'
import { preview } from 'vite'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url)) + '/..'

const { PRODUCT_PAGES, SOLUTIONS, LANGUAGES } = await import('../src/lib/marketingContent.ts')

// Static marketing routes — mirrors src/App.tsx's public route list, minus
// auth/dashboard/admin pages (behind login, no social-share value) and
// dynamic-slug parents (expanded from data below instead, so they can never
// drift from what's actually linked on the overview pages).
const STATIC_ROUTES = [
  '/',
  '/product',
  '/solutions',
  '/pricing',
  '/about',
  '/contact',
  '/languages',
  '/integrations',
  '/vs-ivr',
  '/security',
  '/careers',
  '/changelog',
  '/resources/docs',
  '/privacy',
  '/terms',
]

const ROUTES = [
  ...STATIC_ROUTES,
  ...PRODUCT_PAGES.map((p) => p.to),
  ...SOLUTIONS.map((s) => s.to),
  ...LANGUAGES.map((l) => `/languages/${l.slug}`),
]

function outputPathFor(route) {
  if (route === '/') return path.join(ROOT, 'dist', 'index.html')
  return path.join(ROOT, 'dist', route.replace(/^\//, ''), 'index.html')
}

async function main() {
  const server = await preview({ root: ROOT, preview: { port: 4321, strictPort: true } })
  const base = server.resolvedUrls.local[0].replace(/\/$/, '')

  const browser = await chromium.launch()
  const page = await browser.newPage()

  const failures = []
  for (const route of ROUTES) {
    try {
      const res = await page.goto(`${base}${route}`, { waitUntil: 'networkidle' })
      if (!res || !res.ok()) throw new Error(`HTTP ${res?.status()}`)
      // Seo.tsx's useEffect runs on mount, which has already happened by the
      // time networkidle fires (React renders synchronously before any
      // network activity from that render settles) — this extra tick just
      // guards against a microtask-queued update landing a beat late.
      await page.waitForTimeout(50)
      const html = await page.content()
      const outPath = outputPathFor(route)
      await mkdir(path.dirname(outPath), { recursive: true })
      await writeFile(outPath, html)
      console.log(`prerendered ${route} -> ${path.relative(ROOT, outPath)}`)
    } catch (err) {
      failures.push([route, err.message])
      console.error(`FAILED ${route}: ${err.message}`)
    }
  }

  await browser.close()
  await server.close()

  if (failures.length) {
    console.error(`\n${failures.length} route(s) failed to prerender.`)
    process.exit(1)
  }
}

main()
