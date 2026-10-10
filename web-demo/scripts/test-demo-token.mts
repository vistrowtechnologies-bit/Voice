import assert from 'node:assert/strict'
import { fetchLiveKitToken } from '../src/lib/livekit.ts'

// No network or rooms: exercise the real request with controlled transport.
const previousFetch = globalThis.fetch
const previousWindow = globalThis.window
let expire: (() => void) | undefined
let cleared = 0
globalThis.window = {
  setTimeout(fn: () => void, ms: number) {
    assert.equal(ms, 12_000)
    expire = fn
    return 1
  },
  clearTimeout() { cleared++ },
} as unknown as Window & typeof globalThis

try {
  globalThis.fetch = async (_url, init) => {
    assert.equal(JSON.parse(String(init?.body)).room, 'offline-room')
    assert.ok(init?.signal)
    return new Response(JSON.stringify({ token: 'offline', url: 'wss://offline.invalid' }))
  }
  assert.equal((await fetchLiveKitToken('offline', 'offline-room')).token, 'offline')
  assert.equal(cleared, 1)

  globalThis.fetch = async () => new Response('', { status: 503 })
  await assert.rejects(fetchLiveKitToken('offline', 'offline-room'), /status 503/)
  assert.equal(cleared, 2)

  globalThis.fetch = (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
  })
  const pending = fetchLiveKitToken('offline', 'offline-room')
  expire!()
  await assert.rejects(pending, /connection took too long/)
  assert.equal(cleared, 3)
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true }))
  await assert.rejects(fetchLiveKitToken('offline', 'offline-room'), /could not be prepared/)
  assert.equal(cleared, 4)
  console.log('Demo token success, server failure, hung-request and malformed-response checks passed; no network used.')
} finally {
  globalThis.fetch = previousFetch
  globalThis.window = previousWindow
}
