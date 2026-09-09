#!/usr/bin/env bash
# Push SARVAM_API_KEY from the local .env out to everything that uses it.
#
# No interactive prompt: the previous script used `read -s`, which reads
# nothing when run without a terminal (the app's Run button), so it aborted
# before changing anything. Edit .env in your editor instead, then run this.
#
# HOW TO USE
#   1. Open   /Users/mac15/BRANDS/VISTROW VOICE/.env
#   2. Change the SARVAM_API_KEY=sk_mva3isfe_s9jrdXK5pDY6HW6O93wqZjNn , save.
#   3. bash push-sarvam-key.sh
#
# Pushes to all three remote places (the .env is already the fourth):
#   CA_TGdpVhSdxDyS  - default dispatch, serves PHONE calls
#   CA_53d8HgBktjZ7  - platform-demo, serves the web widget
#   Railway "voice"  - FastAPI: voice previews and auditions
#
# Validates the key against the live API BEFORE changing anything, so a typo
# or an unfunded key cannot take production down. Merge semantics only —
# never --overwrite, which replaced the phone worker's whole secret set on
# 2026-09-09 and stopped outbound calls.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PHONE_AGENT="CA_TGdpVhSdxDyS"
DEMO_AGENT="CA_53d8HgBktjZ7"

[ -f "$ROOT/.env" ] || { echo "No .env at $ROOT — aborting."; exit 1; }
KEY="$(grep -m1 '^SARVAM_API_KEY=' "$ROOT/.env" | cut -d= -f2- | tr -d '"'"'"' \r\n')"
[ -n "$KEY" ] || { echo "SARVAM_API_KEY is empty or missing in .env — aborting."; exit 1; }

echo "Key found in .env, fingerprint: $(printf '%s' "$KEY" | cut -c1-8)…"

echo
echo "1/5  Validating against the Sarvam API (TTS + LLM)..."
T=$(curl -s -o /dev/null -w '%{http_code}' -X POST https://api.sarvam.ai/text-to-speech \
      -H "API-SUBSCRIPTION-KEY: $KEY" -H 'Content-Type: application/json' \
      -d '{"text":"test","target_language_code":"hi-IN","speaker":"priya","model":"bulbul:v3"}')
L=$(curl -s -o /dev/null -w '%{http_code}' -X POST https://api.sarvam.ai/v1/chat/completions \
      -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
      -d '{"model":"sarvam-105b-conversations","messages":[{"role":"user","content":"hi"}],"max_tokens":5}')
echo "     TTS -> HTTP $T     LLM -> HTTP $L"
if [ "$T" != "200" ]; then
  echo "     TTS rejected the key (HTTP $T). Nothing changed."
  case "$T" in 401|403) echo "     -> key invalid";; 402|429) echo "     -> out of credit/quota";; esac
  exit 1
fi
[ "$L" = "200" ] || echo "     WARNING: LLM returned $L. TTS/STT will work; sarvam/ models may not."

TMP="$(mktemp -t sarvamkey)"; trap 'rm -f "$TMP"' EXIT; chmod 600 "$TMP"
printf 'SARVAM_API_KEY=%s\n' "$KEY" > "$TMP"

cd "$ROOT/agent"
echo "2/5  Phone worker $PHONE_AGENT (merge)..."
lk agent update-secrets --id "$PHONE_AGENT" --secrets-file "$TMP" --yes >/dev/null
echo "     done"

echo "3/5  Demo worker $DEMO_AGENT (merge)..."
lk agent update-secrets --id "$DEMO_AGENT" --secrets-file "$TMP" --yes >/dev/null
echo "     done"

echo "4/5  Railway service voice..."
cd "$ROOT"
railway variables --service voice --set "SARVAM_API_KEY=$KEY" >/dev/null
echo "     done"

echo "5/5  Confirming nothing else was lost..."
cd "$ROOT/agent"
for A in "$PHONE_AGENT" "$DEMO_AGENT"; do
  N=$(lk agent secrets --id "$A" 2>/dev/null | grep -cE '^\│ [A-Z0-9_]+ ' || true)
  U=$(lk agent secrets --id "$A" 2>/dev/null | grep 'SARVAM_API_KEY' | awk -F'│' '{print $4}' | tr -d ' ')
  echo "     $A -> $N secrets, SARVAM_API_KEY updated $U"
done

cat <<'NOTE'

Both workers restart on a secret change. Before trusting it:
    cd agent && lk agent status --id CA_TGdpVhSdxDyS     # wait for Running
then place ONE test call. A secrets listing is not proof that calls work.
NOTE
