"""What differs per carrier, behind one small interface. Nothing here makes
a network call: EnableX is provisioned by a ticket to them today, and a
customer's own SIP trunk is provisioned by the customer. API-provisioned
providers (Twilio, Plivo, Exotel) plug in by subclassing Provider."""

from __future__ import annotations

import re
from dataclasses import dataclass

import calls_db

RETRY_LATER = "retry_later"   # capacity or transient: try the next free slot
FAILED = "failed"             # a fact about the destination: spend the attempt
UNKNOWN = "unknown"

# SIP responses that mean "not now" (capacity, congestion) versus "never".
_RETRY_CODES = {480, 486, 491, 500, 503, 504}
_FAILED_CODES = {403, 404, 410, 484, 603, 604, 606}
_RETRY_TEXT = ("100 trying", "timed out", "timeout", "no trunk", "congest", "capacity", "busy here", "unavailable")
_FAILED_TEXT = ("not found", "forbidden", "decline", "invalid number", "address incomplete", "blocked")


@dataclass(frozen=True)
class Costs:
    per_line_month: float
    per_minute_in: float
    per_minute_out: float
    per_number_month: float


class Provider:
    key = ""
    provisioning = "manual"          # api | manual | customer_supplied
    over_capacity = "sip_error"      # sip_error | silent_drop | queue

    def provision_trunk(self, account_id: int, lines: int, from_numbers: list[str]) -> dict:
        """Start provisioning. Returns {status, instruction} where status is
        'active' (done), 'provisioning' (a person must act) or 'customer'."""
        raise NotImplementedError

    def set_lines(self, trunk_id: int, lines: int) -> dict:
        raise NotImplementedError

    def release_trunk(self, trunk_id: int) -> dict:
        raise NotImplementedError

    def classify_rejection(self, response: str | int | None) -> str:
        """retry_later / failed / unknown for a SIP code or error text."""
        if response is None:
            return UNKNOWN
        if isinstance(response, int) or str(response).strip().isdigit():
            code = int(response)
            if code in _RETRY_CODES:
                return RETRY_LATER
            if code in _FAILED_CODES:
                return FAILED
            return UNKNOWN
        text = str(response).casefold()
        match = re.search(r"\b(4\d\d|5\d\d|6\d\d)\b", text)
        if match and int(match.group(1)) in _RETRY_CODES | _FAILED_CODES:
            return self.classify_rejection(int(match.group(1)))
        if any(t in text for t in _RETRY_TEXT):
            return RETRY_LATER
        if any(t in text for t in _FAILED_TEXT):
            return FAILED
        return UNKNOWN

    def costs(self) -> Costs:
        conn = calls_db._connect()
        try:
            row = conn.execute("SELECT * FROM telephony_providers WHERE key = ?", (self.key,)).fetchone()
        finally:
            conn.close()
        if row is None:
            return Costs(0, 0, 0, 0)
        return Costs(float(row["cost_per_line_month"]), float(row["cost_per_minute_in"]),
                     float(row["cost_per_minute_out"]), float(row["cost_per_number_month"]))


class EnableXProvider(Provider):
    """Provisioned by hand on EnableX's side (about 2 working days per
    request); capacity is bought in blocks of 3 resources; a call past the
    bought capacity is answered '100 Trying' and then dropped silently, so the
    dialer's cap must be strict (see over_capacity)."""
    key = "enablex"
    provisioning = "manual"
    over_capacity = "silent_drop"
    BLOCK = 3

    def provision_trunk(self, account_id: int, lines: int, from_numbers: list[str]) -> dict:
        return {"status": "provisioning", "instruction": (
            f"Raise a ticket with EnableX: dedicated outbound trunk for account {account_id}, numbers "
            f"{', '.join(from_numbers) or '(none yet)'}, {lines} concurrent call(s). Capacity is bought in blocks "
            f"of {self.BLOCK} resources; confirm the account pool has room first (telephony.capacity_snapshot).")}

    def set_lines(self, trunk_id: int, lines: int) -> dict:
        return {"status": "provisioning", "instruction": (
            f"Tell EnableX trunk {trunk_id} now carries {lines} concurrent call(s); buy another block of "
            f"{self.BLOCK} resources if the account pool is short.")}

    def release_trunk(self, trunk_id: int) -> dict:
        return {"status": "provisioning", "instruction": f"Ask EnableX to retire trunk {trunk_id}; the lines return to the pool."}

    def classify_rejection(self, response: str | int | None) -> str:
        # EnableX past capacity: '100 Trying' then nothing, surfacing as a timeout.
        if response is not None and not isinstance(response, int) and "100 trying" in str(response).casefold():
            return RETRY_LATER
        return super().classify_rejection(response)


class ByoSipProvider(Provider):
    """The customer brings their own carrier account and declares its
    lines; we provision nothing and bill nothing per line."""
    key = "byo_sip"
    provisioning = "customer_supplied"
    over_capacity = "sip_error"

    def provision_trunk(self, account_id: int, lines: int, from_numbers: list[str]) -> dict:
        return {"status": "customer", "instruction": "The customer configures their SIP trunk to point at our LiveKit SIP endpoint and declares its line count."}

    def set_lines(self, trunk_id: int, lines: int) -> dict:
        return {"status": "customer", "instruction": "Declared by the customer; nothing to provision."}

    def release_trunk(self, trunk_id: int) -> dict:
        return {"status": "customer", "instruction": "Nothing to release on our side."}


class ApiProviderStub(Provider):
    """Placeholder for API-provisioned carriers until a contract exists."""
    provisioning = "api"

    def __init__(self, key: str):
        self.key = key

    def provision_trunk(self, account_id: int, lines: int, from_numbers: list[str]) -> dict:
        raise NotImplementedError(f"{self.key} provisioning is not available yet")

    def set_lines(self, trunk_id: int, lines: int) -> dict:
        raise NotImplementedError(f"{self.key} provisioning is not available yet")

    def release_trunk(self, trunk_id: int) -> dict:
        raise NotImplementedError(f"{self.key} provisioning is not available yet")


_REGISTRY: dict[str, Provider] = {
    "enablex": EnableXProvider(),
    "byo_sip": ByoSipProvider(),
    "twilio": ApiProviderStub("twilio"),
    "exotel": ApiProviderStub("exotel"),
    "plivo": ApiProviderStub("plivo"),
}


def get_provider(key: str) -> Provider:
    try:
        return _REGISTRY[key]
    except KeyError:
        raise ValueError(f"unknown telephony provider {key!r}") from None
