import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { fetchBilling } from '../lib/api'
import { applyTheme, getStoredTheme, useTheme } from '../lib/theme'
import { Icon } from './Icon'

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

const NAV_GROUPS: { title: string; items: { to: string; label: string; icon: string }[] }[] = [
  {
    title: 'Platform',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
      { to: '/dashboard/agents', label: 'Agents', icon: 'smart_toy' },
      { to: '/dashboard/knowledge', label: 'Knowledge Base', icon: 'menu_book' },
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
      { to: '/dashboard/integrations', label: 'Integrations', icon: 'extension' },
      { to: '/dashboard/website-widget', label: 'Website Widget', icon: 'widgets' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { to: '/dashboard/numbers', label: 'Phone Numbers', icon: 'dialpad' },
      { to: '/dashboard/billing', label: 'Billing', icon: 'credit_card' },
    ],
  },
]

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <Icon name="auto_awesome" className="text-bg text-[18px]" />
        </div>
        <div>
          <span className="block text-base font-semibold leading-tight tracking-tight">Arthale Voice</span>
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
      <div className="flex items-center gap-2 border-t border-border pt-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
          AH
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Arthale Homes</p>
          <p className="text-[11px] text-text-muted">Admin</p>
        </div>
      </div>
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
    <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-border bg-bg/80 px-4 py-4 backdrop-blur-xl sm:px-6">
      <div className="min-w-0 flex-1">
        <h1 className="text-lg font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="truncate text-xs text-text-muted">{subtitle}</p>}
      </div>
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
    </header>
  )
}

export function DashboardLayout({ children }: { children: ReactNode }) {
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
      <aside className="fixed left-0 top-0 hidden h-full w-60 flex-col border-r border-border bg-surface p-4 lg:flex">
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

      <div className="min-w-0 lg:ml-60">
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
          <span className="font-semibold tracking-tight">Arthale Voice</span>
        </div>
        <main>{children}</main>
      </div>
    </div>
  )
}
