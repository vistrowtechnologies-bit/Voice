import { useState } from 'react'
import { Icon } from './Icon'

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
            <span className="absolute inset-0 flex items-center justify-center bg-black/10 transition-colors group-hover:bg-black/20">
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-white shadow-xl transition-transform group-hover:scale-110 md:h-24 md:w-24">
                <Icon name="play_arrow" className="text-[44px] md:text-[52px]" />
              </span>
            </span>
            <span className="absolute bottom-4 left-4 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">2:43 · with sound</span>
          </button>
        )}
      </div>
    </section>
  )
}
