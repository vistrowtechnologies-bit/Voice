#!/bin/bash
# Railway service startup — API/dashboard ONLY.
#
# The FastAPI backend (token API + telephony/SIP + dashboard) and its
# in-process campaign dialer run here, pointed at the Postgres DATABASE_URL.
#
# The LiveKit agent worker (agent/main.py) NO LONGER runs here — it was moved
# to LiveKit Cloud Agents (agent id CA_TGdpVhSdxDyS, region ap-south / "India
# West"), which auto-scales replicas per demand and gives each 2 CPU / 4GB RAM.
# That removed the OOM/SIGKILL mid-call crashes this trial-plan container hit
# when it tried to host both the API and the memory-heavy call worker together
# (the "agent restarts and re-greets the caller" bug). Deploy/update it with:
#   cd agent && lk agent deploy        (redeploy current code)
#   lk agent status | lk agent logs    (health / runtime logs)
# To roll back to the old single-container setup, restore the two-process
# version of this file from git history (it ran `python agent/main.py start`
# alongside uvicorn with `wait -n`).
set -e

exec uvicorn token_api:app --host 0.0.0.0 --port "${PORT:-8000}" --app-dir server
