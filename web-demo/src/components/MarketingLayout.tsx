import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Icon } from './Icon'
import { BRAND } from '../lib/brand'
import { trackMarketingCta } from '../lib/analytics'
import { NAV, FOOTER_COLUMNS, CONTACT_EMAIL, CONTACT_PHONE, CONTACT_WHATSAPP_URL, LANGUAGES } from '../lib/marketingContent'
import type { NavGroup } from '../lib/marketingContent'
import { pathBucket, hostBucket, BUCKET_HOST } from '../lib/hostBuckets'
import { applyTheme, getStoredTheme, useTheme } from '../lib/theme'
import vistrowMark from '../assets/vistrow-mark.png'
import { Tooltip } from './ui/Tooltip'
import { SeoRelatedLinks } from './SeoRelatedLinks'

// The official logo mark - used everywhere the brand appears (marketing
// site, dashboard, auth pages) for one consistent visual identity.
function OrbMark() {
  return <img src={vistrowMark} alt="" className="h-8 w-8 rounded-lg" />
}

// Matches the official lockup: "Vistrow" bold, "Voice" regular.
function BrandWordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-display tracking-tight ${className}`}>
      <span className="font-bold">Vistrow</span> <span className="font-normal">Voice</span>
    </span>
  )
}

// Every nav/footer/CTA link in this file must go through here instead of a
// bare <Link> - three cases:
//   1. Already absolute: real <a>,
//      opened in a new tab since it's a distinct site from the visitor's
//      point of view.
//   2. A relative path whose bucket (app/docs/marketing) differs from the
//      CURRENT hostname's bucket: also a real <a>, because a React Router
//      <Link> only swaps components client-side - it never re-hits
//      middleware.ts, so a plain <Link to="/login"> clicked on the marketing
//      host would render the login page there instead of jumping to
//      app.vistrowvoice.com/login. Forcing
//      a real navigation here is what keeps the address bar honest.
//   3. Same bucket as the current host: an ordinary client-side <Link>.
export function NavLink({
  to,
  className,
  onClick,
  children,
  target,
  rel,
}: {
  to: string
  className?: string
  onClick?: () => void
  children: ReactNode
  target?: string
  rel?: string
}) {
  if (/^https?:\/\//.test(to)) {
    return (
      <a href={to} className={className} onClick={onClick} target={target ?? '_blank'} rel={rel ?? 'noopener noreferrer'}>
        {children}
      </a>
    )
  }
  if (typeof window !== 'undefined') {
    const current = hostBucket(window.location.hostname)
    const bucketTarget = pathBucket(to)
    if (bucketTarget !== current) {
      const path = bucketTarget === 'docs' ? '/' : to
      return (
        <a href={`https://${BUCKET_HOST[bucketTarget]}${path}`} className={className} onClick={onClick} target={target} rel={rel}>
          {children}
        </a>
      )
    }
  }
  return (
    <Link to={to} className={className} onClick={onClick} target={target} rel={rel}>
      {children}
    </Link>
  )
}

// ---- Header ----
//
// Two rows: a utility strip (language scripts, Talk to sales) that scrolls
// away, and the sticky main bar. Every dropdown panel is rendered into the
// prerendered HTML and only hidden with `invisible`, so crawlers see every
// menu link as a plain <a href>, and opening a panel never shifts layout.

// Hover intent: a pointer crossing the bar on its way somewhere else should
// not flash panels open, and leaving a panel briefly should not snap it shut.
const HOVER_OPEN_MS = 120
const HOVER_CLOSE_MS = 180

/** Where the Product panel's featured card sends people: the Tamil page's
 * hero player (a 30-second call that switches from Hindi to Tamil). */
const SAMPLE_LANGUAGE = 'tamil'

// One shared look for every nav icon. The unlayered .material-symbols-outlined
// rule pins font-size to 20px and beats Tailwind's text-[..px] utilities, so
// header icons are sized through the .mh-icon-* classes in index.css instead.
function HeaderIcon({ name, size = 18, className = '' }: { name: string; size?: 16 | 18 | 22 | 24; className?: string }) {
  return <Icon name={name} className={`mh-icon-${size} ${className}`} />
}

