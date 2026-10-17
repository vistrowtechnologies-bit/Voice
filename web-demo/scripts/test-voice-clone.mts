import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CLIP_PEAK, CLONE_GENDERS, CLONE_LANGUAGES, CLONE_SCRIPTS, RECORD_AUTO_STOP_SECONDS, SAMPLE_IDEAL_SECONDS, SAMPLE_MIN_SECONDS,
  checkConsentDuration, checkSampleDuration, checkUploadFile, cloneLanguageLabel, cloneScript, extensionForMime, formatClock,
  htmlLang, isClonedVoiceValue, levelHints, talkSeconds, checkRecordedSample, SPEECH_NEEDED_SECONDS, meterLevel, micCheckVerdict, micErrorMessage, pickRecorderMime, recordingPhase,
  voiceInitials,
} from '../src/lib/voiceClone.ts'
import type { LevelFrame } from '../src/lib/voiceClone.ts'

// ---- Recorder format: first supported in preference order, '' when nothing is or the API is missing.
assert.equal(pickRecorderMime((t) => t === 'audio/webm;codecs=opus' || t === 'audio/mp4'), 'audio/webm;codecs=opus') // Chrome
assert.equal(pickRecorderMime((t) => t === 'audio/ogg;codecs=opus' || t === 'audio/webm'), 'audio/webm') // older Firefox
assert.equal(pickRecorderMime((t) => t === 'audio/mp4'), 'audio/mp4') // Safari
assert.equal(pickRecorderMime((t) => t.startsWith('audio/mp4')), 'audio/mp4;codecs=mp4a.40.2')
assert.equal(pickRecorderMime(() => false), '')
assert.equal(pickRecorderMime(undefined), '')
assert.equal(pickRecorderMime((t) => { if (t.includes('webm')) throw new Error('x'); return t === 'audio/ogg;codecs=opus' }), 'audio/ogg;codecs=opus')
assert.equal(extensionForMime('audio/webm;codecs=opus'), 'webm')
assert.equal(extensionForMime('audio/mp4'), 'm4a')
assert.equal(extensionForMime('audio/mp4;codecs=mp4a.40.2'), 'm4a')
assert.equal(extensionForMime('audio/ogg;codecs=opus'), 'ogg')
assert.equal(extensionForMime('audio/flac'), 'flac')
assert.equal(extensionForMime(''), 'webm')

// ---- Sample length: min 10 s (server), 10-20 s perfect, uploads up to 5 min.
assert.equal(SAMPLE_MIN_SECONDS, 10)
assert.equal(SAMPLE_IDEAL_SECONDS, 15)
assert.equal(RECORD_AUTO_STOP_SECONDS, 30) // under the server's 60 s recording cap
assert.equal(checkSampleDuration(0).ok, false)
assert.equal(checkSampleDuration(9.9).ok, false)
assert.match(checkSampleDuration(7).message, /3 s more/)
assert.equal(checkSampleDuration(NaN).ok, false)
assert.deepEqual([checkSampleDuration(10).ok, checkSampleDuration(10).level], [true, 'good'])
assert.deepEqual([checkSampleDuration(15).ok, checkSampleDuration(15).level], [true, 'good'])
assert.deepEqual([checkSampleDuration(25).ok, checkSampleDuration(25).level], [true, 'ok'])
assert.equal(checkSampleDuration(300, 'upload').ok, true)
assert.equal(checkSampleDuration(301, 'upload').ok, false)
// Consent: 2-30 s.
assert.equal(checkConsentDuration(1).ok, false)
assert.equal(checkConsentDuration(8).ok, true)
assert.equal(checkConsentDuration(31).ok, false)

