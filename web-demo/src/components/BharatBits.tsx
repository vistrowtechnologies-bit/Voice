import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LANGUAGES } from '../lib/marketingContent'

// Cultural identity here comes from the product itself — the actual scripts
// Artha speaks — rather than from decorative "Indian" motifs. It's the
// honest version (every glyph shown is a language the product really
// supports) and the more distinctive one: no competitor can copy it without
// building the same language coverage.

/** Cycles a greeting through every supported script, in place. Used in the
 * hero so the first thing a visitor sees is the product's actual range. */
export function RotatingGreeting({ className = '' }: { className?: string }) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) return // hold on the first greeting rather than cycling
    const id = setInterval(() => setIndex((i) => (i + 1) % LANGUAGES.length), 2200)
    return () => clearInterval(id)
  }, [])

  const lang = LANGUAGES[index]

  return (
    <span className={`inline-flex flex-col ${className}`}>
      {/* aria-live off: this is decorative motion, and announcing a new
          greeting every two seconds would make the page hostile to screen
          readers. The full list is available on /languages. */}
      <span
        key={lang.slug}
        aria-hidden="true"
        className="vv-greeting bg-gradient-to-r from-primary to-magenta bg-clip-text text-transparent"
      >
        {lang.greeting}
      </span>
    </span>
  )
}

/** Seamless marquee of every greeting + language name. Sits where the old
 * unsubstantiated "trusted by" strip used to be — same visual slot, but
 * saying something true. */
export function ScriptMarquee() {
  // Rendered twice back-to-back; the keyframe travels exactly -50% so the
  // seam is invisible and the loop never jumps.
  const items = [...LANGUAGES, ...LANGUAGES]

  return (
    <section className="vv-marquee relative overflow-hidden border-y border-border bg-surface/40 py-6">
      {/* Edge fades so glyphs dissolve rather than getting chopped at the
          viewport edge. pointer-events-none so they never eat hover. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-bg to-transparent sm:w-28" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-bg to-transparent sm:w-28" />
      <div className="vv-marquee-track flex w-max items-center gap-10 sm:gap-14">
        {items.map((lang, i) => (
          <Link
            key={`${lang.slug}-${i}`}
            to={`/languages/${lang.slug}`}
            aria-hidden={i >= LANGUAGES.length}
            tabIndex={i >= LANGUAGES.length ? -1 : undefined}
            className="group flex shrink-0 items-baseline gap-3 transition-opacity hover:opacity-100 sm:gap-4"
          >
            <span className="font-display text-xl text-text transition-colors group-hover:text-primary sm:text-2xl">
              {lang.greeting}
            </span>
            <span className="text-[11px] uppercase tracking-widest text-text-muted sm:text-xs">
              {lang.name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
