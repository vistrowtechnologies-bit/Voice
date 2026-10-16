// Pure helpers for "Clone your voice" (Voices page). No React, no browser
// globals at import time, so scripts/test-voice-clone.mts can run them in Node.

// Sample length rules shown to the customer. The server checks again.
export const SAMPLE_MIN_SECONDS = 30
export const SAMPLE_GOOD_SECONDS = 60
export const SAMPLE_GOOD_MAX_SECONDS = 90
export const SAMPLE_MAX_SECONDS = 300
export const CONSENT_MIN_SECONDS = 2
export const CONSENT_MAX_SECONDS = 30
export const UPLOAD_MAX_BYTES = 20 * 1024 * 1024

// The languages a cloned voice can be made for. Same names as the agent's
// language list, but Odia is or-IN here (the clone API's code).
export const CLONE_LANGUAGES: readonly (readonly [string, string])[] = [
  ['hi-IN', 'Hindi'],
  ['en-IN', 'English'],
  ['mr-IN', 'Marathi'],
  ['ta-IN', 'Tamil'],
  ['te-IN', 'Telugu'],
  ['kn-IN', 'Kannada'],
  ['ml-IN', 'Malayalam'],
  ['gu-IN', 'Gujarati'],
  ['bn-IN', 'Bengali'],
  ['pa-IN', 'Punjabi'],
  ['or-IN', 'Odia'],
]

export function cloneLanguageLabel(code: string): string {
  const norm = code === 'od-IN' ? 'or-IN' : code
  return CLONE_LANGUAGES.find(([c]) => c === norm)?.[1] ?? code
}

// Recorder formats in order of preference. Opus in webm is what Chrome,
// Edge and Firefox record; Safari records mp4/aac.
export const RECORDER_MIME_PREFERENCE = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
] as const

/** The first recorder format the browser supports, or '' to let the browser
 * choose its own default. */
export function pickRecorderMime(isTypeSupported: ((type: string) => boolean) | undefined): string {
  if (!isTypeSupported) return ''
  for (const type of RECORDER_MIME_PREFERENCE) {
    try {
      if (isTypeSupported(type)) return type
    } catch {
      // Some browsers throw on unknown types instead of returning false.
    }
  }
  return ''
}

/** File extension for a recorded blob, so the server sees a sensible name. */
export function extensionForMime(mime: string): string {
  const base = mime.split(';')[0].trim().toLowerCase()
  if (base === 'audio/webm') return 'webm'
  if (base === 'audio/ogg') return 'ogg'
  if (base === 'audio/mp4' || base === 'audio/x-m4a' || base === 'audio/aac') return 'm4a'
  if (base === 'audio/mpeg') return 'mp3'
  if (base === 'audio/wav' || base === 'audio/x-wav' || base === 'audio/wave') return 'wav'
  return 'webm'
}

export interface DurationCheck {
  ok: boolean
  // Plain sentence for the customer. Empty when there is nothing to say.
  message: string
  // 'short' | 'ok' | 'good' | 'long': drives the colour of the timer.
  level: 'short' | 'ok' | 'good' | 'long'
}

/** Is a voice sample long enough (and not too long)? */
export function checkSampleDuration(seconds: number): DurationCheck {
  if (!Number.isFinite(seconds) || seconds < SAMPLE_MIN_SECONDS) {
    const left = Math.max(1, Math.ceil(SAMPLE_MIN_SECONDS - (Number.isFinite(seconds) ? seconds : 0)))
    return { ok: false, level: 'short', message: `Keep going: at least ${SAMPLE_MIN_SECONDS} seconds is needed (${left} s more).` }
  }
  if (seconds > SAMPLE_MAX_SECONDS) {
    return { ok: false, level: 'long', message: `That is longer than ${SAMPLE_MAX_SECONDS / 60} minutes. Please keep it shorter.` }
  }
  if (seconds < SAMPLE_GOOD_SECONDS) {
    return { ok: true, level: 'ok', message: `Long enough. 60 to 90 seconds gives the best result.` }
  }
  return { ok: true, level: 'good', message: 'Great length.' }
}

/** Is the spoken consent long enough to contain the sentence? */
export function checkConsentDuration(seconds: number): DurationCheck {
  if (!Number.isFinite(seconds) || seconds < CONSENT_MIN_SECONDS) {
    return { ok: false, level: 'short', message: 'That was too short. Please read the whole sentence.' }
  }
  if (seconds > CONSENT_MAX_SECONDS) {
    return { ok: false, level: 'long', message: `Please keep it under ${CONSENT_MAX_SECONDS} seconds.` }
  }
  return { ok: true, level: 'good', message: '' }
}

const UPLOAD_EXTENSIONS = ['wav', 'mp3', 'm4a', 'webm', 'ogg'] as const
export const UPLOAD_ACCEPT = '.wav,.mp3,.m4a,.webm,.ogg,audio/wav,audio/x-wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/webm,audio/ogg'

/** Checks an uploaded file's type and size. Returns an error sentence or ''. */
export function checkUploadFile(file: { name: string; type: string; size: number }): string {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const typeOk = /^audio\/(wav|x-wav|wave|mpeg|mp3|mp4|x-m4a|m4a|aac|webm|ogg)/.test(file.type.toLowerCase())
  if (!(UPLOAD_EXTENSIONS as readonly string[]).includes(ext) && !typeOk) {
    return 'Please pick a WAV, MP3, M4A, WEBM or OGG audio file.'
  }
  if (file.size <= 0) return 'That file is empty.'
  if (file.size > UPLOAD_MAX_BYTES) return 'That file is over 20 MB. Please pick a shorter recording.'
  return ''
}

/** 75 -> "1:15" */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** True for a cloned voice's agent value ("custom:vv_..."). */
export const isClonedVoiceValue = (value: string) => value.startsWith('custom:')

/** Turns a microphone error into a plain sentence. */
export function micErrorMessage(name: string): string {
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone access is blocked. Allow it in your browser’s site settings, or upload a recording instead.'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No microphone was found. Plug one in, or upload a recording instead.'
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return 'Another app is using the microphone. Close it and try again, or upload a recording instead.'
  }
  return 'Recording could not start. You can upload a recording instead.'
}
