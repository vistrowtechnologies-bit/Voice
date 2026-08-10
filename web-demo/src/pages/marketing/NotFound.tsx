import { MarketingLayout, NavLink } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'

export function NotFound() {
  return (
    <MarketingLayout>
      <Seo
        title="Page Not Found | Vistrow Voice"
        description="The page you requested could not be found."
        path={window.location.pathname}
        noindex
      />
      <section className="mx-auto flex min-h-[55vh] max-w-2xl flex-col items-center justify-center px-5 py-24 text-center md:px-8">
        <p className="text-sm font-bold uppercase tracking-[0.24em] text-cyan">404</p>
        <h1 className="mt-4 font-display text-4xl font-bold tracking-tight sm:text-5xl">This page has moved or doesn’t exist.</h1>
        <p className="mt-4 text-lg text-text-muted">Return home, or try Artha live while you’re here.</p>
        <NavLink to="/" className="mt-8 rounded-full bg-primary px-6 py-3 text-sm font-bold text-white hover:opacity-90">
          Back to Vistrow Voice
        </NavLink>
      </section>
    </MarketingLayout>
  )
}
