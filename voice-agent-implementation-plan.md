# AI Voice Calling Agent — Real Estate — Implementation Plan
*For building with Claude Code. Feed this file to Claude Code as project context (save as `CLAUDE.md` or `docs/plan.md` in repo root).*

## Stack decision

| Layer | Choice | Why |
|---|---|---|
| Orchestration framework | **LiveKit Agents** (Python) | Official Sarvam plugin, native browser WebRTC client, same codebase later bridges to phone calls via SIP |
| STT | Sarvam Saaras v3 | Hinglish code-switching, ~70ms latency, ₹30/hr |
| TTS | Sarvam Bulbul v3 | Emotion/pace control, Indian prosody, ₹15–30/10K chars |
| LLM | Gemini Flash or GPT-4o-mini | Cheap, low-latency, good enough for structured qualification flows |
| Browser client | React + `@livekit/components-react` | Official LiveKit React SDK, mic capture + audio playback + agent-state UI built in |
| Server | LiveKit self-hosted (Docker) on AWS/GCP Mumbai | Keeps latency low, avoids per-minute LiveKit Cloud markup once you scale |
| Telephony (phase 2) | Exotel SIP trunk → LiveKit SIP bridge | Handles DLT/DND compliance for real outbound calls |
| Session/state | Redis | Call state, conversation memory across turns |
| Call logs / lead data | Postgres | Synced to ArthaleLeads CRM |

## Repo structure to have Claude Code scaffold

```
voice-agent/
├── agent/                  # Python — LiveKit agent worker
│   ├── main.py              # AgentSession: STT→LLM→TTS pipeline
│   ├── prompts/              # Real estate qualification scripts per client
│   ├── tools.py              # Function-calling tools (check availability, log lead, book site visit)
│   └── config/                # Per-client voice/language/script config
├── web-demo/                # React browser demo client
│   ├── src/components/       # Call button, live transcript, agent state indicator
│   └── src/lib/livekit.ts    # Token generation + room connect logic
├── server/                  # Token server + webhook handlers
│   ├── token_api.py          # Issues LiveKit access tokens to browser clients
│   └── exotel_webhook.py     # (phase 2) bridges Exotel calls into LiveKit rooms
├── infra/
│   ├── docker-compose.yml    # Self-hosted LiveKit server + Redis + Postgres
│   └── livekit.yaml
└── docs/plan.md              # this file
```

## Phase 1 — Browser demo (Weeks 1–2)

Goal: a working "Try the AI Call" button on your website, like the Ravan AI demo — visitor clicks, grants mic access, talks to the agent live in-browser.

**Claude Code tasks, in order:**
1. `docker-compose.yml` — spin up self-hosted LiveKit server + Redis locally first (dev mode uses LiveKit Cloud free tier if you want to skip self-hosting initially).
2. `agent/main.py` — build the `AgentSession` using `livekit-plugins-sarvam` for STT/TTS and Gemini Flash for LLM. Start with a single hardcoded real estate qualification script (budget, location, timeline, site-visit intent).
3. `server/token_api.py` — minimal FastAPI/Node endpoint that issues a LiveKit JWT access token per browser session (this is what lets the browser join a room securely).
4. `web-demo/` — React app using `@livekit/components-react`: a "Start Call" button, mic permission prompt, live agent-state indicator (listening/thinking/speaking), and a live transcript panel.
5. Test end-to-end locally: browser mic → LiveKit room → agent hears, responds → browser hears agent.
6. Add barge-in/interruption handling (LiveKit's turn-detector plugin) so it feels like a real conversation, not walkie-talkie.
7. Deploy: LiveKit server on a small Mumbai VM, agent worker as a background process/container, web demo embedded as a widget on marketing site.

## Phase 2 — Real phone calls via Exotel (Weeks 3–5)

1. Get Exotel DLT registration going in parallel — it's the slowest-moving piece.
2. `server/exotel_webhook.py` — bridge incoming/outgoing Exotel calls into a LiveKit SIP room using LiveKit's SIP integration, so the *same* `agent/main.py` handles phone calls with zero changes.
3. Add outbound dialer trigger — API endpoint that takes a lead list and places calls through Exotel, routing each into a LiveKit room.
4. Wire DND/calling-hours checks before dialing (compliance-critical for real estate cold calling).

## Phase 3 — Multi-tenant + reliability (Weeks 5–7)

1. `agent/config/` — per-client JSON config: voice ID, script, language mix (Hindi/Marathi/English), calling hours, CRM webhook URL. Agent loads config by client ID at session start.
2. Postgres schema for calls, transcripts, lead qualification outcomes → sync job to ArthaleLeads.
3. Load test: simulate concurrent browser demo sessions + concurrent outbound calls. Autoscale agent workers on concurrent-session count (LiveKit supports horizontal worker scaling natively — this is the "don't break with many clients" piece).
4. Add fallback: if Sarvam STT/TTS has an outage, fail over to Deepgram/Smallest.ai (keep the LiveKit plugin swap as a config flag, not a code change).

## What to hand Claude Code first

Start with Phase 1, step 2 and 3 together — get a terminal-based agent talking to you locally before building any UI. Once that loop works, the browser demo is mostly LiveKit's existing React components wired to your token server.
