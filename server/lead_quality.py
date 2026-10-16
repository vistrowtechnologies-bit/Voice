"""What makes a call's lead "Qualified": a real name AND a phone or email.

Used by calls_db._lead_status (the per-call label) and by every dashboard
count of qualified calls (QUALIFIED_SQL), so the two always agree. The
placeholder list mirrors agent/lead_placeholders.py (agent/ and server/
deploy separately, so it is duplicated, not imported) - keep them in sync.
"""

PLACEHOLDER_VALUES = frozenset({
    "", "not applicable", "n/a", "na", "none", "unknown", "website visitor",
    "visitor", "the caller", "caller", "-", "nil", "n.a.", "not available",
    "not given",
})


def _is_real(value) -> bool:
    return str(value or "").strip().lower() not in PLACEHOLDER_VALUES


def is_qualified(name, phone, email) -> bool:
    return _is_real(name) and (_is_real(phone) or _is_real(email))


# Constants only (never user input), so inlining them into SQL is safe.
assert all("'" not in v for v in PLACEHOLDER_VALUES)
_PLACEHOLDER_SQL = ", ".join(f"'{v}'" for v in sorted(PLACEHOLDER_VALUES))


def _real_sql(column: str) -> str:
    # COALESCE first: NULL NOT IN (...) is NULL, not true.
    return f"LOWER(BTRIM(COALESCE({column}, ''))) NOT IN ({_PLACEHOLDER_SQL})"


# Boolean SQL expression over a calls row; same rule as is_qualified. Only
# evaluated inside aggregates over rows already narrowed by account_id.
QUALIFIED_SQL = f"({_real_sql('lead_name')} AND ({_real_sql('lead_phone')} OR {_real_sql('lead_email')}))"
