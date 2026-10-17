// Pure helpers for "Clone your voice" (Voices page). No React, no browser
// globals at import time, so scripts/test-voice-clone.mts can run them in Node.

// Sample length rules shown to the customer. The server checks again
// (server/custom_voices.py): at least 10 s of speech, an in-browser recording
// up to 60 s, an uploaded file up to 5 min. The clone learns from the
// clearest 12 to 15 s, so 15 s is the target and longer does not help.
export const SAMPLE_MIN_SECONDS = 10
export const SAMPLE_IDEAL_SECONDS = 15
export const SAMPLE_PERFECT_MAX_SECONDS = 20
// Talking (not clock time) a recording needs. The scripts take 9-12 s to read
// once, and a reader pauses between phrases, so one read is often under 10 s of
// speech (owner's live test 17 Oct): the recorder asks to keep reading until
// SPEECH_TARGET_SECONDS. The server needs 10 s overall (custom_voices.py);
// SPEECH_NEEDED_SECONDS adds a margin for the rougher browser estimate.
export const SPEECH_NEEDED_SECONDS = 11
export const SPEECH_TARGET_SECONDS = 12
// Past this much clock time while recording: "That is plenty".
export const RECORD_PLENTY_SECONDS = 25
// The in-browser recorder stops itself here (the server allows up to 60 s).
export const RECORD_AUTO_STOP_SECONDS = 30
export const UPLOAD_MAX_SECONDS = 300
export const CONSENT_MIN_SECONDS = 2
export const CONSENT_MAX_SECONDS = 30
export const UPLOAD_MAX_BYTES = 20 * 1024 * 1024
export const PREVIEW_MAX_CHARS = 200
export const VOICE_NAME_MAX = 40

// The 12 languages a cloned voice is recorded in and speaks. Codes as the
// server accepts them (Odia is od-IN). One recording speaks all of them.
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
  ['od-IN', 'Odia'],
  ['as-IN', 'Assamese'],
]

export function cloneLanguageLabel(code: string): string {
  const norm = code === 'or-IN' ? 'od-IN' : code
  return CLONE_LANGUAGES.find(([c]) => c === norm)?.[1] ?? code
}

export type CloneGender = 'male' | 'female'
export const CLONE_GENDERS: readonly (readonly [CloneGender, string])[] = [
  ['male', 'Male'],
  ['female', 'Female'],
]

