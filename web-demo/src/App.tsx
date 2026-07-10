import { Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AuthProvider } from './components/AuthProvider'
import { RequireAuth } from './components/RequireAuth'
import { Home } from './pages/marketing/Home'
import { ProductOverview } from './pages/marketing/ProductOverview'
import { ProductDetail } from './pages/marketing/ProductDetail'
import { SolutionsOverview } from './pages/marketing/SolutionsOverview'
import { SolutionDetail } from './pages/marketing/SolutionDetail'
import { Pricing } from './pages/marketing/Pricing'
import { About } from './pages/marketing/About'
import { Contact } from './pages/marketing/Contact'
import { ComingSoon } from './pages/marketing/ComingSoon'
import { CallFlow } from './pages/CallFlow'
import { Summary } from './pages/Summary'
import { Login } from './pages/Login'
import { Signup } from './pages/Signup'
import { Dashboard } from './pages/Dashboard'
import { Agents } from './pages/Agents'
import { KnowledgeBasePage } from './pages/KnowledgeBasePage'
import { Inbound } from './pages/Inbound'
import { Outbound } from './pages/Outbound'
import { CallsHistory } from './pages/CallsHistory'
import { Contacts } from './pages/Contacts'
import { Integrations } from './pages/Integrations'
import { PhoneNumbers } from './pages/PhoneNumbers'
import { Billing } from './pages/Billing'
import { LeadDetail } from './pages/LeadDetail'
import { WebsiteWidget } from './pages/WebsiteWidget'
import { Settings } from './pages/Settings'

// Wrap every dashboard route in the auth gate — one helper keeps App.tsx
// readable instead of nesting <RequireAuth> around each element.
const guard = (el: ReactNode) => <RequireAuth>{el}</RequireAuth>

function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public — marketing site */}
        <Route path="/" element={<Home />} />
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
        <Route path="/privacy" element={<ComingSoon title="Privacy Policy" />} />
        <Route path="/terms" element={<ComingSoon title="Terms of Service" />} />

        {/* /demo is the public live-demo call; /call is the same flow (kept for
            existing links/embeds). Both reuse CallFlow. */}
        <Route path="/demo" element={<CallFlow />} />
        <Route path="/call" element={<CallFlow />} />
        <Route path="/summary" element={<Summary />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* Auth-gated dashboard */}
        <Route path="/dashboard" element={guard(<Dashboard />)} />
        <Route path="/dashboard/agents" element={guard(<Agents />)} />
        <Route path="/dashboard/knowledge" element={guard(<KnowledgeBasePage />)} />
        <Route path="/dashboard/inbound" element={guard(<Inbound />)} />
        <Route path="/dashboard/outbound" element={guard(<Outbound />)} />
        <Route path="/dashboard/calls" element={guard(<CallsHistory />)} />
        <Route path="/dashboard/calls/:id" element={guard(<LeadDetail />)} />
        <Route path="/dashboard/contacts" element={guard(<Contacts />)} />
        <Route path="/dashboard/integrations" element={guard(<Integrations />)} />
        <Route path="/dashboard/numbers" element={guard(<PhoneNumbers />)} />
        <Route path="/dashboard/website-widget" element={guard(<WebsiteWidget />)} />
        <Route path="/dashboard/billing" element={guard(<Billing />)} />
        <Route path="/dashboard/settings" element={guard(<Settings />)} />
        {/* Old bookmark path — same detail page as /dashboard/calls/:id */}
        <Route path="/dashboard/leads/:id" element={guard(<LeadDetail />)} />
      </Routes>
    </AuthProvider>
  )
}

export default App
