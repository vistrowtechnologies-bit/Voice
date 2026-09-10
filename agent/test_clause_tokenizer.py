"""The clause tokenizer and the two-call split it feeds.

Guards the fix for the 970ms gap on the widget. The mechanism is measured in
clause_tokenizer.py and google_tts_streaming_patch.py: Google's
streaming_synthesize emits nothing until its input ends (~165ms after the
last character, whatever the punctuation), so the only lever is closing a
call early. The tokenizer decides where that cut lands.
"""
import asyncio
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")
os.environ.setdefault("SARVAM_API_KEY", "sk_test")

from clause_tokenizer import ClauseTokenizer

_FAKE_GOOGLE_CREDS = {
    "type": "service_account",
    "project_id": "x",
    "private_key": "",
    "client_email": "x@x",
    "token_uri": "https://oauth2.googleapis.com/token",
}


class Splitting(unittest.TestCase):
    def test_splits_on_comma_and_em_dash(self):
        # Verbatim from the widget worker log, turn F — no early terminator,
        # so the stock tokenizer held all of it and audio started at +1027ms.
        line = "समझ गई, manual handle होता है — daily roughly कितनी calls आती हैं?"
        out = ClauseTokenizer().tokenize(line)
        self.assertGreater(len(out), 1)
        # The acknowledgement leads on its own — that is the chunk that
        # reaches the synthesizer first and it is why the turn starts early.
        self.assertEqual(out[0].strip(), "समझ गई,")
        self.assertTrue(any(t.strip().endswith("—") for t in out), out)

    def test_first_chunk_is_a_small_fraction_of_the_turn(self):
        line = "अरे, वही तो मैं सोच रही थी — तो कॉल का क्या फायदा, बताइए।"
        first = ClauseTokenizer().tokenize(line)[0]
        self.assertLess(len(first), len(line) * 0.6)

    def test_punctuation_is_retained_so_prosody_is_unchanged(self):
        line = "समझ गई, manual handle होता है — daily कितनी calls?"
        joined = "".join(ClauseTokenizer().tokenize(line))
        self.assertEqual(joined.replace(" ", ""), line.replace(" ", ""))

    def test_short_fragments_do_not_get_their_own_synthesis_request(self):
        # "अरे," is 4 characters — two syllables and a whole round trip.
        from clause_tokenizer import _MIN_CLAUSE_CHARS

        out = ClauseTokenizer().tokenize("अरे, वही तो मैं सोच रही थी।")
        self.assertTrue(all(len(t.strip()) >= _MIN_CLAUSE_CHARS for t in out), out)

    def test_the_openers_this_agent_actually_uses_do_split(self):
        """"अच्छा," (6) and "समझ गई," (7) open most turns. A minimum above
        them meant those turns never split — measured 1165ms vs 582ms."""
        for opener in ("अच्छा,", "समझ गई,"):
            out = ClauseTokenizer().tokenize(opener + " तो बताइए आगे क्या हुआ?")
            self.assertGreater(len(out), 1, f"{opener} did not split: {out}")

    def test_plain_sentences_still_split_at_sentences(self):
        out = ClauseTokenizer().tokenize("पहला वाक्य पूरा हुआ। दूसरा वाक्य यहाँ है।")
        self.assertEqual(len(out), 2, out)

    def test_english_is_unharmed(self):
        out = ClauseTokenizer().tokenize("Sure, I can help with that. What is your name?")
        self.assertEqual("".join(out).replace(" ", ""),
                         "Sure, I can help with that. What is your name?".replace(" ", ""))


class Streaming(unittest.TestCase):
    def test_emits_before_the_text_is_finished(self):
        """The whole point: a chunk must leave mid-generation.

        Without this the tokenizer is a no-op — the TTS still receives
        everything at end_input, which is what the 970ms was.
        """

        async def go():
            stream = ClauseTokenizer().stream()
            stream.push_text("समझ गई, manual handle होता है — daily roughly कितनी calls")
            got = []
            try:
                got.append(await asyncio.wait_for(stream.__anext__(), timeout=2.0))
            except asyncio.TimeoutError:
                pass
            stream.end_input()
            await stream.aclose()
            return got

        got = asyncio.run(go())
        self.assertTrue(got, "emitted nothing until end_input — streaming is defeated")
        self.assertIn("समझ गई", got[0].token)

    def test_stock_tokenizer_would_have_emitted_nothing(self):
        """Control: the default really does hold the same text back."""
        from livekit.agents import tokenize

        async def go():
            stream = tokenize.blingfire.SentenceTokenizer().stream()
            stream.push_text("समझ गई, manual handle होता है — daily roughly कितनी calls")
            got = []
            try:
                got.append(await asyncio.wait_for(stream.__anext__(), timeout=1.0))
            except asyncio.TimeoutError:
                pass
            stream.end_input()
            await stream.aclose()
            return got

        self.assertFalse(asyncio.run(go()))


