import assert from 'node:assert/strict'
import {
  ARTHALEADS_LEADS_URL, arthaleadsOrigin, fieldLabel, leadEntries, leadSearchText, leadSummary, visibleLeadEntries, visibleTags,
} from '../src/lib/leadDetails.ts'

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

// An ArthaLeads lead, shaped like leads_inbound + ingest_inbound_lead store it.
const artha = {
  arthaleads_org_id: 'org1', arthaleads_lead_id: 'lead9', arthaleads_source: 'Facebook', channel_source: 'facebook',
  external_id: 'org1:lead9', source: 'arthaleads', created_at: '2026-10-16T06:55:28.076Z',
  lead_source: 'Facebook Ad', priority: 'Medium', status: 'New', budget: '50L', form_city_you_live_in: 'Pune',
}
assert.deepEqual(arthaleadsOrigin(artha), { source: 'Facebook Ad' })
assert.deepEqual(arthaleadsOrigin({ ...artha, lead_source: '' }), { source: 'Facebook' })
assert.equal(arthaleadsOrigin(asha), null)
const shown = visibleLeadEntries(artha)
assert.deepEqual(shown.map((x) => x.key).sort(), ['budget', 'created_at', 'form_city_you_live_in', 'lead_source', 'priority', 'status'])
assert.equal(shown.find((x) => x.key === 'created_at')?.label, 'Lead created')
assert.equal(ARTHALEADS_LEADS_URL, 'https://app.arthaleads.com/leads')
const artTags = ['arthaleads', 'source:Facebook Ad', 'priority:Medium', 'channel:facebook', 'project:Skyline', 'vip']
assert.deepEqual(visibleTags(artTags, artha), ['project:Skyline', 'vip'])
assert.deepEqual(visibleTags(artTags, { ...artha, priority: '' }), ['priority:Medium', 'project:Skyline', 'vip'])
// Other contacts are untouched, including their own "source" field and tags.
assert.deepEqual(visibleLeadEntries({ source: 'Expo', lead_source: 'Walk-in' }).map((x) => x.key), ['lead_source', 'source'])
assert.deepEqual(visibleTags(artTags, asha), artTags)
console.log('lead details tests passed')
