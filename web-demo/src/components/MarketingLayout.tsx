import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Icon } from './Icon'
import { BRAND } from '../lib/brand'
import { NAV, FOOTER_COLUMNS } from '../lib/marketingContent'
import { pathBucket, hostBucket, BUCKET_HOST } from '../lib/hostBuckets'
import vistrowMark from '../assets/vistrow-mark.png'

// The official logo mark — used everywhere the brand appears (marketing
// site, dashboard, auth pages) for one consistent visual identity.
function OrbMark() {
  return <img src={vistrowMark} alt="" className="h-8 w-8 rounded-lg" />
}

// Every nav/footer/CTA link in this file must go through here instead of a
// bare <Link> — three cases:
//   1. Already absolute (Docs & Help → docs.vistrowvoice.com): real <a>,
//      opened in a new tab since it's a distinct site from the visitor's
//      point of view.
//   2. A relative path whose bucket (app/docs/marketing) differs from the
//      CURRENT hostname's bucket: also a real <a>, because a React Router
//      <Link> only swaps components client-side — it never re-hits
//      middleware.ts, so a plain <Link to="/login"> clicked while sitting on
//      docs.vistrowvoice.com would render the login page *under the docs
//      subdomain* instead of jumping to app.vistrowvoice.com/login. Forcing
//      a real navigation here is what keeps the address bar honest.
//   3. Same bucket as the current host: an ordinary client-side <Link>.
export function NavLink({ to, className, onClick, children }: { to: string; className?: string; onClick?: () => void; children: ReactNode }) {
  if (/^https?:\/\//.test(to)) {
    return (
      <a href={to} className={className} onClick={onClick} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    )
  }
  if (typeof window !== 'undefined') {
    const current = hostBucket(window.location.hostname)
    const target = pathBucket(to)
    if (target !== current) {
      const path = target === 'docs' ? '/' : to
      return (
        <a href={`https://${BUCKET_HOST[target]}${path}`} className={className} onClick={onClick}>
          {children}
        </a>
      )
    }
  }
  return (
    <Link to={to} className={className} onClick={onClick}>
      {children}
    </Link>
  )
}

