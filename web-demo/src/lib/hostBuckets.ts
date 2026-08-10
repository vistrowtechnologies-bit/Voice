// Single source of truth for the www.vistrowvoice.com/app.vistrowvoice.com
// host split - imported by both middleware.ts (runs
// server-side on every request) and MarketingLayout.tsx (runs client-side,
// so an in-app <Link> click that crosses a bucket boundary still forces a
// real cross-host navigation instead of silently rendering the wrong
// page under the wrong hostname).

export type Bucket = 'app' | 'docs' | 'marketing'

export const APP_PREFIXES = [
  '/dashboard',
  '/admin',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/invite',
]

// Docs are part of the marketing site so crawlers and visitors share one
// canonical URL. The legacy docs subdomain redirects to this route.
export const DOCS_PREFIXES: string[] = []

export function pathBucket(pathname: string): Bucket {
  if (APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return 'app'
  if (DOCS_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return 'docs'
  return 'marketing'
}

export function hostBucket(hostname: string): Bucket {
  if (hostname.startsWith('app.')) return 'app'
  if (hostname.startsWith('docs.')) return 'docs'
  return 'marketing'
}

export const BUCKET_HOST: Record<Bucket, string> = {
  app: 'app.vistrowvoice.com',
  docs: 'www.vistrowvoice.com',
  marketing: 'www.vistrowvoice.com',
}
