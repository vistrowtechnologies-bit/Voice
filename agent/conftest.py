"""Keeps pytest off the production database. Loaded before any test module.

main.py calls load_dotenv(), which searches upward from agent/ and finds the
repo-root .env, whose DATABASE_URL is production. With DATABASE_URL unset in
the shell, every test that builds a RealEstateAgent read compliance config
from production and the tool tests wrote integration_deliveries rows there
(2026-10-14: 60 production pools in one run of this suite). The server suite
did worse the same way; see server/conftest.py.

DATABASE_URL is pinned before load_dotenv() can fill it (it never overrides
a set variable): TEST_DATABASE_URL if given, else a placeholder that cannot
resolve. A Railway database is refused outright.
"""
import os

import pytest

_PLACEHOLDER = "postgresql://set-TEST_DATABASE_URL.invalid/vistrow_tests"

_url = os.environ.get("DATABASE_URL") or os.environ.get("TEST_DATABASE_URL") or _PLACEHOLDER
if ".rlwy.net" in _url or ".railway.internal" in _url:
    pytest.exit("DATABASE_URL points at a Railway database; tests use a throwaway local Postgres "
                "(TEST_DATABASE_URL).", returncode=4)
os.environ["DATABASE_URL"] = _url
