import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import vistrowMark from '../assets/vistrow-mark.png'
import { useAuth } from '../lib/auth'
import { applyTheme, getStoredTheme } from '../lib/theme'
import { Icon } from './Icon'
import { ThemeSwitcher } from './DashboardLayout'

const NAV_GROUPS: { title: string; items: { to: string; label: string; icon: string; end?: boolean }[] }[] = [
  { title: 'Overview', items: [{ to: '/admin', label: 'Dashboard', icon: 'dashboard', end: true }] },
  {
    title: 'Tenants',
    items: [
      { to: '/admin/accounts', label: 'Accounts', icon: 'apartment' },
      { to: '/admin/users', label: 'Users', icon: 'group' },
      { to: '/admin/calls', label: 'All Calls', icon: 'call' },
    ],
  },
  {
    title: 'Insight',
    items: [
      { to: '/admin/analytics', label: 'Analytics', icon: 'monitoring' },
      { to: '/admin/billing', label: 'Billing', icon: 'payments' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { to: '/admin/audit', label: 'Support & Audit', icon: 'support_agent' },
      { to: '/admin/health', label: 'System Health', icon: 'health_and_safety' },
      { to: '/admin/vendor-credits', label: 'Vendor Credits', icon: 'account_balance_wallet' },
      { to: '/admin/settings', label: 'Settings', icon: 'settings' },
    ],
  },
]

function SidebarLink({ to, label, icon, end, onNavigate }: { to: string; label: string; icon: string; end?: boolean; onNavigate?: () => void }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          isActive ? 'bg-primary/12 text-primary' : 'text-text-muted hover:bg-surface-high hover:text-text'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-primary" />}
          <Icon name={icon} className="text-[19px]" />
          {label}
        </>
      )}
    </NavLink>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 flex items-center gap-2 px-1">
        <img src={vistrowMark} alt="" className="h-8 w-8 rounded-lg" />
        <div className="leading-tight">
          <div className="font-display text-sm font-bold">Vistrow Admin</div>
          <div className="text-[10px] uppercase tracking-widest text-text-muted">Platform Control</div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto">
        {NAV_GROUPS.map((g) => (
          <div key={g.title} className="flex flex-col gap-1">
            <span className="px-3 text-[10px] font-bold uppercase tracking-widest text-text-muted/70">{g.title}</span>
            {g.items.map((it) => (
              <SidebarLink key={it.to} {...it} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>

      <div className="mt-4 border-t border-border pt-3">
        <div className="flex items-center gap-2 px-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-high text-xs font-bold text-primary">
            {(user?.name || 'A')[0].toUpperCase()}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-xs font-semibold">{user?.name}</div>
            <div className="truncate text-[10px] text-text-muted">{user?.email}</div>
          </div>
          <button
            onClick={async () => {
              await logout()
              navigate('/login')
            }}
            aria-label="Log out"
            className="text-text-muted transition-colors hover:text-destructive"
          >
            <Icon name="logout" className="text-[18px]" />
          </button>
        </div>
      </div>
    </div>
  )
}

/** Full-screen admin shell: persistent red "Mission Control" bar, 240px sidebar,
 * fluid content. Applies the same stored light/dark preference as the tenant
 * dashboard (dark by default) and restores whatever was set before on exit. */
export function AdminLayout({ children }: { children: ReactNode }) {
  const [mobileNav, setMobileNav] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const prev = document.documentElement.getAttribute('data-theme')
    applyTheme(getStoredTheme(), false)
    return () => {
      if (prev) document.documentElement.setAttribute('data-theme', prev)
      else document.documentElement.removeAttribute('data-theme')
    }
  }, [])

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Admin status bar — the one place red appears, signalling you are NOT in a tenant view. */}
      <div className="fixed inset-x-0 top-0 z-50 flex h-8 items-center justify-between bg-destructive px-4 text-white">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest">
          <Icon name="grid_view" className="text-[14px]" />
          Vistrow Admin · Platform Control
        </div>
        <div className="flex items-center gap-3">
          <ThemeSwitcher />
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-1 text-[11px] font-semibold hover:underline"
          >
            <Icon name="logout" className="text-[14px]" />
            Exit to account
          </button>
        </div>
      </div>

      <aside className="fixed left-0 top-8 hidden h-[calc(100%-2rem)] w-60 flex-col border-r border-border bg-surface p-4 lg:flex">
        <SidebarContent />
      </aside>

      {mobileNav && (
        <div className="fixed inset-0 top-8 z-40 flex lg:hidden">
          <div className="flex w-64 flex-col overflow-y-auto bg-surface p-4">
            <SidebarContent onNavigate={() => setMobileNav(false)} />
          </div>
          <button aria-label="Close navigation" className="flex-1 bg-black/60" onClick={() => setMobileNav(false)} />
        </div>
      )}

      <div className="min-w-0 pt-8 lg:ml-60">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3 lg:hidden">
          <button
            aria-label="Open navigation"
            onClick={() => setMobileNav(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-muted"
          >
            <Icon name="menu" />
          </button>
          <span className="font-display font-bold">Vistrow Admin</span>
        </div>
        <main className="mx-auto max-w-[1400px] p-5 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
