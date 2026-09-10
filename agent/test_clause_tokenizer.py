"""The clause tokenizer, and that it actually reaches both TTS providers.

Guards the fix for the 970ms gap measured on the widget. [tts_node]
instrumentation showed audio starting 140-180ms after the first SENTENCE
terminator every time, and a conversational Hindi turn puts its only
terminator at the very end, so streaming never streamed.
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
        self.assertTrue(out[0].endswith("—"), out)
        self.assertIn("समझ गई", out[0])

    def test_first_chunk_is_a_small_fraction_of_the_turn(self):
        line = "अरे, वही तो मैं सोच रही थी — तो कॉल का क्या फायदा, बताइए।"
        first = ClauseTokenizer().tokenize(line)[0]
        self.assertLess(len(first), len(line) * 0.6)

    def test_punctuation_is_retained_so_prosody_is_unchanged(self):
        line = "समझ गई, manual handle होता है — daily कितनी calls?"
        joined = "".join(ClauseTokenizer().tokenize(line))
        self.assertEqual(joined.replace(" ", ""), line.replace(" ", ""))

    def test_short_fragments_do_not_get_their_own_synthesis_request(self):
        # "अरे," alone is two syllables and a whole round trip.
        out = ClauseTokenizer().tokenize("अरे, वही तो मैं सोच रही थी।")
        self.assertTrue(all(len(t.strip()) >= 12 for t in out), out)

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


class PromptTellsTheModelToPunctuate(unittest.TestCase):
    def test_voice_style_asks_for_full_stops(self):
        from prompts.voice_style import VOICE_STYLE_PROMPT

        self.assertIn("Punctuation is timing", VOICE_STYLE_PROMPT)
        self.assertIn("full stop", VOICE_STYLE_PROMPT)


if __name__ == "__main__":
    unittest.main()
