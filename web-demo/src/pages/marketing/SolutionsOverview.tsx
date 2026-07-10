import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { MarketingLayout } from '../../components/MarketingLayout'
import { CTABand, SectionEyebrow } from '../../components/MarketingBits'
import { SOLUTIONS } from '../../lib/marketingContent'

export function SolutionsOverview() {
  return (
    <MarketingLayout>
      <section className="mx-auto max-w-3xl px-5 py-16 text-center md:px-8 lg:py-24">
        <SectionEyebrow>Solutions</SectionEyebrow>
        <h1 className="mt-4 font-display text-5xl font-bold leading-[1.05] tracking-tight">
          Voice AI for your industry.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-text-muted">
          One platform, tuned to how your business actually takes calls — from real-estate
          enquiries to collections reminders.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-8 md:px-8">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SOLUTIONS.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className="group flex flex-col justify-between rounded-2xl border border-border bg-surface p-7 transition-colors hover:border-primary"
            >
              <div>
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-high text-cyan">
                  <Icon name={s.icon ?? 'circle'} className="text-[24px]" />
                </span>
                <h3 className="mt-5 font-display text-xl font-semibold">{s.label}</h3>
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

      <CTABand />
    </MarketingLayout>
  )
}
