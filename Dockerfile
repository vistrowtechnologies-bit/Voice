# Railway service: Vistrow Voice backend + agent worker, one container.
#
# Both processes run together (see start.sh), sharing one Postgres database
# via DATABASE_URL — the backend's dashboard reads/writes it (agents,
# contacts, integrations, phone numbers) and the agent worker reads agent
# config from it and writes completed-call rows to it. See dbconn.py,
# agent/db.py and server/calls_db.py.
#
# The web-demo frontend deploys separately (Vercel); see web-demo/vercel.json
# for how it reaches this service.
FROM python:3.12-slim

WORKDIR /app

# ffmpeg — transcodes a call recording from its stored WAV to MP3 on download
# (see /calls/{id}/recording/download in token_api.py). Nothing else in this
# image needs it.
#
# postgresql-client-18 — pg_dump for server/db_backup.py's daily backup.
# Pinned to 18 (not Debian slim's default, older client) to match the
# production Postgres server's actual version (confirmed via SELECT
# version()) — pg_dump against a newer server than its own version is
# unsupported and can fail outright, so this has to track the server, not
# just "whatever's in the base image's apt repo". Installed from the
# official PGDG repo, which is where versioned releases actually live.
#
# The PGDG apt suite has to match this base image's Debian codename exactly
# (e.g. bookworm vs trixie) — a mismatch pulls a libpq5 built against a
# different libldap than what's actually on the image and apt fails with
# "unmet dependencies" rather than anything obviously about the codename.
# Read it from /etc/os-release instead of hardcoding a guess, so a future
# python:3.12-slim base bump can't silently break this again.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl gnupg \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    && . /etc/os-release \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update && apt-get install -y --no-install-recommends postgresql-client-18 \
    && rm -rf /var/lib/apt/lists/*

# Install both requirement sets — verified conflict-free together.
COPY server/requirements.txt ./server/requirements.txt
COPY agent/requirements.txt ./agent/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt -r agent/requirements.txt

COPY server/ ./server/
COPY agent/ ./agent/
COPY start.sh ./start.sh
RUN chmod +x ./start.sh

# Requires DATABASE_URL (Postgres) set as a service variable — durable
# across redeploys, unlike the old SQLite file on the container filesystem.

# Railway injects $PORT at runtime; the agent worker reads LIVEKIT_URL/
# LIVEKIT_API_KEY/LIVEKIT_API_SECRET plus SARVAM_API_KEY/OPENAI_API_KEY.
# Invoke via bash explicitly (not relying on the shebang) since start.sh uses
# `wait -n`, a bash builtin not supported by /bin/sh (dash) on this image.
CMD ["bash", "./start.sh"]
