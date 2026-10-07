// Fails the build when the code asks for an icon that is not in the self-hosted
// icon font (public/fonts/material-symbols-subset.woff2). A missing glyph renders
// as a blank square, which nothing else would catch.
//
// To add icons: put the names in scripts/icon-names.txt (one per line), then
// regenerate the font with the names sorted and comma-joined:
//   NAMES=$(sort -u scripts/icon-names.txt | paste -sd, -)
//   CSS=$(curl -s -A "Mozilla/5.0 Chrome/126" "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@300,0&icon_names=$NAMES")
//   curl -s -o public/fonts/material-symbols-subset.woff2 "$(echo "$CSS" | grep -o 'https://[^)]*' | head -1)"
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const have = new Set(readFileSync(join(root, 'scripts/icon-names.txt'), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean))

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(f)) out.push(p)
  }
  return out
}

const missing = new Map()
for (const file of walk(join(root, 'src'))) {
  const text = readFileSync(file, 'utf8')
  // <Icon name="x" /> and icon: 'x' (data tables that feed <Icon name={...} />)
  const re = /(?:<Icon[^>]*\bname=|\bicon:\s*)(["'`])([a-z][a-z0-9_]*)\1/g
  for (const m of text.matchAll(re)) {
    if (!have.has(m[2])) missing.set(m[2], file.replace(root + '/', ''))
  }
}
if (missing.size) {
  console.error('Icons used in code but missing from the icon font subset:')
  for (const [name, file] of missing) console.error(`  ${name}  (${file})`)
  console.error('See the header of scripts/check-icons.mjs to add them.')
  process.exit(1)
}
console.log(`icon check ok (${have.size} glyphs)`)
