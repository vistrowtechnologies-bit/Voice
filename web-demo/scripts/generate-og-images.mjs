import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { OG_CARD_BY_IMAGE, SEO_PAGES } from '../src/lib/seoPages.ts'

const ROOT = path.dirname(fileURLToPath(import.meta.url)) + '/..'
const OUTPUT = path.join(ROOT, 'public', 'og')
const LOGO = pathToFileURL(path.join(ROOT, 'src', 'assets', 'vistrow-mark.png')).href
const ORB = pathToFileURL(path.join(ROOT, '..', 'launch-assets', 'vistrow-orb-still.png')).href
const MANROPE = pathToFileURL(path.join(ROOT, 'public', 'fonts', 'manrope-latin.woff2')).href
const SORA = pathToFileURL(path.join(ROOT, 'public', 'fonts', 'sora-latin.woff2')).href
const CHROME =
  process.env.CHROME_BIN ||
  (process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : 'google-chrome')

const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

function cardHtml(spec) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=1200,initial-scale=1">
<style>
@font-face{font-family:"Manrope";font-style:normal;font-weight:400 800;src:url("${MANROPE}") format("woff2")}@font-face{font-family:"Sora";font-style:normal;font-weight:600 800;src:url("${SORA}") format("woff2")}
*{box-sizing:border-box}html,body{margin:0;width:1200px;height:630px;overflow:hidden}
body{font-family:"Manrope","Noto Sans",sans-serif;color:#1a1523;background:#f4f2f9;position:relative}
.wash{position:absolute;inset:0;background:radial-gradient(circle at 83% 48%,color-mix(in srgb,${spec.accent} 18%,transparent),transparent 31%),radial-gradient(circle at 7% 102%,#fff 0,transparent 38%),linear-gradient(120deg,#fff 0%,#fbf9ff 54%,#f4f2f9 100%)}
.grid{position:absolute;inset:0;opacity:.28;background-image:linear-gradient(rgba(93,87,118,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(93,87,118,.08) 1px,transparent 1px);background-size:40px 40px;mask-image:linear-gradient(90deg,black,transparent 65%)}
.left{position:absolute;z-index:3;left:68px;top:48px;width:690px}
.brand{display:flex;align-items:center;gap:16px}.brand img{width:64px;height:64px;border-radius:16px;box-shadow:0 12px 30px rgba(126,34,206,.18)}
.brand-name{font-family:"Sora","Manrope",sans-serif;font-size:34px;line-height:1;font-weight:700;letter-spacing:-1.3px}.by{margin-left:2px;color:#7a7391;font-size:15px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
.eyebrow{margin-top:45px;color:${spec.accent};font-size:16px;font-weight:800;letter-spacing:.19em;text-transform:uppercase}
h1{margin:13px 0 0;max-width:690px;font-family:"Sora","Manrope","Noto Sans",sans-serif;font-size:58px;line-height:1.065;letter-spacing:-2.7px;font-weight:700;text-wrap:balance}
.native{margin-top:12px;color:${spec.accent};font-family:"Noto Sans","Manrope",sans-serif;font-size:24px;font-weight:700;letter-spacing:.02em}
.proof{display:inline-flex;margin-top:28px;padding:13px 18px;border:1px solid color-mix(in srgb,${spec.accent} 30%,#ddd7ec);border-radius:999px;background:rgba(255,255,255,.72);box-shadow:0 8px 24px rgba(26,21,35,.05);color:#5d5776;font-size:18px;font-weight:700;white-space:nowrap}
.orb-wrap{position:absolute;z-index:2;right:31px;top:61px;width:470px;height:470px;display:grid;place-items:center}
.orb-wrap:before,.orb-wrap:after{content:"";position:absolute;border-radius:50%;border:1px solid color-mix(in srgb,${spec.accent} 23%,transparent)}
.orb-wrap:before{inset:-12px;box-shadow:0 0 70px color-mix(in srgb,${spec.accent} 22%,transparent)}
.orb-wrap:after{inset:-42px;border-color:color-mix(in srgb,${spec.accent} 12%,transparent);box-shadow:0 0 0 18px color-mix(in srgb,${spec.accent} 4%,transparent),0 0 0 39px color-mix(in srgb,${spec.accent} 2.5%,transparent)}
.orb{width:410px;height:410px;overflow:hidden;border-radius:50%;background:#06030a;box-shadow:0 24px 68px color-mix(in srgb,${spec.accent} 34%,transparent)}
.orb img{width:100%;height:100%;display:block;object-fit:cover;filter:hue-rotate(${spec.hue}) saturate(1.08)}
.foot{position:absolute;z-index:4;left:69px;bottom:32px;display:flex;align-items:center;gap:10px;color:#7a7391;font-size:13px;font-weight:800;letter-spacing:.15em;text-transform:uppercase}.dot{width:7px;height:7px;border-radius:50%;background:${spec.accent};box-shadow:0 0 0 5px color-mix(in srgb,${spec.accent} 10%,transparent)}
</style></head><body>
<div class="wash"></div><div class="grid"></div>
<main class="left"><div class="brand"><img src="${LOGO}" alt=""><span class="brand-name">Vistrow Voice</span><span class="by">by Vistrow</span></div><div class="eyebrow">${escapeHtml(spec.eyebrow)}</div><h1>${escapeHtml(spec.headline)}</h1>${spec.native ? `<div class="native">${escapeHtml(spec.native)}</div>` : ''}<div class="proof">${escapeHtml(spec.proof)}</div></main>
<div class="orb-wrap"><div class="orb"><img src="${ORB}" alt=""></div></div>
<div class="foot"><span class="dot"></span><span>Real-time AI conversations</span></div>
</body></html>`
}

mkdirSync(OUTPUT, { recursive: true })
const temp = mkdtempSync(path.join(os.tmpdir(), 'vistrow-og-'))

try {
  const imageNames = [...new Set(SEO_PAGES.map((entry) => path.basename(entry.image, '.png')))]
  imageNames.forEach((name) => {
    const spec = OG_CARD_BY_IMAGE[name]
    if (!spec) throw new Error(`Missing OG card spec for ${name}`)
    const htmlPath = path.join(temp, `${name}.html`)
    const imagePath = path.join(OUTPUT, `${name}.png`)
    writeFileSync(htmlPath, cardHtml(spec))
    execFileSync(CHROME, [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      '--allow-file-access-from-files',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--no-first-run',
      '--no-default-browser-check',
      '--force-device-scale-factor=1',
      '--window-size=1200,630',
      '--run-all-compositor-stages-before-draw',
      `--screenshot=${imagePath}`,
      pathToFileURL(htmlPath).href,
    ], { stdio: 'ignore', timeout: 15000 })
    console.log(`generated public/og/${name}.png`)
  })
} finally {
  rmSync(temp, { recursive: true, force: true })
}
