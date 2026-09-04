"""Load the canonical policy shipped in the standalone LiveKit build."""
import importlib.util
from pathlib import Path

_spec = importlib.util.spec_from_file_location("vistrow_commercial_policy", Path(__file__).resolve().parent.parent / "agent" / "plan_policy.py")
_policy = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_policy)
PLANS = _policy.PLANS
FEATURE_MIN_PLAN = _policy.FEATURE_MIN_PLAN
EntitlementError = _policy.EntitlementError
allowed = _policy.allowed
account_policy = _policy.account_policy
require = _policy.require
validate_agent = _policy.validate_agent
