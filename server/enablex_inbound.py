"""Small helpers for EnableX inbound call lifecycle handling."""

from collections.abc import Callable


def accept_if_ringing(
    voice_id: str,
    account_id: int,
    *,
    already_connected: bool,
    accept_call: Callable[[str, int], dict],
) -> dict | None:
    """Accept a ringing leg, but never send a second accept for a connected leg.

    EnableX can deliver ``connected`` without first sending ``incomingcall``.
    That callback means the leg is already answered; the caller should bridge
    it directly to SIP. Returning ``None`` signals that no accept request was
    necessary.
    """
    if already_connected:
        return None
    return accept_call(voice_id, account_id)
