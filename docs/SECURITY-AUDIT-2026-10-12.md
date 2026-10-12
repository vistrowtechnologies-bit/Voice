# Security audit and fixes (2026-10-12)

Two read-only reviews ran: one on sign-in and sessions, one on the admin panel and the API surface. Every finding was then checked in the code. Fixes shipped in one batch on branch `claude/security-hardening`.

Production was checked before fixing. No signs of abuse: 0 widget sites using another account's agent, and 0 inbound routes on a number or with an agent the account doesn't own.

## Fixed

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | P0 | A widget site could be pointed at another tenant's agent, exposing its prompt and knowledge base through the public widget chat | `create_site` / `update_site` check that the agent belongs to the account (`_require_own_agent`); member role or above |
| 2 | P0 | An inbound route could be put on another tenant's phone number, hanging up their callers | Routes are refused unless the account owns the number and the agent. The agent's lookup is scoped to the number's owner (`agent/db.py get_inbound_route`) |
| 3 | P0 | A tenant admin could set Zoho `accounts_base` and receive the platform's Zoho client secret | `PATCH /integrations/{key}` never takes tokens or hosts from the browser. Zoho hosts are allowlisted where they are used (server and agent) |
| 4 | P1 | Platform-owner rights belonged to the whole workspace, so any teammate was a super-admin | `/admin` requires `role == owner` in the platform workspace |
| 5 | P1 | An API key from the owner workspace opened `/admin`; any key could manage keys, team and billing | API keys are refused on `/admin`, `/api-keys`, `/team`, `/billing`, `/profile` and `/auth` |
| 6 | P1 | Pre-registration takeover through Google/GitHub sign-in (an attacker's unverified sign-up password kept working) | Linking Google/GitHub to an unverified sign-up resets the password and ends its sessions |
| 7 | P1 | A support ("View as") cookie survived the admin signing out everywhere, and exit turned it into a 30-day admin session | Support cookies carry the admin's `session_version` (`isv`). Exit refuses a stale one |
| 8 | P1 | No two-step login | TOTP two-step login (`server/mfa.py`): encrypted secret, no code reuse, 10 hashed recovery codes. It covers password, Google and GitHub sign-in. Password reset and email change no longer sign in on their own when it's on. **Required for the platform owner on `/admin`** |
| 9 | P1 | The generic webhook could reach internal addresses and echo the reply | `_post_json` refuses private/internal addresses, including after redirects |
| 10 | P1 | User text went into emails as raw HTML (phishing from our domain) | Names, emails and contact form fields are escaped; the preheader is escaped in `render_email` |
| 11 | P1 | Viewers could place test calls, change telephony, edit widget sites, read the lead-webhook token and export data | Role checks added (member or admin as appropriate) |
| 12 | P1 | No rate limits on costly or email-sending routes | Per-account or per-IP limits: analyze, extract-qa, test call, contact call, invites, email change, tickets, widget feedback and telemetry |
| 13 | P2 | Sign-in lockout was per IP only; timing showed which emails exist | 10 failures in 15 minutes lock that email. Unknown emails take the same time as real ones |
| 14 | P2 | Reset links could be used twice in a race, and older links stayed valid | Single conditional UPDATE; using one link expires the user's others |
| 15 | P2 | Integration OAuth callbacks accepted signed-out or revoked cookies | `_live_session` checks `session_version` and the session row |
| 16 | P2 | No Origin check on cookie-authenticated writes | `_origin_allowed`, **report-only** until `ORIGIN_CHECK=enforce` (logs "would block") |
| 17 | P2 | "View as" could disconnect integrations, change telephony, regenerate site keys and push leads | Added to the support-session blocklist |
| 18 | P2 | Reset and invite links logged when email is off; the analysis error echoed internal text | Links are no longer logged; a generic error message is shown |
| 19 | New | No alert on sign-in from a new device | Security email on sign-in from an unseen device |

## Open (owner actions or later work)
- **EnableX webhook auth:** `ENABLEX_WEBHOOK_USER` / `ENABLEX_WEBHOOK_PASS` are not set in production, so EnableX callbacks are not authenticated. Set matching credentials in the EnableX portal and on Railway, then make `_verify_enablex_webhook` refuse unauthenticated calls.
- **Origin check:** once the logs show no "would block" from a real dashboard domain, set `ORIGIN_CHECK=enforce` on Railway.
- **Hardening still to do:**
  - DNS rebinding in the KB crawler and webhook check (the IP is checked, then resolved again); pin the checked IP.
  - A Content-Security-Policy for the dashboard.
  - Scoped API keys.
  - A persistent (shared) rate limiter instead of in-memory.
  - Platform owner set by a hardcoded email at boot (`calls_db.py` ~937); move it to an explicit flag.
