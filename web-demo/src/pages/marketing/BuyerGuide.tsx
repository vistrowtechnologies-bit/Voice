import { Link, useParams } from 'react-router-dom'
import { FaqSection } from '../../components/FaqSection'
import { Icon } from '../../components/Icon'
import { MarketingLayout } from '../../components/MarketingLayout'
import { CTABand, TalkToArthaButton } from '../../components/MarketingBits'
import { Seo } from '../../components/Seo'
import { BUYER_GUIDES, type BuyerGuide as Guide } from '../../lib/seoExpansionContent'
import type { PageFigureData } from '../../lib/pageFigures'
import {
  BOOK_DEMO_CLASS,
  IconTile,
  ObjectionCards,
  Reveal,
  SectionHead,
  SplitHero,
  SplitRow,
  StickyCta,
  TALK_CLASS,
  useStickyRefs,
} from '../../components/showcase'
import { CheckList, StepRail, TableCard, RelatedPills, VioletBand } from './premium-w3/kit'
import { DEFAULT_GUIDE_VISUALS, GUIDE_VISUALS } from './premium-w3/visuals'
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

type Section = Guide['sections'][number]
type Block = { kind: 'row'; section: Section; index: number; figure: PageFigureData } | { kind: 'cards'; items: { section: Section; index: number }[] }

/** Sections with a visual become text + visual rows; runs of sections
 * without one become a card grid, so the guide alternates rows and cards. */
function toBlocks(sections: Section[], visuals: Record<string, PageFigureData>): Block[] {
  const blocks: Block[] = []
  sections.forEach((section, index) => {
    const figure = visuals[section.title]
    if (figure) {
      blocks.push({ kind: 'row', section, index, figure })
      return
    }
    const last = blocks[blocks.length - 1]
    if (last?.kind === 'cards') last.items.push({ section, index })
    else blocks.push({ kind: 'cards', items: [{ section, index }] })
  })
  return blocks
}

const SECTION_ICONS = ['fact_check', 'speed', 'translate', 'receipt_long', 'call', 'tune']
const num = (i: number) => String(i + 1).padStart(2, '0')

