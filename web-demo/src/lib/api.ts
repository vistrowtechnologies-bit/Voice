import type {
  ActiveCallInfo,
  AgentConfig,
  Analytics,
  BillingSummary,
  Campaign,
  CallRecord,
  Contact,
  DashboardSummary,
  InboundRoute,
  Integration,
  KnowledgeBase,
  PhoneNumber,
  Site,
  TelephonyStatus,
  UsageTrends,
} from './types'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`)
  if (!res.ok) throw new Error(`GET ${path} failed (${res.status})`)
  return res.json()
}

async function send<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${method} ${path} failed (${res.status})`)
  return res.json()
}

// ---------------------------------------------------------- calls & leads

export function fetchCalls(params?: { search?: string; status?: string; days?: number }) {
  const q = new URLSearchParams()
  if (params?.search) q.set('search', params.search)
  if (params?.status) q.set('status', params.status)
  if (params?.days) q.set('days', String(params.days))
  const qs = q.toString()
  return get<CallRecord[]>(`/calls${qs ? `?${qs}` : ''}`)
}

export const fetchLeads = () => get<CallRecord[]>('/leads')

export async function fetchLead(id: string): Promise<CallRecord | undefined> {
  const res = await fetch(`/api/calls/${id}`)
  if (res.status === 404) return undefined
  if (!res.ok) throw new Error('failed to load call')
  return res.json()
}

export const callsExportUrl = '/api/calls/export.csv'

// This one asks the LiveKit server (via /active-calls) which rooms are live
// right now — the only endpoint not backed by calls.db.
export const fetchActiveCalls = () => get<ActiveCallInfo[]>('/active-calls')

// ------------------------------------------------------------- dashboard

export const fetchDashboardSummary = () => get<DashboardSummary>('/dashboard/summary')
export const fetchUsageTrends = (days = 14) => get<UsageTrends>(`/dashboard/usage-trends?days=${days}`)
export const fetchAnalytics = () => get<Analytics>('/dashboard/analytics')

// ---------------------------------------------------------------- agents

export const fetchAgents = () => get<AgentConfig[]>('/agents')
export const createAgent = (data: Partial<AgentConfig>) => send<AgentConfig>('POST', '/agents', data)
export const updateAgent = (id: number, data: Partial<AgentConfig>) =>
  send<AgentConfig>('PATCH', `/agents/${id}`, data)
export const deleteAgent = (id: number) => send('DELETE', `/agents/${id}`)

// -------------------------------------------------------------- contacts

export const fetchContacts = () => get<Contact[]>('/contacts')
export const createContact = (data: Partial<Contact>) => send('POST', '/contacts', data)
export const deleteContact = (id: number) => send('DELETE', `/contacts/${id}`)
export const deleteAllContacts = () => send('DELETE', '/contacts')
export const importContactsCsv = (csv: string) =>
  send<{ imported: number }>('POST', '/contacts/import', { csv })
export const contactsExportUrl = '/api/contacts/export.csv'

// -------------------------------------------------------- knowledge base

export const fetchKnowledgeBases = () => get<KnowledgeBase[]>('/knowledge-bases')
export const createKnowledgeBase = (name: string) => send('POST', '/knowledge-bases', { name })
export const deleteKnowledgeBase = (id: number) => send('DELETE', `/knowledge-bases/${id}`)
export const addKnowledgeSource = (kbId: number, name: string, content: string, type = 'text') =>
  send('POST', `/knowledge-bases/${kbId}/sources`, { name, content, type })
export const deleteKnowledgeSource = (id: number) => send('DELETE', `/knowledge-sources/${id}`)

// ------------------------------------------------------------- campaigns

export const fetchInboundRoutes = () => get<InboundRoute[]>('/inbound-routes')
export const createInboundRoute = (data: Record<string, unknown>) =>
  send('POST', '/inbound-routes', data)
export const fetchCampaigns = () => get<Campaign[]>('/campaigns')
export const createCampaign = (data: Record<string, unknown>) => send('POST', '/campaigns', data)
export const updateCampaignStatus = (id: number, status: string) =>
  send('PATCH', `/campaigns/${id}`, { status })

// ---------------------------------------------------------- integrations

export const fetchIntegrations = () => get<Integration[]>('/integrations')
export const updateIntegration = (key: string, status: string, config: Record<string, string>) =>
  send('PATCH', `/integrations/${key}`, { status, config })

// ------------------------------------------------------- telephony (EnableX)

export const fetchTelephonyStatus = () => get<TelephonyStatus>('/telephony/status')
export const connectEnablex = (appId: string, appKey: string) =>
  send<TelephonyStatus>('POST', '/telephony/connect', { appId, appKey })
export const disconnectEnablex = () => send('POST', '/telephony/disconnect')
export const fetchPhoneNumbers = () => get<PhoneNumber[]>('/telephony/numbers')
export const addPhoneNumber = (number: string, label: string, agentId: number | null) =>
  send('POST', '/telephony/numbers', { number, label, agentId })
export const assignPhoneNumber = (id: number, agentId: number | null) =>
  send('PATCH', `/telephony/numbers/${id}`, { agentId })
export const deletePhoneNumber = (id: number) => send('DELETE', `/telephony/numbers/${id}`)
export const placeTestCall = (from: string, to: string) =>
  send<{ ok: boolean; error?: string; response?: unknown }>('POST', '/telephony/test-call', { from, to })

// --------------------------------------------------------------- billing

export const fetchBilling = () => get<BillingSummary>('/billing/summary')

// ---------------------------------------------------------- website widget

export const fetchSites = () => get<Site[]>('/widget/sites')
export const createSite = (
  name: string,
  agentId: number | null,
  allowedDomain: string,
  widgetPosition: Site['widgetPosition'] = 'bottom-right',
  widgetLabel: string = 'Talk to us',
) => send<Site>('POST', '/widget/sites', { name, agentId, allowedDomain, widgetPosition, widgetLabel })
export const updateSite = (id: number, data: Partial<Site>) => send<Site>('PATCH', `/widget/sites/${id}`, data)
export const deleteSite = (id: number) => send('DELETE', `/widget/sites/${id}`)
export const regenerateSiteKey = (id: number) => send<Site>('POST', `/widget/sites/${id}/regenerate-key`)
export const wordpressPluginUrl = '/api/widget/wordpress-plugin.zip'
export const fetchWidgetBackendUrl = () => get<{ backendUrl: string | null }>('/widget/backend-url')

// --------------------------------------------------------------- helpers

export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  return `${Math.round(hours / 24)}d ago`
}

export function formatDuration(seconds: number | null): string {
  if (!seconds) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${s}s`
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export const LANGUAGE_NAMES: Record<string, string> = {
  'hi-IN': 'Hindi',
  'en-IN': 'English',
  'mr-IN': 'Marathi',
  'ml-IN': 'Malayalam',
  'gu-IN': 'Gujarati',
  'ta-IN': 'Tamil',
  'te-IN': 'Telugu',
  'kn-IN': 'Kannada',
  'bn-IN': 'Bengali',
  'pa-IN': 'Punjabi',
  'od-IN': 'Odia',
}
