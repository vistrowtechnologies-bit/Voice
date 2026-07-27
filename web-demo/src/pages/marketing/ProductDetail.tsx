import { useState } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { MarketingLayout } from '../../components/MarketingLayout'
import { DemoOrbCard } from '../../components/DemoOrbCard'
import { Seo } from '../../components/Seo'
import { PageHero, CTABand, SectionEyebrow } from '../../components/MarketingBits'
import { PRODUCT_DETAIL, WORKS_WITH } from '../../lib/marketingContent'

// One template renders all six product pages, keyed by the :slug route param.
export function ProductDetail() {
  const { slug } = useParams()
  const [openFaq, setOpenFaq] = useState<number | null>(0)
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
      <Seo title={`${page.headline} — Vistrow Voice`} description={page.subhead} path={route} jsonLd={faqJsonLd} />
      <PageHero eyebrow={page.eyebrow} title={page.headline} subhead={page.subhead}>
        <DemoOrbCard />
      </PageHero>

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
      <section className="mx-auto max-w-3xl px-5 py-12 md:px-8">
        <div className="mb-10 text-center">
          <SectionEyebrow>FAQ</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Questions, answered.</h2>
        </div>
        <div className="flex flex-col gap-3">
          {page.faqs.map((item, i) => (
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
