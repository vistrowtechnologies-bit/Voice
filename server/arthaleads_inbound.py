"""Small, fail-closed parsing helpers for ArthaLeads lead.created events."""

from __future__ import annotations

import re

AUTO_CALL_DECLINE_REASONS = {
    "source_disabled",
    "no_route",
    "ambiguous_route",
    "agent_missing",
    "not_auto_source",
    "test_event",
}


def call_request(body: dict, *, is_test: bool = False) -> tuple[bool, int | None, str]:
    """Only an actual JSON boolean true can request a call, with its agent ID.

    CRM consent metadata is deliberately not interpreted here: WhatsApp
    marketing opt-in is not Vistrow outbound-call consent.
    """
    if is_test:
        return False, None, "test_event"
    if body.get("opt_out") is True or body.get("do_not_call") is True:
        return False, None, "lead_opted_out"
    auto_call = body.get("auto_call")
    if auto_call is not True:
        if auto_call is not False and auto_call is not None:
            return False, None, "invalid_auto_call_flag"
        reason = str(body.get("auto_call_reason") or "not_auto_source").strip()
        if reason not in AUTO_CALL_DECLINE_REASONS:
            reason = "not_auto_source"
        return False, None, reason

    try:
        agent_id = int(body.get("agent_id"))
    except (TypeError, ValueError):
        agent_id = 0
    if agent_id <= 0:
        return False, None, "agent_missing"
    return True, agent_id, ""


def copy_scalar_fields(body: dict) -> dict:
    """Preserve the documented ArthaLeads lead.created fields for the Contact."""
    keys = (
        "project", "lead_source", "source_detail", "campaign_id", "campaign_name",
        "ad_id", "ad_name", "form_id", "form_name", "consent_basis", "opt_out",
        "auto_call", "agent_id", "route_label", "auto_call_reason", "name", "phone",
        "email", "whatsapp", "requirements", "priority", "timeline",
        "preferred_location", "street_address", "city", "property_type", "purpose",
        "bhk", "budget", "remark", "remark_1", "remark_2", "assigned_to",
        "follow_up_date", "created_at",
    )
    fields = {}
    for key in keys:
        value = body.get(key)
        if value is None or isinstance(value, (dict, list)):
            continue
        fields[key] = value if isinstance(value, bool) else str(value)[:2000]

    custom_fields = body.get("custom_fields")
    if isinstance(custom_fields, dict):
        for key, value in list(custom_fields.items())[:60]:
            if not isinstance(key, str):
                continue
            if not re.fullmatch(r"[a-z][a-z0-9_]{0,63}", key) or value is None:
                continue
            if key == "tags" and isinstance(value, list):
                fields[key] = [str(tag).strip()[:80] for tag in value[:30] if str(tag).strip()]
            elif not isinstance(value, (dict, list)):
                fields[key] = value if isinstance(value, bool) else str(value)[:2000]

    # Vistrow's website rules use page_url; ArthaLeads calls the same field source_page.
    if fields.get("source_page") and not fields.get("page_url"):
        fields["page_url"] = fields["source_page"]
    return fields
