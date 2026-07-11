import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { AdminLayout } from './AdminLayout'

/** Gate around every /admin/* route. Only the platform owner (accounts
 * .is_platform_owner) reaches it; everyone else — including logged-in tenants
 * poking at the URL — is redirected to their own dashboard. The backend also
 * 404s /admin/* for non-owners, so this is defense-in-depth, not the only lock.
 * Wraps the page in the AdminLayout shell so every admin route shares the
 * red-bar + sidebar chrome. */
export function RequireOwner({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg text-text-muted">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (!user.isPlatformOwner) return <Navigate to="/dashboard" replace />

  return <AdminLayout>{children}</AdminLayout>
}
