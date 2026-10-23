import type { ReactNode, Ref } from 'react'
import { preload } from 'react-dom'
import { Icon } from '../Icon'
import { SectionEyebrow, TalkToArthaButton } from '../MarketingBits'
import type { PageFigureData } from '../../lib/pageFigures'
import { BookDemoLink, LiveDot, RiskReducers, ShowcaseStyles, Shot, Waveform } from './primitives'
import { TALK_CLASS, isPortrait, srcSetFor } from './utils'

export interface HeroChip {
  label: string
  icon?: string
  live?: boolean
}

export interface SplitHeroProps {
  /** Small line above the eyebrow (e.g. the "Built for Bharat" mark). */
  kicker?: ReactNode
  eyebrow: string
  title: ReactNode
  subhead: ReactNode
  /** The hero visual (LCP image): loaded eagerly and preloaded. */
  visual?: PageFigureData
  /** Replaces the default visual column entirely. */
  media?: ReactNode
  /** Two chips floating over the visual: a live chip and an outcome chip. */
  chips?: [HeroChip, HeroChip]
  /** Replaces the default "Talk to Artha live" + "Book a demo" buttons. */
  actions?: ReactNode
  /** Analytics placement for the default "Book a demo" link. */
  placement?: string
  /** The line under the buttons. Defaults to the risk reducers. */
  trust?: ReactNode
  /** Put on the button row so MobileStickyCta knows when the hero has scrolled away. */
  ctaRef?: Ref<HTMLDivElement>
}

const LANDSCAPE_SIZES = '(min-width: 1400px) 760px, (min-width: 1024px) 56vw, calc(100vw - 40px)'
const PORTRAIT_SIZES = '(min-width: 1024px) 460px, calc(100vw - 40px)'

/** Split hero: copy, both CTAs and a trust line on the left, the product visual
 * with floating chips on the right. Carries the page's only H1. */
export function SplitHero({
  kicker,
  eyebrow,
  title,
  subhead,
  visual,
  media,
  chips,
  actions,
  placement = 'product_hero',
  trust,
  ctaRef,
}: SplitHeroProps) {
  const portrait = visual ? isPortrait(visual) : false
  const sizes = portrait ? PORTRAIT_SIZES : LANDSCAPE_SIZES
  // Ask for the LCP image from the document head instead of waiting for the
  // body parse to reach it.
  if (visual && !media) {
    preload(visual.src, { as: 'image', fetchPriority: 'high', imageSrcSet: srcSetFor(visual), imageSizes: sizes })
  }
  // Dashboard laptops sit on a transparent ground; photos and illustrations
  // get a rounded frame so their edge does not cut against the page.
  const framed = visual ? !visual.src.includes('-laptop') : false

  return (
    <section className="relative overflow-hidden">
      <ShowcaseStyles />
      {/* Soft violet glow like the dashboard's hero card, kept behind the art. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -right-32 top-0 h-[520px] w-[620px] rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute right-[18%] top-[45%] h-[300px] w-[380px] rounded-full bg-magenta/15 blur-[110px]" />
      </div>
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-5 pb-12 pt-8 md:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-10 lg:pb-14 lg:pt-12">
        <div className="max-w-xl">
          {kicker && <div className="mb-4">{kicker}</div>}
          <SectionEyebrow>{eyebrow}</SectionEyebrow>
          <h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight text-balance sm:text-5xl lg:text-[52px]">
            {title}
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-text-muted">{subhead}</p>
          <div ref={ctaRef} className="mt-8 flex flex-wrap gap-3">
            {actions ?? (
              <>
                <TalkToArthaButton className={TALK_CLASS} />
                <BookDemoLink placement={placement} />
              </>
            )}
          </div>
          {trust ?? <RiskReducers className="mt-5" />}
        </div>

        {media ??
          (visual && (
            // From lg a laptop bleeds past the column into the page gutter so
            // the dashboard reads at a useful size next to the headline.
            <div className={`relative ${framed ? '' : 'min-[1400px]:w-[110%]'} ${portrait ? 'mx-auto w-full max-w-[460px]' : ''}`}>
              {framed ? (
                <figure className="overflow-hidden rounded-[2rem] border border-border bg-surface shadow-[0_40px_80px_-48px_rgba(76,29,149,0.7)]">
                  <Shot figure={visual} sizes={sizes} eager className="relative" />
                  <figcaption className="border-t border-border px-5 py-3 text-xs leading-relaxed text-text-muted">{visual.caption}</figcaption>
                </figure>
              ) : (
                <Shot figure={visual} sizes={sizes} eager className="relative" />
              )}
              {chips && (
                <>
                  <span className="vv-float absolute left-0 top-[10%] flex items-center gap-2 rounded-full border border-border bg-surface/90 px-3.5 py-2 text-xs font-bold text-text shadow-lg backdrop-blur sm:left-[-2%] sm:text-sm">
                    <LiveDot />
                    {chips[0].label}
                    <Waveform />
                  </span>
                  <span
                    className="vv-float absolute bottom-[14%] right-0 flex items-center gap-2 rounded-2xl border border-border bg-surface/90 px-3.5 py-2 text-xs font-bold text-text shadow-lg backdrop-blur sm:right-[-1%] sm:text-sm"
                    style={{ animationDelay: '1.4s' }}
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-success/15 text-success">
                      <Icon name={chips[1].icon ?? 'check_circle'} className="text-[16px]" />
                    </span>
                    {chips[1].label}
                  </span>
                </>
              )}
            </div>
          ))}
      </div>
    </section>
  )
}

/** A compact row of headline facts, an alternative hero trust line. */
export function HeroFacts({ facts, className = 'mt-8' }: { facts: { value: string; label: string }[]; className?: string }) {
  return (
    <div className={`grid grid-cols-3 gap-4 border-t border-border pt-6 sm:gap-8 ${className}`}>
      {facts.map((fact) => (
        <div key={fact.label}>
          <p className="font-display text-2xl font-bold text-text">{fact.value}</p>
          <p className="text-[10px] uppercase tracking-wider text-text-muted sm:text-xs">{fact.label}</p>
        </div>
      ))}
    </div>
  )
}
