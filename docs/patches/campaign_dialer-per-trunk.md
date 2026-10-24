# Patch: per-trunk line caps in `server/campaign_dialer.py` (plan B1/B2)

Apply after PR #253 merges (the edit guard blocks the file until then). Depends on the
`server/telephony/` package (`telephony.init_tables()` + `telephony.ensure_platform_pool()`
called at API startup, after `calls_db.init_tables()`).

Constraints kept: the sum of per-trunk caps never exceeds the pool minus the inbound reserve
(enforced in `telephony` by the pool lock and the `trunks_pool_cap_check` trigger); bulk
campaigns stay on hold (nothing here resumes one); no `agent/` or `orchestrator/` change.

## What changes

Today `_dial_one` has one trunk-wide gate: `_OUTBOUND_CHANNELS - calls_db.campaign_inflight_all()`,
and one global dial stagger `_last_dial_at`. After the patch:

1. **Two caps per campaign**, both from `telephony.trunk_room(trunk_id)`:
   - `trunk_free` = the trunk's `lines` minus live dials attributed to that trunk;
   - `pool_free` = the pool's `lines_bought - inbound_reserved_lines` minus live dials across
     every trunk of that pool (this is the number the carrier actually rejects at).
   `slots = min(slots, trunk_free, pool_free)`. Campaign concurrency and the plan headroom are
   unchanged and still applied after.
2. **Stagger per trunk**: `_last_dial_at` becomes a dict keyed by trunk id. Two customers on
   different trunks of the same pool still share the pool's CPS, so the pool-level stagger stays
   as a floor (`_DIAL_STAGGER_SECONDS` keyed by pool id) and the per-trunk gap applies on top.
   Net effect today (one pool, one platform trunk): identical to the current behaviour.
3. **Fallback**: a `from_number` with no `trunk_id` (never allocated, or a number added before the
   migration ran) resolves to the platform-shared trunk via `telephony.trunk_for_number`, whose
   `lines` equal `OUTBOUND_CHANNEL_LIMIT`. So a deploy that runs the migration and nothing else
   dials exactly as before. If `telephony` has no platform trunk at all (migration not run), the
   old `_OUTBOUND_CHANNELS` gate is used unchanged (`_legacy_gate`), never a wider one.

## Diff (against `server/campaign_dialer.py` at main 9d837446)

```diff
@@
 import calls_db
 import campaign_window
 import integrations_dispatch
+import telephony
@@
-# EnableX enforces CPS across the whole SIP trunk, not per campaign (their
-# reply, 2026-09-17: 5-6 running campaigns each dialing on the same tick is
-# 5-6 INVITEs at once). So the stagger is global: every dial from every
-# campaign waits until _DIAL_STAGGER_SECONDS after the previous one.
-_last_dial_at = 0.0
+# EnableX enforces CPS across the whole carrier ACCOUNT (their reply,
+# 2026-09-17), i.e. per telephony pool, not per campaign. The stagger is
+# therefore keyed by pool id (the CPS floor) and, inside a pool, by trunk id
+# so one customer's burst does not pace another customer's single dial.
+_last_dial_at: dict[str, float] = {}
@@
-def _pace_dial(min_gap_seconds: float = _DIAL_STAGGER_SECONDS) -> None:
-    """Hold until the trunk may carry another INVITE.
+def _pace_dial(min_gap_seconds: float = _DIAL_STAGGER_SECONDS, pool_id: int | None = None,
+               trunk_id: int | None = None) -> None:
+    """Hold until the pool (CPS) and the trunk may carry another INVITE.
@@
-    global _last_dial_at
     gap = max(_DIAL_STAGGER_SECONDS, float(min_gap_seconds or 0))
-    wait = _last_dial_at + gap - time.monotonic()
+    keys = [f"pool:{pool_id}" if pool_id is not None else "pool:legacy"]
+    if trunk_id is not None:
+        keys.append(f"trunk:{trunk_id}")
+    wait = max(_last_dial_at.get(k, 0.0) + gap - time.monotonic() for k in keys)
     if wait > 0:
         time.sleep(wait)
-    _last_dial_at = time.monotonic()
+    now = time.monotonic()
+    for k in keys:
+        _last_dial_at[k] = now
@@ def _dial_one(campaign: dict) -> None:
     inflight = calls_db.campaign_inflight(cid)
     slots = max(0, int(campaign.get("concurrency", 1) or 1) - inflight)
 
-    # Trunk-wide channel ceiling, shared by every campaign and tenant. A
-    # campaign set to 3 on a 2-channel trunk dials 2, then one more each time
-    # a live call ends — the carrier would reject the third outright.
-    trunk_free = _OUTBOUND_CHANNELS - calls_db.campaign_inflight_all()
-    if trunk_free < slots:
-        logger.info(
-            "campaign %s: %s slot(s) held back, trunk has %s outbound channel(s)",
-            cid, slots - max(0, trunk_free), _OUTBOUND_CHANNELS,
-        )
-    slots = min(slots, max(0, trunk_free))
+    # Two ceilings (plan section 2a): the campaign's trunk (its customer's
+    # lines) and the trunk's pool (what the carrier account bought minus the
+    # inbound reserve; the carrier rejects or silently drops past it). A
+    # number never allocated dials on the platform-shared trunk, whose lines
+    # equal OUTBOUND_CHANNEL_LIMIT, so this is today's behaviour until a
+    # customer buys lines.
+    trunk = telephony.trunk_for_number(from_number)
+    if trunk is None:
+        trunk_free = _OUTBOUND_CHANNELS - calls_db.campaign_inflight_all()  # migration not run: legacy gate
+        pool_id = None
+        trunk_id = None
+    else:
+        room = telephony.trunk_room(trunk["id"])
+        trunk_free = room["free"]
+        pool_id, trunk_id = trunk["pool_id"], trunk["id"]
+        if room["trunk_free"] < slots or room["pool_free"] < slots:
+            logger.info(
+                "campaign %s: %s slot(s) held back (trunk %s free %s, pool %s free %s)",
+                cid, slots - max(0, trunk_free), trunk_id, room["trunk_free"], pool_id, room["pool_free"],
+            )
+    slots = min(slots, max(0, trunk_free))
@@
-        _pace_dial(_campaign_gap_seconds(campaign))
+        _pace_dial(_campaign_gap_seconds(campaign), pool_id=pool_id, trunk_id=trunk_id)
```

