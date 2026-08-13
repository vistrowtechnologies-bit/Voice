import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LANGUAGES } from '../lib/marketingContent'

// Cultural identity here comes from the product itself - the actual scripts
// Artha speaks - rather than from decorative "Indian" motifs. It's the
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
 * unsubstantiated "trusted by" strip used to be - same visual slot, but
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

/** The auth-page illustration: all ten scripts arranged in a ring around a
 * pulsing voice orb, mandala-style - deliberately NOT a map of India.
 * National borders are legally and politically fraught to render (Kashmir,
 * Aksai Chin), so a map was never really an option; this sidesteps that
 * entirely while still being unmistakably Bharat - the geometry echoes a
 * rangoli/mandala, and every glyph on the ring is a language the product
 * actually speaks, not decoration. Pure CSS positioning (trig computed once
 * per render, ten items, cheap) rather than SVG so each script renders with
 * the page's normal font stack instead of fighting SVG text/font quirks. */
export function BharatOrbit({ className = '' }: { className?: string }) {
  return (
    <div className={`relative mx-auto aspect-square w-full max-w-[340px] ${className}`}>
      {/* Orbit rings, faint to strong from outside in. */}
      <div className="absolute inset-0 rounded-full border border-border/50" />
      <div className="absolute inset-[12%] rounded-full border border-border/40" />
      <div className="absolute inset-[24%] rounded-full border border-dashed border-cyan/25" />
      <div className="auth-orb-ripple absolute inset-[33%] rounded-full border border-primary/25" aria-hidden="true" />

      {/* Center voice orb - same visual language as the demo widget's orb.
          Sits outside the rotating ring below so it stays put while the
          languages orbit it. */}
      <div className="auth-orb-center absolute left-1/2 top-1/2 z-10 h-24 w-24 -translate-x-1/2 -translate-y-1/2">
        <div className="glow-pulse absolute -inset-6 rounded-full bg-primary/50 blur-2xl" aria-hidden="true" />
        <div className="auth-orb-halo absolute -inset-3 rounded-full border border-primary/35" aria-hidden="true" />
        <div className="relative h-full w-full overflow-hidden rounded-full border border-white/15 bg-bg shadow-2xl shadow-primary/40">
          <video
            src="/agent-orb.mp4"
            autoPlay
            loop
            muted
            playsInline
            className="h-full w-full scale-150 object-cover"
          />
        </div>
      </div>

      {/* The ten scripts, evenly spaced around the ring and slowly orbiting
          it - auth-orbit-ring rotates this whole group; each label
          counter-rotates at the same rate (auth-orbit-label) so the text
          itself never tips over, only its position sweeps around. Hover
          brightens a node - the one bit of this that's genuinely
          interactive rather than ambient. */}
      <div className="auth-orbit-ring absolute inset-0">
        {LANGUAGES.map((lang, i) => {
          const angle = (i / LANGUAGES.length) * 2 * Math.PI - Math.PI / 2
          const x = 50 + 47 * Math.cos(angle)
          const y = 50 + 47 * Math.sin(angle)
          return (
            <div
              key={lang.slug}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <div className="auth-orbit-label group flex flex-col items-center gap-1">
                <span
                  className="pulse-dot h-1.5 w-1.5 rounded-full bg-cyan transition-colors group-hover:bg-primary"
                  style={{ animationDelay: `${i * 0.18}s` }}
                />
                <span className="whitespace-nowrap font-display text-sm text-text transition-transform duration-200 group-hover:scale-125 group-hover:text-primary">
                  {lang.greeting}
                </span>
              </div>
            </div>
          )
        })}
      </div>
      {/* The visible ring is decorative; the languages are already listed as
          text elsewhere on the page (feature list / marquee), so this whole
          illustration is redundant for screen readers rather than useful. */}
      <span className="sr-only">Speaks 10 Indian languages plus English</span>
    </div>
  )
}

/** A very faint, oversized echo of BharatOrbit's motif - orbit rings and a
 * couple of scripts, barely visible - used as ambient texture behind the
 * form panel so the right half of the auth screen isn't just dead space.
 * Deliberately not the same size/prominence as the real illustration on the
 * left: this is background, not a second illustration competing for
 * attention. Purely decorative (aria-hidden), and inherits the same orbit
 * animation so it isn't just another static shape. */
export function BharatBackdrop({ className = '', opacity = 0.06 }: { className?: string; opacity?: number }) {
  const picks = [LANGUAGES[2], LANGUAGES[5], LANGUAGES[8]] // Tamil, Bengali, Punjabi - spread across scripts, not adjacent on the wheel
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute aspect-square ${className}`}
      style={{ opacity }}
    >
      <div className="absolute inset-0 rounded-full border border-cyan" />
      <div className="absolute inset-[16%] rounded-full border border-dashed border-primary" />
      <div className="auth-orbit-ring absolute inset-0">
        {picks.map((lang, i) => {
          const angle = (i / picks.length) * 2 * Math.PI
          const x = 50 + 46 * Math.cos(angle)
          const y = 50 + 46 * Math.sin(angle)
          return (
            <span
              key={lang.slug}
              className="auth-orbit-label absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-display text-4xl text-text"
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              {lang.greeting}
            </span>
          )
        })}
      </div>
    </div>
  )
}
