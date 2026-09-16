"""An interrupted turn's saved transcript must be the real spoken text.

Call 985: the transcript for one assistant turn was shorter than what the
recording showed was actually said. Traced (not guessed) to
livekit-agents' voice/transcription/synchronizer.py: an interrupted turn's
chat-history text is `synchronized_transcript`, a pacing estimate built by
counting "hyphens" per word through a Frank-Liang hyphenator that is
English-only. Verified directly against that hyphenator (all real
Devanagari words come back as exactly one "hyphen" each, regardless of
length):

    >>> from livekit.agents.tokenize import basic
    >>> basic.hyphenate_word("है")               # 2 chars
    ['है']
    >>> basic.hyphenate_word("आवश्यकतानुसार")     # 13 chars
    ['आवश्यकतानुसार']

Since the model can't tell a long Hindi word from a short one, its
estimate of "how much audio had played" drifts from reality for
Hindi/Hinglish text — exactly the mismatch call 985 showed.

The fix (main.py's tts_node + _build_transcript) doesn't touch pacing or
interruption behaviour at all — those already burned us once tonight
(the EarlyFlushTTS revert). It only changes what gets WRITTEN to the
transcript after the fact: tts_node captures the real full text that was
sent to speech for every turn, and _build_transcript substitutes it in
only for turns the framework already marked interrupted, only when its
own estimate is shorter.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
for _k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
    os.environ.setdefault(_k, "x")
import main


class FakeItem:
    def __init__(self, role, text_content, interrupted=False):
        self.role = role
        self.text_content = text_content
        self.interrupted = interrupted


class InterruptedTurnUsesTheRealText(unittest.TestCase):
    def test_short_estimate_is_replaced_by_the_captured_full_text(self):
        # The turn from call 985: the framework's synchronized_transcript
        # estimate cut off mid-sentence; tts_node's capture has the rest.
        estimate = "Namaste Abhi, main Artha bol rahi"
        full = "Namaste Abhi, main Artha bol rahi hoon Vistrow Technologies se."
        history = [
            FakeItem("assistant", estimate, interrupted=True),
        ]
        transcript = main._build_transcript(history, [full], caller_gender="male")
        self.assertEqual(transcript[0]["text"], full)

    def test_non_interrupted_turn_is_left_alone(self):
        # A turn that completed normally already has the true full text —
        # must not be touched even though a captured entry also exists.
        text = "Aapne website ke liye enquiry ki thi."
        history = [FakeItem("assistant", text, interrupted=False)]
        transcript = main._build_transcript(history, ["some other captured text"], caller_gender="male")
        self.assertEqual(transcript[0]["text"], text)

    def test_interrupted_but_estimate_not_actually_shorter_is_left_alone(self):
        # Guard against ever REPLACING a text that's already complete or
        # longer — only ever fill in a gap, never overwrite good data.
        text = "This estimate happens to already be the full sentence."
        history = [FakeItem("assistant", text, interrupted=True)]
        transcript = main._build_transcript(history, ["short"], caller_gender="male")
        self.assertEqual(transcript[0]["text"], text)

    def test_positional_matching_across_multiple_turns(self):
        history = [
            FakeItem("user", "hello"),
            FakeItem("assistant", "short cut off", interrupted=True),
            FakeItem("user", "haan bolo"),
            FakeItem("assistant", "second reply complete", interrupted=False),
            FakeItem("user", "ok bye"),
            FakeItem("assistant", "third short", interrupted=True),
        ]
        full_texts = [
            "first reply full text, much longer than the cut estimate",
            "second reply complete",
            "third reply full text, much longer than the cut estimate",
        ]
        transcript = main._build_transcript(history, full_texts, caller_gender="male")
        by_role = [t["text"] for t in transcript if t["role"] == "assistant"]
        self.assertEqual(by_role[0], full_texts[0])
        self.assertEqual(by_role[1], "second reply complete")
        self.assertEqual(by_role[2], full_texts[2])

    def test_missing_captured_text_does_not_crash(self):
        # No tts_node capture available (e.g. old data, or the list ran
        # short) — keep the estimate rather than index-erroring.
        history = [FakeItem("assistant", "estimate only", interrupted=True)]
        transcript = main._build_transcript(history, [], caller_gender="male")
        self.assertEqual(transcript[0]["text"], "estimate only")

    def test_empty_text_content_is_skipped(self):
        history = [
            FakeItem("assistant", "", interrupted=True),
            FakeItem("assistant", "real text", interrupted=False),
        ]
        transcript = main._build_transcript(history, ["would never be used"], caller_gender="male")
        self.assertEqual(len(transcript), 1)
        self.assertEqual(transcript[0]["text"], "real text")


class DevanagariHyphenationIsUniform(unittest.TestCase):
    """The actual defect this fix works around, verified against the real
    third-party function rather than assumed."""

    def test_every_devanagari_word_hyphenates_to_one_piece(self):
        from livekit.agents.tokenize import basic

        for word in ["है", "को", "व्यक्ति", "प्रतिनिधित्व", "आवश्यकतानुसार"]:
            self.assertEqual(
                len(basic.hyphenate_word(word)), 1,
                f"{word!r} did not hyphenate to a single piece — "
                "the pacing defect this fix works around may no longer apply",
            )

    def test_latin_words_do_hyphenate_into_multiple_pieces(self):
        from livekit.agents.tokenize import basic

        self.assertGreater(len(basic.hyphenate_word("regarding")), 1)


if __name__ == "__main__":
    unittest.main()
