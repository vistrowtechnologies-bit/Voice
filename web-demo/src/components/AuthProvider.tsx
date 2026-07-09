import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { AuthContext, apiLogin, apiLogout, apiMe, apiSignup } from '../lib/auth'
import type { AuthUser } from '../lib/auth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const { user } = await apiMe()
      setUser(user)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // Probe the session once on load so a returning user with a valid cookie
  // lands straight in the dashboard without re-logging-in.
  useEffect(() => {
    refresh()
  }, [refresh])

  // A 401 from any data call (session expired mid-use) drops the user, which
  // makes RequireAuth bounce to /login on the next render.
  useEffect(() => {
    const onUnauthorized = () => setUser(null)
    window.addEventListener('vv-unauthorized', onUnauthorized)
    return () => window.removeEventListener('vv-unauthorized', onUnauthorized)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const { user } = await apiLogin(email, password)
    setUser(user)
  }, [])

  const signup = useCallback(
    async (data: { name: string; company: string; email: string; password: string }) => {
      const { user } = await apiSignup(data)
      setUser(user)
    },
    [],
  )

  const logout = useCallback(async () => {
    try {
      await apiLogout()
    } finally {
      setUser(null)
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, refresh, setUser }}>
      {children}
    </AuthContext.Provider>
  )
}
