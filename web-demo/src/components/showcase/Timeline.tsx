import type { ReactNode } from 'react'
import { Icon } from '../Icon'
import { Reveal } from '../Reveal'
import type { PageFigureData } from '../../lib/pageFigures'
import { FigureStack, ItemLink, SectionHead, SectionNote } from './primitives'
import { stripStepNumber } from './utils'

export interface TimelineStep {
  icon: string
  /** A leading "1. " is dropped from the visible title; the number is drawn. */
  title: string
  body: ReactNode
  to?: string
  link?: string
}

/** Numbered steps on a gradient line: horizontal on desktop, vertical on phones. */
export function Timeline({
  eyebrow,
  title,
  intro,
  steps,
  note,
  figures = [],
}: {
  eyebrow: string
  title: ReactNode
  intro?: ReactNode
  steps: TimelineStep[]
  note?: string
  figures?: PageFigureData[]
}) {
  return (
    <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-20">
      <Reveal>
        <SectionHead eyebrow={eyebrow} title={title} intro={intro} />
      </Reveal>
      <div className="relative mt-12">
        {/* Connecting line: vertical on phones, horizontal from lg. */}
        <span aria-hidden="true" className="absolute bottom-6 left-[23px] top-6 w-0.5 bg-gradient-to-b from-primary via-magenta to-cyan lg:hidden" />
        <span aria-hidden="true" className="absolute left-6 right-6 top-[23px] hidden h-0.5 bg-gradient-to-r from-primary via-magenta to-cyan lg:block" />
        <ol className={`relative grid gap-8 ${steps.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} lg:gap-6`}>
          {steps.map((step, i) => (
            <li key={step.title} className="relative pl-16 lg:pl-0">
              <Reveal delayMs={i * 90}>
                <span className="absolute left-0 top-0 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-magenta font-display text-lg font-bold text-white shadow-[0_10px_24px_-10px_rgba(168,85,247,0.9)] ring-4 ring-bg lg:relative">
                  {i + 1}
                </span>
                <div className="lg:mt-6">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-text-muted">
                    <Icon name={step.icon} className="text-[14px] text-primary" />
                    Step {i + 1}
                  </span>
                  <h3 className="mt-3 font-display text-lg font-semibold">
                    <span className="sr-only">{i + 1}. </span>
                    {stripStepNumber(step.title)}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-muted">{step.body}</p>
                  <ItemLink to={step.to} label={step.link} />
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
      <SectionNote note={note} />
      <FigureStack figures={figures} className="mt-12" />
    </section>
  )
}
