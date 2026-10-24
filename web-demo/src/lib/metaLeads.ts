// Facebook & Instagram Lead Ads (server/meta_leads.py). Types and calls for
// the integration page; the API never returns Meta tokens, so nothing here
// can either. Kept out of api.ts so the page ships independently.

export type MetaConnectionStatus = 'not_connected' | 'connected' | 'needs_reconnect' | 'disconnected'

export interface MetaPage {
  page_id: string
  page_name: string
  subscribed_at: string | null
  subscription_ok: number | boolean
  last_lead_at: string | null
  default_agent_id: number | null
  default_from_number: string
  status: string
}

export interface MetaStatus {
  connected: boolean
  status: MetaConnectionStatus
  fbUserName: string
  tokenExpiresAt: string | null
  lastError: string
  pages: MetaPage[]
  pendingPages: Array<{ id: string; name: string }>
  tokenStorageOk: boolean
}

/** Why the integration cannot be used on this server right now. */
export type MetaUnavailable = 'not_configured' | 'token_storage'

export type MetaStatusResult = { ok: true; status: MetaStatus } | { ok: false; reason: MetaUnavailable }

export type MetaLeadEventStatus = 'received' | 'fetched' | 'queued' | 'skipped' | 'stale' | 'test' | 'failed'

export interface MetaLeadEvent {
  page_id: string
  page_name: string | null
  leadgen_id: string
  form_id: string
  form_name: string | null
  ad_id: string
  via: 'webhook' | 'reconcile' | 'backfill' | string
  status: MetaLeadEventStatus | string
  reason: string
  attempts: number
  received_at: string
  processed_at: string | null
  dialed_at: string | null
  campaign_contact_id: number | null
  // Not sent by the server yet; shown when it is.
  call_id?: number | null
  name?: string | null
  phone?: string | null
}

export interface MetaRule {
  id: number
  pageId: string
  matchKind: 'ad' | 'form'
  matchValue: string
  agentId: number
  fromNumber: string
  label: string
  position: number
}

export interface MetaOptions {
  forms: Array<{ pageId: string; formId: string; formName: string; label: string }>
  ads: Array<{ pageId: string; adId: string; adName: string; campaignName: string }>
  agents: Array<{ id: number; name: string; status: string }>
  numbers: Array<{ number: string; agentId: number | null }>
}

export const metaStartUrl = '/api/integrations/meta/start'

/** Opens Facebook sign-in in a pop-up so the admin never leaves the
 * dashboard. The server's callback page reports the result (the same values
 * as ?facebook=...) over BroadcastChannel, because facebook.com can cut the
 * pop-up's link to window.opener, and over postMessage as a backup. Facebook
 * will not load its sign-in inside another site's page, so a small window
 * over the dashboard is as close as it gets. onClosed fires when the admin
 * closes the window without finishing (we keep listening a little longer in
 * case the result was already on its way). Returns stop (stop listening and
 * close the window) and focus (bring it back to the front), or null when the
 * browser blocked the pop-up so the caller can fall back to a redirect. */
export function openMetaConnectPopup(
  onResult: (result: string) => void,
  onClosed: () => void,
): { stop: () => void; focus: () => void } | null {
  const width = 720
  const height = 760
  const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2)
  const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2)
  const popup = window.open(`${metaStartUrl}?popup=1`, 'vv-meta-connect', `popup,width=${width},height=${height},left=${left},top=${top}`)
  if (!popup) return null
  let channel: BroadcastChannel | null = null
  let done = false
  const watchdog = window.setInterval(() => {
    if (!popup.closed) return
    window.clearInterval(watchdog)
    window.setTimeout(() => {
      if (!done) onClosed()
    }, 1500)
  }, 600)
  const cleanup = () => {
    done = true
    window.clearInterval(watchdog)
    window.removeEventListener('message', onMessage)
    channel?.close()
  }
  const finish = (data: unknown) => {
    if (done || !data || typeof data !== 'object' || (data as { source?: unknown }).source !== 'vv-meta') return
    cleanup()
    onResult(String((data as { result?: unknown }).result ?? 'failed'))
  }
  const onMessage = (event: MessageEvent) => {
    if (event.origin === window.location.origin) finish(event.data)
  }
  window.addEventListener('message', onMessage)
  try {
    channel = new BroadcastChannel('vv-meta')
    channel.onmessage = (event) => finish(event.data)
  } catch {
    channel = null
  }
  return {
    stop: () => {
      cleanup()
      if (!popup.closed) popup.close()
    },
    focus: () => popup.focus(),
  }
}

function unauthorized() {
  window.dispatchEvent(new Event('vv-unauthorized'))
}

async function detailOf(res: Response): Promise<string | null> {
  return res
    .clone()
    .json()
    .then((j) => (typeof j?.detail === 'string' ? j.detail : null))
    .catch(() => null)
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    cache: 'no-store',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) unauthorized()
  if (!res.ok) throw new Error((await detailOf(res)) || `${method} ${path} failed (${res.status})`)
  return res.json()
}