`_OUTBOUND_CHANNELS` stays defined (the legacy gate and `ensure_platform_pool` both read
`OUTBOUND_CHANNEL_LIMIT`), so the env var keeps meaning "lines on the platform pool".

## Design note: which trunk a rotated caller ID counts against

`telephony.inflight_by_trunk` attributes a live dial to `campaigns.from_number`'s trunk. When
`campaign_caller_id` rotates a retry onto another number in `campaigns.from_numbers`, the call
should count against **that caller ID's own number's trunk** (the carrier bills and caps by the
number that places the call; coordinator decision, 22 Oct). `campaign_contacts` does not store
the caller id used per dial, so this needs `record_campaign_dial_result` (calls_db.py, blocked
until #253 merges) to persist it (e.g. `campaign_contacts.caller_id`), after which the join in
`inflight_by_trunk` switches to `COALESCE(cc.caller_id, c.from_number)`. Until then the primary
number's trunk carries the count, which over-counts that trunk and never under-counts the pool.

## Tests to add with the patch (server/test_campaign_dialer*.py)

- One pool, one platform trunk, limit 2: a campaign at concurrency 3 dials 2, as today.
- Two trunks (A: 2 lines, B: 1 line) on a pool of 3 allocatable: with 2 calls live on A, a campaign on B
  still gets 1 slot; with 3 live across the pool, nobody dials even if a trunk has a free line.
- A number with no `trunk_id` uses the platform trunk's cap.
- `_pace_dial` with different trunk ids on the same pool still waits the pool gap; different pools do not
  wait on each other.

## Follow-up, not in this patch: one dial worker per trunk

Today one thread runs `_dial_one` for every campaign in sequence and `place_outbound_call_direct`
runs in-line, so 20 due leads across customers take 40–60 s to all leave. A worker per trunk needs:
a trunk-keyed work queue filled by the pass (claim contacts per campaign as now), N daemon threads
(one per active trunk, created/retired as trunks change), the breaker counters and `_last_dial_at`
made thread-safe (a lock around `_note_dial_outcome`/`_trip_breaker`), and `claim_next_campaign_contact`
kept as the single point of mutual exclusion (it already is, via its conditional UPDATE). Instant
campaigns keep their head-of-queue priority inside each trunk's queue. Do this after the caps above
have run in production for a while; the caps alone keep the 60 s promise for the first N lines of
each customer, which is what Phase 5 measures.
