import type { CopilotAction, SupportTicket } from './types'

// Super-admin (platform owner) API client. Mirrors the /admin/* backend, which
// is gated by require_platform_owner (404 to everyone else). Same credentials-
// included fetch style as lib/api.ts so the session cookie rides along.

function onUnauthorized() {
  window.dispatchEvent(new Event('vv-unauthorized'))
}

// FastAPI errors carry a human-readable `detail` (string, or a validation
// list). Surface it so the admin sees "A reason is required…" instead of a
// bare status code; fall back to the method/path/status when there is none.
async function errorFrom(res: Response, fallback: string): Promise<Error> {
  const data = await res.json().catch(() => null)
  const detail = data?.detail
  if (typeof detail === 'string' && detail.trim()) return new Error(detail)
  if (Array.isArray(detail) && typeof detail[0]?.msg === 'string') return new Error(detail[0].msg)
  return new Error(`${fallback} failed (${res.status})`)
}

// no-store on every call: an admin adjusting credits/plan/status must see it
// reflected on the very next fetch - never a browser-cached GET, since the
// account detail and list views are read right after a mutation.
async function aget<T>(path: string): Promise<T> {
  const res = await fetch(`/api/admin${path}`, { credentials: 'include', cache: 'no-store' })
  if (res.status === 401) onUnauthorized()
  if (!res.ok) throw await errorFrom(res, `GET ${path}`)
  return res.json()
}

async function apost<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) onUnauthorized()
  if (!res.ok) throw await errorFrom(res, `POST ${path}`)
  return res.json()
}

async function apatch<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    method: 'PATCH',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.status === 401) onUnauthorized()
  if (!res.ok) throw await errorFrom(res, `PATCH ${path}`)
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
    liveCalls: number | null
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
    // Added by the admin P0 backend; absent on older servers.
    calls?: number
    firstCallAt?: string | null
    /** Real commercial state: subscription plan, 'top-up', 'trial' or 'none'. */
    effectivePlan?: string
  }[]
  /** Vistrow's own accounts, left out of every number on this page. */
  internalAccountIds?: number[]
  // Operations overview (admin P0). Optional until the backend ships it.
  ops?: {
    failedCalls1h: number
    failedCalls24h: number
    trialsEnding7d: number | null
    cancellationsPending: number
    openTickets: number
    awaitingUs: number
    creditsLowAccounts: number
    zeroBalanceLiveAccounts: number
    integrationFailures24h: number
    workersHealthy: number
    workersExpected: number
    /** Same rule as the low-credit owner email; up to 10, fewest days left first. */
    creditsLowList?: AdminLowCreditAccount[]
  }
  revenueMtd?: { capturedInr: number; topupsInr: number; refundsInr: number; netInr: number }
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
  /** This billing period, as the customer's Billing page shows it; null if it couldn't be read. */
  credits_used: number | null
  credits_total: number | null
  mrr: number
  effective_plan?: string
  internal?: boolean
  // Signup facts for the list: ad source (utm_source) or "How did you hear".
  source?: string
  industry?: string
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
    referral_source?: string
    // Full-page onboarding answers and first-touch attribution (JSON objects).
    onboarding_profile?: Record<string, string | string[]>
    signup_attribution?: Record<string, string>
    /** Real commercial state: subscription plan, 'top-up', 'trial' or 'none'. */
    effective_plan?: string
    internal?: boolean
    is_platform_owner?: number
  }
  owner: { id: number; email: string; name: string; phone?: string; auth_provider?: string | null } | null
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
    /** Set while two-step login is on for this user. */
    mfa_enabled_at?: string | null
  }[]
  agents: { id: number; name: string; status: string; voice: string; model: string; kb_id: number | null; updated_at: string }[]
  /** The starter agent onboarding set up from the answers; null if it never ran. */
  onboardingAgent?:
    | { deleted: true }
    | {
        deleted?: undefined
        id: number
        name: string
        status: string
        language: string
        welcomeMessage: string
        postCallFields: string[]
        updatedAt: string | null
        setUp: { language: string; welcomeMessage: string; postCallFields: string[] }
        changed: { instructions: boolean; language: boolean; welcome: boolean; fields: boolean }
      }
    | null
  knowledgeBases: { id: number; name: string; strict: number; sources: number }[]
  numbers: { id: number; number: string; label: string; agent_id: number | null; status: string }[]
  integrations: { key: string; name: string; category: string; status: string }[]
  invoices: { id: number; kind: string; amount_inr: number; status: string; credits: number | null; bonus_credits: number | null; invoice_number: string | null; created_at: string; paid_at: string | null }[]
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
  /** Last 10 actions the help copilot proposed in this workspace. */
  copilotActions?: CopilotAction[]
  health: AccountHealth
}

