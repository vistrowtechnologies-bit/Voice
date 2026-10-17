"""Commercial policy shared by the API and the separately deployed call worker.

Keep this module dependency-free. The API imports this file from agent/;
the LiveKit image ships it alongside db.py. Unknown plans fail closed.
"""

# Minute-based plans (owner decision 2026-10-17). The credit ledger is kept,
# but 1 credit = 1 standard minute, so "credits" is the plan's monthly minutes.
# Prices exclude GST. "overage_per_minute_inr" is what an active paid
# subscription is invoiced per standard minute beyond its allowance.
PLANS = {
    "starter": {"price_inr": 2999, "credits": 400, "annual_credits_per_month": 500, "overage_per_minute_inr": 7,
                "agents": 1, "concurrency": 5, "knowledge_bases": 1, "storage_gb": 5, "cloned_voices": 0},
    "growth": {"price_inr": 5999, "credits": 1100, "annual_credits_per_month": 1200, "overage_per_minute_inr": 6,
               "agents": 5, "concurrency": 15, "knowledge_bases": 5, "storage_gb": 25, "cloned_voices": 1},
    "scale": {"price_inr": 12999, "credits": 2700, "annual_credits_per_month": 3000, "overage_per_minute_inr": 5,
              "agents": 20, "concurrency": 30, "knowledge_bases": 15, "storage_gb": 100, "cloned_voices": 3},
}
# Annual plans are billed upfront. PENDING owner recommendation: the default is
# "pay 11 months, get 12" (Starter 32,989 / Growth 65,989 / Scale 1,42,989).
# Change ANNUAL_MONTHS_CHARGED, or override a single plan in ANNUAL_PRICE_INR.
# The Razorpay annual Plans are created by hand in the Razorpay dashboard
# (server/razorpay_client.py) and must carry these amounts + GST.
ANNUAL_MONTHS_CHARGED = 11
ANNUAL_PRICE_INR = {key: plan["price_inr"] * ANNUAL_MONTHS_CHARGED for key, plan in PLANS.items()}


def plan_allowance(plan: str, billing_cycle: str = "monthly") -> int:
    """Credits (= standard minutes) one billing period of this plan includes.
    An annual period is a year, so it gets 12 months of the annual per-month
    allowance at once (pooled); a monthly period gets one month. Unknown plans
    get Starter's, like every other plan lookup in billing."""
    entry = PLANS.get(str(plan or "").lower(), PLANS["starter"])
    if str(billing_cycle or "").lower() == "annual":
        return int(entry["annual_credits_per_month"]) * 12
    return int(entry["credits"])


def public_plans() -> list[dict]:
    """The plan list the billing screen and pricing copy read (GET /billing/plans).
    Prices are INR, GST extra. Minutes are standard minutes; Vistrow Live uses
    LIVE_MINUTES_PER_MINUTE of them per call minute."""
    return [
        {
            "plan": key,
            "monthlyPrice": plan["price_inr"],
            "annualPrice": ANNUAL_PRICE_INR[key],
            "monthlyMinutes": plan["credits"],
            "annualMinutesPerMonth": plan["annual_credits_per_month"],
            "annualMinutesPerYear": plan_allowance(key, "annual"),
            "overagePerMinute": plan["overage_per_minute_inr"],
            "clonedVoicesIncluded": plan.get("cloned_voices"),
            "agents": plan["agents"],
            "concurrentCalls": plan["concurrency"],
            "knowledgeBases": plan["knowledge_bases"],
            "storageGb": plan["storage_gb"],
        }
        for key, plan in PLANS.items()
    ]


# Credits billed per call minute = channel rate x voice tier x model tier, never
# below MIN_CREDITS_PER_MINUTE. server/calls_db.credits_for_call (billing) and
# agent/db.py's trial cutoff (admission) both price through credits_per_minute.
# 1 credit = 1 standard minute: any standard voice (Native, Vistrow HD, Bharat
# voices, cloned voices) on a standard model, the Vistrow Bharat (Sarvam)
# pipeline included, bills exactly 1. Vistrow Live (Gemini realtime, every
# version) bills 3 and ignores the voice tier, since the model speaks itself.
# Premium voices (2x) and the legacy premium LLM tiers keep their credit-era
# multipliers: a credit is still worth one GPT + Chirp minute, as before.
VOICE_TIER_MULTIPLIERS = {"economy": 1.0, "standard": 1.0, "premium": 2.0}
MODEL_TIER_MULTIPLIERS = {"standard": 1.0, "premium": 2.0, "premium_plus": 4.0, "realtime": 3.0, "realtime_plus": 3.0}
REALTIME_MODEL_TIERS = frozenset({"realtime", "realtime_plus"})
MIN_CREDITS_PER_MINUTE = 1.0
LIVE_MINUTES_PER_MINUTE = MODEL_TIER_MULTIPLIERS["realtime"]


