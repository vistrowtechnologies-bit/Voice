import type { VoiceEntry } from './types'

// The agent voice picker is driven by the account's curated menu (GET
// /voices/mine, see the Voices page). Voice and model values are neutral
// public ids (server/public_ids.py); the server sends each voice's name, so
// this only covers a voice neither in the menu nor named by the server.
export const voiceLabel = (_voice: string, name?: string) => name || 'Earlier voice'
// The picker is ordered by credit multiplier first, then by product family.
// A voice belongs to exactly one group: the old tier-first implementation
// duplicated Google multilingual voices inside Premium, then showed their
// 2x group again *after* two 1x groups.
// The agent's voice picker groups voices exactly as the Voices page tabs do,
// so a voice added there always shows here under the same name. The old
// fixed groups had no slot for Bharat (sarvam4:) voices, which are standard
// AND multilingual, so every one an owner added silently vanished from the
// picker (17 Oct). "Other" catches anything a future voice family adds
// before it gets a group of its own: a voice the owner added is never hidden.
// The server says which family a voice is in (public_ids.voice_family); the
// id itself is neutral and says nothing.
export const voicePickerGroups = (voices: VoiceEntry[]) => {
  const stable = voices.filter((v) => !v.preview)
  const groups: { key: string; label: string; note: string; voices: VoiceEntry[] }[] = [
    {
      key: 'native',
      label: 'Vistrow Native',
      // FIXED 2026-10-14 (PR #93): the distortion below was Google answering a PCM
      // request with MP3; main.py now asks for LINEAR16 (clean on call 1278).
      // Measured on call 885 (agent 26 set to google:hi-IN-Standard-A / Aditi):
      // audible distortion, 402ms TTS TTFB, and NOT ONE caller turn transcribed
      // across the whole call — the agent checked in twice and hung up on a
      // caller who was talking to it. Google rejects this whole family on the
      // streaming endpoint ("only Chirp 3: HD voices are supported for
      // streaming synthesis"), so main.py runs them through a StreamAdapter
      // sentence-chunking workaround, and that is what the caller hears.
      // Warned rather than hidden: they are cheaper and some tenants may be on
      // one already, so an operator picking one deserves to know before a live
      // call rather than after.
      note: '1 min per min · one language each · a little slower to start',
      voices: voices.filter((v) => v.family === 'native'),
    },
    {
      key: 'bharat',
      label: 'Bharat',
      note: '1 min per min · Indian persona voices · switches language live',
      // New persona voices first (they preview in any language), then the
      // classic ones.
      voices: [
        ...stable.filter((v) => v.tier === 'standard' && v.family === 'bharat' && v.previewAnyLanguage),
        ...stable.filter((v) => v.tier === 'standard' && v.family === 'bharat' && !v.previewAnyLanguage),
      ],
    },
    {
      key: 'hd',
      label: 'Vistrow HD',
      note: '1 min per min · fastest voices · switches language mid-call',
      voices: stable.filter((v) => v.tier === 'standard' && v.family === 'hd'),
    },
    {
      key: 'expressive',
      label: 'Vistrow Expressive',
      note: '2 min per min · follows the caller’s emotion · switches languages live',
      voices: stable.filter((v) => v.tier === 'premium' && v.multilingual),
    },
    {
      key: 'studio-lite',
      label: 'Studio Lite',
      note: '2 min per min · lower latency and cost · test before live calls',
      voices: voices.filter((v) => v.preview && v.family === 'studio-lite'),
    },
    {
      key: 'studio',
      label: 'Studio',
      note: '2 min per min · richer expression and voice fidelity · test before live calls',
      voices: voices.filter((v) => v.preview && v.family === 'studio'),
    },
    {
      key: 'premium',
      label: 'Premium',
      note: '2 min per min · natural conversational voices',
      voices: stable.filter((v) => v.tier === 'premium' && !v.multilingual),
    },
  ]
  const placed = new Set(groups.flatMap((g) => g.voices.map((v) => v.value)))
  const rest = voices.filter((v) => !placed.has(v.value))
  if (rest.length) groups.push({ key: 'other', label: 'Other voices', note: 'added on the Voices page', voices: rest })
  return groups
}
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
  { value: 'vistrow-bharat-1', label: 'Vistrow Bharat', tag: 'Recommended · fastest, built for Indian languages' },
] as const
// 2026-10-12: Vistrow Swift (gpt-4.1-mini) left the tenant picker. Real test
// calls on the production worker, same question, Chirp 3 voice: Sarvam's turn
// was 0.6-0.9 s against Swift's 1.65-2.8 s in both Hindi and English, Swift
// said "10 pm" for 10 am in Hindi, and (on the 12 Oct pricing) it billed 2 credits a
// minute against 1. Since 13 Oct both bill 2 credits a minute again.
// It is in RETIRED_MODELS so existing agents keep their label and keep working.
// 2026-10-08: only the models that pass the speed and accuracy bar are offered.
// Measured on production calls (docs/INTERNATIONAL-EXPANSION-PLAN-2026-10-07.md
// section 8.1): Sarvam 105B answers in about 0.5 s, gpt-4.1-mini in about 1.1 s.
// gpt-4o-mini is slower and less accurate than 4.1-mini, and gemini-3.5-flash-lite
// has no measured production calls and depends on the Gemini API balance. They
// stay in RETIRED_MODELS below so existing agents keep their label and keep
// working; the editor shows them as the current value until the operator picks
// one of the offered models.
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
// 2026-10-06: RE-LISTED for the platform owner only (see ADMIN_ONLY_MODELS) so
// speech-to-speech can be measured on real calls against the pipeline. What
// changed since the park below: every call type now records the perceived
// caller-stop -> first-audio time (latency_metrics.callerStopToFirstAudioMs),
// which is the like-for-like instrument the notes below said was missing.
// Tenants still cannot select these - the server refuses gemini-live* models
// for anyone but the platform owner.
//
// Gemini Live was PARKED, not removed. Three admin test calls on 2026-09-07:
// audio worked once and was silent twice, the working one opened with "Sorry,
// I didn't catch that" before the caller had spoken, and it felt slower than
// the pipeline it was meant to beat.
//
// The blocker is not any of those individually — it is that the realtime path
// emits NO latency metrics at all. providers comes back empty and
// eouMs/llmTtftMs/ttsTtfbMs are absent, because every one of them is measured
// at a pipeline stage speech-to-speech does not have. So the architecture
// adopted specifically to reduce latency reports no latency, and the only
// instrument left is the operator's ear.
//
// The reasoning that led here still stands and is worth keeping: a six-token
// prompt costs 1,093ms and the full 38.6k prompt with 11 tools costs 935ms,
// so the LLM second is the OpenAI round trip and nothing inside OpenAI —
// prompt size, model choice, tier — can touch it. Removing the hop is the only
// structural answer.
//
// Re-list these only after the realtime path reports per-turn latency. Then
// test the 700ms turn-detection fix (never yet exercised — every fragmenting
// sample predates it), then compare against the pipeline's measured 1.64s. In
// that order: the last attempt did it backwards.
// SHELVED 2026-09-07 after call 878 measured it. Not a judgement call any
// more — the numbers are in, and they say speech-to-speech does not buy us
// what it was wanted for. Tenants stay on the STT/LLM/TTS pipeline.
//
//   realtimeTtftMs = [0, 312, 1647, 2556]
//
// The 0 is the greeting (generate_reply, no caller turn before it) and 312
// is an unprompted follow-up the model emitted at 7.4s before the caller had
// said anything. The two real caller-triggered turns cost 1647ms and 2556ms.
//
// The pipeline's full turn is eou 402 + llm 1082 + tts 160 = 1644ms. So
// Gemini Live is level on one turn and ~1.5x worse on the other. That is the
// GENEROUS reading: RealtimeModelMetrics.ttft starts when Gemini's own VAD
// decides the caller stopped, so it excludes the endpointing wait the 402ms
// covers. Like-for-like against llm+tts (1242ms) it is 1.3x-2x slower.
//
// Worse than the latency: on that call the agent started speaking at 35.7s
// while the caller was still talking until 41.9s — 6.2s of talking over them.
// Gemini's AutomaticActivityDetection called end-of-turn mid-sentence, and
// there were two "Caller away" stretches where it heard nothing at all.
//
// One thing DID work and is worth keeping if this is ever revived: the 700ms
// turn-detection fix. "जी बताइए नाम क्या है आपका" arrived as one turn rather
// than fragmenting into three.
//
// Never tested, and still the question that would decide it: this bypasses
// Sarvam, which is the only reason Indian place names are heard here at all
// (5/5 vs Google STT's 0/5 on बानेर, ट्रिटोपिया, हिंजवडी). There is now no
// latency win to trade that against, so the test was not worth running.
//
// Reviving needs a reason beyond latency; agent 26 ("Artha · Gemini Live test",
// account 2) is the existing test agent for it.
// Keep an explicit item type even while the selectable admin-only list is
// empty. `[] as const` becomes readonly never[], which makes modelLabel's
// compatibility lookup fail the TypeScript production build.
// Keep the explicit item type even while this list is empty. `[] as const`
// becomes readonly never[], which makes modelLabel's compatibility lookup fail
// the TypeScript production build (tsc -b, which `tsc --noEmit` does not
// reproduce - that difference shipped a broken Vercel build once already).
export const ADMIN_ONLY_MODELS: readonly { value: string; label: string; tag?: string }[] = [
  { value: 'vistrow-nano-lab', label: 'Vistrow Nano Lab', tag: 'Experimental · lowest cost; measure quality before rollout' },
  // Re-listed at the platform owner's request for a controlled retest. Keep
  // this owner-only: prior calls showed slower audio and turn-handling errors.
  // Owner, 18 Oct 2026: 3.8 Live is the primary realtime model (Google GA,
  // same price as 3.1). 3.1 (Google shutdown from 17 Nov 2026) and 2.5 are
  // retired and, from 19 Oct, no longer offered; RETIRED_MODELS keeps their
  // names for call history (no agent used either on 19 Oct).
  { value: 'vistrow-live-3-8', label: 'Vistrow Live 3.8 · realtime', tag: 'Owner-only · primary realtime model · speech-to-speech in about 1-2 s' },
  // Runtime, 24 Oct (main 27e343c2): a second speech-to-speech engine.
  { value: 'vistrow-duplex-1', label: 'Vistrow Duplex · realtime', tag: 'Owner-only · testing' },
]

