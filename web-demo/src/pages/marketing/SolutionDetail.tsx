import { useParams, Navigate } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { MarketingLayout } from '../../components/MarketingLayout'
import { DemoOrbCard } from '../../components/DemoOrbCard'
import { PageHero, CTABand, SectionEyebrow } from '../../components/MarketingBits'
import { SOLUTIONS } from '../../lib/marketingContent'

// One template renders all five industry pages, keyed by the :slug route param.
export function SolutionDetail() {
  const { slug } = useParams()
  const solution = SOLUTIONS.find((s) => s.to === `/solutions/${slug}`)
  if (!solution) return <Navigate to="/solutions" replace />

  return (
    <MarketingLayout>
      <PageHero
        eyebrow={`Solutions · ${solution.label}`}
        title={solution.headline}
        subhead={solution.subhead}
      >
        <DemoOrbCard />
      </PageHero>

      {/* Pain → outcome */}
      <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
        <div className="mb-10 text-center">
          <SectionEyebrow>Why teams switch</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">From missed calls to booked outcomes.</h2>
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
      </section>

      {/* Sample transcript + feature list */}
      <section className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-5 py-12 md:px-8 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-6">
          <div className="mb-4 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan" />
            </span>
            <span className="text-xs font-semibold text-text-muted">Live call · Artha</span>
          </div>
          <div className="flex flex-col gap-3 text-sm">
            <div className="max-w-[85%] self-start rounded-2xl rounded-tl-sm bg-surface-high px-4 py-2.5 text-text">
              Namaste! You’ve reached {solution.label}. How can I help you today?
            </div>
            <div className="max-w-[85%] self-end rounded-2xl rounded-tr-sm bg-primary/15 px-4 py-2.5 text-text">
              Hi, I wanted to know more about your services.
            </div>
            <div className="max-w-[85%] self-start rounded-2xl rounded-tl-sm bg-surface-high px-4 py-2.5 text-text">
              Of course — may I take your name and number so our team can follow up with the right details?
            </div>
          </div>
        </div>
        <div>
          <SectionEyebrow>What’s included</SectionEyebrow>
          <h3 className="mt-3 font-display text-2xl font-semibold">Everything Artha handles for {solution.label}.</h3>
          <ul className="mt-6 flex flex-col gap-3">
            {solution.features.map((feat) => (
              <li key={feat} className="flex items-center gap-3 text-text">
                <Icon name="check_circle" className="text-[20px] text-cyan" />
                {feat}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <CTABand title={`Ready to try Artha for ${solution.label}?`} />
    </MarketingLayout>
  )
}
