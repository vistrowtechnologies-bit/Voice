import { useParams, Navigate } from 'react-router-dom'
import { FaqSection } from '../../components/FaqSection'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { CTABand } from '../../components/MarketingBits'
import { PRODUCT_DETAIL, WORKS_WITH } from '../../lib/marketingContent'
import {
  DashboardTour,
  FeatureBento,
  GuideBlock,
  MobileStickyCta,
  Objections,
  ProofStrip,
  ShowcaseHero,
  StepTimeline,
  TrustBand,
  WorksWithRow,
  useStickyRefs,
  withoutVendorNames,
} from '../../components/ProductShowcase'

// One template renders all six product pages, keyed by the :slug route param.
// Page order is built for conversion: split hero with the real dashboard,
// proof tiles, features bento, a violet trust band with the CTA, how it works
// as a timeline, the remaining guide sections beside product visuals, a
// dashboard tour, objections with the CTA again, then FAQ and the CTA band.
export function ProductDetail() {
  const { slug } = useParams()
  const { heroCtaRef, endRef } = useStickyRefs()
  const route = `/product/${slug}`
  const page = PRODUCT_DETAIL[route]
  if (!page) return <Navigate to="/product" replace />

  const faqs = page.faqs.map((item) => ({ q: item.q, a: withoutVendorNames(item.a) }))
  // Answer-engine-friendly (AEO/GEO): FAQPage structured data lets Google,
  // Bing, and LLM-based answer engines quote these Q&As directly instead of
  // having to scrape the accordion markup.
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }

  const [howItWorks, ...guides] = page.guideSections

  return (
    <MarketingLayout>
      <Seo title={`${page.headline} - Vistrow Voice`} description={page.subhead} path={route} jsonLd={faqJsonLd} />
      <ShowcaseHero route={route} eyebrow={page.eyebrow} title={page.headline} subhead={page.subhead} ctaRef={heroCtaRef} />
      <ProofStrip route={route} />
      <FeatureBento route={route} features={page.features} />
      <TrustBand />
      {howItWorks && <StepTimeline route={route} section={howItWorks} />}
      {guides.map((section, i) => (
        <GuideBlock key={section.title} route={route} section={section} flip={i % 2 === 1} />
      ))}
      <DashboardTour route={route} />
      <Objections route={route} />
      <WorksWithRow tools={WORKS_WITH} />

      {/* FAQ */}
      <FaqSection key={route} items={faqs} />

      <div ref={endRef} />
      <CTABand />
      <MobileStickyCta heroCtaRef={heroCtaRef} endRef={endRef} />
    </MarketingLayout>
  )
}
