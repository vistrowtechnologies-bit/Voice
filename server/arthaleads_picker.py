"""Read active project and campaign choices from the connected ArthaLeads CRM.

This is a server-to-server read. The saved ArthaLeads connection token is never
sent to the dashboard or placed in a URL.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request


PICKER_OPTIONS_URL = "https://api.arthaleads.com/webhook/lead/projects"


class ArthaLeadsPickerError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def _clean_options(data: object) -> dict:
    if not isinstance(data, dict) or data.get("ok") is not True:
        raise ArthaLeadsPickerError(502, "ArthaLeads returned an unreadable project list")

    projects = []
    for item in data.get("projects", []) if isinstance(data.get("projects"), list) else []:
        if not isinstance(item, dict):
            continue
        project_id = str(item.get("id") or "").strip()[:200]
        name = str(item.get("name") or "").strip()[:200]
        if project_id and name:
            projects.append({
                "id": project_id,
                "name": name,
                "location": str(item.get("location") or "").strip()[:200],
            })

    return {"projects": projects}


def fetch_picker_options(token: str) -> dict:
    secret = str(token or "").strip()
    if not secret:
        raise ArthaLeadsPickerError(400, "Connect ArthaLeads CRM to load projects")
    request = urllib.request.Request(
        PICKER_OPTIONS_URL,
        headers={
            "X-ArthaLeads-Connection-Token": secret,
            "Accept": "application/json",
            "User-Agent": "Vistrow-Voice/1.0",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            data = json.loads(response.read(1_000_000))
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            raise ArthaLeadsPickerError(401, "ArthaLeads could not verify this connection. Reconnect ArthaLeads CRM.") from None
        if exc.code == 403:
            raise ArthaLeadsPickerError(403, "Your ArthaLeads plan does not allow project sync.") from None
        if exc.code == 429:
            raise ArthaLeadsPickerError(429, "ArthaLeads is receiving too many refresh requests. Try again shortly.") from None
        raise ArthaLeadsPickerError(503, "ArthaLeads could not load projects right now. Try again shortly.") from None
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
        raise ArthaLeadsPickerError(503, "Could not reach ArthaLeads. Try refreshing the project list.") from None
    try:
        return _clean_options(data)
    except (TypeError, ValueError):
        raise ArthaLeadsPickerError(502, "ArthaLeads returned an unreadable project list") from None