// ---- Recording states: "Keep going" < 10 s, "Perfect" 10-20 s, then "plenty"; ring full at 15 s.
// The recorder goes by talking heard, not clock time (owner's live test 17 Oct:
// one read of the script is under 10 s of talking).
assert.deepEqual([recordingPhase(0, 0).phase, recordingPhase(0, 0).label, recordingPhase(0, 0).ring], ['short', 'Keep reading', 0])
assert.equal(recordingPhase(18, 8).phase, 'short') // 18 s on the clock, only 8 s of talking
assert.equal(recordingPhase(9, 9).phase, 'short') // under the 10 s clock minimum
assert.equal(recordingPhase(16, SPEECH_NEEDED_SECONDS).phase, 'perfect')
assert.equal(recordingPhase(26, 14).phase, 'plenty')
assert.equal(recordingPhase(20, 6).ring, 0.5)
assert.equal(recordingPhase(30, 40).ring, 1)
// A finished recording: the clock check, then the talking check.
assert.equal(checkRecordedSample(7, 7).ok, false)
assert.match(checkRecordedSample(7, 7).message, /3 s more/)
const thin = checkRecordedSample(18, 7.6)
assert.deepEqual([thin.ok, thin.level], [false, 'short'])
assert.match(thin.message, /about 7 seconds of talking and need 11/)
assert.deepEqual([checkRecordedSample(16, 12).ok, checkRecordedSample(16, 12).message], [true, 'Perfect length.'])
assert.equal(checkRecordedSample(24, 14).ok, true)
assert.equal(checkRecordedSample(NaN, 20).ok, false)
// No level readings (no analyser): clock time stands in for talking.
assert.equal(talkSeconds([], 16), 16)
const talking = Array.from({ length: 160 }, (_, i) => ({ rms: i % 4 === 3 ? 0.002 : 0.1, peak: 0.3 }))
assert.equal(talkSeconds(talking, 16), 12)
assert.equal(recordingPhase(15, 12).ring, 1)
assert.equal(recordingPhase(29, 29).ring, 1)
assert.equal(recordingPhase(-3, -3).ring, 0)
assert.equal(recordingPhase(NaN, NaN).phase, 'short')

// ---- Upload: type and 20 MB cap.
const MB = 1024 * 1024
assert.equal(checkUploadFile({ name: 'me.mp3', type: 'audio/mpeg', size: 2 * MB }), '')
assert.equal(checkUploadFile({ name: 'me.M4A', type: '', size: MB }), '')
assert.equal(checkUploadFile({ name: 'me.flac', type: '', size: MB }), '')
assert.equal(checkUploadFile({ name: 'clip', type: 'audio/ogg', size: MB }), '')
assert.match(checkUploadFile({ name: 'me.pdf', type: 'application/pdf', size: MB }), /WAV, MP3/)
assert.match(checkUploadFile({ name: 'me.wav', type: 'audio/wav', size: 21 * MB }), /20 MB/)
assert.equal(checkUploadFile({ name: 'me.wav', type: 'audio/wav', size: 20 * MB }), '')
assert.match(checkUploadFile({ name: 'me.wav', type: 'audio/wav', size: 0 }), /empty/)

assert.equal(formatClock(0), '0:00')
assert.equal(formatClock(75.9), '1:15')
assert.equal(formatClock(300), '5:00')

// ---- Languages: exactly the server's 12 (server/custom_voices.py _SARVAM_CLONE_LANGS).
const server = readFileSync(new URL('../../server/custom_voices.py', import.meta.url), 'utf8')
const serverBlock = server.match(/_SARVAM_CLONE_LANGS = \{([\s\S]*?)\}/)?.[1] ?? ''
const serverCodes = [...serverBlock.matchAll(/"([a-z]{2}-IN)"/g)].map((m) => m[1]).sort()
assert.equal(serverCodes.length, 12)
assert.deepEqual(CLONE_LANGUAGES.map(([c]) => c).sort(), serverCodes)
assert.equal(cloneLanguageLabel('or-IN'), 'Odia')
assert.equal(cloneLanguageLabel('od-IN'), 'Odia')
assert.equal(cloneLanguageLabel('as-IN'), 'Assamese')
assert.equal(cloneLanguageLabel('xx-YY'), 'xx-YY')
assert.equal(htmlLang('od-IN'), 'or')
assert.equal(htmlLang('hi-IN'), 'hi')
assert.deepEqual(CLONE_GENDERS.map(([g]) => g), ['male', 'female'])

