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
}

export interface AuthState {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (data: { name: string; company: string; email: string; password: string }) => Promise<void>
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
export const apiSignup = (data: { name: string; company: string; email: string; password: string }) =>
  authFetch<{ user: AuthUser }>('/auth/signup', data)
export const apiLogout = () => authFetch<{ ok: boolean }>('/auth/logout', {})
export const apiUpdateProfile = (data: { name?: string; currentPassword?: string; newPassword?: string }) =>
  authFetch<{ user: AuthUser }>('/profile', data, 'PATCH')
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

// Mirrors calls_db.ROLE_RANK — the single client-side source of truth for
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
