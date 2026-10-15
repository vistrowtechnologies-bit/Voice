// Analytics consent: GA and Clarity must not run until the visitor accepts.
// Run: npx tsx scripts/test-analytics-consent.mts
import assert from 'node:assert/strict'

type Store = Record<string, string>
const store: Store = {}
const calls: unknown[][] = []
const appended: string[] = []
const events: string[] = []
const fakeWindow = {
  localStorage: {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v
    },
  },
  location: { hostname: 'www.vistrowvoice.com', pathname: '/pricing', search: '', href: 'https://www.vistrowvoice.com/pricing' },
  gtag: (...args: unknown[]) => calls.push(args),
  dispatchEvent: (e: { type: string }) => events.push(e.type),
  addEventListener: () => {},
  removeEventListener: () => {},
}
const fakeDocument = {
  title: 'Pricing',
  querySelector: (sel: string) => (sel === 'script[data-vv-ga]' && appended.length ? {} : null),
  createElement: () => ({ setAttribute: () => {}, src: '' }) as unknown as HTMLScriptElement,
  head: { appendChild: (el: { src: string }) => appended.push(el.src) },
  body: { setAttribute: () => {} },
}
Object.assign(globalThis, { window: fakeWindow, document: fakeDocument })
if (!('CustomEvent' in globalThis)) {
  Object.assign(globalThis, { CustomEvent: class { type: string; constructor(t: string) { this.type = t } } })
}

const consent = await import('../src/lib/analyticsConsent.ts')
const analytics = await import('../src/lib/analytics.ts')

// No answer yet: nothing is sent, nothing is loaded.
assert.equal(consent.getAnalyticsConsent(), null)
analytics.trackPageView('/pricing')
analytics.trackQualifyLead('signup')
analytics.trackMarketingCta('book_demo', 'hero')
analytics.initClarity('/pricing')
assert.equal(calls.length, 0, 'no gtag call before consent')
assert.equal(appended.length, 0, 'no GA or Clarity script before consent')

// Reject: still nothing, and the choice is remembered.
consent.setAnalyticsConsent('denied')
assert.equal(store[consent.ANALYTICS_CONSENT_KEY], 'denied')
analytics.trackPageView('/pricing')
analytics.initClarity('/pricing')
assert.equal(calls.length, 0)
assert.equal(appended.length, 0)

// Accept: consent update, GA tag loaded once, page views flow, Clarity loads.
consent.resetAnalyticsConsentForTests()
delete store[consent.ANALYTICS_CONSENT_KEY]
consent.setAnalyticsConsent('granted')
assert.deepEqual(calls[0], ['consent', 'update', { analytics_storage: 'granted' }])
assert.equal(appended.filter((s) => s.includes('googletagmanager.com/gtag/js')).length, 1)
consent.loadGoogleAnalytics()
assert.equal(appended.filter((s) => s.includes('googletagmanager.com/gtag/js')).length, 1, 'GA tag added once')
analytics.trackPageView('/pricing')
assert.ok(calls.some((c) => c[0] === 'event' && c[1] === 'page_view'))
analytics.initClarity('/pricing')
assert.ok(appended.some((s) => s.includes('clarity.ms')), 'Clarity loads after accept')
assert.ok(events.includes(consent.ANALYTICS_CONSENT_EVENT))

// Blocked storage: reads return null instead of throwing, and a choice made
// on this page still holds in memory.
consent.resetAnalyticsConsentForTests()
const throwing = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
}
assert.equal(consent.getAnalyticsConsent(throwing), null)
consent.setAnalyticsConsent('denied', throwing)
assert.equal(consent.getAnalyticsConsent(throwing), 'denied')

console.log('analytics consent checks passed')
