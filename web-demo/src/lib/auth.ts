import { createContext, useContext } from 'react'

export interface AuthUser {
  id: number
  name: string
  email: string
  role: string
  accountId: number
  accountName: string
  plan: string
  isPlatformOwner: boolean
  onboarded: boolean
  tourCompleted: boolean
  impersonating: boolean
  authProvider: string
  passwordSet: boolean
  avatarUrl: string
}

export interface AuthState {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (data: {
    name: string
    company: string
    email: string
    password: string
    referral_source?: string
    phone?: string
  }) => Promise<SignupResult>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  setUser: (user: AuthUser) => void
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}

// --- API calls (credentials:'include' carries the session cookie) ---

async function authFetch<T>(path: string, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: method || (body ? 'POST' : 'GET'),
    credentials: 'include',
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    // FastAPI puts the human-readable reason in `detail`.
    throw new Error(data?.detail || `Request failed (${res.status})`)
  }
  return data as T
}

export const apiMe = () => authFetch<{ user: AuthUser }>('/auth/me')
export const apiLogin = (email: string, password: string) =>
  authFetch<{ user: AuthUser }>('/auth/login', { email, password })
export const apiSignup = (data: {
  name: string
  company: string
  email: string
  password: string
  referral_source?: string
  phone?: string
}) => authFetch<SignupResult>('/auth/signup', data)
export interface SignupResult {
  ok: boolean
  verificationRequired: true
  email: string
  emailSent: boolean
  resendAfter: number
}
export const apiVerifyEmail = (email: string, code: string) =>
  authFetch<{ ok: boolean; user: AuthUser }>('/auth/verify-email', { email, code })
export const apiResendEmailVerification = (email: string) =>
  authFetch<{ ok: boolean; resendAfter: number }>('/auth/resend-email-verification', { email })
export const apiLogout = () => authFetch<{ ok: boolean }>('/auth/logout', {})
export const apiUpdateProfile = (data: { name?: string; currentPassword?: string; newPassword?: string }) =>
  authFetch<{ user: AuthUser }>('/profile', data, 'PATCH')
export const apiUpdateProfileAvatar = async (image: File) => {
  const form = new FormData()
  form.append('image', image)
  const res = await fetch('/api/profile/avatar', { method: 'POST', credentials: 'include', body: form })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.detail || `Request failed (${res.status})`)
  return data as { user: AuthUser }
}
export const apiRequestEmailChange = (email: string) => authFetch<{ ok: boolean }>('/profile/request-email-change', { email })
export const apiConfirmEmailChange = (token: string) => authFetch<{ ok: boolean; user: AuthUser }>(`/auth/confirm-email-change?token=${encodeURIComponent(token)}`)
export interface UserPreferences {
  timezone: string
  language: 'en' | 'hi'
  notify_leads: boolean
  notify_calls: boolean
  notify_billing: boolean
  notify_product: boolean
}
export const apiProfilePreferences = () => authFetch<UserPreferences>('/profile/preferences')
export const apiUpdateProfilePreferences = (data: Partial<UserPreferences>) => authFetch<UserPreferences>('/profile/preferences', data, 'PATCH')
export const apiSecurityEvents = () => authFetch<{ event: string; provider: string; user_agent: string; created_at: string }[]>('/profile/security-events')
export const apiSignOutOthers = () => authFetch<{ ok: boolean; user: AuthUser }>('/profile/sign-out-others', {})
export const apiDownloadDataExport = async () => {
  const res = await fetch('/api/profile/request-data-export', { method: 'POST', credentials: 'include' })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data?.detail || `Export failed (${res.status})`)
  }
  const blob = await res.blob()
  const disposition = res.headers.get('Content-Disposition') || ''
  const filename = disposition.match(/filename="?([^";]+)"?/)?.[1] || 'vistrow-voice-data.json'
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
export const apiRequestAccountDeletion = () => authFetch<{ ok: boolean }>('/profile/request-account-deletion', {})
export const apiUpdateAccount = (name: string) => authFetch<{ user: AuthUser }>('/account', { name }, 'PATCH')
export const apiCompleteOnboarding = () => authFetch<{ user: AuthUser }>('/onboarding/complete', {})
export const apiCompleteTour = () => authFetch<{ user: AuthUser }>('/tour/complete', {})

export interface AuthConfig {
  oauthProviders: string[]
  emailConfigured: boolean
}
export const apiAuthConfig = () => authFetch<AuthConfig>('/auth/config')

export const apiRequestPasswordReset = (email: string) =>
  authFetch<{ ok: boolean }>('/auth/request-password-reset', { email })
export const apiResetPassword = (token: string, password: string) =>
  authFetch<{ ok: boolean; user?: AuthUser }>('/auth/reset-password', { token, password })

// --- team & invites ---------------------------------------------------

// Mirrors calls_db.ROLE_RANK - the single client-side source of truth for
// "can this role do that" UI gating (hide/disable, not the real enforcement,
// which is server-side via require_role).
export const ROLE_RANK: Record<string, number> = { viewer: 0, member: 1, admin: 2, owner: 3 }
export const hasRole = (user: AuthUser | null, min: string) =>
  !!user && (ROLE_RANK[user.role] ?? 0) >= ROLE_RANK[min]

export interface TeamMember {
  id: number
  name: string
  email: string
  role: string
  auth_provider: string | null
  last_login_at: string | null
  created_at: string
}

export interface PendingInvite {
  id: number
  email: string
  name: string
  role: string
  status: string
  created_at: string
  expires_at: number
}

export interface InviteInfo {
  email: string
  name: string
  role: string
  accountName: string
}

export const apiTeamMembers = () => authFetch<TeamMember[]>('/team/members')
export const apiTeamInvites = () => authFetch<PendingInvite[]>('/team/invites')
export const apiInviteMember = (data: { email: string; name: string; role: string }) =>
  authFetch<{ ok: boolean; emailSent: boolean; inviteLink: string }>('/team/invite', data)
export const apiRevokeInvite = (id: number) => authFetch<{ ok: boolean }>(`/team/invites/${id}/revoke`, {})
export const apiUpdateMemberRole = (id: number, role: string) =>
  authFetch<{ ok: boolean }>(`/team/members/${id}`, { role }, 'PATCH')
export const apiRemoveMember = (id: number) => authFetch<{ ok: boolean }>(`/team/members/${id}`, undefined, 'DELETE')

export const apiGetInvite = (token: string) => authFetch<InviteInfo>(`/invite/${token}`)
export const apiAcceptInvite = (token: string, password: string) =>
  authFetch<{ ok: boolean; user: AuthUser }>('/invite/accept', { token, password })
