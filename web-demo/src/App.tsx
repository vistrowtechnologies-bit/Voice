import { Route, Routes } from 'react-router-dom'
import { Landing } from './pages/Landing'
import { CallFlow } from './pages/CallFlow'
import { Summary } from './pages/Summary'
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

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/call" element={<CallFlow />} />
      <Route path="/summary" element={<Summary />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/dashboard/agents" element={<Agents />} />
      <Route path="/dashboard/knowledge" element={<KnowledgeBasePage />} />
      <Route path="/dashboard/inbound" element={<Inbound />} />
      <Route path="/dashboard/outbound" element={<Outbound />} />
      <Route path="/dashboard/calls" element={<CallsHistory />} />
      <Route path="/dashboard/calls/:id" element={<LeadDetail />} />
      <Route path="/dashboard/contacts" element={<Contacts />} />
      <Route path="/dashboard/integrations" element={<Integrations />} />
      <Route path="/dashboard/numbers" element={<PhoneNumbers />} />
      <Route path="/dashboard/billing" element={<Billing />} />
      {/* Old bookmark path — same detail page as /dashboard/calls/:id */}
      <Route path="/dashboard/leads/:id" element={<LeadDetail />} />
    </Routes>
  )
}

export default App
