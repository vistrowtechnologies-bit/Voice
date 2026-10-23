import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AuthContext, apiLogin, apiLoginMfa, apiLogout, apiMe, apiSignup } from '../lib/auth'
import type { AuthUser } from '../lib/auth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const setUser = useCallback((next: AuthUser) => {
    setUserState(next)
    window.localStorage.setItem('vv-timezone', next.timezone || 'UTC')
  }, [])

  const refresh = useCallback(async () => {
    try {
      const { user } = await apiMe()
      setUser(user)
    } catch {
      setUserState(null)
      window.localStorage.removeItem('vv-timezone')
    } finally {
      setLoading(false)
    }
  }, [setUser])

  // Probe the session once, the first time anything reads auth state (useAuth
  // calls ensureSession), so a returning user with a valid cookie lands
  // straight in the dashboard without re-logging-in. Marketing pages never
  // call useAuth, so they skip the request (it was a 401 on every visit);
  // `loading` stays true until the probe has run.
  const probed = useRef(false)
  const ensureSession = useCallback(() => {
    if (probed.current) return
    probed.current = true
    refresh()
  }, [refresh])

  // A 401 from any data call (session expired mid-use) drops the user, which
  // makes RequireAuth bounce to /login on the next render.
  useEffect(() => {
    const onUnauthorized = () => {
      setUserState(null)
      window.localStorage.removeItem('vv-timezone')
    }
    window.addEventListener('vv-unauthorized', onUnauthorized)
    return () => window.removeEventListener('vv-unauthorized', onUnauthorized)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const { user, mfaRequired } = await apiLogin(email, password)
    if (mfaRequired || !user) return { mfaRequired: true }
    setUser(user)
    return {}
  }, [setUser])

  const verifyMfa = useCallback(async (code: string) => {
    const { user } = await apiLoginMfa(code)
    setUser(user)
  }, [setUser])

  const signup = useCallback(
    async (data: {
      name: string
      company: string
      email: string
      password: string
      referral_source?: string
      phone?: string
      accepted_terms: boolean
      confirmed_age: boolean
      attribution?: Record<string, string>
    }) => {
      return apiSignup(data)
    },
    [],
  )

  const logout = useCallback(async () => {
    try {
      await apiLogout()
    } finally {
      setUserState(null)
      window.localStorage.removeItem('vv-timezone')
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyMfa, signup, logout, refresh, setUser, ensureSession }}>
      {children}
    </AuthContext.Provider>
  )
}
