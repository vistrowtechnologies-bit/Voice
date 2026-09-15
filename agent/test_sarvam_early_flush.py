"""EarlyFlushTTS must start Sarvam speaking after the first clause, not the
whole reply — and must never introduce a new object that could desync the
plugin's id(ws)-keyed keepalive bookkeeping.

Measured against Sarvam's real API (3 runs/turn, real call-982 LLM-chunk
timing): flushing at the end (today) is 1,431ms median to first audio;
flushing after the first clause is 245ms. Same audio byte count either way.

A first version of this patch wrapped the connection in a proxy object and
broke connection reuse outright: sarvam.TTS._run_ws calls
_stop_keepalive(ws) by id(ws) on every checkout, and the keepalive task had
been registered under id(the RAW connection) before the wrapper existed, so
the lookup always missed — every 2nd+ call on a real, live-tested instance
failed with "Concurrent call to receive() is not allowed" (control: 4/4
clean on unpatched sarvam.TTS; 4/4 failed on the wrapper). This patches
send_str in place on the live connection instead, so id(ws) never changes.
"""
import asyncio
import json
import os
import sys
import types
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
for _k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "SARVAM_API_KEY"):
    os.environ.setdefault(_k, "x")

from sarvam_early_flush_patch import _ARMED_ATTR, _early_flush_send_str


class _FakeWs:
    """A plain object, the same shape _connect_ws patches send_str onto —
    no __slots__, so setting an instance attribute is exactly what happens
    to a real aiohttp.ClientWebSocketResponse."""

    def __init__(self):
        self.sent: list[str] = []

    async def send_str(self, data: str) -> None:
        self.sent.append(data)


def _armed(ws) -> bool:
    return getattr(ws, _ARMED_ATTR, False)


def _types_sent(sent: list[str]) -> list[str]:
    return [json.loads(s)["type"] for s in sent]


def _patch(ws: _FakeWs) -> None:
    ws.send_str = _early_flush_send_str(ws, ws.send_str)


class IdentityIsPreserved(unittest.TestCase):
    """The whole point of this design: no new object, so nothing that keys
    off id(ws) — the plugin's keepalive bookkeeping — can ever desync."""

    def test_patching_does_not_change_the_object(self):
        ws = _FakeWs()
        before = id(ws)
        _patch(ws)
        self.assertEqual(id(ws), before)

    def test_patching_twice_does_not_double_wrap(self):
        # _connect_ws guards on hasattr(ws, _ARMED_ATTR) — a pooled connection
        # reused across calls must only ever get one layer of interception.
        ws = _FakeWs()
        original = ws.send_str
        if not hasattr(ws, _ARMED_ATTR):
            ws.send_str = _early_flush_send_str(ws, ws.send_str)
            setattr(ws, _ARMED_ATTR, False)
        once_wrapped = ws.send_str
        if not hasattr(ws, _ARMED_ATTR):  # mirrors _connect_ws's guard
            ws.send_str = _early_flush_send_str(ws, ws.send_str)
        self.assertIs(ws.send_str, once_wrapped)
        self.assertIsNot(ws.send_str, original)


class InjectsExactlyOneFlushPerSegment(unittest.TestCase):
    def test_flush_follows_the_first_text_after_config(self):
        ws = _FakeWs()
        _patch(ws)

        async def run():
            await ws.send_str(json.dumps({"type": "config", "data": {}}))
            await ws.send_str(json.dumps({"type": "text", "data": {"text": "देखिए,"}}))

        asyncio.run(run())
        self.assertEqual(_types_sent(ws.sent), ["config", "text", "flush"])

    def test_later_text_in_the_same_segment_gets_no_extra_flush(self):
        ws = _FakeWs()
        _patch(ws)

        async def run():
            await ws.send_str(json.dumps({"type": "config", "data": {}}))
            await ws.send_str(json.dumps({"type": "text", "data": {"text": "देखिए,"}}))
            await ws.send_str(json.dumps({"type": "text", "data": {"text": " price..."}}))
            await ws.send_str(json.dumps({"type": "flush"}))  # the plugin's own end-of-reply flush

        asyncio.run(run())
        self.assertEqual(_types_sent(ws.sent), ["config", "text", "flush", "text", "flush"])

    def test_a_new_segment_re_arms_it(self):
        ws = _FakeWs()
        _patch(ws)

        async def run():
            await ws.send_str(json.dumps({"type": "config", "data": {}}))
            await ws.send_str(json.dumps({"type": "text", "data": {"text": "पहला"}}))
            await ws.send_str(json.dumps({"type": "flush"}))
            await ws.send_str(json.dumps({"type": "config", "data": {}}))
            await ws.send_str(json.dumps({"type": "text", "data": {"text": "दूसरा"}}))

        asyncio.run(run())
        self.assertEqual(
            _types_sent(ws.sent),
            ["config", "text", "flush", "flush", "config", "text", "flush"],
        )

    def test_a_non_text_non_config_message_is_left_alone(self):
        # Keepalive pings ({"type": "ping"}) must never arm or trigger the injection.
        ws = _FakeWs()
        _patch(ws)

        async def run():
            await ws.send_str(json.dumps({"type": "ping"}))

        asyncio.run(run())
        self.assertEqual(_types_sent(ws.sent), ["ping"])
        self.assertFalse(_armed(ws))


class ExtraArgsPassThrough(unittest.TestCase):
    def test_positional_and_keyword_args_reach_the_original(self):
        seen = []

        class Ws:
            async def send_str(self, data, *a, **kw):
                seen.append((data, a, kw))

        ws = Ws()
        _patch(ws)
        asyncio.run(ws.send_str(json.dumps({"type": "ping"}), compress=True))
        self.assertEqual(seen, [(json.dumps({"type": "ping"}), (), {"compress": True})])


if __name__ == "__main__":
    unittest.main()
