import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../../../components/Icon'
import { Icon3D } from '../../../components/Icon3D'
import { SectionEyebrow } from '../../../components/MarketingBits'
import { IconTile, Reveal, SectionHead, Shot } from '../../../components/showcase'
import type { PageFigureData } from '../../../lib/pageFigures'
import arthaAvatar from '../../../assets/artha-avatar.webp'

// Wave 2 additions to the premium marketing kit (components/showcase/), used
// by the six category landing pages. They only compose the shared kit and
// its classes; nothing here changes a shared component.

export const LINK_CLASS = 'font-semibold text-primary underline-offset-4 hover:underline'

/** A standard page section: max width, side gutter and vertical rhythm. */
export function Section({ children, className = 'py-14 lg:py-16', id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`mx-auto max-w-7xl px-5 md:px-8 ${className}`}>
      {children}
    </section>
  )
}

export interface BadgeStep {
  icon?: string
  /** Shown in the pill above the title: a time of day, or "Step 2". */
  badge: string
  title: string
  body: ReactNode
}

/** Numbered steps on a gradient line with a free-text badge per step (a time
 * of day, a week), horizontal from lg and vertical on phones. */
export function BadgeTimeline({ steps, numbered = true }: { steps: BadgeStep[]; numbered?: boolean }) {
  const cols = steps.length >= 6 ? 'lg:grid-cols-6' : steps.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'
  return (
    <div className="relative">
      <span aria-hidden="true" className="absolute bottom-6 left-[23px] top-6 w-0.5 bg-gradient-to-b from-primary via-magenta to-cyan lg:hidden" />
      <span aria-hidden="true" className="absolute left-6 right-6 top-[23px] hidden h-0.5 bg-gradient-to-r from-primary via-magenta to-cyan lg:block" />
      <ol className={`relative grid gap-8 ${cols} lg:gap-6`}>
        {steps.map((step, i) => (
          <li key={step.title} className="relative pl-16 lg:pl-0">
            <Reveal delayMs={i * 80}>
              <span className="absolute left-0 top-0 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-magenta font-display text-lg font-bold text-white shadow-[0_10px_24px_-10px_rgba(168,85,247,0.9)] ring-4 ring-bg lg:relative">
                {numbered || !step.icon ? <span aria-hidden="true">{i + 1}</span> : <Icon3D name={step.icon} size={34} plate className="text-[22px]" />}
              </span>
              <div className="lg:mt-6">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-text-muted">
                  {step.icon && <Icon name={step.icon} className="text-[14px] text-primary" />}
                  {step.badge}
                </span>
                <h3 className="mt-3 font-display text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">{step.body}</p>
              </div>
            </Reveal>
          </li>
        ))}
      </ol>
    </div>
  )
}

export interface CallTurn {
  agent: boolean
  /** Speaker label shown above the line ("Agent", "Caller", "Voice bot"). */
  label: string
  text: string
  /** English gloss under the line, for non-English samples. */
  gloss?: string
}

/** A written sample call as a phone-style chat: agent lines on the left in
 * violet, caller lines on the right. */
