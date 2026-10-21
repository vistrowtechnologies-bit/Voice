# -*- coding: utf-8 -*-
"""A slash between words is spoken as "या"/"or", not read aloud (call 1443)."""
import asyncio
import unittest

import main


async def _collect(chunks):
    async def src():
        for c in chunks:
            yield c
    return "".join([x async for x in main._make_slash_transform()(src())])


def run(chunks):
    return asyncio.run(_collect(chunks))


class SpeakSlashes(unittest.TestCase):
    def test_hindi_reply_uses_ya(self):
        out = run(["आपकी website business/portfolio वाली है या services/projects ", "वाली?"])
        self.assertIn("business या portfolio", out)
        self.assertIn("services या projects", out)
        self.assertNotIn("/", out)

    def test_devanagari_words_with_nukta(self):
        self.assertIn("जोड़ या अपडेट", run(["projects जोड़/अपडेट कर सकें"]))

    def test_slash_split_across_chunks(self):
        self.assertIn("business या portfolio", run(["आपको business/", "portfolio चाहिए?"]))

    def test_english_reply_uses_or(self):
        self.assertEqual(run(["A business/portfolio site?"]), "A business or portfolio site?")

    def test_urls_dates_and_numbers_untouched(self):
        for text in ("visit vistrow.com/contact today", "https://www.vistrow.com/contact", "on 21/10 at 10:30", "2/3 pages"):
            with self.subTest(text=text):
                self.assertEqual(run([text]), text)


if __name__ == "__main__":
    unittest.main()


class NeverHoldsSpeechBack(unittest.TestCase):
    def test_each_chunk_without_a_trailing_slash_leaves_at_once(self):
        async def go():
            seen = []
            async def src():
                for c in ["नमस्ते जी,", " मैं आर्था", " बोल रही हूँ।"]:
                    yield c
                    seen.append(c)
            out = []
            async for x in main._make_slash_transform()(src()):
                out.append((x, len(seen)))
            return out
        out = asyncio.run(go())
        # each chunk is emitted before the next one is even pulled
        self.assertEqual([n for _x, n in out], [0, 1, 2])
        self.assertEqual("".join(x for x, _n in out), "नमस्ते जी, मैं आर्था बोल रही हूँ।")
