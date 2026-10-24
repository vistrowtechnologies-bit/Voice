import { lazy, useEffect, type ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { ADMIN_HOST, ADMIN_HOST_LIVE, canOpenAdmin, isAdminHost } from '../lib/adminHost'
import { AuthShell } from '../pages/AuthShell'
import { Icon } from './Icon'
import { AppLoadingScreen } from './AppLoadingScreen'

// App.tsx imports this gate eagerly, so a static AdminLayout import pulled the
// whole dashboard shell (and the LiveKit test-call client) into every
// marketing page. The App-level <Suspense> covers the load.
const AdminLayout = lazy(() => import('./AdminLayout').then((m) => ({ default: m.AdminLayout })))

/** Gate around every /admin/* route. Only the platform owner (accounts
 * .is_platform_owner) reaches it; everyone else - including logged-in tenants
 * poking at the URL - is redirected to their own dashboard. The backend also
 * 404s /admin/* for non-owners, so this is defense-in-depth, not the only lock.
 * Wraps the page in the AdminLayout shell so every admin route shares the
 * red-bar + sidebar chrome. */
export function RequireOwner({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const { pathname, search } = useLocation()
  const here = pathname + search
  const onAdminHost = isAdminHost()

  // Once admin.vistrowvoice.com is live the customer app no longer serves
  // the panel: send the owner there (it has its own sign-in).
  if (!onAdminHost && ADMIN_HOST_LIVE) return <GoToAdminHost path={here} />

  if (loading) {
    return <AppLoadingScreen message="Loading the admin workspace…" />
  }

  if (onAdminHost) {
    // Only a session from the admin host's own sign-in opens the panel.
    if (!canOpenAdmin(user) || !user?.adminSession) return <Navigate to={`/login?next=${encodeURIComponent(here)}`} replace />
    return <AdminLayout>{children}</AdminLayout>
  }

  if (!user) return <Navigate to="/login" state={{ from: here }} replace />
  if (!canOpenAdmin(user)) return <Navigate to="/dashboard" replace />
  // The server refuses /admin without two-step login (security audit
  // 2026-10-12); say what to do instead of showing a page of errors.
  if (!user.mfaEnabled || !user.mfaVerified) return <AdminNeedsTwoStep enabled={!!user.mfaEnabled} returnTo={here} />

  return <AdminLayout>{children}</AdminLayout>
}

/** A real navigation, not a router one: it is another host. */
export function GoToAdminHost({ path }: { path: string }) {
  useEffect(() => {
    window.location.replace(`https://${ADMIN_HOST}${path}`)
  }, [path])
  return <AppLoadingScreen message="Opening the admin panel…" />
}

function AdminNeedsTwoStep({ enabled, returnTo }: { enabled: boolean; returnTo: string }) {
  const { logout } = useAuth()
  return (
    <AuthShell
      title={enabled ? 'Sign in again with your code' : 'Turn on two-step login'}
      subtitle={
        enabled
          ? 'This browser signed in before two-step login was on. Sign out and back in with your authenticator code to open the admin panel.'
          : 'The admin panel can change every workspace, so it needs a code from an authenticator app as well as your password.'
      }
      headline={<>Admin access is <span className="text-primary">protected.</span></>}
      features={['A stolen password alone can’t open admin', 'Codes come from your phone', 'Recovery codes if you lose it']}
    >
      <div className="flex flex-col gap-3">
        {enabled ? (
          <button
            type="button"
            // Back to this admin page after the code, not the tenant dashboard.
            onClick={() => void logout().then(() => { window.location.href = `/login?next=${encodeURIComponent(returnTo)}` })}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-bold text-bg hover:opacity-90"
          >
            <Icon name="logout" className="text-[18px]" /> Sign out and sign back in
          </button>
        ) : (
          <Link to="/dashboard/settings?tab=security" className="flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-bold text-bg hover:opacity-90">
            <Icon name="lock" className="text-[18px]" /> Set up two-step login
          </Link>
        )}
        <Link to="/dashboard" className="text-center text-sm font-semibold text-cyan hover:underline">Back to my dashboard</Link>
      </div>
    </AuthShell>
  )
}
