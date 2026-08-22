import type { VoiceEntry } from './types'

// Curated down to one male (shubh) and one female (priya) voice - the full
// bulbul:v3 roster was overwhelming with no real differentiation for most
// operators. The voice picked here is exactly what agent/main.py passes to
// sarvam.TTS; an agent already saved with a different (now-hidden) speaker
// keeps working, it just won't be selectable again from this dropdown.
export const VOICES = ['shubh', 'priya', 'aditya', 'ritu', 'rohan', 'simran', 'kavya', 'amit', 'pooja']
// bulbul:v3 is ~94% of Sarvam spend by character count. These bulbul:v2
// speakers - cheaper per Sarvam's pricing - are offered so an operator can
// compare quality against v3 before switching a live agent over. Matches
// agent/main.py's _SARVAM_V2_SPEAKERS exactly; the raw speaker name (no
// prefix) is what's stored as the agent's `voice` field, same as VOICES -
// _build_tts picks the right Sarvam model per speaker automatically.
export const SARVAM_V2_VOICES = [
  { value: 'abhilash', label: 'Abhilash (v2)' },
  { value: 'hitesh', label: 'Hitesh (v2)' },
  { value: 'karun', label: 'Karun (v2)' },
  { value: 'anushka', label: 'Anushka (v2)' },
  { value: 'arya', label: 'Arya (v2)' },
  { value: 'manisha', label: 'Manisha (v2)' },
] as const
// Google Cloud TTS voices, offered alongside Sarvam so an operator can try
// Google's voice quality directly rather than only hitting it as an
// automatic outage fallback. The "google:" prefix is how agent/main.py's
// _build_tts tells these apart from a Sarvam speaker name; only takes
// effect once GOOGLE_APPLICATION_CREDENTIALS_JSON is configured on the
// agent service - selecting one before that just falls back to Sarvam
// "shubh" silently.
export const GOOGLE_VOICES = [
  // Gemini's multilingual voice personas - not locked to one locale, this
  // same voice speaks whatever language the conversation is actually in
  // (matches _build_tts's _GOOGLE_MULTILINGUAL_VOICES set exactly).
  { value: 'google:charon', label: 'Arin - Multilingual Male' },
  { value: 'google:kore', label: 'Mira - Multilingual Female' },
  // Locale-specific, native Indian-language voices for operators who want
  // a fixed regional voice rather than the multilingual Gemini persona.
  { value: 'google:en-IN-Standard-D', label: 'English (India), Female' },
  { value: 'google:en-IN-Standard-B', label: 'English (India), Male' },
  { value: 'google:hi-IN-Standard-A', label: 'Hindi, Female' },
  { value: 'google:hi-IN-Standard-B', label: 'Hindi, Male' },
  { value: 'google:mr-IN-Standard-A', label: 'Marathi, Female' },
  { value: 'google:mr-IN-Standard-B', label: 'Marathi, Male' },
  { value: 'google:ta-IN-Standard-A', label: 'Tamil, Female' },
  { value: 'google:ta-IN-Standard-B', label: 'Tamil, Male' },
  { value: 'google:te-IN-Standard-A', label: 'Telugu, Female' },
  { value: 'google:te-IN-Standard-B', label: 'Telugu, Male' },
  { value: 'google:kn-IN-Standard-A', label: 'Kannada, Female' },
  { value: 'google:kn-IN-Standard-B', label: 'Kannada, Male' },
  { value: 'google:ml-IN-Standard-A', label: 'Malayalam, Female' },
  { value: 'google:ml-IN-Standard-B', label: 'Malayalam, Male' },
  { value: 'google:gu-IN-Standard-A', label: 'Gujarati, Female' },
  { value: 'google:gu-IN-Standard-B', label: 'Gujarati, Male' },
  { value: 'google:bn-IN-Standard-A', label: 'Bengali, Female' },
  { value: 'google:bn-IN-Standard-B', label: 'Bengali, Male' },
  { value: 'google:pa-IN-Standard-A', label: 'Punjabi, Female' },
  { value: 'google:pa-IN-Standard-B', label: 'Punjabi, Male' },
] as const
// Two premium voices from the operator's own ElevenLabs account -
// multilingual by model (eleven_flash_v2_5 in agent/main.py), not by voice,
// so either can speak every language this platform supports. The
// "elevenlabs:" prefix is how _build_tts tells these apart from a Sarvam
// speaker name; only takes effect once ELEVEN_API_KEY is configured on the
// agent service - selecting one before that just falls back to Sarvam
// "shubh" silently, same as an unconfigured Google voice above. Vendor name
// stays out of the label - same "operator sees a Vistrow tier, not which
// vendor model powers it" convention as MODEL_OPTIONS below.
// "Premium+" (ElevenLabs v3, [audio tag] support) was folded back into
// Premium on 2026-07-14 - v3's realtime endpoint 403s in production, so it
// was never usable for live calls without a choppy non-streaming workaround.
// Every voice below runs on Flash v2.5 now; Abhi/Monika/Saavi are the three
// that used to be v3-only. server/calls_db.py's init_tables() rewrites any
// stored "elevenlabs-v3:" voice to the matching "elevenlabs:" entry here.
export const ELEVENLABS_VOICES = [
  { value: 'elevenlabs:zT03pEAEi0VHKciJODfn', label: '✨ Saurabh (Male)' },
  { value: 'elevenlabs:zmh5xhBvMzqR4ZlXgcgL', label: '✨ Siya (Female)' },
  { value: 'elevenlabs:FmBhnvP58BK0vz65OOj7', label: '✨ Viraj (Male)' },
  { value: 'elevenlabs:cFvQm3lZl5miSWHxawFj', label: '✨ Aarush (Male)' },
  { value: 'elevenlabs:UgBBYS2sOqTuMpoF3BR0', label: '✨ Mark (English)' },
  { value: 'elevenlabs:7qBNUtXRGP0jPi0H4r8k', label: '✨ Abhi (Male)' },
  { value: 'elevenlabs:1qEiC6qsybMkmnNdVMbK', label: '✨ Monika (Female)' },
  { value: 'elevenlabs:9lx2GDtpvyyNBM7O9Mmx', label: '✨ Saavi (Female)' },
  { value: 'elevenlabs:mActWQg9kibLro6Z2ouY', label: '✨ Riya (Female)' },
] as const
// The agent voice picker is now driven by the account's curated menu
// (GET /voices/mine, see the Voices page) rather than these hardcoded arrays.
// The arrays are kept only as a label lookup for a legacy/out-of-menu voice a
// stored agent might still carry (e.g. a google: voice), so the dropdown's
// fallback option shows a friendly name instead of the raw string.
export const voiceLabel = (voice: string) =>
  GOOGLE_VOICES.find((v) => v.value === voice)?.label ??
  ELEVENLABS_VOICES.find((v) => v.value === voice)?.label ??
  SARVAM_V2_VOICES.find((v) => v.value === voice)?.label ??
  (VOICES.includes(voice) ? voice : undefined) ??
  voice
