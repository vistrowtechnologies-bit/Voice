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
  { value: 'city', label: 'City' },
  { value: 'job_title', label: 'Role' },
  { value: 'preferred_language', label: 'Preferred language' },
  { value: 'best_time_to_call', label: 'Best time to call' },
  { value: 'enquiry_details', label: 'What they said (their words)' },
  { value: 'website_url', label: 'Current website link' },
  { value: 'main_goal', label: 'Main goal or problem' },
  { value: 'enquiry_date', label: 'Enquiry date' },
  { value: 'referred_by', label: 'Referred by' },
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
  city: ['city', 'town', 'location', 'area', 'locality'],
  job_title: ['role', 'job title', 'designation', 'title', 'position'],
  preferred_language: ['preferred language', 'language preference', 'language', 'speaks', 'talk in'],
  best_time_to_call: ['best time to call', 'best time', 'call time', 'preferred time', 'when to call', 'availability'],
  enquiry_details: ['what they said (their words)', 'what they said', 'their words', 'enquiry details', 'inquiry details', 'requirement details', 'message', 'comments', 'remarks'],
  website_url: ['current website link', 'website url', 'current website', 'current website url', 'site url', 'website link', 'url', 'web address'],
  main_goal: ['main goal or problem', 'main goal', 'goal', 'problem', 'pain point', 'challenge', 'biggest problem', 'objective'],
  enquiry_date: ['enquiry date', 'inquiry date', 'lead date', 'date', 'created time', 'submitted on', 'created at'],
  referred_by: ['referred by', 'referrer', 'reference', 'referral name'],
}

// Facebook lead forms use the question as the column name ("what_type_of_website_do_you_need?",
// "approximate_budget?"). Matched by keywords after the exact names above, so a precise name
// always wins over a keyword guess.
const KEYWORD_RULES: [RegExp, string][] = [
  [/\bbudget\b/, 'budget'],
  [/\b(already|currently)?\s*have\b.*\bwebsite\b|\bexisting website\b/, 'has_website'],
  [/\bwebsite\b.*\b(need|want|looking|require|type|kind)\b|\b(type|kind) of website\b/, 'website_requirement'],
  [/\b(timeline|how soon|when do you|start)\b/, 'start_timeline'],
  [/\b(type|kind) of business\b|\bbusiness (type|category)\b/, 'business_type'],
  [/\bsource\b/, 'lead_source'],
]

export function normHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// header spelling -> [target, rank]; a lower rank is a better, more specific name.
const LOOKUP: Record<string, [string, number]> = {}
for (const [target, names] of Object.entries(SYNONYMS)) {
  names.forEach((n, rank) => { LOOKUP[normHeader(n)] = [target, rank] })
}

function keywordTarget(h: string): string | undefined {
  const n = normHeader(h)
  return KEYWORD_RULES.find(([re]) => re.test(n))?.[1]
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
    const hit = LOOKUP[normHeader(h)] ?? (keywordTarget(h) ? ([keywordTarget(h)!, 100] as [string, number]) : undefined)
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
  'City', 'Role', 'Preferred language', 'Best time to call', 'What they said (their words)',
  'Current website link', 'Main goal or problem', 'Enquiry date', 'Referred by',
]

// Obviously fake numbers, so nobody imports the sample rows by accident.
// Values are written the way an agent should say them aloud: plain words, not
// codes ("Within 30 days", not "30d"; "After 6 pm", not "18:00+").
export const SAMPLE_ROWS: string[][] = [
  ['Asha Verma', '+919000000001', 'asha@example.com', 'Verma Traders', 'meta-lead', 'Facebook ad', 'New business website', 'Clothing store', 'No',
    '₹10,000–₹20,000', 'Within 30 days', 'fb', 'Website offer', 'Pune', 'Owner', 'Hinglish', 'After 6 pm',
    'Sells sarees and kurtis from a shop in Camp. Wants customers to see the catalogue and order on WhatsApp.',
    '', 'Get online orders', '2026-10-01', ''],
  ['Rohit Patil', '+919000000002', 'rohit@example.com', 'Patil Clinic', 'meta-lead, doctors', 'Instagram ad', 'Website redesign', 'Dental clinic', 'Yes',
    '₹20,000+', 'Within 60 days', 'ig', 'Doctors campaign', 'Nagpur', 'Dentist and owner', 'Marathi', 'Mornings, 10 to 12',
    'The current site is slow and does not open well on phones. Wants patients to book appointments online.',
    'https://patilclinic.example.com', 'More appointment bookings', '2026-09-29', ''],
  ['Neha Singh', '+919000000003', '', '', 'referral', 'Referral', 'Landing page', 'Real estate', 'No',
    '', 'Within 30 days', '', '', 'Mumbai', 'Real estate agent', 'English', 'Weekends',
    'Launching a 2 BHK project in Thane in November. Needs one page that captures site-visit enquiries.',
    '', 'More site-visit enquiries', '2026-10-02', 'Rohit Patil'],
  ['Imran Sheikh', '+919000000004', 'imran@example.com', 'Sheikh Coaching Classes', 'website-visitor', 'Website chat', 'Mobile app', 'Education', 'Yes',
    '₹50,000+', 'Within 90 days', '', '', 'Hyderabad', 'Founder', 'Hindi', 'Evenings',
    'Wants a student app for recorded lectures and test series, with a parent login.',
    'https://sheikhclasses.example.com', 'Fewer students dropping out', '2026-09-30', ''],
]

