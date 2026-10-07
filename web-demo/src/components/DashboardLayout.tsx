import { useCallback, useEffect, useRef, useState } from 'react'
import { NAV_GROUPS } from './navGroups'
import { CommandMenuButton, CommandPalette } from './CommandPalette'
import { NotificationBell } from './NotificationBell'
import type { ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { fetchBilling } from '../lib/api'
import { useNavigate } from 'react-router-dom'
import { BRAND } from '../lib/brand'
import { adminExitImpersonation, takeSupportReturn } from '../lib/adminApi'
import { initClarity, stopClarityForStaff, tagClarityAccount } from '../lib/analytics'
import { useAuth } from '../lib/auth'
import { helpTopicFor } from '../lib/support'
import { applyTheme, getStoredTheme, useTheme } from '../lib/theme'
import { DashboardTour } from './DashboardTour'
import { HelpChatWidget } from './HelpChatWidget'
import { Icon } from './Icon'
import { OnboardingModal } from './OnboardingModal'
import vistrowMark from '../assets/vistrow-mark.png'
import { Tooltip } from './ui/Tooltip'

const SIDEBAR_KEY = 'vistrow.sidebar.collapsed'
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


function AccountMenu({ onNavigate }: { onNavigate?: () => void }) {
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
    onNavigate?.()
    navigate(to)
  }
  const handleLogout = async () => {
    setOpen(false)
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div ref={rootRef} className="relative border-t border-border pt-3">
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
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{workspace}</p>
          <p className="truncate text-[11px] text-text-muted">{user?.name || 'Admin'}</p>
        </div>
        <Icon name={open ? 'expand_more' : 'expand_less'} className="text-[18px] text-text-muted" />
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

function SidebarContent({ onNavigate, onClose, mobile = false }: { onNavigate?: () => void; onClose?: () => void; mobile?: boolean }) {
  const { user } = useAuth()
  const location = useLocation()
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set())
  const groupIcons: Record<string, string> = {
    'Workspace tools': 'settings_suggest',
  }
  const workspace = user?.accountName || BRAND.defaultWorkspace

  useEffect(() => {
    const activeGroup = NAV_GROUPS.find((group) => !group.pinned && !group.standalone && group.items.some((item) => location.pathname === item.to || (item.to !== '/dashboard' && location.pathname.startsWith(`${item.to}/`))))
    if (activeGroup) setExpandedGroups(new Set([activeGroup.title]))
  }, [location.pathname])

  const toggleGroup = (title: string) => setExpandedGroups((current) => {
    const next = new Set(current)
    if (next.has(title)) next.delete(title)
    else next.add(title)
    return next
  })

  return (
    <>
      <div className="mb-4 flex min-h-[62px] items-center gap-3 rounded-xl border border-border bg-bg/70 px-2.5 py-2">
        <img src={vistrowMark} alt="" className="h-9 w-9 shrink-0 rounded-xl shadow-sm" />
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold leading-tight tracking-tight">{workspace}</span>
          <span className="mt-1 flex items-center gap-1 truncate text-[10px] font-medium text-text-muted"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {BRAND.name} workspace</span>
        </div>
        {onClose && (
          <Tooltip content={mobile ? 'Close navigation' : `Close sidebar (${TOGGLE_SHORTCUT})`}><button
            onClick={onClose}
            aria-label={mobile ? 'Close navigation' : 'Close sidebar'}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-high hover:text-primary"
          >
            <Icon name={mobile ? 'close' : 'left_panel_close'} className="text-[20px]" />
          </button></Tooltip>
        )}
      </div>
      <nav aria-label="Main navigation" data-clarity-unmask="true" className="flex min-h-0 min-w-0 flex-1 flex-col gap-0.5 overflow-x-hidden overflow-y-auto pb-3 [scrollbar-color:var(--color-border)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border">
        {NAV_GROUPS.filter((group) => !group.pinned).map((group) => group.standalone ? (
          <div key={group.title} className={group.showHeading ? 'mb-0.5' : 'mb-1.5 border-b border-border pb-2'}>
            {group.showHeading && <p className="mb-0.5 px-3 pt-1.5 text-[10px] font-bold tracking-[0.13em] text-text-muted">{group.title}</p>}
            {group.items.map((item) => <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/dashboard'}
              onClick={onNavigate}
              data-tour={item.tour}
              className={({ isActive }) => `flex w-full min-w-0 items-center gap-3 rounded-lg px-3 py-1.5 text-[13px] transition-colors ${isActive ? 'bg-primary/10 font-semibold text-primary shadow-[inset_3px_0_0_var(--color-primary)]' : 'text-text-muted hover:bg-surface-high hover:text-text'}`}
            >
              <Icon name={item.icon} className={`shrink-0 text-[18px] ${location.pathname === item.to ? 'text-primary' : 'text-text-muted'}`} />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {location.pathname === item.to && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
            </NavLink>)}
          </div>
        ) : (
          <div key={group.title} className="rounded-xl">
            <button type="button" aria-expanded={expandedGroups.has(group.title)} onClick={() => toggleGroup(group.title)} className="group flex w-full min-w-0 items-center gap-3 rounded-lg px-3 py-1.5 text-left text-[13px] font-semibold text-text transition-colors hover:bg-surface-high">
              <Icon name={groupIcons[group.title] || 'apps'} className="shrink-0 text-[18px] text-text-muted transition-colors group-hover:text-primary" />
              <span className="min-w-0 flex-1 truncate">{group.title}</span>
              <Icon name={expandedGroups.has(group.title) ? 'keyboard_arrow_down' : 'keyboard_arrow_right'} className="shrink-0 text-[19px] text-text-muted" />
            </button>
            {expandedGroups.has(group.title) && <div className="ml-[26px] flex flex-col gap-0.5 border-l border-border pb-1.5 pl-2.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/dashboard'}
                  onClick={onNavigate}
                  data-tour={item.tour}
                  className={({ isActive }) =>
                    `flex w-full min-w-0 items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors ${
                      isActive
                        ? 'bg-primary/10 font-semibold text-primary shadow-[inset_2px_0_0_var(--color-primary)]'
                        : 'text-text-muted hover:bg-surface-high hover:text-text'
                    }`
                  }
                >
                  <Icon name={item.icon} className="shrink-0 text-[17px]" />
                  <span className="min-w-0 truncate">{item.label}</span>
                </NavLink>
              ))}
            </div>}
          </div>
        ))}
      </nav>
      <div className="mb-2 shrink-0 border-t border-border pt-2">
        {mobile ? (
          <a href="https://www.vistrowvoice.com/#live-demo" target="_blank" rel="noreferrer" className="flex min-h-10 items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 text-xs font-semibold text-primary hover:bg-primary/10">
            <Icon name="graphic_eq" className="text-[18px]" />
            <span className="min-w-0 flex-1 truncate">Try Artha live</span>
            <Icon name="north_east" className="text-[15px]" />
          </a>
        ) : <a href="https://www.vistrowvoice.com/#live-demo" target="_blank" rel="noreferrer" className="block rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-surface to-fuchsia-500/5 p-3 [@media(max-height:800px)]:p-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon name="graphic_eq" className="text-[17px]" /></span>
            <p className="min-w-0 flex-1 truncate text-xs font-semibold">Try Artha live</p>
            <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-emerald-700">LIVE DEMO</span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-text-muted [@media(max-height:800px)]:hidden">Talk with our voice agent in your browser—no setup needed.</p>
          <span className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-2.5 py-2 text-[11px] font-bold text-white shadow-sm transition hover:brightness-105 [@media(max-height:800px)]:hidden">Start live demo <Icon name="north_east" className="text-[14px]" /></span>
        </a>}
      </div>
      {user?.isPlatformOwner && !user?.impersonating && (
        <NavLink
          to="/admin"
          onClick={onNavigate}
          className="mb-3 flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/20"
        >
          <Icon name="shield_person" className="text-[19px]" />
          <span>Admin panel</span>
        </NavLink>
      )}
      <AccountMenu onNavigate={onNavigate} />
    </>
  )
}

