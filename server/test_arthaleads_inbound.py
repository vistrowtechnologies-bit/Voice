"""Fail-closed ArthaLeads request parsing; these tests never dial or queue."""

import unittest

import arthaleads_inbound


class ArthaLeadsInboundContractTests(unittest.TestCase):
    def test_only_true_with_an_explicit_agent_can_request_a_call(self):
        self.assertEqual(arthaleads_inbound.call_request({"auto_call": True, "agent_id": "42"}),
                         (True, 42, ""))
        for value in (False, None, 0, 1, "true", "yes"):
            with self.subTest(value=value):
                allow_call, agent_id, reason = arthaleads_inbound.call_request({
                    "auto_call": value, "agent_id": "42", "auto_call_reason": "source_disabled",
                })
                self.assertFalse(allow_call)
                self.assertIsNone(agent_id)
                self.assertEqual(reason, "invalid_auto_call_flag" if value is not False and value is not None else "source_disabled")

    def test_missing_agent_opt_out_and_test_header_never_request_calls(self):
        self.assertEqual(arthaleads_inbound.call_request({"auto_call": True}),
                         (False, None, "agent_missing"))
        self.assertEqual(arthaleads_inbound.call_request({"auto_call": True, "agent_id": 42, "opt_out": True}),
                         (False, None, "lead_opted_out"))
        self.assertEqual(arthaleads_inbound.call_request({"auto_call": True, "agent_id": 42}, is_test=True),
                         (False, None, "test_event"))

    def test_documented_auto_call_reasons_are_preserved_and_unknown_ones_softened(self):
        for reason in arthaleads_inbound.AUTO_CALL_DECLINE_REASONS:
            with self.subTest(reason=reason):
                self.assertEqual(arthaleads_inbound.call_request({"auto_call": False, "auto_call_reason": reason}),
                                 (False, None, reason))
        self.assertEqual(arthaleads_inbound.call_request({"auto_call": False, "auto_call_reason": "secret"}),
                         (False, None, "not_auto_source"))

    def test_payload_fields_keep_exact_routing_metadata_and_project_page_context(self):
        fields = arthaleads_inbound.copy_scalar_fields({
            "lead_source": "Facebook Ad", "auto_call": True, "agent_id": "42",
            "route_label": "Khopoli Sales", "auto_call_reason": "",
            "custom_fields": {
                "project_id": "p-7", "source_page": "https://example.test/khopoli",
                "tags": ["facebook", "khopoli"], "ignored object": {"secret": True},
            },
        })
        self.assertEqual(fields["lead_source"], "Facebook Ad")
        self.assertIs(fields["auto_call"], True)
        self.assertEqual(fields["agent_id"], "42")
        self.assertEqual(fields["route_label"], "Khopoli Sales")
        self.assertEqual(fields["project_id"], "p-7")
        self.assertEqual(fields["page_url"], "https://example.test/khopoli")
        self.assertEqual(fields["tags"], ["facebook", "khopoli"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