// What to read while recording: about 15 seconds of warm, call-style speech
// in the language being recorded. First-person lines avoid gendered verb
// forms so any speaker can read them as written.
// Hindi and English still want a read-through by the owner. The other ten are pending native-speaker
// review: mr-IN ta-IN te-IN kn-IN ml-IN gu-IN bn-IN pa-IN od-IN as-IN.
export const CLONE_SCRIPTS: Readonly<Record<string, string>> = {
  'en-IN':
    "Hello, and thank you for calling! I'm happy to help you today. Tell me a little about what you need, and I'll explain the options, prices and timings. If it suits you, I can book a visit for tomorrow morning. Just tell me what works best.",
  'hi-IN':
    'नमस्ते, कॉल करने के लिए बहुत-बहुत धन्यवाद! आपकी मदद करके मुझे खुशी होगी। बताइए, आपको क्या चाहिए? हम आपको सारे विकल्प, कीमतें और समय आराम से समझा देते हैं। अगर आपको ठीक लगे, तो कल सुबह की विज़िट भी बुक हो सकती है। बस बताइए, आपके लिए क्या सही रहेगा।',
  'mr-IN':
    'नमस्कार, फोन केल्याबद्दल मनापासून धन्यवाद! तुमची मदत करायला मला नक्की आवडेल. सांगा, तुम्हाला काय हवं आहे? आम्ही तुम्हाला सगळे पर्याय, किमती आणि वेळा नीट समजावून सांगतो. तुम्हाला जमत असेल तर उद्या सकाळची भेटही बुक करता येईल. फक्त सांगा, तुमच्यासाठी काय सोयीचं आहे.',
  'ta-IN':
    'வணக்கம், அழைத்ததற்கு மிக்க நன்றி! உங்களுக்கு உதவுவதில் எனக்கு மகிழ்ச்சி. சொல்லுங்கள், உங்களுக்கு என்ன வேண்டும்? எல்லா விருப்பங்களையும், விலைகளையும், நேரங்களையும் நாங்கள் தெளிவாக விளக்குகிறோம். உங்களுக்கு வசதியாக இருந்தால், நாளை காலைக்கு ஒரு வருகையையும் பதிவு செய்யலாம். உங்களுக்கு எது சரியாக இருக்கும் என்று சொல்லுங்கள்.',
  'te-IN':
    'నమస్కారం, కాల్ చేసినందుకు చాలా ధన్యవాదాలు! మీకు సహాయం చేయడం నాకు చాలా సంతోషం. చెప్పండి, మీకు ఏం కావాలి? అన్ని ఆప్షన్లు, ధరలు, సమయాలు మేము మీకు వివరంగా చెబుతాము. మీకు వీలైతే, రేపు ఉదయం ఒక విజిట్ కూడా బుక్ చేయవచ్చు. మీకు ఏది సరిపోతుందో చెప్పండి.',
  'kn-IN':
    'ನಮಸ್ಕಾರ, ಕರೆ ಮಾಡಿದ್ದಕ್ಕೆ ತುಂಬಾ ಧನ್ಯವಾದಗಳು! ನಿಮಗೆ ಸಹಾಯ ಮಾಡಲು ನನಗೆ ಖುಷಿ ಆಗುತ್ತದೆ. ಹೇಳಿ, ನಿಮಗೆ ಏನು ಬೇಕು? ಎಲ್ಲಾ ಆಯ್ಕೆಗಳು, ಬೆಲೆಗಳು ಮತ್ತು ಸಮಯವನ್ನು ನಾವು ನಿಮಗೆ ಸ್ಪಷ್ಟವಾಗಿ ವಿವರಿಸುತ್ತೇವೆ. ನಿಮಗೆ ಅನುಕೂಲವಾದರೆ, ನಾಳೆ ಬೆಳಿಗ್ಗೆ ಒಂದು ಭೇಟಿಯನ್ನೂ ಬುಕ್ ಮಾಡಬಹುದು. ನಿಮಗೆ ಯಾವುದು ಸರಿ ಎಂದು ಹೇಳಿ.',
  'ml-IN':
    'നമസ്കാരം, വിളിച്ചതിന് വളരെ നന്ദി! നിങ്ങളെ സഹായിക്കാൻ എനിക്ക് സന്തോഷമേയുള്ളൂ. പറയൂ, നിങ്ങൾക്ക് എന്താണ് വേണ്ടത്? എല്ലാ ഓപ്ഷനുകളും വിലകളും സമയവും ഞങ്ങൾ നിങ്ങൾക്ക് വ്യക്തമായി പറഞ്ഞുതരാം. നിങ്ങൾക്ക് സൗകര്യമാണെങ്കിൽ, നാളെ രാവിലെ ഒരു സന്ദർശനവും ബുക്ക് ചെയ്യാം. നിങ്ങൾക്ക് ഏതാണ് നല്ലതെന്ന് പറഞ്ഞാൽ മതി.',
  'gu-IN':
    'નમસ્તે, ફોન કરવા બદલ ખૂબ ખૂબ આભાર! તમારી મદદ કરીને મને ખુશી થશે. કહો, તમારે શું જોઈએ છે? અમે તમને બધા વિકલ્પો, કિંમતો અને સમય શાંતિથી સમજાવી દઈએ છીએ. તમને અનુકૂળ હોય તો કાલે સવારની મુલાકાત પણ બુક થઈ શકે છે. બસ કહો, તમારા માટે શું બરાબર રહેશે.',
  'bn-IN':
    'নমস্কার, ফোন করার জন্য অনেক ধন্যবাদ! আপনাকে সাহায্য করতে পারলে আমার খুব ভালো লাগবে। বলুন, আপনার কী দরকার? আমরা আপনাকে সব বিকল্প, দাম আর সময় সুন্দর করে বুঝিয়ে দিই। আপনার সুবিধা হলে কাল সকালের একটা ভিজিটও বুক করে দেওয়া যায়। শুধু বলুন, আপনার জন্য কোনটা ভালো হবে।',
  'pa-IN':
    'ਸਤ ਸ੍ਰੀ ਅਕਾਲ, ਫ਼ੋਨ ਕਰਨ ਲਈ ਬਹੁਤ ਬਹੁਤ ਧੰਨਵਾਦ! ਤੁਹਾਡੀ ਮਦਦ ਕਰਕੇ ਮੈਨੂੰ ਖ਼ੁਸ਼ੀ ਹੋਵੇਗੀ। ਦੱਸੋ, ਤੁਹਾਨੂੰ ਕੀ ਚਾਹੀਦਾ ਹੈ? ਅਸੀਂ ਤੁਹਾਨੂੰ ਸਾਰੇ ਵਿਕਲਪ, ਕੀਮਤਾਂ ਅਤੇ ਸਮਾਂ ਆਰਾਮ ਨਾਲ ਸਮਝਾ ਦਿੰਦੇ ਹਾਂ। ਜੇ ਤੁਹਾਨੂੰ ਠੀਕ ਲੱਗੇ, ਤਾਂ ਕੱਲ੍ਹ ਸਵੇਰੇ ਦੀ ਮੁਲਾਕਾਤ ਵੀ ਬੁੱਕ ਹੋ ਸਕਦੀ ਹੈ। ਬੱਸ ਦੱਸੋ, ਤੁਹਾਡੇ ਲਈ ਕੀ ਸਹੀ ਰਹੇਗਾ।',
  'od-IN':
    'ନମସ୍କାର, ଫୋନ୍ କରିଥିବାରୁ ବହୁତ ଧନ୍ୟବାଦ! ଆପଣଙ୍କୁ ସାହାଯ୍ୟ କରି ମୋତେ ଖୁସି ଲାଗିବ। କୁହନ୍ତୁ, ଆପଣଙ୍କୁ କଣ ଦରକାର? ଆମେ ଆପଣଙ୍କୁ ସବୁ ବିକଳ୍ପ, ଦାମ୍ ଆଉ ସମୟ ଭଲ ଭାବେ ବୁଝାଇ ଦେଉ। ଆପଣଙ୍କ ସୁବିଧା ହେଲେ କାଲି ସକାଳର ଭିଜିଟ୍ ମଧ୍ୟ ବୁକ୍ କରିହେବ। କେବଳ କୁହନ୍ତୁ, ଆପଣଙ୍କ ପାଇଁ କଣ ଠିକ୍ ହେବ।',
  'as-IN':
    "নমস্কাৰ, ফোন কৰাৰ বাবে বহুত ধন্যবাদ! আপোনাক সহায় কৰিব পাৰিলে মোৰ ভাল লাগিব। কওক, আপোনাক কি লাগে? আমি আপোনাক সকলো বিকল্প, দাম আৰু সময় ভালদৰে বুজাই দিওঁ। আপোনাৰ সুবিধা হ'লে কাইলৈ পুৱাৰ এটা ভিজিটো বুক কৰিব পাৰি। মাথোঁ কওক, আপোনাৰ বাবে কি ঠিক হ'ব।",
}