/** 404 = the server has no Meta app configured (or this build lacks the
 * routes); 503 = token encryption is off. Both are shown, never thrown. */
export async function fetchMetaStatus(): Promise<MetaStatusResult> {
  const res = await fetch('/api/integrations/meta', { credentials: 'include', cache: 'no-store' })
  if (res.status === 401) unauthorized()
  if (res.status === 404) return { ok: false, reason: 'not_configured' }
  if (res.status === 503) return { ok: false, reason: 'token_storage' }
  if (!res.ok) throw new Error((await detailOf(res)) || `GET /integrations/meta failed (${res.status})`)
  return { ok: true, status: await res.json() }
}

export interface ConnectPagesResult {
  ok: boolean
  results: Array<{ pageId: string; ok: boolean; subscribed?: boolean; reason?: string }>
  pages?: MetaPage[]
  detail?: string
}

export async function connectMetaPages(pageIds: string[]): Promise<ConnectPagesResult> {
  const res = await fetch('/api/integrations/meta/pages', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pageIds }),
  })
  if (res.status === 401) unauthorized()
  // 409: every chosen Page belongs to another workspace; the body says so.
  if (res.status === 409) return res.json()
  if (!res.ok) throw new Error((await detailOf(res)) || `Could not connect the Pages (${res.status})`)
  return res.json()
}

export const updateMetaPage = (pageId: string, agentId: number | null, fromNumber: string) =>
  request<{ ok: boolean; pages: MetaPage[] }>('PATCH', `/integrations/meta/pages/${encodeURIComponent(pageId)}`, {
    agentId,
    fromNumber,
  })

export const disconnectMeta = () =>
  request<{ ok: boolean; pages: Array<{ pageId: string; unsubscribed: boolean }> }>('POST', '/integrations/meta/disconnect')

export const fetchMetaLeads = (limit = 200) =>
  request<{ items: MetaLeadEvent[] }>('GET', `/integrations/meta/leads?limit=${limit}`).then((r) => r.items)

/** null when the rules API is not on this server yet. */
export async function fetchMetaRules(): Promise<MetaRule[] | null> {
  const res = await fetch('/api/integrations/meta/rules', { credentials: 'include', cache: 'no-store' })
  if (res.status === 401) unauthorized()
  if (res.status === 404) return null
  if (!res.ok) throw new Error((await detailOf(res)) || `GET /integrations/meta/rules failed (${res.status})`)
  return ((await res.json()) as { items: MetaRule[] }).items
}

export async function fetchMetaOptions(): Promise<MetaOptions | null> {
  const res = await fetch('/api/integrations/meta/options', { credentials: 'include', cache: 'no-store' })
  if (res.status === 401) unauthorized()
  if (res.status === 404) return null
  if (!res.ok) throw new Error((await detailOf(res)) || `GET /integrations/meta/options failed (${res.status})`)
  return res.json()
}

export const createMetaRule = (rule: { pageId: string; matchKind: 'ad' | 'form'; matchValue: string; agentId: number; fromNumber: string; label: string }) =>
  request<{ ok: boolean; item: MetaRule }>('POST', '/integrations/meta/rules', rule)

export const deleteMetaRule = (id: number) => request<{ ok: boolean }>('DELETE', `/integrations/meta/rules/${id}`)

export const META_STATUS_LABEL: Record<string, string> = {
  received: 'Waiting',
  fetched: 'Fetched',
  queued: 'Queued for a call',
  skipped: 'Not called',
  stale: 'Too old to call',
  test: 'Test lead',
  failed: 'Failed',
}

export const META_REASON_LABEL: Record<string, string> = {
  unknown_page: 'This Page is not connected to this workspace',
  no_phone: 'The form had no phone number',
  meta_testing_tool: "From Meta's Lead Ads Testing Tool, so never dialled",
  older_than_24h: 'The form was filled more than 24 hours ago',
  auto_call_not_ready_or_paused: 'No live agent with a phone number, or the follow-up campaign is paused',
  no_route: 'No agent is set for this Page, form or ad',
  deduped: 'They already had a call waiting',
  worker_error: 'An internal error; it will be retried',
}

export function metaReasonLabel(reason: string): string {
  if (!reason) return ''
  if (META_REASON_LABEL[reason]) return META_REASON_LABEL[reason]
  if (reason.startsWith('graph_190') || reason.startsWith('graph_102')) return 'Facebook rejected our access; reconnect'
  if (reason.startsWith('graph_')) return `Facebook returned an error (${reason.replace('graph_', '')}); it will be retried`
  if (reason.startsWith('fetch_error')) return 'Could not reach Facebook; it will be retried'
  return reason.replace(/_/g, ' ')
}
