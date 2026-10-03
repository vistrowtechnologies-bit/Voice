# Launch readiness: phase plan (started 3 Oct 2026)

Status key: DONE = verified against real state, OPEN = not done, NEEDS = waiting on a person.

## Phase 1: re-check the 7 Sep audit P0s: DONE (3 Oct 2026)
| P0 | Result | Evidence |
|---|---|---|
| Orchestrator dial/token routes unauthenticated | **Was still open in production; fixed 3 Oct.** Code had the gate since 8 Sep, but the service was last deployed 8 Sep 11:06, before it. Redeployed from main `3bbdf43`. | Before: `GET /browser/token` and `POST /telephony/enablex/outbound-test-call` returned 200 with no credentials. After: 401 with no or wrong secret, 200 with the right one. EnableX inbound-event webhook still 200 (must stay open). Secrets on Voice and orchestrator match (hash compared). |
| New accounts via Google/OAuth failed (Postgres CASE boolean) | Fixed in code (`server/calls_db.py` passes `bool(email_verified)`). No `DatatypeMismatch` in the last 400 Voice log lines. **Not exercised end to end** (needs a real signup; do it in staging). | |
| Clean checkout cannot import the agent | Fixed: `build_turn_delivery` is committed in `agent/prompts/human_speech.py`; every local import in `agent/*.py` resolves in a clean checkout of main. Not run under the pinned LiveKit 1.8.3. | |

Still true: deploys are manual per service. A push to main deploys Voice and the web app only. The orchestrator and both LiveKit agent workers need their own deploy. This is how the orchestrator fell behind. Staging (phase 2) must make "what is deployed where" visible.

## Phase 2: staging environment: OPEN
Goal: nothing in staging can dial a real phone, charge a real card, or touch production data.
- Separate Railway environment `staging`: own Postgres (+pgbouncer), Voice, orchestrator. Do NOT duplicate production, because that copies live keys.
- Web: Vercel preview of a `staging` branch, with `/api` rewritten to the staging Voice URL.
- Calls: separate LiveKit project and agent workers; no real SIP trunk. Dialer in fake mode.
- Payments: Razorpay test keys only. OAuth: staging redirect URIs. Storage: separate B2 bucket.
- Seed data from fixtures, never a production copy.
NEEDS from the owner: a LiveKit project for staging, Razorpay test keys, Google OAuth staging redirect, a staging domain choice.

## Phase 3: outbound readiness: OPEN (blocked on phase 2 and EnableX)
Clean live test of the bridged transfer, the 45 s unanswered-handoff recovery and the carrier circuit breaker. Outbound campaigns stay on hold until it passes.

## Phase 4: EnableX undelivered calls: NEEDS owner
Draft is in `docs/ENABLEX-UNDELIVERED-CALLS-2026-10-01.md`. Unsent.

## Phase 5: guardrails: OPEN
Do-not-call/NCPR scrubbing, per-tenant daily dial cap, promotional-campaign detection.

## Phase 6: known bugs: OPEN
Memory summary writes "caller is Artha"; very long agent replies; ArthaLeads call 1090 returns 500; international market choice.

## Phase 7: soft launch: OPEN
Inbound + widget first, invited customers only, outbound off until phase 3 passes.