/** The script to read for a recording language (English when unknown). */
export function cloneScript(language: string): string {
  const norm = language === 'or-IN' ? 'od-IN' : language
  return CLONE_SCRIPTS[norm] ?? CLONE_SCRIPTS['en-IN']
}

// The BCP 47 tag for a script's `lang` attribute (screen readers, fonts).
export const htmlLang = (language: string) => (language === 'od-IN' ? 'or' : language.split('-')[0])

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
  if (base === 'audio/webm' || base === 'video/webm') return 'webm'
  if (base === 'audio/ogg') return 'ogg'
  if (base === 'audio/mp4' || base === 'video/mp4' || base === 'audio/x-m4a' || base === 'audio/aac') return 'm4a'
  if (base === 'audio/mpeg') return 'mp3'
  if (base === 'audio/wav' || base === 'audio/x-wav' || base === 'audio/wave') return 'wav'
  if (base === 'audio/flac' || base === 'audio/x-flac') return 'flac'
  return 'webm'
}

export interface DurationCheck {
  ok: boolean
  // Plain sentence for the customer. Empty when there is nothing to say.
  message: string
  level: 'short' | 'ok' | 'good' | 'long'
}

/** Is a finished voice sample long enough (and not too long)? */
export function checkSampleDuration(seconds: number, source: 'record' | 'upload' = 'record'): DurationCheck {
  const s = Number.isFinite(seconds) ? seconds : 0
  if (s < SAMPLE_MIN_SECONDS) {
    const left = Math.max(1, Math.ceil(SAMPLE_MIN_SECONDS - s))
    return {
      ok: false,
      level: 'short',
      message: `Too short. At least ${SAMPLE_MIN_SECONDS} seconds is needed (${left} s more).`,
    }
  }
  if (source === 'upload' && s > UPLOAD_MAX_SECONDS) {
    return { ok: false, level: 'long', message: 'That file is longer than 5 minutes. Please pick a shorter one.' }
  }
  if (s <= SAMPLE_PERFECT_MAX_SECONDS) return { ok: true, level: 'good', message: 'Perfect length.' }
  return { ok: true, level: 'ok', message: 'Long enough. We use the clearest 15 seconds.' }
}

