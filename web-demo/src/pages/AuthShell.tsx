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

// Google's brand guidelines call for the original four-color "G" mark and a
// white/near-white button regardless of host theme — an outlined Material
// icon or a button recolored to match a dark app theme both read as "fake"
// Google sign-in, which is worse for trust than briefly breaking theme
// consistency. GitHub has no such mark-usage requirement, so it stays on the
// generic bordered-icon style.
function GoogleLogo({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 01-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  )
}

const SOCIAL_META: Record<string, { label: string; icon: string }> = {
  github: { label: 'Continue with GitHub', icon: 'code' },
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
      <div className="flex flex-col gap-3">
        {providers.map((p) => {
          if (p === 'google') {
            return (
              <a
                key={p}
                href="/api/auth/oauth/google/start"
                className="flex items-center justify-center gap-3 rounded-lg border border-[#dadce0] bg-white py-2.5 text-sm font-medium text-[#3c4043] shadow-sm transition-colors hover:bg-[#f8f8f8]"
              >
                <GoogleLogo className="h-[18px] w-[18px]" />
                Continue with Google
              </a>
            )
          }
          const meta = SOCIAL_META[p] || { label: `Continue with ${p}`, icon: 'login' }
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
