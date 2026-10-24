"""Standard lead facts reach the calls row and ArthaLeads (16 Oct 2026).

Call 1392 (Siya, Shapoorji Pallonji Khopoli plots): the caller said future
self-use, "2000 स्क्वायर से" and "एक करोड़"; only `configuration` was saved
and sent, so ArthaLeads showed Budget "Not captured". Budget numbers come from
the deterministic parser only, never from the model. No network: the LLM is
mocked.
"""
import asyncio
import json
import os
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")
os.environ.setdefault("SARVAM_API_KEY", "test-key-not-used-offline")

import lead_facts
import main
import tools

CRORE, LAKH = 10_000_000, 100_000

# The caller lines are call 1392's; the agent lines are abridged.
CALL_1392 = [
    {"role": "assistant", "text": "नमस्ते, मैं सिया, Shapoorji Pallonji Khopoli के luxury plots के बारे में।"},
    {"role": "user", "text": "हाँ बताइए।"},
    {"role": "assistant", "text": "आप plot self-use के लिए देख रहे हैं या investment के लिए?"},
    {"role": "user", "text": "फ्यूचर में यूज करें।"},
    {"role": "assistant", "text": "कितने size का plot चाहिए?"},
    {"role": "user", "text": "2000 स्क्वायर से।"},
    {"role": "assistant", "text": "और budget कितना सोचा है?"},
    {"role": "user", "text": "एक करोड़।"},
    {"role": "assistant", "text": "ठीक है, मैं आपको brochure WhatsApp पर भेज दूँगी।"},
    {"role": "user", "text": "जी क्या कहूँ?"},
]
# What a correct post-call read of that transcript returns (model mocked).
MODEL_1392 = {
    "budget_text": "एक करोड़", "purpose": "Buy", "property_type": "Plot", "bhk": "",
    "configuration": "2000 sq ft and above", "preferred_location": "", "timeline": "",
    "brochure_requested": False,
    "summary": "Caller wants a plot of 2000 sq ft and above for future own use, budget about 1 crore.",
    "key_points": ["Future self-use", "Plot 2000 sq ft and above", "Budget around 1 crore"],
}


def _fake_openai(payload: dict):
    create = AsyncMock(return_value=SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(payload, ensure_ascii=False)))]
    ))
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    return create, (lambda **_: client)


class BudgetWordsToRupees(unittest.TestCase):
    CASES = {
        # Hindi
        "एक करोड़": (CRORE, CRORE),
        "80 लाख": (80 * LAKH, 80 * LAKH),
        "अस्सी लाख": (80 * LAKH, 80 * LAKH),
        "डेढ़ करोड़": (15 * 10**6, 15 * 10**6),
        "ढाई करोड़": (25 * 10**6, 25 * 10**6),
        "साढ़े तीन करोड़": (35 * 10**6, 35 * 10**6),
        "अस्सी लाख से एक करोड़ तक": (80 * LAKH, CRORE),
        # Hinglish
        "dedh crore": (15 * 10**6, 15 * 10**6),
        "do crore": (2 * CRORE, 2 * CRORE),
        "50 se 60 lakh": (50 * LAKH, 60 * LAKH),
        "75L": (75 * LAKH, 75 * LAKH),
        # English
        "around 1 crore": (CRORE, CRORE),
        "80 lakh to 1 crore": (80 * LAKH, CRORE),
        "1-1.5 cr": (CRORE, 15 * 10**6),
        "one and a half crore": (15 * 10**6, 15 * 10**6),
        "between 50 and 60 lakhs": (50 * LAKH, 60 * LAKH),
        "1 crore 20 lakh": (12 * 10**6, 12 * 10**6),
        "₹1,00,00,000": (CRORE, CRORE),
        # Speech-recognition spellings (live call 1394: "बजट असी लाख").
        "बजट असी लाख": (80 * LAKH, 80 * LAKH),
        "अस्सि लाख": (80 * LAKH, 80 * LAKH),
        "asi lakh": (80 * LAKH, 80 * LAKH),
        "सतर लाख": (70 * LAKH, 70 * LAKH),
        "नबे लाख": (90 * LAKH, 90 * LAKH),
    }

    def test_known_phrasings(self):
        for text, expected in self.CASES.items():
            self.assertEqual(lead_facts.parse_inr_budget(text), expected, text)

    def test_nothing_is_invented_from_an_unclear_amount(self):
        for text in ("", "80", "जी क्या कहूँ?", "2000 स्क्वायर से", "flexible", "not decided"):
            self.assertEqual(lead_facts.parse_inr_budget(text), (None, None), text)

    def test_nukta_and_chandrabindu_spellings_match(self):
        # करोड़ precomposed (U+095C) vs ड + nukta; पाँच vs पांच.
        self.assertEqual(lead_facts.parse_inr_budget("एक करोड़"), (CRORE, CRORE))
        self.assertEqual(lead_facts.parse_inr_budget("पाँच करोड़"), (5 * CRORE, 5 * CRORE))


