import { next } from '@vercel/functions'
import { pathBucket, hostBucket, BUCKET_HOST } from './src/lib/hostBuckets'

// Splits one SPA build across three hostnames without a second deployment:
// app.vistrowvoice.com is the authenticated dashboard, docs.vistrowvoice.com
// is the docs section, vistrowvoice.com is everything else (marketing). All
// three are the same Vercel project/build; this just bounces a request to
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

  // Root of the app subdomain has no marketing-bucket landing page of its
  // own, so send it straight to the dashboard.
  if (url.pathname === '/' && current === 'app') {
    return Response.redirect(`https://${host}/dashboard`, 308)
  }

  // Every subdomain's own root is "owned" locally and must never bounce
  // elsewhere: marketing's "/" really is Home, and docs' "/" is handled by
  // App.tsx rendering docs content directly based on hostname (see
  // HomeOrDocsRoot) rather than by carrying /resources/docs across in a
  // redirect. Without this, pathBucket('/') defaults to 'marketing' and the
  // generic mismatch check below would incorrectly redirect
  // docs.vistrowvoice.com/ to vistrowvoice.com/.
  if (url.pathname === '/') {
    return next()
  }

  const target = pathBucket(url.pathname)
  if (target !== current) {
    // Only one docs page exists today, so any docs-bucket path collapses to
    // the docs subdomain's clean root rather than carrying /resources/docs
    // across.
    const path = target === 'docs' ? '/' : `${url.pathname}${url.search}`
    return Response.redirect(`https://${BUCKET_HOST[target]}${path}`, 308)
  }

  return next()
}
