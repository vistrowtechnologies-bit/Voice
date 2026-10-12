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

import http.client
import ipaddress
import logging
import re
import socket
import ssl
import urllib.error
import urllib.request
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

logger = logging.getLogger("kb-crawl")

REQUEST_TIMEOUT = 10
MAX_FETCH_BYTES = 2_000_000
MAX_DISCOVERED_LINKS = 60
USER_AGENT = "Mozilla/5.0 (compatible; VistrowVoiceBot/1.0; +https://vistrow.ai)"


_PRIVATE_ADDRESS = "That URL resolves to a private/internal address and can't be fetched"


def _is_public_ip(value: str) -> bool:
    ip = ipaddress.ip_address(value.split("%", 1)[0])
    if ip.version == 6 and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return not (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved
                or ip.is_multicast or ip.is_unspecified)


def _assert_public_url(url: str) -> None:
    """Cheap up-front check of the URL's shape (and of a literal IP host).
    The DNS check happens when connecting, in _pinned_create_connection, so
    the address that is checked is the one actually used."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("URL must start with http:// or https://")
    hostname = parsed.hostname
    if not hostname:
        raise ValueError("URL is missing a hostname")
    try:
        literal = ipaddress.ip_address(hostname)
    except ValueError:
        return
    if not _is_public_ip(str(literal)):
        raise ValueError(_PRIVATE_ADDRESS)


def _public_ip(host: str, port) -> str:
    """Resolve once; refuse if any address is internal; return the first."""
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise RuntimeError(f"Could not resolve host: {host}") from exc
    if not infos:
        raise RuntimeError(f"Could not resolve host: {host}")
    for info in infos:
        if not _is_public_ip(info[4][0]):
            raise ValueError(_PRIVATE_ADDRESS)
    return infos[0][4][0]


def _pinned_create_connection(address, timeout=socket._GLOBAL_DEFAULT_TIMEOUT, source_address=None):
    """Connects to the exact IP that passed the check, closing the DNS
    rebinding gap of "check, then let the HTTP client resolve again"."""
    host, port = address
    return socket.create_connection((_public_ip(host, port), port), timeout, source_address)


class _PinnedHTTPConnection(http.client.HTTPConnection):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._create_connection = _pinned_create_connection


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    """Same pinning; TLS still uses the hostname (self.host) for SNI and
    certificate verification, and the Host header is unchanged."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._create_connection = _pinned_create_connection


class _PinnedHTTPHandler(urllib.request.HTTPHandler):
    def http_open(self, req):
        return self.do_open(_PinnedHTTPConnection, req)


class _PinnedHTTPSHandler(urllib.request.HTTPSHandler):
    def https_open(self, req):
        return self.do_open(_PinnedHTTPSConnection, req, context=self._context)


class _SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Checks every redirect hop's URL; the hop's connection is then pinned
    and DNS-checked like the first one."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _assert_public_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def safe_opener() -> urllib.request.OpenerDirector:
    """urllib opener for user-supplied URLs: no environment proxies (the
    pinned connection must go to the target itself), every connection pinned
    to a checked public IP, every redirect hop re-checked."""
    return urllib.request.build_opener(
        urllib.request.ProxyHandler({}),
        _PinnedHTTPHandler(),
        _PinnedHTTPSHandler(context=ssl.create_default_context()),
        _SafeRedirectHandler(),
    )


_opener = safe_opener()


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
