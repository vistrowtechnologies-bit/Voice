import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { Icon3D } from '../../components/Icon3D'
import { FaqSection } from '../../components/FaqSection'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { CTABand } from '../../components/MarketingBits'
import { PRODUCT_PAGES, HOW_IT_WORKS } from '../../lib/marketingContent'
import { COMPARE_VENDORS } from '../../lib/seoExpansionContent'
import {
  CALLS_CALLOUTS,
  DashboardCallouts,
  FeatureCards,
  FeatureList,
  ObjectionCards,
  Reveal,
  SectionHead,
  Shot,
  SplitHero,
  SplitRow,
  StickyCta,
  Timeline,
  TrustBand,
  useStickyRefs,
} from '../../components/showcase'
import { PRODUCT_AGENT_CARDS, PRODUCT_CALL_FLOW, PRODUCT_DASHBOARD, PRODUCT_HERO } from './premium-w5/visuals'

const FAQ = [
  {
    q: 'What does the Vistrow Voice platform include?',
    a: 'Voice Agents, Inbound Calling, Outbound Campaigns, a Knowledge Base, a Website Call Widget, and Integrations - all in one dashboard.',
  },
  {
    q: 'Do I need separate tools for inbound and outbound calling?',
    a: 'No - one agent and one dashboard cover inbound, outbound, and web calls, sharing the same knowledge base and analytics.',
  },
  {
    q: 'Can I try the platform before I build anything?',
    a: 'Yes - talk to Artha live in your browser right now on this page, no signup or credit card required.',
  },
  {
    q: 'How is an AI voice agent different from an IVR menu?',
    a: 'An IVR makes the caller press keys through a fixed menu. A Vistrow agent understands what the caller says, answers from your knowledge base and completes the next step, such as booking an appointment or capturing a lead. The AI IVR and IVR comparison pages go into the differences.',
  },
  {
    q: 'Which languages does the platform support?',
    a: 'More than 130 languages, including 10 Indian languages and natural Hinglish, with the agent switching when the caller does. Each language has its own page.',
  },
  {
    q: 'What happens to the calls and leads afterwards?',
    a: 'Every call has a transcript and the lead fields the agent captured, searchable in the dashboard. Qualified leads can be sent to Zoho CRM, ArthaLeads, Slack, Google Sheets or any webhook.',
  },
  {
    q: 'Where do I find the pricing?',
    a: 'On the pricing page, which lists each plan and what it includes.',
  },
]

// What a call passes through, in order. Every step maps to a dashboard page;
// check the help articles before changing a claim here.
const CALL_FLOW = [
  { icon: 'dialpad', title: 'A call or a visit starts', body: 'A customer rings a connected number, a visitor taps the website widget, or a campaign dials a contact.', to: '/product/inbound', link: 'Inbound calling' },
  { icon: 'smart_toy', title: 'An agent takes it', body: 'The agent you configured greets the caller in its default language and follows them if they switch.', to: '/product/agents', link: 'Voice agents' },
  { icon: 'menu_book', title: 'It answers from your facts', body: 'Answers come from your knowledge base, and strict mode keeps the agent to approved answers.', to: '/product/knowledge-base', link: 'Knowledge base' },
  { icon: 'event_available', title: 'It completes a next step', body: 'Book an appointment, take a callback request, capture lead details, or transfer a phone call to a person.' },
  { icon: 'hub', title: 'Your team gets the result', body: 'The transcript and lead fields reach your CRM, Slack, Google Sheets or webhook, and every call stays searchable in the dashboard.', to: '/product/integrations', link: 'Integrations' },
]

