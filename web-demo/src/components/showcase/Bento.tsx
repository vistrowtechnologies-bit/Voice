import type { ReactNode } from 'react'
import { Icon3D } from '../Icon3D'
import { Reveal } from '../Reveal'
import type { PageFigureData } from '../../lib/pageFigures'
import { Shot, Waveform } from './primitives'
import { isPortrait } from './utils'

export interface BentoItem {
  icon: string
  title: string
  body: ReactNode
}

/**
 * A dashboard-style bento: one large visual cell, a violet lead tile (the
 * first item) and plain cards for the rest. The grid shape follows the
 * visual (portrait, very wide strip, or a normal landscape stage) and the
 * item count (3 or 4) so the rows always close.
 */
export function Bento({ visual, items, head }: { visual?: PageFigureData; items: BentoItem[]; head?: ReactNode }) {
  const portrait = visual ? isPortrait(visual) : false
  const wide = visual ? visual.width / visual.height > 2.2 : false
  const three = items.length === 3
  // 12-column grid. Portrait art: a tall 4-column cell beside the cards.
  // Very wide strips (a dashboard panel): full width on top, cards below.
  // Anything else: a 7-column stage plus a stack.
  const layout = portrait
    ? { visual: 'lg:col-span-4 lg:row-span-2', lead: three ? 'lg:col-span-8' : 'lg:col-span-4', rest: ['lg:col-span-4'] }
    : wide
      ? three
        ? // Three items: the strip shares its row with the lead tile, two cards below.
          { visual: 'lg:col-span-8', lead: 'lg:col-span-4', rest: ['lg:col-span-6'] }
        : { visual: 'lg:col-span-12', lead: 'lg:col-span-3', rest: ['lg:col-span-3'] }
      : { visual: 'lg:col-span-7 lg:row-span-2', lead: 'lg:col-span-5', rest: ['lg:col-span-5', 'lg:col-span-6'] }
  const [lead, ...rest] = items

  return (
    <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-16">
      {head && <Reveal className="mb-10">{head}</Reveal>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12">
        {visual && (
          <Reveal className={`h-full sm:col-span-2 ${layout.visual}`}>
            <figure className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-panel">
              <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/25 blur-[90px]" />
              <div className={`relative flex flex-1 items-center justify-center ${portrait ? 'px-4 pt-4' : 'p-4 sm:p-6'}`}>
                <Shot
                  figure={visual}
                  sizes={
                    portrait
                      ? '(min-width: 1024px) 380px, calc(100vw - 40px)'
                      : wide
                        ? '(min-width: 1280px) 1170px, calc(100vw - 88px)'
                        : '(min-width: 1280px) 700px, (min-width: 1024px) 56vw, calc(100vw - 40px)'
                  }
                  className={portrait ? 'max-w-[400px]' : 'rounded-xl shadow-[0_20px_40px_-24px_rgba(76,29,149,0.6)]'}
                />
              </div>
              <figcaption className="relative border-t border-panel-line bg-surface/70 px-5 py-3 text-xs leading-relaxed text-text-muted">
                {visual.caption}
              </figcaption>
            </figure>
          </Reveal>
        )}

        {lead && (
          <Reveal delayMs={60} className={`h-full ${visual ? layout.lead : 'lg:col-span-6'}`}>
            {/* The lead item borrows the dashboard's violet hero tile. */}
            <div className="bento-hero relative flex h-full flex-col overflow-hidden rounded-3xl p-7 shadow-[0_24px_50px_-30px_rgba(76,29,149,0.9)]">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-white">
                <Icon3D name={lead.icon} size={32} plate className="text-[22px]" />
              </span>
              <h3 className="mt-5 font-display text-2xl font-bold">{lead.title}</h3>
              <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-white/85">{lead.body}</p>
              <div className="mt-auto pt-8">
                <Waveform bar="bg-white/70" className="h-10" />
              </div>
            </div>
          </Reveal>
        )}

        {rest.map((f, i) => (
          <Reveal
            key={f.title}
            delayMs={120 + i * 60}
            className={`h-full ${visual ? layout.rest[Math.min(i, layout.rest.length - 1)] : 'lg:col-span-3'}`}
          >
            <div className="vv-lift flex h-full flex-col rounded-3xl border border-border bg-surface p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <Icon3D name={f.icon} className="text-[22px]" />
              </span>
              <h3 className="mt-5 font-display text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{f.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
