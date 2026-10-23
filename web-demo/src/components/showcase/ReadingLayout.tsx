import { useState, type ReactNode, type Ref } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../Icon'
import { Icon3D } from '../Icon3D'
import { CTABand, SectionEyebrow, TalkToArthaButton } from '../MarketingBits'
import { NavLink } from '../MarketingLayout'
import { BookDemoLink, LiveDot, ShowcaseStyles } from './primitives'
import { StickyCta, useStickyRefs } from './StickyCta'
import { TALK_CLASS } from './utils'
import arthaAvatar from '../../assets/artha-avatar.webp'

// Reading pages (help, docs, changelog, legal): the kit's eyebrow and Sora
// H1, a text column capped near 75 characters a line (54ch of Manrope), and
// a sticky aside with search, contents, the section's pages and an Artha
// card. On phones the aside becomes a compact disclosure above the text
// instead of a long tail under it.

export interface Crumb {
  label: string
  to?: string
}

export interface TocItem {
  id: string
  label: string
}

export interface ReadingLink {
  label: string
  to: string
  /** Small line above the label (e.g. the topic of a cross-topic link). */
  kicker?: string
  body?: string
  icon?: string
  current?: boolean
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-x-2 text-sm text-text-muted">
      {items.map((c, i) => (
        <span key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-2">
          {i > 0 && <span aria-hidden="true">/</span>}
          {c.to ? (
            <Link to={c.to} className="inline-flex min-h-[44px] items-center hover:text-text">
              {c.label}
            </Link>
          ) : (
            <span aria-current="page" className="line-clamp-1 text-text">
              {c.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}

/** Compact kit hero: breadcrumbs, eyebrow, the page's only H1, lede and optional actions. */
export function ReadingHero({
  crumbs,
  eyebrow,
  title,
  lede,
  meta,
  actions,
  heroRef,
}: {
  crumbs?: Crumb[]
  eyebrow: string
  title: ReactNode
  lede?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  heroRef?: Ref<HTMLDivElement>
}) {
  return (
    <section className="relative overflow-hidden">
      <ShowcaseStyles />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -right-40 -top-24 h-[420px] w-[560px] rounded-full bg-primary/15 blur-[120px]" />
        <div className="absolute right-[22%] top-[40%] h-[240px] w-[320px] rounded-full bg-magenta/10 blur-[110px]" />
      </div>
      <div ref={heroRef} className="mx-auto max-w-7xl px-5 pb-10 pt-6 md:px-8 lg:pb-12 lg:pt-8">
        {crumbs && <Breadcrumbs items={crumbs} />}
        <div className={`max-w-3xl ${crumbs ? 'mt-4' : 'mt-6'}`}>
          <SectionEyebrow>{eyebrow}</SectionEyebrow>
          <h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight text-balance sm:text-5xl lg:text-[52px]">
            {title}
          </h1>
          {lede && <p className="mt-5 max-w-2xl text-lg leading-relaxed text-text-muted">{lede}</p>}
          {meta && <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-muted">{meta}</div>}
          {actions && <div className="mt-8 flex flex-wrap gap-3">{actions}</div>}
        </div>
      </div>
    </section>
  )
}

/** "Talk to Artha live" + "Book a demo", with a sign-in line for existing customers. */
export function ArthaCard({ placement = 'reading_aside' }: { placement?: string }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/[0.14] via-surface to-surface p-5 shadow-[0_30px_60px_-44px_rgba(76,29,149,0.55)]">
      <div className="flex items-center gap-3">
        <img src={arthaAvatar} alt="" width={40} height={40} loading="lazy" className="h-10 w-10 rounded-full object-cover" />
        <div>
          <p className="flex items-center gap-2 font-display text-base font-semibold text-text">
            Artha <LiveDot />
          </p>
          <p className="text-xs text-text-muted">AI voice agent, live now</p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-text-muted">
        Hear an AI agent handle a real call in your browser. No signup needed.
      </p>
      <div className="mt-4 flex flex-col gap-2.5">
        <TalkToArthaButton className={`${TALK_CLASS} w-full`} />
        <BookDemoLink placement={placement} className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full border border-border bg-surface/70 px-6 text-sm font-bold text-text transition-colors hover:border-primary hover:text-primary" />
      </div>
      <p className="mt-3 text-center text-xs text-text-muted">
        Already a customer?{' '}
        <NavLink to="/login" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center font-semibold text-primary hover:underline">
          Sign in
        </NavLink>
      </p>
    </div>
  )
}

function Toc({ items, title = 'On this page' }: { items: TocItem[]; title?: string }) {
  return (
    <nav aria-label={title}>
      <p className="px-3 text-xs font-bold uppercase tracking-widest text-text-muted">{title}</p>
      <ol className="mt-2 border-l border-border">
        {items.map((t) => (
          <li key={t.id}>
            <a href={`#${t.id}`} className="-ml-px flex min-h-[44px] items-center border-l border-transparent py-1.5 pl-3 text-sm leading-snug text-text-muted hover:border-primary hover:text-text">
              {t.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

function SectionNav({ title, items }: { title: string; items: ReadingLink[] }) {
  return (
    <nav aria-label={title}>
      <p className="px-3 text-xs font-bold uppercase tracking-widest text-text-muted">{title}</p>
      <ul className="mt-2 flex flex-col gap-0.5">
        {items.map((l) => (
          <li key={l.to}>
            <Link
              to={l.to}
              aria-current={l.current ? 'page' : undefined}
              className={`flex min-h-[44px] items-center gap-2.5 rounded-xl px-3 py-2 text-sm leading-snug ${
                l.current ? 'bg-primary/10 font-semibold text-primary' : 'text-text-muted hover:bg-surface-high hover:text-text'
              }`}
            >
              {l.icon && <Icon name={l.icon} className="shrink-0 text-[18px] text-primary" />}
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group rounded-2xl border border-border bg-surface">
      <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-text [&::-webkit-details-marker]:hidden">
        {label}
        <Icon name="expand_more" className="text-[20px] text-text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-5 border-t border-border px-1 py-4">{children}</div>
    </details>
  )
}

/**
 * The reading template, laid out like a docs site. The title sits at the top
 * of the text column so the side columns start level with it.
 * - With `sidebar` (help): three columns from xl (left nav, text, contents +
 *   Artha card), two from lg (the contents move to a disclosure), and a
 *   "Browse" disclosure on phones.
 * - Without: a centred text column beside one sticky aside.
 * `children` is capped at 54ch (about 75 characters a line) unless `wide`;
 * wide pages cap their own prose so media can use the full column. `after`
 * goes under it (prev/next, related). The closing CTA band and the phone
 * sticky CTA come last unless `cta` is false.
 */
export function ReadingLayout({
  crumbs,
  eyebrow,
  title,
  lede,
  meta,
  heroActions,
  search,
  sidebar,
  sidebarLabel = 'Browse',
  toc,
  tocTitle,
  nav,
  asideCard,
  mobileLabel = 'In this section',
  wide = false,
  children,
  after,
  cta = {},
  placement = 'reading_aside',
}: {
  crumbs?: Crumb[]
  eyebrow: string
  title: ReactNode
  lede?: ReactNode
  meta?: ReactNode
  heroActions?: ReactNode
  search?: ReactNode
  /** Left navigation column (all topics); search goes above it. */
  sidebar?: ReactNode
  sidebarLabel?: string
  toc?: TocItem[]
  tocTitle?: string
  nav?: { title: string; items: ReadingLink[] }
  /** Replaces the Artha card in the aside (e.g. a contact card on legal pages). */
  asideCard?: ReactNode
  mobileLabel?: string
  wide?: boolean
  children: ReactNode
  after?: ReactNode
  cta?: false | { title?: string; subtitle?: string; eyebrow?: string }
  placement?: string
}) {
  const { heroCtaRef, endRef } = useStickyRefs()
  const hasToc = Boolean(toc && toc.length > 1)
  const hasNav = Boolean(nav && nav.items.length)
  const three = Boolean(sidebar)
  const sectionLinks = (
    <>
      {hasToc && <Toc items={toc!} title={tocTitle} />}
      {hasNav && <SectionNav title={nav!.title} items={nav!.items} />}
    </>
  )
  const sticky = 'sticky top-28 flex max-h-[calc(100vh-8rem)] flex-col gap-6 overflow-y-auto pb-2 pr-1'

  return (
    <div className="relative">
      <ShowcaseStyles />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] overflow-hidden">
        <div className="absolute -right-40 -top-24 h-[420px] w-[560px] rounded-full bg-primary/15 blur-[120px]" />
        <div className="absolute right-[22%] top-[40%] h-[240px] w-[320px] rounded-full bg-magenta/10 blur-[110px]" />
      </div>
      <div className="mx-auto max-w-7xl px-5 pb-6 pt-6 md:px-8 lg:pt-8">
        <div
          className={`grid gap-8 ${
            three
              ? 'lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[248px_minmax(0,1fr)_248px]'
              : 'lg:grid-cols-[minmax(0,38rem)_300px] lg:justify-center lg:gap-16'
          }`}
        >
          {three && (
            <aside className="hidden lg:block">
              <div className={sticky}>
                {search}
                {sidebar}
              </div>
            </aside>
          )}

          <div className="min-w-0">
            <div ref={heroCtaRef}>
              {crumbs && <Breadcrumbs items={crumbs} />}
              <div className={crumbs ? 'mt-4' : 'mt-6'}>
                <SectionEyebrow>{eyebrow}</SectionEyebrow>
                <h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight text-balance sm:text-5xl lg:text-[52px]">
                  {title}
                </h1>
                {lede && <p className="mt-5 max-w-2xl text-lg leading-relaxed text-text-muted">{lede}</p>}
                {meta && <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-muted">{meta}</div>}
                {heroActions && <div className="mt-8 flex flex-wrap gap-3">{heroActions}</div>}
              </div>
            </div>

            {(search || sidebar || hasToc || hasNav) && (
              <div className={`mt-8 flex flex-col gap-3 ${three ? 'xl:hidden' : 'lg:hidden'}`}>
                {search && <div className="lg:hidden">{search}</div>}
                {sidebar && (
                  <div className="lg:hidden">
                    <Disclosure label={sidebarLabel}>{sidebar}</Disclosure>
                  </div>
                )}
                {(hasToc || hasNav) && <Disclosure label={mobileLabel}>{sectionLinks}</Disclosure>}
              </div>
            )}

            <div className={`mt-10 ${wide ? '' : 'max-w-[54ch]'}`}>{children}</div>
            {after && <div className="mt-14 flex flex-col gap-14">{after}</div>}
          </div>

          <aside className={three ? 'hidden xl:block' : 'hidden lg:block'}>
            <div className={sticky}>
              {!three && search}
              {sectionLinks}
              {asideCard ?? <ArthaCard placement={placement} />}
            </div>
          </aside>
        </div>
      </div>

      <div ref={endRef} />
      {cta !== false && <CTABand {...cta} />}
      <StickyCta heroCtaRef={heroCtaRef} endRef={endRef} />
    </div>
  )
}

/** Previous / next links under a reading column. */
export function ReadingPrevNext({ prev, next }: { prev?: ReadingLink; next?: ReadingLink }) {
  if (!prev && !next) return null
  const card = (l: ReadingLink, dir: 'prev' | 'next') => (
    <Link
      to={l.to}
      rel={dir}
      className={`vv-lift flex min-h-[44px] flex-col gap-1 rounded-3xl border border-border bg-surface p-5 ${dir === 'next' ? 'sm:col-start-2 sm:text-right' : ''}`}
    >
      <span className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-text-muted ${dir === 'next' ? 'sm:justify-end' : ''}`}>
        {dir === 'prev' && <Icon name="arrow_back" className="text-[16px]" />}
        {dir === 'prev' ? 'Previous' : 'Next'}
        {l.kicker && <span className="font-semibold normal-case tracking-normal">· {l.kicker}</span>}
        {dir === 'next' && <Icon name="arrow_forward" className="text-[16px]" />}
      </span>
      <span className="font-display text-base font-semibold text-text">{l.label}</span>
    </Link>
  )
  return (
    <nav aria-label="Previous and next" className="grid gap-4 sm:grid-cols-2">
      {prev && card(prev, 'prev')}
      {next && card(next, 'next')}
    </nav>
  )
}

/** A titled grid of link cards (related articles, more topics). */
export function ReadingRelated({ eyebrow, title, items }: { eyebrow: string; title: string; items: ReadingLink[] }) {
  if (!items.length) return null
  return (
    <section>
      <SectionEyebrow>{eyebrow}</SectionEyebrow>
      <h2 className="mt-3 font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {items.map((l) => (
          <li key={l.to} className="h-full">
            <Link to={l.to} className="vv-lift flex h-full gap-4 rounded-3xl border border-border bg-surface p-5">
              {l.icon && (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <Icon3D name={l.icon} size={36} className="text-[22px]" />
                </span>
              )}
              <div className="min-w-0">
                {l.kicker && <span className="block text-xs font-bold uppercase tracking-widest text-text-muted">{l.kicker}</span>}
                <h3 className="mt-0.5 font-display text-base font-semibold text-text">{l.label}</h3>
                {l.body && <p className="mt-1 text-sm leading-relaxed text-text-muted">{l.body}</p>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** "Was this article helpful?" Client-only: a thank-you state, nothing is sent. */
export function ReadingFeedback({ question = 'Was this article helpful?' }: { question?: string }) {
  const [answer, setAnswer] = useState<'yes' | 'no' | null>(null)
  const button =
    'inline-flex min-h-[44px] items-center gap-2 rounded-full border border-border bg-surface px-5 text-sm font-semibold text-text transition-colors hover:border-primary hover:text-primary'
  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-border bg-surface/60 p-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="font-display text-base font-semibold text-text">{question}</p>
      <div aria-live="polite">
        {answer ? (
          <p className="flex min-h-[44px] items-center gap-2 text-sm text-text-muted">
            <Icon name="check_circle" className="text-[18px] text-success" />
            {answer === 'yes' ? 'Thanks for letting us know.' : 'Thanks. Talk to Artha or contact us if you are still stuck.'}
          </p>
        ) : (
          <div className="flex gap-3">
            <button type="button" onClick={() => setAnswer('yes')} className={button}>
              <Icon name="thumb_up" className="text-[18px]" /> Yes
            </button>
            <button type="button" onClick={() => setAnswer('no')} className={button}>
              <Icon name="thumb_down" className="text-[18px]" /> No
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
