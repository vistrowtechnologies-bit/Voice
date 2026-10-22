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
# classifies at call end. 'switched_off' is the carrier's "switched off / not
# reachable / out of coverage" announcement, split from 'busy' because they
# are worth retrying on very different timescales (minutes vs hours).
OUTCOMES = ("no_answer", "busy", "switched_off", "failed", "voicemail", "short_call")

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


# ---------------------------------------------------------------- follow-ups
#
# Per-AGENT follow-up rules (agents.follow_up_policy, the dashboard's
# "Follow-ups" panel). They drive the instant ArthaLeads campaigns and the
# agent's own "Follow-up calls" campaign; a bulk campaign keeps the
# retry_policy its wizard saved.

FOLLOW_UP_CAMPAIGN_NAME = "Follow-up calls"
# Campaigns whose retries follow the agent's follow_up_policy rather than
# their own row (the two instant-lead names live in server/calls_db.py).
AGENT_POLICY_CAMPAIGNS = ("ArthaLeads Instant Follow-up", "Instant Lead Follow-up", FOLLOW_UP_CAMPAIGN_NAME)

FOLLOW_UP_DEFAULTS = {
    "maxAttempts": 3,
    "busyMinutes": 10,
    "switchedOffMinutes": 120,
    "noAnswerMinutes": 30,
    "voicemailMinutes": 120,
    "callbackEnabled": True,
    "visitReminderEnabled": True,
    "visitReminderTime": "11:00",
    "nurtureEnabled": True,
    "nurtureDays": 3,
    "nurtureTime": "11:00",
    # How long a brand-new lead waits before its first automatic call.
    # 0 = as soon as it arrives. A "Call now" request is never delayed.
    "firstCallDelaySeconds": 0,
}
FIRST_CALL_DELAY_CHOICES = (0, 30, 60, 120, 300, 600)
FOLLOW_UP_MAX_ATTEMPTS_CEILING = 10
FOLLOW_UP_MAX_NURTURE_DAYS = 30

# Which follow-up setting supplies the gap for each dial outcome. 'failed'
# (dial rejected, or a stale call the reaper gave up on) has no setting of
# its own and waits the no-answer gap.
_FOLLOW_UP_GAP_KEYS = {
    "busy": "busyMinutes",
    "switched_off": "switchedOffMinutes",
    "no_answer": "noAnswerMinutes",
    "failed": "noAnswerMinutes",
    "voicemail": "voicemailMinutes",
}


def _hhmm(value, fallback: str) -> str:
    parts = str(value or "").strip().split(":")
    if len(parts) != 2 or not all(p.isdigit() for p in parts):
        return fallback
    hour, minute = int(parts[0]), int(parts[1])
    if hour > 23 or minute > 59:
        return fallback
    return f"{hour:02d}:{minute:02d}"


def follow_up_policy(raw) -> dict:
    """agents.follow_up_policy as a complete, validated dict.

    Every key is present and in range; anything missing or malformed takes
    its default, so an agent saved before this existed behaves exactly as the
    owner's defaults say. Never raises."""
    stored = parse(raw)
    out = dict(FOLLOW_UP_DEFAULTS)
    out["maxAttempts"] = _positive_int(stored.get("maxAttempts"), out["maxAttempts"], FOLLOW_UP_MAX_ATTEMPTS_CEILING)
    for key in ("busyMinutes", "switchedOffMinutes", "noAnswerMinutes", "voicemailMinutes"):
        out[key] = _positive_int(stored.get(key), out[key], MAX_GAP_MINUTES)
    out["nurtureDays"] = _positive_int(stored.get("nurtureDays"), out["nurtureDays"], FOLLOW_UP_MAX_NURTURE_DAYS)
    for key in ("callbackEnabled", "visitReminderEnabled", "nurtureEnabled"):
        if isinstance(stored.get(key), bool):
            out[key] = stored[key]
    out["visitReminderTime"] = _hhmm(stored.get("visitReminderTime"), out["visitReminderTime"])
    out["nurtureTime"] = _hhmm(stored.get("nurtureTime"), out["nurtureTime"])
    delay = stored.get("firstCallDelaySeconds")
    if isinstance(delay, int) and not isinstance(delay, bool) and delay in FIRST_CALL_DELAY_CHOICES:
        out["firstCallDelaySeconds"] = delay
    return out


def follow_up_retry_policy(raw) -> dict:
    """The agent's follow-up rules in the per-outcome shape resolve() reads:
    one shared attempt budget (maxAttempts counts every dial to the lead,
    whatever each one came back as) and a gap per outcome."""
    policy = follow_up_policy(raw)
    return {
        outcome: {"attempts": policy["maxAttempts"], "gapMinutes": policy[gap_key]}
        for outcome, gap_key in _FOLLOW_UP_GAP_KEYS.items()
    }


def effective_policy(campaign_name, campaign_policy, agent_follow_up_raw):
    """The retry_policy a contact of this campaign is resolved against: the
    agent's follow-up rules for an instant/follow-up campaign, otherwise the
    campaign's own. Bulk campaigns are untouched by the agent setting."""
    if campaign_name in AGENT_POLICY_CAMPAIGNS:
        return follow_up_retry_policy(agent_follow_up_raw)
    return campaign_policy
