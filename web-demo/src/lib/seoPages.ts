// Canonical SEO source for every indexable marketing route.
//
// Both the browser-side <Seo> component and the build-time prerenderer read
// this file. Keeping titles, descriptions, social images and schema labels in
// one registry prevents the production HTML from drifting away from what a
// visitor sees after React hydrates.

export const SEO_ORIGIN = 'https://www.vistrowvoice.com'
export const SEO_LAST_SIGNIFICANT_UPDATE = '2026-09-01'

export type SeoKind =
  | 'home'
  | 'collection'
  | 'product'
  | 'solution'
  | 'language'
  | 'pricing'
  | 'docs'
  | 'about'
  | 'contact'
  | 'security'
  | 'legal'
  | 'page'

export interface SeoPage {
  path: string
  title: string
  description: string
  image: string
  imageAlt: string
  kind: SeoKind
  /** Human-readable label used in breadcrumb structured data. */
  label: string
  noindex?: boolean
}

export interface OgCardSpec {
  eyebrow: string
  headline: string
  proof: string
  accent: string
  hue: string
  native?: string
}

const page = (
  path: string,
  title: string,
  description: string,
  imageName: string,
  imageAlt: string,
  kind: SeoKind,
  label: string,
  noindex = false,
): SeoPage => ({
  path,
  title,
  description,
  image: `${SEO_ORIGIN}/og/${imageName}.png`,
  imageAlt,
  kind,
  label,
  noindex,
})

const LANGUAGE_PAGES = [
  ['hindi', 'Hindi', 'हिन्दी'],
  ['marathi', 'Marathi', 'मराठी'],
  ['tamil', 'Tamil', 'தமிழ்'],
  ['telugu', 'Telugu', 'తెలుగు'],
  ['kannada', 'Kannada', 'ಕನ್ನಡ'],
  ['bengali', 'Bengali', 'বাংলা'],
  ['gujarati', 'Gujarati', 'ગુજરાતી'],
  ['malayalam', 'Malayalam', 'മലയാളം'],
  ['punjabi', 'Punjabi', 'ਪੰਜਾਬੀ'],
  ['odia', 'Odia', 'ଓଡ଼ିଆ'],
] as const