class WiredIntoBothProviders(unittest.TestCase):
    def test_google_tts_defaults_to_it(self):
        from google_tts_streaming_patch import PatchedGeminiTTS

        tts = PatchedGeminiTTS(credentials_info=_FAKE_GOOGLE_CREDS)
        self.assertIsInstance(tts._opts.tokenizer, ClauseTokenizer)

    def test_an_explicit_tokenizer_still_wins(self):
        from livekit.agents import tokenize
        from google_tts_streaming_patch import PatchedGeminiTTS

        mine = tokenize.basic.SentenceTokenizer()
        tts = PatchedGeminiTTS(tokenizer=mine, credentials_info=_FAKE_GOOGLE_CREDS)
        self.assertIs(tts._opts.tokenizer, mine)

    def test_sarvam_tts_gets_it(self):
        from livekit.plugins import sarvam
        import main

        tts = sarvam.TTS(target_language_code="hi-IN", model="bulbul:v3", speaker="shubh")
        # The private field the helper reaches for must still exist — this is
        # the guard against it moving under us in a plugin upgrade.
        self.assertTrue(hasattr(tts._opts, "word_tokenizer"))
        main._use_clause_tokenizer(tts, "test")
        self.assertIsInstance(tts._opts.word_tokenizer, ClauseTokenizer)

    def test_build_tts_applies_it_to_the_sarvam_path(self):
        import inspect
        import main

        src = inspect.getsource(main._build_tts)
        self.assertEqual(src.count("_use_clause_tokenizer("), 2, src.count("_use_clause_tokenizer("))


class TheSplitIsWiredIn(unittest.TestCase):
    """The tokenizer alone is a no-op — the win is one call per side of the
    first cut. These guard the split itself, which the tokenizer only aims."""

    def test_run_stream_opens_two_calls(self):
        import inspect
        from google_tts_streaming_patch import _PatchedSynthesizeStream

        src = inspect.getsource(_PatchedSynthesizeStream._run_stream)
        self.assertEqual(src.count("_synthesize_call("), 2, src)

    def test_first_call_opens_before_the_text_exists(self):
        """Awaiting the first token before opening the gRPC call serialized
        setup behind the LLM and cost 94-143ms on short turns. The generator
        must do the awaiting from inside the open call."""
        import inspect
        from google_tts_streaming_patch import _PatchedSynthesizeStream

        src = inspect.getsource(_PatchedSynthesizeStream._run_stream)
        first_call = src.index("_synthesize_call(")
        self.assertNotIn("await _next_token", src[:first_call], src[:first_call])

    def test_one_segment_for_the_whole_turn(self):
        """Two segments raise 'number of segments mismatch: expected 1'."""
        import inspect
        from google_tts_streaming_patch import _PatchedSynthesizeStream

        whole = inspect.getsource(_PatchedSynthesizeStream)
        self.assertEqual(whole.count("start_segment("), 1, whole.count("start_segment("))
        self.assertEqual(whole.count("end_segment("), 1)

    def test_a_one_clause_turn_does_not_open_an_empty_second_call(self):
        import inspect
        from google_tts_streaming_patch import _PatchedSynthesizeStream

        src = inspect.getsource(_PatchedSynthesizeStream._run_stream)
        self.assertIn("if second is None:", src)

    def test_empty_turn_synthesizes_nothing(self):
        import inspect
        from google_tts_streaming_patch import _PatchedSynthesizeStream

        src = inspect.getsource(_PatchedSynthesizeStream._run_stream)
        self.assertIn("if not got_first:", src)


class EmitsWithoutWaitingForWhatFollows(unittest.TestCase):
    """Call 946 turn 3: the clause was complete at +457ms but only emitted at
    +1413ms, when the LLM wrote the next clause. Audio landed at +1590ms."""

    @staticmethod
    def _run(pushes, flush=False):
        """Push, then read whatever is available right now.

        The stream's channel binds to the running loop, so it has to be built
        inside the coroutine.
        """

        async def go():
            stream = ClauseTokenizer().stream()
            for chunk in pushes:
                stream.push_text(chunk)
            if flush:
                stream.flush()
            got = []
            while True:
                try:
                    got.append(await asyncio.wait_for(stream.__anext__(), timeout=0.3))
                except (asyncio.TimeoutError, StopAsyncIteration):
                    await stream.aclose()
                    return got

        return asyncio.run(go())

    def test_terminator_at_end_of_buffer_emits_immediately(self):
        # Exactly what had arrived at +457ms on call 946 — nothing after "!".
        got = self._run(["\nअरे वाह,", " रियल एस्टेट!"])
        self.assertTrue(got, "clause withheld until the next clause exists")
        # Both boundaries are complete by now and neither waited for the
        # third chunk, which on call 946 did not arrive for another 956ms.
        self.assertEqual(got[0].token.strip(), "अरे वाह,")
        self.assertIn("रियल एस्टेट!", "".join(t.token for t in got))

    def test_short_opener_waits_for_the_next_boundary(self):
        self.assertFalse(self._run(["अरे,"]), "split after a 3-letter filler")

    def test_no_boundary_means_no_emission_until_flush(self):
        text = ["अच्छा तो फिर हम कल सुबह वापस कॉल"]
        self.assertFalse(self._run(text))
        self.assertTrue(self._run(text, flush=True))

    def test_nothing_is_lost_across_the_boundaries(self):
        line = "समझ गई, manual handle होता है — daily roughly कितनी calls आती हैं?"
        got = self._run([line[i:i + 3] for i in range(0, len(line), 3)], flush=True)
        joined = "".join(t.token for t in got)
        self.assertEqual(joined.replace(" ", ""), line.replace(" ", ""))


if __name__ == "__main__":
    unittest.main()
