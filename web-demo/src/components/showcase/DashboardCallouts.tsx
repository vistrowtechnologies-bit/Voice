import { Reveal } from '../Reveal'
import type { PageFigureData } from '../../lib/pageFigures'
import { SectionHead, Shot } from './primitives'

export interface Callout {
  title: string
  body: string
  /** Marker position over the image, in % of the image box. */
  x: number
  y: number
}

/** A real dashboard view with numbered markers and the matching notes beside it. */
export function DashboardCallouts({
  view,
  callouts,
  eyebrow = 'See it in the dashboard',
  title = 'The same screens your team will use.',
  intro = 'These are views of the real Vistrow Voice dashboard, with sample data.',
}: {
  view: PageFigureData
  callouts: Callout[]
  eyebrow?: string
  title?: string
  intro?: string
}) {
  return (
    <section className="relative overflow-hidden py-14 lg:py-16">
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/3 -z-10 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-primary/12 blur-[130px]" />
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <Reveal>
          <SectionHead eyebrow={eyebrow} title={title} intro={intro} />
        </Reveal>
        <div className="mt-10 grid items-center gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,0.75fr)]">
          <Reveal className="relative">
            <Shot figure={view} sizes="(min-width: 1280px) 800px, (min-width: 1024px) 62vw, calc(100vw - 40px)" />
            {callouts.map((c, i) => (
              <span
                key={c.title}
                aria-hidden="true"
                className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-gradient-to-br from-primary to-magenta text-[11px] font-bold text-white shadow-[0_0_0_4px_rgba(255,255,255,0.9),0_8px_20px_-6px_rgba(124,58,237,0.9)] sm:h-8 sm:w-8 sm:text-sm"
                style={{ left: `${c.x}%`, top: `${c.y}%` }}
              >
                <span className="absolute inset-0 rounded-full bg-primary/50 motion-safe:animate-ping" />
                <span className="relative">{i + 1}</span>
              </span>
            ))}
          </Reveal>
          <ol className="grid gap-4">
            {callouts.map((c, i) => (
              <li key={c.title}>
                <Reveal delayMs={i * 80} className="vv-lift flex gap-4 rounded-3xl border border-border bg-surface p-5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-magenta text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-display text-base font-semibold">{c.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-text-muted">{c.body}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