export const SEO_PAGES: SeoPage[] = [
  page(
    '/',
    'Multilingual AI Voice Agents for Phone & Web | Vistrow Voice',
    'Build AI voice agents that answer, qualify, support, and book customers across phone and web in 87 languages, with real-time language switching.',
    'home',
    'Vistrow Voice multilingual AI voice agent orb with support for 87 languages across phone and web',
    'home',
    'Home',
  ),
  page(
    '/product',
    'AI Voice Agent Platform | Vistrow Voice',
    'Build, publish, and manage multilingual AI voice agents for inbound calls, outbound campaigns, website conversations, knowledge, and CRM workflows.',
    'product',
    'Vistrow Voice AI voice agent platform with phone, web, knowledge, and integration capabilities',
    'collection',
    'Product',
  ),
  page(
    '/product/agents',
    'AI Voice Agent Builder | Vistrow Voice',
    'Build a no-code AI voice agent with its own persona, knowledge, voice, language, tools, and handoff rules, then test it before publishing.',
    'product-agents',
    'Vistrow Voice no-code AI voice agent builder represented by the real Artha orb',
    'product',
    'Voice Agents',
  ),
  page(
    '/product/inbound',
    'Inbound AI Call Answering | Vistrow Voice',
    'Answer inbound customer calls 24/7 with a multilingual AI agent that qualifies intent, handles questions, books next steps, and routes callers.',
    'product-inbound',
    'Cyan Vistrow Voice orb answering an inbound customer call',
    'product',
    'Inbound Calling',
  ),
  page(
    '/product/outbound',
    'AI Outbound Calling & Campaigns | Vistrow Voice',
    'Run multilingual outbound reminder, follow-up, qualification, and collection campaigns with personalized calls and live outcome tracking.',
    'product-outbound',
    'Magenta Vistrow Voice orb running an outbound calling campaign',
    'product',
    'Outbound Campaigns',
  ),
  page(
    '/product/knowledge-base',
    'Knowledge-Grounded Voice AI | Vistrow Voice',
    'Ground every AI voice response in your approved PDFs, documents, and business information, with strict controls that prevent invented answers.',
    'product-knowledge-base',
    'Teal Vistrow Voice orb connected to a grounded business knowledge base',
    'product',
    'Knowledge Base',
  ),
  page(
    '/product/widget',
    'AI Voice Website Widget | Vistrow Voice',
    'Add a real-time multilingual AI voice conversation to any website with one script or the WordPress plugin—no phone number or app required.',
    'product-widget',
    'Vistrow Voice AI website calling widget with the real Artha orb',
    'product',
    'Website Call Widget',
  ),
  page(
    '/product/integrations',
    'Voice AI CRM & Webhook Integrations | Vistrow Voice',
    'Send qualified leads, call outcomes, transcripts, and structured data from Vistrow Voice into your CRM and workflows through integrations and webhooks.',
    'product-integrations',
    'Vistrow Voice orb connected to CRM and webhook destinations',
    'product',
    'Product Integrations',
  ),
  page(
    '/solutions',
    'Voice AI Solutions by Industry | Vistrow Voice',
    'Explore AI voice agents designed for real estate, healthcare, e-commerce, finance and collections, and customer support conversations.',
    'solutions',
    'Vistrow Voice industry AI agents represented by five differently colored real orbs',
    'collection',
    'Solutions',
  ),
  page(
    '/solutions/real-estate',
    'AI Voice Agents for Real Estate | Vistrow Voice',
    'Answer property enquiries, qualify buyer budget and location, answer approved project questions, and book real site visits around the clock.',
    'solution-real-estate',
    'Warm amber Vistrow Voice property agent orb for real-estate buyer enquiries',
    'solution',
    'Real Estate',
  ),
  page(
    '/solutions/healthcare',
    'AI Voice Receptionist for Clinics | Vistrow Voice',
    'Give your clinic a multilingual AI receptionist that answers common patient questions, handles appointment requests, and supports front-desk workflows.',
    'solution-healthcare',
    'Teal Vistrow Voice clinic receptionist orb for healthcare appointment calls',
    'solution',
    'Healthcare & Clinics',
  ),
  page(
    '/solutions/ecommerce',
    'AI Voice Support for E-commerce | Vistrow Voice',
    'Handle order, delivery, return, product, and follow-up calls with an AI voice agent grounded in your approved e-commerce information.',
    'solution-ecommerce',
    'Magenta Vistrow Voice e-commerce support orb for order and return calls',
    'solution',
    'E-commerce & D2C',
  ),
  page(
    '/solutions/finance',
    'AI Voice Agents for Finance & Collections | Vistrow Voice',
    'Run respectful multilingual payment reminders and finance support conversations with approved information, logged outcomes, and compliance controls.',
    'solution-finance',
    'Green and amber Vistrow Voice finance agent orb for respectful collection calls',
    'solution',
    'Finance & Collections',
  ),
  page(
    '/solutions/support',
    'AI Voice Agents for Customer Support | Vistrow Voice',
    'Resolve common tier-one support requests, collect troubleshooting context, and prepare clean human handoffs with a multilingual AI voice agent.',
    'solution-support',
    'Cyan Vistrow Voice support agent orb for tier-one customer service calls',
    'solution',
    'Support & Helpdesk',
  ),
  page(
    '/languages',
    'Multilingual AI Voice Agents in 87 Languages | Vistrow Voice',
    'Talk to Artha in 10 Indian languages plus English and 76 additional global languages, with natural code-switching during customer calls.',
    'languages',
    'Vistrow Voice multilingual AI orb surrounded by Indian and global language scripts',
    'collection',
    'Languages',
  ),
  ...LANGUAGE_PAGES.map(([slug, name, native]) =>
    page(
      `/languages/${slug}`,
      `${name} AI Voice Agent for Customer Calls | Vistrow Voice`,
      `Handle inbound, outbound, and website customer conversations with a ${name} AI voice agent that supports natural English code-switching and 24/7 availability.`,
      `language-${slug}`,
      `${native} ${name} customer calls handled by the Vistrow Voice AI agent orb`,
      'language',
      name,
    ),
  ),
  page(
    '/pricing',
    'Voice AI Pricing | Vistrow Voice',
    'Review the credit-based Vistrow Voice plans for AI phone and web agents, including call capacity, voice tiers, analytics, and available controls.',
    'pricing',
    'Vistrow Voice pricing card with a purple real orb and scalable usage meter',
    'pricing',
    'Pricing',
  ),
  page(
    '/integrations',
    'Voice AI Integrations | Vistrow Voice',
    'Connect Vistrow Voice call leads, transcripts, and outcomes to CRMs, WhatsApp, Slack, Google Sheets, automation platforms, and webhooks.',
    'integrations',
    'Vistrow Voice orb connected to CRM, messaging, spreadsheet, and automation tools',
    'collection',
    'Integrations',
  ),
  page(
    '/vs-ivr',
    'AI Voice Agent vs IVR: Full Comparison | Vistrow Voice',
    'Compare AI voice agents with traditional IVR phone menus across caller experience, language support, availability, records, handoff, and scale.',
    'vs-ivr',
    'Traditional IVR keypad compared with a conversational Vistrow Voice AI orb',
    'page',
    'AI Voice vs IVR',
  ),
  page(
    '/security',
    'Voice AI Security & Data Protection | Vistrow Voice',
    'Review Vistrow Voice workspace isolation, access controls, DNC enforcement, configurable retention, data handling, and current security boundaries.',
    'security',
    'Protected green and cyan Vistrow Voice orb representing voice AI security controls',
    'security',
    'Security & Trust',
  ),
  page(
    '/resources/docs',
    'Vistrow Voice Documentation & Setup Guide',
    'Learn how to create an AI voice agent, add knowledge, connect phone and web channels, book appointments, integrate your tools, and review calls.',
    'docs',
    'Vistrow Voice setup path from creating an agent to placing the first live call',
    'docs',
    'Documentation',
  ),
  page(
    '/about',
    'About Vistrow Voice | Multilingual Voice AI',
    'Meet Vistrow Voice, the team building multilingual AI voice agents for natural customer conversations across phone and web.',
    'about',
    'Vistrow Voice logo and real orb representing multilingual customer conversations',
    'about',
    'About',
  ),
  page(
    '/contact',
    'Book a Vistrow Voice Demo',
    'Book a live Vistrow Voice walkthrough tailored to your industry, language, call workflow, integrations, rollout requirements, and expected volume.',
    'contact',
    'Vistrow Voice live demo card with the real Artha voice agent orb',
    'contact',
    'Book a Demo',
  ),
  page(
    '/careers',
    'Voice AI Careers at Vistrow Voice',
    'Explore opportunities to build real-time, multilingual, human-sounding AI voice products with the Vistrow Voice team.',
    'careers',
    'Vistrow Voice careers card for building real-time multilingual voice AI',
    'page',
    'Careers',
  ),
  page(
    '/changelog',
    'Vistrow Voice Product Changelog',
    'Follow Vistrow Voice product updates across voices, latency, calling, appointment booking, integrations, compliance, and dashboard controls.',
    'changelog',
    'Vistrow Voice real orb alongside a product release timeline',
    'collection',
    'Changelog',
  ),
  page(
    '/privacy',
    'Privacy Policy | Vistrow Voice',
    'Read how Vistrow Voice collects, uses, shares, stores, retains, protects, exports, and deletes account, call, and integration data.',
    'privacy',
    'Vistrow Voice privacy card showing a protected brand mark and voice orb',
    'legal',
    'Privacy Policy',
  ),
  page(
    '/terms',
    'Terms of Service | Vistrow Voice',
    'Read the terms governing Vistrow Voice accounts, acceptable use, billing, integrations, business data, compliance responsibilities, and termination.',
    'terms',
    'Vistrow Voice terms of service card with the real logo and orb',
    'legal',
    'Terms of Service',
  ),
  page(
    '/resources/blog',
    'Vistrow Voice Blog',
    'Practical guides and product insights from Vistrow Voice are coming soon.',
    'blog',
    'Vistrow Voice blog',
    'page',
    'Blog',
    true,
  ),
]

