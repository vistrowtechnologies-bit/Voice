import { Link, useParams } from 'react-router-dom'
import { FaqSection } from '../../components/FaqSection'
import { Icon } from '../../components/Icon'
import { MarketingLayout } from '../../components/MarketingLayout'
import { CTABand, SectionEyebrow, TalkToArthaButton } from '../../components/MarketingBits'
import { Seo } from '../../components/Seo'
import { BUYER_GUIDES } from '../../lib/seoExpansionContent'
import { NotFound } from './NotFound'

const faqJsonLd = (items: { q: string; a: string }[]) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: items.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
})

export function BuyerGuide() {
  const { slug } = useParams()
  const guide = BUYER_GUIDES.find((item) => item.slug === slug)
  if (!guide) return <NotFound />

  return (
    <MarketingLayout>
      <Seo title={guide.title} description={guide.description} path={`/${guide.slug}`} jsonLd={faqJsonLd(guide.faqs)} />

      <section className="mx-auto max-w-4xl px-5 py-16 text-center md:px-8 lg:py-20">
        <SectionEyebrow>{guide.eyebrow}</SectionEyebrow>
        <h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
          {guide.headline}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-text-muted">{guide.subhead}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <TalkToArthaButton />
          <Link to="/pricing" className="rounded-full border border-border px-6 py-3 text-sm font-bold text-text transition-colors hover:border-primary">
            See pricing
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-14 md:px-8">
        <div className="grid gap-5 md:grid-cols-2">
          {guide.sections.map((section, index) => (
            <article key={section.title} className="rounded-3xl border border-border bg-surface p-7">
              <div className="flex items-center justify-between gap-4">
                <Icon name={index % 2 ? 'speed' : 'fact_check'} className="text-[28px] text-primary" />
                <span className="font-display text-3xl font-bold text-border">0{index + 1}</span>
              </div>
              <h2 className="mt-5 font-display text-2xl font-bold tracking-tight">{section.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-text-muted">{section.body}</p>
              <ul className="mt-5 space-y-2">
                {section.bullets.map((bullet) => (
                  <li key={bullet} className="flex gap-2 text-sm text-text-muted">
                    <Icon name="check_circle" className="mt-0.5 shrink-0 text-[17px] text-cyan" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-14 md:px-8">
        <div className="rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/[0.12] via-surface to-surface-high p-8 sm:p-10">
          <SectionEyebrow>Decision rule</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Buy the workflow, not just the model.</h2>
          <p className="mt-4 max-w-3xl text-text-muted">
            A production voice agent needs transport, listening, thinking, speaking, interruption recovery, recordings, transcripts, compliance controls, analytics, and CRM delivery. If one piece is slow or missing, the caller feels it.
          </p>
        </div>
      </section>

      <FaqSection items={guide.faqs} />
      <CTABand />
    </MarketingLayout>
  )
}
