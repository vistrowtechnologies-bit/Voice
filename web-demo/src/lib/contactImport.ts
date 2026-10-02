import * as XLSX from 'xlsx'

// Column targets a file column can import as. Built-ins write to the contact
// itself; lead details become custom fields an agent reads as {{custom.<key>}}.
export const CONTACT_TARGETS = [
  { value: 'name', label: 'Full name' },
  { value: 'first_name', label: 'First name' },
  { value: 'last_name', label: 'Last name' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'company', label: 'Company' },
  { value: 'tags', label: 'Tags' },
] as const

export const LEAD_DETAIL_TARGETS = [
  { value: 'lead_source', label: 'Lead source' },
  { value: 'website_requirement', label: 'What they asked for' },
  { value: 'business_type', label: 'Business type' },
  { value: 'has_website', label: 'Has a website' },
  { value: 'budget', label: 'Budget' },
  { value: 'start_timeline', label: 'Wants it within' },
  { value: 'platform', label: 'Platform (fb / ig)' },
  { value: 'campaign_name', label: 'Campaign' },
] as const

// Header spellings people (and Facebook / Google lead exports) actually use.
// Compared after normHeader(), so case, spaces, dashes and underscores don't matter.
const SYNONYMS: Record<string, string[]> = {
  name: ['name', 'full name', 'fullname', 'contact name', 'customer name', 'lead name'],
  first_name: ['first name', 'firstname', 'first', 'given name'],
  last_name: ['last name', 'lastname', 'last', 'surname', 'family name'],
  phone: ['phone', 'phone number', 'phonenumber', 'mobile', 'mobile number', 'mobile no', 'cell', 'cell phone', 'contact number', 'whatsapp', 'whatsapp number', 'number', 'tel', 'telephone'],
  email: ['email', 'email address', 'e mail', 'mail', 'email id'],
  company: ['company', 'company name', 'organization', 'organisation', 'org', 'business name', 'firm'],
  tags: ['tags', 'tag', 'labels', 'label'],
  lead_source: ['lead source', 'source', 'leadsource', 'channel', 'utm source', 'how did you hear', 'origin'],
  website_requirement: ['what they asked for', 'requirement', 'website requirement', 'enquiry', 'inquiry', 'interested in', 'interest', 'looking for', 'service', 'service required', 'need'],
  business_type: ['business type', 'industry', 'business', 'category', 'profession', 'type of business'],
  has_website: ['has a website', 'has website', 'existing website', 'have a website', 'do you have a website', 'website'],
  budget: ['budget', 'budget range', 'price range', 'your budget'],
  start_timeline: ['wants it within', 'timeline', 'start timeline', 'when to start', 'when', 'urgency', 'start date', 'by when'],
  platform: ['platform', 'fb or ig', 'network', 'social platform'],
  campaign_name: ['campaign', 'campaign name', 'adset name', 'ad set name', 'form name', 'form'],
}

export function normHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// header spelling -> [target, rank]; a lower rank is a better, more specific name.
const LOOKUP: Record<string, [string, number]> = {}
for (const [target, names] of Object.entries(SYNONYMS)) {
  names.forEach((n, rank) => { LOOKUP[normHeader(n)] = [target, rank] })
}

const looksLikePhone = (v: string) => /^\+?[\d\s\-().]{10,16}$/.test(v.trim()) && v.replace(/\D/g, '').length >= 10
const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

export type GuessedMapping = Record<string, { target: string; auto: boolean }>

/**
 * First-pass column matching: by header name, then (for phone and email only)
 * by what the values look like. Each target is used at most once, so two
 * columns never both silently become "Phone". Anything unmatched is left as
 * Skip for the person to decide.
 */