// Tier display order in the picker's optgroups - premium tiers first.
export const VOICE_TIER_ORDER = ['premium', 'standard', 'lite'] as const

// Lite voices share the same 0.5x billing tier, but the picker keeps Sarvam
// v2 and Google Cloud voices in separate groups so operators can deliberately
// choose the provider/voice family they want to test.
export const voicePickerGroups = (voices: VoiceEntry[]) => [
  ...VOICE_TIER_ORDER.filter((tier) => tier !== 'lite').map((tier) => ({
    key: tier,
    label: voices.find((v) => v.tier === tier)?.tierLabel ?? tier,
    note: voices.find((v) => v.tier === tier)?.tierNote ?? '',
    voices: voices.filter((v) => v.tier === tier && !v.preview),
  })),
  {
    key: 'sarvam-lite',
    label: 'Vistrow Lite v2',
    note: '0.5x credits · multilingual',
    voices: voices.filter((v) => v.tier === 'lite' && !v.value.startsWith('google:') && !v.value.startsWith('google31:')),
  },
  {
    key: 'next-preview',
    label: 'Vistrow Next Preview',
    note: '1x credits · testing only · experimental multilingual voices',
    voices: voices.filter((v) => v.preview),
  },
  {
    key: 'multilingual-lite',
    label: 'Vistrow Multilingual',
    note: '0.5x credits · same voice switches languages live',
    voices: voices.filter((v) => v.multilingual && !v.preview),
  },
  {
    key: 'native-lite',
    label: 'Vistrow Native',
    note: '0.5x credits · native Indian languages',
    voices: voices.filter((v) => v.tier === 'lite' && v.value.startsWith('google:') && !v.multilingual),
  },
]
// Vistrow tier name + quality tag is the primary label (see
// platform_assistant.py - the vendor never gets named to a prospect on a
// live call), but the dashboard's own model picker shows the raw model
// value in parentheses too, since an operator picking between tiers needs
// to know which is actually the newer/faster one, not just a marketing
// name. Order = premium → economy.
export const MODEL_OPTIONS = [
  { value: 'gpt-4.1', label: 'Vistrow Prime', tag: 'Best reasoning & quality' },
  { value: 'gpt-4o', label: 'Vistrow Pro', tag: 'Fast & natural' },
  { value: 'gpt-4.1-mini', label: 'Vistrow Swift', tag: 'Fastest & most consistent · recommended' },
  { value: 'gpt-4o-mini', label: 'Vistrow Standard', tag: 'Balanced' },
  { value: 'gemini-3.6-flash', label: 'Vistrow Flash', tag: 'Fast' },
  { value: 'gemini-3.5-flash-lite', label: 'Vistrow Lite', tag: 'Lowest cost' },
] as const
// Groq runs open-weight models on its own LPU hardware — the fastest
// time-to-first-token available (~120-180ms published, vs ~900ms for
// gpt-4.1-mini at our prompt size). Admin-only for now: the speed is
// measured, the Hindi/Marathi quality is not. server/token_api.py enforces
// the same restriction, so hiding these here is UX, not the security
// boundary. Same treatment as preview voices.
export const ADMIN_ONLY_MODELS = [
  { value: 'groq/openai/gpt-oss-20b', label: 'Groq GPT-OSS 20B', tag: 'Admin only · testing · needs paid Groq tier' },
  { value: 'groq/openai/gpt-oss-120b', label: 'Groq GPT-OSS 120B', tag: 'Admin only · testing · needs paid Groq tier' },
  { value: 'groq/qwen/qwen3.6-27b', label: 'Groq Qwen3.6 27B', tag: 'Admin only · testing · needs paid Groq tier' },
] as const

