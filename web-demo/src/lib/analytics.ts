// GA4 is loaded in index.html with send_page_view disabled - every page
// view, including the very first one, goes through here instead, so
// client-side navigations (Home -> Pricing -> Contact) are counted as
// separate views instead of collapsing into one.
declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

export function trackPageView(path: string): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  window.gtag('event', 'page_view', {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  })
}

// GA4 already has "qualify_lead" configured as a Key Event (set up directly
// in the GA4 UI), but nothing in this codebase ever fired it - the event
// existed only as a name with zero data behind it. Call this from the real
// moments a site visitor actually becomes a lead: signup, the contact/demo
// form, and a live demo call connecting.
export function trackQualifyLead(source: 'signup' | 'contact_form' | 'demo_call'): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  window.gtag('event', 'qualify_lead', { lead_source: source })
}
