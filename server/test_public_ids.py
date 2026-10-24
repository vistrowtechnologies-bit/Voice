"""Neutral public model/voice ids (server/public_ids.py): every id the API
can emit translates back, legacy internal ids are still accepted, an id the
server never issued is refused, and nothing tenant-facing names a vendor."""
import json
import re
import unittest

import public_ids
import voice_catalog

VENDOR = re.compile(r"sarvam|google|gemini|elevenlabs|chirp|gpt|groq|qwen|openai|bulbul|duplex:", re.I)


class Models(unittest.TestCase):
    def test_every_known_model_round_trips_and_is_neutral(self):
        for internal, public in public_ids.MODELS.items():
            self.assertEqual(public_ids.model_out(internal), public)
            self.assertEqual(public_ids.model_in(public), internal)
            self.assertIsNone(VENDOR.search(public), public)

    def test_public_ids_are_unique(self):
        self.assertEqual(len(set(public_ids.MODELS.values())), len(public_ids.MODELS))

    def test_legacy_internal_input_still_accepted(self):
        self.assertEqual(public_ids.model_in("sarvam/sarvam-105b-conversations"), "sarvam/sarvam-105b-conversations")

    def test_an_unlisted_saved_model_round_trips_through_the_agent(self):
        odd = "someone/old-model"
        public = public_ids.model_out(odd)
        self.assertTrue(public.startswith("vistrow-model-"))
        self.assertEqual(public_ids.model_in(public, current=odd), odd)
        with self.assertRaises(public_ids.UnknownId):
            public_ids.model_in(public)

    def test_unknown_public_model_is_refused(self):
        with self.assertRaises(public_ids.UnknownId):
            public_ids.model_in("vistrow-nonsense")


class Voices(unittest.TestCase):
    def test_every_catalog_voice_round_trips_and_is_neutral(self):
        seen = set()
        for entry in voice_catalog.CATALOG:
            public = public_ids.voice_out(entry["value"])
            self.assertRegex(public, r"^vv_v_[a-z2-7]{12}$")
            self.assertEqual(public_ids.voice_in(public), entry["value"])
            seen.add(public)
        self.assertEqual(len(seen), len(voice_catalog.CATALOG), "no two voices share a public id")

    def test_cloned_voices_pass_through(self):
        self.assertEqual(public_ids.voice_out("custom:vv_12"), "custom:vv_12")
        self.assertEqual(public_ids.voice_in("custom:vv_12"), "custom:vv_12")

    def test_legacy_and_unknown(self):
        self.assertEqual(public_ids.voice_in("google:chirp3:Aoede"), "google:chirp3:Aoede")
        with self.assertRaises(public_ids.UnknownId):
            public_ids.voice_in("vv_v_aaaaaaaaaaaa")
        legacy = "google:kore"  # not in today's catalog, still on an old agent
        self.assertEqual(public_ids.voice_in(public_ids.voice_out(legacy), current=legacy), legacy)

    def test_public_entries_name_no_vendor(self):
        allowed = voice_catalog.allowed_tiers_for_plan("scale", True)
        for entry in voice_catalog.CATALOG:
            pub = public_ids.public_voice(voice_catalog.public_entry(entry, allowed))
            self.assertNotIn(entry["value"], json.dumps(pub), entry["value"])
            for key in ("value", "family", "hdTwin"):
                if pub.get(key):
                    self.assertIsNone(VENDOR.search(str(pub[key])), (key, pub[key]))

    def test_families_match_the_old_dashboard_rules(self):
        fam = {e["value"]: public_ids.voice_family(e) for e in voice_catalog.CATALOG}
        self.assertEqual(fam["google:chirp3:Aoede"], "hd")
        self.assertEqual(fam["google38:zephyr"], "studio-lite")
        self.assertTrue(all(f == "bharat" for v, f in fam.items() if v.startswith("sarvam4:")))
        self.assertTrue(any(f == "native" for f in fam.values()))

    def test_live_persona_and_hd_twin(self):
        self.assertEqual(public_ids.live_persona("google:chirp3:Aoede"), "Aoede")
        self.assertEqual(public_ids.live_persona("google38:zephyr"), "Zephyr")
        self.assertIsNone(public_ids.live_persona("sarvam4:aarti_hi_customer"))
        allowed = voice_catalog.allowed_tiers_for_plan("scale", True)
        entry = next(e for e in voice_catalog.CATALOG if e["value"] == "google38:zephyr")
        twin = public_ids.public_voice(voice_catalog.public_entry(entry, allowed)).get("hdTwin")
        if any(e["value"] == "google:chirp3:Zephyr" for e in voice_catalog.CATALOG):
            self.assertEqual(public_ids.voice_in(twin), "google:chirp3:Zephyr")


class Agents(unittest.TestCase):
    AGENT = {"id": 7, "model": "sarvam/sarvam-105b-conversations", "voice": "google:chirp3:Aoede",
             "voiceName": "Myra HD", "sttProvider": "google-chirp3", "name": "Siya"}

    def test_out_then_in_restores_the_internal_agent(self):
        public = public_ids.agent_out(self.AGENT)
        self.assertIsNone(VENDOR.search(json.dumps({k: public[k] for k in ("model", "voice", "sttProvider")})))
        back = public_ids.agent_in({k: public[k] for k in ("model", "voice", "sttProvider")}, current=self.AGENT)
        self.assertEqual((back["model"], back["voice"], back["sttProvider"]),
                         ("sarvam/sarvam-105b-conversations", "google:chirp3:Aoede", "google-chirp3"))

    def test_a_raw_voice_name_never_shows(self):
        odd = {**self.AGENT, "voice": "google:kore", "voiceName": "google:kore"}
        self.assertEqual(public_ids.agent_out(odd)["voiceName"], "Earlier voice")

    def test_only_sent_fields_are_translated(self):
        self.assertEqual(public_ids.agent_in({"name": "X"}), {"name": "X"})


if __name__ == "__main__":
    unittest.main(verbosity=2)