export interface RecordingPhase {
  phase: 'short' | 'perfect' | 'plenty'
  label: string
  // How full the progress ring is: 1 at the ideal 15 s.
  ring: number
}

/** What the record button says while recording, by seconds of talking heard
 * (the ring fills at SPEECH_TARGET_SECONDS) and elapsed clock time. */
export function recordingPhase(seconds: number, speechSeconds: number): RecordingPhase {
  const s = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const talk = Number.isFinite(speechSeconds) ? Math.max(0, speechSeconds) : 0
  const ring = Math.min(1, talk / SPEECH_TARGET_SECONDS)
  if (s < SAMPLE_MIN_SECONDS || talk < SPEECH_NEEDED_SECONDS) return { phase: 'short', label: 'Keep reading', ring }
  if (s <= RECORD_PLENTY_SECONDS) return { phase: 'perfect', label: 'Perfect. You can stop now.', ring }
  return { phase: 'plenty', label: 'That is plenty. Tap stop.', ring }
}

/** A finished recording: long enough on the clock and enough talking in it. */
export function checkRecordedSample(seconds: number, speechSeconds: number): DurationCheck {
  const clock = checkSampleDuration(seconds, 'record')
  if (!clock.ok) return clock
  const talk = Number.isFinite(speechSeconds) ? Math.max(0, speechSeconds) : 0
  if (talk < SPEECH_NEEDED_SECONDS) {
    return {
      ok: false,
      level: 'short',
      message: `We heard about ${Math.floor(talk)} seconds of talking and need ${SPEECH_NEEDED_SECONDS}. Record again and keep reading until the ring is full.`,
    }
  }
  return clock
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

const UPLOAD_EXTENSIONS = ['wav', 'mp3', 'm4a', 'webm', 'ogg', 'flac'] as const
export const UPLOAD_ACCEPT =
  '.wav,.mp3,.m4a,.webm,.ogg,.flac,audio/wav,audio/x-wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/webm,audio/ogg,audio/flac'

/** Checks an uploaded file's type and size. Returns an error sentence or ''. */
export function checkUploadFile(file: { name: string; type: string; size: number }): string {
  const ext = file.name.includes('.') ? (file.name.split('.').pop()?.toLowerCase() ?? '') : ''
  const typeOk = /^audio\/(wav|x-wav|wave|mpeg|mp3|mp4|x-m4a|m4a|aac|webm|ogg|flac|x-flac)/.test(file.type.toLowerCase())
  if (!(UPLOAD_EXTENSIONS as readonly string[]).includes(ext) && !typeOk) {
    return 'Please pick a WAV, MP3, M4A, WEBM, OGG or FLAC audio file.'
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

/** "Priya from sales" -> "PS", "asha" -> "AS". */
export function voiceInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const chars = (w: string) => Array.from(w)
  if (words.length === 1) return chars(words[0]).slice(0, 2).join('').toUpperCase()
  return (chars(words[0])[0] + chars(words[words.length - 1])[0]).toUpperCase()
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

// ------------------------------------------------------------ level hints
// The recorder samples the microphone about 10 times a second. Each sample
// is one frame: RMS and peak of the waveform, both 0..1 of full scale.

export interface LevelFrame {
  rms: number
  peak: number
}
export const FRAME_SECONDS = 0.1

// Rough equivalents of the server's checks (server/custom_voices.py):
// clipped = at full scale; quiet = speech peaks below about -34 dBFS;
// noisy = less than 12 dB between the loud and the quiet frames.
export const CLIP_PEAK = 0.98
const QUIET_RMS = 0.02
const SILENT_RMS = 0.008
const NOISE_RANGE_DB = 12
const CLIPPED_FRACTION = 0.02
const LONG_SILENCE_S = 3

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))
  return sorted[i]
}

