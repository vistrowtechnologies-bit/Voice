import { next } from '@vercel/functions'
import { pathBucket, hostBucket, BUCKET_HOST } from './src/lib/hostBuckets'

// Splits one SPA build across the authenticated app and public marketing
// hosts. The former docs subdomain is retained only as a permanent redirect.
// Both hosts use the same Vercel project/build; this just bounces a request to
// the "right" host before it ever reaches index.html, since React Router
// alone can't see the hostname the browser actually asked for.
//
// This only fires on an actual HTTP request (a hard navigation or the
// initial load) — an in-app <Link> click never re-hits this file, since
// React Router just swaps components client-side. MarketingLayout's
// bucket-aware NavLink (imports the same pathBucket/hostBucket helpers)
// is what keeps client-side navigation from drifting onto the wrong host.
export const config = {
  matcher: [
    '/((?!api/|assets/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|mp4|woff2?|json|txt|xml|html)$).*)',
  ],
}

export default function middleware(request: Request) {
  const url = new URL(request.url)
  const host = request.headers.get('host') || ''
  const current = hostBucket(host)

  if (current === 'docs') {
    return Response.redirect(`https://${BUCKET_HOST.marketing}/resources/docs`, 308)
  }

  // admin.vistrowvoice.com serves the panel, its own sign-in, and the tenant
  // dashboard during a support ("View as") session (the app then sends
  // /dashboard back to /admin when no session is running). Other app pages
  // (sign-up, password reset) belong to the customer app; marketing pages to
  // www.
  if (current === 'admin') {
    const under = (prefix: string) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`)
    if (under('/admin') || under('/login') || under('/dashboard')) return next()
    if (url.pathname === '/' || pathBucket(url.pathname) === 'app') return Response.redirect(`https://${host}/admin`, 308)
    return Response.redirect(`https://${BUCKET_HOST.marketing}${url.pathname}${url.search}`, 308)
  }

  // Once the admin host is live (VITE_ADMIN_HOST_LIVE=1 on Vercel), the
  // customer app no longer serves /admin. Off until DNS and the domain are in
  // place, so the panel never points at a host that does not resolve.
  if (current === 'app' && process.env.VITE_ADMIN_HOST_LIVE === '1' && (url.pathname === '/admin' || url.pathname.startsWith('/admin/'))) {
    return Response.redirect(`https://${BUCKET_HOST.admin}${url.pathname}${url.search}`, 307)
  }

  // Root of the app subdomain has no marketing-bucket landing page of its
  // own, so send it straight to the dashboard.
  if (url.pathname === '/' && current === 'app') {
    return Response.redirect(`https://${host}/dashboard`, 308)
  }

  // Marketing's root is owned locally.
  if (url.pathname === '/') {
    return next()
  }

  const target = pathBucket(url.pathname)
  if (target !== current) {
    return Response.redirect(`https://${BUCKET_HOST[target]}${url.pathname}${url.search}`, 308)
  }

  return next()
}
