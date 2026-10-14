"""Cleaning for self-reported onboarding answers and first-touch marketing
attribution. Anything unknown is dropped and every value is length-capped:
this is marketing data shown in the admin panel, never read by call logic."""

TEXT_FIELDS = (
    "role", "roleOther", "phone", "referralSource", "website", "industry", "industryOther",
    "companySize", "callVolume", "currentSolution", "timeline", "useCaseOther",
)
LIST_FIELDS = ("useCases", "languages", "channels")
ATTRIBUTION_FIELDS = (
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "gclid", "fbclid", "msclkid", "referrer", "landing_page", "first_seen_at",
)


def clean_attribution(raw: object) -> dict:
    if not isinstance(raw, dict):
        return {}
    return {k: str(raw[k])[:300] for k in ATTRIBUTION_FIELDS if raw.get(k)}


def clean_profile(raw: object) -> dict:
    if not isinstance(raw, dict):
        return {}
    profile: dict = {}
    for key in TEXT_FIELDS:
        value = str(raw.get(key) or "").strip()[:200]
        if value:
            profile[key] = value
    for key in LIST_FIELDS:
        values = raw.get(key)
        if isinstance(values, list):
            cleaned = [str(v).strip()[:80] for v in values[:20] if str(v).strip()]
            if cleaned:
                profile[key] = cleaned
    return profile
