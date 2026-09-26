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


if __name__ == "__main__":
    unittest.main()
