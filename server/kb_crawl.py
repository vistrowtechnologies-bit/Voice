"""Website URL crawling for the Knowledge Base "Add source from URL" flow.

Two operations: `scan(url)` fetches one page and returns the same-domain
links found on it (for the operator to bulk-select which pages to import),
and `fetch_page_text(url)` fetches one page and returns its visible text
(for actually importing it as a knowledge source).

Stdlib only (urllib + html.parser), same philosophy as kb_extract.py — this
server venv only ships fastapi+livekit-api, and a handful of page fetches
per operator click doesn't justify a scraping dependency.

Fetches are operator-supplied URLs executed server-side, so this validates
every hostname (including redirect targets) resolves to a public address —
without that check this endpoint would be an open SSRF proxy into the
server's own network.
"""

import ipaddress
import logging
import re
import socket
import urllib.error
import urllib.request
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

logger = logging.getLogger("kb-crawl")

REQUEST_TIMEOUT = 10
MAX_FETCH_BYTES = 2_000_000
MAX_DISCOVERED_LINKS = 60
USER_AGENT = "Mozilla/5.0 (compatible; VistrowVoiceBot/1.0; +https://vistrow.ai)"


def _assert_public_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("URL must start with http:// or https://")
    hostname = parsed.hostname
    if not hostname:
        raise ValueError("URL is missing a hostname")
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        raise RuntimeError(f"Could not resolve host: {hostname}") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            raise ValueError("That URL resolves to a private/internal address and can't be fetched")


class _SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Re-validates every redirect hop — otherwise a public URL that 302s to
    an internal address would slip the initial _assert_public_url check."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _assert_public_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_opener = urllib.request.build_opener(_SafeRedirectHandler)


def _fetch(url: str) -> str:
    _assert_public_url(url)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with _opener.open(request, timeout=REQUEST_TIMEOUT) as resp:
            raw = resp.read(MAX_FETCH_BYTES + 1)[:MAX_FETCH_BYTES]
            charset = resp.headers.get_content_charset() or "utf-8"
            return raw.decode(charset, errors="replace")
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"Server returned {exc.code} for {url}") from exc
    except (urllib.error.URLError, TimeoutError, socket.timeout) as exc:
        raise RuntimeError(f"Could not reach {url}: {exc.reason if hasattr(exc, 'reason') else exc}") from exc


class _PageParser(HTMLParser):
    """One pass over the HTML: collects <a href> targets for link discovery
    and visible text for content import, skipping script/style so the
    extracted text isn't full of JS/CSS noise."""

    _SKIP_TAGS = {"script", "style", "noscript", "template"}

    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []
        self.title = ""
        self._text_parts: list[str] = []
        self._skip_depth = 0
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in self._SKIP_TAGS:
            self._skip_depth += 1
        elif tag == "a":
            href = dict(attrs).get("href")
            if href:
                self.links.append(href)
        elif tag == "title":
            self._in_title = True

    def handle_endtag(self, tag: str) -> None:
        if tag in self._SKIP_TAGS and self._skip_depth > 0:
            self._skip_depth -= 1
        elif tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title += data
        if self._skip_depth == 0:
            stripped = data.strip()
            if stripped:
                self._text_parts.append(stripped)

    def text(self) -> str:
        return re.sub(r"[ \t]{2,}", " ", "\n".join(self._text_parts))


def scan(start_url: str) -> dict:
    """Fetch `start_url` and return every same-domain link found on it, so
    the operator can pick which pages to bulk-import as sources."""
    start_url = start_url.strip()
    parsed_start = urlparse(start_url)
    if parsed_start.scheme not in ("http", "https"):
        raise ValueError("URL must start with http:// or https://")
    html = _fetch(start_url)
    parser = _PageParser()
    parser.feed(html)

    seen = {start_url}
    pages = [{"url": start_url, "title": parser.title.strip() or start_url}]
    for href in parser.links:
        absolute = urljoin(start_url, href).split("#", 1)[0]
        parsed = urlparse(absolute)
        if parsed.scheme not in ("http", "https") or parsed.netloc != parsed_start.netloc:
            continue
        if absolute in seen:
            continue
        seen.add(absolute)
        pages.append({"url": absolute, "title": absolute})
        if len(pages) >= MAX_DISCOVERED_LINKS:
            break
    return {"baseUrl": start_url, "pages": pages}


def fetch_page_text(url: str) -> tuple[str, str]:
    """Fetch one URL and return (title, visible_text) to save as a source."""
    html = _fetch(url.strip())
    parser = _PageParser()
    parser.feed(html)
    return parser.title.strip() or url, parser.text()
