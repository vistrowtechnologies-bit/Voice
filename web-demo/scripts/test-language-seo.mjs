import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url)) + '/..'

const pages = [
  {
    slug: 'hindi',
    title: 'Hindi AI Voice Calling Agent with Hinglish | Vistrow Voice',
    phrases: ['Hinglish AI voice calling agent', 'real AI phone calling agent', 'North & Central India', 'Example conversation', 'Hinglish is the normal case'],
    demo: 'hindi-real-estate-lead-qualification',
  },
  {
    slug: 'kannada',
    title: 'Kannada AI Voice Calling Agent for Karnataka | Vistrow Voice',
    phrases: ['Kannada AI voice calling agent', 'Bengaluru and Karnataka', 'Kannada-English code-switching', 'Example conversation', 'Kanglish is the normal case'],
    demo: 'kannada-inbound-property-enquiry',
  },
  {
    slug: 'telugu',
    title: 'Telugu AI Voice Calling Agent for Phone & Web | Vistrow Voice',
    phrases: ['Telugu voice agent for customer calls', 'Andhra Pradesh & Telangana', 'Hyderabad real estate', 'Example conversation', 'Tenglish is the normal case'],
    demo: 'telugu-website-widget-call',
  },
  {
    slug: 'marathi',
    title: 'Marathi AI Voice Calling Agent for Maharashtra | Vistrow Voice',
    phrases: ['Marathi AI voice calling agent', 'Pune, Mumbai', 'Maharashtra'],
    demo: 'marathi-site-visit-booking',
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
  assert(html.includes('Built for teams that take calls in'), `${page.slug}: expected who-it-is-for section`)
  assert(!/searching \u201c|\bbest AI voice/i.test(html), `${page.slug}: must not quote search queries or claim "best" in visible copy`)
  assert(html.includes(`/demo-calls/${page.demo}`), `${page.slug}: missing relevant call-example link`)
  assert(rawHtml.length > 20_000, `${page.slug}: prerendered HTML looks too thin`)
  for (const phrase of page.phrases) {
    assert(html.includes(phrase), `${page.slug}: missing SEO phrase "${phrase}"`)
  }
}

console.log(`language SEO checks passed for ${pages.map((page) => page.slug).join(', ')}`)
