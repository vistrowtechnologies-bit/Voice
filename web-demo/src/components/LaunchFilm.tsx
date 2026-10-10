import { useEffect, useRef, useState } from 'react'
import { SectionEyebrow } from './MarketingBits'

/** The launch film, in English or Hindi. Nothing but the poster image loads
 * until the visitor reaches it; then it plays, and it pauses again when they
 * scroll away. A visitor who pauses it themselves is left alone. The Hindi
 * file is only fetched once someone picks Hindi. */
type Lang = 'en' | 'hi'
const FILMS: Record<Lang, { hd: string; sd: string; length: string; spoken: string }> = {
  en: { hd: '/media/launch-film-v4.mp4', sd: '/media/launch-film-v4-720.mp4', length: '3:34', spoken: '3 minutes 34 seconds' },
  hi: { hd: '/media/launch-film-v4-hi.mp4', sd: '/media/launch-film-v4-hi-720.mp4', length: '3:36', spoken: '3 minutes 36 seconds' },
}

/** Phones and Save-Data visitors get the 720p file (6 MB instead of 12 MB). */
function pickSize(): 'hd' | 'sd' {
  try {
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } }
    if (nav.connection?.saveData || window.matchMedia('(max-width: 768px)').matches) return 'sd'
  } catch { /* fall through to HD */ }
  return 'hd'
}

export function LaunchFilm() {
  const [started, setStarted] = useState(false)
  const [size] = useState(pickSize) // fixed once, so a resize can't restart the film
  const [lang, setLang] = useState<Lang>('en')
  const film = FILMS[lang]
  const boxRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const userPaused = useRef(false)
  const inView = useRef(false)
  const wantPlay = useRef(false) // the visitor asked for the film (play button or language)

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

  // Picking a language is a request to watch it: switch the film and play it.
  function choose(next: Lang) {
    if (next === lang && started) return
    userPaused.current = false
    wantPlay.current = true
    setLang(next)
    setStarted(true)
    // On phones the switch sits above the film; bring the film on screen so it can play.
    boxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  return (
    <section id="launch-film" className="mx-auto max-w-7xl px-5 py-16 md:px-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <SectionEyebrow>Watch the film</SectionEyebrow>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight md:text-4xl">Meet Artha</h2>
        </div>
        <div className="flex items-center gap-3">
          <span id="film-lang" className="text-xs font-bold uppercase tracking-[0.18em] text-text-muted">Watch in</span>
          <div role="group" aria-labelledby="film-lang" className="flex rounded-full border border-border bg-surface p-1 text-sm font-bold">
            {(['en', 'hi'] as const).map((l) => (
              <button
                key={l}
                type="button"
                lang={l}
                aria-pressed={lang === l}
                onClick={() => choose(l)}
                className={`min-h-9 rounded-full px-4 transition-colors ${lang === l ? 'bg-text text-bg' : 'text-text-muted hover:text-text'}`}
              >
                {l === 'en' ? 'English' : 'हिंदी'}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div ref={boxRef} className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-[#07040d] shadow-[0_40px_100px_-40px_rgba(124,58,237,0.45)]">
        {started ? (
          <video
            key={lang /* a new element per language, so the new film starts cleanly */}
            src={film[size]}
            poster="/media/launch-film-v4-poster.jpg"
            ref={(v) => {
              videoRef.current = v
              if (v && (inView.current || wantPlay.current) && v.paused && !userPaused.current && v.readyState === 0) void tryPlay(v)
            }}
            controls
            playsInline
            onPause={(e) => {
              // A pause while the film is still on screen came from the visitor.
              if (inView.current && !e.currentTarget.ended) userPaused.current = true
            }}
            onPlay={() => { userPaused.current = false }}
            // cover, not contain: inside the 1px border the box is a hair wider than 16:9,
            // and contain would letterbox it with thin dark bars at the sides
            className="h-full w-full object-cover"
          />
        ) : (
          <button
            type="button"
            onClick={() => { wantPlay.current = true; setStarted(true) }}
            aria-label={`Play the Vistrow Voice launch film in ${lang === 'en' ? 'English' : 'Hindi'} (${film.spoken}, with sound)`}
            className="group absolute inset-0 h-full w-full"
          >
            <img
              src="/media/launch-film-v4-poster.jpg"
              alt="Artha booking a restaurant table on a live phone call, in Hindi"
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
            {/* small on phones, where the film itself is small; full size from md up */}
            <span className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-primary py-1 pl-1 pr-3 text-xs font-bold text-white shadow-xl transition-transform group-hover:scale-105 md:bottom-6 md:left-6 md:gap-3 md:py-2 md:pl-2 md:pr-5 md:text-base">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 md:h-12 md:w-12">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 md:h-6 md:w-6" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>
              </span>
              Play film · {film.length}
            </span>
          </button>
        )}
      </div>
    </section>
  )
}
