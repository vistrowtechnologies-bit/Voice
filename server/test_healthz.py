"""/healthz is public and reports only up/down, driven by a real DB query."""
import ast
import json
import logging
import os
import types
import unittest

from fastapi import Response


HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
with open(os.path.join(HERE, "token_api.py"), encoding="utf-8") as handle:
    SOURCE = handle.read()
TREE = ast.parse(SOURCE)


def healthz_with(connect):
    node = next(n for n in ast.walk(TREE) if isinstance(n, ast.FunctionDef) and n.name == "healthz")
    ns = {"Response": Response, "logger": logging.getLogger("t"),
          "calls_db": types.SimpleNamespace(_connect=connect)}
    exec(ast.get_source_segment(SOURCE, node), ns)
    return ns["healthz"]


class FakeConn:
    def execute(self, sql):
        assert sql == "SELECT 1"
        return self

    def fetchone(self):
        return (1,)

    def close(self):
        pass


class Healthz(unittest.TestCase):
    def test_ok_when_the_database_answers(self):
        resp = healthz_with(FakeConn)()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(json.loads(resp.body), {"ok": True})

    def test_503_when_the_database_is_unreachable(self):
        def down():
            raise RuntimeError("connection refused")
        resp = healthz_with(down)()
        self.assertEqual(resp.status_code, 503)
        self.assertEqual(json.loads(resp.body), {"ok": False})

    def test_public_and_used_by_railway(self):
        self.assertIn('"/healthz",', SOURCE.split("_PUBLIC_PATHS = {", 1)[1].split("}", 1)[0])
        with open(os.path.join(ROOT, "railway.json"), encoding="utf-8") as handle:
            self.assertEqual(json.load(handle)["deploy"]["healthcheckPath"], "/healthz")


if __name__ == "__main__":
    unittest.main()
