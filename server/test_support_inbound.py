"""Email replies thread into tickets — but only genuine ones. Offline."""
import base64
import hashlib
import hmac
import os
import unittest
from unittest.mock import patch

import support_inbound as si

ENV = {"SUPPORT_REPLY_DOMAIN": "reply.vistrowvoice.com", "SUPPORT_REPLY_SECRET": "s3cret", "RESEND_WEBHOOK_SECRET": "whsec_" + base64.b64encode(b"k" * 24).decode()}


class Addresses(unittest.TestCase):
    def setUp(self):
        p = patch.dict(os.environ, ENV)
        p.start()
        self.addCleanup(p.stop)

    def test_round_trip(self):
        addr = si.reply_address(12)
        self.assertRegex(addr, r"^vv-12-[0-9a-f]{12}@reply\.vistrowvoice\.com$")
        self.assertEqual(si.ticket_id_from([f"Support <{addr}>"]), 12)

    def test_a_guessed_address_cannot_post_into_a_ticket(self):
        forged = "vv-12-000000000000@reply.vistrowvoice.com"
        self.assertIsNone(si.ticket_id_from([forged]))
        # Another ticket's valid token doesn't open this one either.
        other = si.reply_address(13).replace("vv-13-", "vv-12-")
        self.assertIsNone(si.ticket_id_from([other]))

    def test_wrong_domain_is_ignored(self):
        addr = si.reply_address(12).replace("reply.vistrowvoice.com", "evil.example")
        self.assertIsNone(si.ticket_id_from([addr]))

    def test_off_until_configured(self):
        with patch.dict(os.environ, {"SUPPORT_REPLY_DOMAIN": ""}):
            self.assertIsNone(si.reply_address(12))
            self.assertFalse(si.enabled())


class Signature(unittest.TestCase):
    def _sign(self, body: bytes, msg_id="msg_1", stamp="1700000000"):
        key = base64.b64decode(ENV["RESEND_WEBHOOK_SECRET"].split("_", 1)[1])
        sig = base64.b64encode(hmac.new(key, f"{msg_id}.{stamp}.".encode() + body, hashlib.sha256).digest()).decode()
        return {"svix-id": msg_id, "svix-timestamp": stamp, "svix-signature": f"v1,{sig}"}

    def test_valid_signature(self):
        body = b'{"type":"email.received"}'
        self.assertTrue(si.verify_signature(self._sign(body), body, ENV["RESEND_WEBHOOK_SECRET"], now=1700000010))

    def test_tampered_body_fails(self):
        headers = self._sign(b'{"type":"email.received"}')
        self.assertFalse(si.verify_signature(headers, b'{"type":"email.forged"}', ENV["RESEND_WEBHOOK_SECRET"], now=1700000010))

    def test_replayed_old_event_fails(self):
        body = b"{}"
        self.assertFalse(si.verify_signature(self._sign(body), body, ENV["RESEND_WEBHOOK_SECRET"], now=1700000000 + 3600))

    def test_missing_headers_fail(self):
        self.assertFalse(si.verify_signature({}, b"{}", ENV["RESEND_WEBHOOK_SECRET"]))


class QuotedHistory(unittest.TestCase):
    def test_gmail_reply_with_wrapped_header(self):
        text = "Yes, that fixed it — thanks!\n\nOn Thu, 24 Sept 2026 at 15:57, Vistrow Voice Support <vv-2-abc@reply.vistrowvoice.com>\nwrote:\n> Test reply from the support inbox"
        self.assertEqual(si.strip_quoted(text), "Yes, that fixed it — thanks!")

    def test_single_line_gmail_header(self):
        self.assertEqual(si.strip_quoted("Still broken.\nOn Mon, Support wrote:\n> old"), "Still broken.")

    def test_outlook_original_message(self):
        self.assertEqual(si.strip_quoted("Here's the log.\r\n-----Original Message-----\r\nFrom: x"), "Here's the log.")

    def test_quote_markers_only(self):
        self.assertEqual(si.strip_quoted("> quoted\n> more"), "")


class AutoReplies(unittest.TestCase):
    def test_out_of_office_is_ignored(self):
        self.assertTrue(si.is_auto_reply({"headers": {"Auto-Submitted": "auto-replied"}}))
        self.assertTrue(si.is_auto_reply({"headers": {"Precedence": "bulk"}}))
        self.assertFalse(si.is_auto_reply({"headers": {"Auto-Submitted": "no"}}))
        self.assertFalse(si.is_auto_reply({}))


if __name__ == "__main__":
    unittest.main()