export type HealthLevel = 'ok' | 'warn' | 'critical'

export interface AccountHealth {
  overall: HealthLevel
  checks: { key: string; level: HealthLevel; label: string; detail: string }[]
  calls7d: number
  failed7d: number
  failureReasons: { reason: string; count: number }[]
  errors: { source: string; level: string; message: string; context: string; created_at: string }[]
  openTickets: number
  lastCallAt: string | null
  lastLoginAt: string | null
  country: string
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
  // Admin P0 triage fields; optional until the backend ships them.
  failureReason?: string | null
  disconnectReason?: string | null
  startedAtIso?: string
  internal?: boolean
}

export interface AdminCallDetail extends AdminCallRow {
  transcript: { role: string; text?: string; content?: string }[]
  lead_company: string | null
  lead_use_case: string | null
  lead_team_size: string | null
  feedback: 'helpful' | 'not_helpful' | null
  feedback_comment: string | null
  connect_latency_ms: number | null
  agent_join_latency_ms: number | null
  first_response_latency_ms: number | null
  failure_reason: string | null
  latency_metrics: {
    eouMs?: number[]
    transcriptionMs?: number[]
    llmTtftMs?: number[]
    ttsTtfbMs?: number[]
    providers?: string[]
  }
  // Owner-only. Withheld from the tenant API on purpose - see
  // calls_db._call_dict: the raw model/voice name our upstream vendors, and
  // the tool timings are mostly our own infrastructure.
  model: string | null
  voice: string | null
  disconnect_reason: string | null
  tool_calls: { name: string; ok: boolean; ms?: number; error?: string; note?: string }[]
  diagnostic_events: {
    id: string
    kind: string
    stage: string
    label: string
    status: 'info' | 'ok' | 'warning' | 'error'
    offsetMs: number
    durationMs?: number
    provider?: string
    model?: string
    previousProvider?: string
    reason?: string
  }[]
  /** Visitor behind a website demo / test / widget call (null for phone calls and older calls). */
  visitor?: AdminCallVisitor | null
}

export interface AdminCallVisitor {
  ip: string
  userAgent: string
  source: string
  seenAt: string
  callsFromIp30d: number
  /** Id of the block covering this IP, or null. */
  blockId: number | null
}

export interface AdminIpBlock {
  id: number
  network: string
  reason: string
  createdAt: string
  createdBy: string
  expiresAt: string | null
  active: boolean
}

export interface AdminPricing {
  plans: { plan: string; priceInr: number; credits: number }[]
  channelRates: Record<string, number>
  voiceTiers: Record<string, number>
  modelTiers: Record<string, number>
  minCreditsPerMinute: number
  // Minute pricing (17 Oct): overage is a fixed ₹/min per plan; annual = 11 months' price.
  overagePerMinuteInr: Record<string, number>
  annualPriceInr: Record<string, number>
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
  /** Customer revenue (ex GST) in the last 30 days; ARPA = this / paying accounts. */
  revenue30dInr?: number
  arpa: number
}

export interface AdminBilling {
  mrr: number
  payingAccounts: number
  revenue30dInr?: number
  arpa: number
  byPlan: { plan: string; accounts: number; price: number; mrr: number }[]
  nearLimit: { id: number; name: string; plan: string; used: number; total: number; pct: number }[]
  convert: { id: number; name: string; plan: string; used: number; total: number; pct: number }[]
}

export interface AdminLowCreditAccount {
  accountId: number
  name: string
  liveAgents: number
  remaining: number
  avgDaily: number
  daysLeft: number | null
}

/** One account's usage in the range. estCostInr is an ESTIMATE from the
 * server's VENDOR_COST_RATES table; revenueInr is net of refunds and GST. */
export interface AdminUsageRow {
  id: number
  name: string
  plan: string
  calls: number
  minutes: number
  credits: number
  testMinutes: number
  revenueInr: number
  estCostInr: number
  marginInr: number
  internal?: boolean
}

export interface AdminUsage {
  range: { from: string; to: string; tz: string }
  costEstimated: true
  rates: { key: string; label: string; inrPerMin: number; source: string }[]
  accounts: AdminUsageRow[]
  /** Customers only. */
  totals: Omit<AdminUsageRow, 'id' | 'name' | 'plan'>
  /** Vistrow's own accounts (real vendor cost, no revenue). */
  internalTotals?: Omit<AdminUsageRow, 'id' | 'name' | 'plan'>
}

export interface AdminRevenueMonth {
  month: string
  capturedInr: number
  topupsInr: number
  refundsInr: number
  netInr: number
}

export interface AdminInvoice {
  id: number
  accountId: number
  accountName: string
  kind: string
  amountInr: number
  gstInr: number
  status: string
  invoiceNumber: string | null
  credits: number | null
  createdAt: string | null
  paidAt: string | null
  refundedAt: string | null
}

