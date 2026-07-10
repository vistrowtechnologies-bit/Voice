import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { MarketingLayout } from '../../components/MarketingLayout'
import { CTABand, SectionEyebrow } from '../../components/MarketingBits'
import { PRODUCT_PAGES, HOW_IT_WORKS } from '../../lib/marketingContent'

export function ProductOverview() {
  return (
    <MarketingLayout>
      <section className="mx-auto max-w-3xl px-5 py-16 text-center md:px-8 lg:py-24">
        <SectionEyebrow>The platform</SectionEyebrow>
        <h1 className="mt-4 font-display text-5xl font-bold leading-[1.05] tracking-tight">
          One platform for every voice conversation.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-text-muted">
          Inbound, outbound, and web calls — built, grounded, and analyzed in one place.
          Everything you need to put an AI agent on every call.
        </p>
      </section>

      {/* Bento grid of products */}
      <section className="mx-auto max-w-7xl px-5 pb-8 md:px-8">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUCT_PAGES.map((p, i) => (
            <Link
              key={p.to}
              to={p.to}
              className={`group flex flex-col justify-between rounded-2xl border border-border bg-surface p-7 transition-colors hover:border-primary ${
                i === 0 ? 'sm:col-span-2' : ''
              }`}
            >
              <div>
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
                  <Icon name={p.icon ?? 'circle'} className="text-[24px]" />
                </span>
                <h3 className="mt-5 font-display text-xl font-semibold">{p.label}</h3>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-text-muted">{p.desc}</p>
              </div>
              <span className="mt-5 flex items-center gap-1 text-sm font-semibold text-primary">
                Learn more
                <Icon name="arrow_forward" className="text-[16px] transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* How it fits */}
      <section className="mx-auto max-w-7xl px-5 py-20 md:px-8">
        <div className="mb-12 text-center">
          <SectionEyebrow>How it fits your stack</SectionEyebrow>
          <h2 className="mt-3 font-display text-4xl font-bold tracking-tight">Number → Agent → Your tools.</h2>
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

      <CTABand />
    </MarketingLayout>
  )
}
