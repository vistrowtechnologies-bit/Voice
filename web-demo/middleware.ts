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
