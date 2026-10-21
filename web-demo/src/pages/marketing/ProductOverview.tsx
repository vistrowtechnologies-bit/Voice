import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { FaqSection } from '../../components/FaqSection'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { CTABand, SectionEyebrow } from '../../components/MarketingBits'
import { PRODUCT_PAGES, HOW_IT_WORKS } from '../../lib/marketingContent'
import { COMPARE_VENDORS } from '../../lib/seoExpansionContent'

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

export function ProductOverview() {
  return (
    <MarketingLayout>
      <Seo
        title="Product Overview - Vistrow Voice"
        description="Voice Agents, Inbound Calling, Outbound Campaigns, Knowledge Base, Website Call Widget, and Integrations - one platform for every AI voice conversation."
        path="/product"
        jsonLd={FAQ_JSONLD}
      />
      <section className="mx-auto max-w-3xl px-5 py-16 text-center md:px-8 lg:py-24">
        <SectionEyebrow>The platform</SectionEyebrow>
        <h1 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight min-[400px]:text-5xl">
          One platform for every voice conversation.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-text-muted">
          Inbound, outbound, and web calls - built, grounded, and analyzed in one place.
          Everything you need to put an AI agent on every call.
        </p>
      </section>

      {/* Bento grid of products */}
      <section className="mx-auto max-w-7xl px-5 pb-8 md:px-8">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUCT_PAGES.map((p) => (
            <Link
              key={p.to}
              to={p.to}
              className="group flex flex-col justify-between rounded-2xl border border-border bg-surface p-7 transition-colors hover:border-primary"
            >
              <div>
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
                  <Icon name={p.icon ?? 'circle'} className="text-[24px]" />
                </span>
                <h3 className="mt-5 font-display text-xl font-semibold">{p.label}</h3>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-text-muted">{p.desc}</p>
              </div>
              <span className="mt-5 flex items-center gap-1 text-sm font-semibold text-primary">
                Learn more
                <Icon name="arrow_forward" className="text-[16px] transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="mb-8 max-w-2xl">
          <SectionEyebrow>Follow one call</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">What happens from first ring to your CRM.</h2>
          <p className="mt-3 text-text-muted">
            The six products are parts of one flow. Each step below is a page in the dashboard, and each links to the product page that covers it.
          </p>
        </div>
        <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {CALL_FLOW.map((step, i) => (
            <li key={step.title} className="flex flex-col rounded-2xl border border-border bg-surface p-6">
              <span className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon name={step.icon} className="text-[22px]" />
                </span>
                <span className="font-display text-2xl font-bold text-border">{`0${i + 1}`}</span>
              </span>
              <h3 className="mt-5 font-display text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{step.body}</p>
              {step.to && step.link && (
                <Link to={step.to} className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold text-primary underline-offset-4 hover:underline">
                  {step.link}
                  <Icon name="arrow_forward" className="text-[16px]" />
                </Link>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="mb-8 max-w-2xl">
          <SectionEyebrow>Where to start</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Pick the problem you have today.</h2>
          <p className="mt-3 text-text-muted">
            Most teams begin with one channel, usually inbound calls or the website widget, get that agent right in the Testing Lab, and add the rest later.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {START_HERE.map((item) => (
            <div key={item.title} className="flex flex-col rounded-2xl border border-border bg-surface p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon name={item.icon} className="text-[22px]" />
              </span>
              <h3 className="mt-5 font-display text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{item.body}</p>
              <Link to={item.to} className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold text-primary underline-offset-4 hover:underline">
                {item.link}
                <Icon name="arrow_forward" className="text-[16px]" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="mb-7 max-w-2xl">
          <SectionEyebrow>Compare your options</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Evaluating voice AI vendors?</h2>
          <p className="mt-3 text-text-muted">Use these practical comparisons to understand what each platform covers and what your team would still need to build.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {COMPARE_VENDORS.map((vendor) => (
            <Link
              key={vendor.slug}
              to={`/compare/${vendor.slug}`}
              className="group flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-primary"
            >
              <span>
                <span className="block font-semibold text-text">Vistrow vs {vendor.name}</span>
                <span className="mt-1 block text-xs text-text-muted">{vendor.category}</span>
              </span>
              <Icon name="arrow_forward" className="shrink-0 text-primary transition-transform group-hover:translate-x-1" />
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-4 md:px-8">
        <Link
          to="/ai-ivr"
          className="group flex flex-col gap-2 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/[0.08] to-surface p-6 transition-colors hover:border-primary sm:flex-row sm:items-center sm:justify-between"
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
      <section className="mx-auto max-w-7xl px-5 py-20 md:px-8">
        <div className="mb-12 text-center">
          <SectionEyebrow>How it fits your stack</SectionEyebrow>
          <h2 className="mt-3 font-display text-4xl font-bold tracking-tight">Number → Agent → Your tools.</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {HOW_IT_WORKS.map((step, i) => (
            <div key={step.title} className="rounded-2xl border border-border bg-surface p-7">
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-high text-primary">
                  <Icon name={step.icon} className="text-[22px]" />
                </span>
                <span className="font-display text-3xl font-bold text-border">{`0${i + 1}`}</span>
              </div>
              <h3 className="mt-5 font-display text-xl font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <FaqSection items={FAQ} />

      <CTABand />
    </MarketingLayout>
  )
}
