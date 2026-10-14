#!/usr/bin/env node
// IndexNow: tell Bing (and Yandex, Seznam, Naver...) which pages changed, so they
// are recrawled within minutes instead of days. ChatGPT search reads Bing's index.
//
//   node web-demo/scripts/indexnow.mjs [--all] [--state <file>] [--dry-run]
//
// Reads the live sitemap, hashes each page's visible text (not the HTML, whose
// asset hashes change on every build), and submits only pages whose text changed
// since the last run (all of them with --all or when there is no state file).
// The key is the public file web-demo/public/<key>.txt, served at the site root.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ORIGIN = 'https://www.vistrowvoice.com'
const HOST = 'www.vistrowvoice.com'
const here = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(here, '..', 'public')
const keyFile = readdirSync(publicDir).find((f) => /^[a-f0-9]{32}\.txt$/.test(f))
if (!keyFile) throw new Error('IndexNow key file missing from web-demo/public')
const KEY = readFileSync(path.join(publicDir, keyFile), 'utf8').trim()

const args = process.argv.slice(2)
const all = args.includes('--all')
const dryRun = args.includes('--dry-run')
const stateFile = args.includes('--state') ? args[args.indexOf('--state') + 1] : '.indexnow-state.json'

const visibleText = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const sitemap = await (await fetch(`${ORIGIN}/sitemap.xml`)).text()
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
const previous = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {}
const next = {}
const changed = []
for (const url of urls) {
  const res = await fetch(url)
  if (!res.ok) continue
  const hash = createHash('sha256').update(visibleText(await res.text())).digest('hex')
  next[url] = hash
  if (all || previous[url] !== hash) changed.push(url)
}
console.log(`${urls.length} URLs in sitemap, ${changed.length} to submit`)

if (changed.length && !dryRun) {
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `${ORIGIN}/${keyFile}`, urlList: changed.slice(0, 10000) }),
  })
  // 200 = accepted, 202 = accepted pending key validation; anything else is a failure.
  console.log(`IndexNow responded ${res.status}`)
  if (res.status !== 200 && res.status !== 202) process.exit(1)
}
if (!dryRun) writeFileSync(stateFile, JSON.stringify(next, null, 0))
