import { Link } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { DemoOrbCard } from './DemoOrbCard'
import { TalkToArthaButton } from './MarketingBits'
import { RotatingGreeting } from './BharatBits'
import { trackMarketingCta } from '../lib/analytics'
import { HERO_STATS } from '../lib/marketingContent'

// Large faint letters from the scripts Artha speaks, drifting behind the hero. Decorative.
const GLYPHS: [string, string][] = [['अ', 'left-[4%] top-[12%]'], ['க', 'right-[6%] top-[18%]'], ['త', 'left-[10%] top-[58%]'], ['ಕ', 'right-[12%] top-[62%]'], ['ব', 'left-[42%] top-[4%]'], ['ગ', 'right-[34%] top-[80%]']]

/** The homepage hero: the live demo orb is the hero object, headline underneath. */
export function SignalHero({ spotlight }: { spotlight: boolean }) {
  return (
    <section className="relative isolate overflow-hidden">
      <div className="signal-mesh" aria-hidden="true"><i /><i /></div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden md:block">
        {GLYPHS.map(([g, pos], i) => (
          <span key={g} className={`signal-glyph ${pos}`} style={{ animationDelay: `${-i * 2.3}s` }}>{g}</span>
        ))}
      </div>

      <div className="relative mx-auto flex max-w-7xl flex-col items-center px-5 pb-14 pt-8 text-center md:px-8 md:pt-12 lg:pb-20">
        <div className="flex w-full flex-wrap items-center justify-center gap-3 md:justify-between">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> Artha · AI receptionist · Live
          </span>
          <span className="hidden items-center gap-2 rounded-full border border-border bg-surface/60 px-4 py-1.5 text-xs font-semibold text-text-muted md:inline-flex">
            <span className="flex gap-0.5" aria-hidden="true"><i className="h-2 w-2 rounded-full bg-[#ff9933]" /><i className="h-2 w-2 rounded-full bg-white" /><i className="h-2 w-2 rounded-full bg-[#138808]" /></span>
            Built in Bharat · Built for Bharat
          </span>
        </div>

        {/* The real live demo (Tap to talk) is the hero object: it is the product, not a picture of it. */}
        <div className="relative mt-8 w-full max-w-[420px] md:mt-10">
          <DemoOrbCard spotlight={spotlight} />
        </div>

        <h1 className="mt-10 font-display text-[44px] font-bold leading-[1.02] tracking-tight sm:text-6xl lg:text-[88px]">
          <RotatingGreeting className="mb-2 block text-[0.5em] font-semibold" />
          <span className="block">Answer every customer</span>
          <span className="signal-grad-text block">in their own language.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-7 text-text-muted sm:text-lg sm:leading-8">
          Vistrow Voice is voice AI built for how India actually speaks. Answer, qualify, and book customers across phone and
          web in 99 languages (10 Indian languages plus English, and 88 more worldwide) with natural Hinglish and
          mid-sentence language switching.
        </p>
        <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <TalkToArthaButton />
          <Link
            to="/contact"
            onClick={() => trackMarketingCta('book_demo', 'home_hero')}
            className="signal-glass rounded-full px-7 py-3.5 text-sm font-bold text-text transition-colors hover:bg-white/10"
          >
            Book a demo
          </Link>
        </div>

        <dl className="mt-12 grid w-full max-w-3xl grid-cols-3 gap-4 border-t border-border pt-6 text-left sm:gap-8">
          {HERO_STATS.map((stat) => (
            <div key={stat.label}>
              <dt className="order-2 text-[11px] uppercase tracking-[0.16em] text-text-muted sm:text-xs">{stat.label}</dt>
              <dd className="signal-grad-text font-display text-2xl font-bold sm:text-4xl"><CountUp value={stat.value} /></dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

/** Counts a number up from zero when it scrolls into view; non-numeric values render as they are. */
function CountUp({ value }: { value: string }) {
  const target = /^\d+$/.test(value) ? Number(value) : null
  const ref = useRef<HTMLSpanElement>(null)
  const [n, setN] = useState(target === null ? value : '0')
  useEffect(() => {
    if (target === null) return
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(value); return }
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      const t0 = performance.now()
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / 1100)
        setN(String(Math.round(target * (1 - Math.pow(1 - p, 3)))))
        if (p < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, { threshold: 0.5 })
    io.observe(el)
    return () => io.disconnect()
  }, [target, value])
  return <span ref={ref}>{n}</span>
}
