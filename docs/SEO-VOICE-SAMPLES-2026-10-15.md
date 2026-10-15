# Language-switch voice samples on /languages pages (2026-10-15)

Each of the 10 language pages now has a short, listenable two-speaker sample call. The caller starts in Hindi and switches to the page's language at turn 3, and the AI agent follows. On /languages/hindi the switch is from Hindi to English. Each sample reuses the scenario of the page's existing written example.

- Audio: `web-demo/public/media/samples/<slug>-switch.m4a` (AAC-LC, 64 kbps, mono, 24 kHz, moov atom first).
- Transcript and timings: `web-demo/src/lib/voiceSamples.ts`.
- Player: `web-demo/src/components/VoiceSamplePlayer.tsx`, used in `LanguageDetail.tsx`.
- Structured data: an `AudioObject` added to the page JSON-LD next to the FAQPage.

## How it was made

1. **Script.** Lines were drafted with Sarvam `sarvam-105b-conversations` at temperature 0.3, from per-turn outlines.
   - Round 1 (7 turns): reviewed with 43 post-edits.
   - Round 2: extended to 8 turns, using the round-1 lines as drafts.
   - Round 3, a "make it longer" pass, was rejected. It wrote Hindi turns in the target language, padded lines and invented facts (a "confirmation message", "your real-estate partner").
   - The final lines are round 2 with light extensions and the fixes below.
2. **Voice.** Lines were voiced with Sarvam TTS `bulbul:v4-flash`, the model our Bharat voices use in calls; the API rejects `bulbul:v4`.
   - Speakers: agent `ritu_hi_customer` (female), caller `shubh_hi_customer` (male).
   - `target_language_code` was set per line and pace was 0.85. At pace 1.0 most calls came in under 35 s.
3. **Stitch.** Each line was trimmed to 40 ms around audible speech and normalised to -20 dBFS RMS (peak capped at 0.97). Lines were joined with 350 ms gaps, plus 250 ms lead-in and 450 ms tail, then encoded with macOS `afconvert`.

Product behaviour the scripts follow:
- The agent follows the caller's language.
- It books or notes details.
- It never quotes prices and never offers a transfer.
- All the businesses are the same made-up demo businesses as the written examples.

## Fixes applied to Sarvam's output (main ones)

- **Wrong language:** Hindi turns written in the target language (Kannada and Punjabi round 2, Kannada round 1), and an English turn written in Hindi (Hindi page). The lines were rewritten in the right language.
- **Persona errors:** "calling from Artha" (Artha is the agent, not the business) and a masculine verb form for the female agent. Both corrected.
- **Times:** "a.m./p.m." replaced by native morning/evening words so the TTS reads them naturally.
- **Names:** caller names written in the target script.
- **Words the TTS misread** (found by the round-trip check below):
  - Malayalam turn 2 dropped its last words; re-voiced as "2BHK के options हैं".
  - Kannada turn 1: "flat" is now written as फ्लैट.
  - Gujarati turn 1: "Invoice" is now written as इनवॉइस नंबर.

## Checks

- **Round trip.** Every voiced line (80) was transcribed with Sarvam STT `saarika:v2.5` using language auto-detect.
  - Detected language matched the script for 76 of 80 lines.
  - The 4 mismatches are expected:
    - 2 code-mixed Hindi lines were detected as en-IN.
    - The Punjabi line "my name is Gurpreet Singh" is identical in Hindi.
    - One Odia line came back romanised as en-IN.
  - Transcripts matched the script's content. Remaining differences are transliteration of English loanwords and numbers read out as words.
  - Turn 3, the switch, was detected in the target language on every page.
- **Encoded files.** Each m4a was decoded back to PCM:
  - correlation with the source was 0.999;
  - RMS was about 0.095 and peak at most 0.96;
  - the longest silence was 0.8 s, so no dropouts.
- **Browser.** A 375 px check on a range-capable local server found no horizontal scroll. Nothing loads before play (`preload="none"`, readyState 0). Play, pause and "jump to the switch" work, and the active line is highlighted.

| Page | Scenario | Switch | Switch at | Duration | File size |
|---|---|---|---|---|---|
| /languages/hindi | Outbound EMI reminder (Saarthi Finance) | Hindi to English | 0:16 | 40.4 s | 325 KB |
| /languages/marathi | Home blood-sample booking, Pune lab | Hindi to Marathi | 0:10 | 46.1 s | 369 KB |
| /languages/tamil | OMR property enquiry follow-up | Hindi to Tamil | 0:09 | 39.8 s | 320 KB |
| /languages/telugu | Clinic appointment | Hindi to Telugu | 0:09 | 37.5 s | 302 KB |
| /languages/kannada | Whitefield 2BHK enquiry | Hindi to Kannada | 0:08 | 38.8 s | 312 KB |
| /languages/malayalam | Kochi 2BHK, caller in Dubai | Hindi to Malayalam | 0:11 | 40.9 s | 329 KB |
| /languages/gujarati | Invoice 1042 payment reminder, Surat | Hindi to Gujarati | 0:11 | 37.1 s | 299 KB |
| /languages/bengali | Order 5821 status | Hindi to Bengali | 0:07 | 35.3 s | 285 KB |
| /languages/punjabi | Canada study-visa counselling | Hindi to Punjabi | 0:08 | 35.7 s | 288 KB |
| /languages/odia | Class 10 demo class, Bhubaneswar | Hindi to Odia | 0:09 | 36.1 s | 291 KB |

## Usage

| Service | Requests | Volume | Notes |
|---|---|---|---|
| LLM (`sarvam-105b-conversations`) | 33 | 24,047 prompt + 16,768 completion tokens | Includes the rejected round 3 |
| TTS | 173 | 10,316 characters | Includes a pace 1.0 pass, a pace 0.85 pass and 6 re-voiced lines; about ₹10 at ₹1 per 1,000 characters |
| STT | 86 | About 6.5 minutes of audio | |

## Not verified

- **Native-speaker review**, per language, of both the wording and the pronunciation. Native wording in the non-Hindi turns was reviewed by Claude, not by a native speaker.
- **Gujarati "1042".** Sarvam STT heard Gujarati turn 1's "1042" as "दस सौ बयालीस" (ten hundred forty-two). It may be read oddly.
- **Real devices.** Playback has not been checked on iOS Safari or a real phone.
