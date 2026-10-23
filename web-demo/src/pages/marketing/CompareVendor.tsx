import { Link, useParams } from 'react-router-dom'
import { FaqSection } from '../../components/FaqSection'
import { Icon } from '../../components/Icon'
import { Icon3D } from '../../components/Icon3D'
import { MarketingLayout } from '../../components/MarketingLayout'
import { CTABand, SectionEyebrow, TalkToArthaButton } from '../../components/MarketingBits'
import { Seo } from '../../components/Seo'
import { COMPARE_VENDORS } from '../../lib/seoExpansionContent'
import {
  BOOK_DEMO_CLASS,
  FeatureCards,
  FeatureList,
  IconTile,
  ObjectionCards,
  Reveal,
  SectionHead,
  SplitHero,
  SplitRow,
  StickyCta,
  TALK_CLASS,
  TrustBand,
  useStickyRefs,
  type FeatureItem,
} from '../../components/showcase'
import { RelatedPills, StepRail, TableCard } from './premium-w3/kit'
import { W3_CALL_SUMMARY, W3_LAPTOP_CALL_DETAIL, W3_SCORECARD } from './premium-w3/visuals'
import { NotFound } from './NotFound'

const GLANCE: { icon: string; title: string; body: string; to: string; link: string }[] = [
  { icon: 'translate', title: 'Languages', body: 'More than 130 languages, including 10 Indian languages and Hinglish, switching with the caller mid-call.', to: '/languages', link: 'See the languages' },
  { icon: 'call', title: 'Phone and website', body: 'Inbound phone calls through a connected number, plus a call widget that talks to website visitors in the browser.', to: '/product/widget', link: 'The website widget' },
  { icon: 'menu_book', title: 'Approved answers', body: 'A knowledge base with strict mode, so the agent quotes your material instead of improvising.', to: '/product/knowledge-base', link: 'The knowledge base' },
  { icon: 'receipt_long', title: 'A finished record', body: 'Transcript, summary, captured lead fields, optional recording and CRM or webhook delivery status for every call.', to: '/product/integrations', link: 'Integrations' },
]

const TESTS = ['First response latency', 'Interruption handling', 'Indian names and numbers', 'CRM payload quality']
const TEST_ICONS = ['speed', 'record_voice_over', 'translate', 'hub']
const SCENARIO_ICONS = ['call', 'hub', 'support_agent']

const faqJsonLd = (items: { q: string; a: string }[]) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: items.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
})