export interface AdminFinance {
  months: AdminRevenueMonth[]
  revenueMtd: AdminRevenueMonth
  failedPayments30d: AdminInvoice[]
  costVsRevenueMtd: { from: string; to: string; costEstimated: true; revenueInr: number; estCostInr: number; marginInr: number; minutes: number }
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

export interface AdminVendorCredit {
  key: string
  name: string
  category: string
  mode: 'manual' | 'live'
  balance: number | null
  unit: string
  threshold: number | null
  notes: string
  source: 'manual' | 'live' | 'live_failed'
  checkedAt: string | null
  lastError: string | null
  updatedBy: string
}

export interface AdminHealth {
  dbOk: boolean
  liveCalls: number | null
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
  disconnectReasons24h: { reason: string; count: number }[]
  // Admin P0: real liveness instead of a hard-coded "Backend online" tile.
  workers?: AdminWorker[]
  api?: { ok: boolean; dbLatencyMs: number | null }
  // Last vendor health check (server/vendor_health.py), null before the first.
  vendors?: VendorReport | null
}

export interface VendorReport {
  checkedAt: string
  results: { name: string; status: 'ok' | 'warn' | 'fail' | 'skipped'; detail: string; latencyMs: number }[]
}

export interface AdminWorker {
  name: string
  agentId: string
  lastSeenAt: string | null
  ageSeconds: number | null
  status: 'ok' | 'stale' | 'unknown'
  version: string | null
  host: string | null
}

export interface AdminPrivacyRequest {
  id: number
  request_type: 'export' | 'deletion'
  status: 'pending' | 'in_progress' | 'completed' | 'rejected'
  admin_note: string
  created_at: string
  updated_at: string
  user_id: number
  user_name: string
  user_email: string
  account_id: number
  account_name: string
}

export interface AdminOutboundTrunkStatus {
  configured: boolean
  trunkId: string | null
  address: string | null
  callerId: string | null
}

// ---------------------------------------------------------------- calls

export const adminOverview = (days = 30) => aget<AdminOverview>(`/overview${qs({ days })}`)

export const adminAccounts = (p: { search?: string; plan?: string; status?: string; activity?: string; limit?: number; offset?: number } = {}) =>
  aget<{ accounts: AdminAccountRow[]; total: number }>(`/accounts${qs(p)}`)

export const adminAccountDetail = (id: number) => aget<AdminAccountDetail>(`/accounts/${id}`)

export const adminUsers = (p: { search?: string; limit?: number; offset?: number } = {}) =>
  aget<{ users: AdminUserRow[]; total: number }>(`/users${qs(p)}`)

export const adminCalls = (
  p: { account_id?: number; channel?: string; days?: number; hours?: number; outcome?: '' | 'failed' | 'ok'; search?: string; limit?: number; offset?: number } = {},
) =>
  aget<{ calls: AdminCallRow[]; total: number }>(`/calls${qs(p)}`)

export const adminCallDetail = (id: number) => aget<AdminCallDetail>(`/calls/${id}`)

export const adminAnalytics = (days = 30) => aget<AdminAnalytics>(`/analytics${qs({ days })}`)

export const adminBilling = () => aget<AdminBilling>('/billing')
export const adminUsage = (p: { from?: string; to?: string; days?: number; accountId?: number } = {}) =>
  aget<AdminUsage>(`/usage${qs({ from: p.from, to: p.to, days: p.days, account_id: p.accountId })}`)
export const adminFinance = () => aget<AdminFinance>('/finance')
export const adminInvoices = (status = '') => aget<{ invoices: AdminInvoice[] }>(`/invoices${qs({ status })}`)

export const adminAudit = (p: { action?: string; limit?: number; offset?: number } = {}) =>
  aget<{ entries: AdminAuditEntry[]; total: number }>(`/audit${qs(p)}`)

export const adminHealth = () => aget<AdminHealth>('/health')
export const adminRunVendorHealth = () => apost<VendorReport>('/vendor-health/run')

export const adminPrivacyRequests = (status = '') =>
  aget<{ requests: AdminPrivacyRequest[] }>(`/privacy-requests${qs({ status })}`)
export const adminUpdatePrivacyRequest = (id: number, status: AdminPrivacyRequest['status'], note: string) =>
  apost<{ request: AdminPrivacyRequest }>(`/privacy-requests/${id}`, { status, note })

export const adminVendorCredits = () => aget<{ vendors: AdminVendorCredit[] }>('/vendor-credits')
export const adminUpdateVendorCredit = (
  key: string,
  p: { balance: number | null; unit: string; threshold: number | null; notes: string },
) => apost<{ vendors: AdminVendorCredit[] }>(`/vendor-credits/${key}`, p)

// mutations
export const adminSetCredits = (id: number, total: number, reason: string) =>
  apost<AdminAccountDetail>(`/accounts/${id}/credits`, { total, reason })
export const adminSetPlan = (id: number, plan: string, reason: string) =>
  apost<AdminAccountDetail>(`/accounts/${id}/plan`, { plan, reason })
export const adminSetStatus = (id: number, status: string, reason: string) =>
  apost<AdminAccountDetail>(`/accounts/${id}/status`, { status, reason })
export const adminSetNotes = (id: number, notes: string) => apost<AdminAccountDetail>(`/accounts/${id}/notes`, { notes })
export const adminResetTwoStep = (id: number, userId: number, reason: string) =>
  apost<AdminAccountDetail>(`/accounts/${id}/users/${userId}/reset-two-step`, { reason })
export const adminResetPassword = (id: number) => apost<{ ok: boolean; emailSent: boolean; resetLink: string }>(`/accounts/${id}/reset-password`)
export const adminImpersonate = (id: number) => apost<{ ok: boolean }>(`/impersonate/${id}`)
export const adminExitImpersonation = () => apost<{ ok: boolean }>('/impersonate/exit')

// Where "Exit" in the support-session banner goes back to — the ticket or
// account page the session was started from, not always the admin home.
const RETURN_KEY = 'vv-support-session-return'
export function rememberSupportReturn(path: string) {
  try {
    sessionStorage.setItem(RETURN_KEY, path)
  } catch {
    /* storage blocked — Exit falls back to /admin */
  }
}
export function takeSupportReturn(): string {
  try {
    const path = sessionStorage.getItem(RETURN_KEY)
    sessionStorage.removeItem(RETURN_KEY)
    return path && path.startsWith('/admin') ? path : '/admin'
  } catch {
    return '/admin'
  }
}

export const adminOutboundTrunkStatus = () => aget<AdminOutboundTrunkStatus>('/outbound-trunk')
export const adminSyncOutboundTrunk = (address: string, callerId: string, reason: string) =>
  apost<AdminOutboundTrunkStatus>('/outbound-trunk', { address, caller_id: callerId, reason })

export const PLAN_LABELS: Record<string, string> = { free: 'Free', starter: 'Starter', growth: 'Growth', scale: 'Scale' }

// What billing actually charges, read from the server (Settings page).
export const adminPricing = () => aget<AdminPricing>('/pricing')

// Real commercial state of an account (admin_db._EFFECTIVE_PLAN).
export const EFFECTIVE_PLAN_LABELS: Record<string, string> = {
  starter: 'Starter', growth: 'Growth', scale: 'Scale', 'top-up': 'Top-up', trial: 'Trial', none: 'No plan',
}

export const adminIpBlocks = () => aget<{ blocks: AdminIpBlock[] }>('/ip-blocks')
export const adminAddIpBlock = (ip: string, reason: string, expiresDays: number | null) =>
  apost<{ ok: boolean; id: number; network: string }>('/ip-blocks', { ip, reason, expiresDays })
export const adminRemoveIpBlock = (id: number, reason: string) => apost<{ ok: boolean }>(`/ip-blocks/${id}/remove`, { reason })

// ----------------------------------------------------------- support inbox

export const adminSupportTickets = (status = '') => aget<SupportTicket[]>(`/support/tickets${qs({ status })}`)
export const adminSupportTicket = (id: number) => aget<SupportTicket>(`/support/tickets/${id}`)
export const adminReplySupportTicket = (
  id: number,
  body: string,
  attachments: { filename: string; contentType: string; content: string }[] = [],
) => apost<SupportTicket>(`/support/tickets/${id}/messages`, { body, attachments })
export const adminUpdateSupportTicket = (id: number, change: { status?: string; priority?: string }) =>
  apatch<SupportTicket>(`/support/tickets/${id}`, change)
export const adminAddSupportNote = (id: number, body: string) =>
  apost<SupportTicket>(`/support/tickets/${id}/notes`, { body })
export const adminSupportTeam = () => aget<{ id: number; name: string; email: string }[]>('/support/team')
export async function adminAssignSupportTicket(id: number, userId: number | null): Promise<SupportTicket> {
  const res = await fetch(`/api/admin/support/tickets/${id}/assignee`, {
    method: 'PUT',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  })
  if (res.status === 401) onUnauthorized()
  if (!res.ok) throw await errorFrom(res, 'PUT assignee')
  return res.json()
}

/** A4 PDF of one of a tenant's invoices, for support and accounting. */
export const adminInvoicePdfUrl = (accountId: number, invoiceId: number) => `/api/admin/accounts/${accountId}/invoices/${invoiceId}/pdf`
