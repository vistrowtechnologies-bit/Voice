#!/usr/bin/env python3
"""Claude Code PreToolUse hook: stop one session from editing another's files.

Runs before every Edit/Write/MultiEdit/NotebookEdit in every session that has
this repo's .claude/settings.json. It blocks (exit 2, reason on stderr, which
Claude sees) when:

  1. another branch has an open PR or an open [CLAIM] on issue #2 touching
     the file (same data as scripts/agent_overlap.py), or
  2. the file belongs to another session's lane in .claude/lanes.json, this
     session declared its lane(s) in .claude/lane.local, and this branch has
     no open [CLAIM] naming the file.

The block message names the owner and says how to ask them for the change.
Anything it cannot check (no gh, no network, file outside the repo) is allowed:
the guard must never stop work because of its own failure.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

CACHE = Path(os.environ.get("TMPDIR", "/tmp")) / "vistrow-edit-guard-cache.json"
CACHE_SECONDS = 180


def _allow(note: str = "") -> None:
    if note:
        print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
                                                 "additionalContext": note}}))
    sys.exit(0)


def _block(reason: str) -> None:
    print(reason, file=sys.stderr)
    sys.exit(2)


def _git(cwd: str, *args: str) -> str:
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True,
                          timeout=10).stdout.strip()


def _overlap_data(root: Path) -> list[dict]:
    """Open PRs + open claims, cached for a few minutes across all sessions."""
    try:
        cached = json.loads(CACHE.read_text())
        if time.time() - cached["at"] < CACHE_SECONDS:
            return cached["entries"]
    except Exception:
        pass
    sys.path.insert(0, str(root / "scripts"))
    import agent_overlap  # noqa: E402  (same repo, loaded lazily)

    entries = agent_overlap.open_prs() + agent_overlap.open_claims()
    plain = [{"who": e["who"], "branch": e["branch"], "branches": sorted(e.get("branches", [])),
              "files": sorted(e["files"]), "dirs": sorted(e["dirs"])} for e in entries]
    try:
        CACHE.write_text(json.dumps({"at": time.time(), "entries": plain}))
    except Exception:
        pass
    return plain


def _hits(rel: str, entry: dict) -> bool:
    return rel in entry["files"] or any(rel.startswith(d) for d in entry["dirs"])


def _owner_lane(rel: str, lanes: dict) -> tuple[str, dict] | None:
    best = None
    for name, lane in lanes.items():
        for p in lane.get("paths", []):
            if rel == p or rel.startswith(p):
                if best is None or len(p) > best[0]:
                    best = (len(p), name, lane)
    return (best[1], best[2]) if best else None


def main() -> None:
    try:
        event = json.load(sys.stdin)
    except Exception:
        _allow()
    tool_input = event.get("tool_input") or {}
    target = tool_input.get("file_path") or tool_input.get("notebook_path")
    if not target:
        _allow()
    target_path = Path(target).resolve()
    start = target_path.parent if target_path.parent.exists() else Path(event.get("cwd") or os.getcwd())
    try:
        root = Path(_git(str(start), "rev-parse", "--show-toplevel"))
        branch = _git(str(root), "rev-parse", "--abbrev-ref", "HEAD")
    except Exception:
        _allow()  # not inside a git checkout (scratch files etc.)
    try:
        rel = target_path.relative_to(root.resolve()).as_posix()
    except ValueError:
        _allow()

    lanes_doc = {}
    try:
        lanes_doc = json.loads((root / ".claude" / "lanes.json").read_text())
    except Exception:
        pass
    if any(rel == s or rel.startswith(s) for s in lanes_doc.get("shared", [])):
        _allow()

    try:
        entries = _overlap_data(root)
    except Exception:
        _allow()  # cannot reach GitHub: never block on our own failure

    mine = lambda e: e["branch"] == branch or branch in e.get("branches", [])
    # 1. Another branch's open PR or claim touches this file.
    others = [e for e in entries if not mine(e) and _hits(rel, e)]
    if others:
        who = "; ".join(e["who"] for e in others[:3])
        _block(
            f"Edit blocked: {rel} is being changed by {who}.\n"
            "Do not edit it from this branch. Ask the owner on issue #2 with "
            "[QUESTION] @<agent>, or send that session a request (SendMessage to its name), "
            "and wait for their [DONE] before touching this file."
        )

    # 2. Lane ownership.
    lanes = lanes_doc.get("lanes", {})
    owner = _owner_lane(rel, lanes)
    if not owner:
        _allow()
    owner_name, owner_lane = owner
    try:
        my_lanes = {l.strip() for l in (root / ".claude" / "lane.local").read_text().split(",") if l.strip()}
    except Exception:
        my_lanes = set()
    if not my_lanes:
        _allow(f"Lane note: {rel} belongs to the '{owner_name}' lane (session "
               f"\"{owner_lane.get('session')}\"). This checkout has no .claude/lane.local, so the lane "
               "rule is not enforced here; if this is not your lane, send that session a request instead "
               "of editing.")
    if owner_name in my_lanes:
        _allow()
    claimed_by_me = any(mine(e) and _hits(rel, e) for e in entries)
    if claimed_by_me:
        _allow()
    session = owner_lane.get("session", owner_name)
    _block(
        f"Edit blocked: {rel} is in the '{owner_name}' lane, owned by the session \"{session}\".\n"
        f"Your lane(s): {', '.join(sorted(my_lanes))}. Do not edit it yourself. Instead:\n"
        f"  1. SendMessage to \"{session}\" describing exactly what to change and why, and\n"
        f"  2. post a [REQUEST] @{owner_name} comment on issue #2 with the same text.\n"
        "If the owner explicitly approved you doing it, post a [CLAIM] naming this file for your "
        "branch on issue #2 first, then retry (claims refresh within 3 minutes)."
    )


if __name__ == "__main__":
    main()
