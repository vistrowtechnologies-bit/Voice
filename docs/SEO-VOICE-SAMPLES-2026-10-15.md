# Language-switch voice samples and language-page redesign (2026-10-15)

Every /languages page now opens with a playable two-speaker sample call in the hero. The caller starts in Hindi and switches to the page's language at turn 3, and the AI agent follows. On /languages/hindi the call starts in English and switches to Hindi (changed 2026-10-23; see below). Each sample reuses the scenario of the page's written example.

## Files

- **Audio:** `web-demo/public/media/samples/<slug>-switch.m4a`. AAC-LC at 64 kbps, mono, 24 kHz, with the index at the front of the file so playback can start before it has fully downloaded.
- **Transcript and per-line start times:** `web-demo/src/lib/voiceSamples.ts`.
- **Player:** `web-demo/src/components/VoiceSamplePlayer.tsx`. It sits in the hero of `LanguageDetail.tsx`.
- **Structured data:** an `AudioObject` in the page JSON-LD, next to the FAQPage.

## Script and voice

1. **Drafts.** Sarvam `sarvam-105b-conversations` drafted the lines (33 requests). Its output needed heavy review:
   - It wrote Hindi turns in the target language, and one English turn in Hindi.
   - It got the persona wrong ("calling from Artha"; Artha is the agent) and used a masculine verb for the female agent.
   - A "make it longer" pass padded the lines and invented facts, so it was rejected.
2. **First take (replaced).** It used pace 0.85 and 350 ms gaps. The owner found it too slow and not human-sounding.
3. **Current take.** Lines were rewritten by hand as spoken phone talk, with short clauses and fillers ("हाँ हाँ", "अच्छा", "हो, चालेल ना!", "சரி", "ಹೌದು", "ঠিক আছে"). No new facts were added.
   - **Model:** Sarvam TTS `bulbul:v4-flash`. This is the model Bharat voices use in calls; the API rejects `bulbul:v4`.
   - **Voices:** agent `kavya_hi_conversational` (female), caller `aditya_hi_conversational` (male). Since 2026-10-23 the agent is `aarti_hi_customer` ("Aarti"); see below.
   - **Settings:** pace 1.2, temperature 0.7, loudness 1.1. `target_language_code` is set per line.
   - **Approval:** the owner approved the Marathi take before the other nine were made.
4. **Stitching.** Each line was trimmed to 40 ms around audible speech and normalised to -20 dBFS RMS. Lines are joined with 200 ms gaps, plus 200 ms lead-in and 400 ms tail.

The agent follows the caller's language, books or notes details, never quotes prices and never offers a transfer. All the businesses are the made-up demo businesses from the written examples.

## Checks

- **Round trip.** Every line (80) was transcribed with Sarvam STT `saarika:v2.5` using language auto-detect. No line failed.
  - **Content:** every line came back with its content intact. Differences were only transliteration of English loanwords and numbers spoken as words.
  - **Language:** the detected language matched for 78 of 80 lines. The other two are expected:
    - Punjabi "ਜੀ, ਮੇਰਾ ਨਾਂ ਗੁਰਪ੍ਰੀਤ ਸਿੰਘ ਹੈ" is identical when spoken in Hindi.
    - Odia "ସୌରଭ ମହାନ୍ତି" is a name only.
  - **Switch turn:** turn 3 was detected in the target language on every page.
- **Pronunciation fixes:**
  - **"Kothrud":** was misheard once ("कोर्टरूड"). The line now spells it कोथरूड and STT hears it correctly.
  - **Odia turn 4:** had a 1.8 s pause after an exclamation mark. It was re-voiced with "।" and now has no gap over 0.42 s.
- **Encoded files.** Each m4a was decoded back to PCM:
  - correlation with the source was 0.998 or better;
  - RMS was about 0.096 and peak at most 0.70;
  - the longest silence was 0.58 s or less.

Current files (Aarti agent voice, 2026-10-23):

| Page | Scenario | Switch | Switch at | Duration | Size |
|---|---|---|---|---|---|
| /languages/hindi | Outbound EMI reminder (Saarthi Finance) | Agent-led, English to Hindi (pilot) | 0:10 | 30.3 s | 241 KB |
| /languages/marathi | Home blood-sample booking, Pune lab | Hindi to Marathi | 0:07 | 31.3 s | 249 KB |
| /languages/tamil | OMR property enquiry follow-up | Hindi to Tamil | 0:08 | 29.4 s | 234 KB |
| /languages/telugu | Clinic appointment | Hindi to Telugu | 0:07 | 28.6 s | 227 KB |
| /languages/kannada | Whitefield 2BHK enquiry | Hindi to Kannada | 0:08 | 32.6 s | 259 KB |
| /languages/malayalam | Kochi 2BHK, caller in Dubai | Hindi to Malayalam | 0:09 | 28.9 s | 230 KB |
| /languages/gujarati | Invoice 1042 reminder, Surat | Hindi to Gujarati | 0:10 | 30.6 s | 243 KB |
| /languages/bengali | Order 5821 status | Hindi to Bengali | 0:06 | 27.3 s | 217 KB |
| /languages/punjabi | Canada study-visa counselling | Hindi to Punjabi | 0:08 | 29.8 s | 237 KB |
| /languages/odia | Class 10 demo class, Bhubaneswar | Hindi to Odia | 0:08 | 27.8 s | 221 KB |