// One template renders every /compare/<vendor> page. Naming the compared
// vendor is the point of these pages; the scorecard image stays neutral.
// Layout follows the showcase kit: split hero with the real call record,
// the three "fits" as a bento, the decision table, scenarios, what Vistrow
// covers beside the call summary, the violet trust band, the testing
// checklist beside the scorecard, side-by-side steps, objections, FAQ.
export function CompareVendor() {
  const { slug } = useParams()
  const { heroCtaRef, endRef } = useStickyRefs()
  const vendor = COMPARE_VENDORS.find((item) => item.slug === slug)
  if (!vendor) return <NotFound />

  const route = `/compare/${vendor.slug}`
  const glance: FeatureItem[] = GLANCE.map((g) => ({ icon: g.icon, title: g.title, body: g.body, to: g.to, link: g.link }))

  return (
    <MarketingLayout>
      <Seo title={vendor.title} description={vendor.description} path={route} jsonLd={faqJsonLd(vendor.faqs)} />

      <SplitHero
        eyebrow="Comparison"
        title={`Vistrow Voice vs ${vendor.name}`}
        subhead={`A practical comparison for teams evaluating ${vendor.category} and AI voice agents for real customer calls.`}
        visual={W3_LAPTOP_CALL_DETAIL}
        chips={[
          { label: 'Call answered by Artha', live: true },
          { label: 'Transcript and summary saved', icon: 'receipt_long' },
        ]}
        placement="compare_hero"
        ctaRef={heroCtaRef}
        actions={
          <>
            <TalkToArthaButton className={TALK_CLASS} />
            <Link to="/contact" className={BOOK_DEMO_CLASS}>
              Talk to sales
            </Link>
          </>
        }
      />

      {/* The three verdicts as a bento: two plain cards and the violet tile. */}
      <section className="mx-auto max-w-7xl px-5 py-10 md:px-8 lg:py-12">
        <div className="grid gap-4 lg:grid-cols-3">
          <Reveal className="h-full">
            <div className="vv-lift flex h-full flex-col rounded-3xl border border-border bg-surface p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan/12 text-cyan">
                <Icon name="check_circle" className="text-[22px]" />
              </span>
              <h2 className="mt-5 font-display text-xl font-semibold">When {vendor.name} fits</h2>
              <p className="mt-3 text-sm leading-relaxed text-text-muted">{vendor.bestFor}</p>
            </div>
          </Reveal>
          <Reveal delayMs={70} className="h-full">
            <div className="vv-lift flex h-full flex-col rounded-3xl border border-border bg-surface p-7">
              <IconTile name="swap_horiz" />
              <h2 className="mt-5 font-display text-xl font-semibold">The tradeoff</h2>
              <p className="mt-3 text-sm leading-relaxed text-text-muted">{vendor.tradeoff}</p>
            </div>
          </Reveal>
          <Reveal delayMs={140} className="h-full">
            <div className="bento-hero flex h-full flex-col rounded-3xl p-7 shadow-[0_24px_50px_-30px_rgba(76,29,149,0.9)]">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-white">
                <Icon3D name="bolt" size={32} plate className="text-[22px]" />
              </span>
              <h2 className="mt-5 font-display text-xl font-semibold text-white">When Vistrow fits</h2>
              <p className="mt-3 text-sm leading-relaxed text-white/85">{vendor.buyerIntent}</p>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-10 md:px-8 lg:py-12">
        <Reveal className="mb-8">
          <SectionHead eyebrow="Side by side" title={`${vendor.category[0].toUpperCase()}${vendor.category.slice(1)} and Vistrow Voice, point by point.`} />
        </Reveal>
        <TableCard
          note={
            <>
              The left column describes the {vendor.category} category in general terms, not {vendor.name}&rsquo;s current product. Vendor products change, so this page is a buyer checklist, not a spec sheet. Verify current features directly with each vendor before you decide.
            </>
          }
        >
          <thead>
            <tr className="bg-surface-high">
              <th className="px-5 py-4 font-display text-sm font-semibold">Decision point</th>
              <th className="px-5 py-4 font-display text-sm font-semibold text-text-muted">Typical {vendor.category} approach</th>
              <th className="bg-primary/[0.08] px-5 py-4 font-display text-sm font-semibold text-primary">Vistrow Voice</th>
            </tr>
          </thead>
          <tbody>
            {vendor.rows.map((row) => (
              <tr key={row.dimension} className="border-t border-border">
                <td className="px-5 py-4 align-top font-semibold text-text">{row.dimension}</td>
                <td className="px-5 py-4 align-top text-text-muted">{row.vendor}</td>
                <td className="bg-primary/[0.04] px-5 py-4 align-top text-text">
                  <span className="flex items-start gap-2">
                    <Icon name="check_circle" className="mt-0.5 shrink-0 text-[16px] text-cyan" />
                    {row.vistrow}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      </section>

      {vendor.scenarios && (
        <section className="mx-auto max-w-7xl px-5 py-12 md:px-8 lg:py-14">
          <Reveal className="mb-10">
            <SectionHead eyebrow="Which approach fits" title="Match the tool to the job, not the brand." />
          </Reveal>
          <FeatureCards items={vendor.scenarios.map((s, i) => ({ icon: SCENARIO_ICONS[i % SCENARIO_ICONS.length], title: s.title, body: s.body }))} />
        </section>
      )}

      <section className="mx-auto max-w-7xl px-5 md:px-8">
        <SplitRow figure={W3_CALL_SUMMARY}>
          <Reveal>
            <SectionHead eyebrow="What Vistrow Voice covers" title="The parts of a call it handles for you." />
          </Reveal>
          <FeatureList items={glance} twoCol />
        </SplitRow>
      </section>

      <TrustBand placement="compare_trust_band" />

      {vendor.ask && (
        <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-16">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-start">
            <Reveal>
              <SectionEyebrow>Questions for any vendor</SectionEyebrow>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance">Ask these before you shortlist, including us.</h2>
            </Reveal>
            <ul className="grid gap-3">
              {vendor.ask.map((item, i) => (
                <li key={item}>
                  <Reveal delayMs={i * 60} className="flex gap-4 rounded-2xl border border-border bg-surface p-5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                      <Icon3D name="help" size={30} className="text-[20px]" />
                    </span>
                    <span className="self-center text-sm leading-relaxed text-text">{item}</span>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-5 md:px-8">
        <SplitRow figure={W3_SCORECARD} flip>
          <Reveal>
            <SectionHead eyebrow="Testing checklist" title="Run the same real-call test before choosing." />
          </Reveal>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {TESTS.map((item, i) => (
              <Reveal key={item} delayMs={i * 60} className="h-full">
                <div className="flex h-full items-center gap-3 rounded-2xl border border-border bg-surface p-5">
                  <IconTile name={TEST_ICONS[i]} size="sm" strong={i === 0} />
                  <p className="font-semibold">{item}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </SplitRow>
      </section>

      {vendor.steps && (
        <StepRail
          eyebrow="Side-by-side testing"
          title="Try it next to what you use today."
          intro="Moving to an AI voice agent does not need a cut-over. Run it alongside your current setup on one narrow slice of calls, and keep the old path as fallback until the transcripts convince you."
          steps={vendor.steps.map((step) => ({ body: step, icon: 'task_alt' }))}
        />
      )}

      <ObjectionCards route={route} placement="compare_objections" />

      <FaqSection items={vendor.faqs} />
      {vendor.related && <RelatedPills label={`Related to ${vendor.name} comparisons`} items={vendor.related} />}

      <div ref={endRef} />
      <CTABand title={`Compare ${vendor.name} with a live Vistrow call.`} subtitle="Test the voice, latency, transcript, and CRM-ready outcome before you decide." />
      <StickyCta heroCtaRef={heroCtaRef} endRef={endRef} />
    </MarketingLayout>
  )
}
