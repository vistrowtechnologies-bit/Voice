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
  CLONE_LANGUAGES,
  CONSENT_MAX_SECONDS,
  SAMPLE_GOOD_MAX_SECONDS,
  SAMPLE_GOOD_SECONDS,
  SAMPLE_MAX_SECONDS,
  SAMPLE_MIN_SECONDS,
  UPLOAD_ACCEPT,
  checkConsentDuration,
  checkSampleDuration,
  checkUploadFile,
  cloneLanguageLabel,
  extensionForMime,
  formatClock,
} from '../lib/voiceClone'

const BILLING_PATH = '/dashboard/settings?tab=billing'
const POLL_MS = 3000
const POLL_LIMIT_MS = 3 * 60 * 1000

const fmtCredits = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
const perMinute = (n: number) => `${fmtCredits(n)} credits/min`
// Cloned voices bill at the normal Bharat voice rate; say so instead of a bare number.
const callPrice = (n: number) => `Same price as Bharat voices (${perMinute(n)})`
const FREE_LINE = 'Your first cloned voice is included in your plan'
const createLabel = (q: CustomVoiceQuote | null) =>
  !q || q.firstCloneFree || q.setupCredits <= 0 ? 'Create voice' : `Create voice for ${fmtCredits(q.setupCredits)} credits`

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
  failed: { label: 'Failed', cls: 'bg-destructive/10 text-destructive' },
}

