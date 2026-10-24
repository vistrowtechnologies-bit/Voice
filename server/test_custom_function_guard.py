"""_guard_custom_functions rejects non-http and internal-IP custom-function URLs at save."""
import ast
import json
import os
import unittest

from fastapi import HTTPException

import kb_crawl


def _guard():
    src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "token_api.py"), encoding="utf-8").read()
    nodes = [n for n in ast.parse(src).body if isinstance(n, ast.FunctionDef) and n.name == "_guard_custom_functions"]
    ns = {"HTTPException": HTTPException, "json": json, "kb_crawl": kb_crawl}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), "token_api.py", "exec"), ns)
    return ns["_guard_custom_functions"]


class CustomFunctionGuard(unittest.TestCase):
    def test_public_urls_pass(self):
        guard = _guard()
        guard({"customFunctions": [{"name": "crm", "url": "https://api.example.com/x"}]})
        guard({"custom_functions": json.dumps([{"name": "crm", "url": "http://8.8.8.8/x"}])})
        guard({"customFunctions": [{"name": "draft", "url": ""}]})
        guard({"name": "no functions in this patch"})

    def test_internal_and_non_http_urls_are_refused(self):
        guard = _guard()
        for url in ("http://169.254.169.254/latest/meta-data", "http://127.0.0.1:8080/", "http://10.0.0.5/",
                    "http://[::1]/", "file:///etc/passwd", "ftp://example.com/"):
            with self.assertRaises(HTTPException, msg=url):
                guard({"customFunctions": [{"name": "crm", "url": url}]})


if __name__ == "__main__":
    unittest.main()
