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

OPENAI_API_KEY gets a placeholder the same way. Production always has one, so
the session builds the OpenAI failover LLM and the post-call extractor, and
those clients refuse to construct without a key. Without this, a checkout with
no .env (any worktree) failed 23 agent tests, and the main checkout passed only
by handing the real key to the tests. No test calls OpenAI.
"""
import os

import pytest

_PLACEHOLDER = "postgresql://set-TEST_DATABASE_URL.invalid/vistrow_tests"

_url = os.environ.get("DATABASE_URL") or os.environ.get("TEST_DATABASE_URL") or _PLACEHOLDER
if ".rlwy.net" in _url or ".railway.internal" in _url:
    pytest.exit("DATABASE_URL points at a Railway database; tests use a throwaway local Postgres "
                "(TEST_DATABASE_URL).", returncode=4)
os.environ["DATABASE_URL"] = _url
os.environ.setdefault("OPENAI_API_KEY", "test-key-not-used-offline")

if _url == _PLACEHOLDER:
    # No database at all: fail each connect at once instead of 3 x 6 s, so
    # code that falls back on a DB error is tested in seconds, not minutes.
    import dbconn

    dbconn._GETCONN_TIMEOUT_S = 0.2
    dbconn._CONNECT_ATTEMPTS = 1