function StatusBadge({ status }: { status: CustomVoice['status'] }) {
  const s = STATUS[status] ?? STATUS.processing
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${s.cls}`}>
      {status === 'processing' && <Icon name="progress_activity" className="animate-spin text-[12px]" />}
      {s.label}
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
const inputCls =
  'w-full rounded-xl border border-border bg-surface-high px-3 py-2.5 text-sm outline-none focus:border-primary'

// ------------------------------------------------------------------ recorder UI

function LevelMeter({ level, active }: { level: number; active: boolean }) {
  const bars = 16
  const lit = Math.round(level * bars)
  return (
    <div className="flex h-6 items-end gap-[3px]" aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className={`w-[5px] rounded-full transition-[height,background-color] duration-100 ${
            active && i < lit ? (i > bars * 0.85 ? 'bg-amber' : 'bg-primary') : 'bg-surface-high'
          }`}
          style={{ height: `${30 + (i / bars) * 70}%` }}
        />
      ))}
    </div>
  )
}

type Recorder = ReturnType<typeof useAudioRecorder>

/** Record button, timer, level meter, playback and re-record for one recording. */
function RecorderPanel({
  rec,
  maxSeconds,
  label,
  check,
  showTarget,
}: {
  rec: Recorder
  maxSeconds: number
  // What is being recorded, for labels: "voice sample" / "consent".
  label: string
  check: (seconds: number) => { ok: boolean; message: string; level: string }
  // Draw the 30 s minimum and 60-90 s sweet spot on the progress bar.
  showTarget?: boolean
}) {
  const recording = rec.state === 'recording'
  const done = rec.state === 'done'
  const result = done ? check(rec.seconds) : null
  const pct = Math.min(100, (rec.seconds / maxSeconds) * 100)
  const liveText = recording
    ? `Recording ${label}.`
    : done
      ? `Recording stopped. ${formatClock(rec.seconds)} recorded. ${result?.message ?? ''}`
      : rec.state === 'starting'
        ? 'Asking for the microphone.'
        : ''

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-high/40 p-4">
      <div className="flex flex-wrap items-center gap-4">
        {recording ? (
          <button
            type="button"
            onClick={rec.stop}
            aria-label={`Stop recording ${label}`}
            className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-destructive text-white shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <span className="absolute -inset-1.5 animate-ping rounded-full border-2 border-destructive/40 motion-reduce:animate-none" aria-hidden="true" />
            <Icon name="stop" className="text-[28px]" />
          </button>
        ) : (
          <button
            type="button"
            onClick={rec.start}
            disabled={rec.state === 'starting'}
            aria-label={done ? `Record ${label} again` : `Start recording ${label}`}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-[0_10px_28px_-8px_var(--color-primary)] transition-transform hover:scale-105 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <Icon
              name={rec.state === 'starting' ? 'progress_activity' : 'mic'}
              className={`text-[28px] ${rec.state === 'starting' ? 'animate-spin' : ''}`}
            />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl font-semibold tabular-nums">
            {formatClock(rec.seconds)}
            <span className="text-sm font-medium text-text-muted"> / {formatClock(maxSeconds)}</span>
          </p>
          <p className="text-xs text-text-muted">
            {recording ? 'Recording. Tap stop when you finish.' : done ? 'Recorded.' : 'Tap the mic to start.'}
          </p>
        </div>
        <LevelMeter level={rec.level} active={recording} />
      </div>

      <div className="relative h-2 overflow-hidden rounded-full bg-surface-high" aria-hidden="true">
        {showTarget && (
          <span
            className="absolute inset-y-0 bg-success/25"
            style={{
              left: `${(SAMPLE_GOOD_SECONDS / maxSeconds) * 100}%`,
              width: `${((SAMPLE_GOOD_MAX_SECONDS - SAMPLE_GOOD_SECONDS) / maxSeconds) * 100}%`,
            }}
          />
        )}
        <span
          className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-100 ${recording ? 'bg-destructive' : 'bg-primary'}`}
          style={{ width: `${pct}%` }}
        />
        {showTarget && (
          <span className="absolute inset-y-0 w-0.5 bg-text/50" style={{ left: `${(SAMPLE_MIN_SECONDS / maxSeconds) * 100}%` }} />
        )}
      </div>
      {showTarget && (
        <p className="text-[11px] text-text-muted">
          At least {SAMPLE_MIN_SECONDS} seconds. 60 to 90 seconds works best (green). Stops at {formatClock(maxSeconds)}.
        </p>
      )}

      <p className="sr-only" aria-live="polite" role="status">
        {liveText}
      </p>

      {rec.error && (
        <p role="alert" className="rounded-lg border-l-[3px] border-destructive bg-surface px-3 py-2 text-sm">
          {rec.error}
        </p>
      )}

      {done && rec.url && (
        <div className="flex flex-col gap-2">
          <audio controls src={rec.url} className="h-10 w-full" aria-label={`Play back your ${label}`} />
          {result && (
            <p className={`text-xs font-semibold ${result.ok ? 'text-success' : 'text-destructive'}`}>{result.message || 'Sounds good.'}</p>
          )}
          <button type="button" onClick={rec.reset} className={`${ghostBtn} h-9 self-start text-xs`}>
            <Icon name="refresh" className="text-[16px]" />
            Record again
          </button>
        </div>
      )}
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

const STEPS = ['Price', 'Name', 'Sample', 'Consent', 'Create'] as const

