"""Never open two replies in a row with the same acknowledgement.

Call 978: 7 of the agent's 8 turns began "ठीक है,"/"समझ गई,". Offline replays
with the tenant prompt softened, the per-turn directive removed, and the
code-added style blocks removed all still produced 8-10 of 12. The prompt
cannot hold it, so the TTS text stream swaps a repeat for a different opener —
immediately, so no turn waits longer for its first audio.
"""
import asyncio
import os
import sys
import types
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
for _k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
    os.environ.setdefault(_k, "x")
os.environ.setdefault("SARVAM_API_KEY", "test-key-not-used-offline")
import main

DEVA = main._SWAP_OPENERS["deva"]
LATIN = main._SWAP_OPENERS["latin"]


def _speak(agent, chunks):
    async def source():
        for c in chunks:
            yield c

    async def collect():
        return [piece async for piece in main._make_repeated_opener_transform(agent)(source())]

    return asyncio.run(collect())


class RepeatedOpener(unittest.TestCase):
    def setUp(self):
        self.agent = types.SimpleNamespace()

    def test_first_acknowledgement_is_kept_and_not_delayed(self):
        out = _speak(self.agent, ["\nठीक है,", " तो बताइए, business क्या है?"])
        self.assertEqual(out[0], "\nठीक है,")

    def test_a_repeat_is_swapped_on_the_first_chunk_without_waiting(self):
        _speak(self.agent, ["\nठीक है,", " तो बताइए?"])
        out = _speak(self.agent, ["\nठीक है,", " इस month के अंदर।"])
        first_word = out[0].strip().rstrip(",")
        self.assertIn(first_word, DEVA)
        self.assertTrue(out[0].endswith(","))
        self.assertEqual("".join(out).split(",", 1)[1], " इस month के अंदर।")

    def test_different_openers_in_a_row_are_left_alone(self):
        _speak(self.agent, ["\nठीक है,", " तो बताइए?"])
        self.assertEqual("".join(_speak(self.agent, ["\nसमझ गई,", " नया website?"])), "\nसमझ गई, नया website?")

    def test_a_reply_that_is_only_an_acknowledgement_keeps_its_punctuation(self):
        _speak(self.agent, ["\nठीक है,", " तो बताइए?"])
        out = "".join(_speak(self.agent, ["\nठीक है।"])).strip()
        self.assertIn(out.rstrip("।"), DEVA)
        self.assertTrue(out.endswith("।"))

    def test_romanised_repeats_get_a_romanised_swap(self):
        _speak(self.agent, ["\nTheek hai,", " toh bataiye?"])
        out = "".join(_speak(self.agent, ["\nTheek hai,", " kab tak chahiye?"]))
        self.assertIn(out.strip().split(",")[0], LATIN)

    def test_content_is_untouched_and_resets_the_opener(self):
        _speak(self.agent, ["\nठीक है,", " तो बताइए?"])
        out = "".join(_speak(self.agent, ["\nAbhi,", " पिछली बार आपने enquiry की थी।"]))
        self.assertEqual(out, "\nAbhi, पिछली बार आपने enquiry की थी।")
        self.assertEqual("".join(_speak(self.agent, ["\nठीक है,", " आगे?"])), "\nठीक है, आगे?")

    def test_a_word_that_merely_starts_like_one_is_not_an_opener(self):
        _speak(self.agent, ["\nOkay,", " next?"])
        self.assertEqual("".join(_speak(self.agent, ["\nOkaying the plan,", " next step?"])),
                         "\nOkaying the plan, next step?")


if __name__ == "__main__":
    unittest.main()