/** True for the speech-to-speech models: they bypass STT, the LLM and TTS. */
export const isRealtimeModel = (value: string) => value.startsWith('vistrow-live-') || value.startsWith('vistrow-duplex-')

/** Duplex speaks with its own built-in voice, so the agent's voice setting
 *  does not apply to it. */
export const usesBuiltInVoice = (value: string) => value.startsWith('vistrow-duplex-')

/** The engine every tenant agent runs on (Vistrow Bharat), and the one Live
 *  model still offered (owner-only). */
export const STANDARD_MODEL = MODEL_OPTIONS[0].value
export const LIVE_MODEL = ADMIN_ONLY_MODELS.find((m) => isRealtimeModel(m.value))!.value

/** Whether an agent on this model can speak with this voice: a Vistrow Live
 *  model needs a voice the server marks with a Live persona (livePersona);
 *  the server enforces the same on save (token_api._guard_realtime_voice).
 *  An unknown voice (not in the menu) counts as unusable on Live. */
export const voiceWorksWithModel = (model: string, voice: Pick<VoiceEntry, 'livePersona'> | undefined) =>
  !model.startsWith('vistrow-live-') || Boolean(voice?.livePersona)

/** The voice to switch to when the model changes and the current voice can't
 *  be used: the same voice if it works, else one of the same gender, else
 *  the first that works. null when none of the voices work with the model. */
