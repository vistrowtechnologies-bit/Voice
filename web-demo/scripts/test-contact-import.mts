import assert from 'node:assert/strict'
import { COLUMN_GUIDE, LEAD_DETAIL_TARGETS, PROMPT_SNIPPET, SAMPLE_HEADERS, SAMPLE_ROWS, guessMapping } from '../src/lib/contactImport.ts'

// Every sample column maps automatically, to the target we meant, once each.
const expected: Record<string, string> = {
  Name: 'name', Phone: 'phone', Email: 'email', Company: 'company', Tags: 'tags',
  'Lead source': 'lead_source', 'What they asked for': 'website_requirement', 'Business type': 'business_type',
  'Has a website': 'has_website', Budget: 'budget', 'Wants it within': 'start_timeline', Platform: 'platform',
  Campaign: 'campaign_name', City: 'city', Role: 'job_title', 'Preferred language': 'preferred_language',
  'Best time to call': 'best_time_to_call', 'What they said (their words)': 'enquiry_details',
  'Current website link': 'website_url', 'Main goal or problem': 'main_goal', 'Enquiry date': 'enquiry_date',
  'Referred by': 'referred_by',
}
const m = guessMapping(SAMPLE_HEADERS, SAMPLE_ROWS)
for (const h of SAMPLE_HEADERS) assert.equal(m[h].target, expected[h], `${h} -> ${m[h].target}, expected ${expected[h]}`)
assert.equal(new Set(SAMPLE_HEADERS.map((h) => m[h].target)).size, SAMPLE_HEADERS.length, 'a target was used twice')
assert.deepEqual(Object.keys(expected).sort(), [...SAMPLE_HEADERS].sort())

// Shape: every row is as wide as the header, only Phone is mandatory, phones are fake.
for (const r of SAMPLE_ROWS) {
  assert.equal(r.length, SAMPLE_HEADERS.length)
  assert.match(r[1], /^\+9190000000\d\d$/)
}
// Every lead-detail target is covered by a sample column and by the prompt guide.
const guideText = COLUMN_GUIDE.map((r) => r[1]).join(' ') + PROMPT_SNIPPET.join(' ')
for (const t of LEAD_DETAIL_TARGETS) {
  assert.ok(SAMPLE_HEADERS.includes(t.label) || t.value === 'platform', `no sample column for ${t.value}`)
  if (t.value !== 'platform') assert.ok(guideText.includes(`{{custom.${t.value}}}`), `no prompt token documented for ${t.value}`)
}
// Real Facebook-style headers still map as before (regression for the keyword rules).
const fb = guessMapping(['full_name', 'phone_number', 'email', 'what_type_of_website_do_you_need?', 'approximate_budget?', 'campaign_name', 'ad_name'], [])
assert.equal(fb['what_type_of_website_do_you_need?'].target, 'website_requirement')
assert.equal(fb['approximate_budget?'].target, 'budget')
assert.equal(fb.campaign_name.target, 'campaign_name')
console.log('contact import tests passed')
