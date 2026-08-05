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
    return () => observer.disconnect()
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
