import { Link, useParams } from 'react-router-dom'
import { FaqSection } from '../../components/FaqSection'
import { Icon } from '../../components/Icon'
import { MarketingLayout } from '../../components/MarketingLayout'
import { CTABand, SectionEyebrow, TalkToArthaButton } from '../../components/MarketingBits'
import { Seo } from '../../components/Seo'
import { COMPARE_VENDORS } from '../../lib/seoExpansionContent'
import { NotFound } from './NotFound'

const GLANCE: { icon: string; title: string; body: string; to: string }[] = [
  { icon: 'translate', title: 'Languages', body: 'Ten Indian languages plus English, including Hinglish, switching with the caller mid-call.', to: '/languages' },
  { icon: 'call', title: 'Phone and website', body: 'Inbound phone calls through a connected number, plus a call widget that talks to website visitors in the browser.', to: '/product/widget' },
  { icon: 'menu_book', title: 'Approved answers', body: 'A knowledge base with strict mode, so the agent quotes your material instead of improvising.', to: '/product/knowledge-base' },
  { icon: 'receipt_long', title: 'A finished record', body: 'Transcript, summary, captured lead fields, optional recording and CRM or webhook delivery status for every call.', to: '/product/integrations' },
]

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
                <th className="px-5 py-4 font-display text-sm font-semibold text-text-muted">Typical {vendor.category} approach</th>
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
          The left column describes the {vendor.category} category in general terms, not {vendor.name}&rsquo;s current product. Vendor products change, so this page is a buyer checklist, not a spec sheet. Verify current features directly with each vendor before you decide.
        </p>
      </section>

      {vendor.scenarios && (
        <section className="mx-auto max-w-7xl px-5 pb-14 md:px-8">
          <div className="mb-8 max-w-2xl">
            <SectionEyebrow>Which approach fits</SectionEyebrow>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Match the tool to the job, not the brand.</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {vendor.scenarios.map((item) => (
              <div key={item.title} className="rounded-2xl border border-border bg-surface p-6">
                <h3 className="font-display text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">{item.body}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-5 pb-14 md:px-8">
        <div className="mb-8 max-w-2xl">
          <SectionEyebrow>What Vistrow Voice covers</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">The parts of a call it handles for you.</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {GLANCE.map((item) => (
            <Link key={item.title} to={item.to} className="rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-primary">
              <Icon name={item.icon} className="text-[24px] text-primary" />
              <h3 className="mt-4 font-display text-base font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{item.body}</p>
            </Link>
          ))}
        </div>
      </section>

      {vendor.ask && (
        <section className="mx-auto max-w-7xl px-5 pb-14 md:px-8">
          <div className="rounded-3xl border border-border bg-surface p-8 sm:p-10">
            <SectionEyebrow>Questions for any vendor</SectionEyebrow>
            <h2 className="mt-3 font-display text-2xl font-bold tracking-tight">Ask these before you shortlist, including us.</h2>
            <ul className="mt-6 space-y-3">
              {vendor.ask.map((item) => (
                <li key={item} className="flex gap-3 text-sm leading-relaxed text-text-muted">
                  <Icon name="help" className="mt-0.5 shrink-0 text-[18px] text-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

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

      {vendor.steps && (
        <section className="mx-auto max-w-7xl px-5 pb-14 md:px-8">
          <div className="rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/[0.10] via-surface to-surface-high p-8 sm:p-10">
            <SectionEyebrow>Side-by-side testing</SectionEyebrow>
            <h2 className="mt-3 font-display text-2xl font-bold tracking-tight">Try it next to what you use today.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-muted">
              Moving to an AI voice agent does not need a cut-over. Run it alongside your current setup on one narrow slice of calls, and keep the old path as fallback until the transcripts convince you.
            </p>
            <ol className="mt-6 space-y-3">
              {vendor.steps.map((step, i) => (
                <li key={step} className="flex gap-3 text-sm leading-relaxed text-text-muted">
                  <span className="font-display text-base font-bold text-primary">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      <FaqSection items={vendor.faqs} />
      {vendor.related && (
        <section className="mx-auto max-w-7xl px-5 pb-8 md:px-8">
          <div className="rounded-2xl border border-border bg-surface/50 px-6 py-7">
            <p className="text-center text-xs font-bold uppercase tracking-widest text-text-muted">{`Related to ${vendor.name} comparisons`}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {vendor.related.map((r) => (
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

      <CTABand title={`Compare ${vendor.name} with a live Vistrow call.`} subtitle="Test the voice, latency, transcript, and CRM-ready outcome before you decide." />
    </MarketingLayout>
  )
}
