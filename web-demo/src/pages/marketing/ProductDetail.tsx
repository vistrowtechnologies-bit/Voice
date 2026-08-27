import { useParams, Navigate } from 'react-router-dom'
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
