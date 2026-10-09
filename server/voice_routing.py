"""Keep native Live audio out of the text-based orchestrator pipeline."""


def use_orchestrator(account_id, agent_id, *, is_enabled, get_agent) -> bool:
    if not is_enabled(account_id):
        return False
    if agent_id is None:
        # Preserve the existing account-default pipeline route.
        return True
    agent = get_agent(agent_id)
    if not agent:
        return False
    return not str(agent.get("model") or "").startswith("gemini-live")
