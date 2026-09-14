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

type PageArea = 'marketing' | 'app' | 'auth' | 'admin'

type LeadSource = 'signup' | 'contact_form' | 'demo_call'

export type MarketingCta =
  | 'book_demo'
  | 'join_beta'
  | 'talk_to_artha_live'
  | 'talk_to_sales'

function cleanPath(path: string): string {
  const pathOnly = path.split(/[?#]/)[0]
  return pathOnly || '/'
}

function classifyPageArea(path: string): PageArea {
  if (path.startsWith('/admin')) return 'admin'
  if (path.startsWith('/dashboard')) return 'app'
  if (
    path === '/login' ||
    path === '/signup' ||
    path === '/verify-email' ||
    path.startsWith('/auth/') ||
    path.startsWith('/reset-password')
  ) {
    return 'auth'
  }
  return 'marketing'
}

function classifyPageGroup(path: string): string {
  if (path === '/') return 'home'
  if (path.startsWith('/languages/')) return 'language_detail'
  if (path === '/languages') return 'languages'
  if (path.startsWith('/solutions/')) return 'solution_detail'
  if (path === '/solutions') return 'solutions'
  if (path.startsWith('/product/')) return 'product_detail'
  if (path === '/product') return 'product'
  if (path === '/pricing') return 'pricing'
  if (path === '/contact') return 'contact'
  if (path === '/about') return 'about'
  if (path === '/docs') return 'docs'
  if (path === '/login' || path === '/signup' || path === '/verify-email') return 'auth'
  if (path.startsWith('/dashboard')) return 'dashboard'
  if (path.startsWith('/admin')) return 'admin'
  return 'other'
}

function commonPageParams(path: string) {
  const pathOnly = cleanPath(path)
  const pageArea = classifyPageArea(pathOnly)
  return {
    page_area: pageArea,
    page_group: classifyPageGroup(pathOnly),
    site_area: pageArea === 'marketing' ? 'marketing' : 'product_app',
    is_marketing_page: pageArea === 'marketing',
  }
}

export function trackPageView(path: string): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  window.gtag('event', 'page_view', {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
    ...commonPageParams(path),
  })
}

// GA4 already has "qualify_lead" configured as a Key Event (set up directly
// in the GA4 UI), but nothing in this codebase ever fired it - the event
// existed only as a name with zero data behind it. Call this from the real
// moments a site visitor actually becomes a lead: signup, the contact/demo
// form, and a live demo call connecting.
export function trackQualifyLead(source: LeadSource): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  const params = {
    lead_source: source,
    ...commonPageParams(window.location.pathname + window.location.search),
  }
  window.gtag('event', 'qualify_lead', params)

  // GA4's recommended lead-generation event name. Keeping qualify_lead
  // preserves the existing Key Event, while generate_lead makes Google Ads
  // and GA4 recommendations easier to connect later.
  window.gtag('event', 'generate_lead', params)
}

export function trackMarketingCta(cta: MarketingCta, placement: string): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  const params = {
    cta_name: cta,
    cta_placement: placement,
    ...commonPageParams(window.location.pathname + window.location.search),
  }
  window.gtag('event', 'marketing_cta_click', params)
}
