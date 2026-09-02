import { Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AuthProvider } from './components/AuthProvider'
import { RequireAuth } from './components/RequireAuth'
import { RequireOwner } from './components/RequireOwner'
import { AdminDashboard } from './pages/admin/AdminDashboard'
import { AdminAccounts } from './pages/admin/AdminAccounts'
import { AdminAccountDetail } from './pages/admin/AdminAccountDetail'
import { AdminUsers } from './pages/admin/AdminUsers'
import { AdminCalls, AdminCallDetailPage } from './pages/admin/AdminCalls'
import { AdminAnalytics } from './pages/admin/AdminAnalytics'
import { AdminBilling } from './pages/admin/AdminBilling'
import { AdminAudit } from './pages/admin/AdminAudit'
import { AdminHealth } from './pages/admin/AdminHealth'
import { AdminVendorCredits } from './pages/admin/AdminVendorCredits'
import { AdminPrivacyRequests } from './pages/admin/AdminPrivacyRequests'
import { AdminSettings } from './pages/admin/AdminSettings'
import { Home } from './pages/marketing/Home'
import { ProductOverview } from './pages/marketing/ProductOverview'
import { ProductDetail } from './pages/marketing/ProductDetail'
import { SolutionsOverview } from './pages/marketing/SolutionsOverview'
import { SolutionDetail } from './pages/marketing/SolutionDetail'
import { Pricing } from './pages/marketing/Pricing'
import { About } from './pages/marketing/About'
import { Contact } from './pages/marketing/Contact'
import { ComingSoon } from './pages/marketing/ComingSoon'
import { Docs } from './pages/marketing/Docs'
import { Security } from './pages/marketing/Security'
import { Careers } from './pages/marketing/Careers'
import { Changelog } from './pages/marketing/Changelog'
import { IntegrationsDirectory } from './pages/marketing/IntegrationsDirectory'
import { LanguagesOverview } from './pages/marketing/LanguagesOverview'
import { LanguageDetail } from './pages/marketing/LanguageDetail'
import { CompareIvr } from './pages/marketing/CompareIvr'
import { Privacy } from './pages/marketing/Privacy'
import { Terms } from './pages/marketing/Terms'
import { NotFound } from './pages/marketing/NotFound'
import { Login } from './pages/Login'
import { Signup } from './pages/Signup'
import { ForgotPassword } from './pages/ForgotPassword'
import { ResetPassword } from './pages/ResetPassword'
import { ConfirmEmailChange } from './pages/ConfirmEmailChange'
import { VerifyEmail } from './pages/VerifyEmail'
import { InviteAccept } from './pages/InviteAccept'
import { Dashboard } from './pages/Dashboard'
import { Agents } from './pages/Agents'
import { AgentDetail } from './pages/AgentDetail'
import { Voices } from './pages/Voices'
import { KnowledgeBasePage } from './pages/KnowledgeBasePage'
import { Inbound } from './pages/Inbound'
import { Outbound } from './pages/Outbound'
import { CallsHistory } from './pages/CallsHistory'
import { Contacts } from './pages/Contacts'
import { ContactDetail } from './pages/ContactDetail'
import { Appointments } from './pages/Appointments'
import { Integrations } from './pages/Integrations'
import { PhoneNumbers } from './pages/PhoneNumbers'
import { Billing } from './pages/Billing'
import { Compliance } from './pages/Compliance'
import { LeadDetail } from './pages/LeadDetail'
import { WebsiteWidget } from './pages/WebsiteWidget'
import { Settings } from './pages/Settings'
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { trackPageView } from './lib/analytics'

// Wrap every dashboard route in the auth gate - one helper keeps App.tsx
// readable instead of nesting <RequireAuth> around each element.
const guard = (el: ReactNode) => <RequireAuth>{el}</RequireAuth>

