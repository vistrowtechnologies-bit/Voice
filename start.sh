#!/bin/bash
# Runs both processes in one Railway service so they share calls.db on the
# container's filesystem (or a mounted volume via CALLS_DB_PATH): the FastAPI
# backend (token API + telephony/SIP + dashboard) and the LiveKit agent
# worker that actually answers calls. If either exits, stop the container so
# Railway restarts it rather than limping along with only one process alive.
#
# Needs bash, not /bin/sh (dash on Debian) — `wait -n` is a bash builtin
# feature; dash's wait doesn't support -n and errors on every invocation,
# which silently prevented both processes from ever starting.
set -e

uvicorn token_api:app --host 0.0.0.0 --port "${PORT:-8000}" --app-dir server &
BACKEND_PID=$!

python agent/main.py start &
AGENT_PID=$!

wait -n "$BACKEND_PID" "$AGENT_PID"
exit $?
