// Moves the queued blog post for a date from content-queue/blog/ onto the site:
//   - appends it to DAILY_POSTS (+ image alt, sources, contextual links) in src/content/dailyBlogPosts.ts
//   - copies its two cover images to public/blog/
//   - applies its inbound links (blog post contextual sentence, language page guides, page guides)
//   - removes it from the queue and marks the calendar row Published
//
//   npx tsx scripts/publish-queued-post.mts [--date YYYY-MM-DD] [--dry-run]
//
// Default date is today in India. Exits 2 when nothing is queued for the date.
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const date = args.includes('--date')
  ? args[args.indexOf('--date') + 1]
  : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
const QUEUE = 'content-queue/blog'
const DAILY = 'src/content/dailyBlogPosts.ts'
const PLAN = '../docs/SEO-BLOG-PLAN-2026-10-21.md'

const file = readdirSync(QUEUE).filter((f) => f.endsWith('.json')).find((f) => JSON.parse(readFileSync(`${QUEUE}/${f}`, 'utf8')).publishOn === date)
if (!file) {
  console.log(`nothing queued for ${date}`)
  process.exit(2)
}
const q = JSON.parse(readFileSync(`${QUEUE}/${file}`, 'utf8'))
const edits = new Map<string, string>()
const read = (path: string) => edits.get(path) ?? readFileSync(path, 'utf8')
const write = (path: string, text: string) => edits.set(path, text)
const sq = (text: string) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

// 1. The post entry and its maps.
let daily = read(DAILY)
if (daily.includes(`slug: '${q.slug}'`) || daily.includes(`"slug": "${q.slug}"`)) throw new Error(`${q.slug} is already in DAILY_POSTS`)
const post = {
  slug: q.slug, title: q.title, seoTitle: q.seoTitle, metaDescription: q.metaDescription, shortAnswer: q.shortAnswer,
  excerpt: q.excerpt, category: q.category, publishedAt: date, readTime: '', related: q.related, sections: q.sections, faqs: q.faqs,
}
const insertBefore = (text: string, marker: string, addition: string) => {
  const at = text.indexOf(marker)
  if (at < 0) throw new Error(`marker not found: ${marker.slice(0, 40)}`)
  return text.slice(0, at) + addition + text.slice(at)
}
daily = insertBefore(daily, '\n]\n\nexport const DAILY_IMAGE_ALTS', `\n  ${JSON.stringify(post, null, 2).replace(/\n/g, '\n  ')},`)
const mapEnd = (name: string) => {
  const start = daily.indexOf(`export const ${name}`)
  const end = daily.indexOf('\n}\n', start)
  if (start < 0 || end < 0) throw new Error(`map not found: ${name}`)
  return end
}
const addToMap = (name: string, line: string) => {
  const end = mapEnd(name)
  daily = daily.slice(0, end) + `\n  ${line}` + daily.slice(end)
}
addToMap('DAILY_IMAGE_ALTS', `${sq(q.slug)}: ${sq(q.imageAlt)},`)
addToMap('DAILY_SOURCES', `${sq(q.slug)}: ${JSON.stringify(q.sources)},`)
addToMap('DAILY_CONTEXTUAL_LINKS', `${sq(q.slug)}: ${sq(q.contextualLinks)},`)
write(DAILY, daily)

