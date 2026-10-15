"""8209cb4e (2026-10-12) added html.escape() to seven routes in token_api.py
that also assign a local `html = email_sender.render_email(...)`. Python then
treats `html` as local for the whole function, so html.escape raised
UnboundLocalError and the route answered 500: password signup, resend code,
password reset, email change, team invite, admin password reset and the
public contact form. Reproduced by running auth_signup's real body."""
import ast
import unittest
from pathlib import Path


class HtmlModuleNotShadowed(unittest.TestCase):
    def test_no_function_shadows_the_html_module(self):
        bad = []
        for path in Path(__file__).resolve().parent.glob("*.py"):
            for fn in ast.walk(ast.parse(path.read_text())):
                if not isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    continue
                nodes = list(ast.walk(fn))
                stores = any(isinstance(n, ast.Name) and n.id == "html" and isinstance(n.ctx, ast.Store) for n in nodes)
                uses = any(isinstance(n, ast.Attribute) and isinstance(n.value, ast.Name) and n.value.id == "html"
                           for n in nodes)
                if stores and uses:
                    bad.append(f"{path.name}:{fn.name}")
        self.assertEqual(bad, [])


if __name__ == "__main__":
    unittest.main()
