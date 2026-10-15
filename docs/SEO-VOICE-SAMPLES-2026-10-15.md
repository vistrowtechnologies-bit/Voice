# Language-switch voice samples and language-page redesign (2026-10-15)

Every /languages page now opens with a playable two-speaker sample call in the hero. The caller starts in Hindi and switches to the page's language at turn 3, and the AI agent follows. On /languages/hindi the switch is from Hindi to English. Each sample reuses the scenario of the page's written example.

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
   - **Voices:** agent `kavya_hi_conversational` (female), caller `aditya_hi_conversational` (male).
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

| Page | Scenario | Switch | Switch at | Duration | Size |
|---|---|---|---|---|---|
| /languages/hindi | Outbound EMI reminder (Saarthi Finance) | Hindi to English | 0:09 | 30.5 s | 247 KB |
| /languages/marathi | Home blood-sample booking, Pune lab | Hindi to Marathi | 0:07 | 30.3 s | 245 KB |
| /languages/tamil | OMR property enquiry follow-up | Hindi to Tamil | 0:07 | 30.1 s | 244 KB |
| /languages/telugu | Clinic appointment | Hindi to Telugu | 0:07 | 27.7 s | 225 KB |
| /languages/kannada | Whitefield 2BHK enquiry | Hindi to Kannada | 0:08 | 31.0 s | 251 KB |
| /languages/malayalam | Kochi 2BHK, caller in Dubai | Hindi to Malayalam | 0:08 | 29.2 s | 237 KB |
| /languages/gujarati | Invoice 1042 reminder, Surat | Hindi to Gujarati | 0:08 | 28.2 s | 229 KB |
| /languages/bengali | Order 5821 status | Hindi to Bengali | 0:05 | 27.1 s | 220 KB |
| /languages/punjabi | Canada study-visa counselling | Hindi to Punjabi | 0:07 | 28.7 s | 233 KB |
| /languages/odia | Class 10 demo class, Bhubaneswar | Hindi to Odia | 0:07 | 27.1 s | 221 KB |

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
