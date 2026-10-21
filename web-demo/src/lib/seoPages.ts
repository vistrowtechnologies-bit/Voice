// Canonical SEO source for every indexable marketing route.
//
// Both the browser-side <Seo> component and the build-time prerenderer read
// this file. Keeping titles, descriptions, social images and schema labels in
// one registry prevents the production HTML from drifting away from what a
// visitor sees after React hydrates.

export const SEO_ORIGIN = 'https://www.vistrowvoice.com'
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
  | 'article'
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
  /** Service schema type, when the default `AI voice <label>` reads wrong. */
  serviceType?: string
}

export interface OgCardSpec {
  eyebrow: string
  headline: string
  proof: string
  accent: string
  hue: string
  native?: string
}

import { BUYER_GUIDES, COMPARE_VENDORS, DEMO_CALLS, LOCAL_REAL_ESTATE_PAGES } from './seoExpansionContent'
import { HELP_TOPICS } from '../content/helpArticles'
import { BLOG_PAGE_COUNT, VOICE_BLOG_POSTS, blogPagePath } from '../content/voiceBlog'

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

const LANGUAGE_SEO_META: Partial<Record<(typeof LANGUAGE_PAGES)[number][0], { title: string; description: string }>> = {
  hindi: {
    title: 'Hindi AI Voice Calling Agent with Hinglish | Vistrow Voice',
    description:
      'AI voice agent in Hindi and Hinglish for inbound calls, reminders and web calls. An AI calling agent in Hindi that qualifies leads and logs every call.',
  },
  kannada: {
    title: 'Kannada AI Voice Calling Agent for Karnataka | Vistrow Voice',
    description:
      'AI voice calling agent in Kannada for Bengaluru and Karnataka businesses. Follows Kannada-English switching, qualifies leads, books visits, records calls.',
  },
  telugu: {
    title: 'Telugu AI Voice Calling Agent for Phone & Web | Vistrow Voice',
    description:
      'AI voice calling agent in Telugu for Hyderabad, Andhra Pradesh and Telangana. Answers phone and website calls, books appointments and logs every call.',
  },
  tamil: {
    title: 'Tamil AI Voice Calling Agent for Tamil Nadu | Vistrow Voice',
    description:
      'Tamil AI voice calling agent for Chennai and Tamil Nadu. Follows Tamil-English switching, qualifies leads, books visits and appointments, logs every call.',
  },
  punjabi: {
    title: 'Punjabi AI Voice Calling Agent for Punjab | Vistrow Voice',
    description:
      'Punjabi AI voice calling agent for Punjab, Chandigarh and Delhi NCR. Follows Punjabi, Hindi and English in one call, books appointments, logs every call.',
  },
  marathi: {
    title: 'Marathi AI Voice Calling Agent for Maharashtra | Vistrow Voice',
    description:
      'Answer Pune, Mumbai, and Maharashtra customer calls with a Marathi AI voice agent that can switch to Hindi or English and save structured call outcomes.',
  },
}

