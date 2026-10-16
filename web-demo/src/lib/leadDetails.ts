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

// Leads sent over by ArthaLeads carry bookkeeping keys the bridge and the
// agent rely on (lead/org ids, dedupe key, routing category). They stay in
// the stored custom fields; the contact page just doesn't show them.
const ARTHALEADS_INTERNAL = new Set([
  'arthaleads_org_id', 'arthaleads_lead_id', 'arthaleads_source', 'external_id', 'channel_source', 'source',
])

// ArthaLeads opens a single lead only through in-app navigation state, not a
// URL, so the best link from here is its Leads page.
export const ARTHALEADS_LEADS_URL = 'https://app.arthaleads.com/leads'

/** Set when the contact came from ArthaLeads; `source` is e.g. "Facebook Ad" (may be empty). */
export function arthaleadsOrigin(custom: Record<string, string> | undefined | null): { source: string } | null {
  const c = custom ?? {}
  if (!clean(c.arthaleads_lead_id)) return null
  return { source: clean(c.lead_source) || clean(c.arthaleads_source) }
}

/** leadEntries for the contact page: an ArthaLeads lead loses its internal keys and its created_at is labelled. */
export function visibleLeadEntries(custom: Record<string, string> | undefined | null): LeadEntry[] {
  const entries = leadEntries(custom)
  if (!arthaleadsOrigin(custom)) return entries
  return entries
    .filter((e) => !ARTHALEADS_INTERNAL.has(e.key))
    .map((e) => (e.key === 'created_at' ? { ...e, label: 'Lead created' } : e))
}

/** Tag chips for the contact page: an ArthaLeads lead drops its "arthaleads" and
 *  "channel:" tags, and any "label:value" tag whose value the card already shows. */
export function visibleTags(tags: string[], custom: Record<string, string> | undefined | null): string[] {
  if (!arthaleadsOrigin(custom)) return tags
  const shown = new Set(visibleLeadEntries(custom).map((e) => e.value.slice(0, 60).toLowerCase()))
  return tags.filter((t) => {
    const tag = t.trim().toLowerCase()
    if (tag === 'arthaleads' || tag.startsWith('channel:')) return false
    const i = tag.indexOf(':')
    return i === -1 || !shown.has(tag.slice(i + 1).trim())
  })
}
