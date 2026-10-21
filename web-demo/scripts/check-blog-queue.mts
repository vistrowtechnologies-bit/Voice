// Validates queued blog posts (content-queue/blog/*.json) against the rules in
// docs/SEO-BLOG-PLAN-2026-10-21.md before they are scheduled.
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { VOICE_BLOG_POSTS } from '../src/content/voiceBlog'
import { seoForPath } from '../src/lib/seoPages'

const DIR = 'content-queue/blog'
const files = readdirSync(DIR).filter(f => /^\d{2}-.+\.json$/.test(f)).sort()
const posts = files.map(f => ({ file: f, ...JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')) }))
const live = new Set(VOICE_BLOG_POSTS.map(p => p.slug))
const BANNED = /\b(Retell|Vapi|Bland|Synthflow|PolyAI|Exotel|Knowlarity|Ozonetel|Twilio|Plivo|Sarvam|Gemini|ElevenLabs|OpenAI|ChatGPT|LiveKit|EnableX|Deepgram|Cartesia|Google Cloud)\b/
const PRICE = /(₹|\$|£|€|\bRs\.?\s?\d|\bINR\b|\bUSD\b|\bGBP\b|\bper minute\b.*\d|\d+\s?(paise|rupees|dollars|pounds))/i
const words = (t: string) => t.replace(/\[([^\]]+)\]\(\/[^)]+\)/g, '$1').trim().split(/\s+/).filter(Boolean).length
const linkTargets = (t: string) => [...t.matchAll(/\[([^\]]+)\]\((\/[^)\s]+)\)/g)].map(m => ({ anchor: m[1], path: m[2] }))
const seen = new Set<string>()
let problems: string[] = []
const check = (ok: unknown, msg: string) => { if (!ok) problems.push(msg) }

for (const p of posts) {
  const id = `${p.file}`
  const earlier = new Set(posts.filter(o => o.publishOn < p.publishOn).map(o => o.slug))
  const linkable = (path: string) => {
    const m = /^\/resources\/blog\/([^/#?]+)$/.exec(path)
    if (m) return live.has(m[1]) || earlier.has(m[1])
    return !!seoForPath(path)
  }
  for (const k of ['n','publishOn','primaryKeyword','slug','title','seoTitle','metaDescription','shortAnswer','excerpt','category','related','sections','faqs','imageAlt','imagePrompt','sources','contextualLinks','inbound']) check(p[k] !== undefined, `${id}: missing ${k}`)
  check(/^\d{4}-\d{2}-\d{2}$/.test(p.publishOn), `${id}: publishOn format`)
  check(!seen.has(p.slug) && !live.has(p.slug), `${id}: slug duplicate or already live`); seen.add(p.slug)
  check(p.file.startsWith(String(p.n).padStart(2, '0') + '-' + p.slug), `${id}: file name must be NN-slug.json`)
  check(p.seoTitle?.length <= 60, `${id}: seoTitle ${p.seoTitle?.length} > 60`)
  check(p.metaDescription?.length <= 155, `${id}: metaDescription ${p.metaDescription?.length} > 155`)
  const sa = words(p.shortAnswer ?? ''); check(sa >= 40 && sa <= 60, `${id}: shortAnswer ${sa} words`)
  check(p.faqs?.length >= 4 && p.faqs?.length <= 6, `${id}: faqs ${p.faqs?.length}`)
  check(p.sections?.length >= 6 && p.sections?.length <= 8, `${id}: sections ${p.sections?.length}`)
  check(p.imageAlt?.length > 30, `${id}: imageAlt too short`)
  check(p.related?.length === 3 && p.related.every((s: string) => (live.has(s) || earlier.has(s)) && s !== p.slug), `${id}: related must be 3 live/earlier slugs`)
  const body = (p.sections ?? []).flatMap((s: any) => [s.heading, ...s.paragraphs, ...(s.points ?? [])])
  const all = [p.title, p.seoTitle, p.metaDescription, p.shortAnswer, p.excerpt, ...body, ...(p.faqs ?? []).flatMap((f: any) => [f.q, f.a]), p.contextualLinks, p.imageAlt, ...(p.inbound ?? []).map((i: any) => i.sentence)].join('\n')
  const total = words([p.shortAnswer, ...body, ...(p.faqs ?? []).flatMap((f: any) => [f.q, f.a])].join(' '))
  check(total >= 1150 && total <= 1800, `${id}: ${total} words (want 1,200-1,600)`)
  check(!all.includes('—'), `${id}: em dash`)
  check(!BANNED.test(all), `${id}: vendor/competitor name: ${all.match(BANNED)?.[0]}`)
  check(!PRICE.test(all), `${id}: price-like text: ${all.match(PRICE)?.[0]}`)
  check(/Vistrow Voice (is|helps|answers|lets|can)\b/.test(body.join(' ')), `${id}: brand sentence missing`)
  check(!/\b(11|eleven) languages\b/i.test(all) && !/Urdu is not|not support(ed)? Urdu/i.test(all), `${id}: language claim must be 130+ (owner decision 21 Oct), not 11 or 'no Urdu'`)
  ;(p.sections ?? []).forEach((s: any, i: number) => {
    const links = [...s.paragraphs, ...(s.points ?? [])].flatMap(linkTargets)
    check(links.some(l => l.anchor.length >= 12), `${id}: section ${i + 1} has no descriptive link`)
  })
  const allLinks = [...body, ...(p.faqs ?? []).map((f: any) => f.a), p.contextualLinks, p.shortAnswer].flatMap(linkTargets)
  for (const l of allLinks) {
    check(linkable(l.path), `${id}: link target not live or earlier: ${l.path}`)
    check(l.path !== `/resources/blog/${p.slug}`, `${id}: self-link`)
  }
  check(linkTargets(p.contextualLinks ?? '').length >= 2, `${id}: contextualLinks needs 2 links`)
  check(p.sources?.length >= 1 && p.sources.every((s: any) => /^https:\/\//.test(s.url)), `${id}: sources`)
  check(p.inbound?.length >= 2, `${id}: needs 2+ inbound`)
  for (const ib of p.inbound ?? []) {
    check(ib.sentence.includes(`(/resources/blog/${p.slug})`), `${id}: inbound sentence must link to this post`)
    const [kind, ref] = String(ib.target).split(/:(.+)/)
    if (kind === 'blog') check(live.has(ref) || earlier.has(ref), `${id}: inbound blog target not live/earlier: ${ref}`)
    else if (kind === 'language') check(!!seoForPath(`/languages/${ref}`), `${id}: inbound language ${ref}`)
    else if (kind === 'page') check(!!seoForPath(ref), `${id}: inbound page ${ref}`)
    else check(false, `${id}: inbound target kind ${kind}`)
  }
  for (const [img, w, h] of [[`${p.slug}.jpg`, 1200, 675], [`${p.slug}-640.jpg`, 640, 360]] as const) {
    const f = `${DIR}/${img}`
    if (!existsSync(f)) { check(false, `${id}: missing image ${img}`); continue }
    const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', f]).toString()
    check(out.includes(`pixelWidth: ${w}`) && out.includes(`pixelHeight: ${h}`), `${id}: ${img} must be ${w}x${h}`)
  }
}
const dates = posts.map(p => p.publishOn); check(new Set(dates).size === dates.length, 'two posts share a publishOn date')
if (problems.length) { console.error(problems.join('\n')); console.error(`FAIL: ${problems.length} problem(s) in ${posts.length} queued posts`); process.exit(1) }
console.log(`PASS: ${posts.length} queued posts`)
