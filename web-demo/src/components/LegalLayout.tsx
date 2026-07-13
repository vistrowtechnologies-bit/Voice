import type { ReactNode } from 'react'
import { MarketingLayout } from './MarketingLayout'
import { SectionEyebrow } from './MarketingBits'

/** Shared shell for long-form legal documents (Privacy, Terms) — a narrow
 * reading column, consistent heading rhythm, and a "last updated" stamp so
 * both pages read as one system instead of two one-off layouts. */
export function LegalLayout({
  eyebrow,
  title,
  updated,
  intro,
  children,
}: {
  eyebrow: string
  title: string
  updated: string
  intro?: string
  children: ReactNode
}) {
  return (
    <MarketingLayout>
      <article className="mx-auto max-w-3xl px-5 py-16 md:px-8 lg:py-24">
        <SectionEyebrow>{eyebrow}</SectionEyebrow>
        <h1 className="mt-4 font-display text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-3 text-sm text-text-muted">Last updated {updated}</p>
        {intro && <p className="mt-6 text-lg leading-relaxed text-text-muted">{intro}</p>}
        <div className="prose-legal mt-12 flex flex-col gap-10">{children}</div>
      </article>
    </MarketingLayout>
  )
}

export function LegalSection({
  id,
  title,
  children,
}: {
  id?: string
  title: string
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="font-display text-2xl font-bold tracking-tight">{title}</h2>
      <div className="mt-3 flex flex-col gap-4 text-[15px] leading-relaxed text-text-muted [&_a]:text-cyan [&_a:hover]:underline [&_b]:text-text [&_b]:font-semibold [&_li]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
        {children}
      </div>
    </section>
  )
}
