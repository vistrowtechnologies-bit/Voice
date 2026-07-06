# Railway service: Arthale Voice backend — FastAPI token API + telephony/SIP.
# The agent worker (agent/) and web-demo frontend are deployed separately, so
# this image builds only the backend. Railway auto-uses this Dockerfile (see
# railway.json) instead of Nixpacks, which can't pick a target in this monorepo.
FROM python:3.12-slim

WORKDIR /app

# Install backend deps first for layer caching.
COPY server/requirements.txt ./server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt

COPY server/ ./server/

# calls_db.py writes its SQLite file to ../agent/calls.db relative to server/,
# so the agent dir must exist for sqlite to create it. NOTE: this is ephemeral
# on Railway — the DB resets on each deploy. Move to Railway Postgres or a
# persistent volume for durable call history / phone-number ↔ LiveKit mapping.
RUN mkdir -p ./agent

# Railway injects $PORT at runtime.
CMD ["sh", "-c", "uvicorn token_api:app --host 0.0.0.0 --port ${PORT:-8000} --app-dir server"]
