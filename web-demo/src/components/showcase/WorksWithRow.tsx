import { SectionEyebrow } from '../MarketingBits'

export function WorksWithRow({ tools }: { tools: string[] }) {
  return (
    <section className="mx-auto max-w-7xl px-5 py-10 md:px-8">
      <div className="flex flex-col items-center gap-5 rounded-3xl border border-border bg-surface/60 px-6 py-7 sm:flex-row sm:justify-between">
        <SectionEyebrow>Works with</SectionEyebrow>
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          {tools.map((tool) => (
            <span key={tool} className="rounded-full border border-border bg-surface px-4 py-2 font-display text-sm font-semibold text-text-muted">
              {tool}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
