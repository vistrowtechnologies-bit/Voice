#!/usr/bin/env python3
"""Content audit of the prerendered marketing site (run after `npm run build`).

For every route in dist/sitemap.xml it reports main-content word count
(boilerplate removed), contextual inbound/outbound internal links, title and
description length, H1, JSON-LD types and fact flags. Usage:

    python3 scripts/audit-seo-content.py            # table to stdout
    python3 scripts/audit-seo-content.py --json out.json
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

from lxml import html as lh

DIST = Path(__file__).resolve().parent.parent / "dist"
ORIGIN = "https://www.vistrowvoice.com"

# Pattern -> flag label. Matches are reported for manual review; a flag is not
# automatically an error (e.g. "best" inside a buyer-guide title is a query).
FACT_PATTERNS = [
    ("lang-count", r"\b(?:99|52|50|100|130|132|87|103)\s*\+?\s*(?:languages|भाषा)"),
    ("whatsapp", r"whatsapp"),
    ("fb-lead-ads", r"facebook\s+lead|lead\s+ads|meta\s+lead"),
    ("google-calendar", r"google\s+calendar"),
    ("price", r"₹\s?[\d,]+|\b[\d,]+\s+credits?\b|\bcredits?\s*/\s*min|\d\s*credits?\s+(?:per|a|/)\s*min"),
    ("best-#1", r"#\s?1\b|\bnumber one\b|\bindia'?s best\b|\bthe best\b|\bworld'?s\b|\bleading\b"),
    ("stale-model", r"gpt-?4|gpt-?3|gemini\s*1\.|claude\s*[23]|llama"),
    ("scale", r"\b(?:unlimited|thousands of|lakhs? of|millions of|\d[\d,]*\+?\s+(?:concurrent|simultaneous|parallel))"),
]

APP_ROUTES = {"/login", "/signup", "/dashboard", "/forgot-password", "/reset-password", "/onboarding", "/admin"}


def route_file(route: str) -> Path:
    return DIST / "index.html" if route == "/" else DIST / route.lstrip("/") / "index.html"


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def norm_href(href: str) -> str | None:
    if href.startswith(ORIGIN):
        href = href[len(ORIGIN):] or "/"
    if not href.startswith("/") or href.startswith("//"):
        return None
    return href.split("#", 1)[0].split("?", 1)[0].rstrip("/") or "/"


def load():
    sitemap = (DIST / "sitemap.xml").read_text()
    routes = [norm_href(u) for u in re.findall(r"<loc>([^<]+)</loc>", sitemap)]
    pages = {}
    for r in routes:
        doc = lh.fromstring(route_file(r).read_bytes())
        pages[r] = doc
    return routes, pages


def block_texts(main) -> list:
    blocks = list(main) + main.findall(".//section")
    return [(b, norm(b.text_content())) for b in blocks]


def audit():
    routes, pages = load()
    route_set = set(routes)
    # Boilerplate: a main-content block whose exact text repeats on 4+ pages.
    freq: Counter = Counter()
    for r, doc in pages.items():
        main = doc.find(".//main")
        if main is None:
            continue
        seen = {t for _, t in block_texts(main) if len(t) > 20}
        freq.update(seen)

    rows = {}
    inbound_body = defaultdict(set)
    inbound_related = defaultdict(set)
    broken = defaultdict(set)
    for r, doc in pages.items():
        title = norm(doc.findtext(".//title") or "")
        desc_el = doc.find('.//meta[@name="description"]')
        desc = desc_el.get("content", "") if desc_el is not None else ""
        h1s = [norm(h.text_content()) for h in doc.iter("h1")]
        schema = []
        for s in doc.findall('.//script[@type="application/ld+json"]'):
            try:
                data = json.loads(s.text or "{}")
            except json.JSONDecodeError:
                schema.append("INVALID")
                continue
            items = data.get("@graph", [data]) if isinstance(data, dict) else data
            for it in items:
                t = it.get("@type") if isinstance(it, dict) else None
                schema.extend(t if isinstance(t, list) else [t] if t else [])
        for a in doc.iter("a"):
            t = norm_href(a.get("href", ""))
            if t and t not in route_set and not any(t == p or t.startswith(p + "/") for p in APP_ROUTES):
                if not re.search(r"\.(png|jpe?g|svg|webp|mp4|xml|txt|pdf|ico)$", t):
                    broken[r].add(t)
        main = doc.find(".//main")
        body_out, related_out, words, text = set(), set(), 0, ""
        for nav in doc.findall('.//nav[@aria-label="Related pages"]'):
            for a in nav.iter("a"):
                t = norm_href(a.get("href", ""))
                if t in route_set and t != r:
                    related_out.add(t)
            nav.getparent().remove(nav)
        full_text = " ".join([title, desc] + [norm(x.text or "") for x in doc.findall('.//script[@type="application/ld+json"]')]
                             + ([norm(main.text_content())] if main is not None else []))
        if main is not None:
            for b, t in sorted(block_texts(main), key=lambda x: -len(x[1])):
                if len(t) > 20 and freq[t] >= 4 and b.getparent() is not None and b is not main:
                    b.getparent().remove(b)
            for a in main.iter("a"):
                t = norm_href(a.get("href", ""))
                if t in route_set and t != r:
                    body_out.add(t)
            text = norm(main.text_content())
            words = len(text.split())
        for t in body_out:
            inbound_body[t].add(r)
        for t in related_out:
            inbound_related[t].add(r)
        flags = {}
        for label, pat in FACT_PATTERNS:
            hits = sorted({norm(m.group(0)).lower() for m in re.finditer(pat, full_text, re.I)})
            if hits:
                flags[label] = hits
        rows[r] = dict(route=r, words=words, title=title, title_len=len(title), desc_len=len(desc),
                       h1=h1s[0] if h1s else "", h1_count=len(h1s), schema=sorted(set(schema)),
                       out_body=sorted(body_out), out_related=sorted(related_out), flags=flags)
    for r, row in rows.items():
        row["in_body"] = sorted(inbound_body[r])
        row["in_related"] = sorted(inbound_related[r])
        row["in_ctx"] = sorted(inbound_body[r] | inbound_related[r])
        row["out_ctx"] = sorted(set(row["out_body"]) | set(row["out_related"]))
        row["broken"] = sorted(broken[r])
    return rows


def kind_of(route: str) -> str:
    if route == "/":
        return "home"
    if route.startswith("/resources/blog/"):
        return "blog"
    if route.startswith("/help"):
        return "help"
    if route in {"/privacy", "/terms", "/security", "/contact", "/careers", "/changelog", "/about"}:
        return "company"
    if route.startswith("/demo-calls/"):
        return "demo"
    if route in {"/resources/blog", "/resources/docs", "/help", "/demo-calls"}:
        return "index"
    return "marketing"


MIN_WORDS = {"home": 700, "marketing": 700, "blog": 900}


def main():
    rows = audit()
    if "--json" in sys.argv:
        Path(sys.argv[sys.argv.index("--json") + 1]).write_text(json.dumps(rows, indent=1, ensure_ascii=False))
    thin = [r for r, x in rows.items() if x["words"] < MIN_WORDS.get(kind_of(r), 0)]
    few_in = [r for r, x in rows.items() if r != "/" and len(x["in_ctx"]) < 3]
    few_out = [r for r, x in rows.items() if len(x["out_ctx"]) < 3]
    orphans = [r for r, x in rows.items() if r != "/" and not x["in_ctx"]]
    body_orphans = [r for r, x in rows.items() if r != "/" and not x["in_body"]]
    print("| Route | Type | Words | In (body/related) | Out (body/related) | Title | Desc | Schema | Flags |")
    print("|---|---|---:|---:|---:|---:|---:|---|---|")
    for r, x in rows.items():
        flags = "; ".join(f"{k}: {', '.join(v[:4])}" for k, v in x["flags"].items())
        print(f"| {r} | {kind_of(r)} | {x['words']} | {len(x['in_body'])}/{len(x['in_related'])} | "
              f"{len(x['out_body'])}/{len(x['out_related'])} | {x['title_len']} | {x['desc_len']} | "
              f"{', '.join(x['schema'])} | {flags} |")
    print()
    print(f"routes={len(rows)} thin={len(thin)} inbound<3={len(few_in)} outbound<3={len(few_out)} "
          f"orphans(any contextual)={len(orphans)} orphans(body only)={len(body_orphans)}")
    print("thin:", ", ".join(f"{r}({rows[r]['words']})" for r in thin))
    print("inbound<3:", ", ".join(few_in))
    print("outbound<3:", ", ".join(few_out))
    print("body-orphans:", ", ".join(body_orphans))
    for r, x in rows.items():
        if x["broken"]:
            print("unregistered link targets on", r, x["broken"])
        if x["h1_count"] != 1:
            print("H1 count", r, x["h1_count"])


if __name__ == "__main__":
    main()