/** The collapsed desktop sidebar: the same destinations as icons, each named
 * by a tooltip, so collapsing saves width without hiding navigation. */
function SidebarRail({ onExpand }: { onExpand: () => void }) {
  const { user } = useAuth()
  const workspace = user?.accountName || BRAND.defaultWorkspace
  const railLink = ({ isActive }: { isActive: boolean }) =>
    `flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
      isActive ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-surface-high hover:text-text'
    }`

  return (
    <>
      <img src={vistrowMark} alt="" className="mx-auto mb-2 h-9 w-9 shrink-0 rounded-xl shadow-sm" />
      <Tooltip side="right" content={`Open sidebar (${TOGGLE_SHORTCUT})`}><button
        onClick={onExpand}
        aria-label="Open sidebar"
        className="mx-auto mb-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-high hover:text-primary"
      >
        <Icon name="left_panel_open" className="text-[20px]" />
      </button></Tooltip>
      <nav aria-label="Main navigation" data-clarity-unmask="true" className="flex min-h-0 flex-1 flex-col items-center gap-0.5 overflow-y-auto border-t border-border pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {NAV_GROUPS.filter((group) => !group.pinned).map((group, index) => (
          <div key={group.title} className={`flex flex-col items-center gap-0.5 ${index ? 'mt-1.5 border-t border-border pt-1.5' : ''}`}>
            {group.items.map((item) => (
              <Tooltip key={item.to} side="right" content={item.label}><NavLink
                to={item.to}
                end={item.to === '/dashboard'}
                aria-label={item.label}
                data-tour={item.tour}
                className={railLink}
              >
                <Icon name={item.icon} className="text-[19px]" />
              </NavLink></Tooltip>
            ))}
          </div>
        ))}
      </nav>
      <div className="flex shrink-0 flex-col items-center gap-2 border-t border-border pt-2">
        {user?.isPlatformOwner && !user?.impersonating && (
          <Tooltip side="right" content="Admin panel"><NavLink
            to="/admin"
            aria-label="Admin panel"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-destructive/40 bg-destructive/10 text-destructive transition-colors hover:bg-destructive/20"
          >
            <Icon name="shield_person" className="text-[19px]" />
          </NavLink></Tooltip>
        )}
        <Tooltip side="right" content={workspace}><Link to="/dashboard/settings?tab=profile" aria-label="My profile" className="rounded-full">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="h-9 w-9 rounded-full border border-primary/30 object-cover" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">{initials(workspace)}</span>
          )}
        </Link></Tooltip>
      </div>
    </>
  )
}

