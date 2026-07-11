import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { BRAND } from '../lib/brand'
import { apiAuthConfig } from '../lib/auth'

/** Shared frame for the Login / Signup screens — a two-column dark-neon
 * layout: a brand/pitch panel on the left (headline, feature checklist, and a
 * soft violet orb glow) and the form on the right. Dark by default (it lives
 * outside the theme-scoped dashboard). */
export function AuthShell({
  title,
  subtitle,
  headline,
  features,
  children,
}: {
  title: string
  subtitle: string
  headline: ReactNode
  features: string[]
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-bg text-text">
      {/* Pitch panel — hidden on small screens */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden border-r border-border bg-surface p-10 lg:flex xl:p-14">
        <Link to="/" className="relative z-10 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Icon name="graphic_eq" className="text-bg text-[20px]" />
          </div>
          <span className="text-lg font-semibold tracking-tight">{BRAND.name}</span>
        </Link>

        <div className="relative z-10 max-w-md">
          <h2 className="font-display text-5xl font-bold leading-[1.05] tracking-tight">{headline}</h2>
          <ul className="mt-8 flex flex-col gap-4 text-base text-text-muted">
            {features.map((f) => (
              <li key={f} className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan/10">
                  <Icon name="check_circle" className="text-[18px] text-cyan" />
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Big soft orb glow, lower-left */}
        <div
          className="pointer-events-none absolute -bottom-24 left-0 h-[28rem] w-[28rem] rounded-full opacity-40 blur-[120px]"
          style={{ background: 'radial-gradient(circle, #a855f7, transparent 70%)' }}
        />
        <p className="relative z-10 text-xs uppercase tracking-widest text-text-muted">
          © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
        </p>
      </div>

      {/* Form panel */}
      <div className="flex w-full flex-col items-center justify-center p-6 lg:w-1/2">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Icon name="graphic_eq" className="text-bg text-[18px]" />
            </div>
            <span className="font-semibold tracking-tight">{BRAND.name}</span>
          </Link>
          <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1 mb-6 text-sm text-text-muted">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  )
}

const SOCIAL_META: Record<string, { label: string; icon: string }> = {
  google: { label: 'Google', icon: 'g_translate' },
  github: { label: 'GitHub', icon: 'code' },
}

/** "Or continue with" social buttons — only renders providers the server has
 * actually configured (via /auth/config), so there are never dead buttons.
 * Clicking sends the user to the backend OAuth start endpoint. */
export function SocialButtons() {
  const [providers, setProviders] = useState<string[]>([])

  useEffect(() => {
    apiAuthConfig()
      .then((c) => setProviders(c.oauthProviders))
      .catch(() => setProviders([]))
  }, [])

  if (providers.length === 0) return null

  return (
    <>
      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Or continue with</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className={`grid gap-3 ${providers.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {providers.map((p) => {
          const meta = SOCIAL_META[p] || { label: p, icon: 'login' }
          return (
            <a
              key={p}
              href={`/api/auth/oauth/${p}/start`}
              className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-high py-2.5 text-sm font-bold transition-colors hover:border-primary"
            >
              <Icon name={meta.icon} className="text-[18px]" />
              {meta.label}
            </a>
          )
        })}
      </div>
    </>
  )
}
