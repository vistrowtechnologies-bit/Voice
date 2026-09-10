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

import functools
import re

from livekit.agents import tokenize
from livekit.agents.tokenize import token_stream

# Sentence enders plus the clause marks Hindi conversation actually uses.
# The em-dash matters: the agent reaches for it constantly ("समझ गई — तो...").
_CLAUSE = re.compile(r"(?<=[।.!?,;:—])\s*")

# Below this, a fragment waits for the next one. "अरे," alone is two syllables
# and a whole synthesis round trip.
_MIN_CLAUSE_CHARS = 12


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
        return token_stream.BufferedSentenceStream(
            tokenizer=functools.partial(_split_clauses, min_len=self._min,
                                        retain_format=self._retain),
            min_token_len=self._min,
            min_ctx_len=self._min,
        )
