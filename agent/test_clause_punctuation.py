"""Never send a TTS request that is only punctuation.

Call 981: the latency filler "हम्म..." arrived as "हम्म." "." "."; the clause
stream emitted "हम्म.." and flushed the last "." on its own. Sarvam rejects
text with no letters (400), the fallback voice is billing-blocked, and every
later turn logged "all TTSs are unavailable".
"""
import asyncio
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from clause_tokenizer import ClauseTokenizer


def _stream_tokens(pieces):
    async def run():
        stream = ClauseTokenizer().stream()
        for p in pieces:
            stream.push_text(p)
        stream.end_input()
        return [ev.token async for ev in stream]

    return asyncio.run(run())


class NoPunctuationOnlyRequests(unittest.TestCase):
    def test_call_981_filler_never_sends_a_lone_full_stop(self):
        tokens = _stream_tokens(["हम्म.", ".", "."])
        self.assertTrue(tokens)
        for t in tokens:
            self.assertRegex(t, r"\w")

    def test_a_trailing_ellipsis_after_a_sentence_is_not_its_own_request(self):
        tokens = _stream_tokens(["समझ गई, नया website चाहिए", "...", ""])
        for t in tokens:
            self.assertRegex(t, r"\w")

    def test_non_stream_tokenize_drops_a_punctuation_only_tail(self):
        for t in ClauseTokenizer().tokenize("समझ गई, नया website चाहिए। ..."):
            self.assertRegex(t, r"\w")

    def test_real_words_still_come_through(self):
        # Each clause is its own synthesis request, so compare words, not inter-clause spacing.
        words = " ".join(_stream_tokens(["अच्छा, तो बताइए —", " business क्या है?"])).split()
        self.assertEqual(words, "अच्छा, तो बताइए — business क्या है?".split())


if __name__ == "__main__":
    unittest.main()