def credits_per_minute(call_type_rate: float, voice_tier: str, model_tier: str) -> float:
    """Credits one call minute bills. An unknown tier bills as 1x."""
    model_mult = MODEL_TIER_MULTIPLIERS.get(model_tier, 1.0)
    voice_mult = 1.0 if model_tier in REALTIME_MODEL_TIERS else VOICE_TIER_MULTIPLIERS.get(voice_tier, 1.0)
    return max(MIN_CREDITS_PER_MINUTE, call_type_rate * voice_mult * model_mult)


# Measured worst-case cost of one minute of the default stack (Sarvam STT +
# Sarvam 105B + Chirp 3 HD), Oct 2026 bills: STT 0.31 + LLM 1.70 + TTS 0.13 +
# LiveKit 0.85 + EnableX SIP 0.25 = Rs 3.24. That minute bills 1 credit.
# test_plan_policy keeps every plan's net rate per standard minute (monthly,
# annual and overage) above this cost.
COST_PER_DEFAULT_MINUTE_INR = 3.24
# One-off credit top-ups. Price = the account's plan rate per credit × base credits (+ GST);
# the bonus is granted on top but never invoiced. Mirrors web-demo/src/lib/plans.ts TOPUP_PACKS.
TOPUP_PACKS = {
    "100": {"credits": 100, "bonus_pct": 0},
    "250": {"credits": 250, "bonus_pct": 5},
    "500": {"credits": 500, "bonus_pct": 10},
    "1000": {"credits": 1000, "bonus_pct": 15},
}
TOPUP_MIN_CREDITS = 50
TOPUP_MAX_CREDITS = 10000
# Call-recording storage included in each plan, in GB. PLACEHOLDER amounts: a recording
# averages about 4 MB (measured on 734 live recordings, Oct 2026), so 5 GB is roughly
# 1,200 calls. Change the numbers here; the API, the sidebar warning and any gate read
# them from this one place.
FEATURE_MIN_PLAN = {
    "campaigns": "growth", "inbound_routing": "growth", "crm": "growth",
    "api": "scale", "premium_voice": "scale", "knowledge": "starter",
    "live_catalog": "growth", "basic_inbound": "starter",
    # Dashboard copilot actions (confirmed writes). Read-only answers stay on every plan.
    "copilot_actions": "growth",
    # Already promised on every paid plan. Security/privacy are never upsells.
    "widget": "starter", "recording": "starter", "extraction": "starter",
    "transfer": "starter", "functions": "starter", "memory": "starter",
    "calendar": "starter", "analytics": "starter", "testing": "starter",
    "contacts": "starter", "background_sound": "starter",
}


class EntitlementError(ValueError):
    pass


def allowed(plan: str, feature: str, owner: bool = False) -> bool:
    minimum = FEATURE_MIN_PLAN.get(feature)
    if minimum is None:
        return False
    if owner:
        return True
    order = {"starter": 0, "growth": 1, "scale": 2}
    return plan in order and order[plan] >= order[minimum]


def storage_limit_bytes(plan: str, owner: bool = False) -> "int | None":
    """Recording storage a plan includes, in bytes. None means no limit: the platform
    owner, and any plan name we do not recognise (an unknown plan is not shown a
    storage warning it could not act on)."""
    if owner:
        return None
    gb = PLANS.get(str(plan or "").lower(), {}).get("storage_gb")
    return int(gb) * 1024 ** 3 if gb else None


def account_policy(conn, account_id: int) -> dict:
    row = conn.execute(
        "SELECT plan, is_platform_owner FROM accounts WHERE id = ?", (account_id,)
    ).fetchone()
    if not row:
        raise EntitlementError("Workspace not found")
    plan = str(row["plan"] or "").lower()
    owner = bool(row["is_platform_owner"])
    limits = PLANS.get(plan, {"agents": 0, "concurrency": 0})
    return {
        "plan": plan, "platformOwner": owner,
        "agentLimit": None if owner else limits["agents"],
        "concurrentCallLimit": None if owner else limits["concurrency"],
        "knowledgeBaseLimit": None if owner else limits.get("knowledge_bases", 0),
        "storageLimitBytes": storage_limit_bytes(plan, owner),
        "features": {key: allowed(plan, key, owner) for key in FEATURE_MIN_PLAN},
    }


