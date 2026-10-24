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

// Tailwind only ships classes it can see in the source, so spans are looked
// up from literal strings rather than built from numbers.
const SPAN: Record<number, string> = { 3: 'lg:col-span-3', 4: 'lg:col-span-4', 5: 'lg:col-span-5', 6: 'lg:col-span-6', 7: 'lg:col-span-7', 8: 'lg:col-span-8', 12: 'lg:col-span-12' }
const ROWS: Record<number, string> = { 1: '', 2: 'lg:row-span-2', 3: 'lg:row-span-3', 4: 'lg:row-span-4' }

/** Column spans (of 12) that lay `n` cards out in full rows of 3 or 2. */
function fullRows(n: number): number[] {
  if (n <= 0) return []
  if (n === 1) return [12]
  if (n % 3 === 0) return Array(n).fill(4)
  if (n % 3 === 2) return [...Array(n - 2).fill(4), 6, 6]
  return [...Array(n - 4).fill(4), 6, 6, 6, 6]
}

interface BentoLayout {
  visual: string
  /** Column span (of 12) for each item, lead first. */
  spans: number[]
}

/**
 * Pick spans so every row of the 12-column grid closes, whatever the item
 * count and the visual's shape.
 */
function bentoLayout(visual: PageFigureData | undefined, n: number): BentoLayout {
  if (!visual) return { visual: '', spans: n === 3 ? [6, 3, 3] : n % 4 === 0 ? Array(n).fill(3) : fullRows(n) }
  if (isPortrait(visual)) {
    // A tall 4-column cell; the cards fill the 8 columns beside it, two per
    // row. An odd count gives the lead tile a whole row.
    const rows = Math.min(4, Math.ceil(n / 2))
    const spans = n % 2 ? [8, ...Array(n - 1).fill(4)] : Array(n).fill(4)
    return { visual: `lg:col-span-4 ${ROWS[rows]}`, spans }
  }
  if (visual.width / visual.height > 2.2) {
    // Very wide strip (a dashboard panel). Three items: the strip shares its
    // row with the lead tile, two cards below. Otherwise full width on top.
    if (n === 3) return { visual: 'lg:col-span-8', spans: [4, 6, 6] }
    return { visual: 'lg:col-span-12', spans: n % 4 === 0 ? Array(n).fill(3) : fullRows(n) }
  }
  // Landscape stage: 7 columns, with up to three cards stacked beside it and
  // any further cards in full rows underneath.
  const stacked = n <= 3 ? n : 2
  return { visual: `lg:col-span-7 ${ROWS[Math.max(1, stacked)]}`, spans: [...Array(stacked).fill(5), ...fullRows(n - stacked)] }
}

/**
 * A dashboard-style bento: one large visual cell, a violet lead tile (the
 * first item) and plain cards for the rest. The grid shape follows the
 * visual (portrait, very wide strip, or a normal landscape stage) and the
 * item count so the rows always close, at two columns as well as twelve.
 */
export function Bento({ visual, items, head }: { visual?: PageFigureData; items: BentoItem[]; head?: ReactNode }) {
  const portrait = visual ? isPortrait(visual) : false
  const wide = visual ? visual.width / visual.height > 2.2 : false
  const layout = bentoLayout(visual, items.length)
  // Two-column (tablet) grid: an odd card count leaves the last card alone,
  // so it takes the whole row.
  const spanClass = (i: number) => `${SPAN[layout.spans[i]] ?? ''} ${items.length % 2 && i === items.length - 1 ? 'sm:col-span-2' : ''}`
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
          <Reveal delayMs={60} className={`h-full ${spanClass(0)}`}>
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
            className={`h-full ${spanClass(i + 1)}`}
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
