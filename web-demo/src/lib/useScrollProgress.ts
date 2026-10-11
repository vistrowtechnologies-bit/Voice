import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

/** Scroll-linked progress (0..1) for an element, recomputed once per frame while scrolling.
 * `compute` maps the element's box and the viewport height to progress.
 * Starts at 1 (the finished state) so the prerendered HTML and reduced-motion visitors
 * see everything; the live value only takes over in the browser. */
export function useScrollProgress(
  ref: RefObject<HTMLElement | null>,
  compute: (rect: DOMRect, viewportHeight: number) => number,
): number {
  const [progress, setProgress] = useState(1)
  const computeRef = useRef(compute)
  computeRef.current = compute

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    const update = () => {
      frame = 0
      const el = ref.current
      if (!el) return
      const p = computeRef.current(el.getBoundingClientRect(), window.innerHeight)
      setProgress(Math.min(1, Math.max(0, p)))
    }
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [ref])

  return progress
}
