"""Cut Sarvam TTS's real first-audio latency from ~1.4s to ~0.2-0.4s.

livekit-plugins-sarvam's SynthesizeStream sends every word as it arrives but
only flushes ("type": "flush", telling Sarvam to start speaking what it has)
once, after the LAST word of the whole reply — see _run_ws in tts.py. Sarvam
never produces audio before that flush arrives, so a caller hears nothing
until the entire reply has been generated and sent, not just the first
clause. Measured directly against Sarvam's real websocket API with 3 runs per
turn on real call-982 turns, at the real LLM inter-chunk gaps from that
call's own logs: first audio 1,431ms median with the flush held to the end,
245ms flushing after the first clause — a ~1.2s cut on every single turn.
Audio byte count matched between the two in the same benchmark, confirming
nothing is being dropped, only reordered.

The clause tokenizer already keeps the first clause at 6+ characters
(_MIN_CLAUSE_CHARS in clause_tokenizer.py), so this never fires on a bare
"अ" — the same clause boundary the caller was always going to hear as a
pause is just the one that starts speaking early instead of ending it.

IMPLEMENTATION NOTE — why this patches the connection object's send_str
in place rather than wrapping it in a proxy:

The first version of this patch wrapped the pooled websocket in a small
proxy class returned from an overridden _connect_ws. That broke on the very
first real-reuse test: sarvam.TTS._run_ws calls
``await self._tts._stop_keepalive(ws)`` on every connection checkout, and
_stop_keepalive keys its task dict by id(ws). _start_keepalive had already
registered the keepalive task under id(RAW ws) inside the base
_connect_ws, before the override wrapped it — so _stop_keepalive's lookup
by id(wrapper) always missed, the keepalive task never actually stopped,
and its background ``ws.receive()`` loop kept running concurrently with
_run_ws's own recv_task on the SAME raw connection. aiohttp raises
"Concurrent call to receive() is not allowed" the moment two callers race
its socket — confirmed reproducible on every single reused connection in a
live test against Sarvam's real API (control: unpatched sarvam.TTS ran 4
reuses clean; the wrapper version failed all 4). Patching _close_ws to
unwrap first fixed the _close_ws call site, but _stop_keepalive is called
directly in _run_ws too, independent of _close_ws — the same class of bug,
a second call site. Chasing every place the plugin compares id(ws) is
fragile. Keeping the exact same object identity throughout — patching
send_str onto the live connection instead of substituting a new object —
removes the whole hazard at its root instead of patching each symptom.
"""
from __future__ import annotations

import json
import logging

import aiohttp
from livekit.plugins import sarvam

logger = logging.getLogger("real-estate-voice-agent")

_ARMED_ATTR = "_vistrow_early_flush_armed"


def _early_flush_send_str(ws: aiohttp.ClientWebSocketResponse, original_send_str):
    """Returns a replacement for ws.send_str that injects one extra "flush"
    right after the first "text" message following each "config" message
    (each call to _run_ws sends one "config" at the start of its segment,
    which is the reset signal used here). Every other message — later text,
    the plugin's own end-of-reply flush, keepalive pings — passes straight
    through unchanged. A second flush on an already-started segment is a
    no-op on Sarvam's side, confirmed in the same benchmark that measured
    the latency numbers above."""

    async def send_str(data: str, *args, **kwargs) -> None:
        await original_send_str(data, *args, **kwargs)
        try:
            msg = json.loads(data)
        except ValueError:
            return
        msg_type = msg.get("type")
        if msg_type == "config":
            setattr(ws, _ARMED_ATTR, True)
        elif msg_type == "text" and getattr(ws, _ARMED_ATTR, False):
            setattr(ws, _ARMED_ATTR, False)
            await original_send_str(json.dumps({"type": "flush"}), *args, **kwargs)

    return send_str


class EarlyFlushTTS(sarvam.TTS):
    """Drop-in for sarvam.TTS. Same connection objects, same pool, same
    keepalive bookkeeping as upstream — only send_str is intercepted, on the
    exact instance the pool is already tracking, so no id(ws)-keyed lookup
    anywhere in the plugin can ever miss."""

    async def _connect_ws(self, timeout: float) -> aiohttp.ClientWebSocketResponse:
        ws = await super()._connect_ws(timeout)
        if not hasattr(ws, _ARMED_ATTR):
            ws.send_str = _early_flush_send_str(ws, ws.send_str)
            setattr(ws, _ARMED_ATTR, False)
        return ws
