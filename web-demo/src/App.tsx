import { Route, Routes } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { AppLoadingScreen } from './components/AppLoadingScreen'
import { AuthProvider } from './components/AuthProvider'
import { RequireAuth } from './components/RequireAuth'
import { RequireOwner } from './components/RequireOwner'
import { Home } from './pages/marketing/Home'
import { ProductOverview } from './pages/marketing/ProductOverview'
import { ProductDetail } from './pages/marketing/ProductDetail'
import { SolutionsOverview } from './pages/marketing/SolutionsOverview'
import { SolutionDetail } from './pages/marketing/SolutionDetail'
import { Pricing } from './pages/marketing/Pricing'
import { About } from './pages/marketing/About'
import { Contact } from './pages/marketing/Contact'
import { Blog } from './pages/marketing/Blog'
import { BlogPost } from './pages/marketing/BlogPost'
import { Docs } from './pages/marketing/Docs'
import { HelpCenter } from './pages/marketing/HelpCenter'
import { Security } from './pages/marketing/Security'
import { Careers } from './pages/marketing/Careers'
import { Changelog } from './pages/marketing/Changelog'
import { IntegrationsDirectory } from './pages/marketing/IntegrationsDirectory'
import { LanguagesOverview } from './pages/marketing/LanguagesOverview'
import { LanguageDetail } from './pages/marketing/LanguageDetail'
import { CompareIvr } from './pages/marketing/CompareIvr'
import { CompareVendor } from './pages/marketing/CompareVendor'
import { BuyerGuide } from './pages/marketing/BuyerGuide'
import { LocalRealEstate } from './pages/marketing/LocalRealEstate'
import { DemoCall } from './pages/marketing/DemoCall'
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
import { SidebarPreview } from './pages/SidebarPreview'
import { useEffect } from 'react'
import { StagingBadge } from './components/StagingBadge'
import { useLocation, useNavigate } from 'react-router-dom'
import { initClarity, trackPageView } from './lib/analytics'

