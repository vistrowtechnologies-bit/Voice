import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { Icon3D } from '../../components/Icon3D'
import { FaqSection } from '../../components/FaqSection'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { CTABand, SectionEyebrow } from '../../components/MarketingBits'
import { ScriptMarquee } from '../../components/BharatBits'
import { HERO_STATS, SOLUTIONS } from '../../lib/marketingContent'
import { LOCAL_REAL_ESTATE_PAGES } from '../../lib/seoExpansionContent'
import { pageFigures } from '../../lib/pageFigures'
import { DemoOrbCard } from '../../components/DemoOrbCard'
import {
  Bento,
  CALLOUTS_BY_VIEW,
  DashboardCallouts,
  FeatureCards,
  FeatureRows,
  HeroFacts,
  ObjectionCards,
  Reveal,
  SectionHead,
  SplitHero,
  SplitRow,
  StickyCta,
  Timeline,
  TrustBand,
  useStickyRefs,
  type HeroChip,
} from '../../components/showcase'

// Hero chips for pages whose hero is a dashboard view. Scene images already
// carry their own call overlays, so they get none.
const HERO_CHIPS: Record<string, [HeroChip, HeroChip]> = {
  '/solutions/finance': [
    { label: 'Campaign running', live: true },
    { label: 'Do-Not-Call checked first', icon: 'block' },
  ],
}

/** "भारत के लिए / Built for BHARAT", the mark every industry hero carries. */
function BharatMark() {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold uppercase tracking-[0.28em]">
      <span className="font-sans text-sm normal-case tracking-normal text-text-muted">भारत के लिए</span>
      <span className="text-border">/</span>
      <span aria-label="Built for Bharat">
        <span className="text-text-muted">Built for </span>
        <span className="text-[#ff9933]">BH</span><span className="bharat-middle-letter">AR</span><span className="text-[#138808]">AT</span>
      </span>
    </p>
  )
}

