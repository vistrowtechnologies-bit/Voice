import { Room, RoomEvent, Track } from 'livekit-client'
import type { Participant, RemoteParticipant, RemoteTrack, TranscriptionSegment } from 'livekit-client'

// Must run synchronously at the top of the script — document.currentScript
// only reflects the executing <script> tag during that tag's own
// synchronous evaluation (this is also why the build targets IIFE, not ESM:
// module scripts are deferred and document.currentScript is null by then).
const scriptEl = document.currentScript as HTMLScriptElement | null
const siteKey = scriptEl?.dataset.siteKey
const apiBase = scriptEl?.dataset.apiBase?.replace(/\/$/, '')
const position = scriptEl?.dataset.position === 'bottom-left' ? 'bottom-left' : 'bottom-right'
const label = scriptEl?.dataset.label || 'Talk to us'
// 'default' (or the attribute missing entirely) keeps today's animated
// orb video exactly as-is - every other catalog key is a static color
// variant (widget_avatars.py) rendered as a plain <img> instead.
// let, not const - refreshed against the live dashboard value shortly
// after load (see _refreshSiteConfig below), so a plain HTML/"any other
// website" embed (a script tag pasted once, never touched again) still
// picks up a later avatar/greeting change instead of only ever showing
// whatever was baked in at copy-paste time. The WordPress plugin already
// did this server-side on every page load; this brings the same
// dashboard-is-source-of-truth behavior to every other embed method too.
let avatarKey = scriptEl?.dataset.avatar || 'default'
// Empty means "use the copy baked into this file" - keeps the actual
// default string in one place instead of duplicated into the dashboard,
// the WordPress plugin, and every existing site's stored settings.
let customGreeting = scriptEl?.dataset.greeting || ''
const DEFAULT_GREETING = "👋 Hi! I'm Artha - tap to get started."
const DEFAULT_CHAT_OPENER = "Hi, I'm Artha! What can I help you with today?"
// 'voice' (missing attribute defaults here too) is every existing install's
// exact current behavior, completely unchanged. 'chat' skips the call UI
// entirely; 'both' lets the visitor pick per attempt.
const widgetMode = scriptEl?.dataset.mode === 'chat' || scriptEl?.dataset.mode === 'both' ? scriptEl.dataset.mode : 'voice'

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

// The phone field only collects a bare local number (visitors shouldn't have
// to know or type their own country code) — this turns whatever digits they
// typed into the E.164 shape the backend requires. Fixed +91 since every
// campaign this widget currently runs on is India-only.
function toE164Phone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  const local = digits.length > 10 ? digits.slice(-10) : digits
  return `+91${local}`
}

// Same "typed garbage to get past a required field" check the backend
// enforces too (server/token_api.py's _looks_like_real_phone) — checked
// here first purely for instant feedback; the server is the real gate.
function isValidPhone(phone: string): boolean {
  const trimmed = phone.trim()
  if (!/^\+[1-9]\d{7,14}$/.test(trimmed)) return false
  const digits = trimmed.replace(/\D/g, '')
  const local = digits.length >= 10 ? digits.slice(-10) : digits
  if (new Set(local.split('')).size <= 3) return false
  const ascending = '01234567890123456789'
  const descending = '98765432109876543210'
  if (ascending.includes(local) || descending.includes(local)) return false
  return true
}

// Basic shape check only — the point is to catch typos before a call
// starts, not to be a full RFC 5322 validator.
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

const MIC_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11h-2z"/></svg>'
const MIC_OFF_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 11h-2a5 5 0 0 1-.2 1.4l1.5 1.5c.5-.9.7-1.9.7-2.9zM4.3 3 3 4.3l6 6V11a3 3 0 0 0 4.6 2.5l1.6 1.6A5 5 0 0 1 7 11H5a7 7 0 0 0 6 6.9V21h2v-3.1c.9-.1 1.7-.4 2.4-.9l3.3 3.3 1.3-1.3L4.3 3zM12 2a3 3 0 0 1 3 3v4.2L9 3.3A3 3 0 0 1 12 2z"/></svg>'
const END_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 9c-1.6 0-3.1.3-4.5.8-.4.2-.7.6-.7 1v2.9c0 .4-.2.8-.6 1-.9.5-1.8 1.1-2.5 1.8-.4.4-1 .4-1.4 0L.5 14.8c-.4-.4-.4-1 0-1.4C3.7 10 7.7 8 12 8s8.3 2 11.5 5.4c.4.4.4 1 0 1.4l-1.8 1.7c-.4.4-1 .4-1.4 0-.7-.7-1.6-1.3-2.5-1.8-.4-.2-.6-.6-.6-1v-2.9c0-.4-.3-.8-.7-1C15.1 9.3 13.6 9 12 9z"/></svg>'
const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"/></svg>'
const SEND_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 20V4l19 8-19 8zm2-3 11.9-5L5 7v4.2l7 .8-7 .8V17z"/></svg>'
const SPEAKER_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M4 9v6h4l5 5V4L8 9H4zm11.5 3a3.5 3.5 0 0 0-2-3.15v6.3A3.5 3.5 0 0 0 15.5 12z"/></svg>'
const SPEAKER_OFF_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M4 9v6h4l5 5V4L8 9H4zm14.7-1.3-1.4-1.4-2.3 2.3-2.3-2.3-1.4 1.4 2.3 2.3-2.3 2.3 1.4 1.4 2.3-2.3 2.3 2.3 1.4-1.4-2.3-2.3z"/></svg>'

