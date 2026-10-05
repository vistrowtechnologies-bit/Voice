import assert from 'node:assert/strict'
import { fieldLabel, leadEntries, leadSearchText, leadSummary } from '../src/lib/leadDetails.ts'

assert.equal(fieldLabel('enquiry_details'), 'What they said (their words)')
assert.equal(fieldLabel('some_new_field'), 'Some new field')

const asha = { lead_source: 'Facebook ad', budget: '₹10,000–₹20,000', city: 'Pune', business_type: 'Clothing store', website_requirement: 'New business website',
  enquiry_details: 'Wants WhatsApp ordering.', platform: 'fb', notes: 'call twice', junk: 'nan', blank: '  ' }
const e = leadEntries(asha)
assert.deepEqual(e.map((x) => x.key), ['business_type', 'website_requirement', 'enquiry_details', 'budget', 'city', 'lead_source', 'platform', 'notes'])
const s = leadSummary(asha)
assert.equal(s.headline, 'Clothing store · New business website')
assert.deepEqual(s.chips.map((c) => c.value), ['₹10,000–₹20,000', 'Pune'])
assert.equal(s.source, 'Facebook ad · FB')
assert.equal(s.words, 'Wants WhatsApp ordering.')

// A sparse WhatsApp lead (most real rows) still shows what it has.
const sparse = leadSummary({ lead_source: 'WhatsApp DM', enquiry_details: 'Hii' })
assert.equal(sparse.hasAny, true); assert.equal(sparse.headline, ''); assert.equal(sparse.source, 'WhatsApp DM')
assert.equal(leadSummary({}).hasAny, false); assert.equal(leadSummary(undefined).hasAny, false)
assert.ok(leadSearchText(asha).includes('pune') && leadSearchText(asha).includes('saree') === false)
console.log('lead details tests passed')
