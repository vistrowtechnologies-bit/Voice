import { useState } from 'react'

/** The launch film. Nothing but the poster image loads until the visitor
 * presses play, so a 2:43 video costs the homepage no bandwidth by default. */
export function LaunchFilm() {
  const [playing, setPlaying] = useState(false)

  return (
    <section id="launch-film" className="mx-auto max-w-7xl px-5 py-16 md:px-8">
      <div className="mb-8 max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Watch the film</p>
        <h2 className="mt-3 font-display text-3xl font-bold tracking-tight md:text-4xl">Meet Artha in under three minutes.</h2>
        <p className="mt-3 text-sm leading-relaxed text-text-muted">
          How she answers, switches language mid-call, books the appointment and writes up every conversation.
        </p>
      </div>
      <div className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_40px_100px_-40px_rgba(124,58,237,0.45)]">
        {playing ? (
          <video
            src="/media/vistrow-voice-launch.mp4"
            poster="/media/vistrow-voice-launch-poster.jpg"
            controls
            autoPlay
            playsInline
            className="h-full w-full"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label="Play the Vistrow Voice launch film (2 minutes 43 seconds, with sound)"
            className="group absolute inset-0 h-full w-full"
          >
            <img
              src="/media/vistrow-voice-launch-poster.jpg"
              alt="Artha, the Vistrow Voice agent, introducing herself"
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
            {/* Bottom-left, not centred: the poster's own headline sits in the middle. */}
            <span className="absolute bottom-4 left-4 flex items-center gap-3 rounded-full bg-primary py-2 pl-2 pr-5 text-sm font-bold text-white shadow-xl transition-transform group-hover:scale-105 md:bottom-6 md:left-6 md:text-base">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 md:h-12 md:w-12">
                <svg viewBox="0 0 24 24" className="h-5 w-5 md:h-6 md:w-6" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>
              </span>
              Play film · 2:43
            </span>
          </button>
        )}
      </div>
    </section>
  )
}