export const modelOptionsFor = (isPlatformOwner: boolean) =>
  isPlatformOwner ? [...MODEL_OPTIONS, ...ADMIN_ONLY_MODELS] : MODEL_OPTIONS

export const modelLabel = (value: string) =>
  MODEL_OPTIONS.find((m) => m.value === value)?.label ??
  ADMIN_ONLY_MODELS.find((m) => m.value === value)?.label ??
  value
// Presets for Sarvam bulbul:v3's own pace/temperature/pitch - controls how
// the voice is actually delivered (speed + prosodic variation), separate
// from the LLM's wording. Must mirror agent/main.py's TONE_PRESETS exactly.
export const TONES = [
  {
    value: 'professional',
    label: 'Professional',
    description: 'Measured and steady - slower pace, low variation. Good for formal or informational agents.',
  },
  {
    value: 'balanced',
    label: 'Balanced',
    description: "The platform's natural conversational default - a good starting point for most agents.",
  },
  {
    value: 'casual',
    label: 'Casual',
    description: 'Faster and more expressive - livelier pitch/pace variation. Fixes a flat or robotic-sounding voice.',
  },
] as const
// How strongly the live per-turn caller-emotion detection (agent/emotion.py)
// shows up in delivery - voice_settings on ElevenLabs, pace/pitch on
// Sarvam. Matches agent/main.py's _EMOTION_INTENSITY_MULTIPLIERS exactly.
export const EMOTION_INTENSITIES = [
  { value: 'off', label: 'Off', description: 'Flat delivery - ignores detected caller emotion entirely.' },
  { value: 'subtle', label: 'Subtle', description: 'A light shift in delivery when the caller sounds frustrated, confused, or excited.' },
  { value: 'strong', label: 'Strong', description: 'Full reactivity - the default. Noticeably warmer or calmer depending on the caller.' },
] as const
export const LANGUAGES = [
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
] as const
