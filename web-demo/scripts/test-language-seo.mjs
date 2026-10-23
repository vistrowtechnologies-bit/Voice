import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url)) + '/..'

const pages = [
  {
    slug: 'hindi',
    title: 'Hindi AI Voice Calling Agent with Hinglish | Vistrow Voice',
    phrases: ['AI calling agent in Hindi', 'real AI phone calling agent', 'North & Central India', 'Example conversation', 'Hinglish is the normal case'],
    demo: 'hindi-real-estate-lead-qualification',
  },
  {
    slug: 'english',
    title: 'Indian English AI Voice Calling Agent | Vistrow Voice',
    phrases: ['AI voice agents that speak', 'Indian English', 'Example conversation', 'Mixing in Hindi is the normal case', 'English call notes', 'Voices that speak English', 'Hindi, English and 9 other Indian languages'],
    links: ['/languages/hindi', '/product/outbound', '/solutions/support'],
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
    phrases: ['Telugu AI voice calling agent', 'Andhra Pradesh & Telangana', 'Hyderabad real estate', 'Example conversation', 'Tenglish is the normal case'],
    demo: 'telugu-website-widget-call',
  },
  {
    slug: 'marathi',
    title: 'Marathi AI Voice Calling Agent for Maharashtra | Vistrow Voice',
    phrases: ['Marathi AI voice calling agent', 'Pune, Mumbai', 'Maharashtra', 'Example conversation', 'Marathi-Hindi-English mixing is the normal case', 'Marathi call notes'],
    demo: 'marathi-site-visit-booking',
    links: ['/solutions/real-estate/marathi-ai-calling-agent-mumbai-real-estate', '/demo-calls/marathi-site-visit-booking'],
  },
  // No Punjabi or Tamil demo-call page exists, so these two link out to the
  // solution pages their regional call types point at instead.
  {
    slug: 'punjabi',
    title: 'Punjabi AI Voice Calling Agent for Punjab | Vistrow Voice',
    phrases: ['Punjabi AI voice calling agent', 'Chandigarh and Delhi NCR', 'Example conversation', 'Punjabi-English mixing is the normal case', 'Voices that speak Punjabi'],
    links: ['/solutions/finance', '/solutions/real-estate'],
  },
  {
    slug: 'tamil',
    title: 'Tamil AI Voice Calling Agent for Tamil Nadu | Vistrow Voice',
    phrases: ['Tamil AI voice calling agent', 'Chennai and Tamil Nadu', 'Example conversation', 'Tanglish is the normal case', 'Voices that speak Tamil'],
    links: ['/solutions/real-estate', '/solutions/healthcare'],
  },
  {
    slug: 'odia',
    title: 'Odia AI Voice Agent for Customer Calls | Vistrow Voice',
    phrases: ['Odia', 'Bhubaneswar', 'Example conversation', 'Odia-English mixing is the normal case', 'Odia call notes', 'Voices that speak Odia'],
    links: ['/ai-ivr', '/vs-ivr', '/languages/bengali'],
  },
  {
    slug: 'malayalam',
    title: 'Malayalam AI Voice Agent for Customer Calls | Vistrow Voice',
    phrases: ['Malayalam', 'Kochi', 'Example conversation', 'Manglish is the normal case', 'Malayalam call notes', 'Voices that speak Malayalam'],
    links: ['/compare/exotel', '/product/widget', '/solutions/real-estate'],
  },
  {
    slug: 'gujarati',
    title: 'Gujarati AI Voice Agent for Customer Calls | Vistrow Voice',
    phrases: ['Gujarati', 'Surat', 'Example conversation', 'Gujarati-Hindi-English mixing is the normal case', 'Gujarati call notes', 'Voices that speak Gujarati'],
    links: ['/solutions/real-estate/gujarati-ai-calling-agent-ahmedabad-real-estate', '/compare/knowlarity', '/solutions/finance'],
  },
  {
    slug: 'bengali',
    title: 'Bengali AI Voice Agent for Customer Calls | Vistrow Voice',
    phrases: ['Bengali', 'Kolkata', 'Example conversation', 'Banglish is the normal case', 'Bengali call notes', 'Voices that speak Bengali'],
    links: ['/compare/ozonetel', '/solutions/ecommerce', '/languages/odia'],
  },
  // Accent page (EXTRA_LANGUAGE_PAGES): the player labels accents, not languages.
  {
    slug: 'american-british-english',
    title: 'American & British English AI Voice Agent | Vistrow Voice',
    phrases: ['AI voice agents that speak', 'American and British English', 'An agent that matches the caller’s accent', 'US and UK English call notes', 'Voices that speak US and UK English', 'Hindi, English and 9 other Indian languages', 'Do you provide US or UK phone numbers?', 'Will the live agent change accent mid-call like the demo?'],
    links: ['/ai-receptionist', '/languages/english', '/ai-call-center'],
    accent: true,
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
  if (page.demo) assert(html.includes(`/demo-calls/${page.demo}`), `${page.slug}: missing relevant call-example link`)
  for (const link of page.links ?? []) {
    assert(html.includes(`href="${link}"`), `${page.slug}: missing link to ${link}`)
  }
  assert(rawHtml.length > 20_000, `${page.slug}: prerendered HTML looks too thin`)
  for (const phrase of page.phrases) {
    assert(html.includes(phrase), `${page.slug}: missing SEO phrase "${phrase}"`)
  }
  // Two-speaker voice sample: lazy audio, honest label, AudioObject schema.
  assert(html.includes(`src="/media/samples/${page.slug}-switch.m4a"`) && html.includes('preload="none"'), `${page.slug}: missing lazy voice sample`)
  assert(html.includes('Demo call voiced by Vistrow Voice. Not a real customer.'), `${page.slug}: missing voice sample label`)
  assert(html.includes('"@type":"AudioObject"'), `${page.slug}: missing AudioObject schema`)
  // Player wording: accents on the accent page, languages everywhere else.
  assert(html.includes('switched accent automatically') === Boolean(page.accent), `${page.slug}: wrong switch wording in the sample player`)
  if (page.accent) assert(html.includes('US English') && html.includes('UK English') && !html.includes('Indian names'), `${page.slug}: accent labels or international FAQs missing`)
}

console.log(`language SEO checks passed for ${pages.map((page) => page.slug).join(', ')}`)