export const nearestVoiceFor = (
  model: string,
  currentVoice: string,
  currentGender: VoiceEntry['gender'] | undefined,
  voices: readonly VoiceEntry[],
): VoiceEntry | null => {
  const usable = voices.filter((v) => voiceWorksWithModel(model, v))
  return (
    usable.find((v) => v.value === currentVoice) ??
    usable.find((v) => currentGender && v.gender === currentGender) ??
    usable[0] ??
    null
  )
}

// Kept out of the dropdown but still resolvable, so calls 853 and 854 render
// under a name instead of leaking the raw vendor string at a tenant.
const RETIRED_ADMIN_MODELS = [
  { value: 'vistrow-lab-20b', label: 'Vistrow Lab 20B (retired)' },
  { value: 'vistrow-lab-120b', label: 'Vistrow Lab 120B (retired)' },
  { value: 'vistrow-lab-27b', label: 'Vistrow Lab 27B (retired)' },
  { value: 'vistrow-lab-27b-2', label: 'Vistrow Lab 27B v2 (retired)' },
] as const

export const modelOptionsFor = (isPlatformOwner: boolean) =>
  isPlatformOwner ? [...MODEL_OPTIONS, ...ADMIN_ONLY_MODELS] : MODEL_OPTIONS

// Retired tiers, kept ONLY so a call recorded on one still renders under the
// name the operator picked. Deliberately not in MODEL_OPTIONS, so they cannot
// be selected again. Without this, modelLabel falls through to the raw value
// and the call history starts printing "gpt-4.1" at a tenant — the exact
// vendor-name leak calls_db guards against everywhere else.
const RETIRED_MODELS = [
  { value: 'vistrow-swift', label: 'Vistrow Swift' },
  { value: 'vistrow-prime', label: 'Vistrow Prime' },
  // Successors that retired agents were rewritten to
  // (plan_policy.OPENAI_MODEL_SUCCESSORS): same names, not offered for new picks.
  { value: 'vistrow-swift-2', label: 'Vistrow Swift' },
  { value: 'vistrow-prime-2', label: 'Vistrow Prime' },
  { value: 'vistrow-pro', label: 'Vistrow Pro' },
  { value: 'vistrow-flash', label: 'Vistrow Flash' },
  { value: 'vistrow-standard', label: 'Vistrow Standard' },
  { value: 'vistrow-lite', label: 'Vistrow Lite' },
  // 2026-10-08: Gemini Live 2.5 was retired after tests showed slower phone audio
  // (median 4.2 s vs 2.5 s on clean audio), missed greetings, repeated answers after
  // the lead tool, and premature hangups. It is now exposed only to the platform owner
  // for a controlled retest; tenant accounts cannot select it.
  { value: 'vistrow-live-2-5', label: 'Vistrow Live 2.5 (retired)' },
  { value: 'vistrow-live-3-1', label: 'Vistrow Live 3.1 (retired)' },
] as const

