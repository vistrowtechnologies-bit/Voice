import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'

const TRUST_BADGES = ['10,000+ leads qualified', '22+ Indian languages', '<1s response time']

const PROPERTIES = [
  { title: '3BHK, Sector 54', location: 'Gurgaon', price: '₹2.8 Cr' },
  { title: '2BHK, HSR Layout', location: 'Bangalore', price: '₹1.9 Cr' },
  { title: 'Sea-facing 4BHK', location: 'Mumbai, Worli', price: '₹5.4 Cr' },
]

export function Landing() {
  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-bg/80 px-6 py-4 backdrop-blur-xl sm:px-10">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Icon name="auto_awesome" className="text-bg text-[18px]" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Arthale Homes</span>
        </div>
        <nav className="hidden items-center gap-8 text-sm text-text-muted md:flex">
          <a href="#" className="hover:text-text transition-colors">Properties</a>
          <a href="#" className="hover:text-text transition-colors">About</a>
          <a href="#" className="hover:text-text transition-colors">Contact</a>
        </nav>
        <Link
          to="/call"
          className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-bg transition-opacity hover:opacity-90"
        >
          Talk to us
        </Link>
      </header>

      <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-6 py-16 sm:px-10 lg:grid-cols-2 lg:py-24">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-cyan">AI voice agent</span>
          <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Find your next home — just by talking to us.
          </h1>
          <p className="mt-4 max-w-md text-base text-text-muted">
            Our AI agent understands Hindi, English, and everything in between. Ask about
            budget, location, or book a site visit — right now, out loud.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/call"
              className="flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-bg transition-opacity hover:opacity-90"
            >
              <Icon name="mic" className="text-[18px]" />
              Try the AI Call
            </Link>
            <a
              href="#properties"
              className="rounded-full border border-border px-6 py-3 text-sm font-bold text-text-muted transition-colors hover:border-primary hover:text-text"
            >
              Browse Properties
            </a>
          </div>
        </div>

        <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-border bg-surface p-10">
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-primary via-cyan to-magenta">
              <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-surface">
                <Icon name="mic" className="text-primary text-[32px]" />
              </div>
            </div>
            <p className="max-w-[220px] text-center text-sm text-text-muted">
              No signup. No phone call. Just click and speak.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-8 sm:px-10">
        <div className="flex flex-wrap justify-center gap-3">
          {TRUST_BADGES.map((badge) => (
            <span
              key={badge}
              className="rounded-full border border-border bg-surface px-4 py-2 text-xs text-text-muted"
            >
              {badge}
            </span>
          ))}
        </div>
      </section>

      <section id="properties" className="mx-auto max-w-6xl px-6 py-16 sm:px-10">
        <h2 className="mb-6 text-xl font-semibold">Featured properties</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PROPERTIES.map((property) => (
            <div key={property.title} className="rounded-xl border border-border bg-surface p-4">
              <div className="mb-3 h-32 rounded-lg bg-surface-high" />
              <p className="font-semibold">{property.title}</p>
              <p className="text-sm text-text-muted">{property.location}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="font-bold text-text">{property.price}</span>
                <span className="rounded-full border border-primary/40 px-3 py-1 text-xs text-primary">
                  site visit
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
