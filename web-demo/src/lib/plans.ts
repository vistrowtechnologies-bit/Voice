// Shared pricing definition. Moved out of Billing.tsx so the dashboard's
// Billing page and the marketing site's /pricing page quote identical tiers
// from one source - they must never drift apart.

export interface Plan {
  name: string
  // Lowercase key matching server/calls_db.py's PLAN_PRICING / accounts.plan
  // values and the Razorpay plan-id env vars in server/razorpay_client.py.
  key: 'starter' | 'growth' | 'scale'
  price: string
  // One line, shown under the plan name - who this tier is actually for.
  description: string
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

// Real introductory prices are locked in - gates every ₹ figure and the
// checkout/top-up actions across marketing + dashboard billing pages.
// Mirrors server/calls_db.py's PRICING_FINALIZED - keep both in sync.
export const PRICING_FINALIZED = true

// Credits per minute = voice multiplier × model multiplier × channel rate (1).
// Tenant agents run Vistrow Bharat (sarvam/*), which server/calls_db.model_tier
// bills "premium" (2x); server/test_plan_policy.py checks this stays in sync.
export const BHARAT_MODEL_MULTIPLIER = 2
// Gemini Live replaces the voice pipeline; billed by model (calls_db.model_tier).
export const LIVE_MODEL_MULTIPLIER: Record<string, number> = { '2.5': 2, default: 6 }
export function creditsPerMinuteLabel(multiplier: number): string {
  const n = Math.max(0.75, multiplier)
  return `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, '')} credits/min`
}

// One-off credit top-ups. Mirrors agent/plan_policy.py's TOPUP_PACKS /
// TOPUP_MIN_CREDITS / TOPUP_MAX_CREDITS - the server prices and grants; this
// is display copy. The bonus is granted, only the base is invoiced.
export const TOPUP_PACKS: { key: string; credits: number; bonusPct: number }[] = [
  { key: '100', credits: 100, bonusPct: 0 },
  { key: '250', credits: 250, bonusPct: 5 },
  { key: '500', credits: 500, bonusPct: 10 },
  { key: '1000', credits: 1000, bonusPct: 15 },
]
export const TOPUP_MIN_CREDITS = 50
export const TOPUP_MAX_CREDITS = 10000

// Existing dashboard capabilities, not promises of unlimited usage or support.
const DASHBOARD_FEATURES = [
  'Scenario-based live testing & saved regression cases',
  'Call transcripts, recording playback & diagnostic timelines',
  'Conversation summaries & structured call analysis',
  'Contact imports, custom fields & activity history',
  'Widget visitor fields & page-specific agent routing',
  'Speech interruption, silence & call-duration controls',
  'Profile, device sign-out & privacy request controls',
]

export const PLANS: Plan[] = [
  {
    name: 'Starter',
    key: 'starter',
    price: '₹2,999',
    description: 'For trying voice AI on one real use case before you scale it up.',
    priceInr: 2999,
    creditsNum: 300,
    credits: '300 credits/mo',
    tag: null,
    features: [
      '1 AI agent',
      '1 knowledge base with approved answers',
      'Up to 5 concurrent calls',
      'Web calling widget',
      'Call history & analytics',
      'Call recording',
      'Post-call data extraction',
      'Live call transfer',
      'Custom functions',
      'Caller memory (recognizes returning callers)',
      'Background sound customization',
      'Calendar & appointment booking',
      ...DASHBOARD_FEATURES,
    ],
    lockedFeatures: ['Inbound + outbound campaigns', 'CRM webhook integration', 'Agent-assigned live catalog', 'Full API access', 'Premium voice tier'],
  },
  {
    name: 'Growth',
    key: 'growth',
    price: '₹5,999',
    description: 'For teams automating inbound and outbound campaigns.',
    priceInr: 5999,
    creditsNum: 1000,
    credits: '1,000 credits/mo',
    tag: 'Recommended',
    features: [
      '5 AI agents',
      '5 knowledge bases with approved answers',
      'Agent-assigned live catalog (1 workspace feed)',
      'Up to 15 concurrent calls',
      'Web calling widget',
      'Call history & analytics',
      'Inbound + outbound campaigns',
      'CRM webhook integration',
      'Call recording',
      'Post-call data extraction',
      'Live call transfer',
      'Custom functions',
      'Caller memory (recognizes returning callers)',
      'Background sound customization',
      'Calendar & appointment booking',
      ...DASHBOARD_FEATURES,
    ],
    lockedFeatures: ['Full API access', 'Premium voice tier'],
  },
  {
    name: 'Scale',
    key: 'scale',
    price: '₹12,999',
    description: 'Full API access and integrations, built for production volume.',
    priceInr: 12999,
    creditsNum: 2500,
    credits: '2,500 credits/mo',
    tag: 'Most Popular',
    features: [
      '20 AI agents',
      'Up to 30 concurrent calls',
      'Web calling widget',
      'Call history & analytics',
      'Inbound + outbound campaigns',
      'CRM webhook integration',
      'Call recording',
      'Post-call data extraction',
      'Live call transfer',
      'Custom functions',
      'Caller memory (recognizes returning callers)',
      'Background sound customization',
      'Calendar & appointment booking',
      ...DASHBOARD_FEATURES,
      'Full API access',
      '15 knowledge bases with approved answers',
      'Agent-assigned live catalog (1 workspace feed)',
      'Premium voice tier',
    ],
  },
]

// Keep comparison cards focused on differences without hiding included capabilities.
export const SHARED_PLAN_FEATURES = PLANS[0].features.filter((feature) =>
  PLANS.every((plan) => plan.features.includes(feature)),
)
export const planHighlights = (plan: Plan) =>
  plan.features.filter((feature) => !SHARED_PLAN_FEATURES.includes(feature))