export const SEO_PAGES: SeoPage[] = [
  page(
    '/',
    'AI Voice Agent for India in 130+ Languages | Vistrow Voice',
    'An AI voice agent for Indian businesses: an AI voice calling agent that answers, qualifies and books customers on phone and web in 130+ languages.',
    'home',
    'Vistrow Voice multilingual AI voice agent orb: 130+ languages including Hindi and English across phone and web',
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
    'Inbound Call Answering with AI | Vistrow Voice',
    'Answer every inbound call 24/7 with a multilingual AI agent that qualifies intent, handles questions, books next steps and routes callers to your team.',
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
    'Add a real-time multilingual AI voice conversation to any website with one script or the WordPress plugin. No phone number or app required.',
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
    'AI Calling Agent for Real Estate in India | Vistrow Voice',
    'AI calling agent for real estate: qualifies buyer enquiries on budget and location, books site visits on your calendar, calls new leads in seconds.',
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
    'AI Collections & EMI Reminder Voice Agent | Vistrow Voice',
    'AI voice agent for loan collections and EMI reminders in India: calling-hour limits, Do-Not-Call checks, promised dates captured, every call logged.',
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
    'AI Voice Agents in 130+ Languages incl. Hindi | Vistrow Voice',
    'AI voice agents that speak 130+ languages, including Hindi, English, Marathi, Tamil, Telugu, Kannada, Bengali, Gujarati, Malayalam, Punjabi and Odia.',
    'languages',
    'Vistrow Voice multilingual AI orb surrounded by Indian language scripts',
    'collection',
    'Languages',
  ),
  ...LANGUAGE_PAGES.map(([slug, name, native]) =>
    page(
      `/languages/${slug}`,
      LANGUAGE_SEO_META[slug]?.title ?? `${name} AI Voice Agent for Customer Calls | Vistrow Voice`,
      LANGUAGE_SEO_META[slug]?.description ??
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
    'Connect Vistrow Voice call leads, transcripts, and outcomes to CRMs, Slack, Google Sheets, automation platforms, and webhooks.',
    'integrations',
    'Vistrow Voice orb connected to CRM, messaging, spreadsheet, and automation tools',
    'collection',
    'Integrations',
  ),
  {
    ...page(
      '/ai-ivr',
      'AI IVR System and Cloud IVR for India | Vistrow Voice',
      'An AI IVR system for India: callers say what they need on an IVR call and get an answer, a booking or a transfer. A cloud IVR in 130+ languages.',
      'vs-ivr',
      'A press-1 phone menu replaced by a conversational Vistrow Voice AI IVR',
      'product',
      'AI IVR',
    ),
    serviceType: 'AI IVR (conversational IVR replacement)',
  },
  {
    ...page(
      '/ai-receptionist',
      'AI Receptionist for Indian Businesses | Vistrow Voice',
      'An AI receptionist that answers your phone and website calls in 130+ languages, including Hindi and English, books appointments and transfers to your team.',
      'ai-receptionist',
      'Vistrow Voice AI receptionist orb answering a front-desk call',
      'product',
      'AI Receptionist',
    ),
    serviceType: 'AI receptionist (virtual phone and website receptionist)',
  },
  page(
    '/vs-ivr',
    'IVR vs AI Voice Agent vs Chatbot | Vistrow Voice',
    'IVR vs AI voice agent, chatbot or receptionist: plain definitions, a side-by-side table, which fits when, and how to replace a menu IVR step by step.',
    'vs-ivr',
    'Traditional IVR keypad compared with a conversational Vistrow Voice AI orb',
    'page',
    'AI Voice Agent vs IVR',
  ),
  ...COMPARE_VENDORS.map((vendor) =>
    page(
      `/compare/${vendor.slug}`,
      vendor.title,
      vendor.description,
      `compare-${vendor.slug}`,
      `Vistrow Voice compared with ${vendor.name} for AI voice calling buyers`,
      'page',
      `Vistrow Voice vs ${vendor.name}`,
    ),
  ),
  ...BUYER_GUIDES.map((guide) =>
    page(
      `/${guide.slug}`,
      guide.title,
      guide.description,
      guide.slug,
      `${guide.headline} buyer guide from Vistrow Voice`,
      'page',
      guide.headline,
    ),
  ),
  ...LOCAL_REAL_ESTATE_PAGES.map((entry) =>
    page(
      `/solutions/real-estate/${entry.slug}`,
      entry.title,
      entry.description,
      entry.slug,
      `${entry.language} real estate AI calling agent for ${entry.city}`,
      'solution',
      `${entry.language} Real Estate`,
    ),
  ),
  ...DEMO_CALLS.map((demo) =>
    page(
      `/demo-calls/${demo.slug}`,
      `${demo.title} | Vistrow Voice`,
      demo.description,
      `demo-${demo.slug}`,
      `${demo.title} transcript and CRM-ready call output example`,
      'page',
      demo.title,
    ),
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
  // Public help centre — generated from server/help_articles.py, the same
  // articles the in-app Help & Support page and the help bot use.
  page(
    '/help',
    'Help Center | Vistrow Voice',
    'Step-by-step guides for Vistrow Voice AI voice agents: phone numbers, website call widget, knowledge base, campaigns, CRM integrations, compliance and billing.',
    'docs',
    'Vistrow Voice help center with guides for every part of the dashboard',
    'collection',
    'Help Center',
  ),
  ...HELP_TOPICS.map((t) =>
    page(
      `/help/${t.slug}`,
      `${t.title} help | Vistrow Voice`,
      `How to use ${t.title} in Vistrow Voice: ${t.articles.map((a) => a.title.toLowerCase()).join('; ')}.`.slice(0, 158),
      'docs',
      `Vistrow Voice help articles for ${t.title}`,
      'collection',
      t.title,
    ),
  ),
  ...HELP_TOPICS.flatMap((t) =>
    t.articles.map((a) =>
      page(
        `/help/${t.slug}/${a.slug}`,
        `${a.title} | Vistrow Voice Help`,
        `${a.summary} A step-by-step Vistrow Voice guide for ${t.title.toLowerCase()}, for AI voice agents in Indian businesses.`.slice(0, 158),
        'docs',
        `${a.title} | Vistrow Voice help article`,
        'docs',
        a.title,
      ),
    ),
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
    'Contact Vistrow Voice and Book a Demo',
    'Book a Vistrow Voice demo or contact Vistrow Technologies Pvt. Ltd. by email, phone or WhatsApp on +91 90670 97779.',
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
  { ...page(
    '/resources/blog',
    'Voice AI Guides, Product Insights & Playbooks | Vistrow Voice',
    'Practical guides to AI voice agents, multilingual customer conversations, latency, website voice widgets, and CRM integrations from the Vistrow Voice team.',
    'blog',
    'Vistrow Voice journal featuring practical guides to voice AI and customer conversations',
    'collection',
    'Blog',
  ), image: `${SEO_ORIGIN}/blog/what-is-an-ai-voice-agent.jpg`, imageAlt: 'Artha, an AI voice agent with a headset, on a call in a bright office, with chips for listens, answers and books' },
  ...Array.from({ length: BLOG_PAGE_COUNT - 1 }, (_, index) => index + 2).map((n) => ({ ...page(
    blogPagePath(n),
    `Voice AI Guides and Playbooks, Page ${n} | Vistrow Voice`,
    `Page ${n} of the Vistrow Voice blog: more practical guides to AI voice agents, multilingual calls, IVR, latency and CRM integrations.`,
    'blog',
    'Vistrow Voice journal featuring practical guides to voice AI and customer conversations',
    'collection',
    `Blog, page ${n}`,
  ), image: `${SEO_ORIGIN}/blog/what-is-an-ai-voice-agent.jpg`, imageAlt: 'Artha, an AI voice agent with a headset, on a call in a bright office, with chips for listens, answers and books' })),
  ...VOICE_BLOG_POSTS.map((post) => ({ ...page(
    `/resources/blog/${post.slug}`,
    post.seoTitle ?? `${post.title} | Vistrow Voice`,
    post.metaDescription ?? post.excerpt,
    'blog',
    `Vistrow Voice guide: ${post.title}`,
    'article',
    post.title,
  ), image: `${SEO_ORIGIN}${post.image}`, imageAlt: post.imageAlt })),
  {
    ...page(
      '/voice-ai-platform',
      'Voice AI Platform for Indian Businesses | Vistrow Voice',
      'A voice AI platform for India: build agents, add your knowledge, connect phone numbers and a website widget, test, and send every call record to your CRM.',
      'voice-ai-platform',
      'Vistrow Voice voice AI platform with agent builder, knowledge, phone, widget and integrations',
      'product',
      'Voice AI Platform',
    ),
    serviceType: 'Voice AI platform',
  },
  {
    ...page(
      '/ai-call-center',
      'AI Call Center Automation Software for India | Vistrow Voice',
      'Call center automation for the first line: AI call center software that takes inbound calls and follow-ups in Indian languages and logs every call.',
      'ai-call-center',
      'Vistrow Voice AI agent answering first-line call center calls',
      'product',
      'AI Call Center',
    ),
    serviceType: 'AI call center software',
  },
  {
    ...page(
      '/voice-bot',
      'AI Voice Bot for Business Calls in India | Vistrow Voice',
      'What an AI voice bot is, how a voicebot call works, and how Vistrow Voice runs one on phone and website calls in 130+ languages, including Hindi and English.',
      'voice-bot',
      'Vistrow Voice AI voice bot for phone and website calls',
      'product',
      'AI Voice Bot',
    ),
    serviceType: 'AI voice bot',
  },
  {
    ...page(
      '/ai-telecaller',
      'AI Telecaller for Indian Businesses | Vistrow Voice',
      'An AI telecaller that answers and calls back leads, qualifies them and runs follow-ups in 130+ languages, including Hindi and English, inside your calling rules.',
      'ai-telecaller',
      'Vistrow Voice AI telecaller orb handling lead calls and follow-ups',
      'product',
      'AI Telecaller',
    ),
    serviceType: 'AI telecaller for lead calls and follow-ups',
  },
  {
    ...page(
      '/ai-calling-agent',
      'AI Calling Agent & Automated Calling Software | Vistrow Voice',
      'An AI calling agent for Indian businesses: automated calling software that answers inbound calls, calls leads back and follows up in 130+ languages.',
      'ai-calling-agent',
      'Vistrow Voice AI calling agent handling inbound and outbound business calls',
      'product',
      'AI Calling Agent',
    ),
    serviceType: 'AI calling agent',
  },
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
        email: 'info@vistrowvoice.com',
        telephone: '+91-90670-97779',
        contactPoint: [
          {
            '@type': 'ContactPoint',
            contactType: 'sales',
            telephone: '+91-90670-97779',
            email: 'info@vistrowvoice.com',
            areaServed: 'IN',
            availableLanguage: ['English', 'Hindi'],
          },
        ],
        parentOrganization: {
          '@type': 'Organization',
          name: 'Vistrow Technologies Pvt. Ltd.',
          alternateName: 'Vistrow',
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
      serviceType: entry.serviceType ?? (entry.kind === 'solution' ? `${entry.label} AI voice agent` : `AI voice ${entry.label}`),
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
  home: { eyebrow: 'MULTILINGUAL VOICE AI', headline: 'Voice AI that speaks your customer\u2019s language.', proof: '130+ languages, Hindi to Tamil  \u00b7  Phone + Web', accent: '#9333ea', hue: '0deg' },
  product: { eyebrow: 'VISTROW VOICE PLATFORM', headline: 'Everything you need to run voice AI.', proof: 'Build  \u00b7  Call  \u00b7  Learn  \u00b7  Integrate', accent: '#9333ea', hue: '0deg' },
  'product-agents': { eyebrow: 'VOICE AGENTS', headline: 'Build a voice agent in minutes.', proof: 'Persona  \u00b7  Knowledge  \u00b7  Voice  \u00b7  Tools', accent: '#9333ea', hue: '0deg' },
  'product-inbound': { eyebrow: 'INBOUND CALLING', headline: 'Answer customer calls, day or night.', proof: 'Qualify  \u00b7  Answer  \u00b7  Book  \u00b7  Route', accent: '#0e7490', hue: '-91deg' },
  'product-outbound': { eyebrow: 'OUTBOUND CAMPAIGNS', headline: 'Follow-up calls without manual dialing.', proof: 'Reminders  \u00b7  Follow-ups  \u00b7  Do-Not-Call checks', accent: '#db2777', hue: '57deg' },
  'product-knowledge-base': { eyebrow: 'KNOWLEDGE BASE', headline: 'Answers grounded in your business.', proof: 'Approved sources  \u00b7  Strict mode  \u00b7  Current facts', accent: '#047857', hue: '-126deg' },
  'product-widget': { eyebrow: 'WEBSITE CALL WIDGET', headline: 'Turn every website visit into a conversation.', proof: 'One tap  \u00b7  No app  \u00b7  No phone number', accent: '#7e22ce', hue: '-12deg' },
  'product-integrations': { eyebrow: 'PRODUCT INTEGRATIONS', headline: 'Every lead. Already in your stack.', proof: 'Zoho CRM  \u00b7  Slack  \u00b7  Sheets  \u00b7  Webhooks', accent: '#0e7490', hue: '-91deg' },
  solutions: { eyebrow: 'SOLUTIONS BY INDUSTRY', headline: 'Voice AI trained for the calls your industry handles.', proof: 'Property  \u00b7  Clinics  \u00b7  Commerce  \u00b7  Finance  \u00b7  Support', accent: '#9333ea', hue: '0deg' },
  'solution-real-estate': { eyebrow: 'REAL ESTATE', headline: 'Never miss a buyer enquiry again.', proof: 'Qualify buyers  \u00b7  Answer project questions  \u00b7  Book visits', accent: '#b45309', hue: '129deg' },
  'solution-healthcare': { eyebrow: 'HEALTHCARE & CLINICS', headline: 'A front desk that never sleeps.', proof: 'Patient questions  \u00b7  Appointment requests  \u00b7  24/7', accent: '#047857', hue: '-101deg' },
  'solution-ecommerce': { eyebrow: 'E-COMMERCE & D2C', headline: 'Support that scales with every sale.', proof: 'Orders  \u00b7  Delivery  \u00b7  Returns  \u00b7  Follow-up', accent: '#db2777', hue: '57deg' },
  'solution-finance': { eyebrow: 'FINANCE & COLLECTIONS', headline: 'Collections conversations, handled with care.', proof: 'Respectful reminders  \u00b7  Logged outcomes  \u00b7  Controls', accent: '#047857', hue: '-126deg' },
  'solution-support': { eyebrow: 'SUPPORT & HELPDESK', headline: 'Resolve tier-one issues on the first call.', proof: 'Troubleshoot  \u00b7  Resolve  \u00b7  Escalate with context', accent: '#0e7490', hue: '-91deg' },
  languages: { eyebrow: 'MULTILINGUAL BY DESIGN', headline: '130+ languages, Hindi to Tamil.', proof: 'Mid-call language switching  \u00b7  Phone + Web', accent: '#9333ea', hue: '0deg', native: 'हिन्दी  ·  ಕನ್ನಡ  ·  తెలుగు  ·  தமிழ்  ·  বাংলা' },
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
  pricing: { eyebrow: 'VOICE AI PRICING', headline: 'Start small. Scale every conversation.', proof: 'Phone + Web  \u00b7  Billed by call minutes  \u00b7  Usage visibility', accent: '#9333ea', hue: '0deg' },
  integrations: { eyebrow: 'VOICE AI INTEGRATIONS', headline: 'Your calls. Your CRM. Already synced.', proof: 'Zoho CRM  \u00b7  ArthaLeads  \u00b7  Slack  \u00b7  Sheets  \u00b7  Webhooks', accent: '#0e7490', hue: '-91deg' },
  'ai-receptionist': { eyebrow: 'AI RECEPTIONIST', headline: 'Front-desk calls, in the caller’s language.', proof: 'Answer  \u00b7  Book  \u00b7  Transfer  \u00b7  Record', accent: '#0e7490', hue: '-91deg' },
  'voice-ai-platform': { eyebrow: 'VOICE AI PLATFORM', headline: 'Build, test and run voice agents in one place.', proof: 'Agents  \u00b7  Knowledge  \u00b7  Phone + Web  \u00b7  CRM', accent: '#9333ea', hue: '0deg' },
  'ai-call-center': { eyebrow: 'AI CALL CENTER', headline: 'An AI first line for your call center.', proof: 'Answer  \u00b7  Follow up  \u00b7  Transfer  \u00b7  Log', accent: '#0e7490', hue: '-91deg' },
  'voice-bot': { eyebrow: 'AI VOICE BOT', headline: 'A voice bot that holds a real conversation.', proof: 'Phone + Web  \u00b7  Indian languages  \u00b7  Call records', accent: '#7e22ce', hue: '-12deg' },
  'ai-calling-agent': { eyebrow: 'AI CALLING AGENT', headline: 'One agent for inbound and outbound calls.', proof: 'Answer  \u00b7  Call back  \u00b7  Qualify  \u00b7  Transfer', accent: '#0f766e', hue: '-120deg' },
  'ai-telecaller': { eyebrow: 'AI TELECALLER', headline: 'Lead calls and follow-ups, in your callers\u2019 language.', proof: 'Qualify  \u00b7  Follow up  \u00b7  Callbacks  \u00b7  Handoff', accent: '#db2777', hue: '57deg' },
  'vs-ivr': { eyebrow: 'AI VOICE VS IVR', headline: 'Stop making callers press buttons.', proof: 'Natural answers  \u00b7  Language switching  \u00b7  Complete records', accent: '#b45309', hue: '129deg' },
  ...Object.fromEntries(
    COMPARE_VENDORS.map((vendor) => [
      `compare-${vendor.slug}`,
      {
        eyebrow: 'BUYER COMPARISON',
        headline: `Vistrow Voice vs ${vendor.name}`,
        proof: 'Latency  ·  Languages  ·  CRM output  ·  Call records',
        accent: '#9333ea',
        hue: '0deg',
      },
    ]),
  ),
  'best-ai-voice-calling-software-india': { eyebrow: 'BUYER GUIDE', headline: 'Choose AI voice calling software that works on real calls.', proof: 'India languages  ·  Phone + Web  ·  CRM-ready', accent: '#0e7490', hue: '-91deg' },
  'ai-voice-bot-pricing-india': { eyebrow: 'PRICING GUIDE', headline: 'What AI voice bot pricing really includes.', proof: 'Telephony  ·  STT  ·  LLM  ·  TTS  ·  Storage', accent: '#b45309', hue: '129deg' },
  'hindi-ai-calling-agent-real-estate': { eyebrow: 'HINDI REAL ESTATE AI', headline: 'Qualify property leads in Hindi and Hinglish.', proof: 'Budget  ·  Location  ·  Site visits  ·  CRM', accent: '#9333ea', hue: '0deg', native: 'हिन्दी' },
  'marathi-ai-calling-agent-mumbai-real-estate': { eyebrow: 'MARATHI REAL ESTATE AI', headline: 'Marathi property calls for Mumbai and Pune.', proof: 'Buyer enquiries  ·  Follow-up  ·  Site visits', accent: '#9333ea', hue: '0deg', native: 'मराठी' },
  'kannada-ai-voice-bot-bangalore-real-estate': { eyebrow: 'KANNADA REAL ESTATE AI', headline: 'Kannada voice bot for Bengaluru property leads.', proof: 'Kannada + English  ·  CRM-ready records', accent: '#9333ea', hue: '0deg', native: 'ಕನ್ನಡ' },
  'telugu-ai-calling-agent-hyderabad-real-estate': { eyebrow: 'TELUGU REAL ESTATE AI', headline: 'Telugu AI calling for Hyderabad property leads.', proof: 'Phone + Web  ·  Transcript  ·  Lead fields', accent: '#9333ea', hue: '0deg', native: 'తెలుగు' },
  'gujarati-ai-calling-agent-ahmedabad-real-estate': { eyebrow: 'GUJARATI REAL ESTATE AI', headline: 'Gujarati calls for Ahmedabad property teams.', proof: 'Qualification  ·  Summary  ·  CRM handoff', accent: '#9333ea', hue: '0deg', native: 'ગુજરાતી' },
  'demo-hindi-real-estate-lead-qualification': { eyebrow: 'DEMO CALL', headline: 'Hindi real estate lead qualification call.', proof: 'Transcript  ·  Summary  ·  CRM fields', accent: '#9333ea', hue: '0deg', native: 'हिन्दी' },
  'demo-marathi-site-visit-booking': { eyebrow: 'DEMO CALL', headline: 'Marathi site visit booking call.', proof: 'Intent  ·  Preferred time  ·  Follow-up', accent: '#9333ea', hue: '0deg', native: 'मराठी' },
  'demo-kannada-inbound-property-enquiry': { eyebrow: 'DEMO CALL', headline: 'Kannada inbound property enquiry call.', proof: 'Project question  ·  Budget  ·  Sales handoff', accent: '#9333ea', hue: '0deg', native: 'ಕನ್ನಡ' },
  'demo-telugu-website-widget-call': { eyebrow: 'DEMO CALL', headline: 'Telugu website widget voice call.', proof: 'Browser voice  ·  Page source  ·  CRM-ready', accent: '#9333ea', hue: '0deg', native: 'తెలుగు' },
  security: { eyebrow: 'SECURITY & TRUST', headline: 'Clear controls around every conversation.', proof: 'Workspace isolation  \u00b7  Access controls  \u00b7  Retention', accent: '#047857', hue: '-126deg' },
  docs: { eyebrow: 'DOCUMENTATION', headline: 'Go from signup to your first live call.', proof: 'Agent  \u2192  Knowledge  \u2192  Channel  \u2192  Test  \u2192  Launch', accent: '#0e7490', hue: '-91deg' },
  about: { eyebrow: 'ABOUT VISTROW VOICE', headline: 'Building the voice layer for every customer conversation.', proof: 'Multilingual  \u00b7  Real-time  \u00b7  Grounded  \u00b7  Dependable', accent: '#9333ea', hue: '0deg' },
  contact: { eyebrow: 'LIVE PRODUCT DEMO', headline: 'Hear your own use case on a live call.', proof: 'Your industry  \u00b7  Your language  \u00b7  Your workflow', accent: '#9333ea', hue: '0deg' },
  careers: { eyebrow: 'CAREERS', headline: 'Build the future of human-sounding voice AI.', proof: 'Real-time systems  \u00b7  Multilingual speech  \u00b7  Product craft', accent: '#db2777', hue: '57deg' },
  changelog: { eyebrow: 'PRODUCT CHANGELOG', headline: 'What\u2019s new in Vistrow Voice.', proof: 'Voices  \u00b7  Latency  \u00b7  Calling  \u00b7  Integrations  \u00b7  Controls', accent: '#0e7490', hue: '-91deg' },
  privacy: { eyebrow: 'PRIVACY', headline: 'Your data. Your control.', proof: 'Clear collection  \u00b7  Retention  \u00b7  Export  \u00b7  Deletion', accent: '#047857', hue: '-126deg' },
  terms: { eyebrow: 'TERMS OF SERVICE', headline: 'Clear terms for using Vistrow Voice.', proof: 'Accounts  \u00b7  Billing  \u00b7  Data  \u00b7  Compliance', accent: '#5d5776', hue: '-30deg' },
  blog: { eyebrow: 'VISTROW VOICE JOURNAL', headline: 'Better conversations start with better systems.', proof: 'Voice AI  ·  Languages  ·  Customer experience', accent: '#9333ea', hue: '0deg' },
}
