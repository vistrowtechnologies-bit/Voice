"""Regression contract for independently selectable speech recognition."""
import ast
import os
import unittest


HERE = os.path.dirname(os.path.abspath(__file__))


def source(name: str) -> str:
    with open(os.path.join(HERE, name), encoding="utf-8") as handle:
        return handle.read()


class AgentSttProviderStorage(unittest.TestCase):
    def test_schema_and_migration_default_to_sarvam(self):
        calls_db = source("calls_db.py")
        self.assertIn("stt_provider TEXT DEFAULT 'sarvam'", calls_db)
        self.assertIn("ADD COLUMN IF NOT EXISTS stt_provider TEXT DEFAULT 'sarvam'", calls_db)

    def test_api_maps_camel_case_and_returns_it(self):
        calls_db = source("calls_db.py")
        self.assertIn('"sttProvider": "stt_provider"', calls_db)
        self.assertIn('"sttProvider": _row_get(row, "stt_provider") or "sarvam"', calls_db)

    def test_api_rejects_unknown_provider(self):
        token_api = source("token_api.py")
        tree = ast.parse(token_api)
        guard = next(n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == "_guard_stt_provider")
        guard_source = ast.get_source_segment(token_api, guard) or ""
        self.assertIn('"sarvam", "google-chirp3"', guard_source)


if __name__ == "__main__":
    unittest.main()
