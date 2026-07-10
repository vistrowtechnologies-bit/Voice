import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { MarketingLayout } from '../../components/MarketingLayout'
import { DemoOrbCard } from '../../components/DemoOrbCard'
import { PLANS } from '../../lib/plans'
import {
  HOME_FEATURES,
  HOW_IT_WORKS,
  SOLUTIONS,
  HERO_STATS,
} from '../../lib/marketingContent'

function SectionEyebrow({ children }: { children: string }) {
  return (
    <span className="text-xs font-bold uppercase tracking-widest text-cyan">{children}</span>
  )
}

export function Home() {
  return (
    <MarketingLayout>
      {/* ---------- Hero ---------- */}
      <section className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-5 py-14 md:px-8 lg:grid-cols-2 lg:py-24">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
            <span className="text-xs font-bold uppercase tracking-widest text-cyan">India-native voice AI platform</span>
          </span>
          <h1 className="mt-5 font-display text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            AI voice agents for{' '}
            <span className="bg-gradient-to-r from-primary to-magenta bg-clip-text text-transparent">
              every customer call.
            </span>
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-text-muted">
            Answer, qualify, and book — in your customers’ language. Inbound, outbound, and web calls
            in 30+ Indian languages, sub-300ms.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/demo"
              className="flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-dark px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
            >
              <Icon name="mic" className="text-[18px]" />
              Talk to Artha live
            </Link>
            <Link
              to="/contact"
              className="rounded-full border border-border px-6 py-3 text-sm font-bold text-text transition-colors hover:border-primary"
            >
              Book a demo
            </Link>
          </div>
          <div className="mt-10 flex gap-8 border-t border-border pt-6">
            {HERO_STATS.map((stat) => (
              <div key={stat.label}>
                <p className="font-display text-2xl font-bold text-text">{stat.value}</p>
                <p className="text-xs uppercase tracking-wider text-text-muted">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <DemoOrbCard />
        </div>
      </section>

      {/* ---------- Trust strip ---------- */}
      <section className="border-y border-border bg-surface/40">
        <div className="mx-auto max-w-7xl px-5 py-8 md:px-8">
          <p className="text-center text-xs uppercase tracking-widest text-text-muted">
            Trusted by fast-growing Indian businesses
          </p>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="mx-auto max-w-7xl px-5 py-20 md:px-8">
        <div className="mb-12 text-center">
          <SectionEyebrow>How it works</SectionEyebrow>
          <h2 className="mt-3 font-display text-4xl font-bold tracking-tight">Live in minutes, not months.</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {HOW_IT_WORKS.map((step, i) => (
            <div key={step.title} className="rounded-2xl border border-border bg-surface p-7">
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-high text-primary">
                  <Icon name={step.icon} className="text-[22px]" />
                </span>
                <span className="font-display text-3xl font-bold text-border">{`0${i + 1}`}</span>
              </div>
              <h3 className="mt-5 font-display text-xl font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Features grid ---------- */}
      <section className="mx-auto max-w-7xl px-5 py-20 md:px-8">
        <div className="mb-12 text-center">
          <SectionEyebrow>The platform</SectionEyebrow>
          <h2 className="mt-3 font-display text-4xl font-bold tracking-tight">
            One platform for every voice conversation.
          </h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {HOME_FEATURES.map((f) => (
            <Link
              key={f.to}
              to={f.to}
              className="group rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-primary"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
                <Icon name={f.icon ?? 'circle'} className="text-[22px]" />
              </span>
              <h3 className="mt-5 flex items-center gap-1 font-display text-lg font-semibold">
                {f.label}
                <Icon
                  name="arrow_forward"
                  className="text-[16px] text-text-muted transition-transform group-hover:translate-x-1 group-hover:text-primary"
                />
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{f.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ---------- Solutions preview ---------- */}
      <section className="mx-auto max-w-7xl px-5 py-20 md:px-8">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
          <div>
            <SectionEyebrow>Solutions</SectionEyebrow>
            <h2 className="mt-3 font-display text-4xl font-bold tracking-tight">Built for your industry.</h2>
          </div>
          <Link to="/solutions" className="text-sm font-semibold text-primary hover:underline">
            All industries →
          </Link>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SOLUTIONS.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className="group flex flex-col justify-between rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-primary"
            >
              <div>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-high text-cyan">
                  <Icon name={s.icon ?? 'circle'} className="text-[22px]" />
                </span>
                <h3 className="mt-5 font-display text-lg font-semibold">{s.label}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">{s.desc}</p>
              </div>
              <span className="mt-5 flex items-center gap-1 text-sm font-semibold text-primary">
                Explore
                <Icon name="arrow_forward" className="text-[16px] transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ---------- Pricing teaser ---------- */}
      <section className="mx-auto max-w-7xl px-5 py-20 md:px-8">
        <div className="mb-12 text-center">
          <SectionEyebrow>Pricing</SectionEyebrow>
          <h2 className="mt-3 font-display text-4xl font-bold tracking-tight">Simple, credit-based plans.</h2>
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl border bg-surface p-7 ${
                plan.tag === 'Recommended' ? 'border-primary shadow-[0_0_40px_-10px_rgba(168,85,247,0.5)]' : 'border-border'
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold">{plan.name}</h3>
                {plan.tag && (
                  <span className="rounded-full bg-primary/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                    {plan.tag}
                  </span>
                )}
              </div>
              <p className="mt-4 font-display text-3xl font-bold">
                {plan.price}
                <span className="text-base font-normal text-text-muted">/mo</span>
              </p>
              <p className="mt-1 text-sm text-text-muted">{plan.credits}</p>
              <ul className="mt-5 flex flex-col gap-2.5">
                {plan.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2 text-sm text-text-muted">
                    <Icon name="check_circle" className="mt-0.5 text-[16px] text-cyan" />
                    {feat}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link to="/pricing" className="text-sm font-semibold text-primary hover:underline">
            See full pricing →
          </Link>
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="mx-auto max-w-7xl px-5 py-20 md:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-surface to-surface-high p-10 text-center sm:p-16">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-[100px]" />
          <h2 className="relative font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Put an AI agent on every call.
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-lg text-text-muted">
            Try Artha live in your browser, or book a walkthrough with our team.
          </p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/demo"
              className="flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-dark px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
            >
              <Icon name="mic" className="text-[18px]" />
              Talk to Artha live
            </Link>
            <Link
              to="/contact"
              className="rounded-full border border-border px-6 py-3 text-sm font-bold text-text transition-colors hover:border-primary"
            >
              Book a demo
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  )
}
