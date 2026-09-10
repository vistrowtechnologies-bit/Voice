"""Feed TTS at clause boundaries, not only at sentence ends.

MEASURED on the widget (worker log, [tts_node] instrumentation):

    turn D  chunk2 ' रियल एस्टेट!' at +435ms  -> FIRST AUDIO +614ms   (179ms)
    turn F  no terminator, input ended +886ms -> FIRST AUDIO +1027ms  (141ms)
    turn C  no terminator, input ended +1318ms -> FIRST AUDIO +1456ms (138ms)

Audio always starts ~140-180ms after the first SENTENCE terminator. Where the
reply has no early terminator the tokenizer holds everything until generation
finishes, which is why it looked like "TTS waits for the LLM" — for these
replies the first full stop IS the end of the reply:

    'अरे, वही तो मैं सोच रही थी — तो कॉल का क्या फायदा,'
    'समझ गई, manual handle होता है —'

Commas and em-dashes throughout, one "।" at the very end. A conversational
Hindi agent writes like this constantly, so waiting for "।" waits for the whole
turn.

This splits on clause punctuation as well, so the first clause reaches the
synthesizer as soon as it is complete. The TEXT IS NOT ALTERED — punctuation is
retained and passed through, so prosody is unchanged; only the chunk boundaries
move. Rewriting dashes into full stops would have changed how the line sounds.

A minimum length keeps it from emitting "अरे," on its own, which would be a
separate synthesis request for two syllables and sound clipped.
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
