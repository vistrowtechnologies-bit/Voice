# Staging environment (built 3 Oct 2026)

Purpose: test changes where they cannot dial a real phone, charge a real card, email a real person, or touch production data.

| Piece | Where | Notes |
|---|---|---|
| Web app | Railway env `staging`, service `web-stg` | https://web-stg-staging-f389.up.railway.app (nginx serves the SPA build, proxies `/api` to the staging backend, `X-Robots-Tag: noindex`, amber STAGING badge) |
| Backend | service `voice-staging` (git branch `staging`) | `APP_ENV=staging`; own secrets; no LiveKit, Razorpay, OAuth, email, B2 or AI keys yet |
| Database | service `Postgres-tArH` | Separate from production; reachable only inside the staging network |
| Test login | `staging-admin@example.test` | Password is in the owner's local scratch file, never in the repo |

## Safety locks
- `APP_ENV=staging` makes `server/env_guard.py` (and its copy `orchestrator/env_guard.py`) refuse every outbound dial unless the number is in `STAGING_DIAL_ALLOWLIST` (empty = nothing can be dialled).
- Nothing in staging holds a live key. Add keys only when a test needs them, and use test-mode/sandbox ones.
- Seed accounts with `server/seed_staging.py`. It refuses any database that already has accounts and no `vv_environment='staging'` marker, so it cannot write to production. Run it inside the staging container: `railway ssh --service voice-staging -- ...` with `--dry-run` first.

## Deploying
- Backend: push to the `staging` branch (`git push origin <sha>:refs/heads/staging`). Production deploys from `main`.
- Web: `railway up ./web-demo --path-as-root --service web-stg --environment staging -p <project id> --detach`. The service is NOT linked to git on purpose: a git-linked web service would build the repo-root backend Dockerfile (root `railway.json` overrides any per-service Dockerfile setting). `RAILWAY_DOCKERFILE_PATH=Dockerfile.staging` selects the web image.
- Always pass `--environment staging` explicitly. Directories linked with `railway link` remember an environment.

## Connected on 3 Oct 2026 (all under vistrowai@gmail.com)
| Piece | What |
|---|---|
| LiveKit | Separate project "Vistrow Voice Staging" (`p_2vilqh0ragu`, wss://vistrow-voice-staging-gip12wmx.livekit.cloud) with its own API key. CLI profile `vistrow-staging` (NOT the default: `lk project list` must keep `artha-voice` starred). |
| Agent worker | `CA_QXKko3RGzmbB`, region us-east, unnamed (takes implicit dispatch), deployed from a scratch copy of `agent/` so production's `livekit.toml` files are untouched. Always pass `--project vistrow-staging`. Secrets: staging DB (via the TCP proxy below), AI keys, `APP_ENV=staging`. No B2/Zoho. |
| Database access for the worker | TCP proxy on staging Postgres only (thomas.proxy.rlwy.net:31272), because the worker runs on LiveKit's cloud and cannot reach Railway's private network. |
| Razorpay | Test-mode keys (`rzp_test_`) and plan IDs copied from production. |
| AI keys | Gemini, OpenAI, Sarvam, ElevenLabs, Tavily, Google TTS credentials copied from production (they bill to the same accounts). |
| Google sign-in | Own OAuth client "Vistrow Voice Staging" in the Vistrow Voice Google project; production's client is untouched. Consent screen is in testing mode, so only listed test users can sign in. |
| Email | Resend key copied, but `STAGING_EMAIL_ALLOWLIST=vistrowai@gmail.com` means staging emails only that address (verified: other addresses get `emailSent:false`). |
| Web proxy | nginx re-resolves the backend's private address every 10 s (it used to cache it and hang after backend restarts). |

## Still not built
Staging orchestrator, B2 recordings bucket, a SIP trunk for phone calls (staging cannot dial by design), GitHub/Slack/Zoho OAuth, the `platform-demo` worker. A real voice call through staging has not been tried yet.