function StepDots({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-1.5 px-4 pt-4 sm:px-6" aria-label="Steps">
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

function Stat({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-surface-high px-3 py-3">
      <p className={`font-display text-lg font-semibold ${tone}`}>{value}</p>
      <p className="text-[11px] font-bold text-text-muted">{label}</p>
    </div>
  )
}

function CloneVoiceDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (voice: CustomVoice) => void
}) {
  const [step, setStep] = useState(0)
  const [quote, setQuote] = useState<CustomVoiceQuote | null>(null)
  const [quoteError, setQuoteError] = useState('')
  const [name, setName] = useState('')
  const [language, setLanguage] = useState<string>('hi-IN')
  const recorderSupported = canRecordAudio()
  const [mode, setMode] = useState<'record' | 'upload'>(recorderSupported ? 'record' : 'upload')
  const [scriptLang, setScriptLang] = useState<'en' | 'hi'>('hi')
  const [upload, setUpload] = useState<UploadPick | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [submitError, setSubmitError] = useState('')
  const [created, setCreated] = useState<(CustomVoice & { creditsCharged: number }) | null>(null)
  const sample = useAudioRecorder({ maxSeconds: SAMPLE_MAX_SECONDS })
  const consent = useAudioRecorder({ maxSeconds: CONSENT_MAX_SECONDS })
  const fileRef = useRef<HTMLInputElement | null>(null)
  const nameId = useId()
  const langId = useId()
  const fileId = useId()
  const agreeId = useId()

  const loadQuote = useCallback(() => {
    setQuoteError('')
    fetchCustomVoiceQuote()
      .then(setQuote)
      .catch(() => setQuoteError('Could not load the price. Check your connection and try again.'))
  }, [])
  useEffect(loadQuote, [loadQuote])

  // Read the script in the language the voice is for, when there is a Hindi script.
  useEffect(() => {
    setScriptLang(language === 'hi-IN' ? 'hi' : 'en')
  }, [language])

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

  const sampleFromRecorder = mode === 'record' && sample.state === 'done' && sample.blob
  const sampleCheck = sampleFromRecorder
    ? checkSampleDuration(sample.seconds)
    : upload && !upload.error && upload.seconds !== null
      ? checkSampleDuration(upload.seconds)
      : null
  const sampleReady =
    mode === 'record' ? !!sampleFromRecorder && !!sampleCheck?.ok : !!upload && !upload.error && (upload.seconds === null || !!sampleCheck?.ok)
  const consentReady = consent.state === 'done' && !!consent.blob && checkConsentDuration(consent.seconds).ok
  const canCreate = !!quote?.canCreate
  const sampleSeconds = mode === 'record' ? sample.seconds : upload?.seconds ?? null

  const canNext = [canCreate, name.trim().length > 0, sampleReady, consentReady && agreed, false][step]

  async function submit() {
    if (!quote || submitting) return
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
          sample: sampleBlob,
          sampleName: mode === 'record' ? `sample.${extensionForMime(sample.blob?.type ?? '')}` : (upload?.file.name ?? 'sample'),
          consent: consent.blob,
          consentName: `consent.${extensionForMime(consent.blob.type)}`,
        },
        setProgress,
      )
      setCreated(voice)
      onCreated(voice)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Could not create the voice. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const script = quote ? (scriptLang === 'hi' && quote.scriptHi ? quote.scriptHi : quote.script) : ''

  if (created) {
    return (
      <Dialog title="Clone your voice" onClose={onClose}>
        <div className="flex flex-col items-center gap-3 px-6 py-10 text-center" role="status">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
            <Icon name="check_circle" className="text-[32px]" />
          </span>
          <p className="font-display text-lg font-semibold">{created.name} is being made</p>
          <p className="max-w-sm text-sm text-text-muted">
            This usually takes a minute or two. It shows as Ready under Your voices, and then you can pick it on any agent.
            {created.creditsCharged > 0 && ` ${fmtCredits(created.creditsCharged)} credits were used.`}
          </p>
          <button type="button" onClick={onClose} className={`${primaryBtn} mt-2`}>
            Done
          </button>
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
            <div>
              <p className="font-display text-lg font-semibold">Give your agents your own voice</p>
              <p className="mt-1 text-sm text-text-muted">
                Record about a minute of yourself reading a short script. We make a voice from it that your agents can use on calls.
              </p>
            </div>
            {!quote && !quoteError && (
              <div className="grid animate-pulse grid-cols-2 gap-2" aria-hidden="true">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="h-[68px] rounded-xl bg-surface-high" />
                ))}
              </div>
            )}
            {quoteError && (
              <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border-l-[3px] border-destructive bg-surface-high px-3 py-2 text-sm">
                {quoteError}
                <button type="button" onClick={loadQuote} className="font-bold text-primary hover:underline">
                  Try again
                </button>
              </div>
            )}
            {quote && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Stat
                    label="One-time setup"
                    value={quote.firstCloneFree ? 'Included' : `${fmtCredits(quote.setupCredits)} credits`}
                    tone={quote.firstCloneFree ? 'text-success' : ''}
                  />
                  <Stat label="On calls, same price as Bharat voices" value={perMinute(quote.creditsPerMinute)} />
                  <Stat label="Voices used" value={`${quote.used} of ${quote.limit}`} />
                  <Stat
                    label="Your balance"
                    value={`${fmtCredits(quote.balance)} credits`}
                    tone={!quote.firstCloneFree && quote.balance < quote.setupCredits ? 'text-amber' : ''}
                  />
                </div>
                {quote.firstCloneFree && (
                  <p className="flex items-center gap-1.5 rounded-xl bg-success/10 px-3 py-2 text-sm font-semibold text-success">
                    <Icon name="check_circle" className="text-[17px]" />
                    {FREE_LINE}.
                  </p>
                )}
                <p className="text-xs text-text-muted">
                  {quote.firstCloneFree
                    ? 'No setup credits for this one. '
                    : 'The setup credits are taken once, when you create the voice. '}
                  Calls in this voice cost the same as Bharat voices: {perMinute(quote.creditsPerMinute)}.
                </p>
                {!quote.canCreate && (
                  <div role="alert" className="flex flex-col gap-2 rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-sm">
                    <p className="font-semibold">{quote.reason || 'You cannot create a voice right now.'}</p>
                    <Link to={BILLING_PATH} className="w-fit font-bold text-primary hover:underline">
                      Open Plan &amp; billing
                    </Link>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={nameId} className="text-sm font-bold">
                Voice name
              </label>
              <input
                id={nameId}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                placeholder="For example, Priya from sales"
                className={inputCls}
                autoFocus
              />
              <p className="text-xs text-text-muted">Only you see this name. It shows in the agent voice picker.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={langId} className="text-sm font-bold">
                Language you will speak in
              </label>
              <select id={langId} value={language} onChange={(e) => setLanguage(e.target.value)} className={inputCls}>
                {CLONE_LANGUAGES.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-text-muted">The voice sounds most natural in this language.</p>
            </div>
          </>
        )}

        {step === 2 && quote && (
          <>
            <div role="tablist" aria-label="How to add your sample" className="flex w-full gap-1 rounded-xl border border-border bg-surface p-1 sm:w-fit">
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

            {mode === 'record' && !recorderSupported && (
              <p role="alert" className="rounded-lg border-l-[3px] border-amber bg-surface-high px-3 py-2 text-sm">
                This browser cannot record audio here. Please upload a recording instead.
              </p>
            )}

            {mode === 'record' && recorderSupported && (
              <>
                <div className="rounded-2xl border border-border bg-surface p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted">Read this out loud</p>
                    {quote.scriptHi && (
                      <div className="flex gap-1 rounded-lg border border-border p-0.5" role="group" aria-label="Script language">
                        {(
                          [
                            ['en', 'English'],
                            ['hi', 'Hindi'],
                          ] as const
                        ).map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            aria-pressed={scriptLang === key}
                            onClick={() => setScriptLang(key)}
                            className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                              scriptLang === key ? 'bg-primary text-white' : 'bg-transparent text-text-muted hover:text-text'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="max-h-48 overflow-y-auto whitespace-pre-line font-display text-[15px] leading-relaxed" lang={scriptLang}>
                    {script}
                  </p>
                </div>
                <ul className="grid gap-1.5 text-xs text-text-muted sm:grid-cols-3">
                  <li className="flex items-start gap-1.5">
                    <Icon name="check" className="text-[15px] text-success" />
                    Sit in a quiet room, away from fans and traffic.
                  </li>
                  <li className="flex items-start gap-1.5">
                    <Icon name="check" className="text-[15px] text-success" />
                    Hold the phone or mic close, about a hand away.
                  </li>
                  <li className="flex items-start gap-1.5">
                    <Icon name="check" className="text-[15px] text-success" />
                    Speak at your normal pace, the way you talk on calls.
                  </li>
                </ul>
                <RecorderPanel rec={sample} maxSeconds={SAMPLE_MAX_SECONDS} label="voice sample" check={checkSampleDuration} showTarget />
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
                <label
                  htmlFor={fileId}
                  className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border bg-surface-high/40 px-4 py-8 text-center transition-colors hover:border-primary focus-within:border-primary"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    pickFile(e.dataTransfer.files?.[0])
                  }}
                >
                  <Icon name="upload" className="text-[30px] text-primary" />
                  <span className="text-sm font-bold">{upload ? 'Pick a different file' : 'Choose an audio file'}</span>
                  <span className="text-xs text-text-muted">WAV, MP3, M4A, WEBM or OGG, up to 20 MB. At least 30 seconds of just your voice.</span>
                  <input
                    id={fileId}
                    ref={fileRef}
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
                          <p className={`text-xs font-semibold ${sampleCheck.ok ? 'text-success' : 'text-destructive'}`}>
                            {sampleCheck.ok ? sampleCheck.message : sampleCheck.message.replace(/^Keep going: /, 'Too short: ')}
                          </p>
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
                Record yourself reading this sentence. The same person must speak in the sample and here.
              </p>
            </div>
            <blockquote className="rounded-2xl border-l-4 border-primary bg-primary/[0.06] px-4 py-3 font-display text-[15px] leading-relaxed">
              {quote.consentSentence}
            </blockquote>
            {recorderSupported ? (
              <RecorderPanel rec={consent} maxSeconds={CONSENT_MAX_SECONDS} label="consent" check={checkConsentDuration} />
            ) : (
              <p role="alert" className="rounded-lg border-l-[3px] border-amber bg-surface-high px-3 py-2 text-sm">
                This browser cannot record audio, and the consent has to be recorded live. Please open this page in a recent
                Chrome, Edge, Firefox or Safari.
              </p>
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

        {step === 4 && quote && (
          <>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-surface-high px-3 py-2.5">
                <dt className="text-[11px] font-bold text-text-muted">Name</dt>
                <dd className="truncate font-semibold">{name.trim()}</dd>
              </div>
              <div className="rounded-xl bg-surface-high px-3 py-2.5">
                <dt className="text-[11px] font-bold text-text-muted">Language</dt>
                <dd className="font-semibold">{cloneLanguageLabel(language)}</dd>
              </div>
              <div className="rounded-xl bg-surface-high px-3 py-2.5">
                <dt className="text-[11px] font-bold text-text-muted">Sample</dt>
                <dd className="font-semibold">
                  {mode === 'record' ? 'Recorded' : 'Uploaded'}
                  {sampleSeconds !== null && ` · ${formatClock(sampleSeconds)}`}
                </dd>
              </div>
              <div className="rounded-xl bg-surface-high px-3 py-2.5">
                <dt className="text-[11px] font-bold text-text-muted">On calls</dt>
                <dd className="font-semibold">{callPrice(quote.creditsPerMinute)}</dd>
              </div>
            </dl>
            <p className="text-sm text-text-muted">
              {quote.firstCloneFree || quote.setupCredits <= 0
                ? `${FREE_LINE}, so no credits are taken now.`
                : `${fmtCredits(quote.setupCredits)} credits are taken from your balance of ${fmtCredits(quote.balance)} credits when you create the voice.`}
            </p>
            {submitting && (
              <div className="flex flex-col gap-1.5" role="status" aria-live="polite">
                <div className="h-2 overflow-hidden rounded-full bg-surface-high">
                  <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
                <p className="text-xs text-text-muted">
                  {progress < 1 ? `Uploading your recordings, ${Math.round(progress * 100)}%` : 'Uploaded. Setting up your voice, this can take a few seconds.'}
                </p>
              </div>
            )}
            {submitError && (
              <p role="alert" className="rounded-lg border-l-[3px] border-destructive bg-surface-high px-3 py-2 text-sm">
                {submitError}
              </p>
            )}
            {submitError && !quote.canCreate && (
              <Link to={BILLING_PATH} className="text-sm font-bold text-primary hover:underline">
                Open Plan &amp; billing
              </Link>
            )}
          </>
        )}
      </div>

      <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-border bg-surface px-4 py-3 sm:px-6">
        {step > 0 ? (
          <button type="button" onClick={() => setStep((s) => s - 1)} disabled={submitting} className={ghostBtn}>
            <Icon name="arrow_back" className="text-[17px]" />
            Back
          </button>
        ) : (
          <button type="button" onClick={onClose} className={ghostBtn}>
            Cancel
          </button>
        )}
        {step < 4 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={!canNext || (sample.state === 'recording' || consent.state === 'recording')}
            className={primaryBtn}
          >
            Next
            <Icon name="arrow_forward" className="text-[17px]" />
          </button>
        ) : (
          <button type="button" onClick={submit} disabled={submitting || !quote} className={primaryBtn}>
            {submitting && <Icon name="progress_activity" className="animate-spin text-[17px]" />}
            {createLabel(quote)}
          </button>
        )}
      </div>
    </Dialog>
  )
}

// ------------------------------------------------------------------ your voices

function VoiceRow({
  voice,
  playing,
  loading,
  onPreview,
  onRenamed,
  onDelete,
}: {
  voice: CustomVoice
  playing: boolean
  loading: boolean
  onPreview: () => void
  onRenamed: (v: CustomVoice) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(voice.name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const inputId = useId()

  async function save() {
    const next = draft.trim()
    if (!next || next === voice.name) {
      setEditing(false)
      setDraft(voice.name)
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
    <li className="flex flex-col gap-1 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="h-10 w-10 shrink-0 rounded-full"
          style={{
            background:
              'radial-gradient(circle at 25% 25%, var(--color-magenta) 0%, transparent 70%), radial-gradient(circle at 80% 75%, var(--color-primary) 0%, transparent 70%), var(--color-surface-high)',
          }}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1 basis-40">
          {editing ? (
            <div className="flex items-center gap-1.5">
              <label htmlFor={inputId} className="sr-only">
                New name for {voice.name}
              </label>
              <input
                id={inputId}
                value={draft}
                maxLength={40}
                autoFocus
                onFocus={(e) => e.target.select()}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save()
                  if (e.key === 'Escape') {
                    setEditing(false)
                    setDraft(voice.name)
                    setError('')
                  }
                }}
                className="min-w-0 flex-1 rounded-lg border border-primary bg-surface-high px-2 py-1 text-sm font-bold outline-none"
              />
              <button type="button" onClick={save} disabled={saving} aria-label="Save name" className="rounded-md p-1 text-success hover:bg-surface-high">
                <Icon name={saving ? 'progress_activity' : 'check'} className={`text-[18px] ${saving ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false)
                  setDraft(voice.name)
                  setError('')
                }}
                aria-label="Cancel rename"
                className="rounded-md p-1 text-text-muted hover:bg-surface-high"
              >
                <Icon name="close" className="text-[18px]" />
              </button>
            </div>
          ) : (
            <p className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-bold">{voice.name}</span>
              <ClonedBadge />
            </p>
          )}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
            <span>{cloneLanguageLabel(voice.language)}</span>
            <StatusBadge status={voice.status} />
            <span className="font-semibold text-text">{perMinute(voice.creditsPerMinute)}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {voice.status === 'ready' && (
            <button
              type="button"
              onClick={onPreview}
              aria-label={playing ? `Pause ${voice.name}` : `Preview ${voice.name}`}
              className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
                playing ? 'border-primary bg-primary text-white' : 'border-border bg-surface text-primary hover:border-primary'
              }`}
            >
              <Icon name={loading ? 'progress_activity' : playing ? 'pause' : 'play_arrow'} className={`text-[19px] ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
          {!editing && (
            <button
              type="button"
              onClick={() => {
                setDraft(voice.name)
                setEditing(true)
              }}
              aria-label={`Rename ${voice.name}`}
              className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:bg-surface-high hover:text-text"
            >
              <Icon name="edit" className="text-[18px]" />
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${voice.name}`}
            className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:bg-destructive/10 hover:text-destructive"
          >
            <Icon name="delete" className="text-[18px]" />
          </button>
        </div>
      </div>
      {voice.status === 'failed' && voice.error && <p className="pl-[52px] text-xs text-destructive">{voice.error}</p>}
      {error && (
        <p role="alert" className="pl-[52px] text-xs text-destructive">
          {error}
        </p>
      )}
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
        {error && (
          <p role="alert" className="rounded-lg border-l-[3px] border-destructive bg-surface-high px-3 py-2 text-sm">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={ghostBtn}>
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-destructive px-5 text-sm font-extrabold text-white transition hover:brightness-105 disabled:opacity-50"
          >
            {busy && <Icon name="progress_activity" className="animate-spin text-[17px]" />}
            Delete voice
          </button>
        </div>
      </div>
    </Dialog>
  )
}

/** "Clone your voice" on the Voices page: the customer's own cloned voices,
 * and the dialog that makes a new one. */
export function CloneVoiceSection() {
  const [voices, setVoices] = useState<CustomVoice[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [quote, setQuote] = useState<CustomVoiceQuote | null>(null)
  const [creating, setCreating] = useState(false)
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

  useEffect(() => {
    load()
    fetchCustomVoiceQuote().then(setQuote).catch(() => setQuote(null))
  }, [load])

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

  const list = voices ?? []

  return (
    <section aria-labelledby="clone-voice-heading" className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="flex flex-wrap items-center gap-4 bg-[radial-gradient(120%_140%_at_0%_0%,color-mix(in_srgb,var(--color-magenta)_14%,transparent),transparent_60%)] p-4 sm:p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon name="record_voice_over" className="text-[22px]" />
        </span>
        <div className="min-w-0 flex-1 basis-56">
          <h2 id="clone-voice-heading" className="font-display text-lg font-semibold tracking-tight">
            Clone your voice
          </h2>
          <p className="text-sm text-text-muted">
            Record about a minute of your voice and your agents can speak like you.
            {quote &&
              (quote.firstCloneFree ? ` ${FREE_LINE}.` : ` ${fmtCredits(quote.setupCredits)} credits once to set up.`) +
                ` ${callPrice(quote.creditsPerMinute)} on calls.`}
          </p>
        </div>
        <button type="button" onClick={() => setCreating(true)} className={`${primaryBtn} w-full sm:w-auto`}>
          <Icon name="mic" className="text-[18px]" />
          Clone your voice
        </button>
      </div>

      {(list.length > 0 || loadError) && (
        <div className="border-t border-border">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-3">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-text-muted">Your voices</h3>
            <p className="text-[11px] text-text-muted">Ready voices show up in the agent voice picker on their own.</p>
          </div>
          {loadError && (
            <p role="alert" className="mx-4 mt-2 rounded-lg border-l-[3px] border-destructive bg-surface-high px-3 py-2 text-sm">
              {loadError}
            </p>
          )}
          <ul className="divide-y divide-border/60">
            {list.map((v) => (
              <VoiceRow
                key={v.id}
                voice={v}
                playing={previewId === v.id && previewState === 'playing'}
                loading={previewId === v.id && previewState === 'loading'}
                onPreview={() => preview(v)}
                onRenamed={(next) => setVoices((all) => (all ?? []).map((x) => (x.id === next.id ? { ...x, ...next } : x)))}
                onDelete={() => setDeleting(v)}
              />
            ))}
          </ul>
          {previewError && (
            <p role="alert" className="px-4 pb-3 text-xs text-destructive">
              {previewError}
            </p>
          )}
          {pollStopped && (
            <p className="flex flex-wrap items-center gap-2 px-4 pb-3 text-xs text-text-muted">
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
          onClose={() => setCreating(false)}
          onCreated={(voice) => {
            setVoices((all) => [voice, ...(all ?? []).filter((x) => x.id !== voice.id)])
            pollStart.current = null
            setTick((n) => n + 1)
            fetchCustomVoiceQuote().then(setQuote).catch(() => undefined)
          }}
        />
      )}
      {deleting && (
        <DeleteDialog
          voice={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setVoices((all) => (all ?? []).filter((x) => x.id !== deleting.id))
            setDeleting(null)
            fetchCustomVoiceQuote().then(setQuote).catch(() => undefined)
          }}
        />
      )}
    </section>
  )
}
