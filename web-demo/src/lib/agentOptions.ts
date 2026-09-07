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
  ({ 'google31:kore': 'Mira Next (Preview)', 'google31:charon': 'Arin Next (Preview)' } as Record<string, string>)[voice] ??
  GOOGLE_VOICES.find((v) => v.value === voice)?.label ??
  ELEVENLABS_VOICES.find((v) => v.value === voice)?.label ??
  SARVAM_V2_VOICES.find((v) => v.value === voice)?.label ??
  (VOICES.includes(voice) ? voice : undefined) ??
  voice
// The picker is ordered by credit multiplier first, then by product family.
// A voice belongs to exactly one group: the old tier-first implementation
// duplicated Google multilingual voices inside Premium, then showed their
// 2x group again *after* two 1x groups.
export const voicePickerGroups = (voices: VoiceEntry[]) => [
  {
    key: 'expressive',
    label: 'Vistrow Expressive',
    note: '2x credits · most expressive · switches languages live',
    voices: voices.filter((v) => v.tier === 'premium' && v.multilingual && !v.preview),
  },
  {
    key: 'premium',
    label: 'Premium',
    note: '2x credits · natural conversational voices',
    voices: voices.filter((v) => v.tier === 'premium' && !v.multilingual && !v.preview),
  },
  {
    key: 'standard',
    label: 'Standard',
    note: '1x credits',
    voices: voices.filter(
      (v) => v.tier === 'standard' && !v.multilingual && !v.preview && !v.value.toLowerCase().includes('chirp3'),
    ),
  },
  {
    key: 'chirp3-hd',
    label: 'Vistrow HD',
    note: '1x credits · fast HD · switches languages live',
    voices: voices.filter((v) => v.value.toLowerCase().includes('chirp3') && !v.preview),
  },
  {
    key: 'next-preview',
    label: 'Next Preview',
    note: '1x credits · experimental · testing only',
    voices: voices.filter((v) => v.preview),
  },
  {
    key: 'native-lite',
    label: 'Vistrow Native',
    note: '0.75x credits · native Indian languages',
    voices: voices.filter((v) => v.tier === 'lite' && v.value.startsWith('google:') && !v.multilingual),
  },
]
// Vistrow tier name + quality tag is the primary label (see
// platform_assistant.py - the vendor never gets named to a prospect on a
// live call), but the dashboard's own model picker shows the raw model
// value in parentheses too, since an operator picking between tiers needs
// to know which is actually the newer/faster one, not just a marketing
// name. Order = premium → economy.
//
// Three removed on 2026-09-05, each measured against this product's own
// workload (the real ~8,900-token prompt with all 11 tools bound) rather
// than on reputation:
//
//   gpt-4.1  "Prime - Best reasoning & quality"   30,000 TPM = 3.4 turns
//   gpt-4o   "Pro - Fast & natural"               30,000 TPM = 3.4 turns
//
//     Both sit on a 30k tokens/minute limit against the minis' 200k, and
//     cached tokens count toward it (a fully-cached 7,213-token request
//     still consumed 4,541 TPM). At this prompt size that is under four
//     turns a minute for the whole organisation, so a single busy call
//     rate-limits itself and the plugin's retries turn that into
//     multi-second stalls. They also bill premium_plus, 4x credits. There
//     is no sense in which they were the "best" option; the labels said so
//     anyway.
//
//   gemini-3.6-flash  "Flash - Fast"              1,921ms, scored 6/12
//
//     The slowest of the six by ~800ms, and it failed the three checks that
//     matter most: it denied a project the catalog carries, quoted a price
//     the catalog contradicts, and answered a Hindi caller in English 0/2.
//     "Fast" was wrong in both senses.
//
// No agent was on any of the three. They stay in calls_db's tier maps so
// the four historical calls that used them still bill correctly.
//
// The tags below are what the survivors actually measured, not tier
// marketing. Note in particular that "Lite" was labelled "Lowest cost"
// while billing 2x, and "Standard" bills 1x - the old copy had it exactly
// backwards.
export const MODEL_OPTIONS = [
  { value: 'gpt-4.1-mini', label: 'Vistrow Swift', tag: 'Recommended · most accurate in testing' },
  { value: 'gemini-3.5-flash-lite', label: 'Vistrow Lite', tag: 'Same accuracy as Swift, a touch faster' },
  { value: 'gpt-4o-mini', label: 'Vistrow Standard', tag: 'Half the credits · slightly less accurate' },
] as const
// Groq was listed here on its published time-to-first-token — 120-180ms
// against gpt-4.1-mini's ~1,000ms — and removed on 2026-09-07 when the two
// production calls that had actually run it were finally looked at:
//
//   call 853  groq/openai/gpt-oss-20b   llmTtft 5,099ms
//   call 854  groq/openai/gpt-oss-20b   llmTtft 0ms (metric artefact)
//   gpt-4.1-mini, same period           llmTtft 1,082ms median over 260 turns
//
// Five seconds to first token, and both calls produced one or two agent
// turns in a minute — the operator's report was "I test it and it's not
// working", which is what a five-second wait sounds like on a phone.
//
// The published figure is real, on a paid tier with reserved capacity. On
// the free tier this account uses, it queues. The dropdown said "free-tier
// limits apply" and that was not enough: it sat directly under the speed
// claim, so the only reason anyone would pick it was speed it does not
// deliver here.
//
// Two of these model ids may not exist at all (qwen3.6-27b, qwen3.8-27b were
// never observed in any call). Not investigated, because nothing should
// select them either way.
//
// If a paid Groq tier is ever bought, re-list them — but benchmark against
// this platform's own Hindi/Marathi checks first, the way gpt-4.1-nano was
// disqualified at 2/12 for being fast and wrong.
export const ADMIN_ONLY_MODELS = [
  {
    value: 'gemini-live',
    label: 'Gemini Live 2.5 (Preview)',
    tag: 'Speech-to-speech · admin testing · Indic quality unverified',
  },
  {
    // Newer, and worse for this platform. The plugin warns that any "3.1"
    // Live model has limited mid-session update support: instructions, chat
    // context and tool updates are not applied until the next session. Every
    // per-turn guard here is a system message added in
    // on_user_turn_completed — the objective that stops the funnel
    // overriding a caller's question, the garbled handling, the site-visit
    // suppression. On 3.1 they are accepted and silently ignored.
    value: 'gemini-live:gemini-3.1-flash-live-preview',
    label: 'Gemini Live 3.1 (Preview)',
    tag: 'Newer, but per-turn guards do NOT apply · raw testing only',
  },
] as const

