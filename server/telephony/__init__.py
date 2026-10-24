"""Provider-neutral telephony capacity (plan section 2a). See pools.py."""

from .pools import (  # noqa: F401
    DEFAULT_INBOUND_RESERVE,
    DEFAULT_OUTBOUND_LINES,
    OverSell,
    SecretStorageUnavailable,
    allocate_lines,
    capacity_snapshot,
    create_pool,
    ensure_platform_pool,
    get_trunk,
    inflight_by_trunk,
    init_tables,
    outbound_line_limit,
    platform_pool_id,
    platform_trunk_id,
    release_trunk,
    secret_storage_ok,
    set_pool_capacity,
    set_trunk_lines,
    trunk_for_number,
    trunk_room,
)
from .providers import FAILED, RETRY_LATER, UNKNOWN, Provider, get_provider  # noqa: F401
