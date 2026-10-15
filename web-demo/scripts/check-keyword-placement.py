#!/usr/bin/env python3
"""Keyword placement check for the prerendered marketing pages.

For each target keyword (Google Keyword Planner, India monthly searches, or a
Search Console query) and the one page meant to rank for it, report whether
the keyword appears in the <title>, the H1, the meta description, the first
~150 words of visible copy, any H2/H3, and how often it appears in the body.

Reads the local build (web-demo/dist) by default; run `npm run build` first.
Pass --live to check https://www.vistrowvoice.com instead.

    python3 web-demo/scripts/check-keyword-placement.py [--live] [--strict]

--strict exits 1 when a keyword is missing from title-or-H1, the description,
the opening copy or the H2/H3s, or appears fewer than 2 times in the body.
Keywords marked KEEP_TITLE are on pages whose title and H1 are deliberately
kept (language pages, the AI IVR H1, the home title); for those the title/H1
column is reported but not required. Body counts are substring counts, so a
short keyword ("ai calling") also counts every longer one that contains it.
"""
import html
import pathlib
import re
import sys
import urllib.request

LIVE_ORIGIN = 'https://www.vistrowvoice.com'
DIST = pathlib.Path(__file__).resolve().parent.parent / 'dist'

KEEP_TITLE = {
    'ivr call',
    'ai voice calling agent',
    'ai voice agent in hindi',
    'ai calling agent in hindi',
    'ai voice calling agent in kannada',
    'ai voice calling agent in telugu',
}

# keyword, target page, source / volume band
KEYWORDS = [
    ('ai voice agent', '/', '1K-10K'),
    ('voice ai platform', '/voice-ai-platform', '1K-10K'),
    ('ai calling agent', '/ai-calling-agent', '1K-10K'),
    ('ai calling', '/ai-calling-agent', '1K-10K'),
    ('ai receptionist', '/ai-receptionist', '1K-10K'),
    ('ivr system', '/ai-ivr', '1K-10K'),
    ('interactive voice response', '/resources/blog/what-is-ivr-interactive-voice-response', '10K-100K'),
    ('ivr', '/ai-ivr', '10K-100K'),
    ('ivr call', '/ai-ivr', '1K-10K'),
    ('ai ivr', '/ai-ivr', 'GSC'),
    ('cloud ivr', '/ai-ivr', '100-1K'),
    ('ai call center', '/ai-call-center', '100-1K'),
    ('call center automation', '/ai-call-center', '100-1K'),
    ('ai telecaller', '/ai-telecaller', '100-1K'),
    ('voice bot', '/voice-bot', '100-1K'),
    ('ai voice bot', '/voice-bot', '100-1K'),
    ('automated calling software', '/ai-calling-agent', '100-1K'),
    ('ivr service provider', '/resources/blog/how-to-choose-an-ivr-service-provider-india', '100-1K'),
    ('ivr in banking', '/resources/blog/ivr-in-banking-and-finance', '100-1K'),
    ('ai voice agent for india', '/', '100-1K'),
    ('ai voice calling agent', '/', '100-1K'),
    ('ai voice agent in hindi', '/languages/hindi', '10-100'),
    ('ai calling agent in hindi', '/languages/hindi', '10-100'),
    ('ai voice calling agent in kannada', '/languages/kannada', 'GSC'),
    ('ai voice calling agent in telugu', '/languages/telugu', 'GSC'),
    ('ivr vs ai', '/vs-ivr', 'GSC'),
    ('exotel', '/compare/exotel', '10K-100K'),
    ('ozonetel', '/compare/ozonetel', '10K-100K'),
    ('knowlarity', '/compare/knowlarity', '1K-10K'),
    ('retell ai', '/compare/retell-ai', '10K-100K'),
    ('bland ai', '/compare/bland-ai', '1K-10K'),
    ('ai calling software', '/best-ai-voice-calling-software-india', 'GSC'),
    ('inbound call', '/product/inbound', 'GSC'),
]


def fetch(path, live):
    if live:
        return urllib.request.urlopen(LIVE_ORIGIN + path).read().decode('utf-8', 'ignore')
    f = DIST / path.strip('/') / 'index.html' if path != '/' else DIST / 'index.html'
    return f.read_text(encoding='utf-8') if f.exists() else ''


def norm(x):
    # Lower-case, unescape entities and fold curly apostrophes / nbsp so the
    # keyword matches the way a reader sees the text.
    x = html.unescape(x).lower().replace('’', "'").replace(' ', ' ')
    return re.sub(r'\s+', ' ', x)


def strip_tags(x):
    return re.sub(r'<[^>]+>', ' ', x)


def analyse(src):
    title = re.search(r'<title>(.*?)</title>', src, re.S)
    desc = re.search(r'name="description"\s+content="([^"]*)"', src)
    h1 = re.search(r'<h1[^>]*>(.*?)</h1>', src, re.S)
    heads = re.findall(r'<h[23][^>]*>(.*?)</h[23]>', src, re.S)
    body = re.sub(
        r'<script[\s\S]*?</script>|<style[\s\S]*?</style>|<header[\s\S]*?</header>'
        r'|<footer[\s\S]*?</footer>|<nav[\s\S]*?</nav>|<head[\s\S]*?</head>',
        '', src)
    text = norm(strip_tags(body))
    return {
        'title': norm(title.group(1)) if title else '',
        'h1': norm(strip_tags(h1.group(1))) if h1 else '',
        'desc': norm(desc.group(1)) if desc else '',
        'heads': norm(' | '.join(strip_tags(h) for h in heads)),
        'text': text,
        'first': ' '.join(text.split()[:150]),
    }


def main():
    live = '--live' in sys.argv
    strict = '--strict' in sys.argv
    cache = {}
    gaps = 0
    print(f"{'keyword':36}{'vol':10}{'page':50} T H1 D 1st H2 body")
    for kw, path, vol in KEYWORDS:
        if path not in cache:
            cache[path] = analyse(fetch(path, live))
        a = cache[path]
        k = kw.lower()
        t, h, d, f, h2 = (k in a['title'], k in a['h1'], k in a['desc'], k in a['first'], k in a['heads'])
        n = a['text'].count(k)
        yn = lambda b: 'Y' if b else '-'
        ok = (t or h or kw in KEEP_TITLE) and d and f and h2 and n >= 2
        gaps += 0 if ok else 1
        flag = '  <- gap' if not ok else ('  (title/H1 kept)' if not (t or h) else '')
        print(f"{kw:36}{vol:10}{path[:49]:50} {yn(t)} {yn(h):2} {yn(d)} {yn(f):3} {yn(h2):2} {n}{flag}")
    print(f"\n{len(KEYWORDS) - gaps}/{len(KEYWORDS)} keywords fully placed")
    if strict and gaps:
        sys.exit(1)


if __name__ == '__main__':
    main()
