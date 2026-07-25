// GA4 is loaded in index.html with send_page_view disabled — every page
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
