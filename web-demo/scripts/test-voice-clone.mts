import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CLONE_LANGUAGES, checkConsentDuration, checkSampleDuration, checkUploadFile, cloneLanguageLabel,
  extensionForMime, formatClock, isClonedVoiceValue, micErrorMessage, pickRecorderMime,
} from '../src/lib/voiceClone.ts'

// Recorder format: first supported in preference order, '' when nothing is or the API is missing.
assert.equal(pickRecorderMime((t) => t === 'audio/webm;codecs=opus' || t === 'audio/mp4'), 'audio/webm;codecs=opus')
assert.equal(pickRecorderMime((t) => t === 'audio/mp4'), 'audio/mp4') // Safari
assert.equal(pickRecorderMime(() => false), '')
assert.equal(pickRecorderMime(undefined), '')
assert.equal(pickRecorderMime((t) => { if (t.includes('webm')) throw new Error('x'); return t === 'audio/ogg;codecs=opus' }), 'audio/ogg;codecs=opus')
assert.equal(extensionForMime('audio/webm;codecs=opus'), 'webm')
assert.equal(extensionForMime('audio/mp4'), 'm4a')
assert.equal(extensionForMime('audio/ogg;codecs=opus'), 'ogg')
assert.equal(extensionForMime(''), 'webm')

// Sample: min 30 s, recommend 60-90 s, max 5 min.
assert.equal(checkSampleDuration(0).ok, false)
assert.equal(checkSampleDuration(29.9).ok, false)
assert.match(checkSampleDuration(20).message, /10 s more/)
assert.equal(checkSampleDuration(NaN).ok, false)
assert.deepEqual([checkSampleDuration(30).ok, checkSampleDuration(30).level], [true, 'ok'])
assert.deepEqual([checkSampleDuration(75).ok, checkSampleDuration(75).level], [true, 'good'])
assert.equal(checkSampleDuration(300).ok, true)
assert.equal(checkSampleDuration(301).ok, false)
// Consent: max 30 s.
assert.equal(checkConsentDuration(1).ok, false)
assert.equal(checkConsentDuration(8).ok, true)
assert.equal(checkConsentDuration(31).ok, false)

// Upload: type and 20 MB cap.
const MB = 1024 * 1024
assert.equal(checkUploadFile({ name: 'me.mp3', type: 'audio/mpeg', size: 2 * MB }), '')
assert.equal(checkUploadFile({ name: 'me.M4A', type: '', size: MB }), '')
assert.equal(checkUploadFile({ name: 'clip', type: 'audio/ogg', size: MB }), '')
assert.match(checkUploadFile({ name: 'me.pdf', type: 'application/pdf', size: MB }), /WAV, MP3/)
assert.match(checkUploadFile({ name: 'me.wav', type: 'audio/wav', size: 21 * MB }), /20 MB/)
assert.equal(checkUploadFile({ name: 'me.wav', type: 'audio/wav', size: 20 * MB }), '')
assert.match(checkUploadFile({ name: 'me.wav', type: 'audio/wav', size: 0 }), /empty/)

assert.equal(formatClock(0), '0:00')
assert.equal(formatClock(75.9), '1:15')
assert.equal(formatClock(300), '5:00')
assert.equal(CLONE_LANGUAGES.length, 11)
assert.ok(CLONE_LANGUAGES.some(([c]) => c === 'od-IN'))
assert.equal(cloneLanguageLabel('or-IN'), 'Odia')
assert.equal(cloneLanguageLabel('od-IN'), 'Odia')
assert.equal(cloneLanguageLabel('xx-YY'), 'xx-YY')
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
