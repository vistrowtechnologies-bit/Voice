// Super-admin (platform owner) API client. Mirrors the /admin/* backend, which
// is gated by require_platform_owner (404 to everyone else). Same credentials-
// included fetch style as lib/api.ts so the session cookie rides along.

function onUnauthorized() {
  window.dispatchEvent(new Event('vv-unauthorized'))
}

async function aget<T>(path: string): Promise<T> {
  const res = await fetch(`/api/admin${path}`, { credentials: 'include' })
  if (res.status === 401) onUnauthorized()
  if (!res.ok) throw new Error(`GET ${path} failed (${res.status})`)
  return res.json()
}

async function apost<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) onUnauthorized()
  if (!res.ok) throw new Error(`POST ${path} failed (${res.status})`)
  return res.json()
}

function qs(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '' && v !== 0) q.set(k, String(v))
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

// ---------------------------------------------------------------- types

export interface AdminOverview {
  kpis: {
    accounts: number
    activeAccounts: number
    suspended: number
    users: number
    signupsToday: number
    signups7d: number
    callsWindow: number
    callsTotal: number
    minutesWindow: number
    mrr: number
    creditsConsumed: number
    creditsAllocated: number
    creditsPct: number
    liveCalls: number
  }
  signupSeries: { day: string; count: number }[]
  callsByChannel: { channel: string; count: number }[]
  needsAttention: { nearLimit: number; zeroCallSignups: number; suspended: number }
  recentSignups: {
    id: number
    name: string
    plan: string
    status: string
    created_at: string
    owner_email: string | null
    auth_provider: string | null
  }[]
}

export interface AdminAccountRow {
  id: number
  name: string
  plan: string
  status: string
  created_at: string
  is_platform_owner: number
  owner_email: string | null
  users: number
  agents: number
  calls: number
  last_call: string | null
  credits_used: number
  credits_total: number
  mrr: number
}

export interface AdminAccountDetail {
  account: {
    id: number
    name: string
    plan: string
    status: string
    notes: string
    created_at: string
    onboarded_at: string | null
  }
  owner: { id: number; email: string; name: string } | null
  billing: { creditsTotal: number; creditsUsed: number; creditsRemaining: number; minutesUsed: number }
  mrr: number
  users: {
    id: number
    name: string
    email: string
    role: string
    auth_provider: string | null
    last_login_at: string | null
    created_at: string
  }[]
  agents: { id: number; name: string; status: string; voice: string; model: string; kb_id: number | null; updated_at: string }[]
  knowledgeBases: { id: number; name: string; strict: number; sources: number }[]
  numbers: { id: number; number: string; label: string; agent_id: number | null; status: string }[]
  integrations: { key: string; name: string; category: string; status: string }[]
  calls: {
    id: number
    room_name: string
    started_at: string
    duration_seconds: number
    call_type: string
    reply_language: string | null
    lead_name: string | null
    lead_phone: string | null
    agent_id: number | null
  }[]
  audit: { action: string; actor_email: string; detail: string; created_at: string }[]
}

export interface AdminUserRow {
  id: number
  name: string
  email: string
  role: string
  auth_provider: string | null
  last_login_at: string | null
  created_at: string
  account_id: number
  account_name: string
  account_status: string
}

export interface AdminCallRow {
  id: number
  account_id: number
  account_name: string | null
  room_name: string
  started_at: string
  duration_seconds: number
  call_type: string
  reply_language: string | null
  lead_name: string | null
  lead_phone: string | null
  agent_id: number | null
  credits: number
  qualified: boolean
}

export interface AdminCallDetail extends AdminCallRow {
  transcript: { role: string; text?: string; content?: string }[]
  lead_company: string | null
  lead_use_case: string | null
  lead_team_size: string | null
}

export interface AdminAnalytics {
  signupSeries: { day: string; count: number }[]
  callSeries: { day: string; calls: number; minutes: number }[]
  authBreakdown: { provider: string; count: number }[]
  channelSplit: { channel: string; calls: number; minutes: number }[]
  funnel: { step: string; count: number }[]
  avgDurationSec: number
  retention: { activeThisMonth: number; activeLastMonth: number }
  mrr: number
  arpa: number
}

