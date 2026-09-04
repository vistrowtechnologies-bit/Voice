"""Commercial policy shared by the API and the separately deployed call worker.

Keep this module dependency-free. The API imports this file from agent/;
the LiveKit image ships it alongside db.py. Unknown plans fail closed.
"""

PLANS = {
    "starter": {"price_inr": 2999, "credits": 300, "agents": 1, "concurrency": 5, "knowledge_bases": 1},
    "growth": {"price_inr": 5999, "credits": 1000, "agents": 5, "concurrency": 15, "knowledge_bases": 5},
    "scale": {"price_inr": 12999, "credits": 2500, "agents": 20, "concurrency": 30, "knowledge_bases": 15},
}
FEATURE_MIN_PLAN = {
    "campaigns": "growth", "inbound_routing": "growth", "crm": "growth",
    "api": "scale", "premium_voice": "scale", "knowledge": "starter",
    "live_catalog": "growth", "basic_inbound": "starter",
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
        "features": {key: allowed(plan, key, owner) for key in FEATURE_MIN_PLAN},
    }


def require(conn, account_id: int, feature: str) -> dict:
    policy = account_policy(conn, account_id)
    if not policy["features"].get(feature, False):
        minimum = FEATURE_MIN_PLAN.get(feature, "a supported")
        raise EntitlementError(f"This feature requires the {minimum.title()} plan. Your data is retained; upgrade to use it.")
    return policy


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
    entry = catalog.get_voice(voice)
    if not entry or entry.get("preview"):
        raise EntitlementError("Select an available catalog voice before taking calls.")
    if entry["tier"] not in catalog.allowed_tiers_for_plan(policy["plan"]):
        raise EntitlementError("This voice requires a higher plan. Select an included voice or upgrade.")
    count = conn.execute("SELECT COUNT(*) c FROM agents WHERE account_id = ?", (account_id,)).fetchone()["c"]
    if count > policy["agentLimit"]:
        included = conn.execute(
            "SELECT id FROM agents WHERE account_id = ? ORDER BY id LIMIT ?",
            (account_id, policy["agentLimit"]),
        ).fetchall()
        if config.get("id") not in {row["id"] for row in included}:
            raise EntitlementError("This agent exceeds the workspace's plan limit. The earliest agents remain available; upgrade to reactivate additional agents. No data was deleted.")
