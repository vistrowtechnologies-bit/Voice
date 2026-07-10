import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Icon } from './Icon'
import { BRAND } from '../lib/brand'
import { NAV, FOOTER_COLUMNS } from '../lib/marketingContent'

// Small orb logo mark — the same circular gradient motif as the call widget,
// so the marketing site, dashboard, and widget all share one visual identity.
function OrbMark() {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary-dark">
      <Icon name="graphic_eq" className="text-[18px] text-white" />
    </span>
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
                    <Link
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
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <Link
            key={group.label}
            to={group.to ?? '#'}
            className="rounded-full px-4 py-2 text-sm text-text-muted transition-colors hover:text-text"
          >
            {group.label}
          </Link>
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
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={onClose}
                        className="rounded-lg px-2 py-2 text-sm text-text hover:bg-surface-high"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </>
              ) : (
                <Link
                  to={group.to ?? '#'}
                  onClick={onClose}
                  className="block text-sm font-semibold text-text"
                >
                  {group.label}
                </Link>
              )}
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-col gap-3">
          <Link
            to="/login"
            onClick={onClose}
            className="rounded-full border border-border px-5 py-2.5 text-center text-sm font-semibold text-text"
          >
            Sign in
          </Link>
          <Link
            to="/contact"
            onClick={onClose}
            className="rounded-full bg-gradient-to-br from-primary to-primary-dark px-5 py-2.5 text-center text-sm font-bold text-white"
          >
            Book a demo
          </Link>
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
        <span className="text-cyan">New</span> · {BRAND.name} now speaks 30+ Indian languages{' '}
        <Link to="/product" className="font-semibold text-text hover:underline">
          →
        </Link>
      </div>
      <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3.5 md:px-8">
          <Link to="/" className="flex items-center gap-2">
            <OrbMark />
            <span className="font-display text-lg font-semibold tracking-tight">{BRAND.name}</span>
          </Link>

          <DesktopNav />

          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="hidden rounded-full px-4 py-2 text-sm font-semibold text-text-muted transition-colors hover:text-text sm:block"
            >
              Sign in
            </Link>
            <Link
              to="/contact"
              className="hidden rounded-full bg-gradient-to-br from-primary to-primary-dark px-5 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 sm:block"
            >
              Book a demo
            </Link>
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
        <div className="grid grid-cols-2 gap-10 md:grid-cols-6">
          <div className="col-span-2">
            <Link to="/" className="flex items-center gap-2">
              <OrbMark />
              <span className="font-display text-lg font-semibold">{BRAND.name}</span>
            </Link>
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
                    <Link to={link.to} className="text-sm text-text-muted transition-colors hover:text-text">
                      {link.label}
                    </Link>
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
