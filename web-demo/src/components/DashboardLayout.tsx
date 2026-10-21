import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { NAV_GROUPS, navItemActive } from './navGroups'
import { useEmbedded } from './embedded'
import { CommandMenuButton, CommandPalette } from './CommandPalette'
import { NotificationBell } from './NotificationBell'
import type { ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { fetchBilling, fetchSubscription } from '../lib/api'
import { useNavigate } from 'react-router-dom'
import { BRAND } from '../lib/brand'
import { adminExitImpersonation, takeSupportReturn } from '../lib/adminApi'
import { openCommandMenu } from '../lib/commandMenu'
import { initClarity, stopClarityForStaff, tagClarityAccount } from '../lib/analytics'
import { useSessionInsightsConsent } from '../lib/analyticsConsent'
import { useAuth, hasRole, type AuthUser } from '../lib/auth'
import { applyTheme, getStoredTheme, useTheme } from '../lib/theme'
import { DashboardTour } from './DashboardTour'
import { HelpChatWidget } from './HelpChatWidget'
import { WatchHowButton } from './HelpVideo'
import { helpVideoFor } from '../lib/helpVideos'
import { Icon } from './Icon'
import { StorageWarning } from './StorageWarning'
import { MobileTabBar } from './MobileTabBar'
import vistrowMark from '../assets/vistrow-mark.png'
import { Tooltip } from './ui/Tooltip'

// Pinned open is opt-in: the slim rail is the default (owner, 21 Oct 2026),
// so this is a new key rather than the old collapsed flag.
const SIDEBAR_PIN_KEY = 'vistrow.sidebar.pinned'
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const TOGGLE_SHORTCUT = isMac ? '⌘B' : 'Ctrl+B'

function initials(name: string): string {
  return (name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('') || '?').toUpperCase()
}

export function ThemeSwitcher() {
  const theme = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <Tooltip content={`Switch to ${next} mode`}><button
      onClick={() => applyTheme(next)}
      aria-label={`Switch to ${next} mode`}
      className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-border bg-surface text-text-muted transition-colors hover:border-primary hover:text-primary sm:h-8 sm:w-8"
    >
      {/* key remount replays the spin-in animation every toggle, not just once. */}
      <Icon key={theme} name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="theme-icon-pop text-[17px]" />
    </button></Tooltip>
  )
}


/** The avatar at the right of the header. Opens a menu with who you are,
 * quick links, the dark-mode switch and Sign out. */
function HeaderAvatarMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const theme = useTheme()
  const workspace = user?.accountName || BRAND.defaultWorkspace
  const name = user?.name || workspace
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const go = (to: string) => { setOpen(false); navigate(to) }
  const avatar = (size: string, text: string) =>
    user?.avatarUrl ? (
      <img src={user.avatarUrl} alt="" className={`${size} shrink-0 rounded-full object-cover`} />
    ) : (
      <span className={`${size} flex shrink-0 items-center justify-center rounded-full bg-primary/20 font-bold text-primary ${text}`}>{initials(name)}</span>
    )
  const row = 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold text-text transition-colors hover:bg-surface-high'

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-transparent p-0.5 sm:h-9 sm:w-9 ${open ? 'ring-2 ring-primary' : 'hover:ring-2 hover:ring-border'}`}
      >
        {avatar('h-full w-full', 'text-xs')}
      </button>
      {open && (
        <div role="menu" aria-label="Account" className="fixed inset-x-3 top-16 z-50 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-72">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            {avatar('h-11 w-11', 'text-sm')}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{name}</p>
              <p className="truncate text-xs text-text-muted">{user?.email || workspace}</p>
            </div>
          </div>
          <div className="flex flex-col gap-0.5 p-1.5">
            <button role="menuitem" onClick={() => go('/dashboard/settings?tab=profile')} className={row}>
              <Icon name="person" className="text-[19px] text-text-muted" />
              <span className="flex-1">My profile</span>
            </button>
            <button role="menuitem" onClick={() => go('/dashboard/settings?tab=general')} className={row}>
              <Icon name="business" className="text-[19px] text-text-muted" />
              <span className="flex-1">Workspace settings</span>
            </button>
            <button role="menuitem" onClick={() => go('/dashboard/settings?tab=team')} className={row}>
              <Icon name="group" className="text-[19px] text-text-muted" />
              <span className="flex-1">Team &amp; access</span>
            </button>
          </div>
          <div className="border-t border-border p-1.5">
            <div className={`${row} cursor-default hover:bg-transparent`}>
              <Icon name="dark_mode" className="text-[19px] text-text-muted" />
              <span className="flex-1" id="vv-dark-label">Dark mode</span>
              <button
                type="button"
                role="switch"
                aria-checked={theme === 'dark'}
                aria-labelledby="vv-dark-label"
                onClick={() => applyTheme(theme === 'dark' ? 'light' : 'dark')}
                className={`relative h-5 w-9 shrink-0 rounded-full p-0 transition-colors ${theme === 'dark' ? 'bg-primary' : 'bg-border'}`}
              >
                <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${theme === 'dark' ? 'translate-x-4' : ''}`} />
              </button>
            </div>
            <button role="menuitem" onClick={() => go('/dashboard/support')} className={row}>
              <Icon name="support_agent" className="text-[19px] text-text-muted" />
              <span className="flex-1">Help &amp; Support</span>
            </button>
            {user?.isPlatformOwner && !user?.impersonating && (
              <button role="menuitem" onClick={() => go('/admin')} className={row}>
                <Icon name="shield_person" className="text-[19px] text-text-muted" />
                <span className="flex-1">Admin panel</span>
              </button>
            )}
          </div>
          <div className="border-t border-border p-2">
            <button
              role="menuitem"
              onClick={async () => { setOpen(false); await logout(); navigate('/login', { replace: true }) }}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-text shadow-sm transition-colors hover:bg-surface-high"
            >
              <Icon name="logout" className="text-[18px] text-text-muted" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function AccountMenu({ labelCls = '' }: { labelCls?: string }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const workspace = user?.accountName || BRAND.defaultWorkspace
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onEscape)
    }
  }, [open])

  const go = (to: string) => {
    setOpen(false)
    navigate(to)
  }
  const handleLogout = async () => {
    setOpen(false)
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-surface-high"
      >
        {user?.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full border border-primary/30 object-cover" />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
            {initials(workspace)}
          </div>
        )}
        <div className={`min-w-0 flex-1 ${labelCls}`}>
          <p className="truncate text-sm font-semibold">{workspace}</p>
          <p className="truncate text-[11px] text-text-muted">{user?.name || 'Admin'}</p>
        </div>
        <Icon name={open ? 'expand_more' : 'expand_less'} className={`text-[18px] text-text-muted ${labelCls}`} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={`${workspace} account actions`}
          className="absolute bottom-full left-0 z-50 mb-2 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="h-7 w-7 shrink-0 rounded-full border border-primary/30 object-cover" />
            ) : (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                {initials(workspace)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{workspace}</p>
            </div>
          </div>
          <div className="flex flex-col py-1">
            <button
              role="menuitem"
              onClick={() => go('/dashboard/settings?tab=profile')}
              className="flex items-center gap-2.5 px-3 py-2 text-left text-sm text-text transition-colors hover:bg-surface-high"
            >
              <Icon name="person" className="text-[17px] text-text-muted" />
              My profile
            </button>
            <button
              role="menuitem"
              onClick={() => go('/dashboard/settings?tab=general')}
              className="flex items-center gap-2.5 px-3 py-2 text-left text-sm text-text transition-colors hover:bg-surface-high"
            >
              <Icon name="business" className="text-[17px] text-text-muted" />
              Workspace settings
            </button>
            <button
              role="menuitem"
              onClick={() => go('/dashboard/settings?tab=team')}
              className="flex items-center gap-2.5 px-3 py-2 text-left text-sm text-text transition-colors hover:bg-surface-high"
            >
              <Icon name="group" className="text-[17px] text-text-muted" />
              Team & access
            </button>
          </div>
          <div className="border-t border-border py-1">
            <button
              role="menuitem"
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
            >
              <Icon name="logout" className="text-[17px]" />
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Labels and headings in the slim rail: hidden while it is a 76px icon
 * strip, shown once it widens (hover, keyboard focus, an open account menu,
 * or pinned open). */
const RAIL_SHOW =
  'opacity-0 transition-opacity duration-150 group-hover/rail:opacity-100 group-has-[:focus-visible]/rail:opacity-100 group-has-[[aria-expanded=true]]/rail:opacity-100'

/** The desktop sidebar (owner, 21 Oct 2026): a slim icon rail that widens over
 * the page on hover, or stays open when pinned. Icons never move, so the rail
 * reads the same in both states. */
function SlimSidebar({ pinned, onTogglePin }: { pinned: boolean; onTogglePin?: () => void }) {
  const { user } = useAuth()
  const location = useLocation()
  const workspace = user?.accountName || BRAND.defaultWorkspace
  const show = pinned ? '' : RAIL_SHOW
  const groups = NAV_GROUPS.filter((group) => !group.pinned && !group.paletteOnly)
  const itemCls = (active: boolean) =>
    `flex h-9 w-full min-w-0 shrink-0 items-center gap-3 rounded-xl px-[15px] text-[14.5px] transition-colors ${
      active ? 'bg-primary/10 font-semibold text-primary' : 'font-medium text-text-muted hover:bg-surface-high hover:text-text'
    }`

  return (
    <>
      <div className="mb-3 flex h-11 shrink-0 items-center gap-3 px-[10px]">
        <img src={vistrowMark} alt="" className="h-8 w-8 shrink-0 rounded-[10px] shadow-sm" />
        <div className={`min-w-0 flex-1 ${show}`}>
          <span className="block truncate text-sm font-bold leading-tight tracking-tight">{workspace}</span>
          <span className="mt-0.5 flex items-center gap-1 truncate text-[10px] font-medium text-text-muted"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {BRAND.name} workspace</span>
        </div>
        {onTogglePin && (
          <Tooltip side="right" content={`${pinned ? 'Collapse sidebar' : 'Keep sidebar open'} (${TOGGLE_SHORTCUT})`}><button
            type="button"
            onClick={onTogglePin}
            aria-label={pinned ? 'Collapse sidebar' : 'Keep sidebar open'}
            aria-pressed={pinned}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-transparent text-text-muted hover:bg-surface-high hover:text-primary ${show}`}
          >
            <Icon name={pinned ? 'left_panel_close' : 'left_panel_open'} className="text-[20px]" />
          </button></Tooltip>
        )}
      </div>
      <Link
        to="/dashboard/agents?new=1"
        aria-label="New agent"
        className="mb-2 flex h-9 shrink-0 items-center gap-3 rounded-xl bg-gradient-to-br from-[#7c3aed] to-[#c026d3] px-[15px] text-[14.5px] font-semibold text-white shadow-[0_10px_22px_-12px_#7c3aed] transition-[filter] hover:brightness-110"
      >
        <Icon name="add" className="shrink-0 text-[21px]" />
        <span className={`truncate whitespace-nowrap ${show}`}>New agent</span>
      </Link>
      <nav aria-label="Main navigation" data-clarity-unmask="true" className="vv-quiet-scroll flex min-h-0 flex-1 flex-col gap-0.5 overflow-x-hidden overflow-y-auto pb-2">
        {groups.map((group, index) => (
          // Groups are split by a thin line; the icons and labels name them.
          <div key={group.title} className={`flex flex-col gap-0.5 ${index ? 'mt-1.5 border-t border-border pt-1.5' : ''}`}>
            {group.items.map((item) => {
              const active = navItemActive(item, location.pathname)
              return (
                <NavLink key={item.to} to={item.to} end={item.to === '/dashboard'} aria-label={item.label} data-tour={item.tour} className={itemCls(active)}>
                  <Icon name={item.icon} className="shrink-0 text-[21px]" />
                  <span className={`min-w-0 flex-1 truncate whitespace-nowrap ${show}`}>{item.label}</span>
                </NavLink>
              )
            })}
          </div>
        ))}
      </nav>
      <div className={`shrink-0 ${show}`}><StorageWarning /></div>
      <div className="flex shrink-0 flex-col gap-0.5 border-t border-border pt-2">
        {user?.isPlatformOwner && !user?.impersonating && (
          <NavLink to="/admin" aria-label="Admin panel" className="flex h-9 items-center gap-3 rounded-xl px-[15px] text-[14.5px] font-semibold text-destructive transition-colors hover:bg-destructive/10">
            <Icon name="shield_person" className="shrink-0 text-[21px]" />
            <span className={`whitespace-nowrap ${show}`}>Admin panel</span>
          </NavLink>
        )}
        <AccountMenu labelCls={show} />
      </div>
    </>
  )
}

/** Lets a page's header tell the layout it is drawing the phone app bar
 * itself (so the layout's plain bar hides). Navigation on phones is the
 * bottom tab bar (MobileTabBar). */
const MobileNavContext = createContext<{ setHeaderShown: (shown: boolean) => void } | null>(null)

function useIsDesktop() {
  const query = '(min-width: 1024px)'
  const [desktop, setDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setDesktop(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return desktop
}

const appBarIconBtn =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-transparent text-text-muted transition-colors hover:bg-surface-high hover:text-text active:scale-95'

function FullPageHeader({
  title,
  subtitle,
  children,
  refreshSignal = 0,
  ownWatchHow = false,
  lead,
  hideNewAgent = false,
}: {
  title: string
  subtitle?: string
  children?: ReactNode
  refreshSignal?: number
  /** The page shows its own Watch how in its toolbar (the Dashboard). */
  ownWatchHow?: boolean
  /** Shown at the left of the page's action row, e.g. a short note with an InfoTip. */
  lead?: ReactNode
  /** The Agents page shows New Agent in its own team bar instead. */
  hideNewAgent?: boolean
}) {
  const [credits, setCredits] = useState<number | null>(null)
  const { pathname } = useLocation()
  // Agent creation belongs to the Agents page. Showing it on the overview
  // duplicated Quick actions and displaced dashboard-specific controls.
  const showNewAgent = pathname === '/dashboard/agents' && !hideNewAgent
  const videoSlug = helpVideoFor(pathname)
  const watchHow = videoSlug && !ownWatchHow && <WatchHowButton slug={videoSlug} />

  // "· Top up" only where it can work: checkout switched on for this
  // deployment and an admin who may pay. Everyone else keeps the plain pill.
  const [topupAvailable, setTopupAvailable] = useState(false)
  const { user: headerUser } = useAuth()
  useEffect(() => {
    if (!hasRole(headerUser, 'admin')) { setTopupAvailable(false); return }
    fetchSubscription().then((r) => setTopupAvailable(r.razorpayConfigured)).catch(() => setTopupAvailable(false))
  }, [headerUser])

  useEffect(() => {
    const load = () =>
      fetchBilling()
        .then((b) => setCredits(b.creditsRemaining))
        .catch(() => setCredits(null))
    load()
    // A top-up (TopupModal) announces itself so the pill updates without a reload.
    window.addEventListener('vv:billing-changed', load)
    return () => window.removeEventListener('vv:billing-changed', load)
  }, [refreshSignal])

  const desktop = useIsDesktop()
  const mobileNav = useContext(MobileNavContext)
  useEffect(() => {
    if (desktop || !mobileNav) return
    mobileNav.setHeaderShown(true)
    return () => mobileNav.setHeaderShown(false)
  }, [desktop, mobileNav])

  const creditsPill = credits !== null && (
    <Tooltip content={topupAvailable ? 'Buy minutes · plan and invoices' : 'Plan and billing'}><Link
      to={topupAvailable ? '/dashboard/settings?tab=billing&topup=1' : '/dashboard/settings?tab=billing'}
      aria-label={topupAvailable ? `${credits} minutes remaining. Buy minutes` : `${credits} minutes remaining. Open plan and billing`}
      className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:border-primary hover:text-primary"
    >
      <Icon name="toll" className="text-[15px] text-cyan" />
      {credits} min
      {topupAvailable && <span className="hidden text-primary sm:inline">· Top up</span>}
    </Link></Tooltip>
  )
  const newAgent = showNewAgent && (
    <Link
      to="/dashboard/agents?new=1"
      className="flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90"
    >
      <Icon name="add" className="text-[18px]" />
      New Agent
    </Link>
  )

  // The top bar holds only what every page shares (search, credits,
  // alerts, account). A page's own buttons (Back, Test agent, New Agent,
  // agent ID, its Watch how video...) sit in a row at the top of the page
  // instead, so the bar never changes shape from page to page (owner, 17 and
  // 19 Oct).
  const pageActions = (lead || children || newAgent || watchHow) && (
    <div className="flex flex-wrap items-center justify-end gap-2 px-4 pt-4 sm:px-6">
      {lead && <div className="mr-auto min-w-0">{lead}</div>}
      {watchHow}
      {children}
      {newAgent}
    </div>
  )

  if (!desktop) {
    // Phone and tablet: one app bar row (title, minutes, search, alerts,
    // account). Navigation is the bottom tab bar.
    return (
      <>
        <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur-xl">
          <div className="flex h-14 items-center gap-0.5 px-1.5">
            {/* No logo here: the title needs the room, and Home is in the tab bar. */}
            <h1 className="min-w-0 flex-1 truncate pl-2.5 pr-1 text-[17px] font-semibold tracking-tight">{title}</h1>
            {credits !== null && (
              <Link
                to={topupAvailable ? '/dashboard/settings?tab=billing&topup=1' : '/dashboard/settings?tab=billing'}
                aria-label={topupAvailable ? `${credits} minutes remaining. Buy minutes` : `${credits} minutes remaining. Open plan and billing`}
                className="mr-0.5 flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-2 py-1 text-xs font-semibold text-text-muted"
              >
                <Icon name="toll" className="text-[14px] text-cyan" />
                {credits}<span className="-ml-0.5 hidden min-[360px]:inline">&nbsp;min</span>
              </Link>
            )}
            <button type="button" aria-label="Search and commands" aria-haspopup="dialog" onClick={openCommandMenu} className={appBarIconBtn}>
              <Icon name="search" className="text-[21px]" />
            </button>
            <NotificationBell />
            <span className="pl-1 pr-1.5">
              <HeaderAvatarMenu />
            </span>
          </div>
        </header>
        {pageActions}
      </>
    )
  }

  return (
    <>
      <header className="sticky top-0 z-20 flex flex-col gap-3 border-b border-border bg-bg/90 px-4 py-4 backdrop-blur-xl sm:px-6 xl:flex-row xl:items-center">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold leading-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 text-xs leading-snug text-text-muted sm:truncate">{subtitle}</p>}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:gap-3 xl:w-auto">
          <CommandMenuButton />
          {creditsPill}
          <NotificationBell />
          <HeaderAvatarMenu />
        </div>
      </header>
      {pageActions}
    </>
  )
}

type PageHeaderProps = { title: string; subtitle?: string; children?: ReactNode; refreshSignal?: number; ownWatchHow?: boolean; lead?: ReactNode; hideNewAgent?: boolean }

/** The page title bar. Inside a Settings tab the tab itself is the title, so only the page's own
 * action buttons and its one-line description are kept. */
export function PageHeader(props: PageHeaderProps) {
  const embedded = useEmbedded()
  if (!embedded) return <FullPageHeader {...props} />
  if (!props.subtitle && !props.children) return null
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      {props.subtitle && <p className="min-w-0 flex-1 text-sm text-text-muted">{props.subtitle}</p>}
      {props.children && <div className="flex flex-wrap items-center gap-2">{props.children}</div>}
    </div>
  )
}

/** Sticky red bar shown to the platform owner while inside a tenant's account
 * via "View as". Exiting restores the owner's own session and returns to /admin. */
function ImpersonationBanner({ accountName, session }: { accountName: string; session: AuthUser['impersonating'] }) {
  const { refresh } = useAuth()
  const navigate = useNavigate()
  const [exiting, setExiting] = useState(false)
  const [exitError, setExitError] = useState('')
  const expiresAt = typeof session === 'object' && session.expiresAt ? new Date(session.expiresAt) : null
  const endsAt =
    expiresAt && !Number.isNaN(expiresAt.getTime())
      ? expiresAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
      : null
  const exit = async () => {
    setExiting(true)
    setExitError('')
    try {
      await adminExitImpersonation()
    } catch (e) {
      // Stay put and say so - navigating away would leave the admin unsure
      // whether they are still acting as the customer.
      setExitError(`Exit failed: ${e instanceof Error ? e.message : 'request failed'}`)
      setExiting(false)
      return
    }
    await refresh()
    navigate(takeSupportReturn())
  }
  return (
    <div className="fixed inset-x-0 top-0 z-50 flex h-9 items-center justify-between gap-3 bg-destructive px-4 text-white">
      <span className="flex min-w-0 items-center gap-2 text-xs font-semibold">
        <Icon name="visibility" className="shrink-0 text-[16px]" />
        <span className="truncate">
          {exitError ? (
            exitError
          ) : (
            <>
              Viewing as <strong>{accountName}</strong>
              {endsAt && ` · ends ${endsAt}`}
              <span className="hidden sm:inline">. Actions are logged.</span>
            </>
          )}
        </span>
      </span>
      <button onClick={exit} disabled={exiting} className="flex shrink-0 items-center gap-1 text-xs font-bold hover:underline disabled:opacity-70">
        <Icon name="logout" className="text-[15px]" /> {exiting ? 'Exiting…' : exitError ? 'Retry exit' : 'Exit'}
      </button>
    </div>
  )
}

function FullDashboardLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)
  const [headerShown, setHeaderShown] = useState(false)
  const [mobileNav] = useState(() => ({ setHeaderShown }))
  const [sidebarPinned, setSidebarPinned] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_PIN_KEY) === 'true'
    } catch {
      return false
    }
  })

  const toggleSidebar = useCallback(() => {
    setSidebarPinned((current) => {
      const next = !current
      try {
        localStorage.setItem(SIDEBAR_PIN_KEY, String(next))
      } catch {
        // Private mode / blocked storage: the toggle still works this visit.
      }
      return next
    })
  }, [])

  // The first-run tour points at sidebar links, so it keeps the sidebar open.
  const tourActive = !!user && user.onboarded && !user.tourCompleted
  const sidebarOpen = sidebarPinned || tourActive

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        // Leave Cmd/Ctrl+B to text fields (bold in rich editors).
        const el = e.target as HTMLElement | null
        if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
        e.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleSidebar])

  // Theme is a dashboard-only preference - apply the stored choice on mount
  // and revert to the designed dark look on unmount so the public
  // landing/call pages are never affected by it.
  useEffect(() => {
    applyTheme(getStoredTheme(), false)
    return () => document.documentElement.removeAttribute('data-theme')
  }, [])

  // Re-runs when the visitor allows session insights from the banner, so
  // Clarity starts without a reload (initClarity is a no-op until then).
  const sessionChoice = useSessionInsightsConsent()
  useEffect(() => {
    if (!user) return
    if (user.isPlatformOwner || user.impersonating) {
      stopClarityForStaff()
    } else {
      initClarity(window.location.pathname, true)
      tagClarityAccount(user.accountId, user.plan)
    }
  }, [user, sessionChoice])

  return (
    <div data-dashboard-root className="min-h-screen bg-bg text-text">
      {/* Mounted once for the whole dashboard - it is keyboard-summoned, so
          it has no trigger in the layout and renders nothing until opened. */}
      <CommandPalette />
      {user?.impersonating && <ImpersonationBanner accountName={user.accountName} session={user.impersonating} />}
      {/* Slim rail: 76px of icons that widens over the page on hover (a short
          delay so passing the pointer across it does not flicker it open), or
          pinned open, when the page moves over to make room. */}
      <aside
        data-dashboard-sidebar
        className={`group/rail fixed left-0 z-30 hidden flex-col overflow-x-hidden border-r border-border bg-surface px-3 py-3 transition-[width,box-shadow] duration-200 ease-out motion-reduce:transition-none lg:flex ${
          sidebarOpen
            ? 'w-[248px]'
            : 'w-[76px] hover:w-[248px] hover:shadow-[0_24px_60px_-20px_rgb(0_0_0/0.35)] hover:delay-100 has-[:focus-visible]:w-[248px] has-[[aria-expanded=true]]:w-[248px]'
        } ${user?.impersonating ? 'top-9 h-[calc(100%-2.25rem)]' : 'top-0 h-full'}`}
      >
        <SlimSidebar pinned={sidebarOpen} onTogglePin={tourActive ? undefined : toggleSidebar} />
      </aside>

      <MobileTabBar moreOpen={moreOpen} onMoreOpenChange={setMoreOpen} />

      <div className={`min-w-0 transition-[margin] duration-200 ease-out motion-reduce:transition-none ${sidebarOpen ? 'lg:ml-[248px]' : 'lg:ml-[76px]'} ${user?.impersonating ? 'pt-9' : ''}`}>
        {!headerShown && <div className="flex items-center gap-3 border-b border-border px-4 py-3 lg:hidden">
          <img src={vistrowMark} alt="" className="h-7 w-7 rounded-lg" />
          <span className="font-semibold tracking-tight">{BRAND.name}</span>
        </div>}
        {/* HelpChatWidget floats fixed bottom-right on every dashboard page
            (bottom-3/right-3, sm:bottom-6/right-6) - without reserved space
            here, whatever a page happens to render in that corner (a
            status badge, a stat, a form's action buttons) sits directly
            under it. This padding is sized to clear the widget's launcher
            button plus its own margin at both breakpoints. */}
        {/* Phones also clear the bottom tab bar (MobileTabBar). */}
        <main className="pb-32 sm:pb-36 lg:pb-28">
          <MobileNavContext.Provider value={mobileNav}>{children}</MobileNavContext.Provider>
        </main>
      </div>
      {user && user.onboarded && !user.tourCompleted && <DashboardTour />}
      {user && <HelpChatWidget />}
    </div>
  )
}

/** The dashboard shell: sidebar, header, content. Inside a Settings tab (see Embedded) the page
 * is drawn without it, because Settings already provides the shell. */
export function DashboardLayout({ children }: { children: ReactNode }) {
  const embedded = useEmbedded()
  return embedded ? <>{children}</> : <FullDashboardLayout>{children}</FullDashboardLayout>
}
