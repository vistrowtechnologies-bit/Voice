#!/usr/bin/env bash
# Point the phone worker at the PUBLIC database host.
#
# WHY: the restore pulled DATABASE_URL from the Railway "voice" service, whose
# value is pgbouncer.railway.internal:5432 — a private hostname that resolves
# only INSIDE Railway. The LiveKit agent runs on LiveKit Cloud, so it failed
# with:
#     psycopg.OperationalError: failed to resolve host 'pgbouncer.railway.internal'
# and the outbound call never connected.
#
# The local .env holds the public proxy URL (hayabusa.proxy.rlwy.net:24030),
# which is what reaches the same database from outside Railway — it is what
# every local script in this repo already uses.
#
# Only DATABASE_URL is affected; the other twelve restored secrets are plain
# API keys with no internal/external split.
#
# Run:  bash fix-agent-database-url.sh
set -euo pipefail

AGENT_ID="CA_TGdpVhSdxDyS"
ROOT="$(cd "$(dirname "$0")" && pwd)"

if ! grep -q '^DATABASE_URL=' "$ROOT/.env"; then
  echo "ERROR: no DATABASE_URL in $ROOT/.env — cannot continue." >&2
  exit 1
fi

TMP="$(mktemp -t lk-dburl)"
trap 'rm -f "$TMP"' EXIT
chmod 600 "$TMP"

grep '^DATABASE_URL=' "$ROOT/.env" | head -1 > "$TMP"

# Show the host only, never the credentials, so you can eyeball it first.
python3 - "$TMP" <<'PY'
import sys, urllib.parse
line = open(sys.argv[1]).read().strip()
url = line.split("=", 1)[1]
p = urllib.parse.urlparse(url)
print(f"Setting DATABASE_URL -> host {p.hostname}:{p.port} (credentials not shown)")
if ".railway.internal" in (p.hostname or ""):
    sys.exit("ERROR: that is still an internal host — aborting.")
PY

cd "$ROOT/agent"
lk agent update-secrets --id "$AGENT_ID" --secrets-file "$TMP" --yes

echo
echo "Done. The agent restarts automatically; wait for Status=Running:"
lk agent status --id "$AGENT_ID"