export interface AdminBilling {
  mrr: number
  payingAccounts: number
  arpa: number
  byPlan: { plan: string; accounts: number; price: number; mrr: number }[]
  nearLimit: { id: number; name: string; plan: string; used: number; total: number; pct: number }[]
  convert: { id: number; name: string; plan: string; used: number; total: number; pct: number }[]
}

export interface AdminAuditEntry {
  id: number
  actor_email: string
  action: string
  target_account_id: number | null
  target_user_id: number | null
  target_account_name: string | null
  detail: string
  created_at: string
}

export interface AdminHealth {
  dbOk: boolean
  liveCalls: number
  errorCount24h: number
  errors: {
    id: number
    account_id: number | null
    account_name: string | null
    source: string
    level: string
    message: string
    context: string
    created_at: string
  }[]
  apiKeys: { name: string; configured: boolean }[]
}

// ---------------------------------------------------------------- calls

export const adminOverview = (days = 30) => aget<AdminOverview>(`/overview${qs({ days })}`)

export const adminAccounts = (p: { search?: string; plan?: string; status?: string; activity?: string; limit?: number; offset?: number } = {}) =>
  aget<{ accounts: AdminAccountRow[]; total: number }>(`/accounts${qs(p)}`)

export const adminAccountDetail = (id: number) => aget<AdminAccountDetail>(`/accounts/${id}`)

export const adminUsers = (p: { search?: string; limit?: number; offset?: number } = {}) =>
  aget<{ users: AdminUserRow[]; total: number }>(`/users${qs(p)}`)

export const adminCalls = (p: { account_id?: number; channel?: string; days?: number; search?: string; limit?: number; offset?: number } = {}) =>
  aget<{ calls: AdminCallRow[]; total: number }>(`/calls${qs(p)}`)

export const adminCallDetail = (id: number) => aget<AdminCallDetail>(`/calls/${id}`)

export const adminAnalytics = (days = 30) => aget<AdminAnalytics>(`/analytics${qs({ days })}`)

export const adminBilling = () => aget<AdminBilling>('/billing')

export const adminAudit = (p: { action?: string; limit?: number; offset?: number } = {}) =>
  aget<{ entries: AdminAuditEntry[]; total: number }>(`/audit${qs(p)}`)

export const adminHealth = () => aget<AdminHealth>('/health')

// mutations
export const adminSetCredits = (id: number, total: number, reason: string) =>
  apost<AdminAccountDetail>(`/accounts/${id}/credits`, { total, reason })
export const adminSetPlan = (id: number, plan: string, reason: string) =>
  apost<AdminAccountDetail>(`/accounts/${id}/plan`, { plan, reason })
export const adminSetStatus = (id: number, status: string, reason: string) =>
  apost<AdminAccountDetail>(`/accounts/${id}/status`, { status, reason })
export const adminSetNotes = (id: number, notes: string) => apost<AdminAccountDetail>(`/accounts/${id}/notes`, { notes })
export const adminResetPassword = (id: number) => apost<{ ok: boolean; emailSent: boolean; resetLink: string }>(`/accounts/${id}/reset-password`)
export const adminImpersonate = (id: number) => apost<{ ok: boolean }>(`/impersonate/${id}`)
export const adminExitImpersonation = () => apost<{ ok: boolean }>('/impersonate/exit')

export const PLAN_LABELS: Record<string, string> = { free: 'Free', starter: 'Starter', growth: 'Growth', scale: 'Scale' }

// Display-only mirrors of the backend's admin_db.PLAN_PRICING and the default
// per-channel credit rates, shown on the admin Settings page for reference.
export const PLAN_PRICING_REF: Record<string, number> = { free: 0, starter: 2999, growth: 5999, scale: 12999 }
export const CREDIT_RATES_REF: Record<string, number> = { browser: 1, phone: 1.5, widget: 1 }
