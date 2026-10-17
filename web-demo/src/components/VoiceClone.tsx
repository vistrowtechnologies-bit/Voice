import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import {
  createCustomVoice,
  deleteCustomVoice,
  fetchCustomVoicePreview,
  fetchCustomVoiceQuote,
  fetchCustomVoices,
  renameCustomVoice,
} from '../lib/api'
import type { CustomVoice, CustomVoiceQuote } from '../lib/api'
import { canRecordAudio, useAudioRecorder } from '../lib/useAudioRecorder'
import {
  CLONE_GENDERS,
  CLONE_LANGUAGES,
  CONSENT_MAX_SECONDS,
  PREVIEW_MAX_CHARS,
  RECORD_AUTO_STOP_SECONDS,
  SAMPLE_MIN_SECONDS,
  SPEECH_TARGET_SECONDS,
  UPLOAD_ACCEPT,
  VOICE_NAME_MAX,
  checkConsentDuration,
  checkRecordedSample,
  checkSampleDuration,
  checkUploadFile,
  cloneLanguageLabel,
  cloneScript,
  extensionForMime,
  formatClock,
  htmlLang,
  levelHints,
  meterLevel,
  micCheckVerdict,
  recordingPhase,
  talkSeconds,
  voiceInitials,
} from '../lib/voiceClone'
import type { CloneGender, LevelFrame } from '../lib/voiceClone'

const BILLING_PATH = '/dashboard/settings?tab=billing'
const POLL_MS = 3000
const POLL_LIMIT_MS = 3 * 60 * 1000
const LANGUAGE_COUNT = CLONE_LANGUAGES.length

const fmtCredits = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
const perMinute = (n: number) => `${fmtCredits(n)} min per min`
const FREE_LINE = 'Your first cloned voice is included in your plan.'
const setupLine = (q: CustomVoiceQuote) =>
  q.firstCloneFree || q.setupCredits <= 0 ? FREE_LINE : `${fmtCredits(q.setupCredits)} credits once to set it up.`
// Cloned voices bill at the normal Bharat voice rate; say so instead of a bare number.
const callPriceLine = (q: { creditsPerMinute: number }) =>
  `On calls, same price as Bharat voices (${perMinute(q.creditsPerMinute)}).`
const createLabel = (q: CustomVoiceQuote | null) =>
  !q || q.firstCloneFree || q.setupCredits <= 0 ? 'Create my voice' : `Create for ${fmtCredits(q.setupCredits)} credits`
const genderLabel = (g: CustomVoice['gender']) => CLONE_GENDERS.find(([k]) => k === g)?.[1] ?? ''

export function ClonedBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-magenta/10 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-magenta">
      <Icon name="mic" className="text-[11px]" />
      Cloned
    </span>
  )
}

const STATUS: Record<CustomVoice['status'], { label: string; cls: string }> = {
  processing: { label: 'Getting ready', cls: 'bg-amber/10 text-amber' },
  ready: { label: 'Ready', cls: 'bg-success/10 text-success' },
  failed: { label: 'Couldn’t create', cls: 'bg-destructive/10 text-destructive' },
}

function StatusBadge({ status }: { status: CustomVoice['status'] }) {
  const s = STATUS[status] ?? STATUS.processing
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${s.cls}`}>
      {status === 'processing' && <Icon name="progress_activity" className="animate-spin text-[12px] motion-reduce:animate-none" />}
      {s.label}
    </span>
  )
}

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full font-display font-semibold text-white ${
        size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-11 w-11 text-sm'
      }`}
      style={{ background: 'linear-gradient(135deg, var(--color-magenta), var(--color-primary))' }}
    >
      {voiceInitials(name)}
    </span>
  )
}

// ------------------------------------------------------------------ dialog shell

function Dialog({
  title,
  onClose,
  children,
  wide = false,
  closable = true,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
  closable?: boolean
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement | null>(null)
  // Latest props in refs, so the effect below runs once per dialog and does
  // not steal focus back from an input on every render.
  const closeRef = useRef(onClose)
  const closableRef = useRef(closable)
  closeRef.current = onClose
  closableRef.current = closable

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closableRef.current) closeRef.current()
      // Keep Tab inside the dialog.
      if (e.key === 'Tab' && panelRef.current) {
        const items = [...panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea, audio[controls], [tabindex]:not([tabindex="-1"])',
        )].filter((el) => el.offsetParent !== null)
        if (items.length === 0) return
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onClick={closable ? onClose : undefined}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-surface shadow-2xl outline-none sm:max-h-[92vh] sm:rounded-3xl ${
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md'
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
          <h2 id={titleId} className="font-display text-base font-semibold tracking-tight sm:text-lg">
            {title}
          </h2>
          {closable && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface-high hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <Icon name="close" className="text-[20px]" />
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

const primaryBtn =
  'inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-5 text-sm font-extrabold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface'
const ghostBtn =
  'inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-transparent px-4 text-sm font-bold text-text-muted transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
const linkBtn =
  'inline-flex items-center gap-1 rounded-md text-sm font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
const iconBtn =
  'flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-high hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
const inputCls =
  'w-full rounded-xl border border-border bg-surface-high px-3 py-2.5 text-sm outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/30'
const alertCls = 'rounded-lg border-l-[3px] bg-surface-high px-3 py-2 text-sm'

function Alert({ tone = 'error', children }: { tone?: 'error' | 'warn'; children: ReactNode }) {
  return (
    <div role="alert" className={`${alertCls} ${tone === 'error' ? 'border-destructive' : 'border-amber'}`}>
      {children}
    </div>
  )
}

// ------------------------------------------------------------------ recorder UI

type Recorder = ReturnType<typeof useAudioRecorder>

/** Live waveform: one bar per 100 ms frame, newest on the right. */
function Waveform({ frames, active }: { frames: readonly LevelFrame[]; active: boolean }) {
  const bars = 48
  const recent = frames.slice(-bars)
  const pad = bars - recent.length
  return (
    <div className="flex h-12 w-full items-center gap-[2px]" aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => {
        const f = i >= pad ? recent[i - pad] : null
        const h = f ? Math.max(8, Math.min(100, Math.sqrt(f.rms) * 180)) : 8
        return (
          <span
            key={i}
            className={`flex-1 rounded-full transition-[height] duration-100 ${f && active ? 'bg-primary' : 'bg-surface-high'}`}
            style={{ height: `${h}%` }}
          />
        )
      })}
    </div>
  )
}

/** Big round record button inside a ring that fills up to the ideal 15 s. */
function RecordButton({ rec, label }: { rec: Recorder; label: string }) {
  const recording = rec.state === 'recording'
  const active = recording || rec.state === 'done'
  const { ring, phase } = recordingPhase(active ? rec.seconds : 0, active ? talkSeconds(rec.frames, rec.seconds) : 0)
  const r = 52
  const c = 2 * Math.PI * r
  return (
    <div className="relative h-[124px] w-[124px] shrink-0">
      <svg viewBox="0 0 124 124" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="62" cy="62" r={r} fill="none" strokeWidth="6" className="stroke-surface-high" />
        <circle
          cx="62"
          cy="62"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ring)}
          className={`transition-[stroke-dashoffset] duration-100 ${phase === 'short' ? 'stroke-primary' : 'stroke-success'}`}
        />
      </svg>
      {recording ? (
        <button
          type="button"
          onClick={rec.stop}
          aria-label={`Stop recording ${label}`}
          className="absolute inset-[18px] flex items-center justify-center rounded-full bg-destructive text-white shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-destructive/40"
        >
          <Icon name="stop" className="text-[36px]!" />
        </button>
      ) : (
        <button
          type="button"
          onClick={rec.start}
          disabled={rec.state === 'starting'}
          aria-label={rec.state === 'done' ? `Record ${label} again` : `Start recording ${label}`}
          className="absolute inset-[18px] flex items-center justify-center rounded-full bg-primary text-white shadow-[0_10px_28px_-8px_var(--color-primary)] transition-transform hover:scale-105 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40 motion-reduce:transition-none"
        >
          <Icon
            name={rec.state === 'starting' ? 'progress_activity' : 'mic'}
            className={`text-[36px]! ${rec.state === 'starting' ? 'animate-spin motion-reduce:animate-none' : ''}`}
          />
        </button>
      )}
    </div>
  )
}

