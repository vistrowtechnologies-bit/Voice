"""Vistrow's own WhatsApp sender (wa_sender.py). Offline: nothing calls Meta."""
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wa_sender  # noqa: E402


class PhoneNumbers(unittest.TestCase):
    def test_normalises_indian_and_international(self):
        self.assertEqual(wa_sender.normalize_phone("98765 43210"), "919876543210")
        self.assertEqual(wa_sender.normalize_phone("+91 98765-43210"), "919876543210")
        self.assertEqual(wa_sender.normalize_phone("+1 415 555 0100"), "14155550100")

    def test_rejects_non_numbers(self):
        for bad in ("", "12345", "abc", "1" * 16):
            with self.assertRaises(ValueError, msg=bad):
                wa_sender.normalize_phone(bad)


class Templates(unittest.TestCase):
    def test_shape_counts_body_variables_and_otp_button(self):
        shape = wa_sender._template_shape({
            "name": "login_code", "language": "en", "category": "AUTHENTICATION", "status": "APPROVED",
            "components": [{"type": "BODY", "text": "{{1}} is your code. {{1}}"},
                           {"type": "BUTTONS", "buttons": [{"type": "OTP", "otp_type": "COPY_CODE"}]}],
        })
        self.assertEqual((shape["param_count"], shape["has_otp_button"]), (1, 1))

    def test_otp_code_is_repeated_on_the_button(self):
        comps = wa_sender._components({"has_otp_button": 1}, ["482913"])
        self.assertEqual(comps[1]["parameters"][0]["text"], "482913")
        self.assertEqual(len(wa_sender._components({"has_otp_button": 0}, ["a", "b"])), 1)


class SendGuards(unittest.TestCase):
    def test_unapproved_or_wrong_params_never_reach_meta(self):
        graph = mock.Mock()
        with mock.patch.object(wa_sender, "_graph", graph):
            for template, params in (({"status": "PENDING", "param_count": 0}, []),
                                     ({"status": "APPROVED", "param_count": 2}, ["only one"]),
                                     (None, [])):
                with mock.patch.object(wa_sender, "_template", return_value=template):
                    with self.assertRaises(ValueError):
                        wa_sender.send_template("9876543210", "t", "en", params)
        graph.assert_not_called()

    def test_not_configured_is_reported(self):
        with mock.patch.dict(os.environ, {"WA_SENDER_TOKEN": ""}):
            self.assertFalse(wa_sender.status()["configured"])
            with self.assertRaises(RuntimeError):
                wa_sender._graph("GET", "x")


class StatusesMoveForwardOnly(unittest.TestCase):
    def _record(self, current, new):
        conn = mock.MagicMock()
        conn.execute.return_value.fetchone.return_value = {"id": 7, "status": current} if current else None
        with mock.patch.object(wa_sender.calls_db, "_connect", return_value=conn):
            result = wa_sender.record_status("wamid.X", new)
        updated = any("UPDATE wa_sender_messages" in str(c.args[0]) for c in conn.execute.call_args_list)
        return result, updated

    def test_out_of_order_and_repeats_are_ignored(self):
        self.assertEqual(self._record("read", "sent"), (True, False))
        self.assertEqual(self._record("delivered", "delivered"), (True, False))

    def test_forward_moves_are_written(self):
        self.assertEqual(self._record("sent", "delivered"), (True, True))
        self.assertEqual(self._record("delivered", "failed"), (True, True))

    def test_not_ours_or_unknown(self):
        self.assertEqual(self._record(None, "read"), (False, False))
        self.assertEqual(wa_sender.record_status("wamid.X", "bogus"), False)


class Broadcasts(unittest.TestCase):
    def test_needs_valid_numbers_and_an_approved_template(self):
        with self.assertRaises(ValueError):
            wa_sender.broadcast("x", "t", "en", [], ["nope", "123"], 1)
        with mock.patch.object(wa_sender, "_template", return_value={"status": "REJECTED"}):
            with self.assertRaises(ValueError):
                wa_sender.broadcast("x", "t", "en", [], ["9876543210"], 1)

    def test_routes_are_admin_only(self):
        deps = []

        def owner():
            deps.append(1)
        router = wa_sender.build_router(owner)
        paths = {r.path for r in router.routes}
        self.assertIn("/admin/whatsapp/broadcasts", paths)
        for route in router.routes:
            self.assertTrue(any(d.call is owner for d in route.dependant.dependencies), route.path)



class SenderWebhook(unittest.TestCase):
    """Statuses come from the sender's own Meta app, signed with its own secret."""

    def test_signature_uses_the_sender_app_secret_only(self):
        import hashlib, hmac
        body = b'{"entry": []}'
        good = "sha256=" + hmac.new(b"sender-secret", body, hashlib.sha256).hexdigest()
        with mock.patch.dict(os.environ, {"WA_SENDER_APP_SECRET": "sender-secret"}):
            self.assertTrue(wa_sender.verify_signature(body, good))
            self.assertFalse(wa_sender.verify_signature(body, "sha256=" + "0" * 64))
        with mock.patch.dict(os.environ, {"WA_SENDER_APP_SECRET": ""}):
            self.assertFalse(wa_sender.verify_signature(body, good))

    def test_statuses_are_recorded_and_errors_never_escape(self):
        payload = {"entry": [{"changes": [{"value": {"statuses": [
            {"id": "wamid.A", "status": "delivered"}, {"id": "wamid.B", "status": "read"}]}}]}]}
        with mock.patch.object(wa_sender, "record_status", side_effect=[True, RuntimeError("db down")]):
            self.assertEqual(wa_sender.handle_webhook(payload), 1)

if __name__ == "__main__":
    unittest.main()
