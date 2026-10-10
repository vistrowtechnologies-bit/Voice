"""Gemini 2.5 browser calls get clean input: no ambience, noise suppression on.
3.1, phone calls and the STT/LLM/TTS pipeline keep their behaviour."""
import inspect
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
for _k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
    os.environ.setdefault(_k, "x")
import main
import realtime_config as rc


class Scope(unittest.TestCase):
    def test_only_25_on_a_browser(self):
        self.assertTrue(rc.clean_browser_input(rc.DEFAULT_MODEL, phone=False))
        self.assertFalse(rc.clean_browser_input(rc.DEFAULT_MODEL, phone=True))
        self.assertFalse(rc.clean_browser_input(rc.MODEL_31, phone=False))
        self.assertFalse(rc.clean_browser_input("", phone=False))  # pipeline agents carry no realtime model

    def test_model_id_resolves_like_the_realtime_builder(self):
        src = inspect.getsource(main.RealEstateAgent.__init__)
        self.assertIn('_model_name[len(_GEMINI_LIVE_PREFIX):].lstrip(":-") or _GEMINI_LIVE_DEFAULT_MODEL', src)
        build = inspect.getsource(main._build_realtime_llm)
        self.assertIn('model[len(_GEMINI_LIVE_PREFIX):].lstrip(":-") or _GEMINI_LIVE_DEFAULT_MODEL', build)


class Wiring(unittest.TestCase):
    def setUp(self):
        self.src = inspect.getsource(main.entrypoint)

    def test_noise_suppression_forced_only_when_the_agent_turned_it_off(self):
        block = self.src[self.src.index("_clean_rt_browser = "):]
        block = block[:block.index("Gemini 2.5 browser call: noise suppression on")]
        self.assertIn("if _clean_rt_browser and noise_filter is None:", block)
        self.assertIn("noise_filter = noise_cancellation.BVC()", block)

    def test_ambience_skipped_before_the_clip_is_chosen(self):
        skip = self.src.index("if _clean_rt_browser and _ambient_preset != \"off\":")
        self.assertLess(self.src.index("_clean_rt_browser = "), skip)
        self.assertLess(skip, self.src.index("_ambient_clip = _AMBIENT_CLIPS.get(_ambient_preset)"))


if __name__ == "__main__":
    unittest.main()
