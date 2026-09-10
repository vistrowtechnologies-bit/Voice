"""8kHz on the phone leg, 24k in the browser.

Both vendors say to synthesize at the line's rate. Sarvam's telephony
reference uses speech_sample_rate=8000; ElevenLabs: "the telephony network is
8kHz mu-law end-to-end, so requesting it directly avoids a transcoding step
in your pipeline and matches what the carrier expects."

Two limits found by measuring rather than reading:

  1. livekit-plugins-google's streaming path accepts only OGG_OPUS and PCM.
     MULAW logs "isn't supported by the streaming_synthesize, fallbacking to
     PCM" and downgrades silently, so ulaw_8000 out of Chirp 3 is not
     available while we stream. 8kHz PCM is, and the mu-law companding that
     remains is a table lookup in the SIP bridge.

  2. TtsFallbackAdapter sets its rate to max(t.sample_rate for t in tts) and
     resamples every provider to it. Setting 8000 on the Google TTS alone
     made audio go 8k -> 22.05k (Sarvam's rate) and then back to 8k at the
     bridge — measured 404ms to first audio with frames at 22050Hz. The
     adapter has to be told too.
"""
import ast
import io
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
for _k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
    os.environ.setdefault(_k, "x")
os.environ.setdefault("SARVAM_API_KEY", "test-key-not-used-offline")
import main

_SRC = io.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "main.py"),
               encoding="utf-8").read()
_BUILD_TTS = next(
    ast.get_source_segment(_SRC, n)
    for n in ast.walk(ast.parse(_SRC))
    if isinstance(n, ast.FunctionDef) and n.name == "_build_tts"
)


class TheRateIsTelephonyOnly(unittest.TestCase):
    def test_it_is_8000(self):
        self.assertEqual(main._TELEPHONY_SAMPLE_RATE, 8000)

    def test_build_tts_takes_is_phone(self):
        self.assertIn("is_phone", ast.unparse(
            next(n for n in ast.walk(ast.parse(_SRC))
                 if isinstance(n, ast.FunctionDef) and n.name == "_build_tts").args))

    def test_the_widget_gets_no_override(self):
        """_rate must be EMPTY off the phone, so the browser keeps wideband."""
        self.assertIn('_rate = {"sample_rate": _TELEPHONY_SAMPLE_RATE} if is_phone else {}',
                      _BUILD_TTS)

    def test_the_call_site_passes_the_channel(self):
        self.assertIn('is_phone=(call_type or "") == "phone"', _SRC)


class EveryPathIsCovered(unittest.TestCase):
    def test_all_google_constructions_get_it(self):
        """Every Google TTS built here must carry the rate.

        Counting **_rate on its own would also match the fallback adapters,
        which is how this assertion first passed while one construction was
        still missing it — check each site, not a total.
        """
        lines = _BUILD_TTS.splitlines()
        missing = []
        for i, line in enumerate(lines):
            if "credentials_info=_GOOGLE_CREDENTIALS," not in line:
                continue
            if not any("**_rate" in l for l in lines[i + 1:i + 3]):
                missing.append(line.strip())
        self.assertEqual(missing, [], f"Google TTS built without the rate: {missing}")

    def test_there_are_the_five_google_paths_we_think(self):
        """A new branch added without the rate should trip this, not slip by."""
        self.assertEqual(_BUILD_TTS.count("credentials_info=_GOOGLE_CREDENTIALS,"), 5)

    def test_the_fallback_adapters_get_it_too(self):
        """The one that actually decides the wire rate."""
        adapters = _BUILD_TTS.count("TtsFallbackAdapter(")
        with_rate = sum(1 for chunk in _BUILD_TTS.split("TtsFallbackAdapter(")[1:]
                        if "_rate" in chunk.split(")")[0] + chunk.split(")")[1][:80])
        self.assertEqual(adapters, with_rate,
                         "an adapter without the rate resamples 8k back up to 22050")


if __name__ == "__main__":
    unittest.main()
