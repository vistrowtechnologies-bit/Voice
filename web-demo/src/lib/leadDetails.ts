import { LEAD_DETAIL_TARGETS } from './contactImport'

// How a contact's imported lead details are shown. The values live in the
// contact's custom fields (the same ones an agent reads as {{custom.<key>}}),
// so this only decides labels, order and what is worth a glance in a table.

const LABELS: Record<string, string> = {
  ...Object.fromEntries(LEAD_DETAIL_TARGETS.map((t) => [t.value, t.label])),
  platform: 'Platform',
}

// The order a person would read them in. Anything not listed follows, A to Z.
const ORDER = [
  'business_type', 'website_requirement', 'enquiry_details', 'main_goal', 'budget', 'start_timeline',
  'city', 'job_title', 'preferred_language', 'best_time_to_call', 'has_website', 'website_url',
  'lead_source', 'platform', 'campaign_name', 'enquiry_date', 'referred_by',
]

const EMPTY = new Set(['', 'nan', 'n/a', 'na', 'none', 'null', '-', '--', 'unknown', 'undefined'])
const clean = (v: unknown) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim()
  return EMPTY.has(s.toLowerCase()) ? '' : s
}

export function fieldLabel(key: string): string {
  return LABELS[key] ?? (key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()))
}

export interface LeadEntry { key: string; label: string; value: string }

/** Every filled field, known ones first in reading order, then the rest. */
export function leadEntries(custom: Record<string, string> | undefined | null): LeadEntry[] {
  const src = custom ?? {}
  const keys = Object.keys(src).filter((k) => clean(src[k]))
  const rank = (k: string) => { const i = ORDER.indexOf(k); return i === -1 ? ORDER.length : i }
  keys.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  return keys.map((key) => ({ key, label: fieldLabel(key), value: clean(src[key]) }))
}

export interface LeadSummary {
  headline: string
  chips: { label: string; value: string }[]
  words: string
  source: string
  hasAny: boolean
}

/** The glanceable version used in the contacts table. */
export function leadSummary(custom: Record<string, string> | undefined | null): LeadSummary {
  const c = custom ?? {}
  const g = (k: string) => clean(c[k])
  const headline = [g('business_type'), g('website_requirement')].filter(Boolean).join(' · ')
  const chips = (['budget', 'city', 'start_timeline', 'preferred_language'] as const)
    .map((k) => ({ label: fieldLabel(k), value: g(k) }))
    .filter((x) => x.value)
  const source = [g('lead_source'), g('platform') && g('platform').toUpperCase()].filter(Boolean).join(' · ')
  const words = g('enquiry_details')
  return { headline, chips, words, source, hasAny: !!(headline || chips.length || words || source) }
}

/** All values joined, for the contacts search box. */
export function leadSearchText(custom: Record<string, string> | undefined | null): string {
  return Object.values(custom ?? {}).map(clean).filter(Boolean).join(' ').toLowerCase()
}