class MidCallValuesInTheStandardShape(unittest.TestCase):
    def test_purpose_words(self):
        self.assertEqual(lead_facts.normalise_purpose("investment ke liye"), "Invest")
        self.assertEqual(lead_facts.normalise_purpose("khud rehne ke liye"), "Buy")
        self.assertEqual(lead_facts.normalise_purpose("self-use"), "Buy")
        self.assertIsNone(lead_facts.normalise_purpose("abhi soch rahe hain"))

    def test_log_lead_values(self):
        out = lead_facts.mid_call_facts({
            "budget": "around 1 crore", "location": "Khopoli", "timeline": "next year",
            "property_type": "plot", "configuration": "3 BHK", "purpose": "self-use",
            "name": "not a fact key",
        })
        self.assertEqual(out, {
            "budget_text": "around 1 crore", "budget_min": CRORE, "budget_max": CRORE,
            "preferred_location": "Khopoli", "timeline": "next year", "property_type": "Plot",
            "configuration": "3 BHK", "bhk": "3BHK", "purpose": "Buy",
        })

    def test_unrecognised_text_is_kept_as_said(self):
        out = lead_facts.mid_call_facts({"purpose": "abhi soch rahe", "property_type": "farmhouse"})
        self.assertEqual(out, {"purpose": "abhi soch rahe", "property_type": "farmhouse"})


class TimelineIsNotACallbackTime(unittest.TestCase):
    def test_prompt_tells_the_model_a_callback_time_is_not_a_timeline(self):
        # Live call 1399 saved timeline "today 1 pm" (the callback slot).
        self.assertIn("Never a callback, meeting or site-visit time", lead_facts.SYSTEM_PROMPT)


