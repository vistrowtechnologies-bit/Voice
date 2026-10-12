# Detaching the Voice service's Railway volume (zero-downtime deploys)

## Problem

Measured on 2026-10-12: every production deploy took `api.vistrowvoice.com` offline for 3–6 minutes. Railway stops the old container before the new one passes `/healthz`, because the service has a volume attached (`voice-volume`, mounted at `/data`). Railway does not overlap deployments for a service that has a volume.

## What is on the volume (read-only check, 2026-10-12)

| Path | Size | Last written | What it is |
|---|---|---|---|
| `/data/calls.db` | 229,376 B | 2026-07-09 16:22 UTC | The SQLite database from before the Postgres migration (commit `36f8b87c`, same day). |
| `/data/lost+found` | empty | 2026-07-07 | Filesystem directory. |

`df` shows 380 KB used. The roughly 45 MB that `railway volume list` reports is filesystem overhead, not files.

**No code reads or writes `/data`.** Nothing in `server/`, `agent/`, `orchestrator/`, `Dockerfile` or `start.sh` references `/data`, `CALLS_DB_PATH` or a volume variable. The old `CALLS_DB_PATH=/data/calls.db` reader was removed in `36f8b87c`. The production `CALLS_DB_PATH` variable is still set but nothing reads it. The daily `pg_dump` (`db_backup.py`) writes to a temp file under `/tmp`, not to `/data`.

**Its data is already in Postgres.** Each SQLite row was compared with production Postgres by primary key and timestamp (IDs only, no content):

- In Postgres with identical timestamps: accounts 1, users 1, agents 2, sites 1, calls 69/69, contacts 4, integrations 2/3, settings 5/7.
- Not in Postgres: knowledge bases 1 and 3, knowledge sources 1 and 5, kb_qa 17–19, inbound route 1, phone number 1, the `calcom` integration, and settings `enablex_app_id` and `enablex_app_key` (all account 1).

Those rows were copied at cutover and deleted afterwards. Evidence: `migrate_sqlite_to_postgres.py` inserts every table in one transaction, and the calls and contacts from that transaction are present. Each table's Postgres ID sequence also starts after the SQLite IDs: the lowest surviving knowledge base is 5, knowledge source 7, kb_qa 33, inbound route 5 and phone number 7. The same phone number now exists as ID 7 (account 2, created 2026-09-07). Restoring these rows would bring back deleted data, so the file is archived rather than migrated.

**Archived:** `volume-archive/voice-data-2026-10-12/calls.db` in the B2 bucket that `db_backup.py` uses, via `scripts/archive_railway_volume.py`. It was verified by re-downloading in a separate process: SHA-256 `85c149e4e753…` matches `/data/calls.db`. Nothing prunes `volume-archive/` (only `db-backups/` is pruned).

## Code change in this PR: overlapping containers

After the volume is removed, deploys overlap: the new container starts its background threads while the old one is still running. Without a guard:

- Both campaign dialers would compute free slots from the same in-flight count and could dial past the outbound channel budget. The per-contact claim is already atomic, so no contact is dialled twice.
- The notification and ops-alert workers could send the same email twice. The daily backup could run twice.

`server/worker_leader.py` adds a Postgres session advisory lock, held on one dedicated connection. Only the process holding it runs the campaign dialer, notification worker, ops-alert worker and daily backup. When the old container exits, its connection closes and the lock is released, and the new container takes over on its next tick (at most 15 s for the dialer). Server-side TCP keepalives are set to 30 s, 10 s and 3 probes, so a connection that dies silently releases the lock in about a minute. The idempotent workers (retention purge, support-file purge, LLM warmer, project sync) are unchanged.

## Steps for the owner (not done; these change Railway settings)

1. Merge this PR. Production deploys normally; this deploy still has the 3–6 minute gap because the volume is still attached.
2. Confirm one leader in production logs: `railway logs --service voice --environment production | grep "now runs the background workers"`. Expect exactly one line per container start.
3. Railway dashboard → project splendid-manifestation → environment production → service **Voice** → **Settings** → **Volumes** → `voice-volume` → **Detach** (or delete). This redeploys the service. Keep the volume, detached, until a few deploys have gone through cleanly. The B2 archive is a second copy.
4. Optional cleanup: delete the unused variable `CALLS_DB_PATH` from the Voice service (Variables tab). Nothing reads it.
5. Verify zero downtime on the next deploy. Run this during a deploy and expect no `000` or 5xx:
   ```bash
   while true; do printf '%s %s\n' "$(date +%T)" "$(curl -s -o /dev/null -m 5 -w '%{http_code}' https://api.vistrowvoice.com/healthz)"; sleep 2; done
   ```
6. If something breaks, roll back by re-attaching `voice-volume` at `/data`. No code path needs it, so this only restores the old stop-then-start behaviour.
