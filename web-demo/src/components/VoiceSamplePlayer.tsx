import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Icon } from './Icon'
import arthaAvatar from '../assets/artha-avatar.webp'
import { switchTurnOf, type VoiceSample } from '../lib/voiceSamples'

// Native name and short tag per spoken language, keyed by the BCP 47 primary
// subtag the samples use.
const LANG_META: Record<string, { native: string; tag: string }> = {
  en: { native: 'English', tag: 'EN' },
  hi: { native: 'हिन्दी', tag: 'HI' },
  mr: { native: 'मराठी', tag: 'MR' },
  ta: { native: 'தமிழ்', tag: 'TA' },
  te: { native: 'తెలుగు', tag: 'TE' },
  kn: { native: 'ಕನ್ನಡ', tag: 'KN' },
  ml: { native: 'മലയാളം', tag: 'ML' },
  gu: { native: 'ગુજરાતી', tag: 'GU' },
  bn: { native: 'বাংলা', tag: 'BN' },
  pa: { native: 'ਪੰਜਾਬੀ', tag: 'PA' },
  or: { native: 'ଓଡ଼ିଆ', tag: 'OR' },
}

// `native` is what the track, the lines and "Now speaking" show; `short` is
// the header pair. An accent sample (accentLabels) names the accent instead.
function langInfo(code: string, name: string, accents?: VoiceSample['accentLabels']) {
  const accent = accents?.[code]
  if (accent) return { code, name, native: accent.label, tag: accent.tag, short: accent.short }
  const meta = LANG_META[code.split('-')[0]] ?? { native: name, tag: code.slice(0, 2).toUpperCase() }
  return { code, name, ...meta, short: meta.native }
}

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

// Waveform geometry, in viewBox units: one bar per peak, centred on y = H/2.
const H = 40
const BAR = 0.56

function barsPath(peaks: number[], from: number, to: number) {
  let d = ''
  for (let i = from; i < to; i++) {
    const h = Math.max(1.6, (peaks[i] / 100) * H * 0.92)
    d += `M${(i + (1 - BAR) / 2).toFixed(2)} ${((H - h) / 2).toFixed(2)}h${BAR}v${h.toFixed(2)}h-${BAR}z`
  }
  return d
}

/** Hero player for a scripted two-speaker sample call. A real waveform of the
 * file sits over a language track that shows where the agent moves from the
 * opening language into the caller's. The full transcript is in the
 * server-rendered HTML; nothing is downloaded until play (preload="none"),
 * and the card has fixed heights so nothing shifts while it plays. */
