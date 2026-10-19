"""Contact details from the platform demo (owner rule 18 Oct 2026).

Widget call 1408: an Angolan prospect asked for pricing in writing. The agent
said his details were registered for email follow-up without ever asking for
his email, and capture_platform_lead saved OUR address (info@vistrow.com) as
his contact. His +244 number could not have been saved at all: only Indian
mobiles were accepted. Here the tool must refuse our own domains and malformed
emails, accept international numbers with a country code, keep email and phone
in their own fields, and only report success after it recorded something.
"""
import asyncio
import contextlib
import unittest
from types import SimpleNamespace
from unittest import mock

import main
import tools


def _run(contact, name="Jaime Mavungo"):
    lead_data = {}
    ctx = SimpleNamespace(userdata={"lead_data": lead_data})

    async def _noop(*a, **k):
        return None

    @contextlib.asynccontextmanager
    async def _filler(*a, **k):
        yield

    with mock.patch.object(tools, "_publish_event", _noop), mock.patch.object(tools, "_post_webhook", _noop), \
            mock.patch.object(tools, "_fan_out_integrations", _noop), mock.patch.object(tools, "_tool_filler", _filler):
        reply = asyncio.run(tools.capture_platform_lead.__wrapped__(
            ctx, name=name, company="M2J Technology", contact=contact,
            use_case="outbound prospecting in Portuguese", team_size=""))
    return reply, lead_data


class OurOwnAddressIsNeverTheCallersContact(unittest.TestCase):
    def test_call_1408_our_info_address_is_refused(self):
        reply, lead = _run("info@vistrow.com")
        self.assertIn("nothing was recorded", reply)
        self.assertEqual(lead, {})

    def test_other_own_domains_are_refused(self):
        for addr in ("sales@vistrowvoice.com", "hr@arthaleads.com", "INFO@Vistrow.com"):
            reply, lead = _run(addr)
            self.assertIn("nothing was recorded", reply, addr)

    def test_malformed_email_is_refused(self):
        for addr in ("jaime@m2j", "jaime at m2j.ao", "@m2j.ao"):
            reply, lead = _run(addr)
            self.assertIn("nothing was recorded", reply, addr)
            self.assertEqual(lead, {})


class RealContactsAreSaved(unittest.TestCase):
    def test_email_goes_in_the_email_field(self):
        reply, lead = _run("Jaime@M2J.co.ao")
        self.assertIn("Recorded for the team", reply)
        self.assertEqual(lead.get("email"), "jaime@m2j.co.ao")
        self.assertNotIn("phone", lead)

    def test_international_number_with_country_code_is_saved(self):
        # Angola +244 9xx xxx xxx: refused before (Indian mobiles only).
        reply, lead = _run("+244 923 456 789")
        self.assertIn("Recorded for the team", reply)
        self.assertEqual(lead.get("phone"), "+244 923 456 789")

    def test_indian_mobile_still_saved_and_short_number_still_refused(self):
        reply, lead = _run("9876543210")
        self.assertIn("Recorded for the team", reply)
        reply, lead = _run("808019794")
        self.assertIn("nothing was recorded", reply)

    def test_success_reply_says_nothing_was_sent(self):
        reply, _ = _run("+244923456789")
        self.assertIn("nothing was emailed or booked", reply)


class PromptCarriesTheRule(unittest.TestCase):
    CFG = {"name": "Artha", "is_platform_demo": True, "system_prompt": "You are Artha.", "language": "en-IN"}

    def test_rule_5_is_a_platform_rule(self):
        agent = main.RealEstateAgent(dict(self.CFG))
        self.assertIn("5. Contact details and follow-up", agent.instructions)
        self.assertIn("never guess a domain, country code or digit", agent.instructions)
        self.assertIn("overrides the five rules above", agent.instructions)

    def test_demo_honesty_lines(self):
        agent = main.RealEstateAgent(dict(self.CFG))
        self.assertIn("you cannot play recordings, sample voices", agent.instructions)
        self.assertIn("Exact prices are not given on calls", agent.instructions)

    def test_rule_survives_realtime_compaction(self):
        import realtime_prompt
        agent = main.RealEstateAgent(dict(self.CFG))
        out = realtime_prompt.compact(agent.instructions, language_name="English")
        self.assertIn("5. Contact details and follow-up", out)
        self.assertIn("you cannot play recordings, sample voices", out)


if __name__ == "__main__":
    unittest.main()