/** Mic check: live level with a "too quiet" / "too loud" verdict. */
function MicCheck({ rec }: { rec: Recorder }) {
  const listening = rec.state === 'monitoring'
  const { verdict, message } = micCheckVerdict(rec.frames)
  const tone =
    verdict === 'good' ? 'bg-success' : verdict === 'loud' ? 'bg-destructive' : verdict === 'quiet' ? 'bg-amber' : 'bg-primary'
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-high/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold">Mic check</p>
        {listening ? (
          <button type="button" onClick={rec.stopMonitor} className={`${ghostBtn} h-9 text-xs`}>
            Stop test
          </button>
        ) : (
          <button type="button" onClick={rec.monitor} disabled={rec.state === 'starting'} className={`${ghostBtn} h-9 text-xs`}>
            <Icon name="mic" className="text-[16px]" />
            Test my mic
          </button>
        )}
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-surface-high" aria-hidden="true">
        <div
          className={`h-full rounded-full transition-[width] duration-100 ${listening ? tone : 'bg-surface-high'}`}
          style={{ width: `${listening ? Math.max(3, meterLevel(rec.level) * 100) : 0}%` }}
        />
      </div>
      <p className={`text-xs font-semibold ${verdict === 'good' ? 'text-success' : 'text-text-muted'}`} role="status" aria-live="polite">
        {listening ? message : 'Optional. Talk for a few seconds to see if the level is right.'}
      </p>
      {rec.error && <Alert>{rec.error}</Alert>}
    </div>
  )
}

/** The voice sample recorder: script, ring button, waveform, hints, playback. */
function SampleRecorder({ rec, language }: { rec: Recorder; language: string }) {
  const recording = rec.state === 'recording'
  const done = rec.state === 'done'
  const talk = talkSeconds(rec.frames, rec.seconds)
  const phase = recordingPhase(rec.seconds, talk)
  const live = levelHints(rec.frames, recording)
  const result = done ? checkRecordedSample(rec.seconds, talk) : null

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-border bg-surface p-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-muted">
          Read this out loud, in {cloneLanguageLabel(language)}
        </p>
        <p className="font-display text-[16px] leading-relaxed sm:text-[17px]" lang={htmlLang(language)}>
          {cloneScript(language)}
        </p>
        <p className="mt-2 text-xs text-text-muted">
          Read it the way your agent should sound on calls. Not your language? Go back and change the recording language.
        </p>
        <p className="mt-2 text-xs font-semibold text-primary">
          Reached the end? Start again from the top and keep reading until the ring is full.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface-high/40 p-4">
        <RecordButton rec={rec} label="your voice" />
        <p className="font-display text-2xl font-semibold tabular-nums">
          {formatClock(rec.seconds)}
          {(recording || done) && (
            <span className="text-sm font-medium text-text-muted">
              {' '}
              · {Math.min(Math.floor(talk), SPEECH_TARGET_SECONDS)} of {SPEECH_TARGET_SECONDS} s talking
            </span>
          )}
        </p>
        <p
          className={`text-sm font-bold ${
            recording ? (phase.phase === 'short' ? 'text-primary' : 'text-success') : done ? (result?.ok ? 'text-success' : 'text-destructive') : 'text-text-muted'
          }`}
          role="status"
          aria-live="polite"
        >
          {recording
            ? phase.label
            : done
              ? result?.message
              : rec.state === 'starting'
                ? 'Asking for the microphone.'
                : 'Tap the mic and start reading.'}
        </p>
        <Waveform frames={rec.frames} active={recording || rec.state === 'monitoring'} />
        <p className="text-center text-[11px] text-text-muted">
          The ring fills as you talk: about {SPEECH_TARGET_SECONDS} seconds of talking. Stops by itself at {RECORD_AUTO_STOP_SECONDS} seconds.
        </p>
      </div>

      {(recording || done) && live.hints.length > 0 && (
        <ul className="flex flex-col gap-1.5" role="status" aria-live="polite">
          {live.hints.map((h) => (
            <li key={h.code} className="flex items-start gap-2 rounded-lg border-l-[3px] border-amber bg-surface-high px-3 py-2 text-sm">
              <Icon name="info" className="mt-0.5 text-[16px] text-amber" />
              {h.message}
            </li>
          ))}
        </ul>
      )}

      {rec.error && <Alert>{rec.error}</Alert>}

      {done && rec.url && (
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3">
          <p className="text-sm font-bold">Listen back</p>
          <audio controls src={rec.url} className="h-10 w-full" aria-label="Play back your recording" />
          <button type="button" onClick={rec.reset} className={`${ghostBtn} h-9 self-start text-xs`}>
            <Icon name="refresh" className="text-[16px]" />
            Record again
          </button>
        </div>
      )}
    </div>
  )
}

