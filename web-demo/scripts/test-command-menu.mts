import assert from 'node:assert/strict'
import { chordTarget, detectMac, fuzzyScore, groupInOrder, rankItems } from '../src/lib/commandMenu.ts'

// Platform detection
assert.equal(detectMac({ platform: 'MacIntel' }), true)
assert.equal(detectMac({ platform: 'Win32' }), false)
assert.equal(detectMac({ userAgentData: { platform: 'macOS' }, platform: 'Win32' }), true)
assert.equal(detectMac({ userAgentData: { platform: 'Windows' }, platform: 'MacIntel' }), false)
assert.equal(detectMac({ platform: '', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' }), true)
assert.equal(detectMac({ platform: 'Linux x86_64' }), false)
assert.equal(detectMac(null), false)

// Fuzzy
assert.equal(fuzzyScore('All Calls History', 'callhist') !== null, true)
assert.equal(fuzzyScore('Agents', 'zzz'), null)
assert.equal(fuzzyScore('Agents', ''), 0)
assert.ok((fuzzyScore('Agents', 'age') as number) < (fuzzyScore('Agents', 'ats') as number))

const items = [
  { id: '1', label: 'Contacts', group: 'Pages', icon: 'x' },
  { id: '2', label: 'New contact', description: 'Add a person', group: 'Actions', icon: 'x' },
  { id: '3', label: 'Switch theme', keywords: 'dark light', group: 'Actions', icon: 'x' },
]
assert.deepEqual(rankItems(items, 'contact').map((i) => i.id), ['1', '2'])
assert.deepEqual(rankItems(items, 'dark').map((i) => i.id), ['3'])
assert.equal(rankItems(items, '').length, 3)
assert.deepEqual(rankItems(items, 'dkl').map((i) => i.id), []) // keywords are not matched loosely
assert.deepEqual(rankItems(items, 'person').map((i) => i.id), ['2'])
assert.deepEqual(groupInOrder(items).map((g) => g.group), ['Pages', 'Actions'])

// Chords
assert.equal(chordTarget('g', 'D')?.to, '/dashboard')
assert.equal(chordTarget('g', 'c')?.to, '/dashboard/contacts')
assert.equal(chordTarget('c', 'c')?.to, '/dashboard/contacts?add=1')
assert.equal(chordTarget('g', 'q'), null)
console.log('command menu tests passed')
