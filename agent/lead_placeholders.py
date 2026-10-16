"""Values that look like a lead field but carry no information.

One list for the whole agent package: log_lead / capture_platform_lead reject
them (tools.py), and the widget pre-call seed skips them (main.py). The
widget's /widget/token sends "Website visitor" when the visitor left the name
blank. server/lead_quality.py keeps the same list for the dashboard's
"Qualified" rule; agent/ and server/ deploy separately, so it is duplicated
there rather than imported. Compare lowercased and stripped.
"""

PLACEHOLDER_VALUES = frozenset({
    "", "not applicable", "n/a", "na", "none", "unknown", "website visitor",
    "visitor", "the caller", "caller", "-", "nil", "n.a.", "not available",
    "not given",
})


def is_placeholder(value) -> bool:
    return str(value or "").strip().lower() in PLACEHOLDER_VALUES