class Merge(unittest.TestCase):
    def test_post_call_wins_and_mid_call_fills_gaps(self):
        merged = lead_facts.merge_facts(
            {"configuration": "2000 sq. ft. and above", "timeline": "next year"},
            {"configuration": "2000 sq ft and above", "timeline": None, "purpose": "Buy"},
        )
        self.assertEqual(merged, {"configuration": "2000 sq ft and above", "timeline": "next year",
                                  "purpose": "Buy"})

    def test_call_1394_caller_budget_beats_a_remembered_one(self):
        # Siya's log_lead held "around 1 crore" (remembered from an earlier
        # call); the caller said 80 lakh, transcribed "असी लाख".
        mid = lead_facts.mid_call_facts({"budget": "around 1 crore", "property_type": "plot"})
        post, _ = lead_facts.facts_from_response({"budget_text": "असी लाख", "purpose": "Invest"})
        merged = lead_facts.merge_facts(mid, post)
        self.assertEqual((merged["budget_min"], merged["budget_max"]), (80 * LAKH, 80 * LAKH))
        self.assertEqual(merged["budget_text"], "असी लाख")

    def test_unreadable_caller_budget_drops_the_mid_call_numbers(self):
        mid = lead_facts.mid_call_facts({"budget": "around 1 crore"})
        post, _ = lead_facts.facts_from_response({"budget_text": "jitna sahi lage"})
        merged = lead_facts.merge_facts(mid, post)
        self.assertEqual(merged["budget_text"], "jitna sahi lage")
        self.assertNotIn("budget_min", merged)
        self.assertNotIn("budget_max", merged)

    def test_call_1396_agent_location_is_dropped_when_the_caller_named_none(self):
        mid = lead_facts.mid_call_facts({"location": "Khopoli", "property_type": "plot"})
        post, _ = lead_facts.facts_from_response({"budget_text": "अराउंड 80 लाख", "purpose": "Invest"})
        merged = lead_facts.merge_facts(mid, post)
        self.assertNotIn("preferred_location", merged)
        self.assertEqual(merged["budget_min"], 80 * LAKH)

    def test_mid_call_location_stands_when_the_post_call_read_did_not_run(self):
        mid = lead_facts.mid_call_facts({"location": "Panvel"})
        self.assertEqual(lead_facts.merge_facts(mid, {})["preferred_location"], "Panvel")

    def test_call_1438_purpose_saved_as_timeline_is_dropped(self):
        mid = lead_facts.mid_call_facts({"timeline": "future self-use", "purpose": "self-use"})
        post, _ = lead_facts.facts_from_response({"purpose": "Buy", "property_type": "Plot", "configuration": "60x40"})
        merged = lead_facts.merge_facts(mid, post)
        self.assertNotIn("timeline", merged)
        self.assertEqual(merged["purpose"], "Buy")

    def test_purpose_only_timeline_becomes_the_purpose(self):
        self.assertEqual(lead_facts.mid_call_facts({"timeline": "investment"}), {"purpose": "Invest"})

    def test_a_timeline_with_a_time_word_stays_a_timeline(self):
        for t in ("buy next year", "within 3 months", "अगले साल खुद के लिए"):
            with self.subTest(t=t):
                self.assertEqual(lead_facts.mid_call_facts({"timeline": t}).get("timeline"), t)

    def test_caller_stated_timeline_is_kept(self):
        mid = lead_facts.mid_call_facts({"timeline": "soon"})
        merged = lead_facts.merge_facts(mid, {"timeline": "within 3 months"})
        self.assertEqual(merged["timeline"], "within 3 months")

    def test_mid_call_timeline_stands_when_the_post_call_read_did_not_run(self):
        mid = lead_facts.mid_call_facts({"timeline": "next month"})
        self.assertEqual(lead_facts.merge_facts(mid, {})["timeline"], "next month")

    def test_caller_named_location_is_kept(self):
        mid = lead_facts.mid_call_facts({"location": "Khopoli"})
        merged = lead_facts.merge_facts(mid, {"preferred_location": "Panvel or Karjat"})
        self.assertEqual(merged["preferred_location"], "Panvel or Karjat")

    def test_mid_call_budget_stands_when_the_caller_said_none_after_the_call(self):
        mid = lead_facts.mid_call_facts({"budget": "around 1 crore"})
        merged = lead_facts.merge_facts(mid, {"purpose": "Buy"})
        self.assertEqual(merged["budget_min"], CRORE)

    def test_post_call_no_overrides_a_misheard_brochure_request(self):
        merged = lead_facts.merge_facts({"brochure_requested": True, "brochure_project": "Khopoli"},
                                        {"brochure_requested": False})
        self.assertNotIn("brochure_requested", merged)
        self.assertNotIn("brochure_project", merged)

    def test_mid_call_brochure_stands_when_post_call_said_nothing(self):
        merged = lead_facts.merge_facts(lead_facts.mid_call_facts({"brochure_requested": True}), {})
        self.assertIs(merged["brochure_requested"], True)


