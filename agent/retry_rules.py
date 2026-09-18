"""How many times to retry a campaign contact, and how long to wait.

One blanket "max attempts / retry after N minutes" treats every failure the
same, but they are not the same: a busy line is worth another try soon, a
voicemail box is worth one try much later, and a call that connected and
lasted four seconds is worth retrying at all — which today's rules cannot
express, because it counts as a success. Sarvam's campaign wizard models this
as a per-outcome policy (attempts + interval for busy / no answer / failed /
short duration / provider error) and that shape is the right one.

Stored per campaign as JSON in campaigns.retry_policy. An empty policy, an
unknown outcome, or anything malformed falls back to the campaign's own
max_attempts / retry_minutes, so a campaign created before this existed keeps
behaving exactly as it did.

IMPORTANT: this file exists twice, identically, at server/retry_rules.py and
agent/retry_rules.py — the agent worker does not import the server package,
and the retry decision has to be the same on both sides or a contact's fate
depends on which process happened to resolve it. test_retry_rules.py in each
suite fails if the two copies drift apart.
"""

import json

# Outcomes a policy can carry a rule for. 'short_call' is not a dial result:
# it is a call that connected but ended almost immediately, which the agent
# classifies at call end.
OUTCOMES = ("no_answer", "busy", "failed", "voicemail", "short_call")

# Sarvam's wizard allows 0-20 retries; the same ceiling applies here, and a
# gap is clamped to a week so a typo cannot park a contact for a decade.
MAX_ATTEMPTS_CEILING = 20
MAX_GAP_MINUTES = 7 * 24 * 60


def parse(policy) -> dict:
    """Tolerant read of campaigns.retry_policy — never raises."""
    if isinstance(policy, dict):
        return policy
    if not policy:
        return {}
    try:
        loaded = json.loads(policy)
    except (ValueError, TypeError):
        return {}
    return loaded if isinstance(loaded, dict) else {}


def _positive_int(value, fallback: int, ceiling: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return fallback
    if number <= 0:
        return fallback
    return min(number, ceiling)


def resolve(
    policy,
    outcome: str,
    attempts: int,
    default_attempts: int,
    default_gap_minutes: int,
) -> tuple[bool, int]:
    """(retry_again, minutes_to_wait) for a contact that just ended `outcome`.

    `attempts` is how many dials this contact has already had, including the
    one that just finished.
    """
    rules = parse(policy)
    rule = rules.get(outcome)
    if not isinstance(rule, dict):
        rule = {}

    allowed = _positive_int(
        rule.get("attempts"),
        _positive_int(default_attempts, 1, MAX_ATTEMPTS_CEILING),
        MAX_ATTEMPTS_CEILING,
    )
    gap = _positive_int(
        rule.get("gapMinutes"),
        _positive_int(default_gap_minutes, 60, MAX_GAP_MINUTES),
        MAX_GAP_MINUTES,
    )

    try:
        done = int(attempts)
    except (TypeError, ValueError):
        done = 1
    return max(1, done) < allowed, gap


def short_call_seconds(policy) -> int:
    """Below this many seconds a connected call counts as 'short_call'.

    0 (the default) disables it: a campaign that has not opted in keeps
    treating every connected call as a success.
    """
    rule = parse(policy).get("short_call")
    if not isinstance(rule, dict):
        return 0
    try:
        seconds = int(rule.get("underSeconds") or 0)
    except (TypeError, ValueError):
        return 0
    return max(0, min(seconds, 120))
