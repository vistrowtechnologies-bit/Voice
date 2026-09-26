"""Offline tests for Gemini 3.8 Interactions markup lowering."""

import base64
import json
import unittest

from livekit.agents.types import DEFAULT_API_CONNECT_OPTIONS

from gemini_interactions_tts import GeminiInteractionsTTS, _gemini_text_and_style


class GeminiInteractionsMarkupTests(unittest.TestCase):
    def test_expression_becomes_turn_style_and_laugh_is_native_inline_tag(self):
        text, style = _gemini_text_and_style(
            '<expression value="warm and reassuring"/>That is lovely! '
            '<sound value="laugh"/><break time="300ms"/>'
        )
        self.assertEqual(style, "warm and reassuring")
        self.assertEqual(text, "That is lovely! <laugh><short pause>")

    def test_unsupported_nonverbal_and_unknown_markup_are_removed(self):
        text, style = _gemini_text_and_style(
            'Hello <sound value="yawn"/> <unknown value="x"/> there'
        )
        self.assertEqual(text, "Hello there")
        self.assertIsNone(style)

    def test_stream_forwards_gemini_pcm_delta_to_livekit(self):
        pcm = base64.b64encode(b"\0\0" * 2400).decode("ascii")
        event = json.dumps({"event_type": "step.delta", "delta": {"type": "audio", "data": pcm}})

        class Content:
            async def __aiter__(self):
                yield f"data: {event}\n".encode()

        class Response:
            status = 200
            content = Content()

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return None

        class Session:
            closed = False

            def post(self, _url, **kwargs):
                self.payload = kwargs["json"]
                return Response()

        async def run():
            tts = GeminiInteractionsTTS(
                model="gemini-3.8-flash-tts", voice="Kore", api_key="unit-test-key"
            )
            tts._session = Session()
            stream = tts.stream(conn_options=DEFAULT_API_CONNECT_OPTIONS)
            stream.push_text('<sound value="laugh"/>Hello')
            stream.end_input()
            frames = [audio async for audio in stream]
            await stream.aclose()
            return frames, tts._session.payload

        import asyncio
        frames, payload = asyncio.run(run())
        self.assertTrue(frames)
        self.assertEqual(frames[0].frame.sample_rate, 24_000)
        self.assertEqual(payload["model"], "gemini-3.8-flash-tts")
        self.assertEqual(payload["input"][0]["content"][0]["text"], "<laugh>Hello")


class _FakeSession:
    """Records each request's text and when it was sent; answers with 100ms
    of PCM. `gate` lets a test hold the first response open."""

    closed = False

    def __init__(self, gate=None):
        self.texts: list[str] = []
        self.gate = gate
        self.sent_at: list[int] = []

    def post(self, _url, **kwargs):
        session = self
        session.texts.append(kwargs["json"]["input"][0]["content"][0]["text"])
        session.sent_at.append(session.pushed)
        pcm = base64.b64encode(b"\0\0" * 2400).decode("ascii")
        event = json.dumps({"event_type": "step.delta", "delta": {"type": "audio", "data": pcm}})

        class Content:
            async def __aiter__(self):
                if session.gate is not None and len(session.texts) == 1:
                    await session.gate.wait()
                yield f"data: {event}\n".encode()

        class Response:
            status = 200
            content = Content()

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return None

        return Response()


class FirstClauseIsSentEarly(unittest.TestCase):
    TEXT = "नमस्ते! मैं Vistrow Voice से बोल रही हूँ, क्या आपके पास दो मिनट हैं?"

    def run_stream(self, text, chunk=3, gate=None, cancel_after=None):
        import asyncio

        async def run():
            tts = GeminiInteractionsTTS(model="gemini-3.8-flash-lite-tts", voice="Kore", api_key="k")
            session = _FakeSession(gate)
            session.pushed = 0
            tts._session = session
            stream = tts.stream(conn_options=DEFAULT_API_CONNECT_OPTIONS)
            for i in range(0, len(text), chunk):
                stream.push_text(text[i:i + chunk])
                session.pushed = i + chunk
                await asyncio.sleep(0.005)
                if cancel_after is not None and len(session.texts) >= cancel_after:
                    await stream.aclose()
                    return session, []
            if cancel_after is not None:  # never reached the cut: fail, don't hang
                await stream.aclose()
                return session, []
            stream.end_input()
            frames = [audio async for audio in stream]
            await stream.aclose()
            return session, frames

        return asyncio.run(run())

    def test_first_clause_goes_out_before_the_turn_is_finished(self):
        session, frames = self.run_stream(self.TEXT)
        self.assertEqual(len(session.texts), 2)
        self.assertEqual(session.texts[0], "नमस्ते!")
        self.assertLess(session.sent_at[0], len(self.TEXT) // 2)
        self.assertTrue(frames)

    def test_no_text_is_lost_between_the_two_requests(self):
        session, _ = self.run_stream(self.TEXT)
        self.assertEqual(" ".join(session.texts), self.TEXT)

    def test_both_requests_are_one_audio_segment(self):
        _, frames = self.run_stream(self.TEXT)
        self.assertEqual(len({f.segment_id for f in frames}), 1)

    def test_never_cuts_inside_a_markup_tag(self):
        text = 'ठीक <expression value="warm, calm"/>है, तो बताइए कब आ सकते हैं?'
        session, _ = self.run_stream(text)
        for sent in session.texts:
            self.assertEqual(sent.count("<"), sent.count(">"), sent)

    def test_does_not_cut_a_decimal_number(self):
        session, _ = self.run_stream("बजट लगभग 3.5 करोड़ है, सही?", chunk=1)
        self.assertNotIn(session.texts[0], ("बजट लगभग 3.",))
        self.assertTrue(session.texts[0].endswith(","), session.texts)

    def test_short_reply_without_a_boundary_is_one_request(self):
        session, _ = self.run_stream("जी हाँ")
        self.assertEqual(session.texts, ["जी हाँ"])

    def test_interrupting_mid_first_clause_closes_cleanly(self):
        import asyncio

        gate = asyncio.Event()  # first response never finishes
        session, _ = self.run_stream(self.TEXT, gate=gate, cancel_after=1)
        self.assertEqual(len(session.texts), 1)


if __name__ == "__main__":
    unittest.main()