const CSS = `
:host { all: initial; }
.av-root { position: fixed; ${position === 'bottom-left' ? 'left: 20px;' : 'right: 20px;'} bottom: 20px; z-index: 2147483000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }

@keyframes av-pulse-ring {
  0% { box-shadow: 0 0 0 0 rgba(168,85,247,.55); }
  70% { box-shadow: 0 0 0 16px rgba(168,85,247,0); }
  100% { box-shadow: 0 0 0 0 rgba(168,85,247,0); }
}
/* A one-off, larger attention "pop" on first paint — draws the eye once
   without being an annoying infinite bounce. The pulse ring keeps a subtle
   ongoing presence after it settles. */
@keyframes av-attention-pop {
  0% { transform: scale(1); }
  20% { transform: scale(1.18); }
  40% { transform: scale(0.94); }
  60% { transform: scale(1.08); }
  80% { transform: scale(0.98); }
  100% { transform: scale(1); }
}
.av-button { width: 68px; height: 68px; border-radius: 9999px; background: #000; border: none; padding: 0; overflow: hidden; cursor: pointer; animation: av-pulse-ring 2.6s ease-out infinite, av-attention-pop 1.1s ease-in-out 1; transition: transform .15s ease; }
.av-button:hover { transform: scale(1.06); }
.av-button video, .av-button img { width: 100%; height: 100%; object-fit: cover; transform: scale(1.5); }

/* max-width is capped relative to the viewport, not just a flat 220px -
   on a ~375-430px phone a fixed 220px bubble anchored 78px in from the
   OPPOSITE edge's own 20px offset reaches far enough across the screen to
   land on top of whatever else a site anchors in the other bottom corner
   (a WhatsApp chat button, in the case that surfaced this) instead of
   stopping with real clearance from it. */
.av-greeting { position: absolute; bottom: 8px; ${position === 'bottom-left' ? 'left: 78px;' : 'right: 78px;'} display: flex; align-items: center; gap: 8px; width: min(168px, calc(100vw - 148px)); background: #17121f; border: 1px solid #2a2440; color: #f5f3ff; padding: 10px 12px; border-radius: 14px; font-size: 13px; line-height: 1.35; box-shadow: 0 12px 30px rgba(0,0,0,.4); cursor: pointer; animation: av-fade-in .25s ease; box-sizing: border-box; }
.av-greeting span { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.av-greeting span { flex: 1 1 auto; min-width: 0; }
.av-greeting button { background: none; border: none; color: #7d7594; cursor: pointer; padding: 2px; display: flex; flex-shrink: 0; }
@keyframes av-fade-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

.av-panel { display: none; flex-direction: column; width: 300px; border-radius: 16px; background: #17121f; border: 1px solid #2a2440; color: #f5f3ff; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,.5); position: absolute; bottom: 78px; ${position === 'bottom-left' ? 'left: 0;' : 'right: 0;'} }
.av-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid #2a2440; }
.av-title { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.av-dot { width: 8px; height: 8px; border-radius: 9999px; background: #a855f7; }
.av-header-right { display: flex; align-items: center; gap: 10px; }
.av-timer { display: none; font-size: 12px; font-variant-numeric: tabular-nums; color: #b8b2cf; }
.av-timer.av-timer-warn { color: #f87171; font-weight: 700; }
.av-close { background: none; border: none; color: #9089b0; cursor: pointer; padding: 4px; display: flex; }


.av-form { padding: 18px 16px 16px; display: flex; flex-direction: column; gap: 10px; }
.av-form p { margin: 0 0 2px; font-size: 12.5px; color: #b8b2cf; }
.av-form label { font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #9089b0; }
.av-form input { background: #201b3b; border: 1px solid #2a2440; border-radius: 10px; color: #f5f3ff; padding: 9px 11px; font-size: 13.5px; outline: none; font-family: inherit; }
.av-form input:focus { border-color: #a855f7; }
.av-phone-wrap { display: flex; align-items: stretch; gap: 6px; }
.av-phone-prefix { display: flex; align-items: center; padding: 0 10px; background: #201b3b; border: 1px solid #2a2440; border-radius: 10px; font-size: 13.5px; color: #b8b2cf; font-weight: 600; }
.av-phone-wrap input { flex: 1; min-width: 0; }
.av-error { font-size: 12px; color: #f87171; min-height: 0; }
.av-error:empty { display: none; }
.av-submit { margin-top: 2px; background: linear-gradient(135deg,#a855f7,#7c3aed); border: none; border-radius: 10px; color: white; font-weight: 700; font-size: 13.5px; padding: 10px; cursor: pointer; }
.av-submit:disabled { opacity: .5; cursor: default; }

.av-typing-dots { display: inline-flex; gap: 3px; align-items: center; padding: 2px 0; }
.av-typing-dots span { width: 6px; height: 6px; border-radius: 9999px; background: #9089b0; animation: av-typing-bounce 1.2s infinite ease-in-out; }
.av-typing-dots span:nth-child(2) { animation-delay: .15s; }
.av-typing-dots span:nth-child(3) { animation-delay: .3s; }
@keyframes av-typing-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: .5; } 30% { transform: translateY(-4px); opacity: 1; } }
.av-chat-input-row { flex-shrink: 0; display: flex; align-items: center; gap: 8px; padding: 12px 16px 16px; border-top: 1px solid #2a2440; }
.av-chat-input-row input { flex: 1; min-width: 0; background: #201b3b; border: 1px solid #2a2440; border-radius: 10px; color: #f5f3ff; padding: 9px 11px; font-size: 13.5px; outline: none; font-family: inherit; }
.av-chat-input-row input:focus { border-color: #a855f7; }
.av-chat-send-btn { flex-shrink: 0; width: 36px; height: 36px; border-radius: 9999px; background: linear-gradient(135deg,#a855f7,#7c3aed); border: none; color: white; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.av-chat-send-btn:disabled { opacity: .5; cursor: default; }

/* Both views are fixed to the same total height (measured from the voice
   call's natural content height, header/branding excluded - those two are
   shared siblings) so a chat-only site's widget never renders shorter or
   taller than a voice site's. The transcript/messages area is the one
   flexible piece in both, growing to fill whatever room the rest of the
   view (orb+status, or just the input row) doesn't need. */
#av-call, #av-chat { display: flex; flex-direction: column; height: 447px; }
.av-body { flex-shrink: 0; padding: 18px 16px 2px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.av-orb { position: relative; width: 96px; height: 96px; border-radius: 9999px; overflow: hidden; background: #000; transition: transform .15s ease-out; }
.av-orb video, .av-orb img { width: 100%; height: 100%; object-fit: cover; transform: scale(1.5); }
.av-status { font-size: 12.5px; color: #b8b2cf; text-align: center; min-height: 18px; }
.av-transcript { display: flex; flex-direction: column; gap: 6px; flex: 1 1 auto; min-height: 0; overflow-y: auto; margin: 2px 16px 12px; padding: 12px 12px 8px; scroll-behavior: smooth; scrollbar-width: thin; scrollbar-color: #4a3f70 transparent; position: relative; border-radius: 12px; border: 1px solid rgba(168,85,247,.28); background: rgba(168,85,247,.04); }
.av-transcript::before { content: ''; position: absolute; top: -1px; left: 10%; right: 10%; height: 1px; background: linear-gradient(90deg, transparent, #c084fc, transparent); box-shadow: 0 0 8px 1px rgba(192,132,252,.9); }
.av-transcript::-webkit-scrollbar { width: 4px; }
.av-transcript::-webkit-scrollbar-track { background: transparent; }
.av-transcript::-webkit-scrollbar-thumb { background: #4a3f70; border-radius: 999px; }
.av-transcript::-webkit-scrollbar-thumb:hover { background: #5d4f8f; }
.av-transcript-empty { font-size: 12px; color: #7d7594; text-align: center; padding: 4px 0 8px; }
.av-bubble { max-width: 85%; padding: 6px 11px; border-radius: 12px; font-size: 12.5px; line-height: 1.4; word-break: break-word; }
.av-bubble-local { align-self: flex-end; background: linear-gradient(135deg,#a855f7,#7c3aed); color: #fff; }
.av-bubble-remote { align-self: flex-start; background: #201b3b; border: 1px solid #2a2440; color: #f5f3ff; }
.av-controls { flex-shrink: 0; display: flex; align-items: center; justify-content: center; gap: 14px; padding: 0 16px 16px; }
.av-ctrl-btn { width: 40px; height: 40px; border-radius: 9999px; border: 1px solid #2a2440; background: #201b3b; color: #b8b2cf; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.av-end-btn { width: 48px; height: 48px; border-radius: 9999px; background: #ef4444; color: white; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.av-branding { display: block; text-align: center; padding: 7px 0; font-size: 10px; font-weight: 600; letter-spacing: .02em; color: #6b6383; text-decoration: none; border-top: 1px solid #241f38; background: #140f1c; }
.av-branding:hover { color: #a78bda; }
audio { display: none; }
`

