import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../Icon'
import { Icon3D } from '../Icon3D'
import { Reveal } from '../Reveal'
import { SectionEyebrow } from '../MarketingBits'
import { trackMarketingCta } from '../../lib/analytics'
import type { PageFigureData } from '../../lib/pageFigures'
import { BOOK_DEMO_CLASS, isPortrait, srcSetFor } from './utils'

// Small building blocks of the premium marketing template. The look is
// borrowed from the dashboard on purpose (violet bento tile, StatTile,
// rounded-3xl cards, pulsing live dots) so the site and the product read as
// one thing.

export function BookDemoLink({ placement, className = BOOK_DEMO_CLASS }: { placement: string; className?: string }) {
  return (
    <Link to="/contact" onClick={() => trackMarketingCta('book_demo', placement)} className={className}>
      Book a demo
    </Link>
  )
}

/** "No signup needed · 5 free calls · 130+ languages", the CTA band's own wording. */
export function RiskReducers({ className = '' }: { className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-x-5 gap-y-2 text-sm text-text-muted ${className}`}>
      {['No signup needed', '5 free calls', '130+ languages'].map((item) => (
        <li key={item} className="flex items-center gap-1.5">
          <Icon name="check_circle" className="text-[16px] text-success" />
          {item}
        </li>
      ))}
    </ul>
  )
}

export function LiveDot({ className = 'bg-success' }: { className?: string }) {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping ${className}`} />
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${className}`} />
    </span>
  )
}

// Fixed heights (not random) so the server render and hydration agree.
const WAVE = [40, 75, 55, 95, 60, 80, 45, 70, 35, 85, 50, 65]

export function Waveform({ bar = 'bg-gradient-to-t from-primary to-magenta', className = 'h-4' }: { bar?: string; className?: string }) {
  return (
    <span aria-hidden="true" className={`flex items-center gap-[3px] ${className}`}>
      {WAVE.map((h, i) => (
        <span
          key={i}
          className={`vv-wave-bar w-[3px] rounded-full ${bar}`}
          style={{ height: `${h}%`, animationDelay: `${(i % 6) * 110}ms` }}
        />
      ))}
    </span>
  )
}

/** Keyframes the template needs that index.css does not have. Render once per page (SplitHero does). */
export function ShowcaseStyles() {
  return (
    <style>{`
@keyframes vv-wave { 0%, 100% { transform: scaleY(0.45); } 50% { transform: scaleY(1); } }
@keyframes vv-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@media (prefers-reduced-motion: no-preference) {
  .vv-wave-bar { animation: vv-wave 1.4s ease-in-out infinite; transform-origin: center; }
  .vv-float { animation: vv-float 6s ease-in-out infinite; }
}
.vv-lift { transition: transform 260ms cubic-bezier(0.2, 0.9, 0.3, 1.2), box-shadow 260ms ease, border-color 260ms ease; }
.vv-lift:hover { transform: translateY(-3px); border-color: color-mix(in srgb, var(--color-primary) 35%, var(--color-border)); box-shadow: 0 24px 44px -28px color-mix(in srgb, var(--color-primary) 70%, transparent); }
@media (prefers-reduced-motion: reduce) { .vv-lift:hover { transform: none; } }
`}</style>
  )
}

/** A product image with no caption box: hero, bento and tour visuals. */
export function Shot({ figure, sizes, className = '', eager = false }: { figure: PageFigureData; sizes: string; className?: string; eager?: boolean }) {
  return (
    <img
      src={figure.src}
      srcSet={srcSetFor(figure)}
      sizes={sizes}
      alt={figure.alt}
      width={figure.width}
      height={figure.height}
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={eager ? 'high' : 'auto'}
      decoding={eager ? 'sync' : 'async'}
      className={`h-auto w-full ${className}`}
    />
  )
}

/** A product image in a framed card with its caption (section visuals). */
export function FigureCard({ figure, sizes, className = '' }: { figure: PageFigureData; sizes: string; className?: string }) {
  const portrait = isPortrait(figure)
  return (
    <figure className={`overflow-hidden rounded-3xl border border-border bg-surface shadow-[0_30px_60px_-40px_rgba(76,29,149,0.55)] ${className}`}>
      <div className={`bg-[#f4f1fb] ${portrait ? 'px-6 pt-6 sm:px-10 sm:pt-8' : 'p-3 sm:p-4'}`}>
        <Shot figure={figure} sizes={sizes} className={portrait ? 'mx-auto max-w-[420px]' : 'rounded-xl'} />
      </div>
      <figcaption className="border-t border-border px-5 py-3 text-xs leading-relaxed text-text-muted">{figure.caption}</figcaption>
    </figure>
  )
}

/** Full-width figures under a section, each in a centred framed card. */
export function FigureStack({ figures, className = 'mt-10' }: { figures: PageFigureData[]; className?: string }) {
  return (
    <>
      {figures.map((figure) => (
        <Reveal key={figure.src} className={`mx-auto max-w-4xl ${className}`}>
          <FigureCard figure={figure} sizes="(min-width: 936px) 896px, calc(100vw - 40px)" />
        </Reveal>
      ))}
    </>
  )
}

export function SectionHead({
  eyebrow,
  title,
  intro,
  className = '',
  center = false,
}: {
  eyebrow: string
  title: ReactNode
  intro?: ReactNode
  className?: string
  center?: boolean
}) {
  return (
    <div className={`${center ? 'mx-auto max-w-3xl text-center' : 'max-w-2xl'} ${className}`}>
      <SectionEyebrow>{eyebrow}</SectionEyebrow>
      <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {intro && <p className={`mt-3 text-text-muted ${center ? 'mx-auto max-w-2xl' : ''}`}>{intro}</p>}
    </div>
  )
}

export function ItemLink({ to, label }: { to?: string; label?: string }) {
  if (!to || !label) return null
  return (
    <Link
      to={to}
      className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:underline"
    >
      {label}
      <Icon name="arrow_forward" className="text-[16px]" />
    </Link>
  )
}

export function SectionNote({ note }: { note?: string }) {
  if (!note) return null
  return (
    <p className="mt-6 flex gap-3 rounded-2xl border border-cyan/30 bg-cyan/[0.06] p-5 text-sm leading-relaxed text-text">
      <Icon name="info" className="mt-0.5 shrink-0 text-[18px] text-cyan" />
      <span>{note}</span>
    </p>
  )
}

/** Tinted icon square used on every card. `strong` is the gradient version. */
export function IconTile({ name, strong = false, size = 'md', shrink = false }: { name: string; strong?: boolean; size?: 'sm' | 'md'; shrink?: boolean }) {
  const box = size === 'sm' ? 'h-10 w-10' : 'h-11 w-11'
  return (
    <span
      className={`flex ${box} ${shrink ? '' : 'shrink-0'} items-center justify-center rounded-xl ${
        strong ? 'bg-gradient-to-br from-primary to-magenta text-white' : 'bg-primary/12 text-primary'
      }`}
    >
      <Icon3D
        name={name}
        size={(size === 'sm' ? 32 : 36) - (strong ? 4 : 0)}
        plate={strong}
        className={size === 'sm' ? 'text-[20px]' : 'text-[22px]'}
      />
    </span>
  )
}
