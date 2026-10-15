// First-touch marketing attribution: where a visitor came from the first
// time they reached the site (ad tags, click IDs, referring site, landing
// page). Kept in the browser until signup or onboarding sends it to the
// server, which stores it once per account.

const KEY = 'vv-first-touch'
const PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'msclkid']

export type Attribution = Record<string, string>

/** Call once on page load. Saves only the first visit that carries any
 * signal, so a later direct visit never erases an ad click. */
export function captureAttribution(): void {
  try {
    if (localStorage.getItem(KEY)) return
    const url = new URL(window.location.href)
    const data: Attribution = {}
    for (const key of PARAMS) {
      const value = url.searchParams.get(key)
      if (value) data[key] = value.slice(0, 300)
    }
    const referrer = document.referrer
    if (referrer && new URL(referrer).host !== window.location.host) data.referrer = referrer.slice(0, 300)
    data.landing_page = url.pathname.slice(0, 300)
    data.first_seen_at = new Date().toISOString()
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // Storage blocked (private mode): attribution is optional.
  }
}

export function getAttribution(): Attribution {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Attribution) : {}
  } catch {
    return {}
  }
}
