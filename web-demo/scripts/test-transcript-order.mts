import assert from 'node:assert/strict'
import { TranscriptOrder } from '../src/lib/transcriptOrder.ts'
const order = new TranscriptOrder()
const greeting = { id: 'greeting', timestamp: 1000, text: 'hello' }
const later = { id: 'later', timestamp: 3000, text: 'later turn' }
const delayed = { id: 'delayed', timestamp: 2000, text: 'older caption' }
assert.deepEqual(order.sort([greeting, later]).map(x => x.id), ['greeting', 'later'])
assert.deepEqual(order.sort([greeting, later, delayed]).map(x => x.id), ['greeting', 'delayed', 'later'])
assert.deepEqual(order.sort([greeting, later, { ...delayed, text: 'final older caption' }]).map(x => x.id), ['greeting', 'delayed', 'later'])
const mixed = new TranscriptOrder()
assert.deepEqual(mixed.sort([{ id: 'typed', timestamp: 2500 }, delayed, greeting]).map(x => x.id), ['greeting', 'delayed', 'typed'])
const fallback = new TranscriptOrder()
const invalid = [{ id: 'missing' }, { id: 'nan', timestamp: NaN }, { id: 'zero', timestamp: 0 }]
assert.deepEqual(fallback.sort(invalid, 100).map(x => x.id), ['missing', 'nan', 'zero'])
assert.deepEqual(fallback.sort([...invalid].reverse(), 200).map(x => x.id), ['missing', 'nan', 'zero'])
assert.deepEqual(invalid.map(x => x.id), ['missing', 'nan', 'zero'])
console.log('Transcript ordering: delayed chunks, updates, typed input, invalid timestamps and stable ties passed')
