import fs from 'node:fs'
import path from 'node:path'
import { SEO_ORIGIN, SEO_PAGES } from '../src/lib/seoPages'

const dist = path.resolve('dist')
const failures: string[] = []
const inbound = new Map(SEO_PAGES.map((page) => [page.path, new Set<string>()]))
const titles = new Map<string, string[]>()
const descriptions = new Map<string, string[]>()

const escapeHtml = (value: string) => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'")
const addValue = (map: Map<string, string[]>, value: string, route: string) => {
  const normalized = value.trim().replace(/\s+/g, ' ')
  map.set(normalized, [...(map.get(normalized) ?? []), route])
}
const pageFile = (route: string) => route === '/' ? path.join(dist, 'index.html') : path.join(dist, route.slice(1), 'index.html')

for (const page of SEO_PAGES.filter((entry) => !entry.noindex)) {
  const file = pageFile(page.path)
  if (!fs.existsSync(file)) {
    failures.push(`${page.path}: missing prerendered HTML (${file})`)
    continue
  }
  const html = fs.readFileSync(file, 'utf8')
  const title = html.match(/<title>([^<]*)<\/title>/i)?.[1]
  const meta = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1]
  const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1]
  const h1Count = [...html.matchAll(/<h1\b/gi)].length

  if (!title) failures.push(`${page.path}: missing title`)
  else addValue(titles, escapeHtml(title), page.path)
  if (!meta) failures.push(`${page.path}: missing meta description`)
  else addValue(descriptions, escapeHtml(meta), page.path)
  if (canonical !== `${SEO_ORIGIN}${page.path === '/' ? '/' : page.path}`) failures.push(`${page.path}: canonical mismatch (${canonical ?? 'missing'})`)
  if (h1Count !== 1) failures.push(`${page.path}: expected exactly one prerendered H1, found ${h1Count}`)

  for (const match of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1]
    if (!href.startsWith('/')) continue
    const target = href.split(/[?#]/, 1)[0].replace(/\/$/, '') || '/'
    if (target !== page.path && inbound.has(target)) inbound.get(target)?.add(page.path)
  }
}

for (const [title, routes] of titles) if (routes.length > 1) failures.push(`duplicate title on ${routes.join(', ')}: ${title}`)
for (const [description, routes] of descriptions) if (routes.length > 1) failures.push(`duplicate description on ${routes.join(', ')}: ${description}`)
for (const [route, sources] of inbound) {
  if (route !== '/' && sources.size === 0) failures.push(`${route}: orphaned (no crawlable internal links from another indexed route)`)
}

if (failures.length) {
  console.error(`SEO route audit failed (${failures.length} findings):\n- ${failures.join('\n- ')}`)
  process.exitCode = 1
} else {
  console.log(`SEO route audit passed: ${SEO_PAGES.filter((page) => !page.noindex).length} indexable routes have unique titles and descriptions, canonicals, one H1, prerendered HTML, and at least one internal inbound link.`)
}