export function PageHeader({
  title,
  subtitle,
  children,
  refreshSignal = 0,
}: {
  title: string
  subtitle?: string
  children?: ReactNode
  refreshSignal?: number
}) {
  const [credits, setCredits] = useState<number | null>(null)
  const { pathname } = useLocation()
  // Each page links to the help-centre topic that explains it.
  const helpTopic = helpTopicFor(pathname)
  // Agent creation belongs to the Agents page. Showing it on the overview
  // duplicated Quick actions and displaced dashboard-specific controls.
  const showNewAgent = pathname === '/dashboard/agents'

  useEffect(() => {
    fetchBilling()
      .then((b) => setCredits(b.creditsRemaining))
      .catch(() => setCredits(null))
  }, [refreshSignal])

  return (
    <header className="sticky top-0 z-20 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 border-b border-border bg-bg/90 px-4 py-3 backdrop-blur-xl sm:flex sm:flex-col sm:items-stretch sm:gap-3 sm:px-6 sm:py-4 xl:flex-row xl:items-center">
      <div className="min-w-0 flex-1">
        <h1 className="text-lg font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs leading-snug text-text-muted sm:truncate">{subtitle}</p>}
      </div>
      <div className="flex min-w-0 items-center justify-self-end gap-1 sm:w-full sm:gap-3 xl:w-auto">
        <CommandMenuButton />
        {credits !== null && (
          <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text-muted sm:flex" title={`${credits} credits`}>
            <Icon name="toll" className="text-[15px] text-cyan" />
            {credits} credits
          </span>
        )}
        {helpTopic && (
          <Tooltip content="Help for this page"><Link
            to={`/dashboard/support?topic=${helpTopic}`}
            aria-label="Help for this page"
            className="hidden h-8 items-center justify-center gap-1 rounded-full border border-border bg-surface px-3 text-xs font-semibold text-text-muted transition-colors hover:border-primary hover:text-primary sm:flex"
          >
            <Icon name="help" className="text-[17px]" /><span>Help</span>
          </Link></Tooltip>
        )}
        <NotificationBell />
      </div>
      {(children || showNewAgent) && <div className="col-span-2 flex w-full flex-wrap items-center gap-2 sm:gap-3 xl:w-auto">
        {children}
        {showNewAgent && (
          <Link
            to="/dashboard/agents?new=1"
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90"
          >
            <Icon name="add" className="text-[18px]" />
            New Agent
          </Link>
        )}
      </div>}
    </header>
  )
}

/** Sticky red bar shown to the platform owner while inside a tenant's account
 * via "View as". Exiting restores the owner's own session and returns to /admin. */
