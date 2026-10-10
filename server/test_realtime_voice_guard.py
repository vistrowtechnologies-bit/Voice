"""A realtime (Gemini Live) agent must use a voice Gemini Live can speak;
the runtime otherwise silently swaps it for Kore."""
import ast
import os
import types
import unittest

from fastapi import HTTPException

import voice_catalog

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
with open(os.path.join(HERE, "token_api.py"), encoding="utf-8") as handle:
    SOURCE = handle.read()
TREE = ast.parse(SOURCE)


def node(name, tree=TREE):
    return next(n for n in ast.walk(tree)
                if isinstance(n, (ast.FunctionDef, ast.Assign)) and
                (getattr(n, "name", None) == name or any(getattr(t, "id", None) == name for t in getattr(n, "targets", []))))


def voices_in(tree) -> set:
    value = node("_GEMINI_LIVE_VOICES", tree).value
    if isinstance(value, ast.Call):  # frozenset({...})
        value = value.args[0]
    return set(ast.literal_eval(value))


def guard_with(saved=None, owner=7):
    ns = {"HTTPException": HTTPException, "voice_catalog": voice_catalog,
          "_GEMINI_LIVE_VOICES": frozenset(voices_in(TREE)),
          "calls_db": types.SimpleNamespace(get_agent_by_id_unscoped=lambda _id: saved,
                                            agent_account_id=lambda _id: owner)}
    for name in ("_realtime_voice_usable", "_guard_realtime_voice"):
        exec(ast.get_source_segment(SOURCE, node(name)), ns)
    return ns["_guard_realtime_voice"]


class RealtimeVoiceGuard(unittest.TestCase):
    def test_list_matches_the_runtime(self):
        with open(os.path.join(ROOT, "agent", "main.py"), encoding="utf-8") as handle:
            agent_tree = ast.parse(handle.read())
        self.assertEqual(voices_in(TREE), voices_in(agent_tree))

    def test_realtime_with_a_gemini_voice_is_allowed(self):
        guard = guard_with()
        guard({"model": "gemini-live", "voice": "google:chirp3:Aoede"}, 7)
        guard({"model": "gemini-live:gemini-3.1-flash-live-preview", "voice": "google:chirp3:Achernar"}, 7)

    def test_realtime_with_a_pipeline_voice_is_refused(self):
        with self.assertRaises(HTTPException) as caught:
            guard_with()({"model": "gemini-live", "voice": "shubh"}, 7)
        self.assertEqual(caught.exception.status_code, 400)

    def test_switching_saved_agent_to_realtime_checks_its_saved_voice(self):
        guard = guard_with(saved={"model": "sarvam/x", "voice": "shubh"})
        with self.assertRaises(HTTPException):
            guard({"model": "gemini-live"}, 7, agent_id=5)

    def test_pipeline_model_is_unaffected(self):
        guard_with()({"model": "gpt-4.1-mini", "voice": "shubh"}, 7)

    def test_unrelated_edit_to_a_mismatched_agent_is_not_blocked(self):
        guard_with(saved={"model": "gemini-live", "voice": "shubh"})({"name": "Renamed"}, 7, agent_id=5)

    def test_another_workspaces_agent_is_not_read(self):
        guard = guard_with(saved={"model": "gemini-live", "voice": "google:chirp3:Kore"}, owner=99)
        guard({"voice": "shubh"}, 7, agent_id=5)  # saved model ignored: not this account's agent

    def test_both_routes_run_the_guard(self):
        for route in ("create_agent", "update_agent"):
            self.assertIn("_guard_realtime_voice(", ast.get_source_segment(SOURCE, node(route)))


if __name__ == "__main__":
    unittest.main()
