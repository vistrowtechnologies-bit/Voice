import { Link, useParams } from 'react-router-dom'
import { FaqSection } from '../../components/FaqSection'
import { Icon } from '../../components/Icon'
import { MarketingLayout } from '../../components/MarketingLayout'
import { CTABand, SectionEyebrow, TalkToArthaButton } from '../../components/MarketingBits'
import { Seo } from '../../components/Seo'
import { DEMO_CALLS } from '../../lib/seoExpansionContent'
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

export function DemoCall() {
  const { slug } = useParams()
  const call = DEMO_CALLS.find((item) => item.slug === slug)
  if (!call) return <NotFound />

  return (
    <MarketingLayout>
      <Seo title={`${call.title} | Vistrow Voice`} description={call.description} path={`/demo-calls/${call.slug}`} jsonLd={faqJsonLd(call.faqs)} />

      <section className="mx-auto max-w-4xl px-5 py-16 text-center md:px-8 lg:py-20">
        <SectionEyebrow>Demo call</SectionEyebrow>
        <h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
          {call.title}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-text-muted">{call.description}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <TalkToArthaButton />
          <Link to="/solutions/real-estate" className="rounded-full border border-border px-6 py-3 text-sm font-bold text-text transition-colors hover:border-primary">
            See real estate workflow
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-5 pb-14 md:px-8 lg:grid-cols-[0.95fr_1.05fr]">
        <aside className="rounded-3xl border border-border bg-surface p-7">
          <SectionEyebrow>Call brief</SectionEyebrow>
          <h2 className="mt-3 font-display text-2xl font-bold">{call.scenario}</h2>
          <div className="mt-6 grid gap-3">
            <div className="rounded-2xl border border-border bg-surface-high p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Language</p>
              <p className="mt-1 font-semibold">{call.language}</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface-high p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Outcome</p>
              <p className="mt-1 font-semibold">{call.outcome}</p>
            </div>
          </div>
        </aside>

        <div className="rounded-3xl border border-border bg-surface p-5 sm:p-7">
          <SectionEyebrow>Transcript sample</SectionEyebrow>
          <div className="mt-5 space-y-4">
            {call.transcript.map((turn, index) => (
              <div key={`${turn.speaker}-${index}`} className={`flex ${turn.speaker === 'Caller' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[82%] rounded-2xl px-4 py-3 ${turn.speaker === 'Caller' ? 'bg-primary text-white' : 'border border-border bg-surface-high text-text'}`}>
                  <p className={`text-xs font-bold uppercase tracking-wider ${turn.speaker === 'Caller' ? 'text-white/75' : 'text-text-muted'}`}>{turn.speaker}</p>
                  <p className="mt-1 text-sm leading-relaxed">{turn.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-14 md:px-8">
        <div className="rounded-3xl border border-border bg-surface p-8 sm:p-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <SectionEyebrow>CRM-ready output</SectionEyebrow>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">What the team receives after the call.</h2>
            </div>
            <span className="rounded-full border border-cyan/30 bg-cyan/10 px-3 py-1 text-xs font-bold text-cyan">Example only</span>
          </div>
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {call.fields.map((field) => (
              <div key={field.label} className="rounded-2xl border border-border bg-surface-high p-5">
                <p className="text-xs font-bold uppercase tracking-widest text-text-muted">{field.label}</p>
                <p className="mt-2 font-semibold">{field.value}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 flex gap-2 text-sm leading-relaxed text-text-muted">
            <Icon name="info" className="mt-0.5 shrink-0 text-[18px] text-primary" />
            Public demo pages use representative scripts. Real recordings should only be published with consent.
          </p>
        </div>
      </section>

      <FaqSection items={call.faqs} />
      <CTABand title="Want this with your own call script?" subtitle="Send us your industry, language, lead fields, and CRM destination — we’ll configure a live test flow." />
    </MarketingLayout>
  )
}