export function VoiceSamplePlayer({ sample }: { sample: VoiceSample }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const waveRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [ended, setEnded] = useState(false)

  const accents = sample.accentLabels
  const from = langInfo(sample.languages[0], sample.from, accents)
  const to = langInfo(sample.languages[1], sample.to, accents)
  const switchTurn = switchTurnOf(sample)
  const switchAt = sample.turns[switchTurn].start
  const switchPct = (switchAt / sample.seconds) * 100
  const started = playing || time > 0
  const active = started ? sample.turns.reduce((cur, t, i) => (t.start <= time + 0.05 ? i : cur), 0) : -1
  const switched = started && time + 0.05 >= switchAt
  const current = active >= 0 ? sample.turns[active] : null
  const progress = Math.min(100, (time / sample.seconds) * 100)
  // Fill of each track segment, 0-100 of its own width.
  const fromFill = Math.min(100, (progress / switchPct) * 100)
  const toFill = Math.max(0, ((progress - switchPct) / (100 - switchPct)) * 100)

  const peaks = sample.peaks
  const paths = useMemo(() => {
    if (!peaks?.length) return null
    const cut = Math.round((switchAt / sample.seconds) * peaks.length)
    return { all: barsPath(peaks, 0, peaks.length), before: barsPath(peaks, 0, cut), after: barsPath(peaks, cut, peaks.length), n: peaks.length }
  }, [peaks, switchAt, sample.seconds])

  // Keep the current line in view inside the transcript box only (never
  // scrolls the page), low in the box so earlier lines stay readable above
  // it and the next line peeks in below: the box never shows empty space.
  useEffect(() => {
    const list = listRef.current
    if (!list || active < 0) return
    const item = list.children[active] as HTMLElement | undefined
    if (!item) return
    const top = item.offsetTop + item.offsetHeight - list.clientHeight * 0.8
    list.scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? 'auto' : 'smooth' })
  }, [active])

  // Smooth playhead: read the element's clock every frame while playing
  // (timeupdate alone fires only about four times a second).
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = () => {
      const a = audioRef.current
      if (a) setTime(a.currentTime)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  function seek(at: number, autoplay: boolean) {
    const a = audioRef.current
    if (!a) return
    const t = Math.min(sample.seconds, Math.max(0, at))
    a.currentTime = t
    setTime(t)
    setEnded(false)
    if (autoplay && a.paused) void a.play().catch(() => setPlaying(false))
  }

  function toggle() {
    const a = audioRef.current
    if (!a) return
    if (a.paused) {
      if (a.ended || time >= sample.seconds - 0.1) seek(0, false)
      void a.play().catch(() => setPlaying(false))
    } else a.pause()
  }

  function seekFromPointer(e: PointerEvent<HTMLDivElement>, autoplay: boolean) {
    const box = waveRef.current?.getBoundingClientRect()
    if (!box || box.width === 0) return
    seek(((e.clientX - box.left) / box.width) * sample.seconds, autoplay)
  }

  function onWaveKey(e: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowRight: 2, ArrowUp: 2, ArrowLeft: -2, ArrowDown: -2, PageUp: 10, PageDown: -10 }[e.key]
    if (step !== undefined) seek(time + step, false)
    else if (e.key === 'Home') seek(0, false)
    else if (e.key === 'End') seek(sample.seconds, false)
    else if (e.key === ' ' || e.key === 'Enter') toggle()
    else return
    e.preventDefault()
  }

  const speaking = current ? langInfo(current.lang, current.lang === to.code ? to.name : from.name, accents) : null

  return (
    <div className="vs-card relative mx-auto w-full max-w-[460px] rounded-2xl border border-border bg-surface p-4 sm:p-5 lg:ml-auto">
      {/* Header: who is calling, and the language pair the call moves through. */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <img src={arthaAvatar} alt="" aria-hidden="true" decoding="async" className="h-9 w-9 shrink-0 rounded-full object-cover" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight text-text">Sample call</p>
            <p className="truncate text-xs leading-tight text-text-muted">Artha, AI agent · {clock(sample.seconds)}</p>
          </div>
        </div>
        <p
          className={`vs-pair inline-flex shrink-0 items-center gap-1 rounded-full border p-1 text-xs font-semibold ${switched ? 'is-switched border-primary/35' : 'border-border'}`}
        >
          <span lang={from.code} className={`vs-pair-from rounded-full px-2 py-0.5 ${switched ? 'text-text-muted' : 'bg-surface-high text-text'}`}>
            {from.short}
          </span>
          <Icon name="arrow_forward" className="vs-pair-arrow text-[14px] text-text-muted" />
          <span className="sr-only"> to </span>
          <span lang={to.code} className={`vs-pair-to rounded-full px-2 py-0.5 ${switched ? 'bg-primary text-white' : 'text-text-muted'}`}>
            {to.short}
          </span>
        </p>
      </div>

      {/* Transport: play/pause, what is happening now, and the clock. */}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? 'Pause the sample call' : `${started ? 'Resume' : 'Play'} the sample call, ${sample.from} to ${sample.to} (${sample.seconds} seconds)`}
          className="vs-play flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-primary-dark sm:h-[52px] sm:w-[52px]"
        >
          <Icon name={playing ? 'pause' : 'play_arrow'} className="vs-play-icon" />
        </button>
        <div className="min-w-0 flex-1">
          {ended ? (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Call ended</p>
              <p className="truncate text-sm text-text">Press play to hear it again.</p>
            </>
          ) : current && speaking ? (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Now speaking</p>
              <p className="truncate text-sm text-text">
                <span className="font-semibold">{current.speaker === 'Agent' ? 'AI agent' : 'Caller'}</span>
                <span className="text-text-muted"> in </span>
                <span lang={speaking.code} className={speaking.code === to.code ? 'font-semibold text-primary' : 'font-semibold text-text-muted'}>
                  {speaking.native}
                </span>
              </p>
            </>
          ) : (
            <p className="text-sm leading-snug text-text-muted">
              The agent opens in {sample.from}; the caller answers in {sample.to}.
            </p>
          )}
        </div>
        <p className="shrink-0 text-xs tabular-nums text-text-muted">
          <span className="text-text">{clock(time)}</span> / {clock(sample.seconds)}
        </p>
      </div>

      {/* Waveform of the real file: click or drag to seek, arrow keys too. */}
      <div
        ref={waveRef}
        role="slider"
        tabIndex={0}
        aria-label="Seek in the sample call"
        aria-valuemin={0}
        aria-valuemax={sample.seconds}
        aria-valuenow={Math.round(time)}
        aria-valuetext={`${clock(time)} of ${clock(sample.seconds)}, ${switched ? `agent in ${to.name}` : `agent in ${from.name}`}`}
        onKeyDown={onWaveKey}
        onPointerDown={(e) => {
          dragging.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          seekFromPointer(e, true)
        }}
        onPointerMove={(e) => dragging.current && seekFromPointer(e, false)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        className="vs-wave relative mt-4 h-14 cursor-pointer touch-none select-none rounded-lg"
      >
        {paths && (
          <>
            <svg aria-hidden="true" viewBox={`0 0 ${paths.n} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
              <path d={paths.all} className="fill-border" />
            </svg>
            <svg
              aria-hidden="true"
              viewBox={`0 0 ${paths.n} ${H}`}
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full"
              style={{ clipPath: `inset(0 ${100 - progress}% 0 0)` }}
            >
              <path d={paths.before} className="fill-muted" />
              <path d={paths.after} className="fill-primary" />
            </svg>
          </>
        )}
        <span aria-hidden="true" className="vs-wave-switch absolute inset-y-0 w-px" style={{ left: `${switchPct}%` }} />
        {started && <span aria-hidden="true" className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-text" style={{ left: `${progress}%` }} />}
      </div>

      {/* Language track: the call's timeline split by the agent's language. */}
      <div aria-hidden="true" className="relative mt-2">
        <div className="flex h-1.5 gap-0.5">
          <span className="relative h-full overflow-hidden rounded-l-full bg-muted/20" style={{ width: `${switchPct}%` }}>
            <span className="absolute inset-y-0 left-0 bg-muted" style={{ width: `${fromFill}%` }} />
          </span>
          <span className="relative h-full flex-1 overflow-hidden rounded-r-full bg-primary/15">
            <span className="vs-track-to absolute inset-y-0 left-0 bg-primary" style={{ width: `${toFill}%` }} />
          </span>
        </div>
        <span
          key={switched ? 'on' : 'off'}
          className={`vs-marker absolute top-[3px] h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${
            switched ? 'is-switched border-surface bg-primary' : 'border-primary bg-surface'
          }`}
          style={{ left: `calc(${switchPct}% + 1px)` }}
        />
      </div>
      <div className="mt-2 flex text-xs">
        <p className="flex min-w-0 items-center gap-1.5 pr-2" style={{ width: `${switchPct}%` }}>
          <span className="shrink-0 rounded bg-muted/15 px-1 py-px text-[10px] font-bold tracking-wide text-text-muted">{from.tag}</span>
          <span lang={from.code} className={`truncate font-medium text-text-muted ${switchPct < 28 ? 'hidden sm:inline' : ''}`}>
            {from.native}
          </span>
        </p>
        <div className={`vs-track-label min-w-0 flex-1 border-l pl-2 ${switched ? 'is-switched border-primary/50' : 'border-border'}`}>
          <p className="flex items-center gap-1.5">
            <span className={`shrink-0 rounded px-1 py-px text-[10px] font-bold tracking-wide ${switched ? 'bg-primary text-white' : 'bg-primary/12 text-primary'}`}>
              {to.tag}
            </span>
            <span className={`truncate font-semibold ${switched ? 'text-primary' : 'text-text'}`}>
              <span lang={to.code}>{to.native}</span>
              {to.native !== to.name && !accents && <span className="font-normal text-text-muted"> · {to.name}</span>}
            </span>
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-text-muted">Agent switched {accents ? 'accent ' : ''}automatically · {clock(switchAt)}</p>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {switched ? `The agent has switched to ${to.name}.` : ''}
      </p>

      <ol
        ref={listRef}
        aria-label="Transcript"
        className="vs-transcript relative mt-4 h-72 space-y-2 overflow-y-auto overscroll-contain rounded-xl border border-border bg-bg/40 p-2.5 sm:h-80"
      >
        {sample.turns.map((turn, i) => {
          const agent = turn.speaker === 'Agent'
          const lang = langInfo(turn.lang, turn.lang === to.code ? to.name : from.name, accents)
          const target = turn.lang === to.code
          const upcoming = started && i > active
          return (
            <li key={i} className={`flex flex-col ${agent ? 'items-start' : 'items-end'}`}>
              {i === switchTurn && (
                <p className="mb-2 flex w-full items-center gap-2 text-[11px] font-semibold text-primary">
                  <span className="h-px flex-1 bg-primary/25" />
                  <span>
                    Agent continues in <span lang={to.code}>{accents ? to.name : to.native}</span> · {clock(switchAt)}
                  </span>
                  <span className="h-px flex-1 bg-primary/25" />
                </p>
              )}
              <button
                type="button"
                onClick={() => seek(turn.start, true)}
                aria-current={i === active ? 'true' : undefined}
                title={`Play from ${clock(turn.start)}`}
                className={`vs-line block max-w-[90%] rounded-xl border px-3 py-2 text-left transition-[background-color,border-color,opacity] ${
                  agent ? 'rounded-tl-sm' : 'rounded-tr-sm'
                } ${
                  i === active
                    ? 'border-primary/45 bg-primary/[0.07]'
                    : agent
                      ? 'border-transparent bg-surface-high/70 hover:border-border'
                      : 'border-border bg-surface hover:border-primary/30'
                } ${upcoming ? 'opacity-45' : ''}`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">{agent ? 'AI agent' : 'Caller'}</span>
                  <span className={`rounded px-1 py-px text-[10px] font-bold tracking-wide ${target ? 'bg-primary/12 text-primary' : 'bg-muted/15 text-text-muted'}`}>
                    {lang.tag}
                  </span>
                  <span className="ml-auto pl-2 text-[10px] tabular-nums text-text-muted">{clock(turn.start)}</span>
                </span>
                <span lang={turn.lang} className="mt-1 block text-sm leading-relaxed text-text">{turn.native}</span>
                {turn.gloss && <span lang="en" className="mt-0.5 block text-xs leading-relaxed text-text-muted/85">{turn.gloss}</span>}
              </button>
            </li>
          )
        })}
      </ol>

      <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-text-muted">
        <Icon name="info" className="mt-px shrink-0 text-[14px]" />
        <span>Demo call voiced by Vistrow Voice. Not a real customer.</span>
      </p>

      <audio
        ref={audioRef}
        src={sample.src}
        preload="none"
        onPlay={() => {
          setPlaying(true)
          setEnded(false)
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setEnded(true)
          setTime(sample.seconds)
        }}
        onTimeUpdate={(e) => !playing && setTime(e.currentTarget.currentTime)}
      />
    </div>
  )
}
