// Shared pricing definition. Moved out of Billing.tsx so the dashboard's
// Billing page and the marketing site's /pricing page quote identical tiers
// from one source — they must never drift apart.

export interface Plan {
  name: string
  price: string
  credits: string
  tag: string | null
  features: string[]
}

export const PLANS: Plan[] = [
  {
    name: 'Starter',
    price: '₹2,999',
    credits: '300 credits/mo',
    tag: null,
    features: ['1 AI agent', '~5 concurrent calls', 'Web calling widget', 'Call history & analytics'],
  },
  {
    name: 'Growth',
    price: '₹5,999',
    credits: '1,000 credits/mo',
    tag: 'Recommended',
    features: ['5 AI agents', '~15 concurrent calls', 'Inbound + outbound campaigns', 'CRM webhook integration', 'Priority support'],
  },
  {
    name: 'Scale',
    price: '₹12,999',
    credits: '2,500 credits/mo',
    tag: 'Most Popular',
    features: ['20 AI agents', '~30 concurrent calls', 'Full API access', 'Knowledge base (RAG)', 'Dedicated success manager'],
  },
]
