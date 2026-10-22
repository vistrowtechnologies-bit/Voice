import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { SectionEyebrow } from '../../components/MarketingBits'
import { BRAND } from '../../lib/brand'
import { Bento, SectionHead, SplitHero } from '../../components/showcase'
import { CAREERS_CALLS, CAREERS_HERO } from './premium-w5/visuals'

// Add roles here as they open. An empty array is a supported, deliberate
// state - the page renders an honest "nothing open right now, send us your
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
    body: 'A chatbot can take two seconds to think. A phone call can’t. Everything here is judged on whether it feels natural at real-time latency - that constraint makes the engineering genuinely hard.',
  },
  {
    icon: 'translate',
    title: 'Built for how India talks',
    body: 'More than 130 languages, mid-sentence code-switching, and grammatical gender that has to agree turn after turn. Most global voice AI treats this as an edge case. It’s our default.',
  },
  {
    icon: 'group',
    title: 'Small team, real ownership',
    body: 'No layers between writing something and seeing it answer a live call. If you ship it, it’s yours - including when it pages you.',
  },
]

export function Careers() {
  return (
    <MarketingLayout>
      <Seo
        title="Careers - Vistrow Voice"
        description={`Work on real-time AI voice agents for Indian languages at ${BRAND.name}. See open roles, or send us your CV.`}
        path="/careers"
      />

      {/* Premium template (showcase kit): split hero with the language-switch
          visual, the reasons as a bento around a calls view, then open roles. */}
      <SplitHero
        eyebrow="Careers"
        title="Build voice AI that speaks like people do."
        subhead={
          <>
            We’re a small team making phone calls answerable by an AI that actually sounds like it’s from
            here - in more than 130 languages, in real time.
          </>
        }
        visual={CAREERS_HERO}
        actions={
          <>
            <a
              href="#open-roles"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-dark px-6 py-3 text-sm font-bold text-white shadow-[0_14px_36px_-14px_rgba(147,51,234,0.8)] transition-transform hover:-translate-y-0.5"
            >
              <Icon name="work" className="text-[18px]" />
              See open roles
            </a>
            <a
              href={`mailto:${APPLY_EMAIL}?subject=${encodeURIComponent('Speculative application')}`}
              className="inline-flex items-center justify-center rounded-full border border-border bg-surface/70 px-6 py-3 text-sm font-bold text-text backdrop-blur transition-colors hover:border-primary hover:text-primary"
            >
              Send us your work
            </a>
          </>
        }
        trust={
          <p className="mt-5 max-w-xl text-sm text-text-muted">
            Read{' '}
            <Link to="/about" className="font-semibold text-primary hover:underline">about Vistrow Voice and how we build</Link>
            , or see{' '}
            <Link to="/changelog" className="font-semibold text-primary hover:underline">what we shipped recently</Link>.
          </p>
        }
      />

      <Bento visual={CAREERS_CALLS} items={WHY} head={<SectionHead eyebrow="Why work here" title="Hard problems, close to real calls." />} />

      <section id="open-roles" className="mx-auto max-w-3xl scroll-mt-28 px-5 pb-20 pt-6 md:px-8">
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
                  href={`mailto:${APPLY_EMAIL}?subject=${encodeURIComponent(`Application - ${role.title}`)}`}
                  className="rounded-full bg-gradient-to-br from-primary to-primary-dark px-5 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
                >
                  Apply
                </a>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-[2rem] border border-primary/25 bg-gradient-to-br from-primary/[0.12] via-surface to-surface p-10 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-high text-cyan">
              <Icon name="drafts" className="text-[26px]" />
            </span>
            <h2 className="mt-5 font-display text-2xl font-semibold">No open roles right now.</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-text-muted">
              We hire in bursts, and we do read speculative applications. If you’ve built something in
              speech, real-time audio, or Indian-language NLP, tell us what you made and how - that’s
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
