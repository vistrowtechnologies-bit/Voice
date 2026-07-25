import { next } from '@vercel/functions'

// Splits one SPA build across three hostnames without a second deployment:
// app.vistrowvoice.com is the authenticated dashboard, docs.vistrowvoice.com
// is the docs section, vistrowvoice.com is everything else (marketing). All
// three are the same Vercel project/build; this just bounces a request to
// the "right" host before it ever reaches index.html, since React Router
// alone can't see the hostname the browser actually asked for.
export const config = {
  matcher: [
    '/((?!api/|assets/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|mp4|woff2?|json|txt|xml)$).*)',
  ],
}

const APP_PREFIXES = [
  '/dashboard',
  '/admin',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/invite',
]

const DOCS_PREFIXES = ['/resources/docs']

type Bucket = 'app' | 'docs' | 'marketing'

function pathBucket(pathname: string): Bucket {
  if (APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return 'app'
  if (DOCS_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return 'docs'
  return 'marketing'
}

function hostBucket(host: string): Bucket {
  if (host.startsWith('app.')) return 'app'
  if (host.startsWith('docs.')) return 'docs'
  return 'marketing'
}

const HOSTS: Record<Bucket, string> = {
  app: 'app.vistrowvoice.com',
  docs: 'docs.vistrowvoice.com',
  marketing: 'vistrowvoice.com',
}

export default function middleware(request: Request) {
  const url = new URL(request.url)
  const host = request.headers.get('host') || ''
  const current = hostBucket(host)

  // Root of a dedicated subdomain has no natural marketing-bucket landing
  // page, so send it straight to that subdomain's real content first.
  if (url.pathname === '/') {
    if (current === 'app') return Response.redirect(`https://${host}/dashboard`, 308)
    if (current === 'docs') return Response.redirect(`https://${host}/resources/docs`, 308)
  }

  const target = pathBucket(url.pathname)
  if (target !== current) {
    return Response.redirect(`https://${HOSTS[target]}${url.pathname}${url.search}`, 308)
  }

  return next()
}
