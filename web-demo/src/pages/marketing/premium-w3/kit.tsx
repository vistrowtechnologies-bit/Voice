import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../../../components/Icon'
import { TalkToArthaButton } from '../../../components/MarketingBits'
import { BookDemoLink, Reveal, RiskReducers, SectionHead, TALK_CLASS } from '../../../components/showcase'

// Wave-3 additions to the showcase kit, kept beside the templates that use
// them (the shared kit folder is claimed by every wave).

export interface RailStep {
  /** Optional short title; when absent the body is the step. */
  title?: string
  body: ReactNode
  icon?: string
}

const RAIL_COLS: Record<number, string> = { 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5' }

/** Numbered steps on a gradient line for any 3 to 5 steps, titled or not:
 * horizontal from lg, vertical on phones. */
export function StepRail({
  eyebrow,
  title,
  intro,
  steps,
  footer,
  className = 'py-14 lg:py-20',
}: {
  eyebrow: string
  title: ReactNode
  intro?: ReactNode
  steps: RailStep[]
  footer?: ReactNode
  className?: string
}) {
  return (
    <section className={`mx-auto max-w-7xl px-5 md:px-8 ${className}`}>
      <Reveal>
        <SectionHead eyebrow={eyebrow} title={title} intro={intro} />
      </Reveal>
      <div className="relative mt-12">
        <span aria-hidden="true" className="absolute bottom-6 left-[23px] top-6 w-0.5 bg-gradient-to-b from-primary via-magenta to-cyan lg:hidden" />
        <span aria-hidden="true" className="absolute left-6 right-6 top-[23px] hidden h-0.5 bg-gradient-to-r from-primary via-magenta to-cyan lg:block" />
        <ol className={`relative grid gap-8 lg:gap-6 ${RAIL_COLS[steps.length] ?? 'lg:grid-cols-4'}`}>
          {steps.map((step, i) => (
            <li key={i} className="relative pl-16 lg:pl-0">
              <Reveal delayMs={i * 80}>
                <span className="absolute left-0 top-0 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-magenta font-display text-lg font-bold text-white shadow-[0_10px_24px_-10px_rgba(168,85,247,0.9)] ring-4 ring-bg lg:relative">
                  {i + 1}
                </span>
                <div className="lg:mt-6">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-text-muted">
                    <Icon name={step.icon ?? 'arrow_forward'} className="text-[14px] text-primary" />
                    Step {i + 1}
                  </span>
                  {step.title ? (
                    <>
                      <h3 className="mt-3 font-display text-lg font-semibold">{step.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-text-muted">{step.body}</p>
                    </>
                  ) : (
                    <p className="mt-3 text-[15px] leading-relaxed text-text">{step.body}</p>
                  )}
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
      {footer}
    </section>
  )
}

/** A comparison table in a rounded card with the Vistrow column tinted. */
export function TableCard({ children, note, minWidth = 'min-w-[720px]' }: { children: ReactNode; note?: ReactNode; minWidth?: string }) {
  return (
    <Reveal>
      <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-[0_30px_60px_-44px_rgba(76,29,149,0.55)]">
        <div className="overflow-x-auto">
          <table className={`w-full ${minWidth} border-collapse text-left text-sm`}>{children}</table>
        </div>
      </div>
      {note && <p className="mt-3 text-xs leading-relaxed text-text-muted">{note}</p>}
    </Reveal>
  )
}

/** Card links to further reading, with an arrow, the first one tinted. */
export function LinkCards({ items }: { items: { to: string; title: string; body?: ReactNode }[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {items.map((item, i) => (
        <li key={item.to}>
          <Reveal delayMs={(i % 2) * 60} className="h-full">
            <Link
              to={item.to}
              className={`vv-lift group flex h-full items-start justify-between gap-4 rounded-3xl border p-6 ${
                i === 0 ? 'border-primary/40 bg-gradient-to-br from-primary/[0.12] via-surface to-surface' : 'border-border bg-surface'
              }`}
            >
              <span>
                <span className="block font-display text-base font-semibold text-text group-hover:text-primary">{item.title}</span>
                {item.body && <span className="mt-1.5 block text-sm leading-relaxed text-text-muted">{item.body}</span>}
              </span>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary transition-transform group-hover:translate-x-1">
                <Icon name="arrow_forward" className="text-[18px]" />
              </span>
            </Link>
          </Reveal>
        </li>
      ))}
    </ul>
  )
}

/** Pill links to related pages ("Keep exploring"). */
export function RelatedPills({ label, items }: { label: string; items: { to: string; label: string }[] }) {
  return (
    <section className="mx-auto max-w-7xl px-5 pb-8 md:px-8">
      <div className="rounded-3xl border border-border bg-surface/60 px-6 py-7">
        <p className="text-center text-xs font-bold uppercase tracking-widest text-text-muted">{label}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {items.map((r) => (
            <Link
              key={r.to}
              to={r.to}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-4 py-1.5 text-sm text-text-muted transition-colors hover:border-primary hover:text-text"
            >
              {r.label}
              <Icon name="arrow_forward" className="text-[14px]" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

/** Full-width violet band with a heading, body and both CTAs (mid-page). */
export function VioletBand({ eyebrow, title, body, placement, aside }: { eyebrow: string; title: ReactNode; body: ReactNode; placement: string; aside?: ReactNode }) {
  return (
    <section className="px-5 md:px-8">
      <div className="bento-hero relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-cyan/25 blur-[100px]" />
        <div className={`relative grid gap-10 ${aside ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center' : ''}`}>
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-white/75">{eyebrow}</span>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-white text-balance sm:text-4xl">{title}</h2>
            <p className="mt-4 max-w-3xl text-white/85">{body}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <TalkToArthaButton className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-[#4c1d95] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" />
              <BookDemoLink
                placement={placement}
                className="inline-flex items-center justify-center rounded-full border border-white/35 bg-white/10 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              />
            </div>
          </div>
          {aside}
        </div>
      </div>
    </section>
  )
}

/** A slim "try it" bar with both CTAs, for between sections. */
export function CtaStrip({ title, placement }: { title: string; placement: string }) {
  return (
    <Reveal className="mt-10">
      <div className="flex flex-col items-start justify-between gap-5 rounded-3xl border border-primary/25 bg-gradient-to-r from-primary/[0.10] via-surface to-surface p-6 sm:flex-row sm:items-center sm:p-8">
        <div>
          <p className="font-display text-xl font-bold">{title}</p>
          <RiskReducers className="mt-2" />
        </div>
        <div className="flex flex-wrap gap-3">
          <TalkToArthaButton className={TALK_CLASS} />
          <BookDemoLink placement={placement} />
        </div>
      </div>
    </Reveal>
  )
}

/** Check-mark bullet list used inside rows and cards. */
export function CheckList({ items, className = 'mt-5 space-y-2.5' }: { items: ReactNode[]; className?: string }) {
  return (
    <ul className={className}>
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-text-muted">
          <Icon name="check_circle" className="mt-0.5 shrink-0 text-[17px] text-cyan" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}
