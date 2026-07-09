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