// Starting points by goal, each pointing at the page that covers it.
const START_HERE = [
  { icon: 'call_received', title: 'Stop missing calls', body: 'Answer the business number around the clock, inside the hours and limits you set.', to: '/product/inbound', link: 'Inbound calling' },
  { icon: 'graphic_eq', title: 'Talk to website visitors', body: 'Add a call button so a visitor can ask a question by voice, with no phone number.', to: '/product/widget', link: 'Website call widget' },
  { icon: 'campaign', title: 'Follow up with contacts', body: 'Reminders and follow-ups to a contact list, with Do-Not-Call and calling-window checks before every dial.', to: '/product/outbound', link: 'Outbound campaigns' },
  { icon: 'translate', title: 'Serve regional-language callers', body: 'More than 130 languages, including 10 Indian languages, with each language page covering how callers actually speak.', to: '/languages', link: 'Languages' },
  { icon: 'apartment', title: 'Fit it to your industry', body: 'See the flows for real estate, healthcare, e-commerce, finance and support.', to: '/solutions', link: 'Solutions' },
  { icon: 'payments', title: 'Check what a plan includes', body: 'Plans and what they include are on the pricing page, and our team can walk you through them.', to: '/pricing', link: 'Pricing' },
]

// Answer-engine-friendly (AEO/GEO): FAQPage structured data lets Google,
// Bing, and LLM-based answer engines quote these Q&As directly instead of
// having to scrape the accordion markup.
const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
}

