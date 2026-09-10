# TTS time-to-first-audio — measured, 2026-09-10

All numbers from this machine against the live APIs, conditions interleaved
within each repeat, median of 4. Voices are the ones live agents actually use
(from the `agents` table), not representative stand-ins:

| voice string | resolves to | used by |
|---|---|---|
| `google:chirp3:Callirrhoe` | `hi-IN-Chirp3-HD-Callirrhoe` | agent 4 — the widget / platform demo |
| `pooja` | Sarvam `bulbul:v3` | agents 6-9 — tenant default |
| `google31:kore` | Kore on Gemini 3.1 TTS | agents 19-22 — industry demos |

Text is fed 3 characters every 25ms, matching our measured LLM output rate.

## The mechanism

Neither provider streams audio out of an open request. First audio lands a
near-constant ~165ms after the LAST character is pushed:

| input | first audio | after input ended |
|---|---|---|
| 30 chars | 512ms | 150ms |
| 66 chars | 856ms | 182ms |
| 102 chars | 1192ms | 176ms |

It is length, not punctuation. Same 57-character line, once with an early
full stop and once with an em-dash in the same position: 728ms vs 758ms.

So the only lever is **ending a request early**. That is what shipped for the
Google path (commit `0c4db60`).

## Where we are

| | dash-heavy 66ch | dash-heavy 57ch | early stop 47ch | no punctuation 44ch |
|---|---|---|---|---|
| chirp3 before | 848ms | 765ms | 431ms | 650ms |
| **chirp3 now** | **515ms** | **496ms** | 437ms | 672ms |
| sarvam today | 793ms | 706ms | 395ms | 619ms |
| sarvam *if split* | *475ms* | *496ms* | *365ms* | *600ms* |
| gemini31 kore | 1601ms | 1570ms | 1422ms | — |

## Who wins

Chirp 3 and Sarvam are **equivalent**. Before the fix they were 848 vs 793 and
765 vs 706 — Sarvam ahead by ~50ms, which is inside the run-to-run spread.
After it, Chirp 3 sits at 515/496 and a split Sarvam would sit at 475/496.
There is no meaningful winner between them, and this is measured from a
laptop, not from the ap-south worker, so even the ~50ms may not survive the
move. An earlier claim that Chirp 3 beat Sarvam 331 vs 392ms does not hold up
either — that comparison was the same size as the noise.

**`google31:kore` is the real outlier: 1.4-1.6s, three times either of the
others**, and it returned HTTP 429 "Resource exhausted" repeatedly during this
run. Four industry demo agents (19-22) are on it.

## Sarvam: the win is real, the obvious implementation is not

Sarvam's server synthesizes only on `{"type": "flush"}`, which the plugin
sends once, after the whole turn. Flushing at the first clause instead gives
the same ~320ms as the Google fix (793 -> 475ms, measured).

It is not shipped, because the plugin drops the audio. `SynthesizeStream`
warns that "handling multiple segments in a single instance is deprecated",
and it means it — with an early flush the second segment produces **no audio
at all**:

```
before   total 4.78s   segments: fbeba5bc=4.78s
after    total 2.90s   segments: 630b489d=2.90s
```

One segment, 2.90s of a 4.78s reply. A caller would hear the sentence cut off
mid-way. Not a bench artifact — reproduced writing wavs, and the segment
accounting shows the second segment never arrives.

The supported route is what the warning says: a separate `SynthesizeStream`
per segment. Prototyped with two streams and it measures the same
(501/473/401), but the second stream's audio then has to be held back until
the first drains or the two interleave into garble, so it needs sequencing
built in `tts_node` rather than in the plugin. That is the next piece of work
on this path.

Also ruled out for Sarvam: `min_buffer_size` 50 -> 30 (+55ms, +3ms — the
server does not synthesize on buffer fill, only on flush).

## Cost of the shipped fix

The seam adds ~100-200ms of audio where the second request leads in
(4.36 -> 4.46s on the 66-char line). Barge-in re-verified live at five cancel
points including the seam; all surface as `CancelledError`.
