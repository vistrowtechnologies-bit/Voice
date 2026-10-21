"""Load the canonical policy shipped in the standalone LiveKit build."""
import importlib.util
from pathlib import Path

_spec = importlib.util.spec_from_file_location("vistrow_commercial_policy", Path(__file__).resolve().parent.parent / "agent" / "plan_policy.py")
_policy = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_policy)
PLANS = _policy.PLANS
FEATURE_MIN_PLAN = _policy.FEATURE_MIN_PLAN
TOPUP_PACKS = _policy.TOPUP_PACKS
COST_PER_DEFAULT_MINUTE_INR = _policy.COST_PER_DEFAULT_MINUTE_INR
TOPUP_MIN_CREDITS = _policy.TOPUP_MIN_CREDITS
TOPUP_MAX_CREDITS = _policy.TOPUP_MAX_CREDITS
EntitlementError = _policy.EntitlementError
allowed = _policy.allowed
account_policy = _policy.account_policy
require = _policy.require
validate_agent = _policy.validate_agent
storage_limit_bytes = _policy.storage_limit_bytes
OPENAI_MODEL_SUCCESSORS = _policy.OPENAI_MODEL_SUCCESSORS
current_openai_model = _policy.current_openai_model
ANNUAL_MONTHS_CHARGED = _policy.ANNUAL_MONTHS_CHARGED
ANNUAL_PRICE_INR = _policy.ANNUAL_PRICE_INR
plan_allowance = _policy.plan_allowance
public_plans = _policy.public_plans
VOICE_TIER_MULTIPLIERS = _policy.VOICE_TIER_MULTIPLIERS
MODEL_TIER_MULTIPLIERS = _policy.MODEL_TIER_MULTIPLIERS
REALTIME_MODEL_TIERS = _policy.REALTIME_MODEL_TIERS
MIN_CREDITS_PER_MINUTE = _policy.MIN_CREDITS_PER_MINUTE
LIVE_MINUTES_PER_MINUTE = _policy.LIVE_MINUTES_PER_MINUTE
credits_per_minute = _policy.credits_per_minute
