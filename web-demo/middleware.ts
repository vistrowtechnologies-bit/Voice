import { next } from '@vercel/functions'

// Splits one SPA build across two hostnames without a second deployment:
// app.vistrowvoice.com is the authenticated dashboard, vistrowvoice.com is
// the public marketing site. Both are the same Vercel project/build; this
// just bounces a request to the "wrong" host before it ever reaches
// index.html, since React Router alone can't see the hostname the browser
// actually asked for.
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

function isAppPath(pathname: string): boolean {
  return APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export default function middleware(request: Request) {
  const url = new URL(request.url)
  const host = request.headers.get('host') || ''
  const onAppHost = host.startsWith('app.')

  if (onAppHost) {
    if (url.pathname === '/') {
      return Response.redirect(`https://${host}/dashboard`, 308)
    }
    if (!isAppPath(url.pathname)) {
      return Response.redirect(`https://vistrowvoice.com${url.pathname}${url.search}`, 308)
    }
  } else if (isAppPath(url.pathname)) {
    return Response.redirect(`https://app.vistrowvoice.com${url.pathname}${url.search}`, 308)
  }

  return next()
}
