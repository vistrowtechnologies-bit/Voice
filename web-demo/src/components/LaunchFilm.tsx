import { Link } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'

/** The launch film. Nothing but the poster image loads until the visitor
 * reaches it; then it plays, and it pauses again when they scroll away.
 * A visitor who pauses it themselves is left alone. */
const FILM_HD = '/media/launch-film-v4.mp4'
const FILM_SD = '/media/launch-film-v4-720.mp4'

/** Phones and Save-Data visitors get the 720p file (6 MB instead of 12 MB). */
function pickFilm(): string {
  try {
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } }
    if (nav.connection?.saveData || window.matchMedia('(max-width: 768px)').matches) return FILM_SD
  } catch { /* fall through to HD */ }
  return FILM_HD
}

export function LaunchFilm() {
  const [started, setStarted] = useState(false)
  const [src] = useState(pickFilm) // fixed once, so a resize can't restart the film
  const boxRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const userPaused = useRef(false)
  const inView = useRef(false)

  useEffect(() => {
    const box = boxRef.current
    if (!box || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([entry]) => {
        inView.current = entry.isIntersecting
        const v = videoRef.current
        if (entry.isIntersecting) {
          if (!started) { setStarted(true); return }
          if (v && v.paused && !userPaused.current) void tryPlay(v)
        } else if (v && !v.paused) {
          v.pause()
        }
      },
      { threshold: 0.6 },
    )
    io.observe(box)
    return () => io.disconnect()
  }, [started])

  // Browsers allow sound-on autoplay only after the visitor has interacted
  // with the page; otherwise fall back to muted (the controls unmute).
  async function tryPlay(v: HTMLVideoElement) {
    try { await v.play() } catch {
      v.muted = true
      try { await v.play() } catch { /* leave it for the controls */ }
    }
  }

  return (
    <section id="launch-film" className="mx-auto max-w-7xl px-5 py-16 md:px-8">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]">
        <div className="flex flex-col justify-between gap-8 rounded-2xl border border-border bg-surface p-7 md:p-9">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Watch the film</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight md:text-4xl">Meet Artha</h2>
            <p className="mt-4 text-base leading-relaxed text-text-muted">
              How she answers, switches language mid-call, books the appointment and writes up every conversation. About three and a half minutes.
            </p>
          </div>
          <Link
            to="/signup"
            className="inline-flex w-fit items-center rounded-full bg-text px-6 py-3 text-sm font-bold text-bg transition-opacity hover:opacity-90"
          >
            Try Vistrow Voice
          </Link>
        </div>
        <div ref={boxRef} className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-[#07040d] shadow-[0_40px_100px_-40px_rgba(124,58,237,0.45)]">
          {started ? (
            <video
              src={src}
              poster="/media/launch-film-v4-poster.jpg"
              ref={(v) => {
                videoRef.current = v
                if (v && inView.current && v.paused && !userPaused.current && v.readyState === 0) void tryPlay(v)
              }}
              controls
              playsInline
              onPause={(e) => {
                // A pause while the film is still on screen came from the visitor.
                if (inView.current && !e.currentTarget.ended) userPaused.current = true
              }}
              onPlay={() => { userPaused.current = false }}
              className="h-full w-full"
            />
          ) : (
            <button
              type="button"
              onClick={() => setStarted(true)}
              aria-label="Play the Vistrow Voice launch film (3 minutes 34 seconds, with sound)"
              className="group absolute inset-0 h-full w-full"
            >
              <img
                src="/media/launch-film-v4-poster.jpg"
                alt="Artha booking a restaurant table on a live phone call, in Hindi"
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
              <span className="absolute bottom-4 left-4 flex items-center gap-3 rounded-full bg-primary py-2 pl-2 pr-5 text-sm font-bold text-white shadow-xl transition-transform group-hover:scale-105 md:bottom-6 md:left-6 md:text-base">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 md:h-12 md:w-12">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 md:h-6 md:w-6" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>
                </span>
                Play film · 3:34
              </span>
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
