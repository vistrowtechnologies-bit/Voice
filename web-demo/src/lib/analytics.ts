// GA4 is loaded in index.html with send_page_view disabled - every page
// view, including the very first one, goes through here instead, so
// client-side navigations (Home -> Pricing -> Contact) are counted as
// separate views instead of collapsing into one.
declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
    clarity?: ((...args: unknown[]) => void) & { q?: unknown[] }
  }
}

// Microsoft Clarity (session recordings + heatmaps). On the public website
// it records normally. On the app host every piece of text is masked
// (data-clarity-mask on <body>) because dashboards show customers' call
// transcripts, leads and phone numbers — recordings there show clicks,
// scrolling and navigation, with only the sidebar menu left readable
// (data-clarity-unmask in DashboardLayout). Never on /admin, and platform
// staff are never recorded (stopClarityForStaff). Previews/localhost: off.
const CLARITY_PROJECT_ID = 'ynb20l1khj'
const MARKETING_HOSTS = new Set(['www.vistrowvoice.com', 'vistrowvoice.com'])
const APP_HOST = 'app.vistrowvoice.com'

export function initClarity(path: string, signedInCustomer = false): void {
  if (typeof window === 'undefined' || !CLARITY_PROJECT_ID || window.clarity) return
  const host = window.location.hostname
  if (!MARKETING_HOSTS.has(host) && host !== APP_HOST) return
  if (cleanPath(path).startsWith('/admin')) return
  // Dashboard pages wait until we know who is signed in — DashboardLayout
  // calls this with signedInCustomer=true — so staff send nothing at all.
  if (cleanPath(path).startsWith('/dashboard') && !signedInCustomer) return
  // Masking must be in place before the recorder's first snapshot.
  if (host === APP_HOST) document.body.setAttribute('data-clarity-mask', 'true')
  const clarity = ((...args: unknown[]) => {
    ;(clarity.q = clarity.q || []).push(args)
  }) as NonNullable<Window['clarity']>
  window.clarity = clarity
  const tag = document.createElement('script')
  tag.async = true
  tag.src = `https://www.clarity.ms/tag/${CLARITY_PROJECT_ID}`
  document.head.appendChild(tag)
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
  if (path.startsWith('/compare/')) return 'comparison'
  if (path === '/vs-ivr') return 'comparison'
  if (path.startsWith('/demo-calls/')) return 'demo_call'
  if (path === '/best-ai-voice-calling-software-india' || path === '/ai-voice-bot-pricing-india') return 'buyer_guide'
  if (path.startsWith('/solutions/real-estate/') && path !== '/solutions/real-estate') return 'local_solution'
  if (path.startsWith('/languages/')) return 'language_detail'
  if (path === '/languages') return 'languages'
  if (path.startsWith('/solutions/')) return 'solution_detail'
  if (path === '/solutions') return 'solutions'
  if (path.startsWith('/product/')) return 'product_detail'
  if (path === '/product') return 'product'
  if (path === '/pricing') return 'pricing'
  if (path === '/integrations') return 'integrations'
  if (path === '/security') return 'security'
  if (path === '/help') return 'help_center'
  if (path.startsWith('/help/')) return path.slice('/help/'.length).includes('/') ? 'help_article' : 'help_topic'
  if (path === '/resources/docs') return 'documentation'
  if (path === '/resources/blog') return 'blog'
  if (path === '/changelog') return 'changelog'
  if (path === '/privacy' || path === '/terms') return 'legal'
  if (path === '/careers') return 'careers'
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

/** Our own team's sessions (admin panel, support "View as") stay out of
 * the recordings — they'd skew every heatmap and they show other
 * tenants' data. */
export function stopClarityForStaff(): void {
  window.clarity?.('stop')
}

/** Filter dashboard recordings by workspace and plan — e.g. watch what a
 * customer did right before raising a ticket. Ids only, never names. */
export function tagClarityAccount(accountId: number, plan: string): void {
  window.clarity?.('set', 'account_id', String(accountId))
  window.clarity?.('set', 'plan', plan || 'unknown')
}

export function trackPageView(path: string): void {
  if (typeof window === 'undefined') return
  // Lets Clarity recordings and heatmaps be filtered by page group (pricing,
  // solution_detail, ...). Clarity tracks the SPA route change itself.
  window.clarity?.('set', 'page_group', classifyPageGroup(cleanPath(path)))
  if (typeof window.gtag !== 'function') return
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
