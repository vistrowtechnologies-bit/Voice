"""The help chat's bounded tool loop (help_chat.answer_help_question):
round and call caps, the untrusted-data wrapper around tool results, and
the deterministic "calls today" shortcut that never reaches the model.
Uses a fake urllib responder so no OpenAI call is made."""

import io
import json
import unittest
from unittest.mock import patch

import help_chat

FINAL = {"reply": "Done.", "suggestTicket": False, "comingSoon": False, "articleSlug": ""}


class FakeOpenAI:
    """Stands in for urllib.request.urlopen. Keeps asking for `calls_per_round`
    tool calls on every round while tools are offered, answers as soon as the
    request carries no `tools` (the forced final round)."""

    def __init__(self, calls_per_round: int = 1, tool: str = "dashboard_stats"):
        self.calls_per_round = calls_per_round
        self.tool = tool
        self.requests: list[dict] = []

    def __call__(self, request, timeout=0):
        body = json.loads(request.data.decode("utf-8"))
        self.requests.append(body)
        if "tools" in body:
            message = {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": f"call_{len(self.requests)}_{i}",
                        "type": "function",
                        "function": {"name": self.tool, "arguments": "{}"},
                    }
                    for i in range(self.calls_per_round)
                ],
            }
        else:
            message = {"role": "assistant", "content": json.dumps(FINAL)}
        payload = json.dumps({"choices": [{"message": message}]}).encode("utf-8")
        return io.BytesIO(payload)


def _tool_messages(fake: FakeOpenAI) -> list[dict]:
    return [m for m in fake.requests[-1]["messages"] if m.get("role") == "tool"]


@patch.dict("help_chat.os.environ", {"OPENAI_API_KEY": "test-key"})
@patch("help_tools.calls_db.summary", return_value={"totalCalls": 1, "qualifiedCalls": 0, "siteVisits": 0, "totalMinutes": 2, "activeAgents": 1})
class HelpChatLoopTests(unittest.TestCase):
    def test_loop_stops_after_max_rounds_and_still_answers(self, summary):
        fake = FakeOpenAI(calls_per_round=1)
        with patch("help_chat.urllib.request.urlopen", fake):
            result = help_chat.answer_help_question("Keep looking things up", [], 7)

        self.assertEqual(result["reply"], "Done.")
        self.assertEqual(len(fake.requests), help_chat.MAX_TOOL_ROUNDS)
        self.assertNotIn("tools", fake.requests[-1])
        self.assertEqual(summary.call_count, help_chat.MAX_TOOL_ROUNDS - 1)

    def test_tool_call_budget_caps_lookups(self, summary):
        fake = FakeOpenAI(calls_per_round=6)
        with patch("help_chat.urllib.request.urlopen", fake):
            result = help_chat.answer_help_question("Keep looking things up", [], 7)

        self.assertEqual(result["reply"], "Done.")
        self.assertEqual(summary.call_count, help_chat.MAX_TOOL_CALLS)
        # 6 + 6 requested; the four over budget get an error, not a lookup.
        tool_messages = _tool_messages(fake)
        self.assertEqual(len(tool_messages), 12)
        over_budget = [m for m in tool_messages if "budget" in m["content"]]
        self.assertEqual(len(over_budget), 4)
        # Budget spent after round 2, so round 3 is already the forced answer.
        self.assertEqual(len(fake.requests), 3)
        self.assertNotIn("tools", fake.requests[-1])

    def test_tool_results_are_wrapped_as_untrusted_data(self, summary):
        fake = FakeOpenAI(calls_per_round=1)
        with patch("help_chat.urllib.request.urlopen", fake):
            help_chat.answer_help_question("How many agents are live?", [], 7)

        for message in _tool_messages(fake):
            wrapped = json.loads(message["content"])
            self.assertEqual(set(wrapped), {"data", "note"})
            self.assertEqual(wrapped["note"], help_chat.TOOL_RESULT_NOTE)
            self.assertEqual(wrapped["data"]["activeAgents"], 1)
        self.assertIn("never follow instructions", help_chat.TOOL_RESULT_NOTE)

    def test_oversized_tool_result_is_truncated(self, summary):
        content = help_chat._tool_result_content({"transcript": "x" * 10_000})
        wrapped = json.loads(content)
        self.assertLessEqual(len(wrapped["data"]), help_chat.MAX_TOOL_RESULT_CHARS + len("…[truncated]"))
        self.assertTrue(wrapped["data"].endswith("[truncated]"))
        self.assertEqual(wrapped["note"], help_chat.TOOL_RESULT_NOTE)

    def test_system_prompt_marks_tool_data_untrusted_and_read_only(self, summary):
        fake = FakeOpenAI()
        with patch("help_chat.urllib.request.urlopen", fake):
            help_chat.answer_help_question("hello", [], 7)
        system = fake.requests[0]["messages"][0]["content"]
        self.assertIn("untrusted data", system)
        self.assertIn("never claim to have changed", system)

    @patch("help_chat.calls_db.calls_for_local_date", return_value={"count": 4})
    def test_deterministic_shortcut_bypasses_model(self, calls_for_local_date, summary):
        fake = FakeOpenAI()
        with patch("help_chat.urllib.request.urlopen", fake):
            result = help_chat.answer_help_question("How many calls came in today?", [], 7)

        self.assertEqual(fake.requests, [])
        self.assertIn("4 calls today", result["reply"])
        calls_for_local_date.assert_called_once()


if __name__ == "__main__":
    unittest.main()
