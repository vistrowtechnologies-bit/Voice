#!/usr/bin/env bash
# Roll SARVAM_API_KEY everywhere it is used, in one pass.
#
# Four places need it, and missing any one leaves calls hitting the old,
# empty-balance key:
#   1. LiveKit agent CA_TGdpVhSdxDyS  - default dispatch, serves PHONE calls
#   2. LiveKit agent CA_53d8HgBktjZ7  - platform-demo, serves the web widget
#   3. Railway service "voice"        - FastAPI: voice previews, TTS auditions
#   4. repo-root .env                 - local benchmarks and test scripts
#
# The key is read with `read -s` so it is never echoed, never written to shell
# history, and never printed. It is validated against the Sarvam API BEFORE
# anything is changed, so a typo or an unfunded key cannot take production down.
#
# Uses merge semantics deliberately: NEVER --overwrite. On 2026-09-09
# `update-secrets --overwrite` replaced the phone worker's entire secret set
# and took outbound calls down.
#
# Run:  bash update-sarvam-key.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PHONE_AGENT="CA_TGdpVhSdxDyS"
DEMO_AGENT="CA_53d8HgBktjZ7"

printf 'Paste the new SARVAM_API_KEY (input hidden), then press Enter: '
read -rs SARVAM_KEY
printf '\n\n'
[ -n "$SARVAM_KEY" ] || { echo "No key entered — aborting."; exit 1; }

# ---------------------------------------------------------------- validate
echo "1/6  Validating the key against the Sarvam API..."
HTTP=$(curl -s -o /tmp/sarvam_check.$$ -w '%{http_code}' \
  -X POST https://api.sarvam.ai/text-to-speech \
  -H "API-SUBSCRIPTION-KEY: $SARVAM_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"text":"test","target_language_code":"hi-IN","speaker":"priya","model":"bulbul:v3"}' )
BODY=$(head -c 300 /tmp/sarvam_check.$$ 2>/dev/null || true); rm -f /tmp/sarvam_check.$$
case "$HTTP" in
  200) echo "     OK - key works and has balance." ;;
  401|403) echo "     REJECTED (HTTP $HTTP): the key is not valid. Nothing changed."; exit 1 ;;
  402|429) echo "     HTTP $HTTP - key is valid but out of quota/credits. Nothing changed."
           echo "     $BODY"; exit 1 ;;
  *)   echo "     Unexpected HTTP $HTTP. Nothing changed."; echo "     $BODY"; exit 1 ;;
esac

TMP="$(mktemp -t sarvamkey)"; trap 'rm -f "$TMP"' EXIT; chmod 600 "$TMP"
printf 'SARVAM_API_KEY=%s\n' "$SARVAM_KEY" > "$TMP"

# ------------------------------------------------------- livekit (2 agents)
cd "$ROOT/agent"
echo "2/6  Phone worker $PHONE_AGENT (merge, not --overwrite)..."
lk agent update-secrets --id "$PHONE_AGENT" --secrets-file "$TMP" --yes >/dev/null
echo "     done - agent restarts automatically."

echo "3/6  Demo worker $DEMO_AGENT..."
lk agent update-secrets --id "$DEMO_AGENT" --secrets-file "$TMP" --yes >/dev/null
echo "     done."

# ------------------------------------------------------------------ railway
echo "4/6  Railway service voice..."
cd "$ROOT"
railway variables --service voice --set "SARVAM_API_KEY=$SARVAM_KEY" >/dev/null
echo "     done - Railway redeploys the service itself."

# ---------------------------------------------------------------- local env
echo "5/6  Local .env (backup kept as .env.bak)..."
SARVAM_KEY="$SARVAM_KEY" python3 - "$ROOT/.env" <<'PY'
import os, shutil, sys
path = sys.argv[1]
key = os.environ["SARVAM_KEY"]
shutil.copy2(path, path + ".bak")
lines, replaced = [], False
for line in open(path):
    if line.startswith("SARVAM_API_KEY="):
        lines.append(f"SARVAM_API_KEY={key}\n"); replaced = True
    else:
        lines.append(line)
if not replaced:
    lines.append(f"SARVAM_API_KEY={key}\n")
open(path, "w").writelines(lines)
print("     replaced" if replaced else "     appended (was absent)")
PY

# ------------------------------------------------------------------- verify
echo "6/6  Verifying the workers still hold every other secret..."
cd "$ROOT/agent"
for A in "$PHONE_AGENT" "$DEMO_AGENT"; do
  N=$(lk agent secrets --id "$A" 2>/dev/null | grep -c '│ [A-Z]' || true)
  echo "     $A -> $N secrets present"
done

cat <<'NOTE'

Done. Two things worth doing next:

  * ROTATE the key you pasted into the chat earlier today. It is sitting in
    plaintext in that conversation log, so treat it as compromised regardless
    of whether this script just deployed it.

  * The workers restart on a secret change. Wait for Status=Running:
        cd agent && lk agent status --id CA_TGdpVhSdxDyS
    then place one test call before trusting it - a secrets listing is not
    proof that calls work.
NOTE