function ImpersonationBanner({ accountName }: { accountName: string }) {
  const { refresh } = useAuth()
  const navigate = useNavigate()
  const exit = async () => {
    await adminExitImpersonation().catch(() => {})
    await refresh()
    navigate(takeSupportReturn())
  }
  return (
    <div className="fixed inset-x-0 top-0 z-50 flex h-9 items-center justify-between bg-destructive px-4 text-white">
      <span className="flex items-center gap-2 text-xs font-semibold">
        <Icon name="visibility" className="text-[16px]" />
        Support session - viewing <strong>{accountName}</strong>. Actions are logged.
      </span>
      <button onClick={exit} className="flex items-center gap-1 text-xs font-bold hover:underline">
        <Icon name="logout" className="text-[15px]" /> Exit
      </button>
    </div>
  )
}

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === 'true'
    } catch {
      return false
    }
  })

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((current) => {
      const next = !current
      try {
        localStorage.setItem(SIDEBAR_KEY, String(next))
      } catch {
        // Private mode / blocked storage: the toggle still works this visit.
      }
      return next
    })
  }, [])

  // The first-run tour points at sidebar links, so it keeps the sidebar open.
  const tourActive = !!user && user.onboarded && !user.tourCompleted
  const sidebarOpen = !sidebarCollapsed || tourActive

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

  useEffect(() => {
    if (!mobileNavOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKey)
    }
  }, [mobileNavOpen])

  // Theme is a dashboard-only preference - apply the stored choice on mount
  // and revert to the designed dark look on unmount so the public
  // landing/call pages are never affected by it.
  useEffect(() => {
    applyTheme(getStoredTheme(), false)
    return () => document.documentElement.removeAttribute('data-theme')
  }, [])

  useEffect(() => {
    if (!user) return
    if (user.isPlatformOwner || user.impersonating) {
      stopClarityForStaff()
    } else {
      initClarity(window.location.pathname, true)
      tagClarityAccount(user.accountId, user.plan)
    }
  }, [user])

  return (
    <div data-dashboard-root className="min-h-screen bg-bg text-text">
      {/* Mounted once for the whole dashboard - it is keyboard-summoned, so
          it has no trigger in the layout and renders nothing until opened. */}
      <CommandPalette />
      {user?.impersonating && <ImpersonationBanner accountName={user.accountName} />}
      <aside
        data-dashboard-sidebar
        className={`fixed left-0 z-30 hidden flex-col overflow-x-hidden border-r border-border bg-surface py-3 transition-[width] duration-200 ease-out motion-reduce:transition-none lg:flex ${
          sidebarOpen ? 'w-[248px] px-2' : 'w-16 px-1'
        } ${user?.impersonating ? 'top-9 h-[calc(100%-2.25rem)]' : 'top-0 h-full'}`}
      >
        {sidebarOpen ? <SidebarContent onClose={tourActive ? undefined : toggleSidebar} /> : <SidebarRail onExpand={toggleSidebar} />}
      </aside>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-[70] flex lg:hidden">
          <div className="flex w-[min(20rem,calc(100vw-3rem))] flex-col overflow-x-hidden bg-surface p-3 sm:p-4">
            <SidebarContent mobile onClose={() => setMobileNavOpen(false)} onNavigate={() => setMobileNavOpen(false)} />
          </div>
          <button
            aria-label="Close navigation"
            className="flex-1 bg-black/60"
            onClick={() => setMobileNavOpen(false)}
          />
        </div>
      )}

      <div className={`min-w-0 transition-[margin] duration-200 ease-out motion-reduce:transition-none ${sidebarOpen ? 'lg:ml-[248px]' : 'lg:ml-16'} ${user?.impersonating ? 'pt-9' : ''}`}>
        <div className="flex items-center gap-3 border-b border-border px-4 py-3 lg:hidden">
          <button
            aria-label="Open navigation"
            onClick={() => setMobileNavOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-text-muted transition-colors hover:border-primary hover:text-primary"
          >
            <Icon name="menu" />
          </button>
          <img src={vistrowMark} alt="" className="h-7 w-7 rounded-lg" />
          <span className="font-semibold tracking-tight">{BRAND.name}</span>
        </div>
        {/* HelpChatWidget floats fixed bottom-right on every dashboard page
            (bottom-3/right-3, sm:bottom-6/right-6) - without reserved space
            here, whatever a page happens to render in that corner (a
            status badge, a stat, a form's action buttons) sits directly
            under it. This padding is sized to clear the widget's launcher
            button plus its own margin at both breakpoints. */}
        <main className="pb-24 sm:pb-28">{children}</main>
      </div>
      {user && !user.onboarded && <OnboardingModal />}
      {user && user.onboarded && !user.tourCompleted && <DashboardTour />}
      {user && <HelpChatWidget />}
    </div>
  )
}
