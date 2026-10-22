import { Icon } from '../../components/Icon'
import { Icon3D } from '../../components/Icon3D'
import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { CTABand, SectionEyebrow } from '../../components/MarketingBits'
import { NavLink } from '../../components/MarketingLayout'
import { Reveal } from '../../components/Reveal'
import { BRAND } from '../../lib/brand'
import { SectionHead, SplitHero, SplitRow, StickyCta, TrustBand, useStickyRefs, type TrustFact } from '../../components/showcase'
import { SECURITY_HERO, SECURITY_RECORD } from './premium-w5/visuals'

// Trust facts for the violet band, each restating a control listed below.
const SECURITY_FACTS: TrustFact[] = [
  { icon: 'lock', title: 'Workspace isolation', body: 'Calls, contacts, agents, recordings and knowledge bases are scoped to your workspace.' },
  { icon: 'block', title: 'Do-Not-Call enforcement', body: 'Checked before any outbound dial leaves the platform.' },
  { icon: 'auto_delete', title: 'Configurable retention', body: 'Records older than your retention period are purged automatically.' },
  { icon: 'credit_card', title: 'No card data', body: 'Card details are entered with our payment provider, never stored by us.' },
]

// Every claim on this page maps to a control that actually exists in the
// product today (compliance settings, tenant scoping, retention purge).
// Nothing aspirational is stated as fact - the
// "Working towards" section at the bottom exists precisely so this page
// never has to overstate, and so a security reviewer gets a straight
// answer instead of discovering the gap themselves.

const CONTROLS: { icon: string; title: string; body: string }[] = [
  {
    icon: 'lock',
    title: 'Workspace isolation',
    body: 'Dashboard queries for calls, contacts, agents, recordings, and knowledge bases are scoped to the authenticated workspace. Access-control defects are treated as security incidents and investigated promptly.',
  },
  {
    icon: 'password',
    title: 'Credential handling',
    body: 'Passwords are stored only as salted hashes, never in readable form. Sessions use signed, expiring tokens in HTTP-only cookies. API keys are shown once, then stored hashed, and can be revoked at any time.',
  },
  {
    icon: 'badge',
    title: 'Role-based access',
    body: 'Team members are invited into your workspace with a role. Compliance settings, API keys, integrations and team management need an admin or owner role.',
  },
  {
    icon: 'block',
    title: 'Do-Not-Call enforcement',
    body: 'Your DNC registry is a hard block checked before any outbound dial leaves the platform. A blocked number is never dialled - a call can’t be un-rung, so the gate runs first.',
  },
  {
    icon: 'schedule',
    title: 'Calling-window rules',
    body: 'Outbound calling is restricted to the hours and days you configure. Dials attempted outside that window are refused and logged rather than placed.',
  },
  {
    icon: 'auto_delete',
    title: 'Configurable retention',
    body: 'Set a retention period and call records older than it are purged automatically - data minimisation under the DPDP Act rather than keeping everything forever by default.',
  },
  {
    icon: 'link',
    title: 'Recording access control',
    body: 'Recordings sit in private storage with no public address. Dashboard playback uses one-hour signed URLs issued to signed-in members of the owning workspace. Recording links sent to a connected CRM or spreadsheet work for anyone who holds them until they expire (90 days by default, configurable), are revoked by a workspace admin, or the recording is deleted. Links sent before link expiry was introduced in October 2026 last until revoked.',
  },
  {
    icon: 'visibility_off',
    title: 'No vendor surface',
    body: 'Our agents are built to decline questions about the underlying models and speech stack. Your callers - and your competitors - can’t extract our architecture from a conversation.',
  },
  {
    icon: 'credit_card',
    title: 'No card data',
    body: 'Card details are entered with Razorpay, our payment provider. We store only invoice and payment identifiers, never card numbers.',
  },
]

const ROADMAP = [
  'A formal SOC 2 Type II audit - not yet started; we will publish the report when it exists rather than implying it now.',
  'India-region data residency - call data is currently processed and stored outside India. If in-country residency is a requirement for you, tell us before you sign so we can be straight about timelines.',
  'A published third-party penetration-test summary.',
]

// Premium template (showcase kit): split hero with the pre-dial checks, the
// controls as a card grid with a highlighted lead, "who controls what" beside
// a saved call record, the violet trust band, the gaps and the report box.
export function Security() {
  const { heroCtaRef, endRef } = useStickyRefs()
  return (
    <MarketingLayout>
      <Seo
        title="Security & Trust - Vistrow Voice"
        description="How Vistrow Voice protects call data with workspace scoping, DNC enforcement, access controls, configurable retention, and clearly stated security limits."
        path="/security"
      />

      <SplitHero
        eyebrow="Security & trust"
        title="Phone calls are sensitive. We treat them that way."
        subhead={
          <>
            {BRAND.name} handles recordings, transcripts, and personal details captured on live calls.
            This page lists the controls that exist today - and, at the bottom, the ones that don’t yet.
          </>
        }
        visual={SECURITY_HERO}
        placement="security_hero"
        ctaRef={heroCtaRef}
      />

      <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-16">
        <Reveal>
          <SectionHead eyebrow="Controls in place" title="What protects call data today." className="mb-10" />
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CONTROLS.map((c, i) => (
            // Stagger resets every row so the delay never compounds into a
            // noticeable wait by the last card.
            <Reveal key={c.title} delayMs={(i % 3) * 70} className="h-full">
              <div
                className={`vv-lift group h-full rounded-3xl border p-6 ${
                  i === 0 ? 'border-primary/40 bg-gradient-to-br from-primary/[0.14] via-surface to-surface' : 'border-border bg-surface'
                }`}
              >
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                    i === 0 ? 'bg-gradient-to-br from-primary to-magenta text-white' : 'bg-primary/12 text-primary'
                  }`}
                >
                  <Icon3D name={c.icon} size={i === 0 ? 32 : 36} plate={i === 0} className="text-[22px]" />
                </span>
                <h3 className="mt-5 font-display text-lg font-semibold">{c.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">{c.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Who controls what - the question every serious buyer actually asks */}
      <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-16">
        <SplitRow figure={SECURITY_RECORD} className="">
        <div className="rounded-3xl border border-border bg-surface p-8 sm:p-10">
          <SectionEyebrow>Who controls what</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">Your data stays yours.</h2>
          <div className="mt-8 grid gap-8">
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
                We process that data to run the service you configured - nothing else. We don’t sell it,
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
        </SplitRow>
      </section>

      <TrustBand
        eyebrow="Security & trust"
        title="Controls that run on every call."
        body="Each of these is a setting or a rule in the product today, listed in full above."
        facts={SECURITY_FACTS}
        placement="security_trust_band"
        link={null}
      />
      <div className="h-16" />

      {/* Honesty section - deliberately load-bearing, not a disclaimer */}
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

      <div ref={endRef} />
      <CTABand />
      <StickyCta heroCtaRef={heroCtaRef} endRef={endRef} />
    </MarketingLayout>
  )
}