// One template renders every buyer guide at /:slug (seoExpansionContent.ts),
// composed from the showcase kit like the product and solutions pages: split
// hero with a product visual, guide sections as alternating text + visual
// rows and card grids, the decision rule as the violet band, tool categories
// as a bento, the scoring table, the trial as a timeline, objections, FAQ.
export function BuyerGuide() {
  const { slug } = useParams()
  const { heroCtaRef, endRef } = useStickyRefs()
  const guide = BUYER_GUIDES.find((item) => item.slug === slug)
  if (!guide) return <NotFound />

  const route = `/${guide.slug}`
  const visuals = GUIDE_VISUALS[guide.slug] ?? DEFAULT_GUIDE_VISUALS
  const blocks = toBlocks(guide.sections, visuals.sections)
  let rowCount = 0

  return (
    <MarketingLayout>
      <Seo title={guide.title} description={guide.description} path={route} jsonLd={faqJsonLd(guide.faqs)} />

      <SplitHero
        eyebrow={guide.eyebrow}
        title={guide.headline}
        subhead={guide.subhead}
        visual={visuals.hero}
        chips={visuals.heroChips}
        placement="guide_hero"
        ctaRef={heroCtaRef}
        actions={
          <>
            <TalkToArthaButton className={TALK_CLASS} />
            <Link to="/pricing" className={BOOK_DEMO_CLASS}>
              See pricing
            </Link>
          </>
        }
      />

      <section className="mx-auto max-w-7xl px-5 pt-6 md:px-8">
        <Reveal>
          <SectionHead
            eyebrow="What to check"
            title="The parts of the decision, one at a time."
          />
        </Reveal>
      </section>

      {blocks.map((block) => {
        if (block.kind === 'row') {
          const { section, index, figure } = block
          const flip = rowCount++ % 2 === 1
          return (
            <section key={section.title} className="mx-auto max-w-7xl px-5 md:px-8">
              <SplitRow figure={figure} flip={flip}>
                <Reveal>
                  <div className="flex items-center gap-3">
                    <IconTile name={SECTION_ICONS[index % SECTION_ICONS.length]} strong={index === 0} />
                    <span className="font-display text-sm font-bold uppercase tracking-widest text-text-muted">{num(index)}</span>
                  </div>
                  <h2 className="mt-5 font-display text-3xl font-bold tracking-tight text-balance">{section.title}</h2>
                  <p className="mt-3 leading-relaxed text-text-muted">{section.body}</p>
                  <CheckList items={section.bullets} className="mt-6 grid gap-2.5 border-t border-border pt-6" />
                </Reveal>
              </SplitRow>
            </section>
          )
        }
        const cols = block.items.length >= 3 ? 'lg:grid-cols-3' : block.items.length === 2 ? 'md:grid-cols-2' : ''
        // A lone section between two rows: text and bullets side by side.
        if (block.items.length === 1) {
          const { section, index } = block.items[0]
          return (
            <section key={section.title} className="mx-auto max-w-7xl px-5 py-8 md:px-8 lg:py-10">
              <Reveal>
                <article className="grid gap-6 rounded-3xl border border-primary/40 bg-gradient-to-br from-primary/[0.12] via-surface to-surface p-7 sm:p-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-12">
                  <div>
                    <div className="flex items-center gap-3">
                      <IconTile name={SECTION_ICONS[index % SECTION_ICONS.length]} strong />
                      <span className="font-display text-sm font-bold uppercase tracking-widest text-text-muted">{num(index)}</span>
                    </div>
                    <h2 className="mt-5 font-display text-3xl font-bold tracking-tight">{section.title}</h2>
                    <p className="mt-3 leading-relaxed text-text-muted">{section.body}</p>
                  </div>
                  <CheckList items={section.bullets} className="grid gap-3 rounded-2xl border border-border bg-surface p-6" />
                </article>
              </Reveal>
            </section>
          )
        }
        return (
          <section key={block.items[0].section.title} className="mx-auto max-w-7xl px-5 py-8 md:px-8 lg:py-10">
            <div className={`grid gap-4 ${cols}`}>
              {block.items.map(({ section, index }, i) => (
                <Reveal key={section.title} delayMs={i * 70} className="h-full">
                  <article
                    className={`vv-lift flex h-full flex-col rounded-3xl border p-7 ${
                      i === 0 ? 'border-primary/40 bg-gradient-to-br from-primary/[0.12] via-surface to-surface' : 'border-border bg-surface'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <IconTile name={SECTION_ICONS[index % SECTION_ICONS.length]} strong={i === 0} />
                      <span className="font-display text-3xl font-bold text-border">{num(index)}</span>
                    </div>
                    <h2 className="mt-5 font-display text-2xl font-bold tracking-tight">{section.title}</h2>
                    <p className="mt-3 text-sm leading-relaxed text-text-muted">{section.body}</p>
                    <CheckList items={section.bullets} />
                  </article>
                </Reveal>
              ))}
            </div>
          </section>
        )
      })}

      <div className="py-8 lg:py-10">
        <VioletBand
          eyebrow="Decision rule"
          title="Judge the whole call workflow."
          body="A production voice agent needs transport, listening, thinking, speaking, interruption recovery, recordings, transcripts, compliance controls, analytics, and CRM delivery. If one piece is slow or missing, the caller feels it."
          placement="guide_decision_band"
          aside={
            <ul className="grid gap-3 sm:grid-cols-2">
              {[
                { icon: 'call', label: 'Transport and listening' },
                { icon: 'psychology', label: 'Thinking and speaking' },
                { icon: 'receipt_long', label: 'Recordings and transcripts' },
                { icon: 'hub', label: 'Analytics and CRM delivery' },
              ].map((item) => (
                <li key={item.label} className="flex items-center gap-3 rounded-2xl border border-white/20 bg-white/10 p-4 text-sm font-semibold text-white backdrop-blur-sm">
                  <Icon name={item.icon} className="text-[22px] text-white" />
                  {item.label}
                </li>
              ))}
            </ul>
          }
        />
      </div>

      {guide.approaches && (
        <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-16">
          <Reveal className="mb-10">
            <SectionHead
              eyebrow="Know the categories"
              title="Five kinds of tool sold as AI calling software."
              intro="Products from different categories are often shortlisted together. Knowing what each is built for avoids comparing a phone network with a finished agent."
            />
          </Reveal>
          <div className="grid gap-4 md:grid-cols-2 md:max-lg:grid-close-2 lg:grid-cols-6">
            {guide.approaches.map((item, i) => (
              <Reveal key={item.title} delayMs={(i % 3) * 70} className={`h-full ${i < 2 ? 'lg:col-span-3' : 'lg:col-span-2'}`}>
                <div className={i === 0 ? 'bento-hero flex h-full flex-col rounded-3xl p-7' : 'vv-lift flex h-full flex-col rounded-3xl border border-border bg-surface p-6'}>
                  <span className={`font-display text-sm font-bold ${i === 0 ? 'text-white/75' : 'text-primary'}`}>{num(i)}</span>
                  <h3 className={`mt-3 font-display text-lg font-semibold ${i === 0 ? 'text-white' : ''}`}>{item.title}</h3>
                  <p className={`mt-3 text-sm leading-relaxed ${i === 0 ? 'text-white/85' : 'text-text-muted'}`}>
                    <span className={`font-semibold ${i === 0 ? 'text-white' : 'text-text'}`}>Fits when: </span>
                    {item.fits}
                  </p>
                  <p className={`mt-2 text-sm leading-relaxed ${i === 0 ? 'text-white/85' : 'text-text-muted'}`}>
                    <span className={`font-semibold ${i === 0 ? 'text-white' : 'text-text'}`}>Trade-off: </span>
                    {item.tradeoff}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {guide.checklist && (
        <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-16">
          <Reveal className="mb-10">
            <SectionHead eyebrow="Selection checklist" title="Score every option on the same ten points." />
          </Reveal>
          <TableCard
            minWidth="min-w-[760px]"
            note={<>This is a selection guide, not a ranking. Verify each vendor&rsquo;s current features directly before you decide.</>}
          >
            <thead>
              <tr className="bg-surface-high">
                <th scope="col" className="px-5 py-4 font-display text-sm font-semibold">Criterion</th>
                <th scope="col" className="px-5 py-4 font-display text-sm font-semibold text-text-muted">What good looks like</th>
                <th scope="col" className="bg-primary/[0.08] px-5 py-4 font-display text-sm font-semibold text-primary">How to test it</th>
              </tr>
            </thead>
            <tbody>
              {guide.checklist.map((row, i) => (
                <tr key={row.criterion} className="border-t border-border">
                  <th scope="row" className="px-5 py-4 align-top font-semibold text-text">
                    <span className="mr-2 font-display text-xs text-primary">{num(i)}</span>
                    {row.criterion}
                  </th>
                  <td className="px-5 py-4 align-top text-text-muted">{row.good}</td>
                  <td className="bg-primary/[0.04] px-5 py-4 align-top text-text">{row.test}</td>
                </tr>
              ))}
            </tbody>
          </TableCard>
        </section>
      )}

      {guide.trial && (
        <StepRail
          eyebrow="Run a fair trial"
          title={guide.trialTitle ?? 'From shortlist to pilot in five steps.'}
          steps={guide.trial.map((step) => ({ body: step, icon: 'task_alt' }))}
        />
      )}

      <ObjectionCards route={route} placement="guide_objections" />

      <FaqSection items={guide.faqs} />
      {guide.related && <RelatedPills label="Keep exploring" items={guide.related} />}

      <div ref={endRef} />
      <CTABand />
      <StickyCta heroCtaRef={heroCtaRef} endRef={endRef} />
    </MarketingLayout>
  )
}