// Premium template (showcase kit): split hero with the dashboard overview, the
// six products as a bento around the agent cards, the call flow beside its
// diagram, starting points, the violet trust band, a dashboard tour,
// comparisons, the stack timeline, objections, FAQ and the CTA band.
export function ProductOverview() {
  const { heroCtaRef, endRef } = useStickyRefs()
  const [lead, ...products] = PRODUCT_PAGES

  return (
    <MarketingLayout>
      <Seo
        title="Product Overview - Vistrow Voice"
        description="Voice Agents, Inbound Calling, Outbound Campaigns, Knowledge Base, Website Call Widget, and Integrations - one platform for every AI voice conversation."
        path="/product"
        jsonLd={FAQ_JSONLD}
      />
      <SplitHero
        eyebrow="The platform"
        title="One platform for every voice conversation."
        subhead={
          <>
            Inbound, outbound, and web calls - built, grounded, and analyzed in one place.
            Everything you need to put an AI agent on every call.
          </>
        }
        visual={PRODUCT_HERO}
        chips={[
          { label: 'Inbound, outbound and web', live: true },
          { label: 'One dashboard', icon: 'dashboard' },
        ]}
        placement="product_overview_hero"
        ctaRef={heroCtaRef}
      />

      {/* The six products as a bento: the agent cards view with the first
          product as the violet lead tile, the rest as lifted link cards. */}
      <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12">
          <Reveal className="h-full sm:col-span-2 lg:col-span-8">
            <figure className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-panel">
              <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/25 blur-[90px]" />
              <div className="relative flex flex-1 items-center justify-center p-4 sm:p-6">
                <Shot
                  figure={PRODUCT_AGENT_CARDS}
                  sizes="(min-width: 1280px) 780px, (min-width: 1024px) 64vw, calc(100vw - 40px)"
                  className="rounded-xl shadow-[0_20px_40px_-24px_rgba(76,29,149,0.6)]"
                />
              </div>
              <figcaption className="relative border-t border-panel-line bg-surface/70 px-5 py-3 text-xs leading-relaxed text-text-muted">
                {PRODUCT_AGENT_CARDS.caption}
              </figcaption>
            </figure>
          </Reveal>
          <Reveal delayMs={60} className="h-full lg:col-span-4">
            <Link
              to={lead.to}
              className="bento-hero group relative flex h-full flex-col overflow-hidden rounded-3xl p-7 shadow-[0_24px_50px_-30px_rgba(76,29,149,0.9)]"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 text-white">
                <Icon3D name={lead.icon ?? 'circle'} size={34} plate className="text-[24px]" />
              </span>
              <h3 className="mt-5 font-display text-2xl font-bold">{lead.label}</h3>
              <p className="mt-2 max-w-md text-[15px] leading-relaxed text-white/85">{lead.desc}</p>
              <span className="mt-auto flex items-center gap-1 pt-6 text-sm font-semibold text-white">
                Learn more
                <Icon name="arrow_forward" className="text-[16px] transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          </Reveal>
          {products.map((p, i) => (
            <Reveal key={p.to} delayMs={(i % 3) * 60} className={`h-full ${i < 2 ? 'lg:col-span-6' : 'lg:col-span-4'}`}>
              <Link to={p.to} className="vv-lift group flex h-full flex-col justify-between rounded-3xl border border-border bg-surface p-7">
                <div>
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/12 text-primary">
                    <Icon3D name={p.icon ?? 'circle'} size={38} className="text-[24px]" />
                  </span>
                  <h3 className="mt-5 font-display text-xl font-semibold">{p.label}</h3>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-text-muted">{p.desc}</p>
                </div>
                <span className="mt-5 flex items-center gap-1 text-sm font-semibold text-primary">
                  Learn more
                  <Icon name="arrow_forward" className="text-[16px] transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* The call flow beside its diagram. */}
      <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-16">
        <SplitRow figure={PRODUCT_CALL_FLOW} className="">
          <Reveal>
            <SectionHead
              eyebrow="Follow one call"
              title="What happens from first ring to your CRM."
              intro="The six products are parts of one flow. Each step below is a page in the dashboard, and each links to the product page that covers it."
            />
          </Reveal>
          <FeatureList items={CALL_FLOW.map((step, i) => ({ ...step, title: `${i + 1}. ${step.title}` }))} />
        </SplitRow>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-16">
        <Reveal>
          <SectionHead
            eyebrow="Where to start"
            title="Pick the problem you have today."
            intro="Most teams begin with one channel, usually inbound calls or the website widget, get that agent right in the Testing Lab, and add the rest later."
            className="mb-10"
          />
        </Reveal>
        <FeatureCards items={START_HERE} />
      </section>

      <TrustBand placement="product_overview_trust_band" />

      <DashboardCallouts view={PRODUCT_DASHBOARD} callouts={CALLS_CALLOUTS} />

      <section className="mx-auto max-w-7xl px-5 py-14 md:px-8">
        <Reveal>
          <SectionHead
            eyebrow="Compare your options"
            title="Evaluating voice AI vendors?"
            intro="Use these practical comparisons to understand what each platform covers and what your team would still need to build."
            className="mb-8"
          />
        </Reveal>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {COMPARE_VENDORS.map((vendor) => (
            <Link
              key={vendor.slug}
              to={`/compare/${vendor.slug}`}
              className="vv-lift group flex items-center justify-between gap-3 rounded-3xl border border-border bg-surface p-5"
            >
              <span>
                <span className="block font-semibold text-text">Vistrow vs {vendor.name}</span>
                <span className="mt-1 block text-xs text-text-muted">{vendor.category}</span>
              </span>
              <Icon name="arrow_forward" className="shrink-0 text-primary transition-transform group-hover:translate-x-1" />
            </Link>
          ))}
        </div>
        <Link
          to="/ai-ivr"
          className="vv-lift group mt-6 flex flex-col gap-2 rounded-3xl border border-primary/25 bg-gradient-to-r from-primary/[0.10] via-surface to-surface p-6 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>
            <span className="block font-display text-lg font-semibold text-text">Replacing a press-1 phone menu?</span>
            <span className="mt-1 block text-sm text-text-muted">
              See how an AI IVR answers your business number in the caller’s language.
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary">
            AI IVR
            <Icon name="arrow_forward" className="text-[16px] transition-transform group-hover:translate-x-1" />
          </span>
        </Link>
      </section>

      {/* How it fits */}
      <Timeline eyebrow="How it fits your stack" title="Number → Agent → Your tools." steps={HOW_IT_WORKS} />

      <ObjectionCards route="/product" placement="product_overview_objections" />

      {/* FAQ */}
      <FaqSection items={FAQ} />

      <div ref={endRef} />
      <CTABand />
      <StickyCta heroCtaRef={heroCtaRef} endRef={endRef} />
    </MarketingLayout>
  )
}
