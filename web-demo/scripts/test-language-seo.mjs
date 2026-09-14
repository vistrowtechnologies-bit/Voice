import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url)) + '/..'

const pages = [
  {
    slug: 'hindi',
    title: 'Hindi AI Voice Calling Agent for Phone & Web | Vistrow Voice',
    phrases: ['Hinglish AI voice calling agent', 'real AI phone calling agent', 'North & Central India'],
  },
  {
    slug: 'kannada',
    title: 'Kannada AI Voice Calling Agent for Customer Calls | Vistrow Voice',
    phrases: ['best AI voice calling agent in Kannada', 'Bengaluru and Karnataka', 'Kannada-English code-switching'],
  },
  {
    slug: 'telugu',
    title: 'Telugu AI Voice Agent for Phone & Website Calls | Vistrow Voice',
    phrases: ['Telugu voice agent for customer calls', 'Andhra Pradesh & Telangana', 'Hyderabad real estate'],
  },
  {
    slug: 'marathi',
    title: 'Marathi AI Voice Calling Agent for Maharashtra | Vistrow Voice',
    phrases: ['Marathi AI voice calling agent', 'Pune, Mumbai', 'Maharashtra'],
  },
]

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

for (const page of pages) {
  const htmlPath = path.join(ROOT, 'dist', 'languages', page.slug, 'index.html')
  const rawHtml = await readFile(htmlPath, 'utf8')
  const html = rawHtml
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/<!-- -->/g, '')
  assert(html.includes(`<title>${page.title}</title>`), `${page.slug}: expected prerendered title`)
  assert(html.includes('FAQPage'), `${page.slug}: expected FAQPage schema`)
  assert(html.includes('Built for people searching'), `${page.slug}: expected search-intent section`)
  assert(rawHtml.length > 20_000, `${page.slug}: prerendered HTML looks too thin`)
  for (const phrase of page.phrases) {
    assert(html.includes(phrase), `${page.slug}: missing SEO phrase "${phrase}"`)
  }
}

console.log(`language SEO checks passed for ${pages.map((page) => page.slug).join(', ')}`)