class PostCallPass(unittest.TestCase):
    def run_pass(self, payload, transcript=CALL_1392):
        create, factory = _fake_openai(payload)
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test"}), patch("openai.AsyncOpenAI", factory):
            result = asyncio.run(lead_facts.extract_lead_facts(transcript))
        return result, create

    def test_call_1392(self):
        (facts, notes), create = self.run_pass(MODEL_1392)
        self.assertEqual(facts, {
            "budget_text": "एक करोड़", "budget_min": CRORE, "budget_max": CRORE,
            "purpose": "Buy", "property_type": "Plot", "configuration": "2000 sq ft and above",
            "brochure_requested": False,
        })
        self.assertEqual(notes["key_points"], MODEL_1392["key_points"])
        self.assertTrue(notes["summary"])
        kwargs = create.call_args.kwargs
        self.assertEqual(kwargs["model"], "gpt-5.4-mini")
        self.assertEqual(kwargs["response_format"]["type"], "json_schema")
        self.assertTrue(kwargs["response_format"]["json_schema"]["strict"])
        convo = kwargs["messages"][1]["content"]
        self.assertIn("CALLER: एक करोड़।", convo)
        self.assertIn("AGENT: ", convo)

    def test_model_numbers_are_ignored_and_bad_enums_dropped(self):
        (facts, _), _ = self.run_pass(dict(MODEL_1392, budget_text="flexible", budget_min=5,
                                           purpose="Rent", property_type="Bungalow"))
        self.assertNotIn("budget_min", facts)
        self.assertEqual(facts["budget_text"], "flexible")
        self.assertNotIn("purpose", facts)
        self.assertNotIn("property_type", facts)

    def test_schema_is_strict_and_matches_arthaleads_vocabulary(self):
        schema = lead_facts.RESPONSE_FORMAT["json_schema"]["schema"]
        self.assertFalse(schema["additionalProperties"])
        self.assertEqual(set(schema["required"]), set(schema["properties"]))
        # ArthaLeads backend/constants/leadOptions.js (N/A and Rent excluded).
        self.assertEqual(set(schema["properties"]["purpose"]["enum"]), {"Buy", "Invest", ""})
        self.assertEqual(set(schema["properties"]["property_type"]["enum"]),
                         {"Apartment", "Villa", "Plot", "Commercial", "Office", "Penthouse", "Other", ""})
        self.assertEqual(set(schema["properties"]["bhk"]["enum"]),
                         {"1BHK", "2BHK", "3BHK", "4BHK", "5BHK+", "Studio", ""})
        self.assertNotIn("budget_min", schema["properties"], "numbers come from the parser, not the model")

    def test_no_call_when_the_caller_never_spoke(self):
        result, create = self.run_pass(MODEL_1392, transcript=[{"role": "assistant", "text": "Hello?"}])
        self.assertEqual(result, ({}, {}))
        create.assert_not_called()

    def test_failure_is_empty_not_raised(self):
        def boom(**_):
            raise RuntimeError("provider down")
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test"}), patch("openai.AsyncOpenAI", boom):
            self.assertEqual(asyncio.run(lead_facts.extract_lead_facts(CALL_1392)), ({}, {}))


class StoredAndSentTheSame(unittest.TestCase):
    """main._call_extracted_data is what both the calls row and the CRM get."""

    def extracted_1392(self):
        facts, _ = lead_facts.facts_from_response(MODEL_1392)
        # Siya's one mid-call log_lead on call 1392.
        return main._call_extracted_data({"configuration": "2000 sq. ft. and above"}, facts)

    def test_call_1392_extracted_data(self):
        self.assertEqual(self.extracted_1392(), {
            "configuration": "2000 sq ft and above", "budget_text": "एक करोड़",
            "budget_min": CRORE, "budget_max": CRORE, "purpose": "Buy", "property_type": "Plot",
        })

    def test_call_1392_arthaleads_body(self):
        lead = {"type": "call_completed", "name": "Vistrow Test", "phone": "+919812345678",
                "transcript": CALL_1392, "direction": "outbound", "call_id": 1392,
                "extracted_data": self.extracted_1392(),
                "summary": MODEL_1392["summary"], "key_points": MODEL_1392["key_points"]}
        _, body = tools._integration_body("arthaleads", {"token": "t"}, lead)
        self.assertEqual(body["extracted_data"]["budget_min"], CRORE)
        self.assertEqual(body["extracted_data"]["budget_max"], CRORE)
        self.assertEqual(body["extracted_data"]["purpose"], "Buy")
        self.assertEqual(body["extracted_data"]["property_type"], "Plot")
        self.assertEqual(body["summary"], MODEL_1392["summary"])
        self.assertEqual(body["key_points"], MODEL_1392["key_points"])
        self.assertNotIn("brochure_requested", body["crm_outcome"])

    def test_brochure_request_reaches_crm_outcome(self):
        lead = {"type": "call_completed", "name": "A", "phone": "+919812345678", "transcript": CALL_1392,
                "extracted_data": {"brochure_requested": True}}
        _, body = tools._integration_body("arthaleads", {"token": "t"}, lead)
        self.assertIs(body["crm_outcome"]["brochure_requested"], True)

    def test_no_summary_keys_when_there_is_no_summary(self):
        lead = {"type": "call_completed", "name": "A", "phone": "+919812345678", "transcript": CALL_1392}
        _, body = tools._integration_body("arthaleads", {"token": "t"}, lead)
        self.assertNotIn("summary", body)
        self.assertNotIn("key_points", body)

    def test_key_points_follow_the_owners_details_choice(self):
        lead = {"type": "call_completed", "name": "A", "summary": "s", "key_points": ["k"],
                "extracted_data": {"budget_min": CRORE}}
        out = tools._apply_field_choice("webhook", {"fields": ["name"]}, lead)
        self.assertEqual(set(out), {"type", "name"})

    def test_log_call_runs_the_standard_pass_and_passes_the_notes(self):
        import inspect
        src = inspect.getsource(main)
        self.assertIn("lead_facts.extract_lead_facts(transcript)", src)
        self.assertIn('"summary": call_notes.get("summary")', src)
        self.assertEqual(src.count("_call_extracted_data(lead_data, extracted)"), 3)