// 'default' keeps the animated video orb exactly as before; any other
// catalog key swaps in a static color-variant image instead (no video
// element to animate, so it's a plain <img>).
function avatarTag(id?: string): string {
  const idAttr = id ? ` id="${id}"` : ''
  if (avatarKey === 'default') {
    return `<video${idAttr} src="${apiBase}/agent-orb.mp4" autoplay loop muted playsinline></video>`
  }
  return `<img${idAttr} src="${apiBase}/widget-avatars/${avatarKey}.png" alt="" />`
}

function widgetHtml(label: string): string {
  return `
    <div class="av-root">
      <div id="av-greeting" class="av-greeting">
        <span id="av-greeting-text"></span>
        <button id="av-greeting-close" aria-label="Dismiss">${CLOSE_ICON}</button>
      </div>

      <div id="av-panel" class="av-panel">
        <div class="av-header">
          <div class="av-title"><span class="av-dot"></span>${label}</div>
          <div class="av-header-right">
            <span id="av-timer" class="av-timer">5:00</span>
            <button id="av-close" class="av-close">${CLOSE_ICON}</button>
          </div>
        </div>

        <div id="av-form" class="av-form" style="display:none;">
          <p>${widgetMode === 'chat' ? "Tell us who you are so the assistant can greet you properly." : "Tell us who's calling so the assistant can greet you properly."}</p>
          <label for="av-name">Name</label>
          <input id="av-name" type="text" autocomplete="name" placeholder="Your name" />
          <label for="av-phone">Phone number</label>
          <div class="av-phone-wrap">
            <span class="av-phone-prefix">+91</span>
            <input id="av-phone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="98765 43210" maxlength="10" />
          </div>
          <label for="av-email">Email (optional)</label>
          <input id="av-email" type="email" autocomplete="email" placeholder="you@example.com" />
          <p id="av-form-error" class="av-error"></p>
          <button id="av-submit" class="av-submit">${widgetMode === 'chat' ? 'Chat with my AI agent' : 'Talk to my AI agent'}</button>
        </div>

        <div id="av-chat" style="display:none;">
          <div id="av-chat-messages" class="av-transcript">
            <p class="av-transcript-empty">Ask anything - no call, just type.</p>
          </div>
          <div class="av-chat-input-row">
            <input id="av-chat-input" type="text" placeholder="Type a message…" autocomplete="off" />
            <button id="av-chat-send" class="av-chat-send-btn" aria-label="Send">${SEND_ICON}</button>
          </div>
        </div>

        <div id="av-call" style="display:none;">
          <div class="av-body">
            <div class="av-orb">
              ${avatarTag('av-orb-video')}
            </div>
            <p id="av-status" class="av-status">Connecting…</p>
          </div>
          <div id="av-transcript" class="av-transcript">
            <p class="av-transcript-empty">Your conversation will appear here.</p>
          </div>
          <div class="av-controls">
            <button id="av-mute" class="av-ctrl-btn">${MIC_ICON}</button>
            <button id="av-end" class="av-end-btn">${END_ICON}</button>
            <button id="av-speaker" class="av-ctrl-btn" aria-label="Mute Artha's voice">${SPEAKER_ICON}</button>
          </div>
          <div id="av-type-row" class="av-chat-input-row" style="display:none;">
            <input id="av-type-input" type="text" placeholder="Or type here instead…" autocomplete="off" />
            <button id="av-type-send" class="av-chat-send-btn" aria-label="Send">${SEND_ICON}</button>
          </div>
          <audio id="av-audio" autoplay></audio>
        </div>

        <a class="av-branding" href="https://www.vistrowvoice.com" target="_blank" rel="noopener">Powered by Vistrow Voice</a>
      </div>

      <button id="av-button" class="av-button" aria-label="${label}">
        ${avatarTag()}
      </button>
    </div>
  `
}

