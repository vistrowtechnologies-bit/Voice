import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
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
      className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-border bg-surface text-text-muted transition-colors hover:border-primary hover:text-primary"
    >
      {/* key remount replays the spin-in animation every toggle, not just once. */}
      <Icon key={theme} name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="theme-icon-pop text-[17px]" />
    </button>
  )
}

const NAV_GROUPS: { title: string; items: { to: string; label: string; icon: string; tour?: string }[] }[] = [
  {
    title: 'Platform',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: 'dashboard', tour: 'nav-dashboard' },
      { to: '/dashboard/agents', label: 'Agents', icon: 'smart_toy', tour: 'nav-agents' },
      { to: '/dashboard/voices', label: 'Voices', icon: 'graphic_eq', tour: 'nav-voices' },
      { to: '/dashboard/knowledge', label: 'Knowledge Base', icon: 'menu_book', tour: 'nav-knowledge' },
    ],
  },
  {
    title: 'Campaigns',
    items: [
      { to: '/dashboard/inbound', label: 'Inbound', icon: 'phone_callback' },
      { to: '/dashboard/outbound', label: 'Outbound', icon: 'campaign' },
    ],
  },
  {
    title: 'Management',
    items: [
      { to: '/dashboard/calls', label: 'All Calls History', icon: 'history' },
      { to: '/dashboard/contacts', label: 'Contacts', icon: 'contacts' },
      { to: '/dashboard/appointments', label: 'Appointments', icon: 'event' },
      { to: '/dashboard/integrations', label: 'Integrations', icon: 'extension', tour: 'nav-integrations' },
      { to: '/dashboard/website-widget', label: 'Website Widget', icon: 'widgets' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { to: '/dashboard/numbers', label: 'Phone Numbers', icon: 'dialpad' },
      { to: '/dashboard/compliance', label: 'Compliance', icon: 'verified_user' },
      { to: '/dashboard/billing', label: 'Billing', icon: 'credit_card' },
      { to: '/dashboard/settings', label: 'Settings', icon: 'settings', tour: 'nav-settings' },
    ],
  },
]

