// admin.vistrowvoice.com: the platform owner's panel on its own host with its
// own sign-in. Cookies are host-only, so a session from app.vistrowvoice.com
// never opens it (the server also refuses /admin/* without an admin session
// once ADMIN_SEPARATE_LOGIN is on).

export const ADMIN_HOST = 'admin.vistrowvoice.com'

const DEV_OVERRIDE_KEY = 'vv-admin-host'

/** True on the admin host. On localhost only, `?admin=1` switches this tab
 * into admin-host mode for development (`?admin=0` switches it back); never
 * on a production host, where it would mint an admin session on the app's
 * host and undo the separation. */
export function isAdminHost(): boolean {
  if (typeof window === 'undefined') return false
  const { hostname, search } = window.location
  if (hostname === ADMIN_HOST) return true
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') return false
  try {
    const flag = new URLSearchParams(search).get('admin')
    if (flag === '1') sessionStorage.setItem(DEV_OVERRIDE_KEY, '1')
    if (flag === '0') sessionStorage.removeItem(DEV_OVERRIDE_KEY)
    return sessionStorage.getItem(DEV_OVERRIDE_KEY) === '1'
  } catch {
    return false
  }
}

/** The admin host is live (DNS and the Vercel domain are in place). Until
 * VITE_ADMIN_HOST_LIVE=1 the app keeps serving /admin itself, so the panel
 * never points at a host that does not resolve yet. */
export const ADMIN_HOST_LIVE = import.meta.env.VITE_ADMIN_HOST_LIVE === '1'

/** Paths the admin host serves: the panel and its sign-in, plus the tenant
 * dashboard while a support ("View as") session started there is running. */
export function adminHostServes(pathname: string, impersonating: boolean): boolean {
  const under = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  return under('/admin') || under('/login') || (impersonating && under('/dashboard'))
}
