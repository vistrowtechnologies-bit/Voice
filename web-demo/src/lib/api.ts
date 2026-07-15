import type {
  ActiveCallInfo,
  AgentConfig,
  Analytics,
  BillingSummary,
  Campaign,
  CallRecord,
  Contact,
  DashboardSummary,
  HelpChatMessage,
  HelpFaq,
  InboundRoute,
  Integration,
  ApiKey,
  KnowledgeBase,
  PhoneNumber,
  QaDraft,
  Site,
  TelephonyStatus,
  UsageTrends,
  VoiceCatalog,
  VoiceEntry,
} from './types'

// A 401 from any data call means the session expired mid-use. Broadcast it so
// the auth layer can drop the user and bounce to /login, rather than leaving
// stale data on screen. credentials:'include' sends the httpOnly session
// cookie (same-origin via the Vite proxy in dev and the Vercel rewrite in prod).
function onUnauthorized() {
  window.dispatchEvent(new Event('vv-unauthorized'))
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, { credentials: 'include', cache: 'no-store' })
  if (res.status === 401) onUnauthorized()
  if (!res.ok) throw new Error(`GET ${path} failed (${res.status})`)
  return res.json()
}

async function send<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    cache: 'no-store',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) onUnauthorized()
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

// ---------------------------------------------------------- voices

// Full catalog annotated for this account (selected / addable / slots left).
export const fetchVoiceCatalog = () => get<VoiceCatalog>('/voices/catalog')
// The account's curated menu — the only voices the agent picker offers.
export const fetchMyVoices = () => get<VoiceEntry[]>('/voices/mine')
export const addVoice = (voice: string) =>
  send<{ ok: boolean; voices: VoiceEntry[] }>('POST', '/voices/mine', { voice })
export const removeVoice = (voice: string) =>
  send<{ ok: boolean; voices: VoiceEntry[] }>('DELETE', `/voices/mine/${encodeURIComponent(voice)}`)
// Direct URL for the cached audition audio (same-origin, cookie-authed). First
// hit for a (voice, lang) synthesizes + caches server-side; later hits are free.
export const voicePreviewUrl = (voice: string, lang: string) =>
  `/api/voices/preview?voice=${encodeURIComponent(voice)}&lang=${encodeURIComponent(lang)}`

