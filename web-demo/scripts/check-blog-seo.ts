import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { VOICE_BLOG_POSTS } from '../src/content/voiceBlog'
import { DAILY_POSTS } from '../src/content/dailyBlogPosts'
import { SEO_ORIGIN, seoForPath } from '../src/lib/seoPages'

const COUNT = VOICE_BLOG_POSTS.length
assert.ok(COUNT >= 15, `expected the daily posts too, got ${COUNT}`)
assert.equal(new Set(VOICE_BLOG_POSTS.map(post => post.slug)).size, COUNT)
assert.equal(new Set(VOICE_BLOG_POSTS.map(post => post.image)).size, COUNT)
const sitemap = readFileSync('dist/sitemap.xml', 'utf8')
for (const post of VOICE_BLOG_POSTS) {
  const path = `/resources/blog/${post.slug}`
  const html = readFileSync(`dist${path}/index.html`, 'utf8')
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].flatMap(match => JSON.parse(match[1]))
  const article = scripts.find(item => item['@type'] === 'BlogPosting')
  assert.ok(article, post.slug)
  assert.equal(article.headline, post.title)
  assert.equal(article.image.url, SEO_ORIGIN + post.image)
  assert.equal(article.dateModified, post.updatedAt)
  assert.ok(article.wordCount > 350, `Substantive content: ${post.slug}`)
  assert.ok(post.imageAlt.length > 30)
  assert.ok(post.sections.length >= 4)
  assert.ok(existsSync(`public${post.image}`))
  assert.ok(existsSync(`public${post.image.replace('.jpg', '-640.jpg')}`))
  assert.equal(seoForPath(path)?.image, SEO_ORIGIN + post.image)
  assert.ok(html.includes(`property="og:image" content="${SEO_ORIGIN}${post.image}"`))
  assert.ok(html.includes('property="og:image:type" content="image/jpeg"'))
  assert.ok(html.includes('property="og:image:height" content="675"'))
  assert.ok(html.includes('property="og:type" content="article"'))
  assert.ok(html.includes('AI-generated editorial illustration; not a customer photograph.'))
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1)
  assert.ok(sitemap.includes(SEO_ORIGIN + path))
  const firstSection = html.match(/<section id="section-1"[\s\S]*?<\/section>/)?.[0]
  assert.ok(firstSection, `Article body section: ${post.slug}`)
  const contextualLinks = [...firstSection.matchAll(/<a\b[^>]*href="(\/[^"#]+)"[^>]*>([^<]+)<\/a>/g)]
  assert.ok(contextualLinks.length >= 2, `Visible in-paragraph links: ${post.slug}`)
  for (const [, target, anchor] of contextualLinks) {
    assert.ok(seoForPath(target), `Internal target exists: ${post.slug} → ${target}`)
    assert.notEqual(target, path, `No self-link: ${post.slug}`)
    assert.ok(anchor.trim().length >= 12, `Descriptive anchor: ${post.slug}`)
  }
}

// Daily posts (dailyBlogPosts.ts) must meet the SEO, AEO, GEO and linking rules
// in docs/SEO-BLOG-PLAN-2026-10-21.md.
const DAILY = new Set(DAILY_POSTS.map(post => post.slug))
const strip = (text: string) => text.replace(/\[([^\]]+)\]\(\/[^)]+\)/g, '$1')
const allHtml = readdirSync('dist/resources/blog').map(dir => `dist/resources/blog/${dir}/index.html`).concat(['dist/ai-receptionist/index.html', ...readdirSync('dist/languages').map(dir => `dist/languages/${dir}/index.html`)]).filter(file => existsSync(file))
for (const post of VOICE_BLOG_POSTS.filter(item => DAILY.has(item.slug))) {
  const path = `/resources/blog/${post.slug}`
  const html = readFileSync(`dist${path}/index.html`, 'utf8')
  assert.ok(post.seoTitle && post.seoTitle.length <= 60, `seoTitle <= 60 chars: ${post.slug}`)
  assert.ok(html.includes(`<title>${post.seoTitle!.replace(/&/g, '&amp;')}</title>`), `seoTitle rendered: ${post.slug}`)
  assert.ok(post.metaDescription && post.metaDescription.length <= 155, `metaDescription <= 155 chars: ${post.slug}`)
  const answerWords = strip(post.shortAnswer ?? '').trim().split(/\s+/).length
  assert.ok(answerWords >= 40 && answerWords <= 60, `shortAnswer 40-60 words (${answerWords}): ${post.slug}`)
  assert.ok((post.faqs?.length ?? 0) >= 4, `4+ FAQs: ${post.slug}`)
  assert.ok(html.includes('"@type":"FAQPage"'), `FAQPage structured data: ${post.slug}`)
  assert.ok(/Vistrow Voice (is|helps|answers|lets|can)/.test(post.sections.flatMap(section => [...section.paragraphs, ...(section.points ?? [])]).join(' ')), `brand sentence in the body: ${post.slug}`)
  post.sections.forEach((section, index) => {
    const linked = [...section.paragraphs, ...(section.points ?? [])].some(text => /\[[^\]]{12,}\]\(\/[^)]+\)/.test(text))
    assert.ok(linked, `in-text link in section ${index + 1} (${section.heading}): ${post.slug}`)
  })
  assert.ok((post.related?.length ?? 0) >= 3 && post.related!.every(slug => VOICE_BLOG_POSTS.some(other => other.slug === slug && slug !== post.slug)), `3 valid related slugs: ${post.slug}`)
  const inbound = allHtml.filter(file => !file.includes(`/${post.slug}/`)).filter(file => {
    const body = readFileSync(file, 'utf8').replace(/<aside[\s\S]*?<\/aside>/g, '')
    return new RegExp(`<a\\b[^>]*href="${path}"[^>]*>[^<]{12,}</a>`).test(body)
  })
  assert.ok(inbound.length >= 2, `2+ in-text inbound links (found ${inbound.length}): ${post.slug}`)
}
console.log(`PASS: ${COUNT} articles with rendered contextual links to valid internal pages, covers, BlogPosting schema, social metadata, and sitemap entries.`)
