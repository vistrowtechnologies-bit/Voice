import os
import unittest
from unittest import mock

import env_guard


def _env(**kw):
    """Replace APP_ENV / STAGING_DIAL_ALLOWLIST wholesale for one test."""
    base = {k: v for k, v in os.environ.items() if k not in ("APP_ENV", "STAGING_DIAL_ALLOWLIST")}
    base.update(kw)
    return mock.patch.dict(os.environ, base, clear=True)


class EnvGuardTests(unittest.TestCase):
    def test_production_is_untouched(self):
        with _env():
            self.assertIsNone(env_guard.dial_block_reason("+919876543210"))
        with _env(APP_ENV="production"):
            self.assertIsNone(env_guard.dial_block_reason("+919876543210"))

    def test_staging_blocks_everything_by_default(self):
        with _env(APP_ENV="staging"):
            self.assertTrue(env_guard.dial_block_reason("+919876543210"))
            self.assertTrue(env_guard.dial_block_reason(""))
        with _env(APP_ENV="staging", STAGING_DIAL_ALLOWLIST=" , "):
            self.assertTrue(env_guard.dial_block_reason("+919876543210"))

    def test_staging_allows_only_listed_numbers_in_any_spelling(self):
        with _env(APP_ENV="Staging", STAGING_DIAL_ALLOWLIST="+91 90670 97779, 8080197945"):
            self.assertIsNone(env_guard.dial_block_reason("919067097779"))
            self.assertIsNone(env_guard.dial_block_reason("+918080197945"))
            self.assertIsNone(env_guard.dial_block_reason("9067097779"))
            self.assertTrue(env_guard.dial_block_reason("+919000000000"))


class EmailGuardTests(unittest.TestCase):
    def test_production_sends_to_anyone(self):
        with _env():
            self.assertIsNone(env_guard.email_block_reason("someone@gmail.com"))

    def test_staging_blocks_unless_listed_by_address_or_domain(self):
        with _env(APP_ENV="staging"):
            self.assertTrue(env_guard.email_block_reason("someone@gmail.com"))
        with _env(APP_ENV="staging", STAGING_EMAIL_ALLOWLIST="qa@example.com, @vistrow.com"):
            self.assertIsNone(env_guard.email_block_reason("QA@example.com"))
            self.assertIsNone(env_guard.email_block_reason("a.b@vistrow.com"))
            self.assertTrue(env_guard.email_block_reason("a.b@notvistrow.com.evil.io"))
            self.assertTrue(env_guard.email_block_reason("other@example.com"))


if __name__ == "__main__":
    unittest.main()