export const modelLabel = (value: string) =>
  MODEL_OPTIONS.find((m) => m.value === value)?.label ??
  ADMIN_ONLY_MODELS.find((m) => m.value === value)?.label ??
  RETIRED_ADMIN_MODELS.find((m) => m.value === value)?.label ??
  RETIRED_MODELS.find((m) => m.value === value)?.label ??
  (value ? 'Vistrow model' : '')
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
// A quiet, looping ambience track mixed into the agent's own audio - every
// clip livekit-agents ships, matching agent/main.py's _AMBIENT_CLIPS keys
// exactly. Off by default: unproven on real calls, so an operator opts in
// per agent. `file` is served from web-demo/public/ambience/ for the
// dashboard's own preview player - the same .ogg livekit-agents bundles,
// copied in rather than fetched at runtime, since it's a fixed built-in
// asset that never changes.
export const AMBIENT_NOISE_OPTIONS = [
  { value: 'off', label: 'Off', icon: 'volume_off', file: null, description: 'Clean, studio-quiet audio - the default.' },
  { value: 'office', label: 'Office', icon: 'apartment', file: '/ambience/office.ogg', description: 'A quiet office - the original ambience track.' },
  { value: 'city', label: 'City', icon: 'location_city', file: '/ambience/city.ogg', description: 'Distant street and traffic noise.' },
  { value: 'call_center', label: 'Call center', icon: 'support_agent', file: '/ambience/call-center.ogg', description: 'A busy room of overlapping voices, like a real support floor.' },
  { value: 'keyboard_typing', label: 'Keyboard typing', icon: 'keyboard', file: '/ambience/keyboard-typing.ogg', description: 'Someone typing nearby, as if taking notes on the call.' },
  { value: 'keyboard_typing2', label: 'Keyboard typing (alt)', icon: 'keyboard', file: '/ambience/keyboard-typing2.ogg', description: 'A second, lighter typing texture.' },
  { value: 'forest', label: 'Forest', icon: 'forest', file: '/ambience/forest.ogg', description: 'Birdsong and wind - for an outdoor or rural setting.' },
  { value: 'hold_music', label: 'Hold music', icon: 'music_note', file: '/ambience/hold-music.ogg', description: 'A looping instrumental track, like a caller on hold.' },
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