// Dashboard and admin screens load on demand: the marketing pages must not ship them.
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard })))
const AdminAccounts = lazy(() => import('./pages/admin/AdminAccounts').then((m) => ({ default: m.AdminAccounts })))
const AdminAccountDetail = lazy(() => import('./pages/admin/AdminAccountDetail').then((m) => ({ default: m.AdminAccountDetail })))
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers').then((m) => ({ default: m.AdminUsers })))
const AdminCalls = lazy(() => import('./pages/admin/AdminCalls').then((m) => ({ default: m.AdminCalls })))
const AdminCallDetailPage = lazy(() => import('./pages/admin/AdminCalls').then((m) => ({ default: m.AdminCallDetailPage })))
const AdminAnalytics = lazy(() => import('./pages/admin/AdminAnalytics').then((m) => ({ default: m.AdminAnalytics })))
const AdminBilling = lazy(() => import('./pages/admin/AdminBilling').then((m) => ({ default: m.AdminBilling })))
const AdminAudit = lazy(() => import('./pages/admin/AdminAudit').then((m) => ({ default: m.AdminAudit })))
const AdminHealth = lazy(() => import('./pages/admin/AdminHealth').then((m) => ({ default: m.AdminHealth })))
const AdminVendorCredits = lazy(() => import('./pages/admin/AdminVendorCredits').then((m) => ({ default: m.AdminVendorCredits })))
const AdminPrivacyRequests = lazy(() => import('./pages/admin/AdminPrivacyRequests').then((m) => ({ default: m.AdminPrivacyRequests })))
const AdminSupport = lazy(() => import('./pages/admin/AdminSupport').then((m) => ({ default: m.AdminSupport })))
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings').then((m) => ({ default: m.AdminSettings })))
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })))
const Agents = lazy(() => import('./pages/Agents').then((m) => ({ default: m.Agents })))
const TestingLab = lazy(() => import('./pages/TestingLab').then((m) => ({ default: m.TestingLab })))
const AgentDetail = lazy(() => import('./pages/AgentDetail').then((m) => ({ default: m.AgentDetail })))
const Voices = lazy(() => import('./pages/Voices').then((m) => ({ default: m.Voices })))
const KnowledgeBasePage = lazy(() => import('./pages/KnowledgeBasePage').then((m) => ({ default: m.KnowledgeBasePage })))
const Inbound = lazy(() => import('./pages/Inbound').then((m) => ({ default: m.Inbound })))
const Outbound = lazy(() => import('./pages/Outbound').then((m) => ({ default: m.Outbound })))
const CallsHistory = lazy(() => import('./pages/CallsHistory').then((m) => ({ default: m.CallsHistory })))
const Contacts = lazy(() => import('./pages/Contacts').then((m) => ({ default: m.Contacts })))
const ContactDetail = lazy(() => import('./pages/ContactDetail').then((m) => ({ default: m.ContactDetail })))
const Appointments = lazy(() => import('./pages/Appointments').then((m) => ({ default: m.Appointments })))
const Integrations = lazy(() => import('./pages/Integrations').then((m) => ({ default: m.Integrations })))
const PhoneNumbers = lazy(() => import('./pages/PhoneNumbers').then((m) => ({ default: m.PhoneNumbers })))
const Billing = lazy(() => import('./pages/Billing').then((m) => ({ default: m.Billing })))
const Compliance = lazy(() => import('./pages/Compliance').then((m) => ({ default: m.Compliance })))
const Support = lazy(() => import('./pages/Support').then((m) => ({ default: m.Support })))
const LeadDetail = lazy(() => import('./pages/LeadDetail').then((m) => ({ default: m.LeadDetail })))
const WebsiteWidget = lazy(() => import('./pages/WebsiteWidget').then((m) => ({ default: m.WebsiteWidget })))
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })))

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
      initClarity(location.pathname)
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
      <StagingBadge />
      <Suspense fallback={<AppLoadingScreen />}>
      <Routes location={backgroundLocation ?? location}>
        {import.meta.env.DEV && <Route path="/__preview/sidebar" element={<SidebarPreview />} />}
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
        <Route path="/compare/:slug" element={<CompareVendor />} />
        <Route path="/:slug" element={<BuyerGuide />} />
        <Route path="/solutions/real-estate/:slug" element={<LocalRealEstate />} />
        <Route path="/demo-calls/:slug" element={<DemoCall />} />
        <Route path="/security" element={<Security />} />
        <Route path="/careers" element={<Careers />} />
        <Route path="/changelog" element={<Changelog />} />
        <Route path="/resources/blog" element={<Blog />} />
        <Route path="/resources/blog/:slug" element={<BlogPost />} />
        <Route path="/resources/docs" element={<Docs />} />
        <Route path="/help" element={<HelpCenter />} />
        <Route path="/help/:topic" element={<HelpCenter />} />
        <Route path="/help/:topic/:article" element={<HelpCenter />} />
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
        <Route path="/dashboard/testing" element={guard(<TestingLab />)} />
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
        <Route path="/dashboard/support" element={guard(<Support />)} />
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
        <Route path="/admin/support" element={<RequireOwner><AdminSupport /></RequireOwner>} />
        <Route path="/admin/settings" element={<RequireOwner><AdminSettings /></RequireOwner>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>

      {/* Rendered ON TOP of the routes above whenever the URL names a call -
          whether it was opened from the list or hit directly. Unconditional
          so both entry points look identical. */}
      <Suspense fallback={null}>
      <Routes>
        <Route
          path="/dashboard/calls/:id"
          element={guard(<CallDetailModalRoute cameFromList={Boolean(backgroundLocation)} />)}
        />
        <Route
          path="/dashboard/leads/:id"
          element={guard(<CallDetailModalRoute cameFromList={Boolean(backgroundLocation)} />)}
        />
        <Route path="*" element={null} />
      </Routes>
      </Suspense>
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
