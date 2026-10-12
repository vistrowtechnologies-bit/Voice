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

      {guide.approaches && (
        <section className="mx-auto max-w-7xl px-5 pb-14 md:px-8">
          <div className="mb-8 max-w-2xl">
            <SectionEyebrow>Know the categories</SectionEyebrow>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Five kinds of tool answer &ldquo;AI calling&rdquo; differently.</h2>
            <p className="mt-3 text-text-muted">Products from different categories are often shortlisted together. Knowing what each is built for avoids comparing a phone network with a finished agent.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {guide.approaches.map((item) => (
              <div key={item.title} className="rounded-2xl border border-border bg-surface p-6">
                <h3 className="font-display text-lg font-semibold">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-text-muted"><span className="font-semibold text-text">Fits when: </span>{item.fits}</p>
                <p className="mt-2 text-sm leading-relaxed text-text-muted"><span className="font-semibold text-text">Trade-off: </span>{item.tradeoff}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {guide.checklist && (
        <section className="mx-auto max-w-7xl px-5 pb-14 md:px-8">
          <div className="mb-8 max-w-2xl">
            <SectionEyebrow>Selection checklist</SectionEyebrow>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Score every option on the same ten points.</h2>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="bg-surface-high">
                  <th scope="col" className="px-5 py-4 font-display text-sm font-semibold">Criterion</th>
                  <th scope="col" className="px-5 py-4 font-display text-sm font-semibold text-text-muted">What good looks like</th>
                  <th scope="col" className="px-5 py-4 font-display text-sm font-semibold text-primary">How to test it</th>
                </tr>
              </thead>
              <tbody>
                {guide.checklist.map((row) => (
                  <tr key={row.criterion} className="border-t border-border bg-surface">
                    <th scope="row" className="px-5 py-4 font-semibold text-text">{row.criterion}</th>
                    <td className="px-5 py-4 text-text-muted">{row.good}</td>
                    <td className="px-5 py-4 text-text">{row.test}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-text-muted">
            This is a selection guide, not a ranking. Verify each vendor&rsquo;s current features directly before you decide.
          </p>
        </section>
      )}

      {guide.trial && (
        <section className="mx-auto max-w-7xl px-5 pb-14 md:px-8">
          <div className="rounded-3xl border border-border bg-surface p-8 sm:p-10">
            <SectionEyebrow>Run a fair trial</SectionEyebrow>
            <h2 className="mt-3 font-display text-2xl font-bold tracking-tight">From shortlist to pilot in five steps.</h2>
            <ol className="mt-6 space-y-3">
              {guide.trial.map((step, i) => (
                <li key={step} className="flex gap-3 text-sm leading-relaxed text-text-muted">
                  <span className="font-display text-base font-bold text-primary">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      <FaqSection items={guide.faqs} />
      {guide.related && (
        <section className="mx-auto max-w-7xl px-5 pb-8 md:px-8">
          <div className="rounded-2xl border border-border bg-surface/50 px-6 py-7">
            <p className="text-center text-xs font-bold uppercase tracking-widest text-text-muted">Keep exploring</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {guide.related.map((r) => (
                <Link
                  key={r.to}
                  to={r.to}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-4 py-1.5 text-sm text-text-muted transition-colors hover:border-primary hover:text-text"
                >
                  {r.label}
                  <Icon name="arrow_forward" className="text-[14px]" />
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <CTABand />
    </MarketingLayout>
  )
}
