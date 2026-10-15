import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import arthaAvatar from '../assets/artha-avatar.webp'
import { SWITCH_TURN, type VoiceSample } from '../lib/voiceSamples'

const BARS = 24

function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function Avatar({ agent, size = 'h-9 w-9' }: { agent: boolean; size?: string }) {
  return agent ? (
    <img src={arthaAvatar} alt="" aria-hidden="true" decoding="async" className={`${size} shrink-0 rounded-full object-cover ring-2 ring-primary/30`} />
  ) : (
    <span aria-hidden="true" className={`${size} flex shrink-0 items-center justify-center rounded-full bg-surface-high text-text-muted`}>
      <Icon name="person" className="text-[18px]" />
    </span>
  )
}

/** Hero player for a scripted two-speaker sample call. The full transcript is
 * in the server-rendered HTML; once playback starts, lines reveal in sync
 * with the audio. Nothing is downloaded until play (preload="none"), and the
 * card has fixed heights so nothing shifts while it plays. */
export function VoiceSamplePlayer({ sample }: { sample: VoiceSample }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const orbRef = useRef<HTMLSpanElement>(null)
  const barsRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)

  const started = playing || time > 0
  const active = started ? sample.turns.reduce((cur, t, i) => (t.start <= time + 0.05 ? i : cur), 0) : -1
  const switchAt = sample.turns[SWITCH_TURN].start
  const switched = active >= SWITCH_TURN
  const current = active >= 0 ? sample.turns[active] : null

  // Keep the current line in view inside the transcript box only (never
  // scrolls the page).
  useEffect(() => {
    const list = listRef.current
    if (!list || active < 0) return
    const item = list.children[active] as HTMLElement | undefined
    if (item) list.scrollTo({ top: Math.max(0, item.offsetTop - list.clientHeight / 2 + item.clientHeight / 2), behavior: reducedMotion() ? 'auto' : 'smooth' })
  }, [active])

  // Orb and bars follow the real audio level while playing.
  useEffect(() => {
    if (!playing || reducedMotion()) return
    const analyser = analyserRef.current
    if (!analyser) return
    const data = new Uint8Array(analyser.frequencyBinCount)
    let raf = 0
    const tick = () => {
      analyser.getByteFrequencyData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) sum += data[i]
      const level = Math.min(1, sum / data.length / 110)
      orbRef.current?.style.setProperty('--vs-level', level.toFixed(3))
      const bars = barsRef.current?.children
      if (bars) {
        for (let i = 0; i < bars.length; i++) {
          const v = data[Math.floor((i / bars.length) * data.length * 0.6)] / 255
          ;(bars[i] as HTMLElement).style.transform = `scaleY(${(0.15 + v * 0.85).toFixed(3)})`
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      orbRef.current?.style.setProperty('--vs-level', '0')
      const bars = barsRef.current?.children
      if (bars) for (let i = 0; i < bars.length; i++) (bars[i] as HTMLElement).style.transform = ''
    }
  }, [playing])

  useEffect(() => () => void ctxRef.current?.close().catch(() => {}), [])

  function connectAnalyser(a: HTMLAudioElement) {
    if (ctxRef.current || reducedMotion()) return
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      const ctx = new Ctx()
      const src = ctx.createMediaElementSource(a)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 128
      analyser.smoothingTimeConstant = 0.75
      src.connect(analyser)
      analyser.connect(ctx.destination)
      ctxRef.current = ctx
      analyserRef.current = analyser
    } catch {
      /* the visuals fall back to the CSS wave; audio plays either way */
    }
  }

  function play(at?: number) {
    const a = audioRef.current
    if (!a) return
    connectAnalyser(a)
    void ctxRef.current?.resume().catch(() => {})
    if (at !== undefined) {
      a.currentTime = at
      setTime(at)
    }
    void a.play().catch(() => setPlaying(false))
  }

  function toggle() {
    const a = audioRef.current
    if (!a) return
    if (a.paused) play(a.ended ? 0 : undefined)
    else a.pause()
  }

  const progress = Math.min(100, (time / sample.seconds) * 100)

  return (
    <div className="relative mx-auto w-full max-w-[460px] overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/[0.14] via-surface to-surface p-5 shadow-[0_24px_60px_-30px_rgba(168,85,247,0.55)] sm:p-6 lg:ml-auto">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">Sample call</p>
        <span
          key={switched ? 'switched' : 'start'}
          className={`vs-chip inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-bold ${
            switched ? 'is-switched border-cyan/40 bg-cyan/10 text-cyan' : 'border-border bg-surface text-text-muted'
          }`}
        >
          <Icon name="translate" className="text-[14px]" />
          {switched ? `Switched to ${sample.to}` : `Starts in ${sample.from}`}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? 'Pause the sample call' : `${started ? 'Resume' : 'Play'} the sample call, ${sample.from} to ${sample.to} (${sample.seconds} seconds)`}
          className="group relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          <span ref={orbRef} aria-hidden="true" className={`vs-orb absolute inset-0 rounded-full ${playing ? 'is-playing' : ''}`} />
          <span aria-hidden="true" className="absolute inset-0 rounded-full border border-white/20" />
          <Icon name={playing ? 'pause' : 'play_arrow'} className="vs-play-icon relative text-white drop-shadow transition-transform group-hover:scale-110" />
        </button>
        <div className="min-w-0 flex-1">
          <div ref={barsRef} aria-hidden="true" className="flex h-10 items-center gap-[3px]">
            {Array.from({ length: BARS }, (_, i) => (
              <span
                key={i}
                className={`vv-wave-bar h-full flex-1 rounded-full ${i / BARS < progress / 100 ? 'bg-primary' : 'bg-primary/40'} ${playing ? 'is-playing' : ''}`}
                style={{ animationDelay: `${(i % 6) * -0.17}s` }}
              />
            ))}
          </div>
          <div className="relative mt-2">
            <input
              type="range"
              min={0}
              max={sample.seconds}
              step={0.1}
              value={time}
              aria-label="Playback position"
              aria-valuetext={`${clock(time)} of ${clock(sample.seconds)}`}
              onChange={(e) => play(Number(e.currentTarget.value))}
              className="vs-range w-full"
              style={{ '--vs-progress': `${progress}%` } as React.CSSProperties}
            />
            <span
              aria-hidden="true"
              title={`Switch to ${sample.to}`}
              className="pointer-events-none absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded bg-cyan"
              style={{ left: `${(switchAt / sample.seconds) * 100}%` }}
            />
          </div>
          <p className="mt-1 flex justify-between text-xs tabular-nums text-text-muted">
            <span>{clock(time)}</span>
            <span>{clock(sample.seconds)}</span>
          </p>
        </div>
      </div>

      {/* Now speaking: fixed height, announced politely to screen readers. */}
      <div className="mt-4 flex h-11 items-center gap-2.5 rounded-2xl bg-surface-high/60 px-3" aria-live="polite">
        {current ? (
          <>
            <Avatar agent={current.speaker === 'Agent'} size="h-7 w-7" />
            <p className="min-w-0 truncate text-sm">
              <span className="font-bold">{current.speaker === 'Agent' ? 'AI agent' : 'Caller'}</span>
              <span className="text-text-muted"> speaking {active < SWITCH_TURN ? sample.from : sample.to}</span>
              <span className="sr-only">: </span>
              <span lang={current.lang} className="sr-only">{current.native}</span>
            </p>
          </>
        ) : (
          <p className="text-sm text-text-muted">Press play: the caller starts in {sample.from}, then switches to {sample.to}.</p>
        )}
      </div>

      <ol ref={listRef} aria-label="Transcript" className="relative mt-3 h-64 space-y-2 overflow-y-auto overscroll-contain pr-1 sm:h-72">
        {sample.turns.map((turn, i) => {
          const agent = turn.speaker === 'Agent'
          const hidden = started && i > active
          return (
            <li key={i} className={`vs-line ${hidden ? 'is-hidden' : ''}`}>
              {i === SWITCH_TURN && (
                <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-cyan">
                  <span className="h-px flex-1 bg-cyan/30" />
                  Caller switches to {sample.to} at {clock(switchAt)}
                  <span className="h-px flex-1 bg-cyan/30" />
                </p>
              )}
              <button
                type="button"
                onClick={() => play(turn.start)}
                tabIndex={hidden ? -1 : 0}
                aria-current={i === active ? 'true' : undefined}
                aria-label={`Play from here: ${agent ? 'AI agent' : 'Caller'}, ${clock(turn.start)}`}
                className={`flex w-full gap-2.5 rounded-2xl border p-3 text-left transition-colors ${
                  i === active ? 'border-primary bg-primary/[0.12]' : agent ? 'border-primary/20 bg-primary/[0.04] hover:border-primary/50' : 'border-border bg-surface hover:border-primary/50'
                }`}
              >
                <Avatar agent={agent} size="h-7 w-7" />
                <span className="min-w-0">
                  <span className="block text-[11px] font-bold uppercase tracking-widest text-text-muted">
                    {agent ? 'AI agent' : 'Caller'}
                  </span>
                  <span lang={turn.lang} className="mt-0.5 block text-sm leading-relaxed text-text">{turn.native}</span>
                  {turn.gloss && <span className="mt-0.5 block text-xs italic leading-relaxed text-text-muted">{turn.gloss}</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-text-muted">
        <Icon name="info" className="mt-px shrink-0 text-[14px]" />
        <span>Scripted sample voiced by Vistrow Voice voices. Not a real customer call.</span>
      </p>

      <audio
        ref={audioRef}
        src={sample.src}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
      />
    </div>
  )
}