export async function fetchLead(id: string): Promise<CallRecord | undefined> {
  const res = await fetch(`/api/calls/${id}`, { credentials: 'include' })
  if (res.status === 404) return undefined
  if (res.status === 401) onUnauthorized()
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

// ------------------------------------------------ conversation intelligence

export interface CallIntelligence {
  summary: string
  sentiment: 'positive' | 'neutral' | 'negative'
  outcome: string
  qa_score: number
  disqualification_reason: string
  key_points: string[]
  action_items: string[]
}
export interface IntelligenceSummary {
  analyzed: number
  avgQaScore: number | null
  sentiment: { positive: number; neutral: number; negative: number }
  outcomes: { outcome: string; count: number }[]
  topDisqualifications: { reason: string; count: number }[]
}
export const analyzeCall = (id: number | string) => send<CallIntelligence>('POST', `/calls/${id}/analyze`)
export const fetchIntelligence = (days = 30) => get<IntelligenceSummary>(`/dashboard/intelligence?days=${days}`)

// ---------------------------------------------------------------- agents

export const fetchAgents = () => get<AgentConfig[]>('/agents')
export const createAgent = (data: Partial<AgentConfig>) => send<AgentConfig>('POST', '/agents', data)
export const updateAgent = (id: number, data: Partial<AgentConfig>) =>
  send<AgentConfig>('PATCH', `/agents/${id}`, data)
export const deleteAgent = (id: number) => send('DELETE', `/agents/${id}`)

// -------------------------------------------------------------- api keys

export const fetchApiKeys = () => get<ApiKey[]>('/api-keys')
export const createApiKey = (name: string) => send<ApiKey & { key: string }>('POST', '/api-keys', { name })
export const deleteApiKey = (id: number) => send('DELETE', `/api-keys/${id}`)

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
export const fetchKnowledgeSource = (id: number) =>
  get<{ id: number; kbId: number; name: string; content: string }>(`/knowledge-sources/${id}`)
export const updateKnowledgeSource = (id: number, data: { name?: string; content?: string }) =>
  send<{ id: number; kbId: number; name: string; content: string }>('PATCH', `/knowledge-sources/${id}`, data)
export const scanKnowledgeSourceUrl = (kbId: number, url: string) =>
  send<{ baseUrl: string; pages: { url: string; title: string }[] }>(
    'POST',
    `/knowledge-bases/${kbId}/sources/scan-url`,
    { url },
  )
export const importKnowledgeSourceUrls = (kbId: number, urls: string[]) =>
  send<{ added: number; failed: { url: string; error: string }[] }>(
    'POST',
    `/knowledge-bases/${kbId}/sources/import-urls`,
    { urls },
  )
export const setKnowledgeBaseStrict = (id: number, strict: boolean) =>
  send('PATCH', `/knowledge-bases/${id}`, { strict })
export const addKbQa = (kbId: number, question: string, answer: string) =>
  send('POST', `/knowledge-bases/${kbId}/qa`, { question, answer })
export const addKbQaBulk = (kbId: number, pairs: QaDraft[]) =>
  send<{ ok: boolean; added: number }>('POST', `/knowledge-bases/${kbId}/qa/bulk`, { pairs })
export const updateKbQa = (qaId: number, question: string, answer: string) =>
  send('PATCH', `/kb-qa/${qaId}`, { question, answer })
export const deleteKbQa = (qaId: number) => send('DELETE', `/kb-qa/${qaId}`)
export const extractQaFromSource = (sourceId: number) =>
  send<{ ok: boolean; pairs: QaDraft[] }>('POST', `/knowledge-sources/${sourceId}/extract-qa`)

// ------------------------------------------------------------- campaigns

export const fetchInboundRoutes = () => get<InboundRoute[]>('/inbound-routes')
export const createInboundRoute = (data: Record<string, unknown>) =>
  send('POST', '/inbound-routes', data)
export const fetchCampaigns = () => get<Campaign[]>('/campaigns')
export const fetchCampaign = (id: number) => get<Campaign>(`/campaigns/${id}`)
export const createCampaign = (data: Record<string, unknown>) => send<Campaign>('POST', '/campaigns', data)
export const updateCampaignStatus = (id: number, status: string) =>
  send<Campaign>('PATCH', `/campaigns/${id}`, { status })

// ------------------------------------------------------------ compliance

export interface ComplianceSettings {
  enforce_window: boolean
  window_start: string
  window_end: string
  active_days: string[]
  timezone: string
  honor_dnc: boolean
  require_consent: boolean
  record_calls: boolean
  retention_days: number
}
export interface DncEntry {
  id: number
  phone: string
  reason: string
  source: string
  created_at: string
}
export const fetchCompliance = () => get<ComplianceSettings>('/compliance/settings')
export const updateCompliance = (data: Partial<ComplianceSettings>) =>
  send<ComplianceSettings>('PATCH', '/compliance/settings', data)
export const fetchDnc = () => get<DncEntry[]>('/compliance/dnc')
export const addDnc = (phone: string, reason: string) =>
  send<{ ok: boolean; added: boolean }>('POST', '/compliance/dnc', { phone, reason })
export const bulkAddDnc = (numbers: string) =>
  send<{ ok: boolean; added: number; total: number }>('POST', '/compliance/dnc/bulk', { numbers })
export const removeDnc = (id: number) => send('DELETE', `/compliance/dnc/${id}`)

// ---------------------------------------------------------- integrations

export const fetchIntegrations = () => get<Integration[]>('/integrations')
export const updateIntegration = (key: string, status: string, config: Record<string, string>) =>
  send('PATCH', `/integrations/${key}`, { status, config })
export const testIntegration = (key: string) =>
  send<{ ok: boolean; detail: string }>('POST', `/integrations/${key}/test`)
export const gcalOauthStartUrl = '/api/integrations/gcal/oauth/start'
export const disconnectGcal = () => send<{ ok: boolean }>('POST', '/integrations/gcal/disconnect')

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

// ------------------------------------------------------------- help chat

export const fetchHelpFaqs = () => get<HelpFaq[]>('/help/faqs')
export const sendHelpChatMessage = (message: string, history: HelpChatMessage[], currentPage?: string) =>
  send<{ reply: string }>('POST', '/help/chat', { message, history, currentPage })

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
