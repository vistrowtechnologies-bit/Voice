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

## Not built yet
Staging LiveKit project and agent workers (voice calls), Razorpay test keys, Google/GitHub OAuth redirect URIs, email, B2 bucket, AI keys, staging orchestrator. Each needs an account or key from the owner; see docs/LAUNCH-READINESS-PHASES-2026-10-03.md.
