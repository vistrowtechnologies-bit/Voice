import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { NAV_GROUPS } from './navGroups'
import { CommandPalette } from './CommandPalette'
import { NotificationBell } from './NotificationBell'
import type { ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { fetchBilling } from '../lib/api'
import { useNavigate } from 'react-router-dom'
import { BRAND } from '../lib/brand'
import { adminExitImpersonation } from '../lib/adminApi'
import { useAuth } from '../lib/auth'
import { applyTheme, getStoredTheme, useTheme } from '../lib/theme'
import { DashboardTour } from './DashboardTour'
import { HelpChatWidget } from './HelpChatWidget'
import { Icon } from './Icon'
import { OnboardingModal } from './OnboardingModal'
import vistrowMark from '../assets/vistrow-mark.png'

/** Desktop sidebar state, shared with PageHeader so the "open sidebar"
 * button can sit in the top bar while the sidebar is slid away — the way the
 * Claude desktop app does it. */
const SidebarContext = createContext<{ open: boolean; toggle: () => void }>({ open: true, toggle: () => {} })

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
    <button
      onClick={() => applyTheme(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-border bg-surface text-text-muted transition-colors hover:border-primary hover:text-primary sm:h-8 sm:w-8"
    >
      {/* key remount replays the spin-in animation every toggle, not just once. */}
      <Icon key={theme} name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="theme-icon-pop text-[17px]" />
    </button>
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

function SidebarContent({ onNavigate, onClose }: { onNavigate?: () => void; onClose?: () => void }) {
  const { user } = useAuth()
  return (
    <>
      <div className="mb-5 flex h-10 items-center gap-2 pl-2">
        <img src={vistrowMark} alt="" className="h-8 w-8 rounded-lg" />
        <div className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold leading-tight tracking-tight">{BRAND.name}</span>
          <span className="block text-[10px] uppercase tracking-widest text-text-muted">Enterprise</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close sidebar"
            title={`Close sidebar (${TOGGLE_SHORTCUT})`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-high hover:text-primary"
          >
            <Icon name="left_panel_close" className="text-[20px]" />
          </button>
        )}
      </div>
      <nav className="flex min-w-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto pb-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <div className="mb-1 flex h-6 items-center px-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">{group.title}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/dashboard'}
                  onClick={onNavigate}
                  data-tour={item.tour}
                  className={({ isActive }) =>
                    `flex w-full min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                      isActive
                        ? 'bg-surface-high font-medium text-text shadow-[inset_3px_0_0_var(--color-primary)]'
                        : 'text-text-muted hover:bg-surface-high hover:text-text'
                    }`
                  }
                >
                  <Icon name={item.icon} className="shrink-0 text-[19px]" />
                  <span className="min-w-0 truncate">{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
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
  const sidebar = useContext(SidebarContext)
  // Agent creation belongs to the Agents page. Showing it on the overview
  // duplicated Quick actions and displaced dashboard-specific controls.
  const showNewAgent = pathname === '/dashboard/agents'

  useEffect(() => {
    fetchBilling()
      .then((b) => setCredits(b.creditsRemaining))
      .catch(() => setCredits(null))
  }, [refreshSignal])

  return (
    <header className="sticky top-0 z-20 flex flex-col gap-3 border-b border-border bg-bg/90 px-4 py-4 backdrop-blur-xl sm:flex-row sm:items-center sm:px-6">
      {!sidebar.open && (
        <button
          onClick={sidebar.toggle}
          aria-label="Open sidebar"
          title={`Open sidebar (${TOGGLE_SHORTCUT})`}
          className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-text-muted transition-colors hover:border-primary hover:text-primary lg:flex"
        >
          <Icon name="left_panel_open" className="text-[20px]" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-lg font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs leading-snug text-text-muted sm:truncate">{subtitle}</p>}
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:gap-3">
        {credits !== null && (
          <span className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text-muted">
            <Icon name="toll" className="text-[15px] text-cyan" />
            {credits} credits
          </span>
        )}
        <NotificationBell />
        <ThemeSwitcher />
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
      </div>
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
    navigate('/admin')
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
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [mobileNavOpen])

  // Theme is a dashboard-only preference - apply the stored choice on mount
  // and revert to the designed dark look on unmount so the public
  // landing/call pages are never affected by it.
  useEffect(() => {
    applyTheme(getStoredTheme(), false)
    return () => document.documentElement.removeAttribute('data-theme')
  }, [])

  return (
    <SidebarContext.Provider value={{ open: sidebarOpen, toggle: toggleSidebar }}>
    <div data-dashboard-root className="min-h-screen bg-bg text-text">
      {/* Mounted once for the whole dashboard - it is keyboard-summoned, so
          it has no trigger in the layout and renders nothing until opened. */}
      <CommandPalette />
      {user?.impersonating && <ImpersonationBanner accountName={user.accountName} />}
      <aside
        data-dashboard-sidebar
        aria-hidden={!sidebarOpen || undefined}
        inert={!sidebarOpen || undefined}
        className={`fixed left-0 z-30 hidden w-[248px] flex-col overflow-x-hidden border-r border-border bg-surface px-2 py-3 transition-transform duration-200 ease-out motion-reduce:transition-none lg:flex ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } ${user?.impersonating ? 'top-9 h-[calc(100%-2.25rem)]' : 'top-0 h-full'}`}
      >
        <SidebarContent onClose={tourActive ? undefined : toggleSidebar} />
      </aside>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="flex w-64 flex-col overflow-x-hidden overflow-y-auto bg-surface p-4">
            <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
          </div>
          <button
            aria-label="Close navigation"
            className="flex-1 bg-black/60"
            onClick={() => setMobileNavOpen(false)}
          />
        </div>
      )}

      <div className={`min-w-0 transition-[margin] duration-200 ease-out motion-reduce:transition-none ${sidebarOpen ? 'lg:ml-[248px]' : 'lg:ml-0'} ${user?.impersonating ? 'pt-9' : ''}`}>
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
    </SidebarContext.Provider>
  )
}
