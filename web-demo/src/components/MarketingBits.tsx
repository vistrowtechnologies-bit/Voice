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
// Fixed, not random: this renders during SSR prerendering too, and a
// Math.random() height here would differ between the server pass and
// hydration, which React reports as a mismatch.
const CTA_WAVEFORM = [
  28, 52, 38, 74, 46, 92, 60, 34, 68, 44, 86, 30, 56, 78, 40, 64,
  36, 88, 50, 26, 72, 42, 58, 80, 32, 66, 48, 90, 38, 54, 70, 30,
]

export function CTABand({
  title = 'Put an AI agent on every call.',
  subtitle = 'Try Artha live in your browser, or book a walkthrough with our team.',
  eyebrow = 'Live demo',
}: {
  title?: string
  subtitle?: string
  eyebrow?: string
}) {
  return (
    <section className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-20">
      {/* The old band was surface -> surface-high on a surface page, which is
          a gradient between two nearly identical greys: it read as one more
          card rather than the end of the page. Tinting the ground toward the
          brand and pulling the border with it makes it an endcap. */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/[0.14] via-surface to-surface-high p-8 sm:p-12 lg:p-14">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/25 blur-[110px]" />
        <div className="pointer-events-none absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-cyan/20 blur-[110px]" />

        {/* A voice product should look like one at the moment it asks for the
            call. Decorative, so it is hidden from assistive tech and holds
            still for anyone who asked for reduced motion. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 flex h-24 items-end justify-center gap-1.5 opacity-[0.18]"
        >
          {CTA_WAVEFORM.map((h, i) => (
            <span
              key={i}
              className="w-1.5 rounded-t-full bg-gradient-to-t from-primary to-cyan motion-safe:animate-[pulse_2.6s_ease-in-out_infinite]"
              style={{ height: `${h}%`, animationDelay: `${(i % 8) * 160}ms` }}
            />
          ))}
        </div>

        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-14">
          <div className="text-center lg:text-left">
            <SectionEyebrow>{eyebrow}</SectionEyebrow>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl lg:text-5xl">
              {title}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-text-muted lg:mx-0">{subtitle}</p>
            {/* The three objections that actually stop someone clicking a
                voice demo: having to sign up, not knowing what it costs, and
                not expecting it to handle their language. */}
            <ul className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-text-muted lg:justify-start">
              {['No signup needed', '5 free calls', '87 languages'].map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <Icon name="check_circle" className="text-[16px] text-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center lg:flex-col lg:items-stretch">
            <TalkToArthaButton className="flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-dark px-7 py-3.5 text-sm font-bold text-white shadow-[0_14px_36px_-12px_rgba(168,85,247,0.7)] transition-transform hover:-translate-y-0.5" />
            <Link
              to="/contact"
              className="rounded-full border border-border bg-surface/80 px-7 py-3.5 text-center text-sm font-bold text-text backdrop-blur transition-colors hover:border-primary hover:text-primary"
            >
              Book a demo
            </Link>
          </div>
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
