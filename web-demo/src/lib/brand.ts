// Single source of truth for product identity. Everything user-facing pulls
// from here so a rebrand is one edit, never a codebase-wide grep-and-replace
// (which is exactly the mess the "Arthale" hardcoding created). Per-tenant
// names — the logged-in company, an agent's own display name — come from the
// account/agent record at runtime, NOT from here; this is only the platform
// brand and the generic defaults used before a tenant has set their own.

export const BRAND = {
  /** Product name, shown in nav, titles, marketing. */
  name: 'Vistrow Voice',
  /** Short company/wordmark form. */
  short: 'Vistrow',
  /** One-line positioning used on the marketing site + demo. */
  tagline: 'AI voice agents that answer, qualify, and book — in your customers’ language.',
  /** Default persona name for a freshly-seeded agent (tenants rename it). */
  defaultAgentName: 'Maya',
  /** Fallback workspace label before a tenant sets their company name. */
  defaultWorkspace: 'Your Workspace',
} as const