// GA4's page_view is disabled in index.html (see the comment there) since
// this is a client-side-routed SPA - this is what fires it instead, on the
// initial load and every navigation after. The 0ms deferral lets whichever
// page just mounted finish its own <Seo> effect first, so page_title
// reflects the new page rather than the previous one.
function AnalyticsListener() {
  const location = useLocation()
  useEffect(() => {
    // Dashboard/admin pages do not mount the marketing <Seo> component, so
    // without an explicit title they inherit whichever public page was last
    // visited (usually the homepage). Keep browser tabs/history meaningful
    // and prevent analytics from recording every product screen under the
    // homepage title.
    const isProductPage = location.pathname.startsWith('/dashboard') || location.pathname.startsWith('/admin')
    const section = location.pathname.startsWith('/admin') ? 'Admin' : 'Dashboard'
    let observer: MutationObserver | null = null
    const updateProductTitle = () => {
      if (!isProductPage) return
      const routeTitle = document.querySelector('h1')?.textContent?.trim()
      document.title = `${routeTitle || section} - Vistrow Voice`
      if (routeTitle) observer?.disconnect()
    }
    updateProductTitle()
    // Auth/data gates can render the page heading after this route effect.
    // Observe that short transition so a direct dashboard URL gets the real
    // screen title rather than remaining the generic homepage title.
    observer = isProductPage ? new MutationObserver(updateProductTitle) : null
    if (observer) observer.observe(document.body, { childList: true, subtree: true })
    const id = setTimeout(() => {
      trackPageView(location.pathname + location.search)
    }, 0)
    return () => {
      clearTimeout(id)
      observer?.disconnect()
    }
  }, [location.pathname, location.search])
  return null
}

