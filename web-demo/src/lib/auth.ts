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

export interface AuthConfig {
  oauthProviders: string[]
  emailConfigured: boolean
}
export const apiAuthConfig = () => authFetch<AuthConfig>('/auth/config')

export const apiRequestPasswordReset = (email: string) =>
  authFetch<{ ok: boolean }>('/auth/request-password-reset', { email })
export const apiResetPassword = (token: string, password: string) =>
  authFetch<{ ok: boolean; user?: AuthUser }>('/auth/reset-password', { token, password })
