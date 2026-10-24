"""aiohttp sessions for customer-supplied URLs (webhooks, custom functions,
integration endpoints) that can only reach public addresses.

The server already refuses private targets for its own deliveries
(server/kb_crawl.py: _assert_public_url + a pinned urllib opener). The agent
posted to the same kind of URLs with a plain aiohttp session, so a URL such
as http://169.254.169.254/ or http://10.0.0.5/ was fetched from inside the
agent's network (Codex cross-check, 24 Oct 2026).

The check sits in the connector's host lookup, which aiohttp runs for every
connection, including each redirect hop and literal-IP hosts (aiohttp skips
the resolver for those, so a resolver-only check would miss them). The
address checked is the address connected to, so DNS rebinding cannot swap it.
"""
from __future__ import annotations

import ipaddress
from urllib.parse import urlparse

import aiohttp


def is_public_ip(value: str) -> bool:
    ip = ipaddress.ip_address(value.split("%", 1)[0])
    if ip.version == 6 and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return not (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved
                or ip.is_multicast or ip.is_unspecified)


def is_http_url(url: str | None) -> bool:
    parsed = urlparse(url or "")
    return parsed.scheme in ("http", "https") and bool(parsed.hostname)


class _PublicOnlyConnector(aiohttp.TCPConnector):
    async def _resolve_host(self, host, port, traces=None):
        hosts = await super()._resolve_host(host, port, traces=traces)
        for entry in hosts:
            if not is_public_ip(entry["host"]):
                # aiohttp turns an OSError here into ClientConnectorError.
                raise OSError(f"refused non-public address for {host}")
        return hosts


def public_session(timeout: aiohttp.ClientTimeout) -> aiohttp.ClientSession:
    """ClientSession that refuses private, loopback, link-local and other
    internal addresses. trust_env stays off so no proxy hides the target."""
    return aiohttp.ClientSession(timeout=timeout, connector=_PublicOnlyConnector())
