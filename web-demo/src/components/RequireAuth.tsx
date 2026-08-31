import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { AppLoadingScreen } from './AppLoadingScreen'

/** Gate around every /dashboard/* route. While the session is still being
 * probed it shows a neutral splash (avoids a login-flash for returning
 * users); with no session it redirects to /login, preserving where the user
 * was headed so login can send them back. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <AppLoadingScreen />
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  return <>{children}</>
}