// 2. Inbound links.
const SENTENCE_MAPS: [string, string][] = [
  [DAILY, 'DAILY_CONTEXTUAL_LINKS'],
  ['src/content/voiceBlog.ts', 'CONTEXTUAL_LINK_PARAGRAPHS'],
  ['src/content/ivrBlogPosts.ts', 'IVR_CONTEXTUAL_LINKS'],
]
// Only inside the contextual-link maps: the same slug key also appears in the
// image-alt and sources maps, which must never receive a link sentence.
const appendToSentenceMap = (slug: string, sentence: string) => {
  for (const [path, mapName] of SENTENCE_MAPS) {
    const text = read(path)
    const start = text.indexOf(`const ${mapName}`)
    if (start < 0) continue
    const end = text.indexOf('\n}\n', start)
    const block = text.slice(start, end)
    const re = new RegExp(`^(\\s*'${slug}': )'((?:[^'\\\\]|\\\\.)*)',$`, 'm')
    const m = re.exec(block)
    if (!m) continue
    const updated = block.replace(re, () => `${m[1]}'${m[2]} ${sq(sentence).slice(1, -1)}',`)
    write(path, text.slice(0, start) + updated + text.slice(end))
    return `${path} ${mapName}`
  }
  throw new Error(`no contextual sentence found for blog:${slug}`)
}
const addToListMap = (path: string, mapName: string, key: string, sentence: string) => {
  let text = read(path)
  const start = text.indexOf(`export const ${mapName}`)
  const end = text.indexOf('\n}\n', start)
  const existing = new RegExp(`^(\\s*${sq(key).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}: \\[)$`, 'm')
  const block = text.slice(start, end)
  if (existing.test(block)) {
    const m = existing.exec(text.slice(start))!
    const at = start + m.index + m[0].length
    text = text.slice(0, at) + `\n    ${sq(sentence)},` + text.slice(at)
  } else {
    text = text.slice(0, end) + `\n  ${sq(key)}: [\n    ${sq(sentence)},\n  ],` + text.slice(end)
  }
  write(path, text)
}
const addLanguageGuide = (slug: string, sentence: string) => {
  const path = 'src/lib/marketingContent.ts'
  let text = read(path)
  const key = `    slug: '${slug}',\n`
  const at = text.indexOf(key)
  if (at < 0) throw new Error(`language page not found: ${slug}`)
  const next = text.indexOf('\n  },', at)
  const entry = text.slice(at, next)
  const guidesAt = entry.indexOf('    guides: [\n')
  if (guidesAt >= 0) {
    const insertAt = at + guidesAt + '    guides: [\n'.length
    text = text.slice(0, insertAt) + `      ${sq(sentence)},\n` + text.slice(insertAt)
  } else {
    const insertAt = at + key.length
    text = text.slice(0, insertAt) + `    guides: [\n      ${sq(sentence)},\n    ],\n` + text.slice(insertAt)
  }
  write(path, text)
}
const applied: string[] = []
for (const ib of q.inbound) {
  const [kind, ref] = String(ib.target).split(/:(.+)/)
  if (kind === 'blog') applied.push(`blog:${ref} -> ${appendToSentenceMap(ref, ib.sentence)}`)
  else if (kind === 'language') { addLanguageGuide(ref, ib.sentence); applied.push(`language:${ref}`) }
  else if (kind === 'page') { addToListMap('src/content/pageGuides.ts', 'PAGE_GUIDES', ref, ib.sentence); applied.push(`page:${ref}`) }
  else throw new Error(`unknown inbound target ${ib.target}`)
}

// 3. Calendar status.
const plan = read(PLAN)
const row = new RegExp(`^(\\| ${q.n} \\|.*\\|) +(\\|)$`, 'm')
if (row.test(plan)) write(PLAN, plan.replace(row, `$1 Published ${date} $2`))

console.log(`${dryRun ? '[dry run] ' : ''}publish ${file} as ${q.slug} (${date})`)
console.log(`inbound: ${applied.join(', ')}`)
if (dryRun) process.exit(0)
for (const [path, text] of edits) writeFileSync(path, text)
for (const img of [`${q.slug}.jpg`, `${q.slug}-640.jpg`]) {
  copyFileSync(`${QUEUE}/${img}`, `public/blog/${img}`)
  rmSync(`${QUEUE}/${img}`)
}
rmSync(`${QUEUE}/${file}`)
console.log(`done: edited ${[...edits.keys()].join(', ')}; images in public/blog; queue entry removed`)
if (!existsSync(`public/blog/${q.slug}.jpg`)) throw new Error('image copy failed')
