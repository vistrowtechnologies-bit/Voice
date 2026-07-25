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
import { Privacy } from './pages/marketing/Privacy'
import { Terms } from './pages/marketing/Terms'
import { Login } from './pages/Login'
import { Signup } from './pages/Signup'
import { ForgotPassword } from './pages/ForgotPassword'
import { ResetPassword } from './pages/ResetPassword'
import { InviteAccept } from './pages/InviteAccept'
import { Dashboard } from './pages/Dashboard'
import { Agents } from './pages/Agents'
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
import { hostBucket } from './lib/hostBuckets'
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { trackPageView } from './lib/analytics'

// Wrap every dashboard route in the auth gate — one helper keeps App.tsx
// readable instead of nesting <RequireAuth> around each element.
const guard = (el: ReactNode) => <RequireAuth>{el}</RequireAuth>

// docs.vistrowvoice.com's root should look like its own clean landing page
// (no /resources/docs in the address bar), not a redirect target — so "/"
// renders different content purely based on which subdomain asked for it.
// middleware.ts deliberately leaves docs' root alone for exactly this reason.
function HomeOrDocsRoot() {
  if (hostBucket(window.location.hostname) === 'docs') {
    return <ComingSoon title="Docs — coming soon" />
  }
  return <Home />
}

// GA4's page_view is disabled in index.html (see the comment there) since
// this is a client-side-routed SPA — this is what fires it instead, on the
// initial load and every navigation after. The 0ms deferral lets whichever
// page just mounted finish its own <Seo> effect first, so page_title
// reflects the new page rather than the previous one.
function AnalyticsListener() {
  const location = useLocation()
  useEffect(() => {
    const id = setTimeout(() => trackPageView(location.pathname + location.search), 0)
    return () => clearTimeout(id)
  }, [location.pathname, location.search])
  return null
}

function App() {
  return (
    <AuthProvider>
      <AnalyticsListener />
      <Routes>
        {/* Public — marketing site */}
        <Route path="/" element={<HomeOrDocsRoot />} />
        <Route path="/product" element={<ProductOverview />} />
        <Route path="/product/:slug" element={<ProductDetail />} />
        <Route path="/solutions" element={<SolutionsOverview />} />
        <Route path="/solutions/:slug" element={<SolutionDetail />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/resources/blog" element={<ComingSoon title="Blog — coming soon" />} />
        <Route path="/resources/docs" element={<ComingSoon title="Docs — coming soon" />} />
        <Route path="/resources/case-studies" element={<ComingSoon title="Case studies — coming soon" />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />

        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/invite/:token" element={<InviteAccept />} />

        {/* Auth-gated dashboard */}
        <Route path="/dashboard" element={guard(<Dashboard />)} />
        <Route path="/dashboard/agents" element={guard(<Agents />)} />
        <Route path="/dashboard/voices" element={guard(<Voices />)} />
        <Route path="/dashboard/knowledge" element={guard(<KnowledgeBasePage />)} />
        <Route path="/dashboard/inbound" element={guard(<Inbound />)} />
        <Route path="/dashboard/outbound" element={guard(<Outbound />)} />
        <Route path="/dashboard/calls" element={guard(<CallsHistory />)} />
        <Route path="/dashboard/calls/:id" element={guard(<LeadDetail />)} />
        <Route path="/dashboard/contacts" element={guard(<Contacts />)} />
        <Route path="/dashboard/contacts/:id" element={guard(<ContactDetail />)} />
        <Route path="/dashboard/appointments" element={guard(<Appointments />)} />
        <Route path="/dashboard/integrations" element={guard(<Integrations />)} />
        <Route path="/dashboard/numbers" element={guard(<PhoneNumbers />)} />
        <Route path="/dashboard/compliance" element={guard(<Compliance />)} />
        <Route path="/dashboard/website-widget" element={guard(<WebsiteWidget />)} />
        <Route path="/dashboard/billing" element={guard(<Billing />)} />
        <Route path="/dashboard/settings" element={guard(<Settings />)} />
        {/* Old bookmark path — same detail page as /dashboard/calls/:id */}
        <Route path="/dashboard/leads/:id" element={guard(<LeadDetail />)} />

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
        <Route path="/admin/settings" element={<RequireOwner><AdminSettings /></RequireOwner>} />
      </Routes>
    </AuthProvider>
  )
}

export default App