function LiveWave() {
  return (
    <span className="mh-wave" aria-hidden="true">
      <i /><i /><i /><i />
    </span>
  )
}

function MenuItemLink({ item, onNavigate }: { item: { label: string; to: string; icon?: string; desc?: string }; onNavigate: () => void }) {
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className="mh-item group flex min-w-0 items-start gap-3 rounded-xl p-3 outline-none transition-colors hover:bg-surface-high focus-visible:bg-surface-high focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-surface-high text-primary transition-colors group-hover:bg-primary/15">
        <HeaderIcon name={item.icon ?? 'circle'} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-text">{item.label}</span>
        {item.desc && <span className="mt-0.5 block text-xs leading-snug text-text-muted">{item.desc}</span>}
      </span>
    </NavLink>
  )
}

function ProductPanel({ group, onNavigate }: { group: NavGroup; onNavigate: () => void }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_17rem] gap-3">
      <div className="grid grid-cols-3 content-start gap-1">
        {group.items!.map((item) => (
          <MenuItemLink key={item.to} item={item} onNavigate={onNavigate} />
        ))}
      </div>
      <div className="flex flex-col justify-between rounded-2xl bg-gradient-to-br from-primary-dark to-[#c026d3] p-5 text-white">
        <div>
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/80">
            <LiveWave />
            Sample call
          </span>
          <p className="mt-3 font-display text-lg font-semibold leading-snug">Hear it first</p>
          <p className="mt-2 text-sm leading-relaxed text-white/85">
            A 30-second sample call that switches from Hindi to Tamil, and the agent follows.
          </p>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <NavLink
            to={`/languages/${SAMPLE_LANGUAGE}`}
            onClick={onNavigate}
            className="mh-item inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-primary-dark outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary-dark"
          >
            <HeaderIcon name="play_arrow" />
            Play sample
          </NavLink>
          <NavLink
            to="/languages"
            onClick={onNavigate}
            className="mh-item rounded text-sm font-semibold text-white/90 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-white"
          >
            Other languages
          </NavLink>
        </div>
      </div>
    </div>
  )
}

