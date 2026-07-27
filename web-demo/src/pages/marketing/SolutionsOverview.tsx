import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { CTABand, SectionEyebrow } from '../../components/MarketingBits'
import { SOLUTIONS } from '../../lib/marketingContent'

const FAQ = [
  {
    q: 'Which industries does Vistrow Voice support?',
    a: 'Real Estate, Healthcare & Clinics, E-commerce & D2C, Finance & Collections, and Support & Helpdesk — each with its own tuned agent behavior.',
  },
  {
    q: 'Is the agent pre-built for my industry, or do I configure it?',
    a: 'Each solution page shows the pains and features a typical setup covers — you configure the actual agent, prompt, and knowledge base to match your business.',
  },
  {
    q: 'Can one account run agents for more than one industry use case?',
    a: 'Yes — build as many agents as you need on one account, each with its own persona, prompt, and knowledge base.',
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

export function SolutionsOverview() {
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  return (
    <MarketingLayout>
      <Seo
        title="Solutions by Industry — Vistrow Voice"
        description="Voice AI tuned to how your business takes calls — Real Estate, Healthcare, E-commerce, Finance & Collections, and Support & Helpdesk."
        path="/solutions"
        jsonLd={FAQ_JSONLD}
      />
      <section className="mx-auto max-w-3xl px-5 py-16 text-center md:px-8 lg:py-24">
        <SectionEyebrow>Solutions</SectionEyebrow>
        <h1 className="mt-4 font-display text-5xl font-bold leading-[1.05] tracking-tight">
          Voice AI for your industry.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-text-muted">
          One platform, tuned to how your business actually takes calls — from real-estate
          enquiries to collections reminders.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-8 md:px-8">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SOLUTIONS.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className="group flex flex-col justify-between rounded-2xl border border-border bg-surface p-7 transition-colors hover:border-primary"
            >
              <div>
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-high text-cyan">
                  <Icon name={s.icon ?? 'circle'} className="text-[24px]" />
                </span>
                <h3 className="mt-5 font-display text-xl font-semibold">{s.label}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">{s.desc}</p>
              </div>
              <span className="mt-5 flex items-center gap-1 text-sm font-semibold text-primary">
                Explore
                <Icon name="arrow_forward" className="text-[16px] transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
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
