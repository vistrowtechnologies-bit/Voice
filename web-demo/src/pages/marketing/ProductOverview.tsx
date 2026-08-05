import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { CTABand, SectionEyebrow } from '../../components/MarketingBits'
import { PRODUCT_PAGES, HOW_IT_WORKS } from '../../lib/marketingContent'

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
  const [openFaq, setOpenFaq] = useState<number | null>(0)
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
        <h1 className="mt-4 font-display text-5xl font-bold leading-[1.05] tracking-tight">
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
          {PRODUCT_PAGES.map((p, i) => (
            <Link
              key={p.to}
              to={p.to}
              className={`group flex flex-col justify-between rounded-2xl border border-border bg-surface p-7 transition-colors hover:border-primary ${
                i === 0 ? 'sm:col-span-2' : ''
              }`}
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
      <section className="mx-auto max-w-3xl px-5 py-20 md:px-8">
        <div className="mb-10 text-center">
          <SectionEyebrow>FAQ</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Questions, answered.</h2>
        </div>
        <div className="flex flex-col gap-3">
          {FAQ.map((item, i) => (
            <div key={item.q} className="rounded-2xl border border-border bg-surface">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left"
              >
                <span className="font-semibold text-text">{item.q}</span>
                <Icon
                  name="expand_more"
                  className={`text-[20px] text-text-muted transition-transform ${openFaq === i ? 'rotate-180' : ''}`}
                />
              </button>
              {openFaq === i && <p className="px-6 pb-5 text-sm leading-relaxed text-text-muted">{item.a}</p>}
            </div>
          ))}
        </div>
      </section>

      <CTABand />
    </MarketingLayout>
  )
}
