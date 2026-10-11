# Credit top-up, cancel subscription, and a separate Usage page (plan, 2026-10-11)

Owner asks (2026-10-10/11): a credit top-up menu/flow; cancel subscription;
and a **Usage** menu of its own, not mixed into Plan & billing, that is
clean, useful, shows live data and filters by date.

## 1. How billing works today (verified in code)

- **No credit ledger.** An account's allowance is one setting,
  `settings.credits_total` (10 on signup, 300 for the legacy account).
  Usage is recomputed on every read from `calls.duration_seconds` × channel
  rate (`credit_rate_{browser,widget,phone}`, all 1.0) × voice-tier
  multiplier (economy 0.75 / standard 1 / premium 2) × model multiplier,
  floored at 0.75 credits/min. 1 credit ≈ 1 standard minute.
- **Price per credit** is derived from the plan: Starter ₹2,999/300 =
  ₹10.00, Growth ₹5,999/1,000 = ₹6.00, Scale ₹12,999/2,500 = ₹5.20; overage
  1.4×; GST 18% on top (`with_gst`).
- **Credits are granted by**: signup seed; super-admin
  `POST /admin/accounts/{id}/credits`; `reset_plan_credits()` on
  `subscription.activated/charged`; and `add_topup_credits()` which already
  exists (`credits_total += N`).
- **Zero credits**: `agent/db.py:_trial_credits_exhausted()` refuses new
  calls for any account without an active subscription once
  `used >= credits_total`. Since no subscription rows exist, every account
  is hard-capped today, so top-up is the only self-serve way to keep calling.
- **Low-credit alerts** already exist (bell at 20% / 10% / 0, one-shot email
  that re-arms when the balance rises; CTA points to `/dashboard/billing`).
- **The top-up UI already exists but is switched off.** `Billing.tsx` has a
  "+ Buy credits" modal, `handleTopup()` opening Razorpay Checkout, and
  `verifyTopupPayment()`. Both top-up and plan upgrade are disabled because
  `razorpay_client.checkout_ready()` needs `BILLING_CHECKOUT_ENABLED=true`
  and a `rzp_live_` key (or `BILLING_ALLOW_TEST_CHECKOUT=true`), which were
  never set.

## 2. Razorpay state

`server/razorpay_client.py`: `create_order`, `verify_payment_signature`
(HMAC `order_id|payment_id`), `verify_webhook_signature`. Routes:
`POST /billing/topup` (admin; creates order + `invoices` row kind=`topup`),
`POST /billing/verify-payment`, webhook `POST /billing/razorpay/webhook` →
`_process_razorpay_event` (subscription.*, `payment.captured` → mark
invoice paid + `add_topup_credits`, `payment.failed`). No refund events.
Exactly-once relies on `mark_invoice_paid`'s atomic
`UPDATE … WHERE status != 'paid' RETURNING`. Invoices have gapless numbers
per FY and a GST document with CGST/SGST vs IGST split.

**Defects to fix before enabling**
1. **Cross-tenant verify can lose credits**: `billing_verify_payment` marks
   the invoice paid *before* checking the invoice belongs to the caller's
   account. Fix: look up by `(razorpay_order_id, account_id)` first.
2. **Credit apply is outside the paid transaction**: if
   `add_topup_credits` fails after `mark_invoice_paid` committed, the retry
   sees "already paid" and credits are never applied. Fix: one transaction
   `mark_topup_paid_and_credit`.
3. `billing_topup` has no upper bound; `verify-payment` uses `current_user`
   not admin.
4. **Renewal erases top-ups**: `reset_plan_credits()` overwrites
   `credits_total` on `subscription.charged`. Must be decided before
   subscriptions go live (recommend a separate `credits_topup` setting that
   carries forward).

## 3. Top-up design

- **Packs** in `server/plan_policy.py` mirrored in `web-demo/src/lib/plans.ts`:
  100 / 250 (+5%) / 500 (+10%) / 1,000 (+15%) credits; min 50, max 10,000;
  price = plan rate × credits + 18% GST. Bonus credits are granted, only the
  base is invoiced. "≈ N minutes on phone / widget" from `creditRates`.
- **Who**: admin/owner. Trial accounts allowed (they are the hard-capped
  ones). `checkout_ready()` stays the global kill switch.
- **Backend** (`token_api.py`, `calls_db.py`, no new table; the `invoices`
  row kind=`topup` is the record): `POST /billing/topup {pack|credits}`
  returns order, amounts, credits, bonus; `POST /billing/verify-payment`
  (admin) → `calls_db.mark_topup_paid_and_credit(account_id, order_id,
  payment_id)` in one transaction, returns new balance; `payment.captured`
  calls the same function; receipt email with invoice link; refunds
  (`refund.processed`) mark the invoice refunded and deduct, floored at 0,
  with a credit-note row rather than renumbering; super-admin account view
  lists top-ups.