export const SEO_BY_PATH = new Map(SEO_PAGES.map((entry) => [entry.path, entry]))

export function seoForPath(path: string): SeoPage | undefined {
  const normalized = path === '/' ? '/' : path.replace(/\/$/, '')
  return SEO_BY_PATH.get(normalized)
}

function breadcrumbLabel(path: string): string {
  return SEO_BY_PATH.get(path)?.label ?? path.split('/').filter(Boolean).at(-1)?.replace(/-/g, ' ') ?? 'Page'
}

export function baseStructuredData(entry: SeoPage): object[] {
  const pageUrl = `${SEO_ORIGIN}${entry.path}`
  const schemas: object[] = []

  if (entry.path === '/') {
    schemas.push(
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        '@id': `${SEO_ORIGIN}/#organization`,
        name: 'Vistrow Voice',
        url: `${SEO_ORIGIN}/`,
        logo: `${SEO_ORIGIN}/apple-touch-icon.png`,
        parentOrganization: {
          '@type': 'Organization',
          name: 'Vistrow',
          url: 'https://vistrow.com/',
        },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        '@id': `${SEO_ORIGIN}/#website`,
        url: `${SEO_ORIGIN}/`,
        name: 'Vistrow Voice',
        alternateName: 'Vistrow AI Voice Agents',
        publisher: { '@id': `${SEO_ORIGIN}/#organization` },
        inLanguage: 'en',
      },
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        '@id': `${SEO_ORIGIN}/#software`,
        name: 'Vistrow Voice',
        url: `${SEO_ORIGIN}/`,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description: entry.description,
        publisher: { '@id': `${SEO_ORIGIN}/#organization` },
      },
    )
  }

  if (entry.path !== '/') {
    const parts = entry.path.split('/').filter(Boolean)
    const itemListElement: object[] = [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SEO_ORIGIN}/` },
    ]
    let current = ''
    parts.forEach((part, index) => {
      current += `/${part}`
      itemListElement.push({
        '@type': 'ListItem',
        position: index + 2,
        name: breadcrumbLabel(current),
        ...(index === parts.length - 1 ? {} : { item: `${SEO_ORIGIN}${current}` }),
      })
    })
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement,
    })
  }

  if (entry.kind === 'product' || entry.kind === 'solution') {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: entry.label,
      description: entry.description,
      url: pageUrl,
      provider: { '@id': `${SEO_ORIGIN}/#organization` },
      areaServed: 'Worldwide',
      serviceType: entry.kind === 'solution' ? `${entry.label} AI voice agent` : `AI voice ${entry.label}`,
    })
  } else if (entry.kind === 'collection') {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: entry.label,
      description: entry.description,
      url: pageUrl,
      isPartOf: { '@id': `${SEO_ORIGIN}/#website` },
    })
  } else if (entry.kind === 'language') {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: `${entry.label} AI Voice Agent`,
      description: entry.description,
      url: pageUrl,
      provider: { '@id': `${SEO_ORIGIN}/#organization` },
      areaServed: 'Worldwide',
    })
  } else if (entry.kind === 'docs') {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: entry.title,
      description: entry.description,
      url: pageUrl,
      dateModified: SEO_LAST_SIGNIFICANT_UPDATE,
      publisher: { '@id': `${SEO_ORIGIN}/#organization` },
    })
  } else if (entry.kind === 'about' || entry.kind === 'contact') {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': entry.kind === 'about' ? 'AboutPage' : 'ContactPage',
      name: entry.label,
      description: entry.description,
      url: pageUrl,
      isPartOf: { '@id': `${SEO_ORIGIN}/#website` },
    })
  }

  return schemas
}

