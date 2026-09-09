#!/usr/bin/env bash
# Does saaras:v3-realtime emit transcript.partial for a given key?
#
# Answers the account question directly: partials worked once on 2026-09-09
# ~06:00 UTC and have returned zero on every connection since, on the key in
# .env (sk_y8tek…). If a key from the credited account DOES get partials, the
# feature is account/tier gated and the fix is the key. If it does not, the
# fault is Sarvam-side for both accounts and belongs in the support thread.
#
# The key is typed at the prompt, used only for this process, and never
# written anywhere. Nothing in the repo or on any worker is changed.
#
# RUN THIS IN YOUR TERMINAL (not the Run button - it needs keyboard input):
#     bash test-sarvam-partials.sh
set -euo pipefail
cd "$(dirname "$0")"

printf 'Paste the key to TEST (hidden), then Enter: '
read -rs TESTKEY
printf '\n\n'
[ -n "$TESTKEY" ] || { echo "No key entered - aborting."; exit 1; }

TESTKEY="$TESTKEY" ./agent/.venv/bin/python - <<'PY'
import asyncio, base64, io, json, os, time, wave, audioop
from urllib.parse import urlencode
import aiohttp

KEY = os.environ["TESTKEY"]
print(f"testing key {KEY[:8]}...\n")
SENT = "हाँ जी बोलिए, मुझे अपनी मिठाई की दुकान के लिए एक नई वेबसाइट बनवानी है।"

async def synth():
    async with aiohttp.ClientSession() as s:
        r = await s.post("https://api.sarvam.ai/text-to-speech",
            headers={"API-SUBSCRIPTION-KEY": KEY, "Content-Type": "application/json"},
            json={"text": SENT, "target_language_code": "hi-IN",
                  "speaker": "priya", "model": "bulbul:v3"})
        if r.status != 200:
            print(f"TTS failed HTTP {r.status}: {(await r.text())[:200]}")
            raise SystemExit(1)
        j = await r.json()
    with wave.open(io.BytesIO(base64.b64decode(j["audios"][0]))) as w:
        pcm, sr = w.readframes(w.getnframes()), w.getframerate()
    if sr != 16000:
        pcm, _ = audioop.ratecv(pcm, 2, 1, sr, 16000, None)
    return pcm

async def main():
    pcm = await synth()
    print(f"synthesised {len(pcm)/2/16000:.2f}s of speech\n")
    q = {"language_code": "hi-IN", "model": "saaras:v3-realtime", "stream_type": "fast",
         "mode": "transcribe", "endpointing": "vad", "encoding": "linear16",
         "sample_rate": "16000", "threshold": "0.3", "prefix_padding_ms": "300",
         "silence_duration_ms": "500", "min_speech_duration_ms": "250"}
    url = f"wss://api.sarvam.ai/speech-to-text-realtime/ws?{urlencode(q)}"
    n = int(16000*0.02)*2
    parts, first_p, last_p, fin, cfg = 0, None, None, None, None
    async with aiohttp.ClientSession() as s:
        async with s.ws_connect(url, headers={"API-SUBSCRIPTION-KEY": KEY}) as ws:
            t0 = time.perf_counter()
            async def send():
                for i in range(0, len(pcm), n):
                    await ws.send_str(json.dumps({"event": "audio_input",
                        "audio": base64.b64encode(pcm[i:i+n]).decode()}))
                    await asyncio.sleep(0.02)
                sil = base64.b64encode(b"\x00"*n).decode()
                for _ in range(45):
                    await ws.send_str(json.dumps({"event": "audio_input", "audio": sil}))
                    await asyncio.sleep(0.02)
            async def recv():
                nonlocal parts, first_p, last_p, fin, cfg
                async for m in ws:
                    if m.type != aiohttp.WSMsgType.TEXT: continue
                    e = json.loads(m.data); k = e.get("event")
                    ms = (time.perf_counter()-t0)*1000
                    if k == "session.begin":
                        cfg = e.get("config")
                    elif k == "transcript.partial":
                        parts += 1
                        if first_p is None: first_p = ms
                        last_p = ms
                        print(f"  {ms:7.0f}ms  partial  {e.get('text','')[:60]!r}")
                    elif k == "transcript.final":
                        fin = ms
                        print(f"  {ms:7.0f}ms  FINAL    {e.get('text','')[:60]!r}")
                        return
                    elif k == "error":
                        print(f"  {ms:7.0f}ms  ERROR    {e.get('message')}")
            try:
                await asyncio.wait_for(asyncio.gather(send(), recv()), timeout=45)
            except asyncio.TimeoutError:
                print("  (timed out)")
    print()
    print("server accepted:", {k: (cfg or {}).get(k) for k in ("model","stream_type","turn_detection")})
    print(f"partials: {parts}")
    if parts and fin and last_p:
        print(f"\n>>> PARTIALS WORK on this key. Last partial {fin-last_p:.0f}ms before the final.")
        print(">>> That head start is what hides the LLM. Set SARVAM_REALTIME_STT=1.")
    else:
        print("\n>>> NO PARTIALS on this key either — same as sk_y8tek.")
        print(">>> Not an account/key problem. It is Sarvam-side; send them the bug report.")
asyncio.run(main())
PY