class SendBrochure(unittest.TestCase):
    def test_it_records_the_request_and_promises_only_a_team_follow_up(self):
        lead_data = {}
        ctx = SimpleNamespace(userdata={"lead_data": lead_data})
        reply = asyncio.run(tools.send_brochure.__wrapped__(ctx, project="Khopoli"))
        self.assertEqual(lead_data, {"brochure_requested": True, "brochure_project": "Khopoli"})
        self.assertIn("our team will share the brochure with them on WhatsApp shortly", reply)
        self.assertIn("Never say it is being sent now", reply)
        self.assertEqual(lead_facts.mid_call_facts(lead_data)["brochure_requested"], True)

    def test_registered_for_tenant_agents_not_roleplay_demos(self):
        base = {"id": 17, "account_id": 1, "name": "Siya", "enabled_functions": "end_call",
                "_compliance_config": {}, "system_prompt": "Book a site visit for the RERA project."}

        def names(cfg):
            return {getattr(t, "id", "") for t in main._build_tools(cfg)}
        self.assertIn("send_brochure", names(dict(base)))
        self.assertIn("send_brochure", names(dict(base, enabled_functions="")))
        self.assertNotIn("send_brochure", names(dict(base, is_platform_demo=True, public_demo_slug="real-estate")))

    def test_brochure_and_property_fields_only_for_property_businesses(self):
        """Call 1464: a website agency's agent offered a brochure on WhatsApp
        and saved a website enquiry as property_type "Commercial"."""
        agency = {"id": 26, "account_id": 2, "name": "Artha", "enabled_functions": "end_call",
                  "_compliance_config": {}, "system_prompt": "We build websites and run ads."}
        built = {getattr(t, "id", ""): t for t in main._build_tools(agency)}
        self.assertNotIn("send_brochure", built)
        self.assertIs(built["log_lead"], tools.log_lead_general)
        property_agent = dict(agency, system_prompt="Offer a site visit; all projects are RERA approved.")
        built = {getattr(t, "id", ""): t for t in main._build_tools(property_agent)}
        self.assertIn("send_brochure", built)
        self.assertIs(built["log_lead"], tools.log_lead)

    def test_general_log_lead_stores_like_log_lead(self):
        lead_data = {}
        ctx = SimpleNamespace(userdata={"lead_data": lead_data})
        with patch.object(tools, "log_lead", new=AsyncMock(return_value="ok")) as inner:
            reply = asyncio.run(tools.log_lead_general.__wrapped__(ctx, need="website", timeline="next month"))
        self.assertEqual(reply, "ok")
        inner.assert_awaited_once_with(ctx, name="", phone="", budget="", location="",
                                       timeline="next month", need="website")


if __name__ == "__main__":
    unittest.main(verbosity=2)
