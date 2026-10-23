import { MarketingLayout } from '../../components/MarketingLayout'
import { Seo } from '../../components/Seo'
import { ReadingLayout, slugify } from '../../components/showcase'
import { CHANGELOG, type ChangelogEntry } from '../../lib/marketingContent'

const TAG_STYLES: Record<string, string> = {
  New: 'bg-primary/15 text-primary border-primary/30',
  Improved: 'bg-cyan/15 text-cyan border-cyan/30',
  Fixed: 'bg-success/15 text-success border-success/30',
}

// Entries are newest first; group them by "Month YYYY" for the contents list.
function byMonth(entries: ChangelogEntry[]) {
  const groups: { month: string; entries: ChangelogEntry[] }[] = []
  for (const entry of entries) {
    const month = entry.date.replace(/^\d+\s+/, '')
    const last = groups[groups.length - 1]
    if (last?.month === month) last.entries.push(entry)
    else groups.push({ month, entries: [entry] })
  }
  return groups
}

export function Changelog() {
  const months = byMonth(CHANGELOG)
  return (
    <MarketingLayout>
      <Seo
        title="Changelog - Vistrow Voice"
        description="What's new in Vistrow Voice: new voices, faster call connection, native appointment booking, compliance controls, and more."
        path="/changelog"
      />

      <ReadingLayout
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Changelog' }]}
        eyebrow="Changelog"
        title="What’s shipped."
        lede="Product updates as they go live. Everything here is already running on real calls - we don’t list things that haven’t shipped."
        meta={<span>Last update {CHANGELOG[0].date}</span>}
        toc={months.map((m) => ({ id: slugify(m.month), label: m.month }))}
        tocTitle="Months"
        mobileLabel="Jump to a month"
        placement="changelog_aside"
      >
        <div className="flex flex-col gap-12">
          {months.map((m) => (
            <section key={m.month} id={slugify(m.month)} className="scroll-mt-28">
              <h2 className="font-display text-2xl font-bold tracking-tight">{m.month}</h2>
              <div className="relative mt-6 pl-8">
                <span aria-hidden="true" className="absolute bottom-4 left-[7px] top-4 w-0.5 rounded-full bg-gradient-to-b from-primary via-magenta to-cyan" />
                <ol className="flex flex-col gap-4">
                {m.entries.map((entry) => (
                  <li key={`${entry.date}-${entry.title}`} className="relative">
                    <span aria-hidden="true" className="absolute -left-8 top-6 h-4 w-4 rounded-full bg-gradient-to-br from-primary to-magenta ring-4 ring-bg" />
                    <article className="rounded-3xl border border-border bg-surface p-5 shadow-[0_30px_60px_-44px_rgba(76,29,149,0.55)] sm:p-6">
                      <div className="flex flex-wrap items-center gap-3">
                        <time className="font-mono text-xs uppercase tracking-wider text-text-muted">{entry.date}</time>
                        <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${TAG_STYLES[entry.tag] ?? TAG_STYLES.New}`}>
                          {entry.tag}
                        </span>
                      </div>
                      <h3 className="mt-2 font-display text-lg font-semibold">{entry.title}</h3>
                      <p className="mt-1.5 text-base leading-[1.7] text-text">{entry.body}</p>
                    </article>
                  </li>
                ))}
                </ol>
              </div>
            </section>
          ))}
        </div>
      </ReadingLayout>
    </MarketingLayout>
  )
}