function init(): void {
  if (!siteKey || !apiBase) {
    console.error(
      '[Vistrow Voice widget] missing data-site-key or data-api-base on the <script> tag — widget not started.',
    )
    return
  }

  const host = document.createElement('div')
  host.id = 'vistrow-voice-widget-host'
  document.body.appendChild(host)
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = `<style>${CSS}</style>${widgetHtml(label)}`

  const button = shadow.getElementById('av-button') as HTMLButtonElement
  const greeting = shadow.getElementById('av-greeting') as HTMLDivElement
  const greetingClose = shadow.getElementById('av-greeting-close') as HTMLButtonElement
  const panel = shadow.getElementById('av-panel') as HTMLDivElement
  const closeBtn = shadow.getElementById('av-close') as HTMLButtonElement

  const formEl = shadow.getElementById('av-form') as HTMLDivElement
  const nameInput = shadow.getElementById('av-name') as HTMLInputElement
  const phoneInput = shadow.getElementById('av-phone') as HTMLInputElement
  const emailInput = shadow.getElementById('av-email') as HTMLInputElement
  const formError = shadow.getElementById('av-form-error') as HTMLParagraphElement
  const submitBtn = shadow.getElementById('av-submit') as HTMLButtonElement

  const chatEl = shadow.getElementById('av-chat') as HTMLDivElement
  const chatMessagesEl = shadow.getElementById('av-chat-messages') as HTMLDivElement
  const chatInput = shadow.getElementById('av-chat-input') as HTMLInputElement
  const chatSendBtn = shadow.getElementById('av-chat-send') as HTMLButtonElement

  const callEl = shadow.getElementById('av-call') as HTMLDivElement
  const statusEl = shadow.getElementById('av-status') as HTMLParagraphElement
  const transcriptEl = shadow.getElementById('av-transcript') as HTMLDivElement
  // 'av-orb-video' is a real <video> only when avatarKey is 'default' - a
  // color-variant catalog pick renders it as a plain <img> instead (see
  // avatarTag()), which has no playbackRate to animate.
  let orbVideoEl = shadow.getElementById('av-orb-video') as HTMLVideoElement | HTMLImageElement | null
  const orbEl = orbVideoEl?.parentElement as HTMLDivElement
  const timerEl = shadow.getElementById('av-timer') as HTMLSpanElement
  const muteBtn = shadow.getElementById('av-mute') as HTMLButtonElement
  const endBtn = shadow.getElementById('av-end') as HTMLButtonElement
  const speakerBtn = shadow.getElementById('av-speaker') as HTMLButtonElement
  const audioEl = shadow.getElementById('av-audio') as HTMLAudioElement
  const typeRow = shadow.getElementById('av-type-row') as HTMLDivElement
  const typeInput = shadow.getElementById('av-type-input') as HTMLInputElement
  const typeSendBtn = shadow.getElementById('av-type-send') as HTMLButtonElement
  // Set via textContent, never interpolated into the HTML template string -
  // this value can come from a customer's own dashboard/WordPress settings,
  // so it must never be trusted as markup.
  const greetingText = shadow.getElementById('av-greeting-text') as HTMLSpanElement
  greetingText.textContent = customGreeting || DEFAULT_GREETING

  // Best-effort, fire-and-forget - a slow/failed fetch just means this
  // load keeps whatever was baked into the script tag, same as before
  // this existed. Only avatar/greeting self-heal this way, not mode:
  // mode drives which panel views get built into the DOM at all (see
  // widgetHtml() above), so changing it after the fact would need a much
  // bigger rebuild than swapping an icon and a text node.
  fetch(`${apiBase}/widget/site-config?siteKey=${encodeURIComponent(siteKey)}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { avatar?: string; greeting?: string } | null) => {
      if (!data) return
      if (data.avatar && data.avatar !== avatarKey) {
        avatarKey = data.avatar
        button.innerHTML = avatarTag()
        if (orbEl) {
          orbEl.innerHTML = avatarTag('av-orb-video')
          orbVideoEl = shadow.getElementById('av-orb-video') as HTMLVideoElement | HTMLImageElement | null
        }
      }
      if (typeof data.greeting === 'string' && data.greeting !== customGreeting) {
        customGreeting = data.greeting
        greetingText.textContent = customGreeting || DEFAULT_GREETING
      }
    })
    .catch((err) => {
      console.warn('[Vistrow Voice widget] site-config refresh failed:', err)
    })

  let room: Room | null = null
  let micEnabled = true
  let stopVolumeReactivity: (() => void) | null = null
  let countdownInterval: number | null = null
  // Set by warmAgent() the instant the pre-call form opens, well before the
  // visitor finishes typing — startCall() hands this room name back to
  // /widget/token so it reuses the same (already agent-dispatching) room
  // instead of creating a fresh one, shaving the agent's cold-start wait off
  // the time the visitor spends filling in name/phone/email.
  let warmRoom: string | null = null

  // Hard cap on call length — every minute of every call costs real STT/LLM/
  // TTS spend, so an unattended or forgotten tab shouldn't run indefinitely.
  // Shown as a live countdown (not a silent cutoff) so it never feels like
  // the call just randomly dropped.
  const MAX_CALL_SECONDS = 5 * 60

  // A quiet greeting bubble after a few seconds does more to earn a click
  // than a button alone — dismissible, and only shown once per page load.
  const greetingTimer = window.setTimeout(() => {
    greeting.style.display = 'flex'
  }, 4000)

  function hideGreeting(): void {
    window.clearTimeout(greetingTimer)
    greeting.style.display = 'none'
  }

  function showNotice(text: string): void {
    greetingText.textContent = text
    greeting.style.display = 'flex'
  }

  function setStatus(text: string): void {
    statusEl.textContent = text
  }

  // Keyed by LiveKit's own segment id, which stays stable as an utterance
  // goes interim -> final - so a partial transcript is replaced in place
  // instead of appending a duplicate line once it finalizes. Both sides
  // (visitor + agent) render into the same scrolling area, matching the
  // dashboard's ActiveCallUI.tsx transcript panel.
  const transcriptBubbles = new Map<string, HTMLDivElement>()

  function resetTranscript(): void {
    transcriptBubbles.clear()
    transcriptEl.innerHTML = '<p class="av-transcript-empty">Your conversation will appear here.</p>'
  }

  // Only follows new lines automatically while the visitor is already at
  // (or near) the bottom - otherwise every interim speech-to-text update
  // (which fires continuously while either side is talking) would yank
  // the view back down the instant someone scrolls up to reread something,
  // making the panel feel stuck/unscrollable.
  const AUTO_SCROLL_THRESHOLD_PX = 24
  function isNearTranscriptBottom(): boolean {
    return transcriptEl.scrollHeight - transcriptEl.scrollTop - transcriptEl.clientHeight < AUTO_SCROLL_THRESHOLD_PX
  }

  function upsertTranscriptEntry(id: string, text: string, isLocal: boolean): void {
    const shouldStickToBottom = isNearTranscriptBottom()
    let bubble = transcriptBubbles.get(id)
    if (!bubble) {
      if (transcriptBubbles.size === 0) transcriptEl.innerHTML = ''
      bubble = document.createElement('div')
      bubble.className = `av-bubble ${isLocal ? 'av-bubble-local' : 'av-bubble-remote'}`
      transcriptEl.appendChild(bubble)
      transcriptBubbles.set(id, bubble)
    }
    // Set via textContent, never innerHTML - this is live speech-to-text
    // from an open microphone, never trusted as markup.
    bubble.textContent = text
    if (shouldStickToBottom) transcriptEl.scrollTop = transcriptEl.scrollHeight
  }

  // Same lk.agent.state values/labels the dashboard's browser-test-call UI
  // uses (web-demo/src/components/ActiveCallUI.tsx) — the agent worker
  // stamps this participant attribute as it moves through the turn.
  const STATE_LABELS: Record<string, string> = {
    listening: 'Listening…',
    thinking: 'Thinking…',
    speaking: 'Agent is speaking…',
  }

  // Ring animation baked into the video spins at this rate while the agent
  // is actively speaking, vs. 1x (its authored speed) otherwise — matches
  // web-demo's ActiveCallUI.tsx/DemoOrbCard.tsx SPEAKING_PLAYBACK_RATE.
  const SPEAKING_PLAYBACK_RATE = 2.2

  function applyAgentState(state: string | undefined): void {
    if (state && STATE_LABELS[state]) setStatus(STATE_LABELS[state])
    if (orbVideoEl instanceof HTMLVideoElement) {
      orbVideoEl.playbackRate = state === 'speaking' ? SPEAKING_PLAYBACK_RATE : 1
    }
  }

  function formatCountdown(totalSeconds: number): string {
    const m = Math.floor(totalSeconds / 60)
    const s = totalSeconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  function startCountdown(): void {
    let remaining = MAX_CALL_SECONDS
    timerEl.textContent = formatCountdown(remaining)
    timerEl.classList.remove('av-timer-warn')
    timerEl.style.display = 'inline'
    countdownInterval = window.setInterval(() => {
      remaining -= 1
      timerEl.textContent = formatCountdown(Math.max(0, remaining))
      if (remaining <= 30) timerEl.classList.add('av-timer-warn')
      if (remaining <= 0) {
        showNotice('⏱️ 5-minute call limit reached — feel free to start a new call anytime.')
        endCall()
      }
    }, 1000)
  }

  function stopCountdown(): void {
    if (countdownInterval !== null) {
      window.clearInterval(countdownInterval)
      countdownInterval = null
    }
    timerEl.style.display = 'none'
  }

  function warmAgent(): void {
    warmRoom = null
    fetch(`${apiBase}/widget/warm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteKey }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { room: string | null } | null) => {
        if (data?.room) warmRoom = data.room
      })
      .catch((err) => {
        // Best-effort only — startCall() falls back to a fresh room if this
        // never lands, so a failure here is silently swallowed.
        console.warn('[Vistrow Voice widget] warm request failed:', err)
      })
  }

  // Every panel view (pre-call form, chat, active call) is a sibling div
  // toggled via inline display - this just hides the other two before
  // whichever show*() function reveals its own.
  function hideAllPanelViews(): void {
    formEl.style.display = 'none'
    chatEl.style.display = 'none'
    callEl.style.display = 'none'
  }

  function openPanel(): void {
    hideGreeting()
    panel.style.display = 'flex'
    button.style.display = 'none'
  }

  function showForm(): void {
    hideAllPanelViews()
    openPanel()
    formError.textContent = ''
    formEl.style.display = 'flex'
    // No LiveKit room to pre-warm for a chat-only site - it never places a
    // call, so this would just create and abandon a room on every open.
    if (widgetMode !== 'chat') warmAgent()
  }

  let chatOpened = false
  let chatSessionId: string | null = null
  let chatStartedAt: string | null = null
  const chatLead = { name: '', phone: '', email: '' }
  function generateId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  }
  function showChat(name = '', phone = '', email = ''): void {
    hideAllPanelViews()
    openPanel()
    chatEl.style.display = 'flex'
    chatInput.focus()
    // Opens with a greeting bubble from Artha's side instead of a blank
    // history - only the first time per visit, so re-opening after closing
    // resumes the conversation instead of re-greeting.
    if (!chatOpened) {
      chatOpened = true
      chatSessionId = generateId()
      chatStartedAt = new Date().toISOString()
      chatLead.name = name
      chatLead.phone = phone
      chatLead.email = email
      const opener = customGreeting || DEFAULT_CHAT_OPENER
      appendChatBubble(opener, 'assistant')
      chatHistory.push({ role: 'assistant', content: opener })
    }
  }

  // The pre-call form always comes first, for every mode - it's the one
  // lead-capture moment this widget gets, chat included. What happens
  // after depends on widgetMode: 'voice' starts the call, 'chat' opens
  // the chat, 'both' asks which one now that name/phone are already in
  // hand.
  function handleButtonClick(): void {
    showForm()
  }

  interface ChatTurn {
    role: 'user' | 'assistant'
    content: string
  }
  const chatHistory: ChatTurn[] = []
  let chatSending = false

  function appendChatBubble(text: string, role: 'user' | 'assistant'): HTMLDivElement {
    const emptyState = chatMessagesEl.querySelector('.av-transcript-empty')
    if (emptyState) chatMessagesEl.innerHTML = ''
    const bubble = document.createElement('div')
    bubble.className = `av-bubble ${role === 'user' ? 'av-bubble-local' : 'av-bubble-remote'}`
    // textContent only - this is user-typed input and a model's reply,
    // never trusted as markup.
    bubble.textContent = text
    chatMessagesEl.appendChild(bubble)
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight
    return bubble
  }

  // Static, hardcoded markup (not user data) - safe to set via innerHTML,
  // same as the icon constants used throughout this file.
  function appendTypingBubble(): HTMLDivElement {
    const bubble = document.createElement('div')
    bubble.className = 'av-bubble av-bubble-remote'
    bubble.innerHTML = '<span class="av-typing-dots"><span></span><span></span><span></span></span>'
    chatMessagesEl.appendChild(bubble)
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight
    return bubble
  }

  async function sendChatMessage(): Promise<void> {
    const text = chatInput.value.trim()
    if (!text || chatSending) return
    chatInput.value = ''
    appendChatBubble(text, 'user')
    const priorHistory = [...chatHistory]
    chatHistory.push({ role: 'user', content: text })
    chatSending = true
    chatSendBtn.disabled = true
    const typingBubble = appendTypingBubble()
    try {
      const res = await fetch(`${apiBase}/widget/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteKey,
          message: text,
          history: priorHistory,
          sessionId: chatSessionId,
          startedAt: chatStartedAt,
          name: chatLead.name,
          phone: chatLead.phone,
          email: chatLead.email,
        }),
      })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      const data = (await res.json()) as { reply: string }
      typingBubble.remove()
      appendChatBubble(data.reply, 'assistant')
      chatHistory.push({ role: 'assistant', content: data.reply })
    } catch (err) {
      console.error('[Vistrow Voice widget] chat request failed:', err)
      typingBubble.remove()
      appendChatBubble('Sorry, something went wrong - please try again.', 'assistant')
    } finally {
      chatSending = false
      chatSendBtn.disabled = false
      chatInput.focus()
    }
  }

  function resetToIdle(): void {
    clearAgentJoinWatchdog()
    stopVolumeReactivity?.()
    stopVolumeReactivity = null
    stopCountdown()
    stopPresencePing()
    room = null
    micEnabled = true
    muteBtn.innerHTML = MIC_ICON
    speakerMuted = false
    audioEl.muted = false
    speakerBtn.innerHTML = SPEAKER_ICON
    typeRow.style.display = 'none'
    typeInput.value = ''
    panel.style.display = 'none'
    button.style.display = 'flex'
  }

  // Shows the error in the call panel and leaves it open for a few seconds
  // instead of resetting immediately — closing right away (the old
  // behavior) meant a failure looked exactly like "the widget opens and
  // shuts down instantly, never says anything," with zero chance to read
  // why. The visitor can still close it early via the X.
  function failCall(message: string): void {
    setStatus(message)
    window.setTimeout(resetToIdle, 4000)
  }

  let intentionalEnd = false
  // Suppresses the Disconnected handler for exactly one teardown — used by
  // the agent-join watchdog below when it abandons a dead room to retry
  // with a fresh one, so the handler neither closes the panel nor shows
  // "call ended unexpectedly" mid-retry.
  let suppressDisconnect = false
  let agentJoinTimer: number | null = null

  function clearAgentJoinWatchdog(): void {
    if (agentJoinTimer !== null) {
      window.clearTimeout(agentJoinTimer)
      agentJoinTimer = null
    }
  }

  function endCall(): void {
    intentionalEnd = true
    clearAgentJoinWatchdog()
    room?.disconnect()
    resetToIdle()
  }

  function toggleMute(): void {
    if (!room) return
    micEnabled = !micEnabled
    room.localParticipant.setMicrophoneEnabled(micEnabled)
    muteBtn.innerHTML = micEnabled ? MIC_ICON : MIC_OFF_ICON
  }

  // Mutes Artha's spoken audio only - the visitor's own mic keeps working
  // (or they can use the type box) and the transcript keeps showing every
  // reply as text either way, so muting the speaker never loses anything,
  // just silences it for someone who can't have audio playing right now.
  let speakerMuted = false
  function toggleSpeaker(): void {
    speakerMuted = !speakerMuted
    audioEl.muted = speakerMuted
    speakerBtn.innerHTML = speakerMuted ? SPEAKER_OFF_ICON : SPEAKER_ICON
    speakerBtn.setAttribute('aria-label', speakerMuted ? "Unmute Artha's voice" : "Mute Artha's voice")
  }

  // The agent worker's own "away"/silence check-in only ever watches for
  // VOICE activity - a visitor who's deliberately typing produces zero
  // audio, so without this it independently decides they've gone silent
  // and interrupts with a generic "are you still there?" while they're
  // mid-message. This reply-free keep-alive (agent/main.py's
  // _on_data_received, topic "typing-presence") tells it otherwise.
  const PRESENCE_PING_MS = 4000
  let presencePingInterval: number | null = null

  function startPresencePing(): void {
    stopPresencePing()
    presencePingInterval = window.setInterval(() => {
      if (!room) return
      room.localParticipant
        .publishData(new TextEncoder().encode(''), { reliable: false, topic: 'typing-presence' })
        .catch(() => {})
    }, PRESENCE_PING_MS)
  }

  function stopPresencePing(): void {
    if (presencePingInterval !== null) {
      window.clearInterval(presencePingInterval)
      presencePingInterval = null
    }
  }

  // 'both' mode's noisy-environment fallback: send what the visitor typed
  // as a data message the agent worker (agent/main.py) treats as if it
  // were a transcribed utterance, so it still replies out loud. Shown
  // immediately as a local transcript bubble - it never goes through STT,
  // so RoomEvent.TranscriptionReceived will never produce one for it.
  function sendTypedUtterance(): void {
    const text = typeInput.value.trim()
    if (!text || !room) return
    typeInput.value = ''
    upsertTranscriptEntry(`typed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text, true)
    room.localParticipant
      .publishData(new TextEncoder().encode(text), { reliable: true, topic: 'typed-utterance' })
      .catch((err) => console.warn('[Vistrow Voice widget] failed to send typed message:', err))
  }

  // Makes the orb visibly react to the agent's voice instead of just
  // looping — a lightweight Web Audio analyser on the subscribed track,
  // since this vanilla bundle has no LiveKit React hooks to lean on.
  function attachVolumeReactivity(track: RemoteTrack): () => void {
    try {
      const stream = new MediaStream([track.mediaStreamTrack])
      const audioCtx = new AudioContext()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      let raf = 0
      const tick = () => {
        analyser.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length / 255
        orbEl.style.transform = `scale(${1 + Math.min(avg, 1) * 0.16})`
        raf = requestAnimationFrame(tick)
      }
      tick()
      return () => {
        cancelAnimationFrame(raf)
        void audioCtx.close()
      }
    } catch (err) {
      console.warn('[Vistrow Voice widget] volume reactivity unavailable:', err)
      return () => {}
    }
  }

  // Standard GTM custom-event push — safe whether or not GTM has finished
  // loading yet (creates the array if needed; GTM drains it once its own
  // script initializes). Lets the host site's own Tag Manager container
  // fire a Google Ads conversion tag off a Custom Event trigger without any
  // code changes on their side.
  function pushGtmEvent(name: string, phone: string, email: string): void {
    try {
      const w = window as unknown as { dataLayer?: unknown[] }
      w.dataLayer = w.dataLayer || []
      w.dataLayer.push({
        event: 'vistrow_widget_lead_submit',
        vistrow_lead_name: name,
        vistrow_lead_phone: phone,
        vistrow_lead_email: email,
      })
    } catch (err) {
      console.warn('[Vistrow Voice widget] GTM dataLayer push failed:', err)
    }
  }

  async function startCall(name: string, phone: string, email: string, attempt = 0): Promise<void> {
    intentionalEnd = false
    formEl.style.display = 'none'
    callEl.style.display = 'flex'
    // Every call shows the type-instead box right alongside mic/end-call
    // from the start - no toggle to discover, no separate "chat mode" to
    // choose ahead of time. Typing is always a visible, equally-valid way
    // to talk to Artha, right there in the same call.
    typeRow.style.display = 'flex'
    setStatus('Connecting…')
    resetTranscript()

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      console.error('[Vistrow Voice widget] microphone permission error:', err)
      failCall('Microphone access was blocked — allow it in your browser and try again.')
      return
    }

    let token: string, url: string
    try {
      const res = await fetch(`${apiBase}/widget/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteKey, identity: randomId('visitor'), name, phone, email, room: warmRoom }),
      })
      warmRoom = null
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`${res.status} ${res.statusText}: ${body}`)
      }
      ;({ token, url } = (await res.json()) as { token: string; url: string })
    } catch (err) {
      console.error('[Vistrow Voice widget] token request failed:', err)
      failCall('Could not reach the call server — please try again shortly.')
      return
    }

    // Fires only once the lead is validated server-side and the call is
    // genuinely starting — not on raw button click, which could be an
    // invalid or incomplete submit. This is the real "form submission
    // succeeded" moment for ads conversion tracking. Skipped on the
    // watchdog's automatic retry so one visitor never counts twice.
    if (attempt === 0) pushGtmEvent(name, phone, email)

    try {
      room = new Room()
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) {
          track.attach(audioEl)
          stopVolumeReactivity = attachVolumeReactivity(track)
        }
      })
      room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        clearAgentJoinWatchdog()
        setStatus('Agent joined — say hello!')
        applyAgentState(participant.attributes?.['lk.agent.state'])
      })
      room.on(RoomEvent.ParticipantAttributesChanged, (changed: Record<string, string>) => {
        if ('lk.agent.state' in changed) applyAgentState(changed['lk.agent.state'])
      })
      room.on(RoomEvent.TranscriptionReceived, (segments: TranscriptionSegment[], participant?: Participant) => {
        const isLocal = participant?.identity === room?.localParticipant.identity
        for (const seg of segments) {
          upsertTranscriptEntry(seg.id, seg.text, isLocal)
        }
      })
      room.on(RoomEvent.Disconnected, () => {
        if (suppressDisconnect) {
          suppressDisconnect = false
          return
        }
        if (intentionalEnd) {
          resetToIdle()
        } else {
          console.warn('[Vistrow Voice widget] room disconnected unexpectedly')
          failCall('The call ended unexpectedly — please try again.')
        }
      })

      await room.connect(url, token)
      await room.localParticipant.setMicrophoneEnabled(true)
      // The agent usually joins the pre-created room BEFORE the visitor's
      // browser finishes connecting — ParticipantConnected never fires for
      // a participant that's already there, so without this check the UI
      // stayed stuck on "Waiting for the agent to join…" for the whole call.
      if (room.remoteParticipants.size > 0) {
        setStatus('Agent joined — say hello!')
        room.remoteParticipants.forEach((p: RemoteParticipant) => {
          applyAgentState(p.attributes?.['lk.agent.state'])
        })
      } else {
        setStatus('Waiting for the agent to join…')
      }
      startCountdown()
      // Dispatch loss (a deploy window, a worker hiccup) previously left the
      // visitor waiting forever. One silent retry with a completely fresh
      // room/token covers it; a second failure is shown honestly.
      clearAgentJoinWatchdog()
      agentJoinTimer = window.setTimeout(() => {
        agentJoinTimer = null
        if (!room || room.remoteParticipants.size > 0) return
        suppressDisconnect = true
        room.disconnect()
        stopVolumeReactivity?.()
        stopVolumeReactivity = null
        stopCountdown()
        room = null
        if (attempt === 0) {
          console.warn('[Vistrow Voice widget] no agent within 15s — retrying with a fresh call')
          setStatus('Still connecting — one moment…')
          void startCall(name, phone, email, 1)
        } else {
          failCall('The agent could not join the call — please try again in a moment.')
        }
      }, 15000)
    } catch (err) {
      console.error('[Vistrow Voice widget] LiveKit connect failed:', err)
      failCall('Could not connect the call — please try again.')
    }
  }

  function submitForm(): void {
    const name = nameInput.value.trim()
    const phone = toE164Phone(phoneInput.value)
    const email = emailInput.value.trim()
    if (!name) {
      formError.textContent = 'Please enter your name.'
      return
    }
    if (!isValidPhone(phone)) {
      formError.textContent = 'Enter a valid 10-digit phone number.'
      return
    }
    // Optional - only rejected if something was typed and it doesn't look
    // like an email, never required. Requiring it up front was costing
    // completed submissions for no benefit visitors who just want to
    // talk or type actually care about.
    if (email && !isValidEmail(email)) {
      formError.textContent = 'Enter a valid email address, or leave it blank.'
      return
    }
    formError.textContent = ''
    if (widgetMode === 'chat') {
      showChat(name, phone, email)
    } else {
      // 'voice' and 'both' both start the call directly - 'both' adds an
      // in-call "type instead" fallback (see the av-controls wiring below)
      // rather than asking the visitor to choose a mode up front.
      void startCall(name, phone, email)
    }
  }

  button.addEventListener('click', handleButtonClick)
  greeting.addEventListener('click', handleButtonClick)
  greetingClose.addEventListener('click', (e) => {
    e.stopPropagation()
    hideGreeting()
  })
  closeBtn.addEventListener('click', () => {
    room ? endCall() : resetToIdle()
  })
  submitBtn.addEventListener('click', submitForm)
  phoneInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitForm()
  })
  emailInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitForm()
  })
  chatSendBtn.addEventListener('click', () => void sendChatMessage())
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void sendChatMessage()
  })
  endBtn.addEventListener('click', endCall)
  muteBtn.addEventListener('click', toggleMute)
  speakerBtn.addEventListener('click', toggleSpeaker)
  typeSendBtn.addEventListener('click', sendTypedUtterance)
  typeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendTypedUtterance()
  })
  typeInput.addEventListener('focus', startPresencePing)
  typeInput.addEventListener('blur', stopPresencePing)
}

init()