function AccountMenu({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
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
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
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
        aria-label={collapsed ? `${workspace} account menu` : undefined}
        title={collapsed ? `${workspace} account menu` : undefined}
        className={`flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left transition-colors hover:bg-surface-high ${collapsed ? 'justify-center' : ''}`}
      >
        {user?.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full border border-primary/30 object-cover" />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
            {initials(workspace)}
          </div>
        )}
        <div className={`min-w-0 flex-1 ${collapsed ? 'hidden' : ''}`}>
          <p className="truncate text-sm font-semibold">{workspace}</p>
          <p className="truncate text-[11px] text-text-muted">{user?.name || 'Admin'}</p>
        </div>
        <Icon name={open ? 'expand_more' : 'expand_less'} className={`text-[18px] text-text-muted ${collapsed ? 'hidden' : ''}`} />
      </button>

      {open && (
        <div className={`absolute bottom-full z-20 mb-2 overflow-hidden rounded-xl border border-border bg-surface shadow-lg ${collapsed ? 'left-0 w-60' : 'left-0 w-full'}`}>
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
              onClick={() => go('/dashboard/settings?tab=profile')}
              className="flex items-center gap-2.5 px-3 py-2 text-left text-sm text-text transition-colors hover:bg-surface-high"
            >
              <Icon name="person" className="text-[17px] text-text-muted" />
              My profile
            </button>
            <button
              onClick={() => go('/dashboard/settings?tab=general')}
              className="flex items-center gap-2.5 px-3 py-2 text-left text-sm text-text transition-colors hover:bg-surface-high"
            >
              <Icon name="business" className="text-[17px] text-text-muted" />
              Workspace settings
            </button>
            <button
              onClick={() => go('/dashboard/settings?tab=team')}
              className="flex items-center gap-2.5 px-3 py-2 text-left text-sm text-text transition-colors hover:bg-surface-high"
            >
              <Icon name="group" className="text-[17px] text-text-muted" />
              Team & access
            </button>
          </div>
          <div className="border-t border-border py-1">
            <button
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

function SidebarContent({
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: {
  onNavigate?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}) {
  const { user } = useAuth()
  return (
    <>
      <div className={`relative flex items-center ${collapsed ? 'mb-12 justify-center' : 'mb-6 gap-2 px-2'}`}>
        <img src={vistrowMark} alt="" className="h-8 w-8 rounded-lg" />
        <div className={collapsed ? 'hidden' : ''}>
          <span className="block text-base font-semibold leading-tight tracking-tight">{BRAND.name}</span>
          <span className="block text-[10px] uppercase tracking-widest text-text-muted">Enterprise</span>
        </div>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-text-muted transition-colors hover:border-border hover:bg-surface-high hover:text-primary ${collapsed ? 'absolute right-0 top-full mt-2 border-border bg-surface shadow-sm' : 'ml-auto'}`}
          >
            <Icon name={collapsed ? 'keyboard_double_arrow_right' : 'keyboard_double_arrow_left'} className="text-[17px]" />
          </button>
        )}
      </div>
      <nav className={`flex flex-1 flex-col overflow-y-auto pb-4 ${collapsed ? 'gap-3' : 'gap-4'}`}>
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <p className={`mb-1 px-3 text-[10px] font-bold uppercase tracking-widest text-text-muted ${collapsed ? 'sr-only' : ''}`}>
              {group.title}
            </p>
            <div className={`flex flex-col gap-0.5 ${collapsed ? 'border-t border-border pt-2 first:border-t-0 first:pt-0' : ''}`}>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/dashboard'}
                  onClick={onNavigate}
                  data-tour={item.tour}
                  aria-label={collapsed ? item.label : undefined}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    `flex items-center rounded-lg py-2 text-sm transition-colors ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} ${
                      isActive
                        ? 'border-l-[3px] border-primary bg-surface-high text-text'
                        : 'text-text-muted hover:bg-surface-high'
                    }`
                  }
                >
                  <Icon name={item.icon} className="text-[19px]" />
                  <span className={collapsed ? 'sr-only' : ''}>{item.label}</span>
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
          aria-label={collapsed ? 'Admin panel' : undefined}
          title={collapsed ? 'Admin panel' : undefined}
          className={`mb-3 flex items-center rounded-lg border border-destructive/40 bg-destructive/10 py-2 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/20 ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'}`}
        >
          <Icon name="shield_person" className="text-[19px]" />
          <span className={collapsed ? 'sr-only' : ''}>Admin panel</span>
        </NavLink>
      )}
      <AccountMenu onNavigate={onNavigate} collapsed={collapsed} />
    </>
  )
}

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children?: ReactNode
}) {
  const [credits, setCredits] = useState<number | null>(null)

  useEffect(() => {
    fetchBilling()
      .then((b) => setCredits(b.creditsRemaining))
      .catch(() => setCredits(null))
  }, [])

  return (
    <header className="sticky top-0 z-20 flex flex-col gap-3 border-b border-border bg-bg/80 px-4 py-4 backdrop-blur-xl sm:flex-row sm:items-center sm:px-6">
      <div className="min-w-0 flex-1">
        <h1 className="text-lg font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="truncate text-xs text-text-muted">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {credits !== null && (
          <span className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text-muted">
            <Icon name="toll" className="text-[15px] text-cyan" />
            {credits} credits
          </span>
        )}
        <ThemeSwitcher />
        {children}
        <Link
          to="/dashboard/agents?new=1"
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90"
        >
          <Icon name="add" className="text-[18px]" />
          New Agent
        </Link>
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
  const [sidebarHoverExpanded, setSidebarHoverExpanded] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem('vistrow.sidebar.collapsed') === 'true',
  )

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current
      if (typeof window !== 'undefined') localStorage.setItem('vistrow.sidebar.collapsed', String(next))
      return next
    })
  }

  const closeHoverSidebar = (nextTarget: EventTarget | null) => {
    // Keep the expanded rail available while moving between its controls.
    // It only returns to icons after the pointer/focus actually leaves it.
    if (nextTarget instanceof Element && nextTarget.closest('[data-dashboard-sidebar]')) return
    setSidebarHoverExpanded(false)
  }

  // Theme is a dashboard-only preference - apply the stored choice on mount
  // and revert to the designed dark look on unmount so the public
  // landing/call pages are never affected by it.
  useEffect(() => {
    applyTheme(getStoredTheme(), false)
    return () => document.documentElement.removeAttribute('data-theme')
  }, [])

  return (
    <div className="min-h-screen bg-bg text-text">
      {user?.impersonating && <ImpersonationBanner accountName={user.accountName} />}
      <aside
        data-dashboard-sidebar
        onMouseEnter={() => sidebarCollapsed && setSidebarHoverExpanded(true)}
        onMouseLeave={(event) => closeHoverSidebar(event.relatedTarget)}
        onFocusCapture={() => sidebarCollapsed && setSidebarHoverExpanded(true)}
        onBlurCapture={(event) => closeHoverSidebar(event.relatedTarget)}
        className={`fixed left-0 hidden flex-col border-r border-border bg-surface transition-[width,box-shadow] duration-200 ease-out lg:flex ${sidebarCollapsed && !sidebarHoverExpanded ? 'w-[76px] p-3' : 'z-30 w-60 p-4 shadow-2xl'} ${
          user?.impersonating ? 'top-9 h-[calc(100%-2.25rem)]' : 'top-0 h-full'
        }`}
      >
        <SidebarContent collapsed={sidebarCollapsed && !sidebarHoverExpanded} onToggleCollapse={toggleSidebar} />
      </aside>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="flex w-64 flex-col overflow-y-auto bg-surface p-4">
            <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
          </div>
          <button
            aria-label="Close navigation"
            className="flex-1 bg-black/60"
            onClick={() => setMobileNavOpen(false)}
          />
        </div>
      )}

      <div className={`min-w-0 transition-[margin] duration-200 ease-out ${sidebarCollapsed ? 'lg:ml-[76px]' : 'lg:ml-60'} ${user?.impersonating ? 'pt-9' : ''}`}>
        <div className="flex items-center gap-3 border-b border-border px-4 py-3 lg:hidden">
          <button
            aria-label="Open navigation"
            onClick={() => setMobileNavOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-muted"
          >
            <Icon name="menu" />
          </button>
          <img src={vistrowMark} alt="" className="h-7 w-7 rounded-lg" />
          <span className="font-semibold tracking-tight">{BRAND.name}</span>
        </div>
        <main>{children}</main>
      </div>
      {user && !user.onboarded && <OnboardingModal />}
      {user && user.onboarded && !user.tourCompleted && <DashboardTour />}
      {user && <HelpChatWidget />}
    </div>
  )
}