function DesktopNav() {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <nav className="hidden items-center gap-1 lg:flex">
      {NAV.map((group) =>
        group.items ? (
          <div
            key={group.label}
            className="relative"
            onMouseEnter={() => setOpen(group.label)}
            onMouseLeave={() => setOpen(null)}
          >
            <button className="flex items-center gap-1 rounded-full px-4 py-2 text-sm text-text-muted transition-colors hover:text-text">
              {group.label}
              <Icon name="expand_more" className="text-[16px]" />
            </button>
            {open === group.label && (
              <div className="absolute left-1/2 top-full z-40 w-80 -translate-x-1/2 pt-2">
                <div className="grid gap-1 rounded-2xl border border-border bg-surface p-2 shadow-2xl">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className="flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-surface-high"
                    >
                      <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-surface-high text-primary">
                        <Icon name={item.icon ?? 'circle'} className="text-[18px]" />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-text">{item.label}</span>
                        {item.desc && (
                          <span className="mt-0.5 block text-xs leading-snug text-text-muted">{item.desc}</span>
                        )}
                      </span>
                    </NavLink>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <NavLink
            key={group.label}
            to={group.to ?? '#'}
            className="rounded-full px-4 py-2 text-sm text-text-muted transition-colors hover:text-text"
          >
            {group.label}
          </NavLink>
        ),
      )}
    </nav>
  )
}

function MobileNav({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute right-0 top-0 flex h-full w-80 max-w-[85%] flex-col overflow-y-auto border-l border-border bg-surface p-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <OrbMark />
            <span className="font-display text-lg font-semibold">{BRAND.name}</span>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text">
            <Icon name="close" className="text-[22px]" />
          </button>
        </div>
        <div className="flex flex-col gap-5">
          {NAV.map((group) => (
            <div key={group.label}>
              {group.items ? (
                <>
                  <p className="mb-2 text-xs font-bold uppercase tracking-widest text-text-muted">{group.label}</p>
                  <div className="flex flex-col gap-1">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={onClose}
                        className="rounded-lg px-2 py-2 text-sm text-text hover:bg-surface-high"
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                </>
              ) : (
                <NavLink
                  to={group.to ?? '#'}
                  onClick={onClose}
                  className="block text-sm font-semibold text-text"
                >
                  {group.label}
                </NavLink>
              )}
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-col gap-3">
          <NavLink
            to="/login"
            onClick={onClose}
            className="rounded-full border border-border px-5 py-2.5 text-center text-sm font-semibold text-text"
          >
            Sign in
          </NavLink>
          <NavLink
            to="/contact"
            onClick={onClose}
            className="rounded-full bg-gradient-to-br from-primary to-primary-dark px-5 py-2.5 text-center text-sm font-bold text-white"
          >
            Book a demo
          </NavLink>
        </div>
      </div>
    </div>
  )
}

function Header() {
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <>
      <div className="border-b border-border bg-primary/10 px-4 py-2 text-center text-xs text-text-muted">
        <span className="text-cyan">New</span> · {BRAND.name} now speaks 10 Indian languages{' '}
        <NavLink to="/product" className="font-semibold text-text hover:underline">
          →
        </NavLink>
      </div>
      <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3.5 md:px-8">
          <NavLink to="/" className="flex items-center gap-2">
            <OrbMark />
            <span className="font-display text-lg font-semibold tracking-tight">{BRAND.name}</span>
            <span className="hidden font-mono text-xs text-text-muted sm:inline">by Vistrow</span>
          </NavLink>

          <DesktopNav />

          <div className="flex items-center gap-2">
            <NavLink
              to="/login"
              className="hidden rounded-full px-4 py-2 text-sm font-semibold text-text-muted transition-colors hover:text-text sm:block"
            >
              Sign in
            </NavLink>
            <NavLink
              to="/contact"
              className="hidden rounded-full bg-gradient-to-br from-primary to-primary-dark px-5 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 sm:block"
            >
              Book a demo
            </NavLink>
            <button
              className="text-text-muted hover:text-text lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Icon name="menu" className="text-[24px]" />
            </button>
          </div>
        </div>
      </header>
      {mobileOpen && <MobileNav onClose={() => setMobileOpen(false)} />}
    </>
  )
}

function Footer() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-7xl px-5 py-14 md:px-8">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-7">
          <div className="col-span-2">
            <NavLink to="/" className="flex items-center gap-2">
              <OrbMark />
              <span className="font-display text-lg font-semibold">{BRAND.name}</span>
            </NavLink>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-text-muted">{BRAND.tagline}</p>
            <div className="mt-5 flex gap-3 text-text-muted">
              <a href="#" className="hover:text-text"><Icon name="public" className="text-[20px]" /></a>
              <a href="#" className="hover:text-text"><Icon name="mail" className="text-[20px]" /></a>
              <a href="#" className="hover:text-text"><Icon name="call" className="text-[20px]" /></a>
            </div>
          </div>
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">{col.title}</p>
              <ul className="flex flex-col gap-2">
                {col.links.map((link) => (
                  <li key={link.to}>
                    <NavLink to={link.to} className="text-sm text-text-muted transition-colors hover:text-text">
                      {link.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 border-t border-border pt-6 text-xs text-text-muted">
          © {new Date().getFullYear()} {BRAND.short}. All rights reserved.
        </div>
      </div>
    </footer>
  )
}

export function MarketingLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()

  // Marketing routes should always open at the top, not retain scroll from the
  // previous page (default browser behaviour on client-side nav).
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="min-h-screen bg-bg text-text">
      <Header />
      <main>{children}</main>
      <Footer />
    </div>
  )
}