## 2026-10-23: Hindi sample now ends in Hindi

The owner flagged that the /languages/hindi sample switched from Hindi to English, so the Hindi page's demo ended in English. It was re-scripted and re-voiced:
- **Script:** same scenario and facts (Artha from Saarthi Finance, Rahul ji, EMI due on the 15th, salary on the 12th, paying through the app on the 13th). Turns 1-2 are in English; at turn 3 the caller asks to talk in Hindi; the agent follows in Hindi (Hinglish loanwords: payment, salary, app, note, thanks) for the rest. The agent uses feminine forms ("मैं note कर लेती हूँ"), quotes no prices and offers no transfer.
- **Voice:** same as above (`bulbul:v4-flash`, kavya/aditya conversational, pace 1.2, temperature 0.7, loudness 1.1), `target_language_code` en-IN for lines 1-2 and hi-IN for lines 3-8. Same trimming, -20 dBFS RMS, gaps, lead-in and tail.
- **Encode:** AAC-LC 64 kbps mono 24 kHz with faststart, using ffmpeg's libfdk_aac (no ffmpeg is on PATH; the binary from Remotion's compositor package was used).
- **Checks:** all 8 lines round-tripped through `saarika:v2.5` with auto-detect; content intact (English loanwords came back transliterated, "Saarthi" as "Saathi") and detected language en-IN for lines 1-2 and hi-IN for lines 3-8. Decoded m4a: 29.1 s, RMS 0.096, peak 0.50, longest silence 0.55 s, correlation with the source 0.999; every `start` is within 0.05 s of the decoded line onset.
- **Usage:** TTS 8 requests, 464 characters; STT 8 requests, about 27 s of audio.
- **Not verified:** native-speaker review of the new Hindi lines.

## 2026-10-23: agent voice changed to Aarti on all ten samples