const CREATE_STAGES = ['Uploading your recording', 'Checking the sound', 'Checking your consent', 'Creating your voice', 'Almost done']
const CREATE_STAGE_MS = 2500

/** While a voice is being created: moving sound bars and a step list, so a
 * wait of several seconds never looks frozen. Upload progress is real; the
 * later steps advance on a timer and stop at "Almost done". */
function CreatingProgress({ progress }: { progress: number }) {
  const uploaded = progress >= 1
  const [stage, setStage] = useState(0)
  useEffect(() => {
    if (!uploaded) return
    setStage(1)
    const id = window.setInterval(() => setStage((s) => Math.min(s + 1, CREATE_STAGES.length - 1)), CREATE_STAGE_MS)
    return () => window.clearInterval(id)
  }, [uploaded])
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-6 text-center" role="status" aria-live="polite">
      <div className="flex h-12 items-end gap-1.5" aria-hidden="true">
        {[0.55, 0.9, 0.7, 1, 0.6, 0.85, 0.5].map((h, i) => (
          <span
            key={i}
            className="w-1.5 animate-pulse rounded-full bg-primary motion-reduce:animate-none"
            style={{ height: `${h * 100}%`, animationDelay: `${i * 140}ms`, animationDuration: '900ms' }}
          />
        ))}
      </div>
      <div>
        <p className="font-display text-lg font-semibold">
          {CREATE_STAGES[stage]}
          {stage === 0 ? `, ${Math.round(progress * 100)}%` : '…'}
        </p>
        <p className="mt-1 text-xs text-text-muted">This can take up to half a minute. Please keep this window open.</p>
      </div>
      <ol className="flex w-full max-w-xs flex-col gap-1.5 text-left text-sm">
        {CREATE_STAGES.map((label, i) => (
          <li key={label} className={`flex items-center gap-2 ${i > stage ? 'text-text-muted' : ''}`}>
            <Icon
              name={i < stage ? 'check_circle' : i === stage ? 'progress_activity' : 'radio_button_unchecked'}
              className={`text-[18px] ${i < stage ? 'text-success' : i === stage ? 'animate-spin text-primary motion-reduce:animate-none' : ''}`}
            />
            {label}
          </li>
        ))}
      </ol>
    </div>
  )
}

