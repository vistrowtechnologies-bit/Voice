import { Link } from 'react-router-dom'
import { Icon } from './Icon'

export function SectionEyebrow({ children }: { children: string }) {
  return <span className="text-xs font-bold uppercase tracking-widest text-cyan">{children}</span>
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
          <Link
            to="/demo"
            className="flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-dark px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
          >
            <Icon name="mic" className="text-[18px]" />
            Talk to Artha live
          </Link>
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
  return (
    <section className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-5 py-14 md:px-8 lg:grid-cols-2 lg:py-20">
      <div>
        <SectionEyebrow>{eyebrow}</SectionEyebrow>
        <h1 className="mt-4 font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-5 max-w-lg text-lg leading-relaxed text-text-muted">{subhead}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/demo"
            className="flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-dark px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
          >
            <Icon name="mic" className="text-[18px]" />
            Talk to Artha live
          </Link>
          <Link
            to="/contact"
            className="rounded-full border border-border px-6 py-3 text-sm font-bold text-text transition-colors hover:border-primary"
          >
            Book a demo
          </Link>
        </div>
      </div>
      <div className="lg:justify-self-end">{children}</div>
    </section>
  )
}
