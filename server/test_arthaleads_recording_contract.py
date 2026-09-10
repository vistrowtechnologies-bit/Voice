"""Dashboard/manual-send half of the ArthaLeads recording contract."""

import inspect
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import calls_db
import integrations_dispatch


class ArthaLeadsRecordingContractTests(unittest.TestCase):
    def test_generic_artha_body_preserves_recording_fields(self):
        body = integrations_dispatch._body_for(
            "arthaleads",
            {"token": "AW-test"},
            {
                "name": "Test lead",
                "phone": "+919999999999",
                "call_id": 947,
                "recording_url": "https://api.vistrowvoice.com/public/calls/947/recording?token=opaque",
                "recording_mime_type": "audio/wav",
            },
        )
        self.assertEqual(body["call_id"], 947)
        self.assertEqual(body["recording_mime_type"], "audio/wav")
        self.assertIn("token=opaque", body["recording_url"])

    def test_public_route_uses_opaque_lookup_not_raw_storage_key(self):
        module_source = Path(__file__).with_name("token_api.py").read_text()
        source = module_source[module_source.index("def get_shared_call_recording("):]
        source = source[:source.index("\n@app.")]
        self.assertIn("get_shared_call_recording_key", source)
        self.assertNotIn('"recording_key"', source)
        self.assertNotIn("current_user", source)
        self.assertIn('"/public/calls/",', module_source)

    def test_dashboard_call_json_does_not_expose_share_token(self):
        source = inspect.getsource(calls_db._call_dict)
        self.assertNotIn("recordingShareToken", source)
        self.assertNotIn("recording_share_token", source)


if __name__ == "__main__":
    unittest.main(verbosity=2)