// One line per column: what it is, the prompt token it becomes, how to use it.
// This is what makes a column reach the agent: it only sees a contact's extra
// fields where the agent's prompt contains the matching {{custom.<key>}} token.
export const COLUMN_GUIDE: [string, string, string][] = [
  ['Name, Phone, Email, Company', '{{name}} {{first_name}} {{phone}} {{company}}', 'Phone is the only required column. Names are used to greet; a blank name is skipped cleanly.'],
  ['Lead source', '{{custom.lead_source}}', 'Where they came from ("Facebook ad", "Referral"). Lets the agent say "you enquired through our ad".'],
  ['What they asked for', '{{custom.website_requirement}}', 'The service they want, in a few words ("Website redesign").'],
  ['What they said (their words)', '{{custom.enquiry_details}}', 'One or two plain sentences, as they said or typed it. The agent can echo these words back, which is what makes the call feel informed.'],
  ['Business type', '{{custom.business_type}}', '"Dental clinic", "Clothing store". Keep it to what you would say aloud.'],
  ['Has a website / Current website link', '{{custom.has_website}} {{custom.website_url}}', 'Yes or No, and the address if they have one.'],
  ['Main goal or problem', '{{custom.main_goal}}', 'What they want to achieve ("More appointment bookings"). Best single field for a relevant opening.'],
  ['Budget', '{{custom.budget}}', 'Write it as a spoken range ("₹10,000 to ₹20,000"). Leave blank if unknown; the agent should not guess.'],
  ['Wants it within', '{{custom.start_timeline}}', '"Within 30 days". Use words, not dates.'],
  ['City, Role', '{{custom.city}} {{custom.job_title}}', 'Helps the agent sound local and address them correctly ("Dentist and owner").'],
  ['Preferred language', '{{custom.preferred_language}}', '"Hindi", "Marathi", "English", "Hinglish". The agent can open in it.'],
  ['Best time to call', '{{custom.best_time_to_call}}', '"After 6 pm". Useful for callbacks.'],
  ['Enquiry date', '{{custom.enquiry_date}}', 'Day they enquired (YYYY-MM-DD). Lets the agent say "you enquired on Monday".'],
  ['Referred by', '{{custom.referred_by}}', 'Name of the person who referred them. Only fill when true.'],
  ['Platform, Campaign, Tags', '{{custom.platform}} {{custom.campaign_name}}', 'For your own tracking; rarely worth saying aloud.'],
]

// Pasted at the END of an agent prompt (per-call details last keeps the
// provider's prompt cache working for the long, unchanging part above them).
export const PROMPT_SNIPPET = [
  'About this contact (use only what is filled in; never guess a blank):',
  'Name: {{first_name}} {{last_name}}   Company: {{company}}',
  'City: {{custom.city}}   Role: {{custom.job_title}}   Language: {{custom.preferred_language}}   Best time: {{custom.best_time_to_call}}',
  'Came from: {{custom.lead_source}}   Asked for: {{custom.website_requirement}}   Business: {{custom.business_type}}',
  'Their words: {{custom.enquiry_details}}',
  'Goal: {{custom.main_goal}}   Budget: {{custom.budget}}   Wants it within: {{custom.start_timeline}}',
  'Has a website: {{custom.has_website}}   Website: {{custom.website_url}}   Referred by: {{custom.referred_by}}',
]

const README_ROWS: string[][] = [
  ['How to fill this sheet'],
  [''],
  ['1. Keep the column names in row 1, or rename them: we match common names automatically and you can fix any match before importing.'],
  ['2. One row per person. Only Phone is required; every other column is optional. Leave a cell blank when you do not know it: the agent skips blanks and never guesses.'],
  ['3. Phone numbers: include the country code (+91...) or enter a 10-digit Indian number.'],
  ['4. Delete the four example rows before you upload. Their numbers are fake.'],
  ['5. Write values the way the agent should SAY them: "Within 30 days", "After 6 pm", "₹10,000 to ₹20,000".'],
  ['6. A column reaches the agent only through its prompt token (table below). Add the tokens to the agent prompt, or paste the snippet at the bottom.'],
  ['7. Any extra column you add (notes, pincode...) can be imported as a custom field and used as {{custom.<name>}}.'],
  ['8. Up to 5,000 contacts per upload.'],
  [''],
  ['Column', 'Prompt token', 'What to put there'],
  ...COLUMN_GUIDE.map((r) => [...r]),
  [''],
  ['Paste at the END of the agent prompt:'],
  ...PROMPT_SNIPPET.map((l) => [l]),
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
  help['!cols'] = [{ wch: 44 }, { wch: 52 }, { wch: 100 }]
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
