"""Regression coverage for PostgreSQL-safe tenant creation parameters."""

import unittest
from types import SimpleNamespace
from unittest.mock import patch

import calls_db


class _StopAfterUserInsert(Exception):
    pass


class _RecordingConnection:
    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple]] = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def close(self) -> None:
        pass

    def execute(self, sql: str, params: tuple = ()):
        self.calls.append((sql, params))
        if "INSERT INTO users" in sql:
            raise _StopAfterUserInsert
        return SimpleNamespace(lastrowid=42)


class AccountCreationTests(unittest.TestCase):
    def test_email_verified_case_parameter_is_boolean(self) -> None:
        conn = _RecordingConnection()
        with patch.object(calls_db, "_connect", return_value=conn):
            with self.assertRaises(_StopAfterUserInsert):
                calls_db.create_account_with_owner(
                    "Example",
                    "Owner",
                    "owner@example.com",
                    "hash",
                    email_verified=True,
                )

        user_insert = next(params for sql, params in conn.calls if "INSERT INTO users" in sql)
        self.assertIs(user_insert[-1], True)


if __name__ == "__main__":
    unittest.main()
