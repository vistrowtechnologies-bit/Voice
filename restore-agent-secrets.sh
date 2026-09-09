#!/usr/bin/env bash
# Restore the phone worker's secrets (CA_TGdpVhSdxDyS) from Railway.
#
# WHY: `lk agent update-secrets --overwrite` REPLACES the entire secret set
# rather than updating the named key. Running it with a single --secrets pair
# wiped all 16 secrets off the agent on 2026-09-09. Never pass --overwrite
# unless you are supplying the complete set.
#
# This copies the values Railway already holds straight into the LiveKit
# agent. Values are piped between the two CLIs and never printed.
#
# Run:  bash restore-agent-secrets.sh
set -euo pipefail

AGENT_ID="CA_TGdpVhSdxDyS"
TMP="$(mktemp -t lk-secrets)"
trap 'rm -f "$TMP"' EXIT
chmod 600 "$TMP"

KEYS=(
  DATABASE_URL OPENAI_API_KEY SARVAM_API_KEY GOOGLE_APPLICATION_CREDENTIALS_JSON
  ELEVEN_API_KEY GEMINI_API_KEY TAVILY_API_KEY ZOHO_OAUTH_CLIENT_ID
  B2_APPLICATION_KEY B2_BUCKET_NAME B2_ENDPOINT_URL B2_KEY_ID B2_REGION
)

echo "Reading current values from Railway (service: voice)..."
railway variables --service voice --json \
  | KEYS="${KEYS[*]}" python3 -c '
import json, os, sys
d = json.load(sys.stdin)
want = os.environ["KEYS"].split()
missing, written = [], 0
with open(sys.argv[1], "w") as f:
    for k in want:
        v = d.get(k)
        if v is None:
            missing.append(k); continue
        # --secrets-file is one KEY=VALUE per line, so a value containing a
        # real newline would silently truncate. The Google credentials blob is
        # the one that risks this.
        if "\n" in str(v) or "\r" in str(v):
            missing.append(k + " (contains newlines - set this one by hand)"); continue
        f.write(f"{k}={v}\n"); written += 1
print(f"  prepared {written} secrets")
if missing:
    print("  NOT restored: " + ", ".join(missing))
' "$TMP"

echo "Writing to LiveKit agent $AGENT_ID (merge, NOT --overwrite)..."
cd "$(dirname "$0")/agent"
lk agent update-secrets --id "$AGENT_ID" --secrets-file "$TMP" --yes

echo
echo "Restored. Verifying names present (values never printed):"
lk agent secrets --id "$AGENT_ID"

cat <<'NOTE'

Two secrets are NOT in Railway and were not restored:
  GROQ_API_KEY        - only used by admin-gated groq/ models; nothing in
                        production selects one, so this can wait.
  NOISE_CANCELLATION  - an operator-wide A/B override. Agent 26 now carries
                        noise_cancellation='off' in the database, which takes
                        precedence anyway, so leaving this unset restores the
                        original per-agent default.

If you want either back, add them from their own dashboards.
NOTE
