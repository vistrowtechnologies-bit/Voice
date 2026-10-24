"""A lead POSTed to the generic lead webhook was always labelled "Facebook
lead"; only a real Facebook Lead Ads payload is now (owner, 24 Oct)."""
import ast
import os
import unittest

import calls_db

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name: str):
    source = open(os.path.join(HERE, "token_api.py"), encoding="utf-8").read()
    node = next(n for n in ast.walk(ast.parse(source)) if isinstance(n, ast.FunctionDef) and n.name == name)
    ns: dict = {}
    exec(ast.get_source_segment(source, node), ns)
    return ns[name]


class GenericWebhookSource(unittest.TestCase):
    source = staticmethod(_load("_generic_lead_source"))

    def test_a_website_or_crm_lead_is_a_webhook_lead(self):
        self.assertEqual(self.source({"name": "Asha", "phone": "+919820134567", "id": "crm-7"}), "webhook")
        self.assertEqual(calls_db._lead_channel_label({}, "webhook"), "Webhook lead")

    def test_zapiers_facebook_passthrough_stays_facebook(self):
        self.assertEqual(self.source({"field_data": [{"name": "phone_number", "values": ["+919820134567"]}]}),
                         "facebook_lead_ads")
        self.assertEqual(self.source({"leadgen_id": "123", "phone": "+919820134567"}), "facebook_lead_ads")
        self.assertEqual(calls_db._lead_channel_label({}, "facebook_lead_ads"), "Facebook lead")


if __name__ == "__main__":
    unittest.main(verbosity=2)
