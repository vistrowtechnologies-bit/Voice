import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { CTABand, PageHero, SectionEyebrow } from '../../components/MarketingBits'
import { LANGUAGES, SOLUTIONS } from '../../lib/marketingContent'

// One template renders all ten language pages, keyed by :slug — same
// approach as ProductDetail/SolutionDetail. These exist for long-tail
// search ("AI voice agent in Tamil"), which is why each one carries its
// own FAQPage JSON-LD rather than sharing the overview's.
export function LanguageDetail() {
  const { slug } = useParams()
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const lang = LANGUAGES.find((l) => l.slug === slug)
  if (!lang) return <Navigate to="/languages" replace />

  const faqs = [
    {
      q: `Can the AI agent handle a full call in ${lang.name}?`,
      a: `Yes — Artha answers, qualifies, and books entirely in ${lang.name}, including numbers, dates, and Indian names. It isn't a translation layer bolted onto an English agent.`,
    },
    {
      q: `What if the caller mixes ${lang.name} and English?`,
      a: `That's the normal case, and Artha follows it. It switches mid-call to match whichever language the caller lands on, rather than forcing them to stay in one.`,
    },
    {
      q: `Can I use ${lang.name} for outbound campaigns too?`,
      a: `Yes — reminder, follow-up, and collection campaigns all run in ${lang.name}, personalised per contact, with every call recorded and logged.`,
    },
    {
      q: `Do I need a separate agent for each language?`,
      a: `No. One agent handles the switch on its own. Many teams still build separate agents per region when the script itself differs, not because the language forces it.`,
    },
  ]

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }

  return (
    <MarketingLayout>
      <Seo
        title={`AI Voice Agent in ${lang.name} — Vistrow Voice`}
        description={`Answer, qualify, and book customer calls in ${lang.name}, 24/7. ${lang.blurb}`}
        path={`/languages/${lang.slug}`}
        jsonLd={faqJsonLd}
      />

      {/* Live demo widget is homepage-only now — see PageHero's heroless-of-
          children branch for how this renders without it. */}
      <PageHero
        eyebrow={`Languages · ${lang.name}`}
        title={`AI voice agents that speak ${lang.name}.`}
        subhead={lang.blurb}
      />

      <section className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <div className="grid gap-5 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-surface p-7 text-center">
            <p className="font-display text-4xl font-bold text-primary">{lang.native}</p>
            <p className="mt-3 text-sm text-text-muted">Native script, natively spoken</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-7 text-center">
            <p className="font-display text-2xl font-bold">{lang.region}</p>
            <p className="mt-3 text-sm text-text-muted">Where your callers are</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-7 text-center">
            <p className="font-display text-2xl font-bold">24/7</p>
            <p className="mt-3 text-sm text-text-muted">No shift, no hold music, no voicemail</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="mb-10 text-center">
          <SectionEyebrow>Where teams use it</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">
            {lang.name} calls, handled end to end.
          </h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SOLUTIONS.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className="group rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-primary"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-high text-cyan">
                <Icon name={s.icon ?? 'circle'} className="text-[22px]" />
              </span>
              <h3 className="mt-5 flex items-center gap-1 font-display text-lg font-semibold">
                {s.label}
                <Icon
                  name="arrow_forward"
                  className="text-[16px] text-text-muted transition-transform group-hover:translate-x-1 group-hover:text-primary"
                />
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{s.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-12 md:px-8">
        <div className="mb-10 text-center">
          <SectionEyebrow>FAQ</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Questions, answered.</h2>
        </div>
        <div className="flex flex-col gap-3">
          {faqs.map((item, i) => (
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
              {openFaq === i && (
                <p className="px-6 pb-5 text-sm leading-relaxed text-text-muted">{item.a}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-8 md:px-8">
        <div className="rounded-2xl border border-border bg-surface/50 px-6 py-7">
          <p className="text-center text-xs font-bold uppercase tracking-widest text-text-muted">
            Also available in
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {LANGUAGES.filter((l) => l.slug !== lang.slug).map((l) => (
              <Link
                key={l.slug}
                to={`/languages/${l.slug}`}
                className="rounded-full border border-border px-4 py-1.5 text-sm text-text-muted transition-colors hover:border-primary hover:text-text"
              >
                {l.name}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CTABand />
    </MarketingLayout>
  )
}
