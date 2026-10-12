import { useParams, Navigate, Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { FaqSection } from '../../components/FaqSection'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { PageHero, CTABand, SectionEyebrow } from '../../components/MarketingBits'
import { PRODUCT_DETAIL, WORKS_WITH } from '../../lib/marketingContent'

// One template renders all six product pages, keyed by the :slug route param.
export function ProductDetail() {
  const { slug } = useParams()
  const route = `/product/${slug}`
  const page = PRODUCT_DETAIL[route]
  if (!page) return <Navigate to="/product" replace />

  // Answer-engine-friendly (AEO/GEO): FAQPage structured data lets Google,
  // Bing, and LLM-based answer engines quote these Q&As directly instead of
  // having to scrape the accordion markup.
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: page.faqs.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }

  return (
    <MarketingLayout>
      <Seo title={`${page.headline} - Vistrow Voice`} description={page.subhead} path={route} jsonLd={faqJsonLd} />
      {/* Live demo widget is homepage-only now - see PageHero's heroless-of-
          children branch for how this renders without it. */}
      <PageHero eyebrow={page.eyebrow} title={page.headline} subhead={page.subhead} />

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="grid gap-5 sm:grid-cols-2">
          {page.features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-surface p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
                <Icon name={f.icon} className="text-[22px]" />
              </span>
              <h3 className="mt-5 font-display text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {page.guideSections.map((section) => (
        <section key={section.title} className="mx-auto max-w-7xl px-5 py-12 md:px-8">
          <div className="mb-8 max-w-2xl">
            <SectionEyebrow>{section.eyebrow}</SectionEyebrow>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">{section.title}</h2>
            {section.intro && <p className="mt-3 text-text-muted">{section.intro}</p>}
          </div>
          <div className={`grid gap-5 sm:grid-cols-2 ${section.items.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
            {section.items.map((item) => (
              <div key={item.title} className="flex flex-col rounded-2xl border border-border bg-surface p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon name={item.icon} className="text-[22px]" />
                </span>
                <h3 className="mt-5 font-display text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">{item.body}</p>
                {item.to && item.link && (
                  <Link
                    to={item.to}
                    className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold text-primary underline-offset-4 hover:underline"
                  >
                    {item.link}
                    <Icon name="arrow_forward" className="text-[16px]" />
                  </Link>
                )}
              </div>
            ))}
          </div>
          {section.note && (
            <p className="mt-5 flex gap-3 rounded-2xl border border-cyan/30 bg-cyan/[0.06] p-5 text-sm leading-relaxed text-text">
              <Icon name="info" className="mt-0.5 shrink-0 text-[18px] text-cyan" />
              <span>{section.note}</span>
            </p>
          )}
        </section>
      ))}

      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="rounded-2xl border border-border bg-surface/50 px-6 py-8 text-center">
          <SectionEyebrow>Works with</SectionEyebrow>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {WORKS_WITH.map((tool) => (
              <span key={tool} className="font-display text-xl font-semibold text-text-muted">
                {tool}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <FaqSection key={route} items={page.faqs} />

      <CTABand />
    </MarketingLayout>
  )
}