// ---- Scripts: one per language, in that language's own script, about 15 seconds of reading.
const SCRIPT_RANGES: Record<string, [number, number]> = {
  'en-IN': [0x41, 0x7a], 'hi-IN': [0x900, 0x97f], 'mr-IN': [0x900, 0x97f], 'bn-IN': [0x980, 0x9ff], 'as-IN': [0x980, 0x9ff],
  'pa-IN': [0xa00, 0xa7f], 'gu-IN': [0xa80, 0xaff], 'od-IN': [0xb00, 0xb7f], 'ta-IN': [0xb80, 0xbff], 'te-IN': [0xc00, 0xc7f],
  'kn-IN': [0xc80, 0xcff], 'ml-IN': [0xd00, 0xd7f],
}
assert.deepEqual(Object.keys(CLONE_SCRIPTS).sort(), serverCodes)
for (const [code] of CLONE_LANGUAGES) {
  const text = cloneScript(code)
  assert.equal(text, CLONE_SCRIPTS[code], `${code} script`)
  const [lo, hi] = SCRIPT_RANGES[code]
  for (const ch of text.match(/[\p{L}\p{M}]/gu) ?? []) {
    const cp = ch.codePointAt(0)!
    assert.ok(cp >= lo && cp <= hi, `${code} script has a character outside its alphabet: ${ch}`)
  }
  const words = text.split(/\s+/).filter(Boolean).length
  assert.ok(words >= 25 && words <= 55, `${code} script is ${words} words`)
  assert.ok(!/[—–]/.test(text), `${code} script has a dash`)
}
assert.ok(/[ৰৱ]/.test(CLONE_SCRIPTS['as-IN']), 'Assamese uses ৰ/ৱ, not Bengali letters')
assert.ok(!/[ৰৱ]/.test(CLONE_SCRIPTS['bn-IN']))
for (const code of ['en-IN', 'hi-IN']) {
  const words = CLONE_SCRIPTS[code].split(/\s+/).length
  assert.ok(words >= 40 && words <= 50, `${code} script is ${words} words (aim 40-45)`)
}
assert.equal(cloneScript('or-IN'), CLONE_SCRIPTS['od-IN'])
assert.equal(cloneScript('xx-YY'), CLONE_SCRIPTS['en-IN'])

// ---- Level hints.
const fr = (rms: number, peak = Math.min(1, rms * 3)): LevelFrame => ({ rms, peak })
const speech = (n: number) => Array.from({ length: n }, (_, i) => fr(i % 5 === 0 ? 0.004 : 0.12))
// Mic check.
assert.equal(micCheckVerdict([]).verdict, 'listening')
assert.equal(micCheckVerdict(Array(10).fill(fr(0.005))).verdict, 'quiet')
assert.equal(micCheckVerdict(Array(10).fill(fr(0.3, CLIP_PEAK))).verdict, 'loud')
assert.equal(micCheckVerdict(speech(10)).verdict, 'good')
// Clean speech: no hints, speech seconds counted.
const clean = levelHints(speech(150))
assert.deepEqual(clean.hints, [])
assert.equal(clean.speechSeconds, 12)
// Too little data yet: nothing to say.
assert.deepEqual(levelHints(Array(10).fill(fr(0.001))).hints, [])
// Quiet: speech never gets loud.
assert.deepEqual(levelHints(Array(40).fill(fr(0.005))).hints.map((h) => h.code), ['quiet'])
// Clipping.
const clipped = speech(100).map((f, i) => (i % 10 === 1 ? fr(0.4, 1) : f))
assert.ok(levelHints(clipped).hints.some((h) => h.code === 'clipping'))
// Background noise: quiet frames nearly as loud as speech.
const noisy = Array.from({ length: 60 }, (_, i) => fr(i % 2 ? 0.09 : 0.07))
assert.ok(levelHints(noisy).hints.some((h) => h.code === 'noise'))
// Long pause at the end while recording, but not after (live=false).
const paused = [...speech(60), ...Array(35).fill(fr(0.002))]
assert.ok(levelHints(paused, true).hints.some((h) => h.code === 'silence'))
assert.ok(!levelHints(paused, false).hints.some((h) => h.code === 'silence'))
assert.ok(!levelHints([...speech(60), ...Array(20).fill(fr(0.002))]).hints.some((h) => h.code === 'silence'))
assert.equal(meterLevel(0.1), 0.4)
assert.equal(meterLevel(2), 1)

// ---- Misc.
assert.equal(voiceInitials('Priya from sales'), 'PS')
assert.equal(voiceInitials('asha'), 'AS')
assert.equal(voiceInitials('  '), '?')
assert.equal(isClonedVoiceValue('custom:vv_abc'), true)
assert.equal(isClonedVoiceValue('sarvam4:priya'), false)
assert.match(micErrorMessage('NotAllowedError'), /blocked/)
assert.match(micErrorMessage('NotFoundError'), /No microphone/)
assert.match(micErrorMessage('Weird'), /upload/)

// No em dashes or vendor names anywhere in this feature's code or copy.
for (const f of ['src/lib/voiceClone.ts', 'src/components/VoiceClone.tsx', 'src/components/ClonedVoiceOptions.tsx', 'src/lib/useAudioRecorder.ts']) {
  const text = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
  assert.ok(!text.includes('—'), `${f} has an em dash`)
  assert.ok(!/elevenlabs|sarvam|google/i.test(text), `${f} names a vendor`)
}
console.log('voice clone helpers: ok')
