import { Link, useParams } from 'react-router-dom'
import { FaqSection } from '../../components/FaqSection'
import { Icon } from '../../components/Icon'
import { MarketingLayout } from '../../components/MarketingLayout'
import { CTABand, SectionEyebrow, TalkToArthaButton } from '../../components/MarketingBits'
import { Seo } from '../../components/Seo'
import { COMPARE_VENDORS } from '../../lib/seoExpansionContent'
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

export function CompareVendor() {
  const { slug } = useParams()
  const vendor = COMPARE_VENDORS.find((item) => item.slug === slug)
  if (!vendor) return <NotFound />

  return (
    <MarketingLayout>
      <Seo title={vendor.title} description={vendor.description} path={`/compare/${vendor.slug}`} jsonLd={faqJsonLd(vendor.faqs)} />

      <section className="mx-auto max-w-4xl px-5 py-16 text-center md:px-8 lg:py-20">
        <SectionEyebrow>Comparison</SectionEyebrow>
        <h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
          Vistrow Voice vs {vendor.name}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-text-muted">
          A practical comparison for teams evaluating {vendor.category} and AI voice agents for real customer calls.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <TalkToArthaButton />
          <Link to="/contact" className="rounded-full border border-border px-6 py-3 text-sm font-bold text-text transition-colors hover:border-primary">
            Talk to sales
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-12 md:px-8">
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="rounded-3xl border border-border bg-surface p-7">
            <Icon name="check_circle" className="text-[28px] text-cyan" />
            <h2 className="mt-4 font-display text-xl font-semibold">When {vendor.name} fits</h2>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">{vendor.bestFor}</p>
          </div>
          <div className="rounded-3xl border border-border bg-surface p-7">
            <Icon name="swap_horiz" className="text-[28px] text-primary" />
            <h2 className="mt-4 font-display text-xl font-semibold">The tradeoff</h2>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">{vendor.tradeoff}</p>
          </div>
          <div className="rounded-3xl border border-primary/30 bg-primary/[0.07] p-7">
            <Icon name="bolt" className="text-[28px] text-primary" />
            <h2 className="mt-4 font-display text-xl font-semibold">When Vistrow fits</h2>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">{vendor.buyerIntent}</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-14 md:px-8">
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-surface-high">
                <th className="px-5 py-4 font-display text-sm font-semibold">Decision point</th>
                <th className="px-5 py-4 font-display text-sm font-semibold text-text-muted">{vendor.name}</th>
                <th className="px-5 py-4 font-display text-sm font-semibold text-primary">Vistrow Voice</th>
              </tr>
            </thead>
            <tbody>
              {vendor.rows.map((row) => (
                <tr key={row.dimension} className="border-t border-border bg-surface">
                  <td className="px-5 py-4 font-semibold text-text">{row.dimension}</td>
                  <td className="px-5 py-4 text-text-muted">{row.vendor}</td>
                  <td className="px-5 py-4 text-text">{row.vistrow}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-text-muted">
          Vendor products change. This page is a buyer checklist, not a live pricing/spec sheet. Verify current features directly with each vendor before purchase.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-14 md:px-8">
        <div className="rounded-3xl border border-border bg-surface p-8 sm:p-10">
          <SectionEyebrow>Testing checklist</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Run the same real-call test before choosing.</h2>
          <div className="mt-7 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {['First response latency', 'Interruption handling', 'Indian names and numbers', 'CRM payload quality'].map((item) => (
              <div key={item} className="rounded-2xl border border-border bg-surface-high p-5">
                <Icon name="task_alt" className="text-[22px] text-cyan" />
                <p className="mt-3 font-semibold">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <FaqSection items={vendor.faqs} />
      <CTABand title={`Compare ${vendor.name} with a live Vistrow call.`} subtitle="Test the voice, latency, transcript, and CRM-ready outcome before you decide." />
    </MarketingLayout>
  )
}
