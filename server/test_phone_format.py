"""One phone format for every tenant, in any country. Never touches a database."""
import unittest
from pathlib import Path

import phone_format as pf


class IndiaStaysExactlyAsBefore(unittest.TestCase):
    """Every existing account is Indian; these are the values actually sitting
    in production on 2026-09-24, and what each must become."""

    def test_every_way_one_number_was_stored_is_one_identity(self):
        for raw in ("8080197945", "+91 8080197945", "918080197945", "08080197945",
                    "+91 80801 97945", "+91-80801-97945", "0091 8080197945"):
            self.assertEqual(pf.to_e164(raw, "IN"), "+918080197945", raw)

    def test_spaced_campaign_import(self):
        self.assertEqual(pf.to_e164("+91 744 743 0431", "IN"), "+917447430431")

    def test_junk_is_rejected_not_invented(self):
        for raw in ("", None, "not provided", "123", "000000000", "123456789",
                    "80801945", "+0123456789"):
            self.assertEqual(pf.to_e164(raw, "IN"), "", raw)


class OtherCountries(unittest.TestCase):
    def test_local_numbers_read_in_the_account_country(self):
        self.assertEqual(pf.to_e164("(415) 555-2671", "US"), "+14155552671")
        self.assertEqual(pf.to_e164("020 7946 0958", "GB"), "+442079460958")
        self.assertEqual(pf.to_e164("050 123 4567", "AE"), "+971501234567")

    def test_explicit_international_number_wins_over_account_country(self):
        self.assertEqual(pf.to_e164("+91 80801 97945", "US"), "+918080197945")
        self.assertEqual(pf.to_e164("+1 (415) 555-2671", "IN"), "+14155552671")

    def test_same_digits_mean_different_people_in_different_countries(self):
        self.assertNotEqual(pf.to_e164("4155552671", "US"), pf.to_e164("4155552671", "IN"))

    def test_unknown_country_falls_back_to_default(self):
        self.assertEqual(pf.normalize_country("zz"), "IN")
        self.assertEqual(pf.normalize_country(None), "IN")
        self.assertEqual(pf.normalize_country("us"), "US")

    def test_dial_codes(self):
        self.assertEqual(pf.dial_code("IN"), "+91")
        self.assertEqual(pf.dial_code("AE"), "+971")
        self.assertEqual(pf.dial_code("US"), "+1")


class MatchKey(unittest.TestCase):
    def test_dnc_matches_however_the_number_was_typed(self):
        # The India-only key could not do this for any other country.
        self.assertEqual(pf.match_key("+1 415 555 2671", "US"), pf.match_key("4155552671", "US"))
        self.assertEqual(pf.match_key("+918080197945", "IN"), pf.match_key("08080 197945", "IN"))

    def test_unparseable_value_still_matches_itself(self):
        self.assertEqual(pf.match_key("12-34", "IN"), "1234")


class AgentCopyIsIdentical(unittest.TestCase):
    def test_byte_identical(self):
        here = Path(__file__).resolve().parent
        self.assertEqual(
            (here / "phone_format.py").read_bytes(),
            (here.parent / "agent" / "phone_format.py").read_bytes(),
            "agent/phone_format.py drifted from server/phone_format.py — the agent "
            "writes DNC rows the server's dialer matches against; keep them identical",
        )


if __name__ == "__main__":
    unittest.main()
