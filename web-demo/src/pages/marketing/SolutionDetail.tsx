import { useState } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { PageHero, CTABand, SectionEyebrow } from '../../components/MarketingBits'
import { SOLUTIONS } from '../../lib/marketingContent'
import { DemoOrbCard } from '../../components/DemoOrbCard'

// One template renders all five industry pages, keyed by the :slug route param.
export function SolutionDetail() {
  const { slug } = useParams()
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const solution = SOLUTIONS.find((s) => s.to === `/solutions/${slug}`)
  if (!solution) return <Navigate to="/solutions" replace />

  // Answer-engine-friendly (AEO/GEO): FAQPage structured data lets Google,
  // Bing, and LLM-based answer engines quote these Q&As directly instead of
  // having to scrape the accordion markup.
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: solution.faqs.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }

  return (
    <MarketingLayout>
      <Seo title={`${solution.headline} - Vistrow Voice`} description={solution.subhead} path={solution.to} jsonLd={faqJsonLd} />
      {/* An industry with a published roleplay agent puts the live call in
          the hero, beside the headline — it is the strongest thing on the
          page, so burying it below three sections wasted it. Industries
          without one pass no children and PageHero falls back to its
          single centered column. */}
      <PageHero
        eyebrow={`Solutions · ${solution.label}`}
        title={solution.headline}
        subhead={solution.subhead}
      >
        {solution.demoSlug ? (
          <div className="flex flex-col gap-3">
            <DemoOrbCard
              demoSlug={solution.demoSlug}
              badgeLabel={solution.demoBadge}
              accentHue={solution.demoAccentHue}
            />
            <p className="mx-auto max-w-[420px] text-center text-xs text-text-muted lg:mx-0 lg:ml-auto">
              You’ll be talking to <span className="font-semibold text-text">{solution.demoBusiness}</span> — a
              demo business we made up, answered live by Artha. {solution.demoPrompt}
            </p>
          </div>
        ) : undefined}
      </PageHero>

      {/* Pain → outcome */}
      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="mb-10 text-center">
          <SectionEyebrow>Why teams switch</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">From missed calls to booked outcomes.</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {solution.pains.map((p) => (
            <div key={p.title} className="rounded-2xl border border-border bg-surface p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-high text-cyan">
                <Icon name={p.icon} className="text-[22px]" />
              </span>
              <h3 className="mt-5 font-display text-lg font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Sample transcript + feature list. The transcript column is gone on
          industries whose demo moved into the hero, so this drops to a
          single centered column there rather than leaving a blank half. */}
      <section
        className={`mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-5 py-12 md:px-8 ${
          solution.demoSlug ? 'max-w-3xl' : 'lg:grid-cols-2'
        }`}
      >
        {/* A real call beats a mock-up of one: where an industry has a
            published roleplay agent, the visitor phones the demo business
            and hears exactly what their own customer would. Industries
            without one keep the scripted sample until their agent exists -
            an unknown slug would 404 from /token. */}
        {solution.demoSlug ? null : (
          <div className="rounded-2xl border border-border bg-surface p-6">
            <div className="mb-4 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan" />
              </span>
              <span className="text-xs font-semibold text-text-muted">Sample call · Artha</span>
            </div>
            <div className="flex flex-col gap-3 text-sm">
              <div className="max-w-[85%] self-start rounded-2xl rounded-tl-sm bg-surface-high px-4 py-2.5 text-text">
                Namaste! You’ve reached {solution.label}. How can I help you today?
              </div>
              <div className="max-w-[85%] self-end rounded-2xl rounded-tr-sm bg-primary/15 px-4 py-2.5 text-text">
                Hi, I wanted to know more about your services.
              </div>
              <div className="max-w-[85%] self-start rounded-2xl rounded-tl-sm bg-surface-high px-4 py-2.5 text-text">
                Of course - may I take your name and number so our team can follow up with the right details?
              </div>
            </div>
          </div>
        )}
        <div>
          <SectionEyebrow>What’s included</SectionEyebrow>
          <h3 className="mt-3 font-display text-2xl font-semibold">Everything Artha handles for {solution.label}.</h3>
          <ul className="mt-6 flex flex-col gap-3">
            {solution.features.map((feat) => (
              <li key={feat} className="flex items-center gap-3 text-text">
                <Icon name="check_circle" className="text-[20px] text-cyan" />
                {feat}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-5 py-12 md:px-8">
        <div className="mb-10 text-center">
          <SectionEyebrow>FAQ</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Questions, answered.</h2>
        </div>
        <div className="flex flex-col gap-3">
          {solution.faqs.map((item, i) => (
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

      <CTABand title={`Ready to try Artha for ${solution.label}?`} />
    </MarketingLayout>
  )
}
