import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { MarketingLayout } from '../../components/MarketingLayout'

// Placeholder for nav destinations that aren't built yet (Blog, Docs, Case
// Studies, Privacy, Terms) — keeps the nav free of dead links.
export function ComingSoon({ title = 'Coming soon' }: { title?: string }) {
  return (
    <MarketingLayout>
      <section className="mx-auto flex max-w-2xl flex-col items-center px-5 py-32 text-center md:px-8">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
          <Icon name="construction" className="text-[32px]" />
        </span>
        <h1 className="mt-6 font-display text-4xl font-bold tracking-tight">{title}</h1>
        <p className="mt-4 max-w-md text-lg text-text-muted">
          We’re putting this together. In the meantime, try Artha live or book a walkthrough.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            to="/demo"
            className="flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-dark px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
          >
            <Icon name="mic" className="text-[18px]" />
            Talk to Artha live
          </Link>
          <Link
            to="/"
            className="rounded-full border border-border px-6 py-3 text-sm font-bold text-text transition-colors hover:border-primary"
          >
            Back home
          </Link>
        </div>
      </section>
    </MarketingLayout>
  )
}
