import { Icon } from '../../components/Icon'
import { MarketingLayout, NavLink } from '../../components/MarketingLayout'
import { TalkToArthaButton } from '../../components/MarketingBits'

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
          <TalkToArthaButton />
          <NavLink
            to="/"
            className="rounded-full border border-border px-6 py-3 text-sm font-bold text-text transition-colors hover:border-primary"
          >
            Back home
          </NavLink>
        </div>
      </section>
    </MarketingLayout>
  )
}
