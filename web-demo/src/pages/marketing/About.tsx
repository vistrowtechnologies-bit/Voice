import { MarketingLayout } from '../../components/MarketingLayout'
import { Icon } from '../../components/Icon'
import { CTABand, SectionEyebrow } from '../../components/MarketingBits'

const VALUES = [
  { icon: 'translate', title: 'Bharat-first', body: 'We build for the languages and accents India actually speaks — not an afterthought translation.' },
  { icon: 'bolt', title: 'Real-time', body: 'Sub-300ms responses. A conversation should feel like a conversation, never a delay.' },
  { icon: 'shield', title: 'Grounded & honest', body: 'Answers tied to your knowledge base. No hallucinations, every call logged.' },
  { icon: 'diversity_3', title: 'For every business', body: 'From a single clinic to an enterprise call centre — the same platform scales with you.' },
]

const STATS = [
  { value: '30+', label: 'Languages' },
  { value: '10,000+', label: 'Leads qualified' },
  { value: '<300ms', label: 'Response time' },
  { value: '99.9%', label: 'Uptime' },
]

export function About() {
  return (
    <MarketingLayout>
      <section className="mx-auto max-w-3xl px-5 py-16 text-center md:px-8 lg:py-24">
        <SectionEyebrow>Company</SectionEyebrow>
        <h1 className="mt-4 font-display text-5xl font-bold leading-[1.05] tracking-tight">
          Voice AI, built for Bharat.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-text-muted">
          Every business should be reachable by phone — in its customers’ own language, at any hour.
          Vistrow Voice puts a capable AI agent on every call so no enquiry, booking, or follow-up
          is ever missed again.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-8 md:px-8">
        <div className="grid grid-cols-2 gap-5 rounded-3xl border border-border bg-surface p-8 md:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <p className="font-display text-3xl font-bold text-primary">{s.value}</p>
              <p className="mt-1 text-xs uppercase tracking-wider text-text-muted">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 md:px-8">
        <div className="mb-12 text-center">
          <SectionEyebrow>What we value</SectionEyebrow>
          <h2 className="mt-3 font-display text-4xl font-bold tracking-tight">How we build.</h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {VALUES.map((v) => (
            <div key={v.title} className="rounded-2xl border border-border bg-surface p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
                <Icon name={v.icon} className="text-[22px]" />
              </span>
              <h3 className="mt-5 font-display text-lg font-semibold">{v.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{v.body}</p>
            </div>
          ))}
        </div>
      </section>

      <CTABand title="Want to build with us?" subtitle="We’re hiring, and we’d love to hear from you." />
    </MarketingLayout>
  )
}
