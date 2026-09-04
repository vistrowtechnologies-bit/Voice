# Approved tier changes — local implementation

Implements the user's approval of the recommended feature-tier changes. Supersedes the earlier inventory's Scale-only knowledge/catalog description. Not deployed; not a claim that the complete billing lifecycle is ready.

## Built

- Starter: basic knowledge access, maximum one newly managed knowledge-base slot.
- Growth: five knowledge-base slots and access to the existing single-workspace live catalog, including agent assignment and background synchronization through the shared policy.
- Scale: fifteen knowledge-base slots; external API and premium voice eligibility remain Scale-only.
- Knowledge-base creation checks quota under an account row lock in the same transaction as insertion. Unknown plans are denied. Platform-owner exemption is explicit.
- Existing knowledge bases and assignments are retained and usable after a downgrade; creation is blocked when at/over the new cap. No data migration or deletion.
- Knowledge page loads server entitlements, shows usage/limit, disables unavailable creation/catalog actions, links to Billing and displays creation failures. The agent editor explains Growth+ catalog access while permitting removal of retained assignments.
- Public pricing renders the same plan array as Billing. Added grouped testing, diagnostics, call analysis, contact, widget and account features. Fixed the blanket “Scale only” label for Growth features.
- Removed unverified priority-support/dedicated-manager inclusions and unsupported on-prem marketing wording. Sales-assisted CTAs do not activate checkout.
- Existing prices, credits and account concurrency are unchanged. Carrier/rental charges remain separate in public copy.

## Boundaries

- Single-workspace catalog remains one feed, including Scale. No multiple-feed architecture was invented.
- Basic number-to-agent assignment already exists separately from Growth+ advanced inbound routes. Added basic-inbound policy vocabulary; no claim of new universal carrier integration or complete runtime/payment enforcement.
- No new seat, storage, testing, source-size, contact, API-throughput or retention quotas were imposed. These need a final numerical specification and existing-customer treatment. No existing recording was deleted.
- The previously identified credit ledger, webhook idempotency, annual grants, spend reservations and BYO rental reconciliation remain release blockers. Full-pipeline margin is still unverified. No live payment mode, prices in the payment provider, customer subscriptions, calls or deployment settings changed.
- Browser interaction and real database concurrency tests remain required before production rollout; offline mocks test SQL intent, not actual cross-process races.

## Verification

- 13 offline commercial-policy tests passed, including new knowledge quotas, owner exemption, tenant-scoped lock and cap rejection checks.
- TypeScript and Vite client build passed. Build emits a large-bundle warning.
- Full SSR/prerender build passed. It emitted router-match warnings; generated pricing HTML was separately checked for the shared heading and all three knowledge allowances and contains them. Browser visual acceptance is still pending.

Files: `agent/plan_policy.py`, `server/calls_db.py`, `server/test_plan_policy.py`, `web-demo/src/lib/plans.ts`, `web-demo/src/lib/api.ts`, `web-demo/src/pages/Billing.tsx`, `web-demo/src/pages/KnowledgeBasePage.tsx`, `web-demo/src/pages/AgentDetail.tsx`, `web-demo/src/pages/marketing/Pricing.tsx`.