// One template renders all five industry pages, keyed by the :slug route
// param, composed from the showcase kit (components/showcase/) so it matches
// the /product/* pages: split hero with the industry scene, a try-a-call
// studio with the live demo beside the sample line, the pains as a bento with
// a dashboard view, the violet trust band, the workflow as a timeline, guide
// sections beside their visuals, the after-call record beside its outcome
// card, a dashboard tour, objections, then FAQ and the CTA band.
export function SolutionDetail() {
  const { slug } = useParams()
  const [activeScenario, setActiveScenario] = useState(0)
  const { heroCtaRef, endRef } = useStickyRefs()
  const solution = SOLUTIONS.find((s) => s.to === `/solutions/${slug}`)

  useEffect(() => {
    setActiveScenario(0)
  }, [slug])

  if (!solution) return <Navigate to="/solutions" replace />

  const route = solution.to
  const scenario = solution.scenarios[activeScenario]
  const scrollToDemo = () => document.getElementById('live-demo')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  const outcomeVisual = pageFigures(route, 'showcase-outcome')[0]
  const dashboardView = pageFigures(route, 'showcase-dashboard')[0]
  const dashboardCallouts = dashboardView ? CALLOUTS_BY_VIEW[dashboardView.src] : undefined

  // Answer-engine-friendly (AEO/GEO): FAQPage structured data lets Google,
  // Bing, and LLM-based answer engines quote these Q&As directly instead of
  // having to scrape the accordion markup.
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: solution.faqs.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }

  const resultRecord = (
    <div className="rounded-3xl border border-border bg-surface p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <SectionEyebrow>After the call</SectionEyebrow>
          <h2 className="mt-3 font-display text-2xl font-bold sm:text-3xl">{solution.resultTitle}</h2>
        </div>
        <span className="shrink-0 rounded-full border border-cyan/30 bg-cyan/10 px-3 py-1 text-xs font-bold text-cyan">Example record</span>
      </div>
      <div className="mt-7 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface-high">
        {solution.resultFields.map((field) => (
          <div key={field.label} className="grid gap-1 px-5 py-4 sm:grid-cols-[150px_1fr] sm:items-center">
            <span className="text-xs font-bold uppercase tracking-wide text-text-muted">{field.label}</span>
            <span className="text-sm font-semibold text-text sm:text-right">{field.value}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-text-muted">Example only. Your agent captures the fields and outcomes configured for your workflow.</p>
    </div>
  )

  const teamReceives = (
    <div className="rounded-3xl border border-border bg-gradient-to-br from-surface to-surface-high p-6 sm:p-8">
      <SectionEyebrow>What your team receives</SectionEyebrow>
      <h2 className="mt-3 font-display text-2xl font-bold sm:text-3xl">No manual call reconstruction.</h2>
      <ul className={`mt-6 grid gap-3 sm:grid-cols-2 ${outcomeVisual ? '' : 'lg:grid-cols-1'}`}>
        {solution.features.map((feat) => (
          <li key={feat} className="flex items-center gap-3 rounded-xl border border-border bg-surface/70 px-4 py-3 text-sm font-medium text-text">
            <Icon name="check_circle" className="shrink-0 text-[20px] text-cyan" />
            {feat}
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <MarketingLayout>
      <Seo title={`${solution.headline} - Vistrow Voice`} description={solution.subhead} path={route} jsonLd={faqJsonLd} />
      <button
        type="button"
        onClick={scrollToDemo}
        aria-controls="live-demo"
        className="independence-ribbon flex w-full items-center justify-center gap-2 px-4 py-2.5 text-center text-xs font-semibold text-text sm:text-sm"
      >
        <span className="ribbon-tricolour" aria-hidden="true"><i /><i /><i /></span>
        <span>Try a real {solution.label} call with Artha, no signup required</span>
        <Icon name="arrow_forward" className="text-[16px]" />
      </button>

      <SplitHero
        kicker={<BharatMark />}
        eyebrow={`Solutions · ${solution.label}`}
        title={solution.headline}
        subhead={solution.subhead}
        visual={pageFigures(route, 'showcase-hero')[0]}
        chips={HERO_CHIPS[route]}
        placement="solution_hero"
        trust={<HeroFacts facts={HERO_STATS} />}
        ctaRef={heroCtaRef}
      />

      <ScriptMarquee />

      {slug === 'real-estate' && (
        <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
          <Reveal className="mb-7">
            <SectionHead
              eyebrow="Regional real-estate workflows"
              title="Explore calls in your market and language."
              intro="See examples tailored to local buyer conversations, from enquiry qualification to site-visit follow-up."
            />
          </Reveal>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {LOCAL_REAL_ESTATE_PAGES.map((market, i) => (
              <Link
                key={market.slug}
                to={`/solutions/real-estate/${market.slug}`}
                className={`vv-lift group flex items-center justify-between gap-3 rounded-3xl border p-5 ${
                  i === 0 ? 'border-primary/40 bg-gradient-to-br from-primary/[0.14] via-surface to-surface sm:col-span-2' : 'border-border bg-surface'
                }`}
              >
                <span className="flex items-center gap-4">
                  <span lang={market.langCode} className="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 px-2 font-display text-sm font-bold text-primary">
                    {market.native}
                  </span>
                  <span>
                    <span className="block font-semibold text-text">{market.language} real estate calls</span>
                    <span className="mt-1 block text-sm text-text-muted">{market.city}</span>
                  </span>
                </span>
                <Icon name="arrow_forward" className="shrink-0 text-primary transition-transform group-hover:translate-x-1" />
              </Link>
            ))}
          </div>
          <p className="mt-5 text-sm text-text-muted">
            For South Indian markets, the language pages add sample lines and regional notes:{' '}
            <Link to="/languages/kannada" className="font-semibold text-primary underline-offset-4 hover:underline">
              Kannada AI voice calling agent for Bengaluru
            </Link>{' '}
            and{' '}
            <Link to="/languages/telugu" className="font-semibold text-primary underline-offset-4 hover:underline">
              Telugu AI voice calling agent for Hyderabad
            </Link>
            .
          </p>
        </section>
      )}

      {/* A useful demo needs a job, not just an orb. Each choice represents a
          real call this industry's agent is configured to handle and gives
          the visitor a natural opening line to try; the live demo sits right
          beside it, so "Start this call" is one short scroll away. */}
      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8 lg:py-16">
        <Reveal>
          <SectionHead
            center
            eyebrow="Choose a real call"
            title="Don’t watch a generic demo. Test the work."
            intro={`Pick a situation your team handles today, then say the sample line or use your own words. Artha stays in role as ${solution.demoBusiness}.`}
          />
        </Reveal>

        <div className={`mt-10 grid items-start gap-8 ${solution.demoSlug ? 'lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-10' : ''}`}>
          <div className="min-w-0">
            <div className="flex snap-x gap-3 overflow-x-auto pb-2" role="tablist" aria-label={`${solution.label} call scenarios`}>
              {solution.scenarios.map((item, index) => (
                <button
                  key={item.label}
                  type="button"
                  role="tab"
                  aria-selected={activeScenario === index}
                  onClick={() => setActiveScenario(index)}
                  className={`min-w-max snap-start rounded-full border px-5 py-2.5 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                    activeScenario === index
                      ? 'border-primary bg-primary text-white shadow-lg shadow-primary/20'
                      : 'border-border bg-surface text-text hover:border-primary/60'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mt-5 overflow-hidden rounded-3xl border border-border bg-surface shadow-[0_30px_60px_-44px_rgba(76,29,149,0.55)]">
              <div className="relative overflow-hidden border-b border-border bg-gradient-to-br from-primary/[0.10] via-surface-high to-surface-high p-6 sm:p-8">
                <span className="text-xs font-bold uppercase tracking-widest text-cyan">Say this to Artha</span>
                <blockquote className="mt-4 font-display text-2xl font-semibold leading-snug text-text sm:text-3xl">
                  {scenario.callerLine}
                </blockquote>
                <button
                  type="button"
                  onClick={scrollToDemo}
                  className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-dark px-5 py-2.5 text-sm font-bold text-white shadow-[0_14px_36px_-14px_rgba(147,51,234,0.8)] transition-transform hover:-translate-y-0.5"
                >
                  <Icon name="mic" className="text-[18px]" />
                  Start this call
                </button>
              </div>
              <div className="grid sm:grid-cols-2">
                <div className="p-6 sm:p-8">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon3D name="psychology" size={32} className="text-[22px]" />
                  </span>
                  <h3 className="mt-4 font-display text-lg font-semibold">What Artha does</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-muted">{scenario.agentAction}</p>
                </div>
                <div className="border-t border-border p-6 sm:border-l sm:border-t-0 sm:p-8">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan/10 text-cyan">
                    <Icon3D name="task_alt" size={32} className="text-[22px]" />
                  </span>
                  <h3 className="mt-4 font-display text-lg font-semibold">Useful outcome</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-muted">{scenario.outcome}</p>
                </div>
              </div>
            </div>
          </div>

          {solution.demoSlug && (
            <div className="flex flex-col gap-3 lg:sticky lg:top-28">
              <DemoOrbCard demoSlug={solution.demoSlug} badgeLabel={solution.demoBadge} accentHue={solution.demoAccentHue} />
              <p className="mx-auto max-w-[420px] text-center text-xs text-text-muted">
                You’ll be talking to <span className="font-semibold text-text">{solution.demoBusiness}</span>, a
                demo business we made up, answered live by Artha. {solution.demoPrompt}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Pain → outcome, as a bento beside a real dashboard view. */}
      <Bento
        visual={pageFigures(route, 'showcase-feature')[0]}
        items={solution.pains}
        head={<SectionHead eyebrow="Why teams switch" title="Where the current workflow breaks." />}
      />

      <TrustBand placement="solution_trust_band" />

      {/* Operational workflow: these steps are deliberately different for
          every industry, so the page explains the job rather than repeating
          a shared feature grid with a changed heading. */}
      <Timeline eyebrow="During every call" title="How the conversation becomes an outcome." steps={solution.workflow} />

      {/* Page-specific depth: what the agent does, the controls that exist,
          and a written sample. Visuals sit beside the section they show. */}
      {solution.guideSections?.map((section, i) => (
        <FeatureRows
          key={section.title}
          eyebrow={section.eyebrow}
          title={section.title}
          intro={section.intro}
          items={section.items}
          note={section.note}
          figures={pageFigures(route, section.title)}
          flip={i % 2 === 1}
        />
      ))}

      {solution.sampleExchange && (
        <section className="mx-auto max-w-7xl px-5 py-12 md:px-8 lg:py-16">
          <Reveal>
            <figure className="grid gap-8 rounded-3xl border border-border bg-surface p-6 sm:p-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-12 lg:p-10">
              <figcaption>
                <SectionEyebrow>Example conversation</SectionEyebrow>
                <h2 className="mt-3 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                  {solution.sampleExchange.context}, in {solution.sampleExchange.langLabel}.
                </h2>
                <p className="mt-3 text-sm text-text-muted">
                  A short written sample to show the style of call, with an English gloss under each line. It is not a
                  recording of a customer call.
                </p>
                <p className="mt-5 flex gap-2 text-sm leading-relaxed text-text-muted">
                  <Icon name="task_alt" className="mt-0.5 shrink-0 text-[16px] text-cyan" />
                  <span>{solution.sampleExchange.outcome}</span>
                </p>
              </figcaption>
              <ol className="space-y-4">
                {solution.sampleExchange.turns.map((turn, i) => (
                  <li
                    key={i}
                    className={`rounded-2xl border p-4 ${turn.speaker === 'Agent' ? 'border-primary/25 bg-primary/[0.06] sm:ml-8' : 'border-border bg-surface-high/60 sm:mr-8'}`}
                  >
                    <p className="text-xs font-bold uppercase tracking-widest text-text-muted">
                      {turn.speaker === 'Agent' ? 'AI agent' : 'Caller'}
                    </p>
                    <p lang={solution.sampleExchange!.langCode} className="mt-1.5 text-base leading-relaxed text-text">{turn.native}</p>
                    <p className="mt-1 text-sm italic leading-relaxed text-text-muted">{turn.gloss}</p>
                  </li>
                ))}
              </ol>
            </figure>
          </Reveal>
        </section>
      )}

      {/* Show the operational artifact customers actually buy: a useful,
          structured result that can move into another system, beside the
          outcome card that illustrates it. */}
      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8 lg:py-16">
        {outcomeVisual ? (
          <SplitRow figure={outcomeVisual} className="">
            <div className="grid gap-6">
              <Reveal>{resultRecord}</Reveal>
              <Reveal delayMs={80}>{teamReceives}</Reveal>
            </div>
          </SplitRow>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <Reveal className="h-full [&>div]:h-full">{resultRecord}</Reveal>
            <Reveal delayMs={80} className="h-full [&>div]:h-full">{teamReceives}</Reveal>
          </div>
        )}
      </section>

      {dashboardView && dashboardCallouts && <DashboardCallouts view={dashboardView} callouts={dashboardCallouts} />}

      <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-20">
        <Reveal>
          <SectionHead eyebrow="Connected workflow" title="The call should update the tools your team already uses." className="mb-10" />
        </Reveal>
        <FeatureCards items={solution.integrations} />
      </section>

      <section className="px-5 md:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 rounded-[2rem] border border-border bg-surface-high/50 px-6 py-12 sm:px-10 lg:grid-cols-[0.7fr_1.3fr] lg:items-start lg:px-14 lg:py-14">
          <Reveal>
            <SectionEyebrow>Boundaries matter</SectionEyebrow>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance">What Artha must never improvise.</h2>
            <p className="mt-4 text-sm leading-relaxed text-text-muted">Useful automation is grounded, auditable and honest about when a person needs to take over.</p>
          </Reveal>
          <div className="grid gap-3">
            {solution.guardrails.map((rule, i) => (
              <Reveal key={rule} delayMs={i * 70}>
                <div className="flex gap-4 rounded-2xl border border-border bg-surface p-5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan/10 text-cyan">
                    <Icon3D name="shield" size={30} className="text-[20px]" />
                  </span>
                  <p className="self-center text-sm leading-relaxed text-text">{rule}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <ObjectionCards route={route} placement="solution_objections" />

      {/* FAQ */}
      {/* key: the accordion state lives in FaqSection now, and navigating
          between two solution pages keeps it mounted — remount so the answer
          list opens at the top the way it did before. */}
      <FaqSection key={slug} items={solution.faqs} />

      <div ref={endRef} />
      <CTABand title={`Ready to try Artha for ${solution.label}?`} />
      <StickyCta heroCtaRef={heroCtaRef} endRef={endRef} />
    </MarketingLayout>
  )
}
