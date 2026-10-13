"""llm_warmer only pings agents whose model _build_llm sends to OpenAI.
A sarvam/* model posted to api.openai.com fails every ping (token audit
2026-10-12, §1 row 7). No DB or network: both are faked."""
import unittest
from unittest.mock import patch

import llm_warmer


class _FakeConn:
    def __init__(self, rows):
        self._rows = rows

    def execute(self, *_args, **_kwargs):
        return self

    def fetchall(self):
        return self._rows

    def close(self):
        pass


def _row(agent_id, model):
    return {"id": agent_id, "system_prompt": "You are an agent.", "model": model}


class RecentlyActiveOpenAIAgentsTest(unittest.TestCase):
    def test_only_openai_models_are_warmed(self):
        rows = [
            _row(1, "gpt-4.1-mini"),
            _row(2, "gpt-4o-mini"),
            _row(3, "sarvam/sarvam-105b-conversations"),
            _row(4, "gemini-live:gemini-3.8-live"),
            _row(5, "gemini-3-flash"),
            _row(6, "groq/llama-3.3-70b-versatile"),
        ]
        with patch.object(llm_warmer.calls_db, "_connect", return_value=_FakeConn(rows)):
            agents = llm_warmer._recently_active_openai_agents()
        self.assertEqual([a["id"] for a in agents], [1, 2])

    def test_sarvam_agent_never_reaches_openai(self):
        rows = [_row(3, "sarvam/sarvam-105b-conversations")]
        with patch.object(llm_warmer.calls_db, "_connect", return_value=_FakeConn(rows)), \
                patch.object(llm_warmer.urllib.request, "urlopen") as urlopen:
            for agent in llm_warmer._recently_active_openai_agents():
                llm_warmer._ping(agent["id"], agent["system_prompt"], agent["model"], "test-key")
        urlopen.assert_not_called()


if __name__ == "__main__":
    unittest.main()
