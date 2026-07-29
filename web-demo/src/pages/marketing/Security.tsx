import { Icon } from '../../components/Icon'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { CTABand, SectionEyebrow } from '../../components/MarketingBits'
import { NavLink } from '../../components/MarketingLayout'
import { Reveal } from '../../components/Reveal'
import { BRAND } from '../../lib/brand'

// Every claim on this page maps to a control that actually exists in the
// product today (compliance settings, tenant scoping, retention purge,
// consent capture). Nothing aspirational is stated as fact — the
// "Working towards" section at the bottom exists precisely so this page
// never has to overstate, and so a security reviewer gets a straight
// answer instead of discovering the gap themselves.

const CONTROLS: { icon: string; title: string; body: string }[] = [
  {
    icon: 'lock',
    title: 'Workspace isolation',
    body: 'Every record — calls, contacts, agents, recordings, knowledge bases — is scoped to your workspace at the query layer. One tenant’s data is never reachable from another tenant’s session.',
  },
  {
    icon: 'password',
    title: 'Credential handling',
    body: 'Passwords are stored only as salted hashes, never in readable form. Sessions use signed, expiring tokens in HTTP-only cookies. API keys are shown once, then stored hashed, and can be revoked at any time.',
  },
  {
    icon: 'badge',
    title: 'Role-based access',
    body: 'Team members are invited into your workspace with a role. Only owners can change billing, compliance settings, and destructive configuration.',
  },
  {
    icon: 'record_voice_over',
    title: 'Spoken consent capture',
    body: 'Agents can be required to open every call with a consent line, with the caller’s reply captured in the transcript — so consent is evidenced, not assumed.',
  },
  {
    icon: 'block',
    title: 'Do-Not-Call enforcement',
    body: 'Your DNC registry is a hard block checked before any outbound dial leaves the platform. A blocked number is never dialled — a call can’t be un-rung, so the gate runs first.',
  },
  {
    icon: 'schedule',
    title: 'Calling-window rules',
    body: 'Outbound calling is restricted to the hours and days you configure. Dials attempted outside that window are refused and logged rather than placed.',
  },
  {
    icon: 'auto_delete',
    title: 'Configurable retention',
    body: 'Set a retention period and call records older than it are purged automatically — data minimisation under the DPDP Act rather than keeping everything forever by default.',
  },
  {
    icon: 'link',
    title: 'Recording access control',
    body: 'Call recordings are not publicly addressable. Playback goes through short-lived signed URLs issued only to authenticated members of the owning workspace.',
  },
  {
    icon: 'visibility_off',
    title: 'No vendor surface',
    body: 'Our agents are built to decline questions about the underlying models and speech stack. Your callers — and your competitors — can’t extract our architecture from a conversation.',
  },
  {
    icon: 'credit_card',
    title: 'No card data',
    body: 'Payments are handled by our payment processor. Full card numbers never reach, and are never stored on, Vistrow Voice infrastructure.',
  },
]

const ROADMAP = [
  'A formal SOC 2 Type II audit — not yet started; we will publish the report when it exists rather than implying it now.',
  'India-region data residency — call data is currently processed and stored outside India. If in-country residency is a requirement for you, tell us before you sign so we can be straight about timelines.',
  'A published third-party penetration-test summary.',
]

export function Security() {
  return (
    <MarketingLayout>
      <Seo
        title="Security & Trust — Vistrow Voice"
        description="How Vistrow Voice protects call recordings, transcripts, and customer data: workspace isolation, consent capture, DNC enforcement, configurable retention, and what we don't yet claim."
        path="/security"
      />

      <section className="mx-auto max-w-3xl px-5 py-16 text-center md:px-8 lg:py-24">
        <SectionEyebrow>Security &amp; trust</SectionEyebrow>
        <h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
          Phone calls are sensitive. We treat them that way.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-text-muted">
          {BRAND.name} handles recordings, transcripts, and personal details captured on live calls.
          This page lists the controls that exist today — and, at the bottom, the ones that don’t yet.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-8 md:px-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CONTROLS.map((c, i) => (
            // Stagger resets every row so the delay never compounds into a
            // noticeable wait by the last card.
            <Reveal key={c.title} delayMs={(i % 3) * 70} className="h-full">
              <div className="group h-full rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-primary/60">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary transition-transform group-hover:scale-105">
                  <Icon name={c.icon} className="text-[22px]" />
                </span>
                <h2 className="mt-5 font-display text-lg font-semibold">{c.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">{c.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Who controls what — the question every serious buyer actually asks */}
      <section className="mx-auto max-w-7xl px-5 py-16 md:px-8">
        <div className="rounded-3xl border border-border bg-surface p-8 sm:p-10">
          <SectionEyebrow>Who controls what</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Your data stays yours.</h2>
          <div className="mt-8 grid gap-8 md:grid-cols-2">
            <div>
              <h3 className="flex items-center gap-2 font-display text-base font-semibold">
                <Icon name="business" className="text-[20px] text-cyan" />
                You are the controller
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                You decide who gets called, what the agent says, what it captures, and how long any of
                it is kept. Recordings, transcripts, and lead data belong to your business.
              </p>
            </div>
            <div>
              <h3 className="flex items-center gap-2 font-display text-base font-semibold">
                <Icon name="dns" className="text-[20px] text-cyan" />
                We are the processor
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                We process that data to run the service you configured — nothing else. We don’t sell it,
                and we don’t use your call content to train models for other customers.
              </p>
            </div>
          </div>
          <p className="mt-8 border-t border-border pt-6 text-sm text-text-muted">
            The full legal detail lives in our{' '}
            <NavLink to="/privacy" className="text-cyan hover:underline">Privacy Policy</NavLink> and{' '}
            <NavLink to="/terms" className="text-cyan hover:underline">Terms</NavLink>.
          </p>
        </div>
      </section>

      {/* Honesty section — deliberately load-bearing, not a disclaimer */}
      <section className="mx-auto max-w-7xl px-5 pb-16 md:px-8">
        <div className="rounded-3xl border border-amber/40 bg-amber/[0.06] p-8 sm:p-10">
          <SectionEyebrow>What we don’t claim yet</SectionEyebrow>
          <h2 className="mt-3 font-display text-2xl font-bold tracking-tight">
            The gaps, stated plainly.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-muted">
            Plenty of vendors imply certifications they don’t hold. We’d rather you find out here than
            in a procurement review.
          </p>
          <ul className="mt-6 flex flex-col gap-3">
            {ROADMAP.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm leading-relaxed text-text-muted">
                <Icon name="pending" className="mt-0.5 text-[18px] text-amber" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-4 md:px-8">
        <div className="rounded-2xl border border-border bg-surface/50 p-8 text-center">
          <h2 className="font-display text-xl font-bold">Found a vulnerability?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-muted">
            Report it to us privately and we’ll acknowledge it. Please don’t test against live tenant
            data or place real calls as part of any testing.
          </p>
          <a
            href="mailto:vistrowai@gmail.com?subject=Security%20report"
            className="mt-5 inline-block rounded-full border border-border px-6 py-2.5 text-sm font-bold text-text transition-colors hover:border-primary"
          >
            Report a security issue
          </a>
        </div>
      </section>

      <CTABand />
    </MarketingLayout>
  )
}