export function guessMapping(headers: string[], sampleRows: string[][]): GuessedMapping {
  const out: GuessedMapping = {}
  const used = new Set<string>()
  headers.forEach((h) => { out[h] = { target: '', auto: false } })
  // Each target goes to the best-named column, not simply the first one:
  // "campaign_name" must beat "ad_name" for Campaign wherever it sits in the file.
  const best: Record<string, { h: string; rank: number }> = {}
  headers.forEach((h) => {
    const hit = LOOKUP[normHeader(h)]
    if (!hit) return
    const [target, rank] = hit
    if (!best[target] || rank < best[target].rank) best[target] = { h, rank }
  })
  for (const [target, { h }] of Object.entries(best)) {
    out[h] = { target, auto: true }
    used.add(target)
  }
  const sniff = (target: 'phone' | 'email', test: (v: string) => boolean) => {
    if (used.has(target)) return
    let best: { h: string; share: number } | null = null
    headers.forEach((h, i) => {
      if (out[h].target) return
      const vals = sampleRows.map((r) => (r[i] || '').trim()).filter(Boolean)
      if (vals.length < 2) return
      const share = vals.filter(test).length / vals.length
      if (share >= 0.7 && (!best || share > best.share)) best = { h, share }
    })
    if (best) {
      out[(best as { h: string }).h] = { target, auto: true }
      used.add(target)
    }
  }
  sniff('phone', looksLikePhone)
  sniff('email', looksLikeEmail)
  return out
}

export const SAMPLE_HEADERS = [
  'Name', 'Phone', 'Email', 'Company', 'Tags', 'Lead source', 'What they asked for',
  'Business type', 'Has a website', 'Budget', 'Wants it within', 'Platform', 'Campaign',
]

// Obviously fake numbers, so nobody imports the sample rows by accident.
export const SAMPLE_ROWS: string[][] = [
  ['Asha Verma', '+919000000001', 'asha@example.com', 'Verma Traders', 'meta-lead', 'Facebook ad', 'New business website', 'Clothing store', 'No', '₹10,000–₹20,000', 'Within 30 days', 'fb', 'Website offer'],
  ['Rohit Patil', '+919000000002', 'rohit@example.com', 'Patil Clinic', 'meta-lead, doctors', 'Instagram ad', 'Website redesign', 'Dental clinic', 'Yes', '₹20,000+', 'Within 60 days', 'ig', 'Doctors campaign'],
  ['Neha Singh', '+919000000003', '', '', 'referral', 'Referral', 'Landing page', 'Real estate', 'No', '', '', '', ''],
]

const README_ROWS = [
  ['How to fill this sheet'],
  [''],
  ['1. Keep the column names in row 1, or rename them: we match common names automatically and you can fix any match before importing.'],
  ['2. One row per person. Only Phone is required; every other column is optional.'],
  ['3. Phone numbers: include the country code (+91...) or enter a 10-digit Indian number.'],
  ['4. Delete the three example rows before you upload. Their numbers are fake.'],
  ['5. Any extra column you add (city, notes...) can be imported as a custom field the agent can use.'],
  ['6. Up to 5,000 contacts per upload.'],
]

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function downloadSampleSheet(kind: 'xlsx' | 'csv') {
  if (kind === 'csv') {
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
    const text = [SAMPLE_HEADERS, ...SAMPLE_ROWS].map((r) => r.map(esc).join(',')).join('\n')
    // BOM so Excel reads the ₹ sign as UTF-8.
    save(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }), 'vistrow-contacts-sample.csv')
    return
  }
  const wb = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([SAMPLE_HEADERS, ...SAMPLE_ROWS])
  sheet['!cols'] = SAMPLE_HEADERS.map((h) => ({ wch: Math.max(14, h.length + 2) }))
  XLSX.utils.book_append_sheet(wb, sheet, 'Contacts')
  const help = XLSX.utils.aoa_to_sheet(README_ROWS)
  help['!cols'] = [{ wch: 110 }]
  XLSX.utils.book_append_sheet(wb, help, 'How to fill')
  XLSX.writeFile(wb, 'vistrow-contacts-sample.xlsx')
}

/** Count data rows and extract them, for the pre-import summary. */
export function parseRows(csvText: string): string[][] {
  const wb = XLSX.read(csvText, { type: 'string' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const all = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, blankrows: false, raw: false, defval: '' })
  return all.slice(1)
}