function App() {
  const location = useLocation()
  // Set by the calls list when it opens a call (see CallsHistory): the list's
  // own location is stashed so <Routes> keeps rendering the LIST while the
  // URL points at the call. That gives the overlay flow a real, linkable URL
  // and makes Back close it - opening a call from the list must not lose your
  // place in the list, but a bookmarked/refreshed call URL still has to work.
  // With no backgroundLocation (direct hit, refresh, shared link) the normal
  // route renders the full page instead.
  // ReturnType<typeof useLocation>, not the DOM's global Location - they are
  // structurally similar enough that TS accepts the wrong one silently.
  const state = location.state as { backgroundLocation?: ReturnType<typeof useLocation> } | null
  const backgroundLocation = state?.backgroundLocation

  return (
    <AuthProvider>
      <AnalyticsListener />
      <Routes location={backgroundLocation ?? location}>
        {/* Public - marketing site */}
        <Route path="/" element={<Home />} />
        <Route path="/product" element={<ProductOverview />} />
        <Route path="/product/:slug" element={<ProductDetail />} />
        <Route path="/solutions" element={<SolutionsOverview />} />
        <Route path="/solutions/:slug" element={<SolutionDetail />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/languages" element={<LanguagesOverview />} />
        <Route path="/languages/:slug" element={<LanguageDetail />} />
        <Route path="/integrations" element={<IntegrationsDirectory />} />
        <Route path="/vs-ivr" element={<CompareIvr />} />
        <Route path="/security" element={<Security />} />
        <Route path="/careers" element={<Careers />} />
        <Route path="/changelog" element={<Changelog />} />
        <Route path="/resources/blog" element={<ComingSoon title="Blog - coming soon" />} />
        <Route path="/resources/docs" element={<Docs />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />

        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/confirm-email-change" element={<ConfirmEmailChange />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/invite/:token" element={<InviteAccept />} />

        {/* Auth-gated dashboard */}
        <Route path="/dashboard" element={guard(<Dashboard />)} />
        <Route path="/dashboard/agents" element={guard(<Agents />)} />
        <Route path="/dashboard/agents/:id" element={guard(<AgentDetail />)} />
        <Route path="/dashboard/voices" element={guard(<Voices />)} />
        <Route path="/dashboard/knowledge" element={guard(<KnowledgeBasePage />)} />
        <Route path="/dashboard/inbound" element={guard(<Inbound />)} />
        <Route path="/dashboard/outbound" element={guard(<Outbound />)} />
        <Route path="/dashboard/calls" element={guard(<CallsHistory />)} />
        {/* A call URL renders the LIST here; the call itself is the overlay
            below. So a shared link, a bookmark or a refresh lands on exactly
            what clicking from the list gives you - one presentation of a
            call, never a separate standalone page that looks different. */}
        <Route path="/dashboard/calls/:id" element={guard(<CallsHistory />)} />
        <Route path="/dashboard/contacts" element={guard(<Contacts />)} />
        <Route path="/dashboard/contacts/:id" element={guard(<ContactDetail />)} />
        <Route path="/dashboard/appointments" element={guard(<Appointments />)} />
        <Route path="/dashboard/integrations" element={guard(<Integrations />)} />
        <Route path="/dashboard/numbers" element={guard(<PhoneNumbers />)} />
        <Route path="/dashboard/compliance" element={guard(<Compliance />)} />
        <Route path="/dashboard/website-widget" element={guard(<WebsiteWidget />)} />
        <Route path="/dashboard/billing" element={guard(<Billing />)} />
        <Route path="/dashboard/settings" element={guard(<Settings />)} />
        {/* Old bookmark path - same treatment as /dashboard/calls/:id */}
        <Route path="/dashboard/leads/:id" element={guard(<CallsHistory />)} />

        {/* Platform-owner-only super-admin panel (RequireOwner wraps each in AdminLayout) */}
        <Route path="/admin" element={<RequireOwner><AdminDashboard /></RequireOwner>} />
        <Route path="/admin/accounts" element={<RequireOwner><AdminAccounts /></RequireOwner>} />
        <Route path="/admin/accounts/:id" element={<RequireOwner><AdminAccountDetail /></RequireOwner>} />
        <Route path="/admin/users" element={<RequireOwner><AdminUsers /></RequireOwner>} />
        <Route path="/admin/calls" element={<RequireOwner><AdminCalls /></RequireOwner>} />
        <Route path="/admin/calls/:id" element={<RequireOwner><AdminCallDetailPage /></RequireOwner>} />
        <Route path="/admin/analytics" element={<RequireOwner><AdminAnalytics /></RequireOwner>} />
        <Route path="/admin/billing" element={<RequireOwner><AdminBilling /></RequireOwner>} />
        <Route path="/admin/audit" element={<RequireOwner><AdminAudit /></RequireOwner>} />
        <Route path="/admin/health" element={<RequireOwner><AdminHealth /></RequireOwner>} />
        <Route path="/admin/vendor-credits" element={<RequireOwner><AdminVendorCredits /></RequireOwner>} />
        <Route path="/admin/privacy-requests" element={<RequireOwner><AdminPrivacyRequests /></RequireOwner>} />
        <Route path="/admin/settings" element={<RequireOwner><AdminSettings /></RequireOwner>} />
        <Route path="*" element={<NotFound />} />
      </Routes>

      {/* Rendered ON TOP of the routes above whenever the URL names a call -
          whether it was opened from the list or hit directly. Unconditional
          so both entry points look identical. */}
      <Routes>
        <Route
          path="/dashboard/calls/:id"
          element={guard(<CallDetailModalRoute cameFromList={Boolean(backgroundLocation)} />)}
        />
        <Route
          path="/dashboard/leads/:id"
          element={guard(<CallDetailModalRoute cameFromList={Boolean(backgroundLocation)} />)}
        />
      </Routes>
    </AuthProvider>
  )
}

/** Closing goes Back when the call was opened from the list (popping the call
 * URL and restoring the list's scroll/filters). On a direct hit there is no
 * in-app history to pop - Back would leave the site - so close navigates to
 * the list instead. */
function CallDetailModalRoute({ cameFromList }: { cameFromList: boolean }) {
  const navigate = useNavigate()
  return <LeadDetail onClose={() => (cameFromList ? navigate(-1) : navigate('/dashboard/calls'))} />
}

export default App
