import { MarketingLayout, NavLink } from '../../components/MarketingLayout'
import { Icon } from '../../components/Icon'
import { Seo } from '../../components/Seo'
import { SectionEyebrow } from '../../components/MarketingBits'

const VALUES = [
  { icon: 'translate', title: 'Bharat-first', body: 'We build for the languages and accents India actually speaks — not an afterthought translation.' },
  { icon: 'bolt', title: 'Real-time', body: 'Low-latency, natural back-and-forth. A conversation should feel like a conversation, never a delay.' },
  { icon: 'shield', title: 'Grounded & honest', body: 'Answers tied to your knowledge base. No hallucinations, every call logged.' },
  { icon: 'diversity_3', title: 'For every business', body: 'From a single clinic to an enterprise call centre — the same platform scales with you.' },
]

const STATS = [
  { value: '11', label: 'Indian languages' },
  { value: '24/7', label: 'Always answering' },
  { value: '3', label: 'Call channels' },
  { value: '100%', label: 'Calls logged & transcribed' },
]

export function About() {
  return (
    <MarketingLayout>
      <Seo
        title="About — Vistrow Voice"
        description="Vistrow Voice puts a capable AI agent on every call — in your customers' own language, at any hour. Voice AI, built for Bharat."
        path="/about"
      />
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

      {/* Points at the real Careers page — this used to be a generic CTA band
          claiming "we're hiring" with nowhere to actually apply. */}
      <section className="mx-auto max-w-7xl px-5 pb-20 md:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-surface to-surface-high p-10 text-center sm:p-16">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-[100px]" />
          <h2 className="relative font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Want to build with us?
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-lg text-text-muted">
            We’re a small team working on real-time voice AI for Indian languages.
          </p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <NavLink
              to="/careers"
              className="rounded-full bg-gradient-to-br from-primary to-primary-dark px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
            >
              See careers
            </NavLink>
            <NavLink
              to="/contact"
              className="rounded-full border border-border px-6 py-3 text-sm font-bold text-text transition-colors hover:border-primary"
            >
              Talk to us
            </NavLink>
          </div>
        </div>
      </section>
    </MarketingLayout>
  )
}
