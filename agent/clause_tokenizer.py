"""Decides where the first synthesis call is cut off.

Google's streaming_synthesize does NOT stream out. MEASURED against Chirp 3
HD with real credentials, interleaved, 4 repeats per condition: the first
audio frame lands a near-constant ~165ms after the LAST character is pushed,
whatever the input looks like.

     30 chars  -> first audio  512ms   (150ms after input ended)
     66 chars  -> first audio  856ms   (182ms after input ended)
    102 chars  -> first audio 1192ms   (176ms after input ended)

And it is length, not punctuation. The same 57-character line, once with an
early full stop and once with an em-dash in the same position:

    "अरे, वही तो सोच रही थी। तो कॉल का क्या फायदा, बताइए।"   728ms
    "अरे, वही तो सोच रही थी — तो कॉल का क्या फायदा, बताइए।"  758ms

30ms apart — noise. An earlier reading of the [tts_node] logs said audio
started 140-180ms after the first sentence TERMINATOR; the contrast above
shows that was wrong. It was 140-180ms after the INPUT ENDED, and the turns
that happened to have an early terminator were also the short ones.

So chunking the input differently buys nothing on its own — the call still
ends when the turn ends. What works is ending a CALL early, which is what
google_tts_streaming_patch does: the first token out of this tokenizer is
synthesized as its own request while the rest of the turn is still being
written. This class decides where that single cut lands, and a conversational
Hindi turn gives it commas and em-dashes to work with where it has no full
stop until the very end:

    "समझ गई, manual handle होता है — daily roughly कितनी calls आती हैं?"
    "अरे, वही तो मैं सोच रही थी — तो कॉल का क्या फायदा, बताइए।"

Measured end-to-end against stock google.TTS on those two turns: 855 -> 541ms
and 752 -> 506ms. Turns that already had an early sentence end, and turns with
no internal punctuation at all, came out unchanged (-18ms, +3ms).

The TEXT IS NOT ALTERED — punctuation is retained and passed through, so the
words reaching Google are identical; only the cut point moves.

A minimum length keeps it from cutting after "अरे,", which would spend a whole
synthesis request on two syllables.
"""
from __future__ import annotations

import re

from livekit.agents import tokenize, utils

# Sentence enders plus the clause marks Hindi conversation actually uses.
# The em-dash matters: the agent reaches for it constantly ("समझ गई — तो...").
_CLAUSE = re.compile(r"(?<=[।.!?,;:—])\s*")

# Below this, a fragment waits for the next boundary. Tuned on call 946's own
# turns, replayed at their logged arrival times against live Chirp 3:
#
#                       min 12    min 6
#   "अच्छा, तो बताइए —"    813ms    516ms
#   "अरे वाह, रियल एस्टेट!" 599ms    586ms
#   "समझ गई, मैन्युअल —"  1165ms    582ms
#
# 12 was a guess and it excluded the openers this agent actually uses:
# "अच्छा," is 6 characters, "समझ गई," is 7, so the only boundary in those
# turns was being rejected and they never split at all. 6 lets a two-word
# acknowledgement be its own chunk — which is where a person pauses anyway —
# while still refusing "अरे," at 4.
_MIN_CLAUSE_CHARS = 6


def _split_clauses(text: str, *, min_len: int = _MIN_CLAUSE_CHARS,
                   retain_format: bool = True) -> list[tuple[str, int, int]]:
    """(token, start, end) triples, the shape SentenceTokenizer returns."""
    out: list[tuple[str, int, int]] = []
    start = 0
    for m in _CLAUSE.finditer(text):
        end = m.start()
        if end <= start:
            continue
        chunk = text[start:end]
        if len(chunk.strip()) < min_len and out:
            # Too short to stand alone: fold it into the previous clause
            # rather than paying a synthesis round trip for a fragment.
            ptok, pstart, _ = out[-1]
            out[-1] = (ptok + text[pstart + len(ptok):end], pstart, end)
            start = m.end()
            continue
        if len(chunk.strip()) < min_len:
            continue
        out.append((chunk if retain_format else chunk.strip(), start, end))
        start = m.end()
    if start < len(text):
        tail = text[start:]
        if tail.strip():
            out.append((tail if retain_format else tail.strip(), start, len(text)))
    return out


class ClauseTokenizer(tokenize.SentenceTokenizer):
    """Drop-in SentenceTokenizer that yields clauses."""

    def __init__(self, *, min_clause_len: int = _MIN_CLAUSE_CHARS,
                 retain_format: bool = True) -> None:
        self._min = min_clause_len
        self._retain = retain_format

    def tokenize(self, text: str, *, language: str | None = None) -> list[str]:
        return [t for t, _, _ in _split_clauses(text, min_len=self._min,
                                                retain_format=self._retain)]

    def stream(self, *, language: str | None = None) -> tokenize.SentenceStream:
        return _ClauseStream(min_clause_len=self._min, retain_format=self._retain)


class _ClauseStream(tokenize.SentenceStream):
    """Emits a clause the moment its boundary arrives.

    Not BufferedSentenceStream, which is what livekit's own tokenizers use.
    Its push_text refuses to emit until the tokenizer finds MORE THAN ONE
    token in the buffer — so a completed clause sits there until the text
    that follows it exists. Call 946, turn 3, on the widget:

        +222ms  chunk 1  '\nअरे वाह,'
        +457ms  chunk 2  ' रियल एस्टेट!'      <- clause complete here
        +1413ms chunk 3  ' तो अभी आप लीड्स...'  <- only now does it emit
        +1590ms FIRST AUDIO

        Audio 1,133ms after the clause was ready, because the split could
        not fire until the LLM wrote the NEXT clause.

    The whole point of the split is to act on the first clause without
    waiting for the rest of the turn, so waiting for the rest of the turn to
    release it defeats it exactly.
    """

    def __init__(self, *, min_clause_len: int, retain_format: bool) -> None:
        super().__init__()
        self._min = min_clause_len
        self._retain = retain_format
        self._buf = ""
        self._seg = utils.shortuuid()

    def push_text(self, text: str) -> None:
        self._check_not_closed()
        self._buf += text
        while True:
            cut = self._first_boundary(self._buf)
            if cut is None:
                return
            self._emit(self._buf[:cut])
            self._buf = self._buf[cut:].lstrip()

    def _first_boundary(self, text: str) -> int | None:
        """End offset of the first clause long enough to stand alone."""
        for m in _CLAUSE.finditer(text):
            if len(text[:m.start()].strip()) < self._min:
                # "अरे," is two syllables — not worth a synthesis request of
                # its own. Try the next boundary instead of giving up, or a
                # turn opening with a short filler never splits at all.
                continue
            return m.start()
        return None

    def _emit(self, token: str) -> None:
        token = token if self._retain else token.strip()
        if token.strip():
            self._event_ch.send_nowait(
                tokenize.TokenData(token=token, segment_id=self._seg)
            )

    def flush(self) -> None:
        self._check_not_closed()
        if self._buf.strip():
            self._emit(self._buf)
        self._buf = ""
        self._seg = utils.shortuuid()

    def end_input(self) -> None:
        self.flush()
        self._do_close()

    async def aclose(self) -> None:
        self._buf = ""
        self._do_close()
