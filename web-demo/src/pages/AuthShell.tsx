import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { BRAND } from '../lib/brand'

/** Shared frame for the Login / Signup screens — centered card, brand mark,
 * and a subtle product pitch alongside on wide screens. Dark by default (it
 * lives outside the theme-scoped dashboard). */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-bg text-text">
      {/* Pitch panel — hidden on small screens */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden border-r border-border bg-surface p-10 lg:flex">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Icon name="auto_awesome" className="text-bg text-[20px]" />
          </div>
          <span className="text-lg font-semibold tracking-tight">{BRAND.name}</span>
        </Link>
        <div className="relative z-10">
          <h2 className="max-w-sm text-3xl font-bold leading-tight tracking-tight">{BRAND.tagline}</h2>
          <ul className="mt-6 flex flex-col gap-3 text-sm text-text-muted">
            {['Answer & qualify calls 24/7', '11 Indian languages', 'Web widget, phone, and campaigns', 'Every call logged & analyzed'].map(
              (f) => (
                <li key={f} className="flex items-center gap-2">
                  <Icon name="check_circle" className="text-[18px] text-cyan" />
                  {f}
                </li>
              ),
            )}
          </ul>
        </div>
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full opacity-30 blur-3xl"
          style={{ background: 'radial-gradient(circle, #a855f7, transparent 70%)' }}
        />
        <p className="relative z-10 text-xs text-text-muted">© {BRAND.short}. All rights reserved.</p>
      </div>

      {/* Form panel */}
      <div className="flex w-full flex-col items-center justify-center p-6 lg:w-1/2">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Icon name="auto_awesome" className="text-bg text-[18px]" />
            </div>
            <span className="font-semibold tracking-tight">{BRAND.name}</span>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1 mb-6 text-sm text-text-muted">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  )
}