/** Meter fill 0..1 for one frame (speech RMS sits around 0.05 to 0.2). */
export const meterLevel = (rms: number) => Math.min(1, Math.max(0, rms * 4))

export type MicVerdict = 'listening' | 'quiet' | 'loud' | 'good'

/** Mic check before recording, from the last ~2 s of frames. */
export function micCheckVerdict(frames: readonly LevelFrame[]): { verdict: MicVerdict; message: string } {
  const recent = frames.slice(-20)
  if (recent.length < 5) return { verdict: 'listening', message: 'Listening. Say a few words.' }
  const clipped = recent.filter((f) => f.peak >= CLIP_PEAK).length / recent.length
  if (clipped > 0.05) return { verdict: 'loud', message: 'Too loud. Move back from the mic a little.' }
  const loudest = Math.max(...recent.map((f) => f.rms))
  if (loudest < QUIET_RMS) return { verdict: 'quiet', message: 'Too quiet. Say a few words, closer to the mic.' }
  return { verdict: 'good', message: 'Sounds good. You are ready to record.' }
}

export type LevelHintCode = 'quiet' | 'clipping' | 'silence' | 'noise'
export interface LevelHint {
  code: LevelHintCode
  message: string
}

export interface LevelSummary {
  hints: LevelHint[]
  // Seconds that sound like speech (louder than the background).
  speechSeconds: number
}

/** Live hints while recording (and after), from all frames so far.
 * `live` adds the long-silence hint, which only matters mid-recording. */
export function levelHints(frames: readonly LevelFrame[], live = true): LevelSummary {
  const hints: LevelHint[] = []
  if (frames.length < 20) return { hints, speechSeconds: 0 }
  const sorted = frames.map((f) => f.rms).sort((a, b) => a - b)
  const loud = percentile(sorted, 0.95)
  const floor = percentile(sorted, 0.1)
  const speechGate = Math.max(SILENT_RMS, floor * 2)
  const speechSeconds = frames.filter((f) => f.rms > speechGate).length * FRAME_SECONDS

  const clipped = frames.filter((f) => f.peak >= CLIP_PEAK).length / frames.length
  if (clipped > CLIPPED_FRACTION) {
    hints.push({ code: 'clipping', message: 'Too loud, the sound is breaking up. Move the mic a little further away.' })
  }
  if (loud < QUIET_RMS) {
    hints.push({ code: 'quiet', message: 'We can barely hear you. Move closer to the mic or speak up a little.' })
  } else if (frames.length >= 30 && 20 * Math.log10(loud / Math.max(floor, 1e-4)) < NOISE_RANGE_DB) {
    hints.push({
      code: 'noise',
      message: 'We can hear background noise. Try a quieter spot, away from fans, TV or traffic.',
    })
  }
  if (live) {
    let run = 0
    for (let i = frames.length - 1; i >= 0 && frames[i].rms <= speechGate; i--) run++
    if (run * FRAME_SECONDS >= LONG_SILENCE_S && loud >= QUIET_RMS) {
      hints.push({ code: 'silence', message: 'We heard a long pause. Keep reading, it is fine to start the line again.' })
    }
  }
  return { hints, speechSeconds: Math.round(speechSeconds * 10) / 10 }
}

/** Seconds of talking in a recording. Without level readings (no analyser in
 * this browser) the clock time stands in, so the person is never stuck. */
export function talkSeconds(frames: readonly LevelFrame[], seconds: number): number {
  return frames.length >= 20 ? levelHints(frames, false).speechSeconds : seconds
}
