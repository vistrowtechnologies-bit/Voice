"""A caller correcting a captured fact must beat the captured fact.

Widget call 954. The caller gave a business, then corrected it twice:

    Customer: एक्चुअली मेरे कंपनी का नाम Vistro Technologies है।
    Agent:    अच्छा, Vistro Technologies — noted. तो dental clinic के लिए...
    Customer: मैंने कहा मेरी कंपनी का नाम Vistro Technologies है। यह IT कंपनी है।
    Agent:    ठीक है, Vistro Technologies — समझ गई। तो आपके dental clinic में...
    Customer: ये क्या है बोल बड़बड़ कर रही है क्या?

Four replies built on "dental clinic" after it had been corrected. The facts
reminder asserts captured facts with "NEVER ask for any of this again" and had
no path for a correction — it only ever accumulated, and it is the LAST system
message before generation, so it carried the highest attention in the context.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
for _k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
    os.environ.setdefault(_k, "x")
os.environ.setdefault("SARVAM_API_KEY", "test-key-not-used-offline")
import main


class TheReminderAllowsCorrection(unittest.TestCase):
    def setUp(self):
        self.block = main._facts_reminder({"use_case": "dental clinic", "name": "Pranav"})

    def test_the_captured_fact_is_still_there(self):
        self.assertIn("dental clinic", self.block)

    def test_a_contradiction_is_explicitly_the_callers_to_win(self):
        self.assertIn("THE CALLER IS RIGHT AND THIS LIST IS WRONG", self.block)

    def test_it_says_to_record_the_new_value_in_the_same_turn(self):
        self.assertIn("NEW value in the same turn", self.block)

    def test_it_forbids_reusing_the_old_value(self):
        """The exact failure: four questions built on the corrected fact."""
        self.assertIn("never ask a question built on it", self.block.lower())

    def test_the_never_ask_again_rule_survives(self):
        """It exists for the repeated-question bug; correction must not undo it."""
        self.assertIn("NEVER ask for any of this again", self.block)

    def test_nothing_is_added_when_there_are_no_facts(self):
        self.assertEqual(main._facts_reminder({}), "")

    def test_unconfirmed_facts_are_still_kept_separate(self):
        block = main._facts_reminder({"use_case": "dental clinic"},
                                     {"use_case": "unconfirmed"})
        self.assertIn("NOT confirmed", block)
        self.assertNotIn("NEVER ask for any of this again", block)


class InvalidatingOnCorrectionAloneDoesNotBreakPreemption(unittest.TestCase):
    """The fix above (record a correction, force a refresh) shipped as
    "invalidate whenever the whole per-turn directive text differs from last
    turn's". That is nearly every turn in a real call: _facts_reminder_text
    and _objective_text change as soon as ANY new fact is captured or the
    funnel stage advances, not just on a correction.

    Phone call this session: `preemptive generation invalidated` fired on 5
    of 6 turns, one turn cost 8.15s end to end, and the caller hung up. The
    09-10 test that verified 6/6 kept used scripted turns whose facts never
    changed between them, so it never exercised the common case of a real,
    moving conversation — only the corrected-value case it was built for.

    Fixed by tracking whether a CAPTURED VALUE actually changed (a
    correction) separately from the directive text as a whole. A new fact
    (previously empty, now filled) is routine progress and must be kept; a
    changed value (previously "dental clinic", now "IT company") is exactly
    the call-954 risk and must still be thrown away.
    """

    BASE = {"id": 26, "account_id": 2, "name": "Artha", "model": "gpt-4.1-mini",
            "voice": "pooja", "language": "hi-IN", "tone": "balanced",
            "system_prompt": "You are Artha from Vistrow.",
            "enabled_functions": "log_lead,end_call"}

    async def _run_turns(self, turns_with_lead_data):
        import types

        from livekit.agents import llm

        agent = main.RealEstateAgent(dict(self.BASE), direction="outbound", call_type="phone")
        stub = types.SimpleNamespace(userdata={"latency_metrics": {}, "lead_data": {}},
                                     agent_state="listening")
        type(agent).session = property(lambda self, _s=stub: _s)

        ctx = llm.ChatContext.empty()
        kept = []
        for text, lead_data_after in turns_with_lead_data:
            stub.userdata["lead_data"] = lead_data_after
            temp = ctx.copy()
            pre = ctx.copy()
            msg = llm.ChatMessage(role="user", content=[text])
            try:
                await agent.on_user_turn_completed(temp, new_message=msg)
            except main.StopResponse:
                kept.append(None)
                continue
            kept.append(pre.is_equivalent(temp))
            ctx.items.append(msg)
            ctx.add_message(role="assistant", content="ठीक है।")
        return kept

    def test_new_facts_every_turn_never_force_a_refresh(self):
        import asyncio

        turns = [
            ("Dental Clinic है मेरा।", {"use_case": "dental clinic"}),
            ("रोज़ 20 calls आती हैं।",
             {"use_case": "dental clinic", "team_size": "1 receptionist"}),
            ("Whitefield में हूँ।",
             {"use_case": "dental clinic", "team_size": "1 receptionist",
              "location": "Whitefield"}),
            ("इसी महीने चाहिए।",
             {"use_case": "dental clinic", "team_size": "1 receptionist",
              "location": "Whitefield", "timeline": "this month"}),
        ]
        kept = asyncio.run(self._run_turns(turns))
        self.assertTrue(all(kept), f"a routine new fact forced invalidation: {kept}")

    def test_a_correction_still_forces_a_refresh_and_only_that_turn(self):
        import asyncio

        turns = [
            ("Dental Clinic है मेरा।", {"use_case": "dental clinic"}),
            ("एक्चुअली मेरा नाम Vistro Technologies है, IT कंपनी।",
             {"use_case": "IT company"}),  # corrects the value above
            ("हाँ ठीक है।", {"use_case": "IT company"}),  # unchanged after
        ]
        kept = asyncio.run(self._run_turns(turns))
        self.assertEqual(kept, [True, False, True],
                         "must keep the new-fact turn, throw away only the "
                         "correction, and keep the turn after it")


if __name__ == "__main__":
    unittest.main()
