"""Regression coverage for the ArthaLeads call/recording contract."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")

import tools


class ArthaLeadsRecordingPayloadTests(unittest.TestCase):
    def test_completed_call_contains_recording_and_source_context(self):
        shaped = tools._integration_body(
            "arthaleads",
            {"token": "AW-test"},
            {
                "type": "call_completed",
                "name": "Test lead",
                "phone": "+919999999999",
                "call_id": 947,
                "recording_url": "https://api.vistrowvoice.com/public/calls/947/recording?token=opaque",
                "recording_mime_type": "audio/wav",
                "page_path": "/shapoorji-pallonji-plot-khopoli/",
                "transcript": [{"role": "user", "text": "Investment"}],
                "extracted_data": {"purpose": "Investment"},
            },
        )

        self.assertIsNotNone(shaped)
        _, body = shaped
        self.assertEqual(body["call_id"], 947)
        self.assertIn("/public/calls/947/recording?token=opaque", body["recording_url"])
        self.assertEqual(body["recording_mime_type"], "audio/wav")
        self.assertEqual(body["page_path"], "/shapoorji-pallonji-plot-khopoli/")
        self.assertEqual(body["extracted_data"]["purpose"], "Investment")

    def test_private_storage_key_is_never_part_of_payload(self):
        _, body = tools._integration_body(
            "arthaleads",
            {"token": "AW-test"},
            {
                "type": "call_completed",
                "name": "Test lead",
                "phone": "+919999999999",
                "recording_url": "https://api.vistrowvoice.com/public/calls/1/recording?token=opaque",
            },
        )
        self.assertNotIn("recording_key", body)


if __name__ == "__main__":
    unittest.main(verbosity=2)