/** A small recorder for the spoken consent sentence. */
function ConsentRecorder({ rec }: { rec: Recorder }) {
  const recording = rec.state === 'recording'
  const done = rec.state === 'done'
  const result = done ? checkConsentDuration(rec.seconds) : null
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-high/40 p-4">
      <div className="flex items-center gap-4">
        {recording ? (
          <button
            type="button"
            onClick={rec.stop}
            aria-label="Stop recording the consent"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-destructive text-white shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-destructive/40"
          >
            <Icon name="stop" className="text-[28px]!" />
          </button>
        ) : (
          <button
            type="button"
            onClick={rec.start}
            disabled={rec.state === 'starting'}
            aria-label={done ? 'Record the consent again' : 'Start recording the consent'}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-transform hover:scale-105 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40 motion-reduce:transition-none"
          >
            <Icon name="mic" className="text-[28px]!" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl font-semibold tabular-nums">{formatClock(rec.seconds)}</p>
          <p className="text-xs text-text-muted" role="status" aria-live="polite">
            {recording ? 'Recording. Tap stop when you finish the sentence.' : done ? 'Recorded.' : 'Tap the mic and read the sentence.'}
          </p>
        </div>
      </div>
      <Waveform frames={rec.frames} active={recording} />
      {rec.error && <Alert>{rec.error}</Alert>}
      {done && rec.url && (
        <div className="flex flex-col gap-2">
          <audio controls src={rec.url} className="h-10 w-full" aria-label="Play back your consent" />
          {result && !result.ok && <p className="text-xs font-semibold text-destructive">{result.message}</p>}
          <button type="button" onClick={rec.reset} className={`${ghostBtn} h-9 self-start text-xs`}>
            <Icon name="refresh" className="text-[16px]" />
            Record again
          </button>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ hear your voice

/** Type a line, pick any of the 12 languages, hear the cloned voice say it. */
function HearYourVoice({ voice }: { voice: CustomVoice }) {
  const [language, setLanguage] = useState(voice.language === 'or-IN' ? 'od-IN' : voice.language)
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle')
  const [error, setError] = useState('')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urls = useRef(new Map<string, string>())
  const langId = useId()
  const textId = useId()
  const countId = useId()
  const speaks = voice.speaksLanguages?.length ? voice.speaksLanguages : CLONE_LANGUAGES.map(([c]) => c)

  useEffect(() => {
    const map = urls.current
    const audio = audioRef.current
    return () => {
      audio?.pause()
      map.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [])

  async function play() {
    const audio = audioRef.current
    if (!audio) return
    if (state !== 'idle') {
      audio.pause()
      setState('idle')
      return
    }
    setError('')
    const line = text.trim()
    const key = `${language}\n${line}`
    let url = urls.current.get(key)
    if (!url) {
      setState('loading')
      try {
        url = URL.createObjectURL(await fetchCustomVoicePreview(voice.id, line || undefined, language))
        urls.current.set(key, url)
      } catch (e) {
        setState('idle')
        setError(e instanceof Error ? e.message : 'Could not play this voice. Try again.')
        return
      }
    }
    audio.src = url
    try {
      await audio.play()
      setState('playing')
    } catch {
      setState('idle')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={langId} className="text-sm font-bold">
          Language
        </label>
        <select
          id={langId}
          value={language}
          onChange={(e) => {
            setLanguage(e.target.value)
            setState('idle')
            audioRef.current?.pause()
          }}
          className={inputCls}
        >
          {CLONE_LANGUAGES.filter(([c]) => speaks.includes(c)).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
              {code === voice.language ? ' (recorded in)' : ''}
            </option>
          ))}
        </select>
        <p className="text-xs text-text-muted">
          Your voice speaks all {LANGUAGE_COUNT} languages, even the ones you did not record in.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={textId} className="text-sm font-bold">
          What should it say?
        </label>
        <textarea
          id={textId}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, PREVIEW_MAX_CHARS))}
          maxLength={PREVIEW_MAX_CHARS}
          rows={3}
          aria-describedby={countId}
          placeholder={`Leave it empty to hear a short hello in ${cloneLanguageLabel(language)}.`}
          className={`${inputCls} resize-none`}
        />
        <p id={countId} className="self-end text-[11px] tabular-nums text-text-muted">
          {text.length}/{PREVIEW_MAX_CHARS}
        </p>
      </div>
      <button type="button" onClick={play} className={`${primaryBtn} self-start`}>
        <Icon
          name={state === 'loading' ? 'progress_activity' : state === 'playing' ? 'pause' : 'play_arrow'}
          className={`text-[19px] ${state === 'loading' ? 'animate-spin motion-reduce:animate-none' : ''}`}
        />
        {state === 'playing' ? 'Pause' : state === 'loading' ? 'Getting audio' : 'Play'}
      </button>
      {error && <Alert>{error}</Alert>}
      <audio ref={audioRef} hidden onEnded={() => setState('idle')} onPause={() => setState((s) => (s === 'playing' ? 'idle' : s))} />
    </div>
  )
}

// ------------------------------------------------------------------ create dialog

interface UploadPick {
  file: File
  url: string
  seconds: number | null
  error: string
}

export interface CloneDraft {
  name: string
  gender: CloneGender | ''
  language: string
}

const STEPS = ['Details', 'Get ready', 'Record', 'Consent', 'Create'] as const

function StepDots({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-1.5 px-4 pt-4 sm:px-6" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
      {STEPS.map((name, i) => (
        <li key={name} className="flex min-w-0 flex-1 flex-col gap-1" aria-current={i === step ? 'step' : undefined}>
          <span className={`h-1 rounded-full ${i <= step ? 'bg-primary' : 'bg-surface-high'}`} />
          <span className={`truncate text-[10px] font-bold uppercase tracking-wide ${i === step ? 'text-primary' : 'text-text-muted'}`}>
            {name}
          </span>
        </li>
      ))}
    </ol>
  )
}

const TIPS: readonly (readonly [string, string, string])[] = [
  ['volume_off', 'Quiet room, just you', 'No music, TV or other voices in the background.'],
  ['phone_iphone', 'Phone close, not on speaker', 'Hold it about a hand away. No speakerphone.'],
  ['record_voice_over', 'Sound like your agent', 'The voice copies your pace, energy and mood, so read the way you want calls to sound.'],
  ['timer', '15 seconds is ideal', 'Longer does not make it better. One recording covers all 12 languages.'],
]

function Tips({ compact = false }: { compact?: boolean }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {TIPS.map(([icon, title, body]) => (
        <li key={title} className="flex items-start gap-3 rounded-xl bg-surface-high/60 px-3 py-2.5">
          <Icon name={icon} className="mt-0.5 text-[20px] text-primary" />
          <span className="min-w-0">
            <span className="block text-sm font-bold">{title}</span>
            {!compact && <span className="block text-xs text-text-muted">{body}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

function CloneVoiceDialog({
  initial,
  voices,
  onClose,
  onCreated,
}: {
  initial?: CloneDraft
  // The section's polled list, so the dialog can show when the new voice is ready.
  voices: CustomVoice[]
  onClose: () => void
  onCreated: (voice: CustomVoice) => void
}) {
  const [step, setStep] = useState(0)
  const [quote, setQuote] = useState<CustomVoiceQuote | null>(null)
  const [quoteError, setQuoteError] = useState('')
  const [name, setName] = useState(initial?.name ?? '')
  const [gender, setGender] = useState<CloneGender | ''>(initial?.gender ?? '')
  const [language, setLanguage] = useState<string>(initial?.language === 'or-IN' ? 'od-IN' : (initial?.language ?? 'hi-IN'))
  const recorderSupported = canRecordAudio()
  const [mode, setMode] = useState<'record' | 'upload'>(recorderSupported ? 'record' : 'upload')
  const [upload, setUpload] = useState<UploadPick | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [submitError, setSubmitError] = useState('')
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [charged, setCharged] = useState(0)
  const sample = useAudioRecorder({ maxSeconds: RECORD_AUTO_STOP_SECONDS })
  const consent = useAudioRecorder({ maxSeconds: CONSENT_MAX_SECONDS })
  const nameId = useId()
  const langId = useId()
  const langHelpId = useId()
  const genderHelpId = useId()
  const fileId = useId()
  const agreeId = useId()

  const loadQuote = useCallback(() => {
    setQuoteError('')
    fetchCustomVoiceQuote()
      .then(setQuote)
      .catch(() => setQuoteError('Could not load the price. Check your connection and try again.'))
  }, [])
  useEffect(loadQuote, [loadQuote])

  // Release the mic check when leaving the "Get ready" / "Record" steps.
  const { stopMonitor } = sample
  useEffect(() => {
    if (step !== 1 && step !== 2) stopMonitor()
  }, [step, stopMonitor])

  const uploadUrl = upload?.url
  useEffect(
    () => () => {
      if (uploadUrl) URL.revokeObjectURL(uploadUrl)
    },
    [uploadUrl],
  )

  function pickFile(file: File | undefined) {
    if (!file) return
    const error = checkUploadFile(file)
    const url = URL.createObjectURL(file)
    setUpload({ file, url, seconds: null, error })
    if (error) return
    // Read the length from the file itself. Some webm files report Infinity; then the server decides.
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      const secs = Number.isFinite(audio.duration) ? audio.duration : null
      setUpload((u) => (u && u.file === file ? { ...u, seconds: secs } : u))
    }
    audio.onerror = () =>
      setUpload((u) => (u && u.file === file ? { ...u, error: 'This file could not be read as audio. Try another file.' } : u))
    audio.src = url
  }

  const recorded = mode === 'record' && sample.state === 'done' && !!sample.blob
  const sampleCheck = recorded
    ? checkRecordedSample(sample.seconds, talkSeconds(sample.frames, sample.seconds))
    : mode === 'upload' && upload && !upload.error && upload.seconds !== null
      ? checkSampleDuration(upload.seconds, 'upload')
      : null
  const sampleReady =
    mode === 'record'
      ? recorded && !!sampleCheck?.ok
      : !!upload && !upload.error && (upload.seconds === null || !!sampleCheck?.ok)
  const consentReady = consent.state === 'done' && !!consent.blob && checkConsentDuration(consent.seconds).ok
  const blocked = !!quote && !quote.canCreate
  const detailsReady = name.trim().length > 0 && !!gender && !blocked
  const busyRecording = sample.state === 'recording' || consent.state === 'recording'
  const canNext = [detailsReady, true, sampleReady, consentReady && agreed, false][step] && !busyRecording

  async function submit() {
    if (submitting || !gender) return
    const sampleBlob = mode === 'record' ? sample.blob : upload?.file
    if (!sampleBlob || !consent.blob) return
    setSubmitting(true)
    setSubmitError('')
    setProgress(0)
    try {
      const voice = await createCustomVoice(
        {
          name: name.trim(),
          language,
          gender,
          source: mode,
          sample: sampleBlob,
          sampleName: mode === 'record' ? `sample.${extensionForMime(sample.blob?.type ?? '')}` : (upload?.file.name ?? 'sample'),
          consent: consent.blob,
          consentName: `consent.${extensionForMime(consent.blob.type)}`,
        },
        setProgress,
      )
      setCharged(voice.creditsCharged)
      setCreatedId(voice.id)
      onCreated(voice)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Could not create the voice. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ---- after create: getting ready, then "Hear your voice"
  if (createdId) {
    const voice = voices.find((v) => v.id === createdId)
    const status = voice?.status ?? 'processing'
    return (
      <Dialog title={status === 'ready' ? 'Hear your voice' : 'Clone your voice'} onClose={onClose} wide>
        <div className="flex flex-col gap-4 px-4 py-6 sm:px-6">
          {status === 'processing' && (
            <div className="flex flex-col items-center gap-3 py-6 text-center" role="status" aria-live="polite">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon name="progress_activity" className="animate-spin text-[30px]! motion-reduce:animate-none" />
              </span>
              <p className="font-display text-lg font-semibold">Making your voice</p>
              <p className="max-w-sm text-sm text-text-muted">
                This usually takes under a minute. You can close this window. It will show as Ready under Your voices.
                {charged > 0 && ` ${fmtCredits(charged)} credits were used.`}
              </p>
              <div className="h-1.5 w-48 overflow-hidden rounded-full bg-surface-high" aria-hidden="true">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
              </div>
            </div>
          )}
          {status === 'failed' && voice && (
            <div className="flex flex-col gap-3">
              <Alert>{voice.error || 'We couldn’t create this voice. Please try again with a clearer recording.'}</Alert>
              <button
                type="button"
                onClick={() => {
                  setCreatedId(null)
                  sample.reset()
                  setUpload(null)
                  loadQuote()
                  setStep(2)
                }}
                className={`${primaryBtn} self-start`}
              >
                <Icon name="refresh" className="text-[18px]" />
                Try again
              </button>
            </div>
          )}
          {status === 'ready' && voice && (
            <>
              <div className="flex items-center gap-3">
                <Avatar name={voice.name} />
                <div className="min-w-0">
                  <p className="truncate font-display text-lg font-semibold">{voice.name} is ready</p>
                  <p className="text-sm text-text-muted">Pick it on any agent. Here is how it sounds.</p>
                </div>
              </div>
              <HearYourVoice voice={voice} />
            </>
          )}
          <div className="flex justify-end border-t border-border pt-3">
            <button type="button" onClick={onClose} className={status === 'ready' ? primaryBtn : ghostBtn}>
              Done
            </button>
          </div>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog title="Clone your voice" onClose={onClose} wide closable={!submitting}>
      <StepDots step={step} />
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-6">
        {step === 0 && (
          <>
            {quoteError && (
              <Alert>
                <span className="flex flex-wrap items-center gap-3">
                  {quoteError}
                  <button type="button" onClick={loadQuote} className={linkBtn}>
                    Try again
                  </button>
                </span>
              </Alert>
            )}
            {blocked && quote && (
              <Alert tone="warn">
                <span className="flex flex-col gap-1">
                  <span className="font-semibold">{quote.reason || 'You cannot create a voice right now.'}</span>
                  <Link to={BILLING_PATH} className={linkBtn}>
                    Open Plan &amp; billing
                  </Link>
                </span>
              </Alert>
            )}
            <div className="flex flex-col gap-1.5">
              <label htmlFor={nameId} className="text-sm font-bold">
                Voice name
              </label>
              <input
                id={nameId}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={VOICE_NAME_MAX}
                placeholder="For example, Priya from sales"
                className={inputCls}
                autoComplete="off"
                autoFocus
              />
              <p className="text-xs text-text-muted">Only your team sees this. It shows in the agent voice picker.</p>
            </div>
            <fieldset className="flex flex-col gap-1.5" aria-describedby={genderHelpId}>
              <legend className="mb-1.5 text-sm font-bold">Speaker</legend>
              <div className="grid grid-cols-2 gap-2">
                {CLONE_GENDERS.map(([key, label]) => (
                  <label
                    key={key}
                    className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors focus-within:ring-2 focus-within:ring-primary/40 ${
                      gender === key ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-muted hover:border-primary'
                    }`}
                  >
                    <input
                      type="radio"
                      name="clone-gender"
                      value={key}
                      checked={gender === key}
                      onChange={() => setGender(key)}
                      className="sr-only"
                      required
                    />
                    {label}
                  </label>
                ))}
              </div>
              <p id={genderHelpId} className="text-xs text-text-muted">
                So your agent gets the grammar right in Hindi and other languages, like “main aa raha hoon” or “main aa rahi hoon”.
              </p>
            </fieldset>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={langId} className="text-sm font-bold">
                Language you will speak in the recording
              </label>
              <select
                id={langId}
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                aria-describedby={langHelpId}
                className={inputCls}
              >
                {CLONE_LANGUAGES.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
              <p id={langHelpId} className="text-xs text-text-muted">
                Pick the one you are most comfortable in. Your voice will speak all {LANGUAGE_COUNT} languages on calls.
              </p>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div>
              <p className="font-display text-lg font-semibold">Before you record</p>
              <p className="mt-1 text-sm text-text-muted">Four things make the biggest difference.</p>
            </div>
            <Tips />
            {recorderSupported ? (
              <MicCheck rec={sample} />
            ) : (
              <Alert tone="warn">This browser cannot record audio here. You can upload a recording on the next step.</Alert>
            )}
            {recorderSupported && (
              <button
                type="button"
                onClick={() => {
                  setMode('upload')
                  setStep(2)
                }}
                className={`${linkBtn} self-start`}
              >
                <Icon name="upload_file" className="text-[17px]" />
                I have a recording to upload instead
              </button>
            )}
          </>
        )}

        {step === 2 && (
          <>
            {recorderSupported && (
              <div role="tablist" aria-label="How to add your voice" className="flex w-full gap-1 rounded-xl border border-border bg-surface p-1 sm:w-fit">
                {(
                  [
                    ['record', 'Record now', 'mic'],
                    ['upload', 'Upload a file', 'upload_file'],
                  ] as const
                ).map(([key, label, icon]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={mode === key}
                    disabled={busyRecording}
                    onClick={() => setMode(key)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition-colors sm:flex-none ${
                      mode === key ? 'bg-primary text-white' : 'bg-transparent text-text-muted hover:text-text'
                    }`}
                  >
                    <Icon name={icon} className="text-[17px]" />
                    {label}
                  </button>
                ))}
              </div>
            )}

            {mode === 'record' && recorderSupported && (
              <>
                <SampleRecorder rec={sample} language={language} />
                {sample.error && (
                  <button type="button" onClick={() => setMode('upload')} className={`${ghostBtn} self-start`}>
                    <Icon name="upload_file" className="text-[17px]" />
                    Upload a file instead
                  </button>
                )}
              </>
            )}

            {mode === 'upload' && (
              <div className="flex flex-col gap-3">
                <Tips compact />
                <label
                  htmlFor={fileId}
                  className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border bg-surface-high/40 px-4 py-8 text-center transition-colors hover:border-primary focus-within:border-primary"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    pickFile(e.dataTransfer.files?.[0])
                  }}
                >
                  <Icon name="upload" className="text-[30px]! text-primary" />
                  <span className="text-sm font-bold">{upload ? 'Pick a different file' : 'Choose an audio file'}</span>
                  <span className="text-xs text-text-muted">
                    Just you, speaking {cloneLanguageLabel(language)}. At least {SAMPLE_MIN_SECONDS} seconds, up to 5 minutes. WAV, MP3, M4A,
                    WEBM, OGG or FLAC, up to 20 MB.
                  </span>
                  <input
                    id={fileId}
                    type="file"
                    accept={UPLOAD_ACCEPT}
                    className="sr-only"
                    onChange={(e) => {
                      pickFile(e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                </label>
                {upload && (
                  <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3" aria-live="polite">
                    <p className="truncate text-sm font-bold">{upload.file.name}</p>
                    <p className="text-xs text-text-muted">
                      {(upload.file.size / (1024 * 1024)).toFixed(1)} MB
                      {upload.seconds !== null && ` · ${formatClock(upload.seconds)}`}
                    </p>
                    {upload.error ? (
                      <p role="alert" className="text-xs font-semibold text-destructive">
                        {upload.error}
                      </p>
                    ) : (
                      <>
                        <audio controls src={upload.url} className="h-10 w-full" aria-label="Play the uploaded file" />
                        {sampleCheck && (
                          <p className={`text-xs font-semibold ${sampleCheck.ok ? 'text-success' : 'text-destructive'}`}>{sampleCheck.message}</p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {step === 3 && quote && (
          <>
            <div>
              <p className="font-display text-lg font-semibold">Confirm it is your voice</p>
              <p className="mt-1 text-sm text-text-muted">
                Read this sentence out loud. The same person must speak here and in the recording.
              </p>
            </div>
            <blockquote className="rounded-2xl border-l-4 border-primary bg-primary/[0.06] px-4 py-3 font-display text-[15px] leading-relaxed">
              {quote.consentSentence}
            </blockquote>
            {recorderSupported ? (
              <ConsentRecorder rec={consent} />
            ) : (
              <Alert tone="warn">
                This browser cannot record audio, and the consent has to be spoken live. Please open this page in a recent Chrome, Edge,
                Firefox or Safari.
              </Alert>
            )}
            <label htmlFor={agreeId} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border px-4 py-3 text-sm">
              <input
                id={agreeId}
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary)]"
              />
              <span>This is my voice, or I have written permission from the speaker.</span>
            </label>
          </>
        )}
        {step === 3 && !quote && (
          <Alert>
            <span className="flex flex-wrap items-center gap-3">
              {quoteError || 'Loading the consent sentence.'}
              {quoteError && (
                <button type="button" onClick={loadQuote} className={linkBtn}>
                  Try again
                </button>
              )}
            </span>
          </Alert>
        )}

        {step === 4 && quote && (
          <>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              {(
                [
                  ['Name', name.trim()],
                  ['Speaker', gender ? genderLabel(gender) : ''],
                  ['Recorded in', cloneLanguageLabel(language)],
                  [
                    mode === 'record' ? 'Recording' : 'Uploaded file',
                    mode === 'record' ? formatClock(sample.seconds) : upload?.seconds != null ? formatClock(upload.seconds) : upload?.file.name ?? '',
                  ],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="rounded-xl bg-surface-high px-3 py-2.5">
                  <dt className="text-[11px] font-bold text-text-muted">{k}</dt>
                  <dd className="truncate font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="rounded-xl border border-border px-4 py-3 text-sm">
              <p className="font-semibold">
                {quote.firstCloneFree || quote.setupCredits <= 0
                  ? `${FREE_LINE} No credits are taken now.`
                  : `${fmtCredits(quote.setupCredits)} credits are taken from your balance of ${fmtCredits(quote.balance)} when you create it.`}
              </p>
              <p className="mt-1 text-text-muted">
                {callPriceLine(quote)} It speaks all {LANGUAGE_COUNT} languages.
              </p>
            </div>
            {submitting && <CreatingProgress progress={progress} />}
            {submitError && <Alert>{submitError}</Alert>}
            {submitError && blocked && (
              <Link to={BILLING_PATH} className={linkBtn}>
                Open Plan &amp; billing
              </Link>
            )}
          </>
        )}
      </div>

      <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-border bg-surface px-4 py-3 sm:px-6">
        {step > 0 ? (
          <button type="button" onClick={() => setStep((s) => s - 1)} disabled={submitting || busyRecording} className={ghostBtn}>
            <Icon name="arrow_back" className="text-[17px]" />
            Back
          </button>
        ) : (
          <button type="button" onClick={onClose} className={ghostBtn}>
            Cancel
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button type="button" onClick={() => setStep((s) => s + 1)} disabled={!canNext} className={primaryBtn}>
            {step === 1 ? 'I’m ready' : 'Next'}
            <Icon name="arrow_forward" className="text-[17px]" />
          </button>
        ) : (
          <button type="button" onClick={submit} disabled={submitting || !quote || blocked} className={primaryBtn}>
            {submitting && <Icon name="progress_activity" className="animate-spin text-[17px] motion-reduce:animate-none" />}
            {createLabel(quote)}
          </button>
        )}
      </div>
    </Dialog>
  )
}

// ------------------------------------------------------------------ your voices

function VoiceCard({
  voice,
  playing,
  loading,
  onPreview,
  onTry,
  onRetry,
  onRenamed,
  onDelete,
}: {
  voice: CustomVoice
  playing: boolean
  loading: boolean
  onPreview: () => void
  onTry: () => void
  onRetry: () => void
  onRenamed: (v: CustomVoice) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(voice.name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const inputId = useId()
  const gender = genderLabel(voice.gender)

  function cancel() {
    setEditing(false)
    setDraft(voice.name)
    setError('')
  }

  async function save() {
    const next = draft.trim()
    if (!next || next === voice.name) {
      cancel()
      return
    }
    setSaving(true)
    setError('')
    try {
      onRenamed(await renameCustomVoice(voice.id, next))
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not rename this voice.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <Avatar name={voice.name} />
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-1.5">
              <label htmlFor={inputId} className="sr-only">
                New name for {voice.name}
              </label>
              <input
                id={inputId}
                value={draft}
                maxLength={VOICE_NAME_MAX}
                autoFocus
                onFocus={(e) => e.target.select()}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save()
                  if (e.key === 'Escape') cancel()
                }}
                className="min-w-0 flex-1 rounded-lg border border-primary bg-surface-high px-2 py-1 text-sm font-bold outline-none"
              />
              <button type="button" onClick={save} disabled={saving} aria-label="Save name" className={`${iconBtn} text-success`}>
                <Icon name={saving ? 'progress_activity' : 'check'} className={`text-[18px] ${saving ? 'animate-spin' : ''}`} />
              </button>
              <button type="button" onClick={cancel} aria-label="Cancel rename" className={iconBtn}>
                <Icon name="close" className="text-[18px]" />
              </button>
            </div>
          ) : (
            <p className="truncate text-sm font-bold">{voice.name}</p>
          )}
          <p className="mt-0.5 text-xs text-text-muted">
            {gender && `${gender} · `}Recorded in {cloneLanguageLabel(voice.language)}
          </p>
          <div className="mt-1.5">
            <StatusBadge status={voice.status} />
          </div>
        </div>
        {voice.status === 'ready' && (
          <button
            type="button"
            onClick={onPreview}
            aria-label={playing ? `Pause ${voice.name}` : `Play ${voice.name}`}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
              playing ? 'border-primary bg-primary text-white' : 'border-border bg-surface text-primary hover:border-primary'
            }`}
          >
            <Icon
              name={loading ? 'progress_activity' : playing ? 'pause' : 'play_arrow'}
              className={`text-[20px] ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`}
            />
          </button>
        )}
      </div>

      {voice.status === 'processing' && <p className="text-xs text-text-muted">Usually ready in about a minute.</p>}
      {voice.status === 'failed' && (
        <div className="flex flex-col gap-2 rounded-xl bg-destructive/[0.06] px-3 py-2">
          <p className="text-xs text-text">{voice.error || 'We couldn’t create this voice. Please try again with a clearer recording.'}</p>
          <button type="button" onClick={onRetry} className={`${linkBtn} self-start text-xs`}>
            <Icon name="refresh" className="text-[15px]" />
            Try again
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1 border-t border-border/60 pt-2">
        {voice.status === 'ready' && (
          <button type="button" onClick={onTry} className={`${linkBtn} mr-auto text-xs`}>
            <Icon name="translate" className="text-[16px]" />
            Try it in {LANGUAGE_COUNT} languages
          </button>
        )}
        <span className={voice.status === 'ready' ? '' : 'mr-auto'} />
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(voice.name)
              setEditing(true)
            }}
            aria-label={`Rename ${voice.name}`}
            className={iconBtn}
          >
            <Icon name="edit" className="text-[18px]" />
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${voice.name}`}
          className={`${iconBtn} hover:bg-destructive/10 hover:text-destructive`}
        >
          <Icon name="delete" className="text-[18px]" />
        </button>
      </div>
    </li>
  )
}

function DeleteDialog({ voice, onClose, onDeleted }: { voice: CustomVoice; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function confirm() {
    setBusy(true)
    setError('')
    try {
      await deleteCustomVoice(voice.id)
      onDeleted()
    } catch (e) {
      // A 409 explains why (for example, the agents still using it).
      setError(e instanceof Error ? e.message : 'Could not delete this voice.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog title={`Delete ${voice.name}?`} onClose={onClose} closable={!busy}>
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <p className="text-sm text-text-muted">
          The voice is removed for good and cannot be brought back. Any agent using it needs a different voice first.
        </p>
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={ghostBtn}>
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-destructive px-5 text-sm font-extrabold text-white transition hover:brightness-105 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
          >
            {busy && <Icon name="progress_activity" className="animate-spin text-[17px]" />}
            Delete voice
          </button>
        </div>
      </div>
    </Dialog>
  )
}

/** "Clone your voice" on the Voices page: the hero, the customer's own cloned
 * voices, and the guided dialog that makes a new one. */
export function CloneVoiceSection() {
  const [voices, setVoices] = useState<CustomVoice[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [quote, setQuote] = useState<CustomVoiceQuote | null>(null)
  // null = closed; otherwise the dialog's starting values (a retry pre-fills them).
  const [creating, setCreating] = useState<CloneDraft | null>(null)
  const [dialogKey, setDialogKey] = useState(0)
  const [trying, setTrying] = useState<CustomVoice | null>(null)
  const [deleting, setDeleting] = useState<CustomVoice | null>(null)
  const [tick, setTick] = useState(0)
  const [pollStopped, setPollStopped] = useState(false)
  const pollStart = useRef<number | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'playing'>('idle')
  const [previewError, setPreviewError] = useState('')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urls = useRef(new Map<string, string>())

  const load = useCallback(async () => {
    try {
      setVoices(await fetchCustomVoices())
      setLoadError('')
    } catch {
      setLoadError('Could not load your voices.')
      setVoices((v) => v ?? [])
    }
  }, [])
  const loadQuote = useCallback(() => {
    fetchCustomVoiceQuote()
      .then(setQuote)
      .catch(() => setQuote(null))
  }, [])

  useEffect(() => {
    load()
    loadQuote()
  }, [load, loadQuote])

  // While a voice is being made, check every 3 s for up to 3 minutes.
  const anyProcessing = !!voices?.some((v) => v.status === 'processing')
  useEffect(() => {
    if (!anyProcessing) {
      pollStart.current = null
      setPollStopped(false)
      return
    }
    if (pollStart.current === null) pollStart.current = Date.now()
    if (Date.now() - pollStart.current > POLL_LIMIT_MS) {
      setPollStopped(true)
      return
    }
    const t = window.setTimeout(async () => {
      await load()
      setTick((n) => n + 1)
    }, POLL_MS)
    return () => window.clearTimeout(t)
  }, [anyProcessing, tick, load])

  useEffect(() => {
    const map = urls.current
    const audio = audioRef.current
    return () => {
      audio?.pause()
      map.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [])

  async function preview(voice: CustomVoice) {
    const audio = audioRef.current
    if (!audio) return
    if (previewId === voice.id && previewState !== 'idle') {
      audio.pause()
      setPreviewState('idle')
      return
    }
    audio.pause()
    setPreviewError('')
    setPreviewId(voice.id)
    let url = urls.current.get(voice.id)
    if (!url) {
      setPreviewState('loading')
      try {
        url = URL.createObjectURL(await fetchCustomVoicePreview(voice.id))
        urls.current.set(voice.id, url)
      } catch (e) {
        setPreviewState('idle')
        setPreviewError(e instanceof Error ? e.message : 'Could not play this voice.')
        return
      }
    }
    audio.src = url
    try {
      await audio.play()
      setPreviewState('playing')
    } catch {
      setPreviewState('idle')
    }
  }

  function openCreate(draft: CloneDraft = { name: '', gender: '', language: 'hi-IN' }) {
    audioRef.current?.pause()
    setDialogKey((k) => k + 1)
    setCreating(draft)
  }

  const list = voices ?? []
  const ready = list.filter((v) => v.status === 'ready')
  const blocked = !!quote && !quote.canCreate

  return (
    <section aria-labelledby="clone-voice-heading" className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="flex flex-col gap-4 bg-[radial-gradient(120%_140%_at_0%_0%,color-mix(in_srgb,var(--color-magenta)_16%,transparent),transparent_60%)] p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon name="record_voice_over" className="text-[28px]!" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="clone-voice-heading" className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
            Your voice, on every call
          </h2>
          <p className="mt-1 text-sm text-text sm:text-[15px]">
            Record 15 seconds. Your agent speaks in your voice in {LANGUAGE_COUNT} Indian languages.
          </p>
          {quote && (
            <p className="mt-1.5 text-xs text-text-muted">
              <span className={quote.firstCloneFree ? 'font-semibold text-success' : 'font-semibold text-text'}>{setupLine(quote)}</span>{' '}
              {callPriceLine(quote)}
              {quote.limit > 0 && ` ${quote.used} of ${quote.limit} voices used.`}
            </p>
          )}
          {blocked && quote && (
            <p className="mt-2 text-xs font-semibold text-amber">
              {quote.reason}{' '}
              <Link to={BILLING_PATH} className="text-primary hover:underline">
                Open Plan &amp; billing
              </Link>
            </p>
          )}
        </div>
        <button type="button" onClick={() => openCreate()} disabled={blocked} className={`${primaryBtn} w-full shrink-0 sm:w-auto`}>
          <Icon name="mic" className="text-[18px]" />
          Clone your voice
        </button>
      </div>

      {ready.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-border/60 px-5 py-3 sm:px-6" aria-label="Play your voices">
          {ready.map((v) => {
            const playing = previewId === v.id && previewState === 'playing'
            const loading = previewId === v.id && previewState === 'loading'
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => preview(v)}
                aria-label={playing ? `Pause ${v.name}` : `Play ${v.name}`}
                className={`inline-flex max-w-full items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  playing ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-surface hover:border-primary'
                }`}
              >
                <Avatar name={v.name} size="sm" />
                <span className="truncate">{v.name}</span>
                <Icon
                  name={loading ? 'progress_activity' : playing ? 'pause' : 'play_arrow'}
                  className={`text-[16px] text-primary ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`}
                />
              </button>
            )
          })}
        </div>
      )}

      {(list.length > 0 || loadError) && (
        <div className="border-t border-border bg-surface-high/20 px-4 py-4 sm:px-6">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-text-muted">Your voices</h3>
            <p className="text-[11px] text-text-muted">Ready voices show up in the agent voice picker on their own.</p>
          </div>
          {loadError && <Alert>{loadError}</Alert>}
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((v) => (
              <VoiceCard
                key={v.id}
                voice={v}
                playing={previewId === v.id && previewState === 'playing'}
                loading={previewId === v.id && previewState === 'loading'}
                onPreview={() => preview(v)}
                onTry={() => {
                  audioRef.current?.pause()
                  setTrying(v)
                }}
                onRetry={() => openCreate({ name: v.name, gender: v.gender ?? '', language: v.language })}
                onRenamed={(next) => setVoices((all) => (all ?? []).map((x) => (x.id === next.id ? { ...x, ...next } : x)))}
                onDelete={() => setDeleting(v)}
              />
            ))}
          </ul>
          {previewError && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {previewError}
            </p>
          )}
          {pollStopped && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
              Still getting ready. This can take a few more minutes.
              <button
                type="button"
                onClick={() => {
                  pollStart.current = Date.now()
                  setPollStopped(false)
                  setTick((n) => n + 1)
                }}
                className="font-bold text-primary hover:underline"
              >
                Check again
              </button>
            </p>
          )}
        </div>
      )}

      <audio ref={audioRef} hidden onEnded={() => setPreviewState('idle')} onPause={() => setPreviewState((s) => (s === 'playing' ? 'idle' : s))} />

      {creating && (
        <CloneVoiceDialog
          key={dialogKey}
          initial={creating}
          voices={list}
          onClose={() => setCreating(null)}
          onCreated={(voice) => {
            setVoices((all) => [voice, ...(all ?? []).filter((x) => x.id !== voice.id)])
            pollStart.current = null
            setTick((n) => n + 1)
            loadQuote()
          }}
        />
      )}
      {trying && (
        <Dialog title={`Hear ${trying.name}`} onClose={() => setTrying(null)} wide>
          <div className="px-4 py-5 sm:px-6">
            <HearYourVoice voice={trying} />
          </div>
        </Dialog>
      )}
      {deleting && (
        <DeleteDialog
          voice={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setVoices((all) => (all ?? []).filter((x) => x.id !== deleting.id))
            setDeleting(null)
            loadQuote()
          }}
        />
      )}
    </section>
  )
}
