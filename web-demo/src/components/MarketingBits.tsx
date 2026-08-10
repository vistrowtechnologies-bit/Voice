import { Link, useNavigate } from 'react-router-dom'
import { Icon } from './Icon'
import { hostBucket } from '../lib/hostBuckets'

export function SectionEyebrow({ children }: { children: string }) {
  return <span className="text-xs font-bold uppercase tracking-widest text-cyan">{children}</span>
}

// Every "Talk to Artha live" CTA, wherever it appears, points at the same
// live demo widget rather than a separate call/summary route: scroll to it
// if one's already on the page (Home/ProductDetail/SolutionDetail all embed
// <DemoOrbCard id="live-demo">), otherwise get to Home and let its own
// hash-scroll effect (see Home.tsx) finish the job once it mounts. That
// widget only ever lives on the marketing host - clicked from the app
// subdomain, a plain client-side navigate('/') would just re-render that
// subdomain's own root (which redirects to the dashboard), never reaching Home. Force a
// real cross-host navigation whenever we're not already on marketing.
export function TalkToArthaButton({ className }: { className?: string }) {
  const navigate = useNavigate()

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    const el = document.getElementById('live-demo')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else if (hostBucket(window.location.hostname) === 'marketing') {
      navigate('/#live-demo')
    } else {
      window.location.href = 'https://www.vistrowvoice.com/#live-demo'
    }
  }

  return (
    <a
      href="https://www.vistrowvoice.com/#live-demo"
      onClick={handleClick}
      className={
        className ??
        'flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-dark px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90'
      }
    >
      <Icon name="mic" className="text-[18px]" />
      Talk to Artha live
    </a>
  )
}

/** The standard "Put an AI agent on every call" conversion band, reused across pages. */
export function CTABand({
  title = 'Put an AI agent on every call.',
  subtitle = 'Try Artha live in your browser, or book a walkthrough with our team.',
}: {
  title?: string
  subtitle?: string
}) {
  return (
    <section className="mx-auto max-w-7xl px-5 py-20 md:px-8">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-surface to-surface-high p-10 text-center sm:p-16">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-[100px]" />
        <h2 className="relative font-display text-4xl font-bold tracking-tight sm:text-5xl">{title}</h2>
        <p className="relative mx-auto mt-4 max-w-xl text-lg text-text-muted">{subtitle}</p>
        <div className="relative mt-8 flex flex-wrap justify-center gap-3">
          <TalkToArthaButton />
          <Link
            to="/contact"
            className="rounded-full border border-border px-6 py-3 text-sm font-bold text-text transition-colors hover:border-primary"
          >
            Book a demo
          </Link>
        </div>
      </div>
    </section>
  )
}

/** Page hero shared by product/solution detail pages. */
export function PageHero({
  eyebrow,
  title,
  subhead,
  children,
}: {
  eyebrow: string
  title: string
  subhead: string
  children?: React.ReactNode
}) {
  // The live demo widget is homepage-only now - every other page that uses
  // this hero has no `children`. Without this branch the empty second grid
  // column left the text lopsided against a blank right half on desktop, so
  // a heroless page instead gets a single centered column. TalkToArthaButton
  // already handles the no-#live-demo-on-this-page case (navigates home and
  // scrolls to it), so the CTA still works correctly either way.
  if (!children) {
    return (
      <section className="mx-auto max-w-3xl px-5 py-14 text-center md:px-8 lg:py-20">
        <SectionEyebrow>{eyebrow}</SectionEyebrow>
        <h1 className="mt-4 font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">{title}</h1>
        <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-text-muted">{subhead}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <TalkToArthaButton />
          <Link
            to="/contact"
            className="rounded-full border border-border px-6 py-3 text-sm font-bold text-text transition-colors hover:border-primary"
          >
            Book a demo
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-5 py-14 md:px-8 lg:grid-cols-2 lg:py-20">
      <div>
        <SectionEyebrow>{eyebrow}</SectionEyebrow>
        <h1 className="mt-4 font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-5 max-w-lg text-lg leading-relaxed text-text-muted">{subhead}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <TalkToArthaButton />
          <Link
            to="/contact"
            className="rounded-full border border-border px-6 py-3 text-sm font-bold text-text transition-colors hover:border-primary"
          >
            Book a demo
          </Link>
        </div>
      </div>
      {/* Must NOT use justify-self-end. That makes this grid item size to its
          own content rather than filling the column, so DemoOrbCard's
          `w-full max-w-[420px]` resolved against a shrunken parent and the
          widget visibly changed width as its content changed (connecting vs
          in-call vs error). Stretching here keeps the column fixed;
          DemoOrbCard right-aligns itself with its own `lg:ml-auto`. */}
      <div className="w-full">{children}</div>
    </section>
  )
}
