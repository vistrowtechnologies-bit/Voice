import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

// Scroll-triggered fade-up. Wraps content instead of requiring every page to
// wire its own observer, and deliberately fails *open*: if the browser has no
// IntersectionObserver, or the user prefers reduced motion, the content is
// shown immediately rather than being left invisible. A reveal that can strand
// content off-screen is worse than no reveal at all.
export function Reveal({
  children,
  delayMs = 0,
  className = '',
}: {
  children: ReactNode
  /** Stagger within a group - keep under ~250ms so nothing feels sluggish. */
  delayMs?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced || typeof IntersectionObserver === 'undefined') {
      setShown(true)
      return
    }
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true)
            observer.disconnect()
          }
        }
      },
      // Fires slightly before the element reaches the fold, so the motion
      // has finished by the time it's properly in view.
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 },
    )
    observer.observe(el)

    // Last-resort safety net. The guards above cover "no IntersectionObserver"
    // and "reduced motion", but not the case where an observer is created and
    // its callback simply never arrives - browsers suspend delivery entirely
    // while document.visibilityState is "hidden" (observed directly: a fresh
    // observer on an element sitting mid-viewport never fired at all in a
    // backgrounded tab). Most of the marketing homepage now renders through
    // this component, so a callback that never lands would leave the page
    // blank rather than merely unanimated - and content held at opacity:0 is
    // also content a crawler can reasonably treat as hidden. Showing after a
    // beat downgrades that failure to "no animation", which is the trade this
    // component already says it wants to make.
    const failsafe = window.setTimeout(() => setShown(true), 2500)
    return () => {
      observer.disconnect()
      window.clearTimeout(failsafe)
    }
  }, [])

  return (
    <div
      ref={ref}
      className={`vv-reveal ${shown ? 'vv-in' : ''} ${className}`}
      style={shown && delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  )
}
