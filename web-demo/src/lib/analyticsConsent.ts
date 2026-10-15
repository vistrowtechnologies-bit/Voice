// Visitor's choice about analytics cookies (Google Analytics, Microsoft
// Clarity). Until 2026-10-14 both loaded on every page with no choice
// (docs/PRIVACY-AUDIT-2026-10-12.md section 8). Now nothing from either is
// loaded until the visitor presses Accept; Reject (or no answer) keeps them
// off. Vercel Web Analytics is cookieless and stores nothing in the browser,
// so it is not part of this choice.
//
// index.html reads the same storage key before the app boots so a returning
// visitor who accepted gets GA from the first page view. Keep the key and the
// GA id in sync with the inline script there.

import { useEffect, useState } from 'react'

export type AnalyticsChoice = 'granted' | 'denied'

export const ANALYTICS_CONSENT_KEY = 'vv-analytics-consent'
export const ANALYTICS_CONSENT_EVENT = 'vv-analytics-consent'
const GA_ID = 'G-YSY7Z22NS2'

// Storage can be blocked (private modes, sandboxed frames); the choice then
// lasts for this page view only.
let memoryChoice: AnalyticsChoice | null = null

export function getAnalyticsConsent(storage: Pick<Storage, 'getItem'> | null = safeStorage()): AnalyticsChoice | null {
  if (memoryChoice) return memoryChoice
  try {
    const value = storage?.getItem(ANALYTICS_CONSENT_KEY)
    return value === 'granted' || value === 'denied' ? value : null
  } catch {
    return null
  }
}

export function analyticsAllowed(): boolean {
  return getAnalyticsConsent() === 'granted'
}

export function setAnalyticsConsent(
  choice: AnalyticsChoice,
  storage: Pick<Storage, 'setItem'> | null = safeStorage(),
): void {
  memoryChoice = choice
  try {
    storage?.setItem(ANALYTICS_CONSENT_KEY, choice)
  } catch {
    /* blocked storage: the in-memory choice still applies to this page view */
  }
  if (typeof window === 'undefined') return
  if (choice === 'granted') {
    window.gtag?.('consent', 'update', { analytics_storage: 'granted' })
    loadGoogleAnalytics()
  }
  window.dispatchEvent(new CustomEvent(ANALYTICS_CONSENT_EVENT, { detail: choice }))
}

/** Adds gtag.js once. The gtag() stub and consent defaults are in index.html. */
export function loadGoogleAnalytics(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector('script[data-vv-ga]')) return
  const tag = document.createElement('script')
  tag.async = true
  tag.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
  tag.setAttribute('data-vv-ga', '')
  document.head.appendChild(tag)
}

/** Current analytics choice, updated when the visitor answers the banner. */
export function useAnalyticsConsent(): AnalyticsChoice | null {
  const [choice, setChoice] = useState<AnalyticsChoice | null>(() => getAnalyticsConsent())
  useEffect(() => {
    const onChange = () => setChoice(getAnalyticsConsent())
    window.addEventListener(ANALYTICS_CONSENT_EVENT, onChange)
    return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, onChange)
  }, [])
  return choice
}

/** Test hook: forget an in-memory choice. */
export function resetAnalyticsConsentForTests(): void {
  memoryChoice = null
}

function safeStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}
