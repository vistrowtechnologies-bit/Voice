import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { initClarity, trackPageView } from '../lib/analytics'
import { setAnalyticsConsent, useAnalyticsConsent, type AnalyticsChoice } from '../lib/analyticsConsent'

/** Accept / Reject for Google Analytics and Microsoft Clarity. Shown until the
 * visitor answers; never on /admin, where analytics never runs. Rendered only
 * after mount, so prerendered pages do not contain it. */
export function AnalyticsConsentBanner() {
  const location = useLocation()
  const choice = useAnalyticsConsent()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted || choice !== null || location.pathname.startsWith('/admin')) return null

  const answer = (value: AnalyticsChoice) => {
    setAnalyticsConsent(value)
    if (value === 'granted') {
      // The page the visitor is on counts too. Dashboard pages start Clarity
      // from DashboardLayout once the signed-in user is known.
      initClarity(location.pathname)
      trackPageView(location.pathname + location.search)
    }
  }

  return (
    <div
      role="region"
      aria-label="Cookie choices"
      className="fixed bottom-4 left-4 z-[60] w-[calc(100%-6.5rem)] max-w-sm rounded-xl border border-border bg-surface p-4 text-sm text-text shadow-lg sm:w-auto"
    >
      <p className="text-xs leading-relaxed text-text-muted">
        We'd like to use Google Analytics and Microsoft Clarity cookies to see how people use this site. They only load
        if you accept.{' '}
        <Link to="/privacy" className="font-semibold text-primary hover:underline">
          Privacy Policy
        </Link>
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => answer('granted')}
          className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-bg transition-opacity hover:opacity-90"
        >
          Accept
        </button>
        <button
          type="button"
          onClick={() => answer('denied')}
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-text transition-colors hover:bg-surface-high"
        >
          Reject
        </button>
      </div>
    </div>
  )
}
