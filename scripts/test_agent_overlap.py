"""Claim parsing in agent_overlap.py. Run: python3 -m pytest scripts/test_agent_overlap.py"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import agent_overlap  # noqa: E402


def _claims(monkeypatch, body: str) -> list[dict]:
    comment = json.dumps({"body": body, "created_at": "2099-01-01T00:00:00Z", "user": "x"})
    monkeypatch.setattr(agent_overlap, "_gh", lambda args: comment + "\n")
    monkeypatch.setattr(agent_overlap, "finished_branches", lambda: (set(), set()))
    return agent_overlap.open_claims(include_stale=True)


def test_claim_names_mjs_and_other_script_files(monkeypatch):
    body = ("[CLAIM] claude · branch claude/x · web-demo/scripts/prerender.mjs (sitemapXml), "
            "web-demo/scripts/build.cjs, web-demo/src/App.jsx, docs/sheet.gs, docs/notes.txt · goal")
    [claim] = _claims(monkeypatch, body)
    assert claim["files"] == {"web-demo/scripts/prerender.mjs", "web-demo/scripts/build.cjs",
                              "web-demo/src/App.jsx", "docs/sheet.gs", "docs/notes.txt"}
    assert claim["dirs"] == set()


def test_existing_extensions_and_folders_still_parse(monkeypatch):
    body = "[CLAIM] claude · branch claude/y · web-demo/vercel.json, server/calls_db.py, web-demo/content-queue/blog/ · goal"
    [claim] = _claims(monkeypatch, body)
    assert claim["files"] == {"web-demo/vercel.json", "server/calls_db.py"}
    assert claim["dirs"] == {"web-demo/content-queue/blog/"}
