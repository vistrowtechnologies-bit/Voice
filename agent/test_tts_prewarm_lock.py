"""Google TTS warm-up: serialized across job processes by a file lock, not
spread out by a random sleep (2026-10-13).

The random 0-20 s stagger left every fresh process cold for up to 30 s; the
lock lets each one warm as soon as the previous one is done, while still
never sending two warm-up requests to Google at once (the 429 storm the
stagger was guarding against).
"""
import ast
import os
import sys
import tempfile
import threading
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")
import main

ROOT = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(ROOT, "main.py"), encoding="utf-8") as handle:
    SOURCE = handle.read()
TREE = ast.parse(SOURCE)


def function_source(name: str) -> str:
    node = next(n for n in ast.walk(TREE) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == name)
    return ast.get_source_segment(SOURCE, node) or ""


class NoRandomStagger(unittest.TestCase):
    def test_warm_up_waits_only_for_the_init_window_then_the_lock(self):
        src = function_source("_run_google_tts_prewarm")
        self.assertIn("time.sleep(_TTS_PREWARM_INITIAL_DELAY_S)", src)
        self.assertNotIn("random.uniform", src)
        self.assertIn("with _tts_prewarm_serialized():", src)
        self.assertNotIn("_TTS_PREWARM_STAGGER_MAX_S", SOURCE)

    def test_init_window_is_still_respected(self):
        # The 2026-09 incident: warming inside LiveKit's 10 s init handshake
        # got processes killed. The delay stays at least that long.
        self.assertGreaterEqual(main._TTS_PREWARM_INITIAL_DELAY_S, 10.0)


class LockSerializesProcesses(unittest.TestCase):
    def test_two_holders_never_overlap_and_the_second_starts_right_after(self):
        path = os.path.join(tempfile.mkdtemp(), "prewarm.lock")
        spans: list[tuple[float, float]] = []
        lock = threading.Lock()

        def hold(seconds: float) -> None:
            with main._tts_prewarm_serialized(path):
                start = time.monotonic()
                time.sleep(seconds)
                with lock:
                    spans.append((start, time.monotonic()))

        threads = [threading.Thread(target=hold, args=(0.3,)) for _ in range(3)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=5)
        spans.sort()
        self.assertEqual(len(spans), 3)
        for (_, end_a), (start_b, _) in zip(spans, spans[1:]):
            self.assertGreaterEqual(start_b, end_a)  # never concurrent
            self.assertLess(start_b - end_a, 0.2)  # and no artificial gap

    def test_lock_is_released_if_the_block_raises(self):
        path = os.path.join(tempfile.mkdtemp(), "prewarm.lock")
        with self.assertRaises(RuntimeError):
            with main._tts_prewarm_serialized(path):
                raise RuntimeError("warm-up failed")
        done = threading.Event()

        def reacquire() -> None:
            with main._tts_prewarm_serialized(path):
                done.set()

        threading.Thread(target=reacquire).start()
        self.assertTrue(done.wait(timeout=2), "lock was not released after the exception")


if __name__ == "__main__":
    unittest.main()