export function SampleCall({
  eyebrow,
  title,
  titleAs: Title = 'h3',
  intro,
  badge,
  turns,
  lang,
  outcome,
  outcomeIcon = 'task_alt',
}: {
  eyebrow?: string
  title: ReactNode
  titleAs?: 'h2' | 'h3'
  intro?: ReactNode
  badge?: string
  turns: CallTurn[]
  lang?: string
  outcome?: ReactNode
  outcomeIcon?: string
}) {
  return (
    <figure className="overflow-hidden rounded-3xl border border-border bg-surface shadow-[0_30px_60px_-44px_rgba(76,29,149,0.55)]">
      <figcaption className="border-b border-border bg-gradient-to-br from-primary/[0.10] via-surface-high to-surface-high p-6 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {eyebrow ? <SectionEyebrow>{eyebrow}</SectionEyebrow> : <span />}
          {badge && <span className="rounded-full border border-cyan/30 bg-cyan/10 px-3 py-1 text-xs font-bold text-cyan">{badge}</span>}
        </div>
        <Title className="mt-3 font-display text-xl font-bold tracking-tight sm:text-2xl">{title}</Title>
        {intro && <p className="mt-2 text-sm leading-relaxed text-text-muted">{intro}</p>}
      </figcaption>
      <ol className="space-y-3 p-5 sm:p-7">
        {turns.map((turn, i) => (
          <li key={i} className={`flex gap-3 ${turn.agent ? '' : 'flex-row-reverse'}`}>
            {turn.agent ? (
              <img src={arthaAvatar} alt="" width={36} height={36} loading="lazy" className="mt-1 h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-primary/30" />
            ) : (
              <span aria-hidden="true" className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-high text-text-muted">
                <Icon name="person" className="text-[18px]" />
              </span>
            )}
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                turn.agent ? 'rounded-tl-sm border border-primary/25 bg-primary/[0.07]' : 'rounded-tr-sm border border-border bg-surface-high/70'
              }`}
            >
              <span className="mb-0.5 block text-[11px] font-bold uppercase tracking-widest text-text-muted">{turn.label}</span>
              <p lang={lang} className="text-text">{turn.text}</p>
              {turn.gloss && <p className="mt-1 italic text-text-muted">{turn.gloss}</p>}
            </div>
          </li>
        ))}
      </ol>
      {outcome && (
        <div className="flex items-start gap-3 border-t border-border bg-surface-high/40 px-6 py-4 text-sm leading-relaxed text-text-muted sm:px-7">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-success/15 text-success">
            <Icon name={outcomeIcon} className="text-[18px]" />
          </span>
          <span className="self-center">{outcome}</span>
        </div>
      )}
    </figure>
  )
}

/** A list of short statements with a tick, in a violet tile, a cyan-edged card or a plain card. */
export function CheckPanel({
  title,
  titleAs: Title = 'h3',
  items,
  icon = 'check_circle',
  tone = 'plain',
  head,
  children,
  className = '',
}: {
  title?: ReactNode
  titleAs?: 'h2' | 'h3'
  /** Free content above the list (eyebrow, heading and intro) instead of `title`. */
  head?: ReactNode
  items: ReactNode[]
  icon?: string
  tone?: 'violet' | 'plain' | 'cyan'
  children?: ReactNode
  className?: string
}) {
  const violet = tone === 'violet'
  const box = violet
    ? 'bento-hero shadow-[0_24px_50px_-30px_rgba(76,29,149,0.9)]'
    : tone === 'cyan'
      ? 'border border-cyan/30 bg-gradient-to-br from-cyan/[0.08] via-surface to-surface'
      : 'border border-border bg-surface'
  return (
    <div className={`relative h-full overflow-hidden rounded-3xl p-6 sm:p-8 ${box} ${className}`}>
      {head}
      {title && <Title className={`font-display text-xl font-semibold ${violet ? 'text-white' : ''}`}>{title}</Title>}
      <ul className={`${title || head ? 'mt-5' : ''} space-y-3 text-sm leading-relaxed ${violet ? 'text-white/90' : 'text-text-muted'}`}>
        {items.map((item, i) => (
          <li key={i} className="flex gap-3">
            <Icon name={icon} className={`mt-0.5 shrink-0 text-[18px] ${violet ? 'text-white' : tone === 'cyan' ? 'text-cyan' : 'text-primary'}`} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      {children}
    </div>
  )
}

/** A card with a product image on top and text below, for two or three channels side by side. */
export function MediaCard({
  figure,
  icon,
  title,
  body,
  to,
  link,
}: {
  figure: PageFigureData
  icon: string
  title: string
  body: ReactNode
  to?: string
  link?: string
}) {
  return (
    <div className="vv-lift flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-surface">
      <div className="relative bg-panel p-3 sm:p-4">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/25 blur-[80px]" />
        <Shot figure={figure} sizes="(min-width: 1280px) 600px, (min-width: 1024px) 46vw, calc(100vw - 40px)" className="relative rounded-xl" />
      </div>
      <div className="flex flex-1 flex-col p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <IconTile name={icon} strong size="sm" />
          <h3 className="font-display text-xl font-semibold">{title}</h3>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-text-muted">{body}</p>
        {to && link && (
          <Link to={to} className={`mt-auto inline-flex min-h-11 items-center gap-1 pt-4 text-sm sm:min-h-0 ${LINK_CLASS}`}>
            {link}
            <Icon name="arrow_forward" className="text-[16px]" />
          </Link>
        )}
      </div>
    </div>
  )
}

/** A tinted band with copy on the left and actions on the right (get started, cost). */
export function ActionBand({ eyebrow, title, body, actions }: { eyebrow: string; title: ReactNode; body: ReactNode; actions: ReactNode }) {
  return (
    <Section className="py-10 lg:py-12">
      <Reveal>
        <div className="relative overflow-hidden rounded-[2rem] border border-primary/25 bg-gradient-to-r from-primary/[0.12] via-surface to-surface p-7 sm:p-10">
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/20 blur-[100px]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <SectionEyebrow>{eyebrow}</SectionEyebrow>
              <h2 className="mt-3 font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-text-muted sm:text-base">{body}</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">{actions}</div>
          </div>
        </div>
      </Reveal>
    </Section>
  )
}

/** "Where it does not replace your team": heading on the left, boundary cards on the right. */
export function BoundaryBand({ eyebrow, title, intro, items }: { eyebrow: string; title: ReactNode; intro?: ReactNode; items: ReactNode[] }) {
  return (
    <section className="px-5 py-6 md:px-8">
      <div className="mx-auto grid max-w-7xl gap-8 rounded-[2rem] border border-border bg-surface-high/50 px-6 py-12 sm:px-10 lg:grid-cols-[0.7fr_1.3fr] lg:items-start lg:px-14 lg:py-14">
        <Reveal>
          <SectionEyebrow>{eyebrow}</SectionEyebrow>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance">{title}</h2>
          {intro && <p className="mt-4 text-sm leading-relaxed text-text-muted">{intro}</p>}
        </Reveal>
        <div className="grid gap-3">
          {items.map((item, i) => (
            <Reveal key={i} delayMs={i * 70}>
              <div className="flex gap-4 rounded-2xl border border-border bg-surface p-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan/10 text-cyan">
                  <Icon3D name="shield" size={30} className="text-[20px]" />
                </span>
                <p className="self-center text-sm leading-relaxed text-text-muted">{item}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/** A section heading plus a styled two- or three-column table. */
export function TableCard({ children, minWidth = '' }: { children: ReactNode; minWidth?: string }) {
  return (
    <Reveal>
      <div className="overflow-x-auto rounded-3xl border border-border bg-surface shadow-[0_30px_60px_-48px_rgba(76,29,149,0.55)]">
        <table className={`w-full border-collapse text-left text-sm ${minWidth}`}>{children}</table>
      </div>
    </Reveal>
  )
}

export { SectionHead }
