import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { initClarity, trackPageView } from '../lib/analytics'
import { setCookieChoices, useAnalyticsConsent } from '../lib/analyticsConsent'
import { isAdminHost } from '../lib/adminHost'

/** Cookie choices: Accept all, Necessary only, or Customize per category.
 * Owner, 21 Oct 2026: no vendor names here, like other brands; the tools are
 * named on the Privacy Policy page. Shown until the visitor answers; never on
 * /admin, where analytics never runs. Rendered only after mount, so
 * prerendered pages do not contain it. */
export function AnalyticsConsentBanner() {
  const location = useLocation()
  const choice = useAnalyticsConsent()
  const [mounted, setMounted] = useState(false)
  const [customizing, setCustomizing] = useState(false)
  const [analytics, setAnalytics] = useState(true)
  const [sessions, setSessions] = useState(true)
  useEffect(() => setMounted(true), [])

  // Never on the admin panel, including the admin host's own sign-in page.
  if (!mounted || choice !== null || location.pathname.startsWith('/admin') || isAdminHost()) return null

  const answer = (choices: { analytics: boolean; sessions: boolean }) => {
    setCookieChoices(choices)
    // The page the visitor is on counts too. Dashboard pages start session
    // insights from DashboardLayout once the signed-in user is known.
    if (choices.sessions) initClarity(location.pathname)
    if (choices.analytics) trackPageView(location.pathname + location.search)
  }

  return (
    <div
      role="region"
      aria-label="Cookie choices"
      className="fixed bottom-4 left-4 z-[60] w-[calc(100%-6.5rem)] max-w-sm rounded-2xl border border-border bg-surface p-4 text-sm text-text shadow-xl sm:w-[24rem]"
    >
      <p className="font-display text-sm font-bold">Your cookie choices</p>
      <p className="mt-1 text-xs leading-relaxed text-text-muted">
        We use necessary cookies to run this site. With your OK, we also measure visits and see how pages are used, so
        we can improve them.{' '}
        <Link to="/privacy" className="bg-transparent font-semibold text-primary hover:underline">
          Privacy Policy
        </Link>
      </p>

      {customizing && (
        <ul className="mt-3 flex flex-col gap-1 rounded-xl border border-border bg-surface-high/30 p-2">
          <ChoiceRow label="Necessary" detail="Sign-in, security and your settings. Always on." checked locked />
          <ChoiceRow label="Analytics" detail="Counts visits and which pages help people." checked={analytics} onChange={setAnalytics} />
          <ChoiceRow label="Session insights" detail="Shows how pages are used, so we can fix confusing parts." checked={sessions} onChange={setSessions} />
        </ul>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        {customizing ? (
          <button
            type="button"
            onClick={() => answer({ analytics, sessions })}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-xs font-bold text-text transition-colors hover:bg-surface-high"
          >
            Save choices
          </button>
        ) : (
          <button
            type="button"
            onClick={() => answer({ analytics: false, sessions: false })}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-xs font-bold text-text transition-colors hover:bg-surface-high"
          >
            Necessary only
          </button>
        )}
        <button
          type="button"
          onClick={() => answer({ analytics: true, sessions: true })}
          className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-bg transition-opacity hover:opacity-90"
        >
          Accept all
        </button>
      </div>
      {!customizing && (
        <button
          type="button"
          onClick={() => setCustomizing(true)}
          className="mt-2 w-full bg-transparent text-center text-xs font-semibold text-text-muted hover:text-text"
        >
          Customize
        </button>
      )}
    </div>
  )
}

function ChoiceRow({ label, detail, checked, locked = false, onChange }: {
  label: string
  detail: string
  checked: boolean
  locked?: boolean
  onChange?: (value: boolean) => void
}) {
  return (
    <li>
      <label className={`flex items-start justify-between gap-3 rounded-lg px-2 py-1.5 ${locked ? '' : 'cursor-pointer'}`}>
        <span className="text-xs leading-snug">
          <span className="block font-bold">{label}</span>
          <span className="block text-text-muted">{detail}</span>
        </span>
        <input
          type="checkbox"
          checked={checked}
          disabled={locked}
          onChange={(e) => onChange?.(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-surface-high transition-colors peer-checked:bg-success peer-focus-visible:ring-4 peer-focus-visible:ring-primary/20 [&>span]:translate-x-[2px] peer-checked:[&>span]:translate-x-[18px] ${locked ? 'opacity-60' : ''}`}
        >
          <span className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform" />
        </span>
      </label>
    </li>
  )
}
