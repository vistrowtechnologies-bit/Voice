# Gemini 2.5 input and caption follow-up — 10 October 2026

## Evidence
Owner's native 2.5 browser retest after PR18 had ordinary caller-stop to agent audio estimates of 4791, 3850 and 3555 ms. The first partial input caption/generation arrived roughly 3525 ms after raw voice on one turn, then first provider audio another 1267 ms later. Two following turns split approximately 2186+1665 and 1662+1893 ms. Agent playback callback followed provider first audio closely, but does not measure the browser's speaker. No recording was listened to. Owner also reported an earlier Hindi request appearing after later speech and Hindi rendered in Telugu script.

## Changes
- Native 2.5: END_SENSITIVITY_HIGH (Google's default), start remains HIGH, prefix 20 ms instead of 200, silence window still 500 ms. A more responsive detector may end longer pauses earlier; this requires a Hindi sentence/interruptions retest. This is a targeted configuration change, not a proven diagnosis of all upstream delay.
- Native 2.5 input captions receive the configured language hint plus English for mixed speech. These are AudioTranscriptionConfig.languageCodes hints, not the unsupported native speech_config.language_code. Automatic recognition remains available for unknown language codes. No separate STT engine is inserted. google-genai minimum2.29.0 ensures typed support.
- Native 3.1 retains LOW/200/700 and automatic transcription detection; STT/LLM/TTS pipeline unchanged.
- Browser captions now use stream header timestamps and typed send times, with stable updates/ties/fallbacks. Previously the UI incorrectly assumed no timestamps and sorted only by arrival. This fixes late delivery of an earlier published stream. A header is publication time: it cannot recover original spoken chronology if Google/LiveKit itself publishes the entire caption late. It does not correct mistranscribed words or scripts.

## Official references
- https://ai.google.dev/api/live — EndSensitivity default HIGH; prefixPaddingMs controls speech-start threshold; silenceDurationMs affects latency; AudioTranscriptionConfig.languageCodes hints; input transcriptions have no guaranteed ordering.
- https://docs.livekit.io/agents/models/realtime/plugins/gemini/ — native Google activity detection and model-specific thinking.

## Verification / remaining gate
Offline tests check actual LiveKit1.8.3 connect setup and serialized languageCodes, independent2.5/3.1 profiles, audio during greeting, timing and recovery. Frontend regression covers delayed caption chunks, partial updates, typed input, invalid timestamps, ties; production build checked. Tests do not dial or call Google.

Live2.5 acceptance of language hints and perceived latency/recognition are not validated by offline setup checks. After deployed workers are Running, owner must start a fresh session; speak a short Hindi request, a long Hindi sentence with a natural pause, mix English, and interrupt once. Compare first captions and provider first audio to raw speech; inspect errors as well. Do not declare2.5 launch-ready based on build/startup alone.