Owner decision: all demo audio uses Sarvam Bulbul v4 Flash, with "Aarti" as the AI agent voice. The playground lists it as a sweet, high, soft-spoken female voice tagged Customer support.
- **Speaker id:** `aarti_hi_customer`. It is the only Aarti id the API accepts for `bulbul:v4-flash`; the API's own speaker list (211 ids) was checked, and plain `aarti` is rejected. The site catalog already lists it (`server/voice_catalog.py`).
- **What changed:** only the 40 agent lines were re-voiced, with the same text, pace 1.2, temperature 0.7, loudness 1.1, 24 kHz and the same `target_language_code` per line (Odia's `or-IN` is sent as `od-IN`, which the API requires). Same trim, -20 dBFS RMS, 200 ms gaps, 200 ms lead-in, 400 ms tail, and the same encoder as the Hindi re-take (libfdk_aac, 64 kbps, faststart). Every `start` and `seconds` value in `voiceSamples.ts` was re-measured.
- **Caller audio is the approved take:** the caller lines were not re-generated. For Hindi they come from the line WAVs of the English-to-Hindi take; for the other nine they were cut from the committed m4a at their `start` times. Each cut correlates 0.998 or better with the old file.
- **Re-rolls:** three Aarti lines had a weaker STT round trip than the old Kavya take and were voiced again: Odia turn 8 (detected as English and transcribed romanised), Punjabi turn 4 ("11 ਵਜੇ" misheard) and Tamil turn 1 (two re-rolls). The second takes of Odia and Punjabi round-trip cleanly. In every Tamil turn 1 take, STT hears "बात हो सकती है" as "बाद हो सकती है", which the Kavya take did not; the second take is kept.
- **Checks:** all 40 agent lines round-tripped through `saarika:v2.5` with auto-detect. Each was detected in the expected language, and content was intact apart from loanword transliteration, numbers written as words, and the Tamil turn 1 item above. In the decoded files, RMS is 0.096, the longest silence is 0.58 s or less, and every `start` is within 0.04 s of the line onset. Peak is 0.58 or less except Gujarati, at 0.708: that is the unchanged caller turn 7, which was already 0.698 in the old file and went slightly over after one more AAC pass.
- **Pace comparison:** a Hindi take with the agent at pace 1.0 (caller unchanged) was made for the owner to compare. It runs 33.0 s against 29.6 s at pace 1.2. The site uses pace 1.2.
- **Usage:** TTS 49 accepted requests, 3,188 characters (including the 4 pace-1.0 lines, 4 re-rolls and 1 speaker test), plus 3 rejected (wrong speaker name or language code). STT 84 requests, about 6 minutes of audio (including 3 checks of the old Kavya lines).
- **Not verified:** a native-speaker listen to Aarti in the nine non-Hindi languages (the speaker is Hindi-tagged).

## 2026-10-23: natural-call pilot (Hindi page only)

The owner found the sample "looks scripted", and that a caller who speaks good English asking to switch language misses the point: the product follows the customer's language. Pilot on /languages/hindi only; the other nine pages are unchanged.
- **Flow:** the AI agent opens in English, and the caller simply answers in Hindi/Hinglish. The agent carries on in Hindi without being asked, and nobody mentions language. The facts are the same (Rahul ji, EMI due on the 15th, salary on the 12th, pays through the app on the 13th). There are no prices and no transfer.
- **Script:** spoken-phone style, with fillers ("हाँ जी, बोलिए…", "वो", "umm"), a self-correction ("salary 12 को… हाँ, 12 तारीख को आती है"), a "जी।" backchannel and a closing "सही है?" check. 10 turns.
- **Voices:** agent `aarti_hi_customer`, caller `aditya_hi_conversational`, `bulbul:v4-flash`, temperature 0.9 (was 0.7), loudness 1.1, pace 1.1-1.25 per line.
- **Timing:** gaps between lines vary from 100 to 550 ms. Two lines overlap the end of the previous one (agent "जी।" by 150 ms, caller "हाँ हाँ, सही है।" by 120 ms), and these are mixed rather than joined. Lead-in is 200 ms and tail 400 ms.
- **Sound:**
  - Caller on a phone line: band-limited to 300-3400 Hz, compressed (3:1), with faint office room tone (`ambience/office.ogg`) 38 dB under speech, present only while the caller speaks.
  - Agent: wideband with a +2 dB low shelf at 180 Hz to sound a little closer.
  - Every line is at -20 dBFS RMS with a soft limiter above 0.5.
- **Player:** `VoiceSample.switchTurn` (optional, defaults to `SWITCH_TURN`) sets where the chip flips. On this sample it is the agent's first Hindi line (turn 3), so the chip changes when the agent starts speaking Hindi. The "speaking …" label now uses each line's own language, and the divider, "Press play" hint and JSON-LD say the agent follows the caller.
- **Checks:** decoded m4a is 30.3 s, RMS 0.096, peak 0.67, longest silence 0.60 s, and each `start` is within 0.03 s of the line onset. STT round trip passed for meaning on every line. "हाँ, thank you, bye bye." was detected as English, which is expected since it is mostly English words.
- **Usage:** TTS 15 requests, 611 characters (including the first draft where the caller asked to switch, and one re-roll); STT 31 requests, about 1.5 minutes of audio.

## Usage (both takes)

| Service | Requests | Volume | Notes |
|---|---|---|---|
| LLM (`sarvam-105b-conversations`) | 33 | 24,047 prompt + 16,768 completion tokens | |
| TTS | 288 | 15,817 characters, about ₹16 | The current take used about 5,500 characters |
| STT | About 175 | About 11 minutes of audio | |

## Page template (all 10 language pages)

Only layout and styling changed. The H1 text, every other piece of copy, all headings, all internal links and the FAQ accordion are kept. Every page has more words than the live version and the same links, plus two new ones each.

The sections, in page order:
- **Hero:**
  - On the left: the native greeting in large gradient type (decorative, `aria-hidden`), the same H1 with a gradient second line, the blurb, and "Book a demo" as the only CTA. The "Talk to Artha live" button was removed from the hero; the CTA band at the bottom still has it.
  - Below them, the old three stat cards are now a stats row.
  - On the right: the sample-call player.
- **Script marquee:** the homepage's marquee of language greetings.
- **Who it's for:** a tinted band with two plain lists instead of cards.
- **Written example:** chat bubbles with avatars, plus a "Voices" aside.
- **Code-mixing note:** a full-width gradient pull quote.
- **Sample lines:** a horizontal snap strip on phones and a grid on desktop.
- **Regional calls:** numbered rows with a region chip.
- **Go-live notes:** a numbered timeline on a tinted band.
- **Solutions:** borderless icon tiles.
- **Related and other languages:** chip rows.

How the player behaves:
- **Layout:** the card has fixed heights, so playback never shifts the layout.
- **Orb and waveform:** they follow the real audio level through a Web Audio analyser. With reduced motion enabled the analyser is skipped and the CSS animations are switched off.
- **Transcript:** before play, the full transcript is visible and is in the server-rendered HTML. During play, lines appear in sync and the current line is highlighted.
- **Switch chip:** "Switched to <language>" animates in at the switch.
- **Controls:** tapping a line seeks to it, and the progress bar is a keyboard-accessible range input with a tick marking the switch.
- **Screen readers:** an `aria-live` region announces the current speaker and line.
- **Loading:** `preload="none"`, so no audio is fetched until play.

## Not verified

- Native-speaker review of the wording and pronunciation in each language.
- Playback on iOS Safari or a real phone.
