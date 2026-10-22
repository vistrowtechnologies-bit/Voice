import { useEffect, useRef, useState } from 'react'
import { TalkToArthaButton } from '../MarketingBits'

/** Phones only: a bottom bar with the primary CTA once the hero buttons have
 * scrolled away, hidden again when the closing CTA band comes into view.
 * Leaves the bottom-right corner free for the site's own call widget. */
export function StickyCta({ heroCtaRef, endRef }: { heroCtaRef: React.RefObject<HTMLDivElement | null>; endRef: React.RefObject<HTMLDivElement | null> }) {
  const [pastHero, setPastHero] = useState(false)
  const [atEnd, setAtEnd] = useState(false)

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const observers: IntersectionObserver[] = []
    if (heroCtaRef.current) {
      const o = new IntersectionObserver(([e]) => setPastHero(!e.isIntersecting && e.boundingClientRect.top < 0))
      o.observe(heroCtaRef.current)
      observers.push(o)
    }
    if (endRef.current) {
      const o = new IntersectionObserver(([e]) => setAtEnd(e.isIntersecting || e.boundingClientRect.top < 0))
      o.observe(endRef.current)
      observers.push(o)
    }
    return () => observers.forEach((o) => o.disconnect())
  }, [heroCtaRef, endRef])

  const shown = pastHero && !atEnd
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/90 py-3 pl-4 pr-[92px] backdrop-blur-xl transition-[transform,visibility] duration-300 lg:hidden ${
        shown ? 'visible translate-y-0' : 'invisible translate-y-full'
      }`}
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      {/* Primary CTA only: the sticky site header already carries "Book a demo". */}
      <TalkToArthaButton className="flex min-h-[48px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-gradient-to-br from-primary to-primary-dark px-5 text-sm font-bold text-white shadow-[0_10px_24px_-12px_rgba(147,51,234,0.8)]" />
    </div>
  )
}

/** Refs for the hero button row and the end sentinel (place it just before the closing CTA band). */
export function useStickyRefs() {
  const heroCtaRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  return { heroCtaRef, endRef }
}
