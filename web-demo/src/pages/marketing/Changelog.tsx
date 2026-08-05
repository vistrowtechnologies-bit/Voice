import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { CTABand, SectionEyebrow } from '../../components/MarketingBits'
import { CHANGELOG } from '../../lib/marketingContent'

const TAG_STYLES: Record<string, string> = {
  New: 'bg-primary/15 text-primary border-primary/30',
  Improved: 'bg-cyan/15 text-cyan border-cyan/30',
  Fixed: 'bg-success/15 text-success border-success/30',
}

export function Changelog() {
  return (
    <MarketingLayout>
      <Seo
        title="Changelog - Vistrow Voice"
        description="What's new in Vistrow Voice: new voices, faster call connection, native appointment booking, compliance controls, and more."
        path="/changelog"
      />

      <section className="mx-auto max-w-3xl px-5 py-16 md:px-8 lg:py-20">
        <SectionEyebrow>Changelog</SectionEyebrow>
        <h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
          What’s shipped.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-text-muted">
          Product updates as they go live. Everything here is already running on real calls - we don’t
          list things that haven’t shipped.
        </p>
      </section>

      <section className="mx-auto max-w-3xl px-5 pb-8 md:px-8">
        <ol className="relative flex flex-col gap-2 border-l border-border pl-6">
          {CHANGELOG.map((entry) => (
            <li key={`${entry.date}-${entry.title}`} className="relative pb-8">
              <span className="absolute -left-[27px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-bg bg-primary" />
              <div className="flex flex-wrap items-center gap-3">
                <time className="font-mono text-xs uppercase tracking-wider text-text-muted">
                  {entry.date}
                </time>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    TAG_STYLES[entry.tag] ?? TAG_STYLES.New
                  }`}
                >
                  {entry.tag}
                </span>
              </div>
              <h2 className="mt-2 font-display text-lg font-semibold">{entry.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-text-muted">{entry.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <CTABand />
    </MarketingLayout>
  )
}
