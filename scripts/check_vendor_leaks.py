"""Scan built web files (or saved API responses) for leaked vendor names and ids.

Customer-facing names are vendor-neutral (Bharat, Vistrow HD, Studio, Vistrow
Live). Ravan leaked its whole vendor map through a JSON field on 24 Oct 2026,
and our own public JS chunks carried `sarvam/sarvam-105b-conversations`,
`gemini-live:...`, `elevenlabs:<id>` and vendor prefix checks. This script
finds both kinds of leak:

- internal ids: vendor model/voice identifiers. Never legitimate in anything a
  tenant or visitor can download, so no allowlist applies.
- vendor names: words like "Sarvam" or "OpenAI". These are legitimate in a few
  places (privacy sub-processor list, competitor comparison pages, the EnableX
  help text), listed in scripts/vendor_leak_allowlist.txt.

Usage:
    python3 scripts/check_vendor_leaks.py web-demo/dist            # report only
    python3 scripts/check_vendor_leaks.py web-demo/dist --strict   # exit 1 on leaks

Report-only is the default so the required web-build check cannot fail until
the server and dashboard stop shipping internal ids. With GITHUB_STEP_SUMMARY
set, the report is also written to the CI job summary.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

SCANNED_SUFFIXES = {".js", ".mjs", ".html", ".json", ".css", ".txt", ".xml"}

# Vendor model/voice identifiers as they appear in our code and API payloads.
INTERNAL_ID_PATTERNS = [
    r"sarvam/sarvam-[\w.-]+",
    r"\bsarvam4:",
    r"\bgoogle:chirp3",
    r"\bgoogle3[18](?:flash)?:",
    r"\belevenlabs(?:-v3)?:",
    r"\bgemini-live\b",
    r"\bgemini-\d+(?:\.\d+)?-(?:flash|pro|live)[\w.-]*",
    r"\bgpt-\d+(?:\.\d+)?(?:-[a-z]+)?\b",
    r"\bgpt-4o[\w-]*",
    r"\bgroq/",
    r"\bchirp_3\b",
    r"\bsaaras(?::v\d)?\b",
    r"\bbulbul(?::v\d)?\b",
    r"\beleven_(?:flash|multilingual|turbo)[\w]*",
]

VENDOR_NAMES = [
    "Sarvam", "ElevenLabs", "Eleven Labs", "Gemini", "OpenAI", "Chirp", "Bulbul",
    "Groq", "Deepgram", "Cartesia", "Murf", "Soniox", "Boson", "Anthropic",
]

_ID_RE = re.compile("|".join(INTERNAL_ID_PATTERNS), re.IGNORECASE)
_NAME_RE = re.compile(r"\b(" + "|".join(re.escape(n) for n in VENDOR_NAMES) + r")\b")
CONTEXT = 70


def load_allowlist(path: Path) -> list[re.Pattern]:
    if not path.exists():
        return []
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            out.append(re.compile(line, re.IGNORECASE))
    return out


def _snippet(text: str, start: int, end: int) -> str:
    return text[max(0, start - CONTEXT):end + CONTEXT].replace("\n", " ")


def scan_text(text: str, allowlist: list[re.Pattern]) -> tuple[list[str], list[str]]:
    """Return (internal-id snippets, non-allowlisted vendor-name snippets)."""
    ids = [_snippet(text, m.start(), m.end()) for m in _ID_RE.finditer(text)]
    names = []
    for m in _NAME_RE.finditer(text):
        snip = _snippet(text, m.start(), m.end())
        if not any(rx.search(snip) for rx in allowlist):
            names.append(snip)
    return ids, names


def scan_paths(paths: list[Path], allowlist: list[re.Pattern]) -> dict[str, tuple[list[str], list[str]]]:
    results = {}
    for root in paths:
        files = [root] if root.is_file() else sorted(p for p in root.rglob("*") if p.is_file())
        for f in files:
            if f.suffix.lower() not in SCANNED_SUFFIXES or f.name.endswith(".map"):
                continue
            ids, names = scan_text(f.read_text(encoding="utf-8", errors="ignore"), allowlist)
            if any(rx.search(f.as_posix()) for rx in allowlist):
                names = []  # whole file allowlisted (e.g. prerendered /compare/ pages); ids still count
            if ids or names:
                results[str(f)] = (ids, names)
    return results


def render(results: dict[str, tuple[list[str], list[str]]], limit: int = 5) -> str:
    n_ids = sum(len(i) for i, _ in results.values())
    n_names = sum(len(n) for _, n in results.values())
    lines = ["## Vendor leak check", "",
             f"Internal vendor ids: **{n_ids}** · vendor names outside the allowlist: **{n_names}**", ""]
    for f, (ids, names) in results.items():
        lines.append(f"### `{f}` — {len(ids)} ids, {len(names)} names")
        for s in ids[:limit]:
            lines.append(f"- id: `{s}`")
        for s in names[:limit]:
            lines.append(f"- name: `{s}`")
        lines.append("")
    if not results:
        lines.append("No leaks found.")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("paths", nargs="+", type=Path, help="built dist folder(s) or saved API response files")
    ap.add_argument("--strict", action="store_true", help="exit 1 when anything is found")
    ap.add_argument("--allowlist", type=Path,
                    default=Path(__file__).with_name("vendor_leak_allowlist.txt"))
    args = ap.parse_args(argv)
    missing = [p for p in args.paths if not p.exists()]
    if missing:
        print(f"not found: {', '.join(map(str, missing))}", file=sys.stderr)
        return 2
    results = scan_paths(args.paths, load_allowlist(args.allowlist))
    report = render(results)
    print(report)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as fh:
            fh.write(report + "\n")
    return 1 if (args.strict and results) else 0


if __name__ == "__main__":
    sys.exit(main())
