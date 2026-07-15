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

function initials(name: string): string {
  return (name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('') || '?').toUpperCase()
}

function ThemeSwitcher() {
  const theme = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      onClick={() => applyTheme(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-text-muted transition-colors hover:border-primary hover:text-primary"
    >
      <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="text-[17px]" />
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
        className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left transition-colors hover:bg-surface-high"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
          {initials(workspace)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{workspace}</p>
          <p className="truncate text-[11px] text-text-muted">{user?.name || 'Admin'}</p>
        </div>
        <Icon name={open ? 'expand_more' : 'expand_less'} className="text-[18px] text-text-muted" />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-2 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
              {initials(workspace)}
            </div>
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
              Profile
            </button>
            <button
              onClick={() => go('/dashboard/settings')}
              className="flex items-center gap-2.5 px-3 py-2 text-left text-sm text-text transition-colors hover:bg-surface-high"
            >
              <Icon name="settings" className="text-[17px] text-text-muted" />
              Settings
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

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth()
  return (
    <>
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <Icon name="auto_awesome" className="text-bg text-[18px]" />
        </div>
        <div>
          <span className="block text-base font-semibold leading-tight tracking-tight">{BRAND.name}</span>
          <span className="block text-[10px] uppercase tracking-widest text-text-muted">Enterprise</span>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto pb-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-widest text-text-muted">
              {group.title}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/dashboard'}
                  onClick={onNavigate}
                  data-tour={item.tour}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                      isActive
                        ? 'border-l-[3px] border-primary bg-surface-high text-text'
                        : 'text-text-muted hover:bg-surface-high'
                    }`
                  }
                >
                  <Icon name={item.icon} className="text-[19px]" />
                  {item.label}
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
          Admin panel
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
        Support session — viewing <strong>{accountName}</strong>. Actions are logged.
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

  // Theme is a dashboard-only preference — apply the stored choice on mount
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
        className={`fixed left-0 hidden w-60 flex-col border-r border-border bg-surface p-4 lg:flex ${
          user?.impersonating ? 'top-9 h-[calc(100%-2.25rem)]' : 'top-0 h-full'
        }`}
      >
        <SidebarContent />
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

      <div className={`min-w-0 lg:ml-60 ${user?.impersonating ? 'pt-9' : ''}`}>
        <div className="flex items-center gap-3 border-b border-border px-4 py-3 lg:hidden">
          <button
            aria-label="Open navigation"
            onClick={() => setMobileNavOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-muted"
          >
            <Icon name="menu" />
          </button>
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
            <Icon name="auto_awesome" className="text-bg text-[16px]" />
          </div>
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