def require(conn, account_id: int, feature: str) -> dict:
    policy = account_policy(conn, account_id)
    if not policy["features"].get(feature, False):
        minimum = FEATURE_MIN_PLAN.get(feature, "a supported")
        raise EntitlementError(f"This feature requires the {minimum.title()} plan. Your data is retained; upgrade to use it.")
    return policy


# Mirrors server/custom_voices.OWNER_CLONE_LIMIT.
OWNER_CLONE_LIMIT = 100


def cloned_voice_limit(plan: str, owner: bool) -> int:
    if owner:
        return OWNER_CLONE_LIMIT
    return int(PLANS.get(str(plan or "").lower(), {}).get("cloned_voices", 0))


def clones_allowed(conn, account_id: int) -> bool:
    """Call-time mirror of server/custom_voices.clone_allowed_for_account:
    the plan includes cloned voices and the account holds no more of them
    than it allows (e.g. after a downgrade). A missing account reads as
    starter, as server/calls_db._account_plan_and_owner does."""
    row = conn.execute("SELECT plan, is_platform_owner FROM accounts WHERE id = ?", (account_id,)).fetchone()
    plan, owner = ((row["plan"] or "starter"), bool(row["is_platform_owner"])) if row else ("starter", False)
    used = conn.execute(
        "SELECT COUNT(*) c FROM custom_voices WHERE account_id = ? AND deleted_at IS NULL AND status <> 'failed'",
        (account_id,),
    ).fetchone()
    limit = cloned_voice_limit(plan, owner)
    return limit > 0 and int(used["c"] or 0) <= limit


def validate_agent(conn, account_id: int, config: dict, catalog) -> None:
    """Recheck retained configurations at admission, not just when edited."""
    policy = account_policy(conn, account_id)
    if policy["platformOwner"]:
        return
    if config.get("kb_id"):
        require(conn, account_id, "knowledge")
    if config.get("live_catalog_enabled"):
        require(conn, account_id, "live_catalog")
    voice = config.get("voice") or "shubh"
    # A customer's cloned voice ("custom:vv_<id>") is checked at agent save
    # (owned, ready, plan) and resolved at call time with a gender-matched
    # stock-voice fallback (custom_voice.resolve_row, clones_allowed above
    # for a downgraded plan), so it never refuses a call here.
    if str(voice).startswith("custom:"):
        voice = ""
    entry = catalog.get_voice(voice) if voice else None
    if voice and (not entry or (entry.get("preview") and not catalog.is_grandfathered(voice))):
        raise EntitlementError("Select an available catalog voice before taking calls.")
    if entry and entry["tier"] not in catalog.allowed_tiers_for_plan(policy["plan"]):
        raise EntitlementError("This voice requires a higher plan. Select an included voice or upgrade.")
    count = conn.execute("SELECT COUNT(*) c FROM agents WHERE account_id = ?", (account_id,)).fetchone()["c"]
    if count > policy["agentLimit"]:
        included = conn.execute(
            "SELECT id FROM agents WHERE account_id = ? ORDER BY id LIMIT ?",
            (account_id, policy["agentLimit"]),
        ).fetchall()
        if config.get("id") not in {row["id"] for row in included}:
            raise EntitlementError("This agent exceeds the workspace's plan limit. The earliest agents remain available; upgrade to reactivate additional agents. No data was deleted.")


# GPT-4 family retired 2026-10-14 (owner decision). Agents saved with one of
# these names keep their stored value (billing tiers and dashboard labels key
# off it, and no agent row is rewritten), but every request is sent to the
# GPT-5 successor below. Chosen from a benchmark run from India on a
# 14K-token tenant-sized prompt, 9 Hindi answers per model: gpt-5.4-nano was
# 9/9 correct with a correct tool call at ~670 ms first token and ~Rs 0.22 per
# call minute, against gpt-4o-mini's 6/9 (it misquoted a price every time)
# and gpt-4.1-mini's 9/9 at ~Rs 0.70. The large GPT-4 models map to
# gpt-5.4-mini (9/9, tool call correct). GPT-5 models need
# max_completion_tokens instead of max_tokens.
OPENAI_MODEL_SUCCESSORS = {
    "gpt-4o-mini": "gpt-5.4-nano",
    "gpt-4.1-nano": "gpt-5.4-nano",
    "gpt-4.1-mini": "gpt-5.4-nano",
    "gpt-4.1": "gpt-5.4-mini",
    "gpt-4o": "gpt-5.4-mini",
}


def current_openai_model(model: str) -> str:
    """The model a request should actually use: the GPT-5 successor for a
    retired GPT-4 name, anything else unchanged."""
    return OPENAI_MODEL_SUCCESSORS.get(model, model)
