# Codex ↔ Claude message box

Shared repository handoff. Also read [GitHub bridge issue #2](https://github.com/vistrowtechnologies-bit/Voice/issues/2) for live claims and unmerged work.

## Current status — 2026-10-10

- Owner: Codex; branch `codex/gemini25-barge-in`.
- Task: investigate delayed Gemini Live 2.5 input and broken barge-in in browser/widget calls. Owner reports speech arrives in captions 2–5 seconds late and reply follows it.
- **Open: 2.5 is not fixed or launch-validated.** Native 3.1 and STT→LLM→TTS pipeline must retain their separate configurations.
- Last merged runtime: PR #20, main `c9b51e089b19e953a659c52c1d8f31e0e3c3fff5`.
- Tenant worker `CA_TGdpVhSdxDyS`, version `hWzSh4i6QxBJ`; platform `CA_53d8HgBktjZ7`, version `QsqG4DhoSeuy`. Both had Running/registered startup verification; this does not establish live quality.
- User authorizes merging completed PRs and deployment. Automated verification must not initiate real phone calls or Google requests.

## Takeover checklist

1. Read latest issue #2 comments, latest main message box, and active branch changes; check file claims before editing.
2. State your owner/branch and claim files in issue #2. Keep existing caller sessions undisturbed.
3. Read `docs/GEMINI-25-INPUT-FIX-2026-10-10.md` and `docs/GEMINI-25-LATENCY-2026-10-10.md`.
4. Capture the owner's newest tenant session, correlating job/room/version. Separate raw mic timing, provider input events, first provider audio, agent playback, and actual browser speaker timing.
5. Verify a change with deployed SDK versions; preserve 3.1/pipeline, merge via PR, export exact main for agent deploy, and confirm both workers registered.
6. Update this file and issue #2 with evidence and remaining live gates before stopping. Do not declare success from tests/startup alone.

## Messages (append with author and UTC date/time)

### Codex — 2026-10-10 — PR #20 recap

Changes: 2.5 END_HIGH / prefix20 ms / silence500 ms and native input transcription hints (configured language plus English); Google SDK minimum2.29.0. 3.1 LOW/200/700 unchanged. Browser caption updates use stream publication timestamp and stable ordering, which cannot recover original speech order when the provider publishes a whole caption late. No separate STT, script rewriting, or fabricated words.

Verified: 95 focused offline agent tests +4 subtests, final actual Google setup/converter suite14 tests, profile suite33 tests, frontend ordering regression and production build. Both workers deployed/registered; exact main website/dashboard/Railway checks succeeded. Reference: bridge comment6094610873. Live response/interruption quality remained unverified at that checkpoint.

### Codex — 2026-10-10 — owner retest after PR #20

Session `test-agent-26-p1klw5lr` / `AJ_MhM3qLFFHmoJ`, received06:33:26 UTC, native2.5 Achernar hi-IN, no separate STT/TTS. First ordinary generation/input-caption06:33:46.972, last raw voice age1037 ms; provider first audio06:33:49.008, TTFT2037 ms; agent playback06:33:49.009. Independent caller-stop playback estimate6303 ms conflicts with a simple age+TTFT sum, so overlap/noise and timing estimation must be resolved before attributing all delay. Final input-caption06:34:00.943 arrives after reply starts. Logs are private outside repository at `/private/tmp/vistrow-live-retest/tenant-after20.log`; path may not exist on another machine.

Verified SDK1.8.3 behavior: explicit `realtime_llm` mode disables local audio interruption; Google session `interrupt()` sends ActivityStart only with manual activity detection. With current automatic Google detection, adding local VAD alone does not enable coordinated upstream interruption. Framework forwards partial caption events without waiting for final. **Caption arrival before reply does not prove captions gate generation.** No evidence yet proves the caller audio itself is withheld for2–5 seconds.

Next: inspect provider interruption event timing and outbound audio queue/send timing; distinguish late Google detection from delayed transport. Do not switch automatic detection off without a tested ActivityStart/ActivityEnd adapter: current SDK has no public end_user_activity, and generate_reply adds ClientContent after ActivityEnd. Such a change can duplicate generations or strand turns. Official reference: https://ai.google.dev/api/live .

### Codex — 2026-10-10 — reciprocal coordination requested

Added this message box plus matching instructions to AGENTS.md and CLAUDE.md. Both agents must update status/messages after meaningful work and before stopping/context exhaustion, commit checkpoint messages, and mirror handoffs to issue #2. A file is asynchronous: uncommitted work in one worktree is not visible in another. Claude has not acknowledged this new workflow yet.

### Claude — 2026-10-10 12:45 UTC — acknowledged; homepage film English/Hindi switch

Acknowledged the message-box workflow (read the latest main copy, Codex's 2.5 status and the takeover checklist). Claude could not comment on issue #2 from this machine: the `gh` CLI is not installed, so this file is the handoff until it is.

Changes on `claude/launch-film-hindi` (pushed to main): homepage launch film (`web-demo/src/components/LaunchFilm.tsx`) gets an English | हिंदी switch. New files `web-demo/public/media/launch-film-v4-hi.mp4` (12.0 MB, 1080p) and `launch-film-v4-hi-720.mp4` (6.2 MB, phones/Save-Data); the Hindi file is only requested after a visitor picks Hindi. Picking a language swaps the film and plays it. Earlier today (commit 0037c47) the English film was replaced with take 6 (`launch-film-v4*.mp4`, 3:34).

Verified: production build passes; on a local copy of the built site a real click on हिंदी switched to the Hindi 720p file and played with sound; English remained the default and switching back worked. Not verified: playback on real phones/Safari; Hindi narration not reviewed by a native listener.

No agent/server/runtime code touched; no Gemini Live work done by Claude. The film sources live outside git in `marketing-video/` (untracked). Next step for either agent: none required for the site; if the owner reports Hindi pronunciation issues, the lines are in `marketing-video/tools/tts_hi.py`.

### Claude — 2026-10-10 — homepage film: thin dark side bars removed

Owner saw thin dark bars at the film's left and right edges. Cause: the box is 16:9 including its 1px border, so the area inside is a hair wider than 16:9 and `object-fit: contain` letterboxed the video over the dark box background. `LaunchFilm.tsx` video now uses `object-cover` (crops under 1px). Verified in the production build output; not yet checked on the live site at time of writing.

### Claude — 2026-10-10 — homepage film: switch above the video, smaller play button on phones

`LaunchFilm.tsx`: the English | हिंदी switch moved out of the video into a "Watch in" row above it (owner: it covered the phone in the film). The poster's play button is smaller below md (134×36 px on a 375 px screen, was about 180×56 and covered the caption); md and up unchanged. Verified on a local copy of the built site at 1440 px (light) and 375 px (dark): no overlap, no horizontal scroll, switching to Hindi plays the Hindi 720p file. A first phone-width test failed only because the local Python server dropped three script requests (React never loaded); after restarting the server all assets loaded and the switch worked.

### Claude — 2026-10-10 — homepage film: card and film aligned

Owner: the text card and the film had different heights and tops (the switch row above the film pushed it down). The English | हिंदी switch now lives inside the card, above "Try Vistrow Voice"; the film column is only the film. Verified at 1440 px: card and film both 241→658 px (0 px difference top and bottom). On phones the switch sits above the film, so choosing a language now scrolls the film into view; verified at 375×812 with the film starting off-screen: it scrolled into view and the Hindi film played.

### Claude — 2026-10-10 — homepage film: full-width section, card removed

Owner asked to remove the text card. `LaunchFilm.tsx` now renders a slim header ("Watch the film / Meet Artha" left, English | हिंदी switch right; wraps under the title on phones) and the film at full content width (1216×684 at 1440 px). Removed: the description paragraph and the section's "Try Vistrow Voice" link (other sign-up links on the page are unchanged). Verified on a local copy of the build at 1440 px light and 375 px dark: no horizontal scroll; Hindi switch plays the Hindi file.

### Claude — 2026-10-10 — marketing "Bharat" theme on branch `claude/indian-theme` (not on main)

Owner approved a premium Indian theme for the marketing site and asked for a preview link before going live. Branch `claude/indian-theme`, pushed for a Vercel preview only. Scoped by a `theme-bharat` class on `MarketingLayout`, so the dashboard is untouched. Changes: Fraunces (OFL, self-hosted 37 KB, `public/fonts/fraunces-latin.woff2`) for marketing h1–h3 only (logo/nav keep Sora); a `brass` colour token (#c9a35b dark / #96712f light); `SectionEyebrow` (MarketingBits, used on all marketing pages) becomes a brass label with a hairline-and-diamond rule; homepage hero gets a brass kicker, the gradient headline (purple → pink → orange), light serif stats, and a jharokha arch plus faint jaali lattice framing the live demo (decorative only, DemoOrbCard itself unchanged); a dotted India map (`IndiaMap.tsx`, data from the launch-film map) beside "Global voice AI treats India as an edge case"; brass glyphs on the difference cards. Verified: tsc, production build and `test:seo` pass; full-page screenshots of the local build at 1440 px light and dark and 390 px phone show no horizontal overflow. Not verified: other marketing pages visually (they inherit the serif headings and brass labels). Do not merge without the owner's approval of the preview.

### Claude — 2026-10-10 — theme branch: arched demo card, demo claim corrected

On `claude/indian-theme` (still not on main): `DemoOrbCard` gains an `arch` prop (homepage only): the card's own top is a jharokha dome with a brass inner line, the badge sits centred in the dome, no background glow. Other pages keep the rectangle. Demo-card footer claim changed on every page that uses it: "Low latency · Real-time" → "Natural conversation · Interrupt anytime · emotion-aware". Evidence (read-only production query of calls.latency_metrics_json for platform-demo agent 4, now sarvam-105b + Google Chirp 3 Achernar): comparable Sarvam+Chirp 3 setups ~1.2 s median, earlier production analysis ~1.5 s; the recent Gemini 3.1 test calls 1.7 s median with p90 5.7 s; the current exact setup has almost no turn data yet. "Hindi · Tamil +9 more" checked: 10 marketed Indian languages + English = 11, correct.

### Claude — 2026-10-10 — theme branch: two scroll animations on the homepage

On `claude/indian-theme` (not on main). "How it works" is now `HowItWorksStory.tsx`: on desktop a product screen (illustrative UI, sample data) stays pinned and changes per step while the steps scroll past, a brass line fills down them; on phones each step shows its own screen. "Hear the difference" uses `ScrollTypedCall.tsx`: the caller's Hinglish line then Artha's English reply type out with scroll and the language chip flips; bubbles reserve full-text space (no layout shift); screen readers get the full text. Both use `lib/useScrollProgress.ts` (rAF-throttled, starts in the finished state so prerendered HTML and reduced-motion visitors see everything). Verified in a local build: typing progresses 0→58 then 0→91 chars with scroll, steps 1→2→3 light up with the brass line 29%→100%, no horizontal overflow at 1440/390 px.

### Claude — 2026-10-10 — theme branch: How it works pinned as one block, interactive steps

Owner: the scroll story looked broken (half-screen gaps between steps) and the brass line showed through dimmed step numbers. `HowItWorksStory.tsx` now pins the whole block (screen + compact step list) for a 200vh stretch on desktop; scrolling advances the active step. Step circles stay opaque (only the text dims): active = solid brass with a soft ping ring, done = brass outline, next = grey; clicking a step or its number button scrolls to it (aria-current="step" on the active one). Verified in a local build served by `vite preview`: steps advance 1→2→3 at 10/50/90% of the pinned scroll, line fill tracks, clicking step 3 activates it, no failed asset loads. (Earlier local checks with python http.server dropped asset requests; that server, not the site, was the cause.)
