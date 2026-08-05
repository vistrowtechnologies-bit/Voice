import { Icon } from '../../components/Icon'
import { MarketingLayout, NavLink } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { CTABand, SectionEyebrow } from '../../components/MarketingBits'
import { Reveal } from '../../components/Reveal'
import { INTEGRATION_DIRECTORY } from '../../lib/marketingContent'

// The named counterpart to /product/integrations: that page sells the
// capability, this one answers "is MY tool on the list?" - the actual
// question a buyer has. Entries marked viaWebhook are honestly labelled
// rather than dressed up as native connectors.
export function IntegrationsDirectory() {
  const categories = [...new Set(INTEGRATION_DIRECTORY.map((i) => i.category))]

  return (
    <MarketingLayout>
      <Seo
        title="Integrations - Vistrow Voice"
        description="Connect Vistrow Voice to your CRM, Slack, WhatsApp, Google Sheets, Zapier, n8n, Make, or any endpoint that accepts a webhook. Every qualified lead and transcript, delivered automatically."
        path="/integrations"
      />

      <section className="mx-auto max-w-3xl px-5 py-16 text-center md:px-8 lg:py-20">
        <SectionEyebrow>Integrations</SectionEyebrow>
        <h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
          Every lead, in the tools you already use.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-text-muted">
          The moment a call qualifies a lead, Vistrow Voice pushes it - with the full transcript and
          outcome - wherever your team works.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-10 md:px-8">
        {categories.map((category) => (
          <div key={category} className="mb-10">
            <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-text-muted">
              {category}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {INTEGRATION_DIRECTORY.filter((i) => i.category === category).map((entry, i) => (
                <Reveal key={entry.name} delayMs={(i % 3) * 70} className="h-full">
                <div className="h-full rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-primary/60">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display text-base font-semibold">{entry.name}</h3>
                    <span
                      className={`flex-shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        entry.viaWebhook
                          ? 'border-border text-text-muted'
                          : 'border-success/30 bg-success/15 text-success'
                      }`}
                    >
                      {entry.viaWebhook ? 'Via webhook' : 'Native'}
                    </span>
                  </div>
                  <p className="mt-2.5 text-sm leading-relaxed text-text-muted">{entry.desc}</p>
                </div>
                </Reveal>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 md:px-8">
        <div className="rounded-3xl border border-border bg-surface p-8 sm:p-10">
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <h2 className="flex items-center gap-2 font-display text-xl font-bold">
                <Icon name="webhook" className="text-[22px] text-cyan" />
                Don’t see your tool?
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-text-muted">
                Anything that accepts an inbound HTTP request works. Point the lead webhook at your
                endpoint and you’ll receive a structured JSON payload on every completed call - contact
                details, captured fields, sentiment, duration, channel, and the full transcript.
              </p>
            </div>
            <div>
              <h2 className="flex items-center gap-2 font-display text-xl font-bold">
                <Icon name="api" className="text-[22px] text-cyan" />
                Or build on the API
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-text-muted">
                For two-way sync and custom workflows, the API exposes agents, calls, contacts, and
                analytics directly - so you can pull data on your own schedule instead of only
                receiving pushes.
              </p>
              <NavLink
                to="/resources/docs"
                className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
              >
                Read the docs
                <Icon name="arrow_forward" className="text-[16px]" />
              </NavLink>
            </div>
          </div>
        </div>
      </section>

      <CTABand />
    </MarketingLayout>
  )
}
