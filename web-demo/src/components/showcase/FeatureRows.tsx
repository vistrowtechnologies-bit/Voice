import type { ReactNode } from 'react'
import { Reveal } from '../Reveal'
import type { PageFigureData } from '../../lib/pageFigures'
import { FigureCard, FigureStack, IconTile, ItemLink, SectionHead, SectionNote } from './primitives'
import { isPortrait } from './utils'

export interface FeatureItem {
  icon: string
  title: string
  body: ReactNode
  to?: string
  link?: string
}

const LANDSCAPE_SIZES = '(min-width: 1280px) 600px, (min-width: 1024px) 46vw, calc(100vw - 40px)'
const PORTRAIT_SIZES = '(min-width: 1024px) 420px, calc(100vw - 40px)'

/**
 * Text beside a visual. The visual sticks while the text scrolls on desktop
 * and stacks under it on phones. `flip` puts the visual on the left so
 * consecutive rows alternate. Pass a figure for a framed image card, or any
 * node as `aside` (a sample record, the live demo card).
 */
export function SplitRow({
  children,
  figure,
  aside,
  flip = false,
  wideText,
  className = 'py-14 lg:py-16',
}: {
  children: ReactNode
  figure?: PageFigureData
  aside?: ReactNode
  flip?: boolean
  /** Give the text 2/3 of the row (default for portrait figures). */
  wideText?: boolean
  className?: string
}) {
  const portrait = figure ? isPortrait(figure) : false
  const wide = wideText ?? portrait
  return (
    <div className={`grid items-start gap-10 lg:gap-14 ${wide ? 'lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]' : 'lg:grid-cols-2'} ${className}`}>
      <div className={flip ? 'lg:order-2' : ''}>{children}</div>
      <Reveal className={`lg:sticky lg:top-28 ${flip ? 'lg:order-1' : ''}`}>
        {aside ?? (figure && <FigureCard figure={figure} sizes={portrait ? PORTRAIT_SIZES : LANDSCAPE_SIZES} />)}
      </Reveal>
    </div>
  )
}

/** A list of icon + title + body rows separated by hairlines. */
export function FeatureList({ items, twoCol = false }: { items: FeatureItem[]; twoCol?: boolean }) {
  return (
    <ul className={`mt-8 grid gap-x-8 ${twoCol ? 'sm:grid-cols-2' : ''}`}>
      {items.map((item, i) => (
        <li key={item.title} className="border-t border-border py-5">
          <Reveal delayMs={(i % 3) * 60} className="flex gap-4">
            <IconTile name={item.icon} size="sm" />
            <div>
              <h3 className="font-display text-base font-semibold">{item.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-text-muted">{item.body}</p>
              <ItemLink to={item.to} label={item.link} />
            </div>
          </Reveal>
        </li>
      ))}
    </ul>
  )
}

/** A card grid with the first card highlighted, for sections with no visual. */
export function FeatureCards({ items }: { items: FeatureItem[] }) {
  const cols = items.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
  return (
    <div className={`grid gap-4 sm:grid-cols-2 ${cols}`}>
      {items.map((item, i) => (
        <Reveal key={item.title} delayMs={(i % 3) * 70} className="h-full">
          <div
            className={`vv-lift relative flex h-full flex-col overflow-hidden rounded-3xl border p-6 ${
              i === 0 ? 'border-primary/40 bg-gradient-to-br from-primary/[0.14] via-surface to-surface' : 'border-border bg-surface'
            }`}
          >
            <IconTile name={item.icon} strong={i === 0} shrink />
            <h3 className="mt-5 font-display text-lg font-semibold">{item.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">{item.body}</p>
            {item.to && item.link && (
              <div className="mt-auto">
                <ItemLink to={item.to} label={item.link} />
              </div>
            )}
          </div>
        </Reveal>
      ))}
    </div>
  )
}

/**
 * One guide section. With a figure: text rows beside the visual (alternate
 * sides with `flip`). Without: a varied card grid with one highlighted card.
 * Extra figures stack full width under the section.
 */
export function FeatureRows({
  eyebrow,
  title,
  intro,
  items,
  note,
  figures = [],
  flip = false,
}: {
  eyebrow: string
  title: ReactNode
  intro?: ReactNode
  items: FeatureItem[]
  note?: string
  figures?: PageFigureData[]
  flip?: boolean
}) {
  const [visual, ...more] = figures

  if (visual) {
    return (
      <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-16">
        <SplitRow figure={visual} flip={flip} className="">
          <Reveal>
            <SectionHead eyebrow={eyebrow} title={title} intro={intro} />
          </Reveal>
          <FeatureList items={items} twoCol={isPortrait(visual)} />
        </SplitRow>
        <SectionNote note={note} />
        <FigureStack figures={more} />
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-7xl px-5 py-14 md:px-8 lg:py-16">
      <Reveal>
        <SectionHead eyebrow={eyebrow} title={title} intro={intro} className="mb-10" />
      </Reveal>
      <FeatureCards items={items} />
      <SectionNote note={note} />
      <FigureStack figures={more} />
    </section>
  )
}