// Visual copy is kept beside the route metadata so changing a product claim
// cannot silently leave an old social image behind. scripts/generate-og-images.mjs
// renders these definitions with the real Vistrow mark and a frame from the
// real production orb video.
export const OG_CARD_BY_IMAGE: Record<string, OgCardSpec> = {
  home: { eyebrow: 'MULTILINGUAL VOICE AI', headline: 'Voice AI that speaks your customer\u2019s language.', proof: '87 languages  \u00b7  Phone + Web  \u00b7  24/7', accent: '#9333ea', hue: '0deg' },
  product: { eyebrow: 'VISTROW VOICE PLATFORM', headline: 'Everything you need to run voice AI.', proof: 'Build  \u00b7  Call  \u00b7  Learn  \u00b7  Integrate', accent: '#9333ea', hue: '0deg' },
  'product-agents': { eyebrow: 'VOICE AGENTS', headline: 'Build a voice agent in minutes.', proof: 'Persona  \u00b7  Knowledge  \u00b7  Voice  \u00b7  Tools', accent: '#9333ea', hue: '0deg' },
  'product-inbound': { eyebrow: 'INBOUND CALLING', headline: 'Answer every call. Day or night.', proof: 'Qualify  \u00b7  Answer  \u00b7  Book  \u00b7  Route', accent: '#0e7490', hue: '-91deg' },
  'product-outbound': { eyebrow: 'OUTBOUND CAMPAIGNS', headline: 'Reach every contact. Without manual dialing.', proof: 'Reminders  \u00b7  Follow-ups  \u00b7  Collections', accent: '#db2777', hue: '57deg' },
  'product-knowledge-base': { eyebrow: 'KNOWLEDGE BASE', headline: 'Answers grounded in your business.', proof: 'Approved sources  \u00b7  Strict mode  \u00b7  Current facts', accent: '#047857', hue: '-126deg' },
  'product-widget': { eyebrow: 'WEBSITE CALL WIDGET', headline: 'Turn every website visit into a conversation.', proof: 'One tap  \u00b7  No app  \u00b7  No phone number', accent: '#7e22ce', hue: '-12deg' },
  'product-integrations': { eyebrow: 'PRODUCT INTEGRATIONS', headline: 'Every lead. Already in your stack.', proof: 'CRM  \u00b7  Webhooks  \u00b7  Messaging  \u00b7  API', accent: '#0e7490', hue: '-91deg' },
  solutions: { eyebrow: 'SOLUTIONS BY INDUSTRY', headline: 'Voice AI trained for the calls your industry handles.', proof: 'Property  \u00b7  Clinics  \u00b7  Commerce  \u00b7  Finance  \u00b7  Support', accent: '#9333ea', hue: '0deg' },
  'solution-real-estate': { eyebrow: 'REAL ESTATE', headline: 'Never miss a buyer enquiry again.', proof: 'Qualify buyers  \u00b7  Answer project questions  \u00b7  Book visits', accent: '#b45309', hue: '129deg' },
  'solution-healthcare': { eyebrow: 'HEALTHCARE & CLINICS', headline: 'A front desk that never sleeps.', proof: 'Patient questions  \u00b7  Appointment requests  \u00b7  24/7', accent: '#047857', hue: '-101deg' },
  'solution-ecommerce': { eyebrow: 'E-COMMERCE & D2C', headline: 'Support that scales with every sale.', proof: 'Orders  \u00b7  Delivery  \u00b7  Returns  \u00b7  Follow-up', accent: '#db2777', hue: '57deg' },
  'solution-finance': { eyebrow: 'FINANCE & COLLECTIONS', headline: 'Collections conversations, handled with care.', proof: 'Respectful reminders  \u00b7  Logged outcomes  \u00b7  Controls', accent: '#047857', hue: '-126deg' },
  'solution-support': { eyebrow: 'SUPPORT & HELPDESK', headline: 'Resolve tier-one issues on the first call.', proof: 'Troubleshoot  \u00b7  Resolve  \u00b7  Escalate with context', accent: '#0e7490', hue: '-91deg' },
  languages: { eyebrow: 'MULTILINGUAL BY DESIGN', headline: 'One agent. 87 languages.', proof: 'Natural code-switching  \u00b7  Phone + Web  \u00b7  24/7', accent: '#9333ea', hue: '0deg', native: 'हिं  ·  தமிழ்  ·  বাংলা  ·  മലയാളം' },
  'language-hindi': { eyebrow: 'HINDI AI VOICE AGENT', headline: 'हिन्दी calls, handled naturally.', proof: 'Hindi + English  \u00b7  Inbound  \u00b7  Outbound  \u00b7  Web', accent: '#9333ea', hue: '0deg', native: 'हिन्दी' },
  'language-marathi': { eyebrow: 'MARATHI AI VOICE AGENT', headline: 'मराठी calls, handled naturally.', proof: 'Marathi + English  \u00b7  Inbound  \u00b7  Outbound  \u00b7  Web', accent: '#9333ea', hue: '0deg', native: 'मराठी' },
  'language-tamil': { eyebrow: 'TAMIL AI VOICE AGENT', headline: 'தமிழ் calls, handled naturally.', proof: 'Tamil + English  \u00b7  Inbound  \u00b7  Outbound  \u00b7  Web', accent: '#9333ea', hue: '0deg', native: 'தமிழ்' },
  'language-telugu': { eyebrow: 'TELUGU AI VOICE AGENT', headline: 'తెలుగు calls, handled naturally.', proof: 'Telugu + English  \u00b7  Inbound  \u00b7  Outbound  \u00b7  Web', accent: '#9333ea', hue: '0deg', native: 'తెలుగు' },
  'language-kannada': { eyebrow: 'KANNADA AI VOICE AGENT', headline: 'ಕನ್ನಡ calls, handled naturally.', proof: 'Kannada + English  \u00b7  Inbound  \u00b7  Outbound  \u00b7  Web', accent: '#9333ea', hue: '0deg', native: 'ಕನ್ನಡ' },
  'language-bengali': { eyebrow: 'BENGALI AI VOICE AGENT', headline: 'বাংলা calls, handled naturally.', proof: 'Bengali + English  \u00b7  Inbound  \u00b7  Outbound  \u00b7  Web', accent: '#9333ea', hue: '0deg', native: 'বাংলা' },
  'language-gujarati': { eyebrow: 'GUJARATI AI VOICE AGENT', headline: 'ગુજરાતી calls, handled naturally.', proof: 'Gujarati + English  \u00b7  Inbound  \u00b7  Outbound  \u00b7  Web', accent: '#9333ea', hue: '0deg', native: 'ગુજરાતી' },
  'language-malayalam': { eyebrow: 'MALAYALAM AI VOICE AGENT', headline: 'മലയാളം calls, handled naturally.', proof: 'Malayalam + English  \u00b7  Inbound  \u00b7  Outbound  \u00b7  Web', accent: '#9333ea', hue: '0deg', native: 'മലയാളം' },
  'language-punjabi': { eyebrow: 'PUNJABI AI VOICE AGENT', headline: 'ਪੰਜਾਬੀ calls, handled naturally.', proof: 'Punjabi + English  \u00b7  Inbound  \u00b7  Outbound  \u00b7  Web', accent: '#9333ea', hue: '0deg', native: 'ਪੰਜਾਬੀ' },
  'language-odia': { eyebrow: 'ODIA AI VOICE AGENT', headline: 'ଓଡ଼ିଆ calls, handled naturally.', proof: 'Odia + English  \u00b7  Inbound  \u00b7  Outbound  \u00b7  Web', accent: '#9333ea', hue: '0deg', native: 'ଓଡ଼ିଆ' },
  pricing: { eyebrow: 'VOICE AI PRICING', headline: 'Start small. Scale every conversation.', proof: 'Phone + Web  \u00b7  Usage visibility  \u00b7  No hidden model names', accent: '#9333ea', hue: '0deg' },
  integrations: { eyebrow: 'VOICE AI INTEGRATIONS', headline: 'Your calls. Your CRM. Already synced.', proof: 'CRM  \u00b7  WhatsApp  \u00b7  Slack  \u00b7  Sheets  \u00b7  Webhooks', accent: '#0e7490', hue: '-91deg' },
  'vs-ivr': { eyebrow: 'AI VOICE VS IVR', headline: 'Stop making callers press buttons.', proof: 'Natural answers  \u00b7  Language switching  \u00b7  Complete records', accent: '#b45309', hue: '129deg' },
  security: { eyebrow: 'SECURITY & TRUST', headline: 'Enterprise controls around every conversation.', proof: 'Workspace isolation  \u00b7  Access controls  \u00b7  Retention', accent: '#047857', hue: '-126deg' },
  docs: { eyebrow: 'DOCUMENTATION', headline: 'Go from signup to your first live call.', proof: 'Agent  \u2192  Knowledge  \u2192  Channel  \u2192  Test  \u2192  Launch', accent: '#0e7490', hue: '-91deg' },
  about: { eyebrow: 'ABOUT VISTROW VOICE', headline: 'Building the voice layer for every customer conversation.', proof: 'Multilingual  \u00b7  Real-time  \u00b7  Grounded  \u00b7  Dependable', accent: '#9333ea', hue: '0deg' },
  contact: { eyebrow: 'LIVE PRODUCT DEMO', headline: 'Hear your own use case on a live call.', proof: 'Your industry  \u00b7  Your language  \u00b7  Your workflow', accent: '#9333ea', hue: '0deg' },
  careers: { eyebrow: 'CAREERS', headline: 'Build the future of human-sounding voice AI.', proof: 'Real-time systems  \u00b7  Multilingual speech  \u00b7  Product craft', accent: '#db2777', hue: '57deg' },
  changelog: { eyebrow: 'PRODUCT CHANGELOG', headline: 'What\u2019s new in Vistrow Voice.', proof: 'Voices  \u00b7  Latency  \u00b7  Calling  \u00b7  Integrations  \u00b7  Controls', accent: '#0e7490', hue: '-91deg' },
  privacy: { eyebrow: 'PRIVACY', headline: 'Your data. Your control.', proof: 'Clear collection  \u00b7  Retention  \u00b7  Export  \u00b7  Deletion', accent: '#047857', hue: '-126deg' },
  terms: { eyebrow: 'TERMS OF SERVICE', headline: 'Clear terms for using Vistrow Voice.', proof: 'Accounts  \u00b7  Billing  \u00b7  Data  \u00b7  Compliance', accent: '#5d5776', hue: '-30deg' },
  blog: { eyebrow: 'VISTROW VOICE BLOG', headline: 'Practical voice AI guides are coming soon.', proof: 'Product  \u00b7  Implementation  \u00b7  Conversations', accent: '#9333ea', hue: '0deg' },
}