- **Frontend**: extract the modal into `components/TopupModal.tsx` (pack
  cards with bonus badge and ≈ minutes, custom amount, GST/total, inline
  billing details when legal name is missing, Razorpay Checkout, success
  panel with new balance + invoice link). Open from the Billing page and
  from the header credits pill (`?tab=billing&topup=1`). The pill refreshes
  on a `vv:billing-changed` window event.
- **Auto top-up**: later; needs a tokenised card / eMandate.

## 4. Cancel subscription (owner request 2026-10-11)

Today no account has a subscription row (checkout is off), but the flow
must exist before plans go live:
- `POST /billing/subscription/cancel {at_period_end: true}` (admin):
  Razorpay `POST /v1/subscriptions/{id}/cancel` with
  `cancel_at_cycle_end=1`; store `subscriptions.cancel_at_period_end`
  and the end date; the plan stays active until then, then the webhook
  `subscription.cancelled` (already routed to `_process_razorpay_event`)
  downgrades to Starter/trial rules. Immediate cancel is not offered
  (no pro-rata refunds).
- UI on Plan & billing: "Cancel subscription" link under the plan card →
  confirmation modal listing what the workspace loses on the end date
  (agent limit, integrations, premium voices), a one-line reason picker
  (optional, stored for the owner), and the end date. After cancelling the
  card shows "Ends on <date> · Resume" (`POST /billing/subscription/resume`
  → Razorpay resume if still within the cycle).
- Notifications: bell + email at cancel and 3 days before the end date.
- Super-admin: cancellation visible in the account view with the reason.

## 5. Separate Usage page (owner request 2026-10-11)

Sidebar entry **Usage** (Monitor group) at `/dashboard/usage`, removed from
Plan & billing, which keeps only plan, credits balance, top-up, invoices and
cancellation.

Layout, top to bottom:
1. **Date range** picker: Today / 7 days / 30 days / This cycle / Custom
   (from–to), remembered per user. Everything below follows it.
2. **Headline tiles**: credits used, call minutes, calls, average credits
   per minute, and "credits left · ≈ days at this pace".
3. **Daily chart**: credits and minutes per day for the range, with the
   cycle allowance drawn as a line when the range is the current cycle.
4. **Breakdowns** as compact tables with share bars: by channel (phone /
   widget / browser), by agent, by voice tier, by model tier, by direction
   (inbound / outbound), by phone number. Each row: minutes, calls, credits.
5. **Top calls** in the range by credits, linking to the call.
6. **Live strip**: active calls right now (from `fetchActiveCalls`), with
   credits accruing; the page re-fetches every 30 s while open and when a
   call ends (existing room-ended signal).
7. **Export CSV** for the range (admin).

Backend: one endpoint `GET /usage?from=&to=&group=day|channel|agent|voice|
model|direction|number` built on the same per-call credit formula as
`billing_summary` (factor it into `calls_db.credits_for_call(row)` so the
two never disagree), plus `GET /usage/top-calls` and `GET /usage/export.csv`.
All account-scoped; dates in the user's timezone.

The current "Usage by call type / voice tier / model multipliers" blocks on
Plan & billing are replaced by a short "How credits are counted" note and a
link to Usage.

## 6. Phases

| Phase | Work | Effort |
|---|---|---|
| U1 | Usage page: endpoint, date filter, tiles, daily chart, breakdowns, top calls, live strip, CSV; sidebar entry; Billing page slimmed | 2.5–3 d |
| T0 | Enable Razorpay checkout on staging with test keys; register webhook events; supplier GST env | 0.5 d |
| T1 | Harden top-up backend (defects 1–3), packs, refunds, receipt email, admin view | 1–1.5 d |
| T2 | Top-up modal + pill + refresh | 1.5 d |
| C1 | Cancel/resume subscription endpoints, UI, notifications | 1 d |
| T4 | Auto top-up | design later |

Tests: verify-then-webhook and webhook-then-verify credit exactly once;
replayed event id no-ops; bad signature → 400; other tenant's order → 404
and untouched; min/max; refund floors at 0; bonus credited, base invoiced;
usage endpoint equals `billing_summary` for the cycle range; cancel sets
end date and keeps plan until then.

## Open questions for the owner
1. Pack sizes: plan-rate-derived (₹10/credit on Starter/trial) or fixed INR packs? Bonus %?
2. Do top-ups carry forward past a renewal? (recommended: yes)
3. B2C customers without GSTIN: simplified invoice?
4. Refund policy: full only, within how many days?
5. Cancel: at period end only (recommended) or also immediate?
