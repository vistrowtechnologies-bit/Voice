"""Read-only ArthaLeads project list client keeps credentials server-side."""
import json
import unittest
from io import BytesIO
from unittest.mock import patch

import arthaleads_picker


class _Response(BytesIO):
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        self.close()


class ArthaleadsPickerTests(unittest.TestCase):
    @patch("arthaleads_picker.urllib.request.urlopen")
    def test_fetches_active_choices_with_header_and_returns_only_picker_fields(self, urlopen):
        urlopen.return_value = _Response(json.dumps({
            "ok": True,
            "org_id": "private-org-id",
            "projects": [
                {"id": "p1", "name": "Khopoli", "location": "Maharashtra", "leadCount": 12},
                {"id": "", "name": "Invalid"},
            ],
            "campaigns": [
                {"id": "fb1", "name": "Facebook form", "source": "facebook_campaign", "leads": 4},
                {"id": "wa1", "name": "WhatsApp ad", "source": "whatsapp_ad", "leads": 2},
                {"id": "g1", "name": "Google campaign", "source": "google_campaign", "leads": 1},
            ],
        }).encode())

        result = arthaleads_picker.fetch_picker_options("private-connection-key")

        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, arthaleads_picker.PICKER_OPTIONS_URL)
        self.assertEqual(request.get_header("Authorization"), "Bearer private-connection-key")
        self.assertNotIn("private-connection-key", request.full_url)
        self.assertEqual(result, {
            "projects": [{"id": "p1", "name": "Khopoli", "location": "Maharashtra"}],
            "campaigns": [
                {"id": "fb1", "name": "Facebook form", "source": "facebook_campaign", "leads": 4},
                {"id": "wa1", "name": "WhatsApp ad", "source": "whatsapp_ad", "leads": 2},
            ],
        })
        self.assertNotIn("org_id", result)

    @patch("arthaleads_picker.urllib.request.urlopen")
    def test_connection_errors_are_sanitized(self, urlopen):
        urlopen.side_effect = __import__("urllib.error").error.HTTPError(
            arthaleads_picker.PICKER_OPTIONS_URL, 401, "Unauthorized", {}, BytesIO(b"secret in body")
        )
        with self.assertRaises(arthaleads_picker.ArthaLeadsPickerError) as error:
            arthaleads_picker.fetch_picker_options("token")
        self.assertEqual(error.exception.status, 401)
        self.assertNotIn("token", str(error.exception))
        self.assertNotIn("secret in body", str(error.exception))

    def test_requires_connection_and_rejects_unreadable_replies(self):
        with self.assertRaises(arthaleads_picker.ArthaLeadsPickerError) as missing:
            arthaleads_picker.fetch_picker_options("")
        self.assertEqual(missing.exception.status, 400)
        with self.assertRaises(arthaleads_picker.ArthaLeadsPickerError) as invalid:
            arthaleads_picker._clean_options({"projects": []})
        self.assertEqual(invalid.exception.status, 502)


if __name__ == "__main__":
    unittest.main(verbosity=2)