function SolutionsPanel({ group, onNavigate }: { group: NavGroup; onNavigate: () => void }) {
  const industries = group.items!.filter((item) => item.to !== '/languages')
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_17rem] gap-3">
      <div className="grid grid-cols-2 content-start gap-1">
        {industries.map((item) => (
          <MenuItemLink key={item.to} item={item} onNavigate={onNavigate} />
        ))}
      </div>
      <div className="rounded-2xl bg-surface-high/60 p-4">
        <NavLink
          to="/languages"
          onClick={onNavigate}
          className="mh-item flex items-center justify-between rounded-lg px-2 py-1 text-xs font-bold uppercase tracking-widest text-text-muted outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-primary"
        >
          By language
          <HeaderIcon name="arrow_forward" size={16} />
        </NavLink>
        <ul className="mt-2 grid grid-cols-2 gap-x-2">
          {LANGUAGES.map((lang) => (
            <li key={lang.slug}>
              <NavLink
                to={`/languages/${lang.slug}`}
                onClick={onNavigate}
                className="mh-item flex flex-col rounded-lg px-2 py-1.5 outline-none transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span lang={lang.code.split('-')[0]} className="text-sm font-semibold text-text">{lang.native}</span>
                <span className="text-xs text-text-muted">{lang.name}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function ListPanel({ group, columns, onNavigate }: { group: NavGroup; columns: 1 | 3; onNavigate: () => void }) {
  return (
    <div className={`grid gap-1 ${columns === 3 ? 'grid-cols-3' : 'grid-cols-1'}`}>
      {group.items!.map((item) => (
        <MenuItemLink key={item.to} item={item} onNavigate={onNavigate} />
      ))}
    </div>
  )
}

function DesktopNav() {
  const [open, setOpen] = useState<string | null>(null)
  // Hover opens; a click on a hover-opened trigger keeps it open (the
  // pointer usually arrives a beat before the click), a second click closes.
  const openedBy = useRef<'hover' | 'click' | null>(null)
  const timer = useRef<number | null>(null)
  const navRef = useRef<HTMLElement>(null)
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const { pathname } = useLocation()

  const clearTimer = () => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
  }
  const close = () => {
    clearTimer()
    openedBy.current = null
    setOpen(null)
  }

  useEffect(() => close, [])
  // A client-side navigation never fires mouseleave, so close on route change.
  useEffect(() => { close() }, [pathname])

  // Escape closes and hands focus back to the trigger; a click anywhere
  // outside the nav closes.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const trigger = triggerRefs.current[open]
      close()
      trigger?.focus()
    }
    const onDown = (e: PointerEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) close()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  const panelLinks = (label: string) =>
    Array.from(document.querySelectorAll<HTMLAnchorElement>(`#mh-panel-${label.toLowerCase()} a.mh-item`))

  const focusItem = (label: string, index: number) => {
    const links = panelLinks(label)
    if (!links.length) return
    links[(index + links.length) % links.length].focus()
  }

  const onTriggerKey = (label: string) => (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      clearTimer()
      openedBy.current = 'click'
      setOpen(label)
      // The panel is already in the DOM, only invisible: wait one frame
      // for it to become visible (and so focusable).
      window.requestAnimationFrame(() => focusItem(label, 0))
    }
  }

  const onPanelKey = (label: string) => (e: React.KeyboardEvent) => {
    const links = panelLinks(label)
    const index = links.indexOf(document.activeElement as HTMLAnchorElement)
    if (index === -1) return
    const moves: Record<string, number> = { ArrowDown: index + 1, ArrowRight: index + 1, ArrowUp: index - 1, ArrowLeft: index - 1, Home: 0, End: links.length - 1 }
    if (e.key in moves) {
      e.preventDefault()
      focusItem(label, moves[e.key])
    }
  }

  // Tabbing out of a group (trigger + its panel) closes it.
  const onGroupBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      if (openedBy.current !== 'hover') close()
    }
  }

  return (
    <nav ref={navRef} aria-label="Main" className="hidden min-w-0 items-center gap-0.5 whitespace-nowrap lg:flex">
      {NAV.filter((group) => group.label !== 'Home').map((group) => {
        if (!group.items) {
          return (
            <NavLink
              key={group.label}
              to={group.to ?? '#'}
              className="rounded-full px-2.5 py-2 text-sm font-medium text-text-muted transition-colors hover:text-text xl:px-3.5"
            >
              {group.label}
            </NavLink>
          )
        }
        const isOpen = open === group.label
        const id = `mh-panel-${group.label.toLowerCase()}`
        const narrow = group.label === 'Company'
        return (
          <div
            key={group.label}
            // Wide panels position against the bar (the nearest positioned
            // ancestor); the narrow Company list sits under its own trigger.
            className={narrow ? 'relative' : ''}
            onPointerEnter={(e) => {
              if (e.pointerType !== 'mouse') return
              clearTimer()
              if (open === group.label) return
              timer.current = window.setTimeout(() => {
                openedBy.current = 'hover'
                setOpen(group.label)
              }, open ? 0 : HOVER_OPEN_MS)
            }}
            onPointerLeave={(e) => {
              if (e.pointerType !== 'mouse') return
              clearTimer()
              if (openedBy.current === 'click') return
              timer.current = window.setTimeout(close, HOVER_CLOSE_MS)
            }}
            onBlur={onGroupBlur}
          >
            <button
              ref={(el) => { triggerRefs.current[group.label] = el }}
              type="button"
              aria-expanded={isOpen}
              aria-controls={id}
              onClick={() => {
                clearTimer()
                if (isOpen && openedBy.current === 'click') return close()
                openedBy.current = 'click'
                setOpen(group.label)
              }}
              onKeyDown={onTriggerKey(group.label)}
              className={`flex items-center gap-1 rounded-full px-2.5 py-2 text-sm font-medium transition-colors xl:px-3.5 ${
                isOpen ? 'text-primary' : 'text-text-muted hover:text-text'
              }`}
            >
              {group.label}
              <Icon name="expand_more" className={`text-[16px] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            <div
              id={id}
              onKeyDown={onPanelKey(group.label)}
              // Visibility only transitions on close (so the fade-out shows);
              // on open it flips at once, or the links would not be
              // focusable during the first frame of the fade-in.
              className={`absolute top-full z-40 pt-2 duration-150 ${
                narrow ? 'right-0 w-80' : 'inset-x-5 md:inset-x-8'
              } ${
                isOpen
                  ? 'visible translate-y-0 opacity-100 transition-[opacity,transform]'
                  : 'pointer-events-none invisible -translate-y-1 opacity-0 transition-[opacity,transform,visibility]'
              }`}
            >
              <div className="whitespace-normal rounded-2xl border border-border bg-surface p-3 shadow-2xl shadow-primary/10">
                {group.label === 'Product' ? (
                  <ProductPanel group={group} onNavigate={close} />
                ) : group.label === 'Solutions' ? (
                  <SolutionsPanel group={group} onNavigate={close} />
                ) : (
                  <ListPanel group={group} columns={narrow ? 1 : 3} onNavigate={close} />
                )}
              </div>
            </div>
          </div>
        )
      })}
    </nav>
  )
}

function MobileNav({ onClose }: { onClose: () => void }) {
  // One group open at a time, accordion-style, so the sheet stays scannable.
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div id="mh-mobile-sheet" role="dialog" aria-modal="true" aria-label="Menu" className="fixed inset-0 z-50 flex flex-col bg-bg lg:hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <NavLink to="/" onClick={onClose} className="flex items-center gap-2">
          <OrbMark />
          <BrandWordmark className="text-lg" />
        </NavLink>
        <div className="flex items-center gap-2">
          <MarketingThemeSwitcher />
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="-mr-2 flex h-11 w-11 items-center justify-center text-text-muted hover:text-text"
            aria-label="Close menu"
          >
            <HeaderIcon name="close" size={24} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-8 pt-5">
        <div className="flex flex-col divide-y divide-border">
          {NAV.map((group) => {
            if (!group.items) {
              return (
                <NavLink key={group.label} to={group.to ?? '#'} onClick={onClose} className="block py-3.5 text-base font-semibold text-text">
                  {group.label}
                </NavLink>
              )
            }
            const isOpen = openGroup === group.label
            return (
              <div key={group.label}>
                <button
                  type="button"
                  onClick={() => setOpenGroup(isOpen ? null : group.label)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between py-3.5 text-base font-semibold text-text"
                >
                  {group.label}
                  <Icon name="expand_more" className={`text-[20px] text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="flex flex-col gap-0.5 pb-3">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={onClose}
                        className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm text-text-muted hover:bg-surface-high hover:text-text"
                      >
                        <HeaderIcon name={item.icon ?? 'circle'} className="text-primary" />
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-widest text-text-muted">Languages</p>
        <ul className="mt-2 grid grid-cols-2 gap-1 min-[400px]:grid-cols-3">
          {LANGUAGES.map((lang) => (
            <li key={lang.slug}>
              <NavLink
                to={`/languages/${lang.slug}`}
                onClick={onClose}
                // bg-surface opts out of the global outline-button gradient
                // rule in index.css (a[class*="border-border"] without a bg-).
                className="flex flex-col rounded-lg border border-border bg-surface px-3 py-2 hover:border-primary"
              >
                <span lang={lang.code.split('-')[0]} className="text-sm font-semibold text-text">{lang.native}</span>
                <span className="text-xs text-text-muted">{lang.name}</span>
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-col gap-3">
          <NavLink
            to="/contact"
            onClick={() => {
              trackMarketingCta('book_demo', 'mobile_header')
              onClose()
            }}
            className="mh-cta rounded-full px-5 py-3 text-center text-sm font-bold text-white"
          >
            Book a demo
          </NavLink>
          <NavLink
            to="/login"
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="py-2 text-center text-sm font-semibold text-text-muted hover:text-text"
          >
            Sign in
          </NavLink>
        </div>
      </div>
    </div>
  )
}

/** Light/dark switch for the marketing header. Shares lib/theme.ts with the
 * dashboard's own switcher, so a visitor who picks light mode here stays in
 * light mode after signing in - one preference, one storage key. */
function MarketingThemeSwitcher({ className }: { className?: string }) {
  const theme = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <Tooltip content={`Switch to ${next} mode`}><button
      onClick={() => applyTheme(next)}
      aria-label={`Switch to ${next} mode`}
      className={
        className ??
        'flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-border bg-surface text-text-muted transition-colors hover:border-primary hover:text-primary'
      }
    >
      {/* key remount replays the spin-in animation on every toggle. */}
      <Icon key={theme} name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="theme-icon-pop text-[18px]" />
    </button></Tooltip>
  )
}

function UtilityStrip() {
  return (
    <div className="hidden border-b border-border bg-surface lg:block">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-2 text-xs md:px-8">
        <nav aria-label="Languages" className="mh-scroll min-w-0 overflow-x-auto">
          <ul className="flex items-center whitespace-nowrap">
            {LANGUAGES.map((lang, i) => (
              <li key={lang.slug} className="flex items-center">
                {i > 0 && <span aria-hidden="true" className="px-1.5 text-border">·</span>}
                <NavLink
                  to={`/languages/${lang.slug}`}
                  className="rounded px-0.5 font-semibold text-text-muted transition-colors hover:text-primary"
                >
                  <span lang={lang.code.split('-')[0]} title={lang.name}>{lang.native}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex shrink-0 items-center gap-2 whitespace-nowrap text-text-muted">
          <span>Answers 24/7 on phone and web</span>
          <span aria-hidden="true" className="text-border">·</span>
          <NavLink
            to="/contact"
            onClick={() => trackMarketingCta('talk_to_sales', 'header_utility_strip')}
            className="font-bold text-primary hover:underline"
          >
            Talk to sales
          </NavLink>
          {/* The main bar drops Sign in below xl to make room; it lives here then. */}
          <span aria-hidden="true" className="text-border xl:hidden">·</span>
          <NavLink to="/login" target="_blank" rel="noopener noreferrer" className="font-semibold hover:text-text xl:hidden">
            Sign in
          </NavLink>
        </div>
      </div>
    </div>
  )
}

function Header() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const headerRef = useRef<HTMLElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const header = headerRef.current
    if (!header) return
    const syncHeight = () => document.documentElement.style.setProperty('--marketing-header-height', `${header.getBoundingClientRect().height}px`)
    syncHeight()
    const observer = new ResizeObserver(syncHeight)
    observer.observe(header)
    return () => { observer.disconnect(); document.documentElement.style.removeProperty('--marketing-header-height') }
  }, [])

  // Shadow only once the bar is actually floating over content.
  useEffect(() => {
    const header = headerRef.current
    if (!header) return
    const onScroll = () => setScrolled(header.getBoundingClientRect().top <= 0 && window.scrollY > 0)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const closeMobile = useCallback(() => {
    setMobileOpen(false)
    menuButtonRef.current?.focus()
  }, [])

  return (
    <>
      <UtilityStrip />
      <header
        ref={headerRef}
        className={`sticky top-0 z-40 border-b bg-bg/85 backdrop-blur-xl transition-shadow duration-200 ${
          scrolled ? 'border-border shadow-[0_10px_30px_-18px_rgba(76,29,149,0.45)]' : 'border-border/70'
        }`}
      >
        <div className="relative mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 min-[360px]:px-5 md:px-8 lg:gap-4">
          <NavLink to="/" className="flex min-w-0 shrink-0 items-center gap-2 whitespace-nowrap">
            <OrbMark />
            <BrandWordmark className="text-[15px] min-[360px]:text-base min-[400px]:text-lg" />
            <span className="hidden font-mono text-xs text-text-muted 2xl:inline">by Vistrow</span>
          </NavLink>

          <DesktopNav />

          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
            <MarketingThemeSwitcher className="hidden h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-border bg-surface text-text-muted transition-colors hover:border-primary hover:text-primary lg:flex" />
            <NavLink
              to="/login"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden rounded-full px-3 py-2 text-sm font-semibold text-text-muted transition-colors hover:text-text xl:block"
            >
              Sign in
            </NavLink>
            <NavLink
              to="/contact"
              onClick={() => trackMarketingCta('book_demo', 'desktop_header')}
              className="mh-cta rounded-full px-3 py-2 text-xs font-bold text-white min-[360px]:px-3.5 min-[400px]:text-sm lg:px-5"
            >
              Book a demo
            </NavLink>
            <button
              ref={menuButtonRef}
              type="button"
              className="-mr-2 flex h-11 w-11 items-center justify-center text-text-muted hover:text-text lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              aria-expanded={mobileOpen}
              aria-controls="mh-mobile-sheet"
            >
              <HeaderIcon name="menu" size={24} />
            </button>
          </div>
        </div>
      </header>
      {mobileOpen && <MobileNav onClose={closeMobile} />}
    </>
  )
}

function Footer() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-7xl px-5 py-14 md:px-8">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-7">
          <div className="col-span-2">
            <NavLink to="/" className="flex items-center gap-2">
              <OrbMark />
              <BrandWordmark className="text-lg" />
            </NavLink>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-text-muted">{BRAND.tagline}</p>
            <div className="mt-3 flex text-text-muted">
              <a href={`mailto:${CONTACT_EMAIL}`} aria-label={`Email us at ${CONTACT_EMAIL}`} className="-ml-2 flex h-11 w-11 items-center justify-center hover:text-text"><Icon name="mail" className="text-[20px]" /></a>
              <a href={`tel:${CONTACT_PHONE.replace(/\s/g, '')}`} aria-label={`Call us on ${CONTACT_PHONE}`} className="flex h-11 w-11 items-center justify-center hover:text-text"><Icon name="call" className="text-[20px]" /></a>
              <a href={CONTACT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" aria-label={`Message us on WhatsApp at ${CONTACT_PHONE}`} className="flex h-11 w-11 items-center justify-center hover:text-text"><Icon name="chat" className="text-[20px]" /></a>
            </div>
          </div>
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">{col.title}</p>
              <ul className="flex flex-col">
                {col.links.map((link) => (
                  <li key={link.to}>
                    {/* py-2 makes each link a 36px tap target on a phone without changing how the list looks */}
                    <NavLink to={link.to} className="block py-2 text-sm text-text-muted transition-colors hover:text-text">
                      {link.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 border-t border-border pt-6 text-xs text-text-muted">
          © {new Date().getFullYear()} {BRAND.short}. All rights reserved.
        </div>
      </div>
    </footer>
  )
}

export function MarketingLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()

  // The marketing site used to be dark-only by design; it now honours the
  // same stored preference the dashboard uses. Applied on mount (persist=
  // false, so re-entering a marketing route doesn't replay the fade), and
  // cleared on unmount so pages outside either layout - auth screens, the
  // standalone call UI - keep the fixed dark look they're designed for.
  useEffect(() => {
    applyTheme(getStoredTheme(), false)
    return () => document.documentElement.removeAttribute('data-theme')
  }, [])

  // Marketing routes should always open at the top, not retain scroll from the
  // previous page (default browser behaviour on client-side nav).
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="min-h-screen bg-bg text-text">
      <Header />
      <main>{children}</main>
      <SeoRelatedLinks />
      <Footer />
    </div>
  )
}
