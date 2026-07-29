import { Icon } from '../../components/Icon'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { SectionEyebrow } from '../../components/MarketingBits'
import { BRAND } from '../../lib/brand'

// Add roles here as they open. An empty array is a supported, deliberate
// state — the page renders an honest "nothing open right now, send us your
// CV anyway" instead of a broken or fake listing. The About page's hiring
// CTA points here, so this must never look abandoned.
interface Role {
  title: string
  location: string
  type: string
  blurb: string
}

const OPEN_ROLES: Role[] = []

const APPLY_EMAIL = 'vistrowai@gmail.com'

const WHY = [
  {
    icon: 'record_voice_over',
    title: 'Voice is unforgiving',
    body: 'A chatbot can take two seconds to think. A phone call can’t. Everything here is judged on whether it feels natural at real-time latency — that constraint makes the engineering genuinely hard.',
  },
  {
    icon: 'translate',
    title: 'Built for how India talks',
    body: 'Ten Indian languages, mid-sentence code-switching, and grammatical gender that has to agree turn after turn. Most global voice AI treats this as an edge case. It’s our default.',
  },
  {
    icon: 'group',
    title: 'Small team, real ownership',
    body: 'No layers between writing something and seeing it answer a live call. If you ship it, it’s yours — including when it pages you.',
  },
]

export function Careers() {
  return (
    <MarketingLayout>
      <Seo
        title="Careers — Vistrow Voice"
        description={`Work on real-time AI voice agents for Indian languages at ${BRAND.name}. See open roles, or send us your CV.`}
        path="/careers"
      />

      <section className="mx-auto max-w-3xl px-5 py-16 text-center md:px-8 lg:py-24">
        <SectionEyebrow>Careers</SectionEyebrow>
        <h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
          Build voice AI that speaks like people do.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-text-muted">
          We’re a small team making phone calls answerable by an AI that actually sounds like it’s from
          here — in ten Indian languages, in real time.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-12 md:px-8">
        <div className="grid gap-5 md:grid-cols-3">
          {WHY.map((w) => (
            <div key={w.title} className="rounded-2xl border border-border bg-surface p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
                <Icon name={w.icon} className="text-[22px]" />
              </span>
              <h2 className="mt-5 font-display text-lg font-semibold">{w.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{w.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-12 md:px-8">
        <SectionEyebrow>Open roles</SectionEyebrow>
        {OPEN_ROLES.length > 0 ? (
          <div className="mt-6 flex flex-col gap-3">
            {OPEN_ROLES.map((role) => (
              <div
                key={role.title}
                className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-6"
              >
                <div>
                  <h3 className="font-display text-lg font-semibold">{role.title}</h3>
                  <p className="mt-1 text-sm text-text-muted">
                    {role.location} · {role.type}
                  </p>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-text-muted">{role.blurb}</p>
                </div>
                <a
                  href={`mailto:${APPLY_EMAIL}?subject=${encodeURIComponent(`Application — ${role.title}`)}`}
                  className="rounded-full bg-gradient-to-br from-primary to-primary-dark px-5 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
                >
                  Apply
                </a>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-3xl border border-border bg-surface p-10 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-high text-cyan">
              <Icon name="drafts" className="text-[26px]" />
            </span>
            <h2 className="mt-5 font-display text-2xl font-semibold">No open roles right now.</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-text-muted">
              We hire in bursts, and we do read speculative applications. If you’ve built something in
              speech, real-time audio, or Indian-language NLP, tell us what you made and how — that’s
              more useful to us than a CV on its own.
            </p>
            <a
              href={`mailto:${APPLY_EMAIL}?subject=${encodeURIComponent('Speculative application')}`}
              className="mt-7 inline-block rounded-full bg-gradient-to-br from-primary to-primary-dark px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
            >
              Send us your work
            </a>
          </div>
        )}
      </section>
    </MarketingLayout>
  )
}
