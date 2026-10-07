import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { VOICE_BLOG_POSTS } from '../src/content/voiceBlog'
import { SEO_ORIGIN, seoForPath } from '../src/lib/seoPages'

assert.equal(VOICE_BLOG_POSTS.length, 10)
assert.equal(new Set(VOICE_BLOG_POSTS.map(post => post.slug)).size, 10)
assert.equal(new Set(VOICE_BLOG_POSTS.map(post => post.image)).size, 10)
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
console.log('PASS: 10 articles with rendered contextual links to valid internal pages, covers, BlogPosting schema, social metadata, and sitemap entries.')