// Kept out of the dropdown but still resolvable, so calls 853 and 854 render
// under a name instead of leaking the raw vendor string at a tenant.
const RETIRED_ADMIN_MODELS = [
  { value: 'groq/openai/gpt-oss-20b', label: 'Groq GPT-OSS 20B' },
  { value: 'groq/openai/gpt-oss-120b', label: 'Groq GPT-OSS 120B' },
  { value: 'groq/qwen/qwen3.6-27b', label: 'Groq Qwen3.6 27B' },
  { value: 'groq/qwen/qwen3.8-27b', label: 'Groq Qwen3.8 27B' },
] as const

export const modelOptionsFor = (isPlatformOwner: boolean) =>
  isPlatformOwner ? [...MODEL_OPTIONS, ...ADMIN_ONLY_MODELS] : MODEL_OPTIONS

// Retired tiers, kept ONLY so a call recorded on one still renders under the
// name the operator picked. Deliberately not in MODEL_OPTIONS, so they cannot
// be selected again. Without this, modelLabel falls through to the raw value
// and the call history starts printing "gpt-4.1" at a tenant — the exact
// vendor-name leak calls_db guards against everywhere else.
const RETIRED_MODELS = [
  { value: 'gpt-4.1', label: 'Vistrow Prime' },
  { value: 'gpt-4o', label: 'Vistrow Pro' },
  { value: 'gemini-3.6-flash', label: 'Vistrow Flash' },
] as const

export const modelLabel = (value: string) =>
  MODEL_OPTIONS.find((m) => m.value === value)?.label ??
  ADMIN_ONLY_MODELS.find((m) => m.value === value)?.label ??
  RETIRED_ADMIN_MODELS.find((m) => m.value === value)?.label ??
  RETIRED_MODELS.find((m) => m.value === value)?.label ??
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
// A quiet, looping office-ambience track mixed into the agent's own audio -
// matches agent/main.py's ambient_noise handling exactly. Off by default:
// unproven on real calls, so an operator opts in per agent.
export const AMBIENT_NOISE_OPTIONS = [
  { value: 'off', label: 'Off', description: 'Clean, studio-quiet audio - the default.' },
  { value: 'on', label: 'On', description: 'A subtle office-ambience loop, mixed in quietly under the agent’s voice.' },
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

// Background noise suppression on the CALLER's audio, before it reaches
// speech recognition. Not one right answer, which is why it is per agent:
// measured on this platform, the telephony-tuned filter destroyed a caller's
// speech on an 8kHz phone leg — four consecutive calls transcribed zero
// caller turns, and the same agent with it off transcribed nine — while a
// browser call carries wideband audio where suppression is more likely to
// help than hurt.
export const NOISE_CANCELLATION_OPTIONS = [
  { value: '', label: 'Default', description: 'Tuned for the channel — telephony filtering on calls, wideband in the browser' },
  { value: 'off', label: 'Off', description: 'No filtering. Try this first if callers are heard as silence on phone calls' },
  { value: 'general', label: 'Wideband', description: 'The browser-grade filter on phone calls too' },
] as const
