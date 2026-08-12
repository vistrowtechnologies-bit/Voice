// Shared pricing definition. Moved out of Billing.tsx so the dashboard's
// Billing page and the marketing site's /pricing page quote identical tiers
// from one source - they must never drift apart.

export interface Plan {
  name: string
  // Lowercase key matching server/calls_db.py's PLAN_PRICING / accounts.plan
  // values and the Razorpay plan-id env vars in server/razorpay_client.py.
  key: 'starter' | 'growth' | 'scale'
  price: string
  // Mirrors server/calls_db.py's PLAN_PRICING - keep both in sync by hand
  // (see that dict's own comment for why they can't share a module).
  priceInr: number
  creditsNum: number
  credits: string
  tag: string | null
  features: string[]
  // Features shown greyed-out with a lock icon instead of a checkmark -
  // things this plan doesn't include yet, shown so an operator on a lower
  // tier can see what upgrading unlocks (currently just the Premium voice
  // tier, gated to Scale).
  lockedFeatures?: string[]
}

// Months charged for an annual subscription - 10 months for 12 months of
// service, matching server/calls_db.py's ANNUAL_MONTHS_CHARGED.
export const ANNUAL_MONTHS_CHARGED = 10

// Flip to true once real introductory prices are locked in (after EnableX/
// LiveKit/Railway cost accounting is done) - gates every ₹ figure and the
// checkout/top-up actions across marketing + dashboard billing pages so
// nothing charges real money at these placeholder rates in the meantime.
// Mirrors server/calls_db.py's PRICING_FINALIZED - keep both in sync.
export const PRICING_FINALIZED = false

export const PLANS: Plan[] = [
  {
    name: 'Starter',
    key: 'starter',
    price: '₹2,999',
    priceInr: 2999,
    creditsNum: 300,
    credits: '300 credits/mo',
    tag: null,
    features: ['1 AI agent', '~5 concurrent calls', 'Web calling widget', 'Call history & analytics'],
    lockedFeatures: ['Premium voice tier'],
  },
  {
    name: 'Growth',
    key: 'growth',
    price: '₹5,999',
    priceInr: 5999,
    creditsNum: 1000,
    credits: '1,000 credits/mo',
    tag: 'Recommended',
    features: ['5 AI agents', '~15 concurrent calls', 'Inbound + outbound campaigns', 'CRM webhook integration', 'Priority support'],
    lockedFeatures: ['Premium voice tier'],
  },
  {
    name: 'Scale',
    key: 'scale',
    price: '₹12,999',
    priceInr: 12999,
    creditsNum: 2500,
    credits: '2,500 credits/mo',
    tag: 'Most Popular',
    features: [
      '20 AI agents',
      '~30 concurrent calls',
      'Full API access',
      'Knowledge base (RAG)',
      'Dedicated success manager',
      'Premium voice tier',
    ],
  },
]
