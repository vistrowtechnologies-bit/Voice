# Patch: `calls_db.ingest_inbound_lead(route=...)` for Meta lead rules

Prepared on branch `claude/meta-p2-routing` (Meta Lead Ads Phase 2, docs/META-LEAD-ADS-PLAN-2026-10-22.md). `server/calls_db.py` and `server/campaign_dialer.py` could not be edited: the edit guard reserves them for PRs #244/#253 until those merge. The diffs below are exact against commit 716dcd2f (the tip of `claude/meta-leads-phase1`, same `calls_db.py` as main) and pass `git apply --check` there. Apply once #253 has merged, under the existing Phase 2 claim on issue #2:

```bash
git apply docs/patches/calls_db-meta-route.patch
```

## Why

`meta_leads.resolve_route` picks the agent and caller number for a lead from its ad rule, form rule or Page default. Today `ingest_inbound_lead` only honours a per-route agent for ArthaLeads; every other source goes to the account's shared "Instant Lead Follow-up" campaign (first live agent with a number). Without this patch, Meta rules are recorded on the event (`route_agent_id`, `route_label`) but the call still comes from the generic agent, and the event says `route_not_wired_generic_agent`. `meta_leads.py` detects the new parameter with `inspect.signature` and starts passing `route=` the moment this lands; nothing else changes.

## What it changes

1. `_meta_campaign_setting_key(route)`: setting key `meta_instant_campaign_<sha256(agentId:fromNumber)[:20]>`, one campaign per (agent, caller number), as ArthaLeads routes have.
2. `get_or_create_instant_campaign`: a `meta_lead_ads` lead **with** a route gets its own campaign named **"Meta Instant Follow-up"** (agent and number from the route; the agent must be live and not the demo agent; unlike ArthaLeads it need not carry a knowledge base, because the rule was validated when saved and again on resolve). A Meta lead without a route keeps the generic shared campaign, so Phase 1 behaviour is unchanged.
3. `ingest_inbound_lead(..., route: dict | None = None)`: the route is honoured only for `source == "meta_lead_ads"` with `allow_call`; ArthaLeads keeps resolving its own.
4. `campaign_dialer._INSTANT_CAMPAIGN_NAMES` gains "Meta Instant Follow-up", so the dialer places those first in a pass, like the other instant campaigns (`campaign_dialer.py:186,541`). No other name-based check exists for instant campaigns (`grep "Instant Follow-up"` over server/ finds only these).

## Tests

- `server/test_meta_leads.py::test_a_processed_lead_stores_its_route_and_is_queued_for_the_rules_agent` asserts, when `_INGEST_ACCEPTS_ROUTE` is true, that the queued contact's campaign is "Meta Instant Follow-up" with the rule's agent and number. With this patch applied in a scratch copy: 24/24 twice, full server suite **961 passed**. Without it the same test asserts the `route_not_wired_generic_agent` reason (verified: 0 failures with the parameter forced off).
- `server/test_instant_lead_calls.py` (ArthaLeads and generic paths) unchanged and passing.
- Add to `test_campaign_dialer*.py` when applying: a "Meta Instant Follow-up" campaign sorts before a bulk campaign in a pass (same assertion the ArthaLeads name already has).

## Diff: `server/calls_db.py`

