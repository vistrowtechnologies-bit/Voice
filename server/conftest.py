"""Keeps pytest off the production database. Loaded before any test module.

token_api.py calls load_dotenv(), which searches upward from server/ and
finds the repo-root .env, whose DATABASE_URL is production. So with
DATABASE_URL unset in the shell, a test that imported token_api ran
calls_db.init_tables() against production: one transaction of ALTER TABLE
statements over the public proxy that holds an AccessExclusiveLock on
`calls` until it commits (50 s measured from a laptop against staging).
Live calls cannot write their call row meanwhile: on 2026-10-14 calls
1282-1284 saved 33-36 s after hang-up while this suite was run in a loop.

DATABASE_URL is pinned before load_dotenv() can fill it (it never
overrides a set variable): TEST_DATABASE_URL if given, else a placeholder
that cannot resolve. A Railway database is refused outright.
"""
import os

import pytest

_PLACEHOLDER = "postgresql://set-TEST_DATABASE_URL.invalid/vistrow_tests"

_url = os.environ.get("DATABASE_URL") or os.environ.get("TEST_DATABASE_URL") or _PLACEHOLDER
if ".rlwy.net" in _url or ".railway.internal" in _url:
    pytest.exit("DATABASE_URL points at a Railway database; tests use a throwaway local Postgres "
                "(TEST_DATABASE_URL).", returncode=4)
os.environ["DATABASE_URL"] = _url

# Production's internal account ids (admin_db.INTERNAL_ACCOUNT_IDS) are low
# numbers that a fresh test database hands to the tests' own accounts; use an
# id no test creates so customer numbers in tests stay customer numbers.
os.environ.setdefault("INTERNAL_ACCOUNT_IDS", "999999999")
