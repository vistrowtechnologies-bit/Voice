#!/usr/bin/env python3
"""Warn before two agent sessions edit the same files.

Several Claude and Codex sessions work on this repo at once. Each one claims
files on the agent bridge issue (#2) and opens PRs; nothing stops a second
session from editing a file the first one is still changing. This script
compares the files you are about to touch with:

  * every open PR's changed files, and
  * every open [CLAIM] on issue #2 (one without a later [DONE] for its branch).

Usage (run from the repo root; needs the GitHub CLI `gh`, logged in):

  python3 scripts/agent_overlap.py                  # this branch's changes vs origin/main
  python3 scripts/agent_overlap.py --files agent/main.py server/calls_db.py
                                                     # files you plan to edit (before claiming)
  python3 scripts/agent_overlap.py --all            # every overlap between open PRs/claims

Exit code: 0 = no overlap, 1 = overlap found, 2 = could not check.
docs/AGENT-MESSAGE-BOX.md and graphify-out/ are ignored: every session edits them.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone

REPO = "vistrowtechnologies-bit/Voice"
BRIDGE_ISSUE = 2
IGNORED_PREFIXES = ("docs/AGENT-MESSAGE-BOX.md", "graphify-out/")
STALE_CLAIM_HOURS = 72
# Large shared files where even edits in different functions often conflict.
HOT_FILES = {"agent/main.py", "agent/tools.py", "server/calls_db.py", "server/token_api.py"}

_PATH_RE = re.compile(r"(?<![\w/.-])((?:[\w.-]+/)+[\w.-]*\.(?:py|tsx|ts|mts|jsx|js|mjs|cjs|md|json|toml|css|html|sql|sh|yml|yaml|gs|txt)|(?:[\w.-]+/)+)(?![\w/-])")
_BRANCH_RE = re.compile(r"\b((?:claude|codex)/[\w./-]+?)(?=[`'\")\s,;:·]|$)")


def _gh(args: list[str]) -> str:
    try:
        return subprocess.run(["gh", *args], check=True, capture_output=True, text=True).stdout
    except FileNotFoundError:
        print("agent_overlap: the GitHub CLI `gh` is not installed.", file=sys.stderr)
        sys.exit(2)
    except subprocess.CalledProcessError as exc:
        print(f"agent_overlap: gh {' '.join(args[:3])} failed: {exc.stderr.strip()}", file=sys.stderr)
        sys.exit(2)


def _git(args: list[str]) -> str:
    return subprocess.run(["git", *args], check=True, capture_output=True, text=True).stdout


def _ignored(path: str) -> bool:
    return path.startswith(IGNORED_PREFIXES)


def open_prs() -> list[dict]:
    raw = _gh(["pr", "list", "--repo", REPO, "--state", "open", "--limit", "100",
               "--json", "number,headRefName,title,files"])
    prs = []
    for pr in json.loads(raw or "[]"):
        files = {f["path"] for f in pr.get("files") or [] if not _ignored(f["path"])}
        prs.append({"who": f"PR #{pr['number']} ({pr['headRefName']})", "branch": pr["headRefName"],
                    "files": files, "dirs": set()})
    return prs


def finished_branches() -> set[str]:
    """Branches whose work is over: a merged or closed PR, or deleted from origin."""
    raw = _gh(["pr", "list", "--repo", REPO, "--state", "all", "--limit", "500",
               "--json", "headRefName,state"])
    done = {pr["headRefName"] for pr in json.loads(raw or "[]") if pr["state"] in ("MERGED", "CLOSED")}
    live = {line.split("refs/heads/", 1)[1] for line in _git(["ls-remote", "--heads", "origin"]).splitlines()
            if "refs/heads/" in line}
    open_pr = {pr["headRefName"] for pr in json.loads(raw or "[]") if pr["state"] == "OPEN"}
    return done - open_pr, live


def open_claims(include_stale: bool = False) -> list[dict]:
    finished, live = finished_branches()
    raw = _gh(["api", f"repos/{REPO}/issues/{BRIDGE_ISSUE}/comments", "--paginate",
               "--jq", ".[] | {body, created_at, user: .user.login}"])
    comments = [json.loads(line) for line in raw.splitlines() if line.strip()]
    done_text = []  # (time, text) of every [DONE]
    claims = []
    for c in comments:
        body = (c.get("body") or "").strip()
        when = datetime.fromisoformat(c["created_at"].replace("Z", "+00:00"))
        if body.startswith("[DONE]"):
            done_text.append((when, body))
        elif body.startswith("[CLAIM]"):
            branches = sorted(set(_BRANCH_RE.findall(body)))
            paths = {p for p in _PATH_RE.findall(body) if not _ignored(p)}
            claims.append({"when": when, "branches": branches, "body": body,
                           "files": {p for p in paths if not p.endswith("/")},
                           "dirs": {p for p in paths if p.endswith("/")}})
    now = datetime.now(timezone.utc)
    out = []
    for cl in claims:
        # A claim is closed once a later [DONE] names one of its branches.
        closed = any(t > cl["when"] and any(b in text for b in cl["branches"]) for t, text in done_text)
        # Also over when every claimed branch has a merged/closed PR, or was
        # pushed once and is now deleted from origin.
        closed = closed or all(b in finished for b in cl["branches"])
        age_h = (now - cl["when"]).total_seconds() / 3600
        if closed or not cl["branches"] or (age_h > STALE_CLAIM_HOURS and not include_stale):
            continue
        label = ", ".join(cl["branches"])
        stale = f", claimed {age_h:.0f} h ago, may be stale" if age_h > STALE_CLAIM_HOURS else ""
        out.append({"who": f"claim on #{BRIDGE_ISSUE} ({label}{stale})", "branch": cl["branches"][0],
                    "branches": set(cl["branches"]), "files": cl["files"], "dirs": cl["dirs"]})
    return out


def _hits(files: set[str], other: dict) -> set[str]:
    hits = files & other["files"]
    hits |= {f for f in files for d in other["dirs"] if f.startswith(d)}
    return hits


def _mine(entry: dict, my_branch: str) -> bool:
    return my_branch and (entry["branch"] == my_branch or my_branch in entry.get("branches", set()))


def current_branch_files() -> tuple[str, set[str]]:
    branch = _git(["rev-parse", "--abbrev-ref", "HEAD"]).strip()
    _git(["fetch", "-q", "origin", "main"])
    base = _git(["merge-base", "HEAD", "origin/main"]).strip()
    changed = _git(["diff", "--name-only", base]).split()
    untracked = _git(["ls-files", "--others", "--exclude-standard"]).split()
    return branch, {f for f in [*changed, *untracked] if not _ignored(f)}


def report(files: set[str], my_branch: str, others: list[dict]) -> int:
    found = False
    for other in others:
        if _mine(other, my_branch):
            continue
        hits = _hits(files, other)
        if hits:
            found = True
            print(f"OVERLAP with {other['who']}:")
            for f in sorted(hits):
                print(f"   {f}{'   (large shared file: coordinate on #2 first)' if f in HOT_FILES else ''}")
    if not found:
        print(f"No overlap: {len(files)} file(s) checked against {len(others)} open PR(s)/claim(s).")
    return 1 if found else 0


def report_all(entries: list[dict]) -> int:
    found = False
    for i, a in enumerate(entries):
        for b in entries[i + 1:]:
            if a["branch"] == b["branch"] or a["branch"] in b.get("branches", set()):
                continue
            hits = _hits(a["files"], b) | _hits(b["files"], a)
            if hits:
                found = True
                print(f"OVERLAP {a['who']}  <->  {b['who']}:")
                for f in sorted(hits):
                    print(f"   {f}")
    if not found:
        print(f"No overlaps among {len(entries)} open PR(s)/claim(s).")
    return 1 if found else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--files", nargs="+", help="files you plan to edit (default: this branch's changes)")
    ap.add_argument("--all", action="store_true", help="list every overlap between open PRs and claims")
    ap.add_argument("--include-stale", action="store_true",
                    help=f"also show claims older than {STALE_CLAIM_HOURS} h with no [DONE]")
    ap.add_argument("--branch", help="your branch name, excluded from the comparison (default: current)")
    args = ap.parse_args()

    entries = open_prs() + open_claims(args.include_stale)
    if args.all:
        return report_all(entries)
    if args.files:
        my_branch = args.branch or _git(["rev-parse", "--abbrev-ref", "HEAD"]).strip()
        files = {f for f in args.files if not _ignored(f)}
    else:
        my_branch, files = current_branch_files()
        my_branch = args.branch or my_branch
    if not files:
        print("No files to check (nothing changed on this branch yet). Pass --files to check a plan.")
        return 0
    return report(files, my_branch, entries)


if __name__ == "__main__":
    sys.exit(main())