```diff
--- a/server/calls_db.py
+++ b/server/calls_db.py
@@ -6923,6 +6923,14 @@
         return False
     value = value.strip().casefold().rstrip("/")
     return value == match or (source == "website" and match in value)
+
+
+def _meta_campaign_setting_key(route: dict) -> str:
+    """One "Meta Instant Follow-up" campaign per (agent, caller number), as
+    ArthaLeads routes have, so a Page/form/ad rule's agent is the one that
+    calls (meta_leads.resolve_route)."""
+    digest = hashlib.sha256(f"{route.get('agentId')}:{route.get('fromNumber')}".encode()).hexdigest()[:20]
+    return f"meta_instant_campaign_{digest}"
 
 
 def _arthaleads_campaign_setting_key(route: dict) -> str:
@@ -7149,16 +7157,22 @@
     conn = _connect()
     try:
         arthaleads = source == "arthaleads"
+        # A Meta lead with a resolved Page/form/ad route gets that route's own
+        # campaign; without one it uses the generic shared campaign below.
+        meta_routed = source == "meta_lead_ads" and bool(route)
         setting_key = "arthaleads_instant_campaign_id" if arthaleads else _INSTANT_LEAD_CAMPAIGN_ID_SETTING
-        if arthaleads:
+        if arthaleads or meta_routed:
             if not route:
                 return None
             agent_id = int(route.get("agentId") or 0)
             from_number = str(route.get("fromNumber") or "")
-            setting_key = _arthaleads_campaign_setting_key(route)
+            setting_key = _meta_campaign_setting_key(route) if meta_routed else _arthaleads_campaign_setting_key(route)
+            # ArthaLeads agents must carry a knowledge base; a Meta rule's agent
+            # was validated when the rule was saved and again on resolve.
             agent_row = conn.execute(
                 "SELECT id FROM agents WHERE id = ? AND account_id = ? AND status = 'live' "
-                "AND kb_id IS NOT NULL AND is_platform_demo = 0 AND (public_demo_slug = '' OR public_demo_slug IS NULL)",
+                + ("" if meta_routed else "AND kb_id IS NOT NULL ")
+                + "AND is_platform_demo = 0 AND (public_demo_slug = '' OR public_demo_slug IS NULL)",
                 (agent_id, account_id),
             ).fetchone()
             number_row = conn.execute(
@@ -7206,7 +7220,8 @@
                 "INSERT INTO campaigns (account_id, name, agent_id, from_number, status, "
                 f"started_at, max_attempts, retry_minutes, concurrency) "
                 f"VALUES (?, ?, ?, ?, 'running', {_NOW}, ?, ?, ?) RETURNING id",
-                (account_id, "ArthaLeads Instant Follow-up" if arthaleads else _INSTANT_LEAD_CAMPAIGN_NAME,
+                (account_id, "ArthaLeads Instant Follow-up" if arthaleads
+                 else ("Meta Instant Follow-up" if meta_routed else _INSTANT_LEAD_CAMPAIGN_NAME),
                  agent_row["id"], from_number, 3, 30, 2),
             )
             campaign_id = cur.fetchone()["id"]
@@ -7242,7 +7257,7 @@
 def ingest_inbound_lead(
     account_id: int, name: str, phone: str, source: str,
     external_id: str = "", custom_fields: dict | None = None, allow_call: bool = True,
-    requested_agent_id: str = "",
+    requested_agent_id: str = "", route: dict | None = None,
 ) -> dict:
     """Entry point for every external lead source (Facebook Lead Ads via
     Zapier or a native Meta webhook, WhatsApp Cloud API, or any other
@@ -7270,7 +7285,9 @@
     arthaleads_source = next((category for value in (
         fields.get("source_detail"), fields.get("lead_source"), fields.get("source"), fields.get("channel")
     ) if (category := _arthaleads_source(value))), "") if source == "arthaleads" else ""
-    route = None
+    # `route` is the caller's resolved {agentId, fromNumber, label}; only a Meta
+    # lead passes one (meta_leads.resolve_route). ArthaLeads resolves its own below.
+    route = route if (source == "meta_lead_ads" and allow_call and route) else None
     no_call_reason = "no_matching_enabled_route"
     if source == "arthaleads" and allow_call and requested_agent_id:
         # ArthaLeads routed the lead and named the agent: honour exactly that.
```

## Diff: `server/campaign_dialer.py`

```diff
--- a/server/campaign_dialer.py
+++ b/server/campaign_dialer.py
@@ -183,7 +183,7 @@
 # Instant-lead campaigns (see calls_db.get_or_create_instant_campaign) go
 # first in a pass, so a fresh lead is not dialled after a long list's batch
 # has used the trunk's channels.
-_INSTANT_CAMPAIGN_NAMES = ("ArthaLeads Instant Follow-up", "Instant Lead Follow-up")
+_INSTANT_CAMPAIGN_NAMES = ("ArthaLeads Instant Follow-up", "Instant Lead Follow-up", "Meta Instant Follow-up")
 
 
 def notify() -> None:
```
