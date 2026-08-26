import { useEffect, useState } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { PageHero, CTABand, SectionEyebrow } from '../../components/MarketingBits'
import { SOLUTIONS } from '../../lib/marketingContent'
import { DemoOrbCard } from '../../components/DemoOrbCard'

// One template renders all five industry pages, keyed by the :slug route param.
export function SolutionDetail() {
  const { slug } = useParams()
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const [activeScenario, setActiveScenario] = useState(0)
  const solution = SOLUTIONS.find((s) => s.to === `/solutions/${slug}`)

  useEffect(() => {
    setActiveScenario(0)
    setOpenFaq(0)
  }, [slug])

  if (!solution) return <Navigate to="/solutions" replace />

  const scenario = solution.scenarios[activeScenario]
  const scrollToDemo = () => document.getElementById('live-demo')?.scrollIntoView({ behavior: 'smooth', block: 'center' })

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

  return (
    <MarketingLayout>
      <Seo title={`${solution.headline} - Vistrow Voice`} description={solution.subhead} path={solution.to} jsonLd={faqJsonLd} />
      {/* An industry with a published roleplay agent puts the live call in
          the hero, beside the headline — it is the strongest thing on the
          page, so burying it below three sections wasted it. Industries
          without one pass no children and PageHero falls back to its
          single centered column. */}
      <PageHero
        eyebrow={`Solutions · ${solution.label}`}
        title={solution.headline}
        subhead={solution.subhead}
      >
        {solution.demoSlug ? (
          <div className="flex flex-col gap-3">
            <DemoOrbCard
              demoSlug={solution.demoSlug}
              badgeLabel={solution.demoBadge}
              accentHue={solution.demoAccentHue}
            />
            <p className="mx-auto max-w-[420px] text-center text-xs text-text-muted lg:mx-0 lg:ml-auto">
              You’ll be talking to <span className="font-semibold text-text">{solution.demoBusiness}</span> — a
              demo business we made up, answered live by Artha. {solution.demoPrompt}
            </p>
          </div>
        ) : undefined}
      </PageHero>

      {/* A useful demo needs a job, not just an orb. Each choice represents a
          real call this industry's agent is configured to handle and gives
          the visitor a natural opening line to try. */}
      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8 lg:py-16">
        <div className="mx-auto max-w-3xl text-center">
          <SectionEyebrow>Choose a real call</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Don’t watch a generic demo. Test the work.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-text-muted">
            Pick a situation your team handles today, then say the sample line—or use your own words. Artha stays in role as {solution.demoBusiness}.
          </p>
        </div>

        <div className="mt-8 flex snap-x gap-3 overflow-x-auto pb-2 lg:justify-center" role="tablist" aria-label={`${solution.label} call scenarios`}>
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

        <div className="mt-5 grid overflow-hidden rounded-3xl border border-border bg-surface shadow-sm lg:grid-cols-[0.9fr_1.1fr]">
          <div className="border-b border-border bg-surface-high p-6 sm:p-8 lg:border-b-0 lg:border-r">
            <span className="text-xs font-bold uppercase tracking-widest text-cyan">Say this to Artha</span>
            <blockquote className="mt-4 font-display text-2xl font-semibold leading-snug text-text sm:text-3xl">
              {scenario.callerLine}
            </blockquote>
            <button
              type="button"
              onClick={scrollToDemo}
              className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-dark px-5 py-2.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
            >
              <Icon name="mic" className="text-[18px]" />
              Start this call
            </button>
          </div>
          <div className="grid gap-0 sm:grid-cols-2">
            <div className="p-6 sm:p-8">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon name="psychology" className="text-[22px]" />
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold">What Artha does</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{scenario.agentAction}</p>
            </div>
            <div className="border-t border-border p-6 sm:border-l sm:border-t-0 sm:p-8">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan/10 text-cyan">
                <Icon name="task_alt" className="text-[22px]" />
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold">Useful outcome</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{scenario.outcome}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pain → outcome */}
      <section className="border-y border-border bg-surface-high/50">
        <div className="mx-auto max-w-7xl px-5 py-12 md:px-8 lg:py-16">
        <div className="mb-10 text-center">
          <SectionEyebrow>Why teams switch</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Where the current workflow breaks.</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {solution.pains.map((p) => (
            <div key={p.title} className="rounded-2xl border border-border bg-surface p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-high text-cyan">
                <Icon name={p.icon} className="text-[22px]" />
              </span>
              <h3 className="mt-5 font-display text-lg font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{p.body}</p>
            </div>
          ))}
        </div>
        </div>
      </section>

      {/* Operational workflow: these steps are deliberately different for
          every industry, so the page explains the job rather than repeating
          a shared feature grid with a changed heading. */}
      <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-20">
        <div className="max-w-2xl">
          <SectionEyebrow>During every call</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">How the conversation becomes an outcome.</h2>
        </div>
        <div className="relative mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {solution.workflow.map((step, index) => (
            <article key={step.title} className="relative rounded-2xl border border-border bg-surface p-6">
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon name={step.icon} className="text-[22px]" />
                </span>
                <span className="font-display text-3xl font-bold text-border">0{index + 1}</span>
              </div>
              <h3 className="mt-5 font-display text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Show the operational artifact customers actually buy: a useful,
          structured result that can move into another system. */}
      <section className="mx-auto grid max-w-7xl gap-6 px-5 py-12 md:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:py-16">
        <div className="rounded-3xl border border-border bg-surface p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SectionEyebrow>After the call</SectionEyebrow>
              <h2 className="mt-3 font-display text-2xl font-bold sm:text-3xl">{solution.resultTitle}</h2>
            </div>
            <span className="rounded-full border border-cyan/30 bg-cyan/10 px-3 py-1 text-xs font-bold text-cyan">Example record</span>
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

        <div className="rounded-3xl border border-border bg-gradient-to-br from-surface to-surface-high p-6 sm:p-8">
          <SectionEyebrow>What your team receives</SectionEyebrow>
          <h2 className="mt-3 font-display text-2xl font-bold sm:text-3xl">No manual call reconstruction.</h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {solution.features.map((feat) => (
              <li key={feat} className="flex items-center gap-3 rounded-xl border border-border bg-surface/70 px-4 py-3 text-sm font-medium text-text">
                <Icon name="check_circle" className="text-[20px] text-cyan" />
                {feat}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-20">
        <div className="mb-9 max-w-2xl">
          <SectionEyebrow>Connected workflow</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">The call should update the tools your team already uses.</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {solution.integrations.map((item) => (
            <article key={item.title} className="group rounded-2xl border border-border bg-surface p-7 transition-all hover:-translate-y-1 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-high text-cyan transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                <Icon name={item.icon} className="text-[22px]" />
              </span>
              <h3 className="mt-5 font-display text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-surface-high/50">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 md:px-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-start lg:py-16">
          <div>
            <SectionEyebrow>Boundaries matter</SectionEyebrow>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">What Artha must never improvise.</h2>
            <p className="mt-4 text-sm leading-relaxed text-text-muted">Useful automation is grounded, auditable and honest about when a person needs to take over.</p>
          </div>
          <div className="grid gap-3">
            {solution.guardrails.map((rule) => (
              <div key={rule} className="flex gap-4 rounded-2xl border border-border bg-surface p-5">
                <Icon name="shield" className="mt-0.5 text-[22px] text-cyan" />
                <p className="text-sm leading-relaxed text-text">{rule}</p>
              </div>
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
          {solution.faqs.map((item, i) => (
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

      <CTABand title={`Ready to try Artha for ${solution.label}?`} />
    </MarketingLayout>
  )
}
