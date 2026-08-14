import { DisconnectReason, Room, RoomEvent, Track } from 'livekit-client'
import type { Participant, RemoteParticipant, RemoteTrack, TranscriptionSegment } from 'livekit-client'

// Must run synchronously at the top of the script — document.currentScript
// only reflects the executing <script> tag during that tag's own
// synchronous evaluation (this is also why the build targets IIFE, not ESM:
// module scripts are deferred and document.currentScript is null by then).
const scriptEl = document.currentScript as HTMLScriptElement | null
const siteKey = scriptEl?.dataset.siteKey
const apiBase = scriptEl?.dataset.apiBase?.replace(/\/$/, '')
// let, not const - refreshed live via site-config below (see host.dataset.side
// writes), the same self-refresh treatment as avatar/greeting/ask-fields.
// Baked into a :host([data-side]) attribute selector rather than interpolated
// into the CSS string directly, since that string is only ever injected once
// at init - an attribute on the host element is what a later JS write can
// actually still affect.
let position = scriptEl?.dataset.position === 'bottom-left' ? 'bottom-left' : 'bottom-right'
const label = scriptEl?.dataset.label || 'Talk to us'
const agentName = scriptEl?.dataset.agentName || 'Artha'
const ctaLabel = scriptEl?.dataset.ctaLabel || ''
const ctaUrl = scriptEl?.dataset.ctaUrl || ''
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
const DEFAULT_GREETING = "👋 Hi, I’m Artha. Tap to start."
const DEFAULT_CHAT_OPENER = "Hi, I'm Artha! What can I help you with today?"
// 'voice' is the backwards-compatible default; 'chat' skips LiveKit and
// 'both' lets the visitor choose on the welcome screen.
let widgetMode: 'voice' | 'chat' | 'both' =
  scriptEl?.dataset.mode === 'chat' || scriptEl?.dataset.mode === 'both' ? scriptEl.dataset.mode : 'voice'
// ask* default true, require* default true too except email (matches every
// install's behavior before any of this existed: name/phone always shown
// and mandatory, email always shown and optional) - only an explicit
// "false"/"true" flips one, so a missing attribute is never mistaken for
// opting out. require is meaningless once ask is false. Seeded from the
// script tag's own attributes for the very first render, then kept live by
// the site-config self-refresh below (unlike widgetMode, these don't
// decide which whole panel *views* exist - just show/hide within the
// already-rendered form - so updating them after the fact is a handful of
// style/label writes, not a rebuild) - a manually-pasted snippet (or, as
// shipped once, this codebase's own marketing site) that's never been
// updated since should still reflect whatever the dashboard says now.
let askName = scriptEl?.dataset.askName !== 'false'
let requireName = askName && scriptEl?.dataset.requireName !== 'false'
let askPhone = scriptEl?.dataset.askPhone !== 'false'
let requirePhone = askPhone && scriptEl?.dataset.requirePhone !== 'false'
let askEmail = scriptEl?.dataset.askEmail !== 'false'
let requireEmail = askEmail && scriptEl?.dataset.requireEmail === 'true'
function skipPreCallForm(): boolean {
  return !askName && !askPhone && !askEmail
}

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
const CHAT_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>'
const COPY_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/></svg>'
const ARROW_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'

const CSS = `
:host { all: initial; }
.av-root { position: fixed; right: 20px; bottom: 20px; z-index: 2147483000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
:host([data-side="left"]) .av-root { left: 20px; right: auto; }

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
/* The 1.5x zoom exists only for the orb video (agent-orb.mp4 has a lot of
   dark padding baked into the frame around the actual visual ring, so it
   needs cropping in to fill the circle) - a photo avatar is already a
   full-bleed square headshot and doesn't need it, so applying the same
   scale there was cropping straight through faces. */
.av-button video { width: 100%; height: 100%; object-fit: cover; transform: scale(1.5); }
.av-button img { width: 100%; height: 100%; object-fit: cover; }

/* max-width is capped relative to the viewport, not just a flat 220px -
   on a ~375-430px phone a fixed 220px bubble anchored 78px in from the
   OPPOSITE edge's own 20px offset reaches far enough across the screen to
   land on top of whatever else a site anchors in the other bottom corner
   (a WhatsApp chat button, in the case that surfaced this) instead of
   stopping with real clearance from it. */
.av-greeting { position: absolute; bottom: 6px; right: 80px; display: flex; align-items: center; gap: 8px; width: min(236px, calc(100vw - 128px)); min-height:56px; background: #17121f; border: 1px solid #2a2440; color: #f5f3ff; padding: 10px 12px; border-radius: 14px; font-size: 13px; line-height: 1.35; box-shadow: 0 12px 30px rgba(0,0,0,.4); cursor: pointer; animation: av-fade-in .25s ease; box-sizing: border-box; }
.av-greeting::after { content:'';position:absolute;right:-7px;top:50%;width:12px;height:12px;background:#17121f;border-top:1px solid #2a2440;border-right:1px solid #2a2440;transform:translateY(-50%) rotate(45deg); }
:host([data-side="left"]) .av-greeting { left: 80px; right: auto; }
:host([data-side="left"]) .av-greeting::after { left:-7px;right:auto;border:0;border-left:1px solid #2a2440;border-bottom:1px solid #2a2440; }
.av-greeting span { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.av-greeting span { flex: 1 1 auto; min-width: 0; }
.av-greeting button { background: none; border: none; color: #7d7594; cursor: pointer; padding: 2px; display: flex; flex-shrink: 0; }
@keyframes av-fade-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

.av-panel { display: none; flex-direction: column; width: 336px; max-height: min(660px, calc(100vh - 118px)); border-radius: 20px; background: #17121f; border: 1px solid #2f2744; color: #f5f3ff; overflow: hidden; box-shadow: 0 24px 70px rgba(0,0,0,.56), 0 0 0 1px rgba(168,85,247,.08); position: absolute; bottom: 78px; right: 0; animation: av-panel-in .24s cubic-bezier(.2,.8,.2,1); }
:host([data-side="left"]) .av-panel { left: 0; right: auto; }
@keyframes av-panel-in { from { opacity:0; transform:translateY(10px) scale(.98); } to { opacity:1; transform:none; } }
.av-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid #2a2440; }
.av-title { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.av-dot { width: 8px; height: 8px; border-radius: 9999px; background: #a855f7; }
.av-title-avatar { width: 22px; height: 22px; border-radius: 9999px; overflow: hidden; flex-shrink: 0; }
.av-title-avatar video, .av-title-avatar img { width: 100%; height: 100%; object-fit: cover; }
.av-title-avatar video { transform: scale(1.5); }
.av-header-right { display: flex; align-items: center; gap: 10px; }
.av-timer { display: none; font-size: 12px; font-variant-numeric: tabular-nums; color: #b8b2cf; }
.av-timer.av-timer-warn { color: #f87171; font-weight: 700; }
.av-end-chat { display:none; border:1px solid #4a3f62; background:#251e35; color:#d9d3e8; border-radius:999px; padding:5px 9px; font-family:inherit;font-size:10.5px;font-weight:600; cursor:pointer; }
.av-end-chat:hover,.av-end-chat:focus-visible { border-color:#a855f7;color:#fff; }
.av-close { background: none; border: none; color: #9089b0; cursor: pointer; padding: 7px; border-radius: 8px; display: flex; }
.av-close:hover, .av-close:focus-visible { background:#251e35; color:#fff; }

.av-welcome { padding: 24px 20px 22px; text-align:center; display:flex; flex-direction:column; align-items:center; gap:10px; }
.av-welcome-avatar { width:88px; height:88px; border-radius:999px; overflow:hidden; border:3px solid #8b5cf6; box-shadow:0 0 0 7px rgba(168,85,247,.12), 0 14px 38px rgba(88,28,135,.35); }
.av-welcome-avatar img,.av-welcome-avatar video { width:100%;height:100%;object-fit:cover; }
.av-welcome-avatar video { transform:scale(1.5); }
.av-welcome h2 { margin:8px 0 0; font-size:21px; line-height:1.2; }
.av-welcome p { margin:0; color:#b8b2cf; font-size:13px; line-height:1.5; }
.av-presence { display:inline-flex; align-items:center; gap:6px; color:#8ee8be !important; font-size:11px !important; font-weight:700; }
.av-presence::before { content:''; width:7px;height:7px;border-radius:99px;background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.16); }
.av-choice { width:100%; margin-top:10px; display:flex; flex-direction:column; gap:9px; }
.av-primary,.av-secondary,.av-complete-action { width:100%; min-height:44px; border-radius:12px; font:700 13.5px inherit; cursor:pointer; display:flex;align-items:center;justify-content:center;gap:9px; }
.av-primary { border:0; color:#fff; background:linear-gradient(135deg,#a855f7,#7c3aed); box-shadow:0 8px 24px rgba(126,58,237,.28); }
.av-primary:hover { filter:brightness(1.08); transform:translateY(-1px); }
.av-secondary { border:1px solid #39304e; color:#e9e5f6; background:#211a2e; }
.av-secondary:hover { border-color:#7657a5; background:#282037; }
.av-trust { display:flex;align-items:center;justify-content:center;gap:5px;margin-top:3px;color:#7f7897;font-size:10.5px; }


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
#av-call, #av-chat { display: flex; flex-direction: column; height: min(470px, calc(100vh - 180px)); }
.av-body { flex-shrink: 0; padding: 18px 16px 2px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.av-orb { position: relative; width: 96px; height: 96px; border-radius: 9999px; overflow: hidden; background: #000; transition: transform .15s ease-out, box-shadow .2s ease; box-shadow:0 0 0 7px rgba(168,85,247,.08),0 0 34px rgba(168,85,247,.22); }
.av-orb video { width: 100%; height: 100%; object-fit: cover; transform: scale(1.5); }
.av-orb img { width: 100%; height: 100%; object-fit: cover; }
.av-orb[data-state="listening"] { box-shadow:0 0 0 7px rgba(34,197,94,.12),0 0 30px rgba(34,197,94,.18); }
.av-orb[data-state="thinking"] { box-shadow:0 0 0 7px rgba(168,85,247,.13),0 0 38px rgba(168,85,247,.32); }
.av-orb[data-state="speaking"] { animation:av-avatar-live 1.05s ease-in-out infinite; }
@keyframes av-avatar-live { 50% { box-shadow:0 0 0 10px rgba(168,85,247,.2),0 0 48px rgba(192,132,252,.48); } }
.av-status { font-size: 12.5px; color: #b8b2cf; text-align: center; min-height: 18px; display:flex;align-items:center;gap:7px; }
.av-status::before { content:''; width:7px;height:7px;border-radius:99px;background:#a855f7;animation:av-status-pulse 1.3s ease-in-out infinite; }
@keyframes av-status-pulse { 50% { opacity:.35;transform:scale(.72); } }
.av-transcript { display: flex; flex-direction: column; gap: 6px; flex: 1 1 auto; min-height: 0; overflow-y: auto; margin: 2px 16px 12px; padding: 12px 12px 8px; scroll-behavior: smooth; scrollbar-width: thin; scrollbar-color: #4a3f70 transparent; position: relative; border-radius: 12px; border: 1px solid rgba(168,85,247,.28); background: rgba(168,85,247,.04); }
.av-transcript::before { content: ''; position: absolute; top: -1px; left: 10%; right: 10%; height: 1px; background: linear-gradient(90deg, transparent, #c084fc, transparent); box-shadow: 0 0 8px 1px rgba(192,132,252,.9); }
.av-transcript::-webkit-scrollbar { width: 4px; }
.av-transcript::-webkit-scrollbar-track { background: transparent; }
.av-transcript::-webkit-scrollbar-thumb { background: #4a3f70; border-radius: 999px; }
.av-transcript::-webkit-scrollbar-thumb:hover { background: #5d4f8f; }
.av-transcript-empty { font-size: 12px; color: #7d7594; text-align: center; padding: 4px 0 8px; }
.av-bubble { max-width: 85%; padding: 8px 11px; border-radius: 12px; font-size: 12.5px; line-height: 1.4; word-break: break-word; }
.av-bubble-local { align-self: flex-end; background: linear-gradient(135deg,#a855f7,#7c3aed); color: #fff; }
.av-bubble-remote { align-self: flex-start; background: #201b3b; border: 1px solid #2a2440; color: #f5f3ff; }
.av-assistant-row { width:100%; display:flex; align-items:flex-end; gap:7px; }
.av-assistant-row .av-bubble { max-width:calc(85% - 28px); }
.av-message-avatar { width:25px;height:25px;border-radius:999px;overflow:hidden;flex:0 0 25px;border:1.5px solid #8b5cf6;box-shadow:0 0 0 3px rgba(168,85,247,.1);position:relative; }
.av-message-avatar img,.av-message-avatar video { width:100%;height:100%;object-fit:cover;display:block; }
.av-message-avatar video { transform:scale(1.5); }
.av-assistant-row.av-typing .av-message-avatar { animation:av-avatar-speaking 1.2s ease-in-out infinite; }
@keyframes av-avatar-speaking { 50% { box-shadow:0 0 0 5px rgba(168,85,247,.22);transform:scale(1.04); } }
.av-controls { flex-shrink: 0; display: flex; align-items: center; justify-content: center; gap: 14px; padding: 0 16px 16px; }
.av-ctrl-btn { width: 40px; height: 40px; border-radius: 9999px; border: 1px solid #2a2440; background: #201b3b; color: #b8b2cf; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.av-end-btn { width: 48px; height: 48px; border-radius: 9999px; background: #ef4444; color: white; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.av-ctrl-btn:hover,.av-ctrl-btn:focus-visible { border-color:#7c3aed;color:#fff; }
.av-end-btn:hover,.av-end-btn:focus-visible { background:#dc2626;transform:scale(1.04); }
.av-complete { padding:25px 20px 22px; text-align:center; display:flex;flex-direction:column;align-items:center;gap:11px; }
.av-complete-icon { width:54px;height:54px;border-radius:99px;background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.3);color:#6ee7a5;display:flex;align-items:center;justify-content:center;font-size:25px; }
.av-complete-icon.av-complete-icon-error { background:rgba(239,68,68,.12);border-color:rgba(239,68,68,.38);color:#f87171; }
.av-complete h2 { margin:2px 0 0;font-size:20px; }
.av-complete p { margin:0;color:#a9a2bd;font-size:12.5px;line-height:1.5; }
.av-feedback { display:flex;align-items:center;justify-content:center;gap:10px;margin:4px 0; }
.av-feedback button { width:40px;height:40px;border:1px solid #39304e;border-radius:99px;background:#211a2e;color:#fff;cursor:pointer;font-size:18px; }
.av-feedback button:hover,.av-feedback button[aria-pressed="true"] { background:#3a2457;border-color:#a855f7;transform:scale(1.06); }
.av-feedback-note { width:100%;box-sizing:border-box;border:1px solid #39304e;border-radius:10px;background:#211a2e;color:#fff;padding:9px 11px;font:inherit;resize:none; }
.av-complete-actions { width:100%;display:flex;flex-direction:column;gap:8px; }
.av-complete-action { border:1px solid #39304e;color:#e9e5f6;background:#211a2e; }
.av-complete-action:hover { border-color:#7657a5; }
.av-complete-action.av-cta { color:#fff;border:0;background:linear-gradient(135deg,#a855f7,#7c3aed);text-decoration:none;box-sizing:border-box; }
.av-visually-hidden { position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important; }
.av-button:focus-visible,.av-primary:focus-visible,.av-secondary:focus-visible,.av-submit:focus-visible,.av-chat-send-btn:focus-visible,.av-complete-action:focus-visible { outline:3px solid rgba(192,132,252,.72);outline-offset:3px; }
.av-branding { display: block; text-align: center; padding: 7px 0; font-size: 10px; font-weight: 600; letter-spacing: .02em; color: #6b6383; text-decoration: none; border-top: 1px solid #241f38; background: #140f1c; }
.av-branding:hover { color: #a78bda; }
audio { display: none; }
@media (max-width:520px) {
  .av-root { right:16px;bottom:16px; }
  :host([data-side="left"]) .av-root { left:16px; }
  .av-panel,:host([data-side="left"]) .av-panel { position:fixed;left:10px;right:10px;bottom:10px;width:auto;max-height:calc(100dvh - 20px);border-radius:22px; }
  .av-greeting,:host([data-side="left"]) .av-greeting { left:auto;right:0;bottom:78px;width:min(260px,calc(100vw - 32px)); }
  .av-greeting::after,:host([data-side="left"]) .av-greeting::after { left:auto;right:25px;top:auto;bottom:-7px;border:0;border-right:1px solid #2a2440;border-bottom:1px solid #2a2440;transform:rotate(45deg); }
  #av-call,#av-chat { height:min(500px,calc(100dvh - 110px)); }
  .av-welcome { padding:25px 22px 23px; }
}
@media (prefers-reduced-motion:reduce) {
  .av-button,.av-panel,.av-greeting,.av-status::before,.av-typing-dots span { animation:none!important; }
  * { scroll-behavior:auto!important;transition-duration:.01ms!important; }
}
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

// Keep the same configured assistant identity inside the live call. The
// surrounding ring/state animation provides activity feedback without
// replacing Artha with an unrelated abstract visual.
function activityOrbTag(): string {
  return avatarTag('av-orb-video')
}

function widgetHtml(label: string): string {
  return `
    <div class="av-root">
      <div id="av-greeting" class="av-greeting">
        <span id="av-greeting-text"></span>
        <button id="av-greeting-close" aria-label="Dismiss">${CLOSE_ICON}</button>
      </div>

      <div id="av-panel" class="av-panel" role="dialog" aria-modal="false" aria-label="Talk to ${agentName}">
        <div class="av-header">
          <div class="av-title"><span class="av-title-avatar" id="av-title-avatar">${avatarTag()}</span>${label}</div>
          <div class="av-header-right">
            <span id="av-timer" class="av-timer">5:00</span>
            <button id="av-end-chat" class="av-end-chat">End chat</button>
            <button id="av-close" class="av-close" aria-label="Close assistant">${CLOSE_ICON}</button>
          </div>
        </div>

        <div id="av-welcome" class="av-welcome" style="display:none;">
          <div id="av-welcome-avatar" class="av-welcome-avatar">${avatarTag()}</div>
          <p class="av-presence">Online now</p>
          <h2>Hi, I’m ${agentName}</h2>
          <p>Choose how you’d like to connect. You can switch to typing during a voice call anytime.</p>
          <div class="av-choice">
            <button id="av-choose-voice" class="av-primary">${MIC_ICON} Start a voice conversation</button>
            <button id="av-choose-chat" class="av-secondary">${CHAT_ICON} Chat instead</button>
          </div>
          <span class="av-trust">🔒 Your conversation is private</span>
        </div>

        <div id="av-form" class="av-form" style="display:none;">
          <p>${widgetMode === 'chat' ? "Tell us who you are so the assistant can greet you properly." : "Tell us who's calling so the assistant can greet you properly."}</p>
          <div id="av-name-field" style="display:${askName ? 'flex' : 'none'};flex-direction:column;gap:10px;">
            <label for="av-name">Name${requireName ? '' : ' (optional)'}</label>
            <input id="av-name" type="text" autocomplete="name" placeholder="Your name" />
          </div>
          <div id="av-phone-field" style="display:${askPhone ? 'flex' : 'none'};flex-direction:column;gap:10px;">
            <label for="av-phone">Phone number${requirePhone ? '' : ' (optional)'}</label>
            <div class="av-phone-wrap">
              <span class="av-phone-prefix">+91</span>
              <input id="av-phone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="98765 43210" maxlength="10" />
            </div>
          </div>
          <div id="av-email-field" style="display:${askEmail ? 'flex' : 'none'};flex-direction:column;gap:10px;">
            <label for="av-email">Email${requireEmail ? '' : ' (optional)'}</label>
            <input id="av-email" type="email" autocomplete="email" placeholder="you@example.com" />
          </div>
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
              ${activityOrbTag()}
            </div>
            <p id="av-status" class="av-status" role="status" aria-live="polite">Connecting…</p>
          </div>
          <div id="av-transcript" class="av-transcript">
            <p class="av-transcript-empty">Your conversation will appear here.</p>
          </div>
          <div class="av-controls">
            <button id="av-mute" class="av-ctrl-btn" aria-label="Mute microphone">${MIC_ICON}</button>
            <button id="av-end" class="av-end-btn" aria-label="End call">${END_ICON}</button>
            <button id="av-speaker" class="av-ctrl-btn" aria-label="Mute Artha's voice">${SPEAKER_ICON}</button>
          </div>
          <div id="av-type-row" class="av-chat-input-row" style="display:none;">
            <input id="av-type-input" type="text" placeholder="Or type here instead…" autocomplete="off" />
            <button id="av-type-send" class="av-chat-send-btn" aria-label="Send">${SEND_ICON}</button>
          </div>
          <audio id="av-audio" autoplay></audio>
        </div>

        <div id="av-complete" class="av-complete" style="display:none;">
          <div id="av-complete-icon" class="av-complete-icon" aria-hidden="true">✓</div>
          <h2 id="av-complete-title">Conversation complete</h2>
          <p id="av-complete-summary">Thanks for speaking with ${agentName}.</p>
          <p>Was this helpful?</p>
          <div class="av-feedback" role="group" aria-label="Rate this conversation">
            <button id="av-feedback-up" aria-label="Helpful" aria-pressed="false">👍</button>
            <button id="av-feedback-down" aria-label="Not helpful" aria-pressed="false">👎</button>
          </div>
          <textarea id="av-feedback-note" class="av-feedback-note" rows="2" maxlength="500" placeholder="What went wrong? (optional)" style="display:none;"></textarea>
          <button id="av-feedback-send" class="av-complete-action" style="display:none;">Send</button>
          <div class="av-complete-actions">
            <button id="av-copy-transcript" class="av-complete-action">${COPY_ICON} Copy transcript</button>
            ${ctaLabel && ctaUrl ? `<a id="av-post-cta" class="av-complete-action av-cta" href="${ctaUrl}" target="_blank" rel="noopener">${ctaLabel} ${ARROW_ICON}</a>` : ''}
            <button id="av-new-conversation" class="av-complete-action">Start another conversation</button>
          </div>
          <span id="av-copy-status" class="av-visually-hidden" role="status" aria-live="polite"></span>
        </div>

        <a class="av-branding" href="https://www.vistrowvoice.com" target="_blank" rel="noopener">Powered by Vistrow Voice</a>
      </div>

      <button id="av-button" class="av-button" aria-label="${label}" aria-haspopup="dialog" aria-expanded="false">
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
  if (position === 'bottom-left') host.dataset.side = 'left'
  document.body.appendChild(host)
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = `<style>${CSS}</style>${widgetHtml(label)}`

  const button = shadow.getElementById('av-button') as HTMLButtonElement
  const titleAvatarEl = shadow.getElementById('av-title-avatar') as HTMLSpanElement
  const greeting = shadow.getElementById('av-greeting') as HTMLDivElement
  const greetingClose = shadow.getElementById('av-greeting-close') as HTMLButtonElement
  const panel = shadow.getElementById('av-panel') as HTMLDivElement
  const closeBtn = shadow.getElementById('av-close') as HTMLButtonElement
  const endChatBtn = shadow.getElementById('av-end-chat') as HTMLButtonElement
  const welcomeEl = shadow.getElementById('av-welcome') as HTMLDivElement
  const welcomeAvatarEl = shadow.getElementById('av-welcome-avatar') as HTMLDivElement
  const chooseVoiceBtn = shadow.getElementById('av-choose-voice') as HTMLButtonElement
  const chooseChatBtn = shadow.getElementById('av-choose-chat') as HTMLButtonElement

  const formEl = shadow.getElementById('av-form') as HTMLDivElement
  const nameFieldEl = shadow.getElementById('av-name-field') as HTMLDivElement
  const nameInput = shadow.getElementById('av-name') as HTMLInputElement
  const nameLabelEl = shadow.querySelector('label[for="av-name"]') as HTMLLabelElement
  const phoneFieldEl = shadow.getElementById('av-phone-field') as HTMLDivElement
  const phoneInput = shadow.getElementById('av-phone') as HTMLInputElement
  const phoneLabelEl = shadow.querySelector('label[for="av-phone"]') as HTMLLabelElement
  const emailFieldEl = shadow.getElementById('av-email-field') as HTMLDivElement
  const emailInput = shadow.getElementById('av-email') as HTMLInputElement
  const emailLabelEl = shadow.querySelector('label[for="av-email"]') as HTMLLabelElement
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
  const completeEl = shadow.getElementById('av-complete') as HTMLDivElement
  const completeIconEl = shadow.getElementById('av-complete-icon') as HTMLDivElement
  const completeTitleEl = shadow.getElementById('av-complete-title') as HTMLHeadingElement
  const completeSummaryEl = shadow.getElementById('av-complete-summary') as HTMLParagraphElement
  const feedbackUpBtn = shadow.getElementById('av-feedback-up') as HTMLButtonElement
  const feedbackDownBtn = shadow.getElementById('av-feedback-down') as HTMLButtonElement
  const feedbackNote = shadow.getElementById('av-feedback-note') as HTMLTextAreaElement
  const feedbackSendBtn = shadow.getElementById('av-feedback-send') as HTMLButtonElement
  const copyTranscriptBtn = shadow.getElementById('av-copy-transcript') as HTMLButtonElement
  const copyStatusEl = shadow.getElementById('av-copy-status') as HTMLSpanElement
  const newConversationBtn = shadow.getElementById('av-new-conversation') as HTMLButtonElement
  // Set via textContent, never interpolated into the HTML template string -
  // this value can come from a customer's own dashboard/WordPress settings,
  // so it must never be trusted as markup.
  const greetingText = shadow.getElementById('av-greeting-text') as HTMLSpanElement
  greetingText.textContent = customGreeting || DEFAULT_GREETING

  // Re-applies one pre-call field's live ask/require state to its wrapper
  // div (show/hide) and label text (the "(optional)" suffix) - not mode,
  // which decides which whole panel *views* get built into the DOM at all
  // (see widgetHtml() above) and would need a much bigger rebuild than
  // this. Reads back correctly on the very next form open/submit since
  // askX/requireX are the same module-level bindings submitForm() and
  // handleButtonClick() already check live.
  function applyFieldConfig(
    fieldEl: HTMLDivElement,
    labelEl: HTMLLabelElement,
    baseLabel: string,
    ask: boolean,
    require: boolean,
  ): void {
    fieldEl.style.display = ask ? 'flex' : 'none'
    labelEl.textContent = require ? baseLabel : `${baseLabel} (optional)`
  }

  // Best-effort, fire-and-forget - a slow/failed fetch just means this
  // load keeps whatever was baked into the script tag, same as before
  // this existed.
  fetch(`${apiBase}/widget/site-config?siteKey=${encodeURIComponent(siteKey)}`)
    .then((res) => (res.ok ? res.json() : null))
    .then(
      (
        data: {
          avatar?: string
          greeting?: string
          position?: string
          mode?: string
          askName?: boolean
          requireName?: boolean
          askPhone?: boolean
          requirePhone?: boolean
          askEmail?: boolean
          requireEmail?: boolean
        } | null,
      ) => {
        if (!data) return
        if (data.avatar && data.avatar !== avatarKey) {
          avatarKey = data.avatar
          button.innerHTML = avatarTag()
          titleAvatarEl.innerHTML = avatarTag()
          welcomeAvatarEl.innerHTML = avatarTag()
          orbEl.innerHTML = activityOrbTag()
          orbVideoEl = shadow.getElementById('av-orb-video') as HTMLVideoElement | HTMLImageElement | null
        }
        if (typeof data.greeting === 'string' && data.greeting !== customGreeting) {
          customGreeting = data.greeting
          greetingText.textContent = customGreeting || DEFAULT_GREETING
        }
        if ((data.position === 'bottom-left' || data.position === 'bottom-right') && data.position !== position) {
          position = data.position
          if (position === 'bottom-left') host.dataset.side = 'left'
          else delete host.dataset.side
        }
        if (data.mode === 'voice' || data.mode === 'chat' || data.mode === 'both') {
          widgetMode = data.mode
          if (widgetMode === 'chat') selectedExperience = 'chat'
        }
        if (typeof data.askName === 'boolean') askName = data.askName
        if (typeof data.requireName === 'boolean') requireName = askName && data.requireName
        applyFieldConfig(nameFieldEl, nameLabelEl, 'Name', askName, requireName)
        if (typeof data.askPhone === 'boolean') askPhone = data.askPhone
        if (typeof data.requirePhone === 'boolean') requirePhone = askPhone && data.requirePhone
        applyFieldConfig(phoneFieldEl, phoneLabelEl, 'Phone number', askPhone, requirePhone)
        if (typeof data.askEmail === 'boolean') askEmail = data.askEmail
        if (typeof data.requireEmail === 'boolean') requireEmail = askEmail && data.requireEmail
        applyFieldConfig(emailFieldEl, emailLabelEl, 'Email', askEmail, requireEmail)
      },
    )
    .catch((err) => {
      console.warn('[Vistrow Voice widget] site-config refresh failed:', err)
    })

  // Cross-component call lock — this widget and the marketing site's
  // separate DemoOrbCard ("Tap to talk" orb, a wholly independent React
  // component with no shared code, since widget.ts ships as its own
  // standalone bundle) have zero awareness of each other. Nothing stopped
  // both from connecting their own LiveKit room + agent at once, heard live
  // as multiple different openers overlapping in one garbled voice. A
  // window-level flag is the only channel these two otherwise-isolated
  // surfaces share on the same page - both must set/check/clear it around
  // their own call lifecycle for this to actually work as a lock.
  const CALL_LOCK_KEY = '__vistrowActiveCall'
  function claimCallLock(): boolean {
    const w = window as unknown as Record<string, boolean>
    if (w[CALL_LOCK_KEY]) return false
    w[CALL_LOCK_KEY] = true
    return true
  }
  function releaseCallLock(): void {
    ;(window as unknown as Record<string, boolean>)[CALL_LOCK_KEY] = false
  }

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
  let warmRoomPromise: Promise<string | null> | null = null
  let selectedExperience: 'voice' | 'chat' = widgetMode === 'chat' ? 'chat' : 'voice'
  let callStartedAt = 0
  let callStartedAtMonotonic = 0
  let lastDisplayedCallSecond = 0
  let callCompleted = false

  // Backs off repeated call attempts instead of letting an impatient
  // visitor hammer "Talk to X" after a failure - every fresh attempt
  // dispatches a brand new agent job, and under real capacity pressure
  // each failed one sits occupying a worker slot for up to 90s before it
  // self-abandons. Without a cooldown, rapid re-clicking is exactly what
  // turns a temporary slowdown into a pile-up. Escalates 8s/16s/30s
  // (capped) per consecutive failure; resets the moment a call actually
  // connects to an agent.
  let consecutiveCallFailures = 0
  let callCooldownUntil = 0
  function callCooldownRemainingMs(): number {
    return Math.max(0, callCooldownUntil - Date.now())
  }

  // Hard cap on call length — every minute of every call costs real STT/LLM/
  // TTS spend, so an unattended or forgotten tab shouldn't run indefinitely.
  // Shown as a live countdown (not a silent cutoff) so it never feels like
  // the call just randomly dropped.
  const MAX_CALL_SECONDS = 5 * 60

  // A quiet greeting bubble after a few seconds does more to earn a click
  // than a button alone — dismissible, and only shown once per page load.
  const greetingStorageKey = `vistrow-widget-greeting-${siteKey}`
  function greetingWasDismissed(): boolean {
    try { return sessionStorage.getItem(greetingStorageKey) === 'dismissed' } catch { return false }
  }
  function rememberGreetingDismissal(): void {
    try { sessionStorage.setItem(greetingStorageKey, 'dismissed') } catch { /* storage may be blocked */ }
  }
  const greetingTimer = window.setTimeout(() => {
    if (!greetingWasDismissed()) {
      greeting.style.display = 'flex'
      trackEvent('greeting_shown')
    }
  }, 2800)

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
    orbEl.dataset.state = state || ''
    if (orbVideoEl instanceof HTMLVideoElement) {
      orbVideoEl.playbackRate = state === 'speaking' ? SPEAKING_PLAYBACK_RATE : 1
    }
  }

  function formatCallTime(totalSeconds: number): string {
    const m = Math.floor(totalSeconds / 60)
    const s = totalSeconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  function elapsedCallSeconds(): number {
    if (!callStartedAtMonotonic) return 0
    // performance.now() is monotonic: it cannot jump when the device clock
    // syncs, the timezone changes, or the operating system adjusts time.
    // Clamp to the last rendered value as a second layer of protection so a
    // timer shown to a caller can only ever stay still or move forward.
    const measured = Math.max(0, Math.floor((performance.now() - callStartedAtMonotonic) / 1000))
    lastDisplayedCallSecond = Math.max(lastDisplayedCallSecond, measured)
    return lastDisplayedCallSecond
  }

  // Display elapsed conversation time, while enforcing the 5-minute limit
  // silently from the same agent-join timestamp. The previous UI displayed
  // time remaining (e.g. 2:13) but the completion screen displayed elapsed
  // time (e.g. 2:26), which made a correct limit look like a broken timer.
  // Deriving both views from callStartedAt also avoids setInterval drift when
  // a browser throttles a background tab.
  function startCallTimer(): void {
    if (countdownInterval !== null) return
    if (!callStartedAtMonotonic) {
      callStartedAt = Date.now()
      callStartedAtMonotonic = performance.now()
      lastDisplayedCallSecond = 0
    }
    const tick = () => {
      const elapsed = elapsedCallSeconds()
      timerEl.textContent = formatCallTime(elapsed)
      if (elapsed >= MAX_CALL_SECONDS - 30) timerEl.classList.add('av-timer-warn')
      if (elapsed >= MAX_CALL_SECONDS) {
        showNotice('⏱️ 5-minute call limit reached — feel free to start a new call anytime.')
        endCall()
      }
    }
    tick()
    timerEl.classList.remove('av-timer-warn')
    timerEl.style.display = 'inline'
    timerEl.setAttribute('aria-label', 'Elapsed conversation time')
    timerEl.title = 'Elapsed conversation time'
    countdownInterval = window.setInterval(tick, 1000)
  }

  function stopCountdown(): void {
    if (countdownInterval !== null) {
      window.clearInterval(countdownInterval)
      countdownInterval = null
    }
    timerEl.style.display = 'none'
  }

  function warmAgent(): Promise<string | null> {
    if (warmRoom) return Promise.resolve(warmRoom)
    if (warmRoomPromise) return warmRoomPromise
    warmRoomPromise = fetch(`${apiBase}/widget/warm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteKey }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { room: string | null } | null) => {
        if (data?.room) warmRoom = data.room
        return warmRoom
      })
      .catch((err) => {
        // Best-effort only — startCall() falls back to a fresh room if this
        // never lands, so a failure here is silently swallowed.
        console.warn('[Vistrow Voice widget] warm request failed:', err)
        return null
      })
      .finally(() => {
        warmRoomPromise = null
      })
    return warmRoomPromise
  }

  // Every panel view (pre-call form, chat, active call) is a sibling div
  // toggled via inline display - this just hides the other two before
  // whichever show*() function reveals its own.
  function hideAllPanelViews(): void {
    endChatBtn.style.display = 'none'
    welcomeEl.style.display = 'none'
    formEl.style.display = 'none'
    chatEl.style.display = 'none'
    callEl.style.display = 'none'
    completeEl.style.display = 'none'
  }

  function openPanel(): void {
    hideGreeting()
    panel.style.display = 'flex'
    button.style.display = 'none'
    button.setAttribute('aria-expanded', 'true')
  }

  function showWelcome(): void {
    hideAllPanelViews()
    openPanel()
    welcomeEl.style.display = 'flex'
    chooseVoiceBtn.style.display = widgetMode === 'chat' ? 'none' : 'flex'
    chooseChatBtn.style.display = widgetMode === 'voice' ? 'none' : 'flex'
    trackEvent('open')
    if (widgetMode !== 'chat') warmAgent()
    window.setTimeout(() => (widgetMode === 'chat' ? chooseChatBtn : chooseVoiceBtn).focus(), 0)
  }

  function continueWith(experience: 'voice' | 'chat'): void {
    selectedExperience = experience
    trackEvent('experience_selected', { experience })
    if (skipPreCallForm()) {
      if (experience === 'chat') showChat()
      else void startCall('', '', '')
      return
    }
    showForm()
    submitBtn.textContent = experience === 'chat' ? `Chat with ${agentName}` : `Talk to ${agentName}`
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
  let voiceSessionId: string | null = null
  let voiceAttemptStartedAt = 0
  let connectLatencyMs: number | null = null
  let agentJoinLatencyMs: number | null = null
  let firstResponseLatencyMs: number | null = null
  let telemetrySent = false
  const chatLead = { name: '', phone: '', email: '' }
  function generateId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  }
  function showChat(name = '', phone = '', email = ''): void {
    hideAllPanelViews()
    openPanel()
    chatEl.style.display = 'flex'
    endChatBtn.style.display = 'inline-flex'
    chatInput.focus()
    trackEvent('chat_opened')
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

  // The launcher opens a low-friction welcome screen first. The configured
  // lead form, when enabled, follows only after the visitor chooses voice
  // or chat so the microphone is never requested as a surprise.
  function handleButtonClick(): void {
    showWelcome()
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
    if (role === 'assistant') {
      const row = document.createElement('div')
      row.className = 'av-assistant-row'
      const avatar = document.createElement('span')
      avatar.className = 'av-message-avatar'
      avatar.setAttribute('aria-hidden', 'true')
      avatar.innerHTML = avatarTag()
      row.append(avatar, bubble)
      chatMessagesEl.appendChild(row)
    } else {
      chatMessagesEl.appendChild(bubble)
    }
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight
    return bubble
  }

  // Static, hardcoded markup (not user data) - safe to set via innerHTML,
  // same as the icon constants used throughout this file.
  function appendTypingBubble(): HTMLDivElement {
    const row = document.createElement('div')
    row.className = 'av-assistant-row av-typing'
    const avatar = document.createElement('span')
    avatar.className = 'av-message-avatar'
    avatar.setAttribute('aria-hidden', 'true')
    avatar.innerHTML = avatarTag()
    const bubble = document.createElement('div')
    bubble.className = 'av-bubble av-bubble-remote'
    bubble.innerHTML = '<span class="av-typing-dots"><span></span><span></span><span></span></span>'
    row.append(avatar, bubble)
    chatMessagesEl.appendChild(row)
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight
    return row
  }

  // Turns raw SSE bytes into parsed event objects as they arrive. The
  // server writes one "data: {...}\n\n" frame per event; a frame can still
  // arrive split across chunk boundaries, so this buffers until it sees the
  // blank-line terminator rather than assuming one chunk == one event.
  async function* parseSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''
      for (const frame of frames) {
        const line = frame.split('\n').find((l) => l.startsWith('data:'))
        if (!line) continue
        try {
          yield JSON.parse(line.slice('data:'.length).trim())
        } catch {
          // ignore a malformed frame rather than aborting the whole stream
        }
      }
    }
  }

  async function sendChatMessage(): Promise<void> {
    const text = chatInput.value.trim()
    if (!text || chatSending) return
    chatInput.value = ''
    trackEvent('chat_message_sent')
    appendChatBubble(text, 'user')
    const priorHistory = [...chatHistory]
    chatHistory.push({ role: 'user', content: text })
    chatSending = true
    chatSendBtn.disabled = true
    const typingBubble = appendTypingBubble()
    let replyBubble: HTMLDivElement | null = null
    let replyText = ''
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
      if (!res.ok || !res.body) throw new Error(`${res.status} ${res.statusText}`)

      for await (const event of parseSseStream(res.body)) {
        if (typeof event.delta === 'string') {
          if (!replyBubble) {
            typingBubble.remove()
            replyBubble = appendChatBubble('', 'assistant')
          }
          replyText += event.delta
          replyBubble.textContent = replyText
          chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight
        } else if (event.error) {
          throw new Error(String(event.error))
        } else if (event.done) {
          break
        }
      }
      if (!replyText.trim()) throw new Error('empty reply')
      chatHistory.push({ role: 'assistant', content: replyText })
    } catch (err) {
      console.error('[Vistrow Voice widget] chat request failed:', err)
      typingBubble.remove()
      replyBubble?.remove()
      appendChatBubble('Sorry, something went wrong - please try again.', 'assistant')
    } finally {
      chatSending = false
      chatSendBtn.disabled = false
      chatInput.focus()
    }
  }

  function resetToIdle(): void {
    clearAgentJoinWatchdog()
    releaseCallLock()
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
    button.setAttribute('aria-expanded', 'false')
    button.focus()
  }

  function cleanupCallState(): void {
    clearAgentJoinWatchdog()
    releaseCallLock()
    if (room) {
      suppressDisconnect = true
      room.disconnect()
    }
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
  }

  function transcriptText(): string {
    if (selectedExperience === 'chat') {
      return chatHistory.map((turn) => `${turn.role === 'user' ? 'You' : agentName}: ${turn.content}`).join('\n')
    }
    return Array.from(transcriptEl.querySelectorAll<HTMLDivElement>('.av-bubble'))
      .map((bubble) => `${bubble.classList.contains('av-bubble-local') ? 'You' : agentName}: ${bubble.textContent || ''}`)
      .join('\n')
  }

  function showComplete(message = `Thanks for speaking with ${agentName}.`, successful = true): void {
    if (selectedExperience === 'voice') void submitTelemetry(successful ? null : message)
    cleanupCallState()
    hideAllPanelViews()
    openPanel()
    completeEl.style.display = 'flex'
    completeIconEl.textContent = successful ? '✓' : '!'
    completeIconEl.classList.toggle('av-complete-icon-error', !successful)
    completeTitleEl.textContent = successful ? 'Conversation complete' : 'Couldn’t connect'
    const seconds = callStartedAt ? Math.max(1, elapsedCallSeconds()) : 0
    completeSummaryEl.textContent = successful && seconds ? `${message} Your conversation lasted ${seconds < 60 ? `${seconds} seconds` : `${Math.floor(seconds / 60)} min ${seconds % 60} sec`}.` : message
    const hasTranscript = transcriptText().length > 0
    copyTranscriptBtn.style.display = hasTranscript ? 'flex' : 'none'
    feedbackUpBtn.parentElement!.style.display = successful ? 'flex' : 'none'
    feedbackUpBtn.parentElement!.previousElementSibling?.setAttribute('style', successful ? '' : 'display:none')
    trackEvent(successful ? 'conversation_completed' : 'call_failed', { duration_seconds: seconds, has_transcript: hasTranscript })
    window.setTimeout(() => newConversationBtn.focus(), 0)
  }

  // Shows the error in the call panel and leaves it open for a few seconds
  // instead of resetting immediately — closing right away (the old
  // behavior) meant a failure looked exactly like "the widget opens and
  // shuts down instantly, never says anything," with zero chance to read
  // why. The visitor can still close it early via the X.
  // skipBackoff: true when this call is itself reporting an already-active
  // cooldown (see startCall's gate above) — must not count as ANOTHER
  // failure and extend the cooldown further.
  function failCall(message: string, opts?: { skipBackoff?: boolean }): void {
    if (!opts?.skipBackoff) {
      consecutiveCallFailures += 1
      if (consecutiveCallFailures >= 2) {
        const cooldownMs = Math.min(30_000, 8_000 * 2 ** (consecutiveCallFailures - 2))
        callCooldownUntil = Date.now() + cooldownMs
        message = "We're seeing high demand right now — please wait a moment before trying again."
      }
    }
    showComplete(message, false)
  }

  // Same "leave the message visible for a beat" shape as failCall, but for a
  // normal agent-initiated goodbye - room.delete_room() (agent/main.py's
  // _hang_up) disconnects the visitor with DisconnectReason.ROOM_DELETED,
  // which used to be indistinguishable from a real dropped connection and
  // showed a scary "ended unexpectedly" error after every clean call.
  function endCallGracefully(message: string): void {
    callCompleted = true
    showComplete(message, true)
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
    releaseCallLock()
    // Without this, a manual hangup left the call-timer interval from
    // startCallTimer() silently running in the background (it's a plain
    // setInterval, not tied to the room's lifecycle) — up to 5 real minutes
    // later it would still fire, showing "5-minute call limit reached" out
    // of nowhere long after the caller had already hung up, or misattributed
    // to whatever the panel happened to be showing by then.
    stopCountdown()
    suppressDisconnect = true
    room?.disconnect()
    if (!callCompleted) {
      callCompleted = true
      showComplete(`Thanks for speaking with ${agentName}.`, true)
    }
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
  function trackEvent(action: string, details: Record<string, string | number | boolean> = {}): void {
    try {
      const w = window as unknown as { dataLayer?: unknown[] }
      w.dataLayer = w.dataLayer || []
      w.dataLayer.push({
        event: 'vistrow_widget_event',
        vistrow_widget_action: action,
        vistrow_widget_mode: selectedExperience,
        ...details,
      })
    } catch (err) {
      console.warn('[Vistrow Voice widget] GTM dataLayer push failed:', err)
    }
  }

  function pushLeadEvent(name: string, phone: string, email: string): void {
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
      console.warn('[Vistrow Voice widget] lead event push failed:', err)
    }
  }

  async function startCall(name: string, phone: string, email: string, attempt = 0): Promise<void> {
    // Only gates a fresh, user-initiated attempt - the internal 15s
    // agent-join watchdog's own automatic retry (attempt=1) must still run
    // even if a cooldown started moments ago, since that's the SAME attempt
    // continuing, not a new one.
    if (attempt === 0 && callCooldownRemainingMs() > 0) {
      failCall('High demand right now — please wait a moment and try again.', { skipBackoff: true })
      return
    }
    // Defensive: if a call is somehow already active when a fresh attempt
    // starts (a stray double-trigger of the start button, or a leftover
    // room from a state the UI didn't fully unwind), the OLD `room` object
    // was about to get silently overwritten below without ever being
    // disconnected — orphaned, no longer reachable through any widget
    // state, but still an open WebRTC connection with its own agent still
    // talking. Heard live as multiple different openers overlapping in one
    // garbled voice. Tear down anything already active before proceeding,
    // every time, rather than trusting this can't happen.
    if (attempt === 0 && room) {
      console.warn('[Vistrow Voice widget] starting a new call while one was already active — disconnecting the old one first')
      cleanupCallState()
    }
    // Cross-component: refuses to start if the page's separate DemoOrbCard
    // ("Tap to talk" orb) already holds the lock — see CALL_LOCK_KEY above.
    // Only claimed on a genuinely fresh attempt; the internal retry
    // (attempt=1) is a continuation of a call this same widget already
    // claimed the lock for.
    if (attempt === 0 && !claimCallLock()) {
      failCall('A conversation is already active on this page — please finish it first.', { skipBackoff: true })
      return
    }
    intentionalEnd = false
    callCompleted = false
    if (attempt === 0) {
      // Conversation duration starts only when the agent actually joins.
      // Mic permission, token fetch and queue time are connection latency,
      // not time spent speaking with the agent.
      callStartedAt = 0
      callStartedAtMonotonic = 0
      lastDisplayedCallSecond = 0
      voiceAttemptStartedAt = performance.now()
      connectLatencyMs = null
      agentJoinLatencyMs = null
      firstResponseLatencyMs = null
      telemetrySent = false
    }
    // Voice can start directly from the welcome screen when no lead fields
    // are enabled. Hide every sibling view first so welcome + call can never
    // stack in the panel while the LiveKit room is active.
    hideAllPanelViews()
    callEl.style.display = 'flex'
    // Every call shows the type-instead box right alongside mic/end-call
    // from the start - no toggle to discover, no separate "chat mode" to
    // choose ahead of time. Typing is always a visible, equally-valid way
    // to talk to Artha, right there in the same call.
    typeRow.style.display = 'flex'
    setStatus('Connecting…')
    resetTranscript()

    // Begin dispatch before the browser permission prompt and keep the exact
    // in-flight promise. Previously an immediate click could reach
    // /widget/token before /widget/warm returned, create a second cold room,
    // and then abandon the warm room that completed a moment later.
    const warming = warmAgent()
    try {
      trackEvent('microphone_requested')
      const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      permissionStream.getTracks().forEach((track) => track.stop())
      trackEvent('microphone_granted')
    } catch (err) {
      console.error('[Vistrow Voice widget] microphone permission error:', err)
      trackEvent('microphone_denied')
      failCall('Microphone access was blocked — allow it in your browser and try again.')
      return
    }

    let token: string, url: string
    try {
      const reusableWarmRoom = warmRoom ?? await warming
      const res = await fetch(`${apiBase}/widget/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteKey, identity: randomId('visitor'), name, phone, email, room: reusableWarmRoom }),
      })
      warmRoom = null
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`${res.status} ${res.statusText}: ${body}`)
      }
      const payload = (await res.json()) as { token: string; url: string; room?: string }
      ;({ token, url } = payload)
      voiceSessionId = payload.room || null
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
    if (attempt === 0) {
      pushLeadEvent(name, phone, email)
      trackEvent('call_started')
    }

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
        trackEvent('agent_joined')
        consecutiveCallFailures = 0
        callCooldownUntil = 0
        applyAgentState(participant.attributes?.['lk.agent.state'])
        agentJoinLatencyMs ??= Math.round(performance.now() - voiceAttemptStartedAt)
        // The 5-minute budget is meant to cover actual conversation time,
        // not the wait for the agent to join — starting it any earlier
        // silently burns visible call time during "Waiting for the agent
        // to join…", which reads as the call running out faster than it
        // should. Only (re)start once armed at all; a second
        // ParticipantConnected on the same call (shouldn't normally
        // happen) must never reset an already-running countdown.
        startCallTimer()
      })
      room.on(RoomEvent.ParticipantAttributesChanged, (changed: Record<string, string>) => {
        if ('lk.agent.state' in changed) applyAgentState(changed['lk.agent.state'])
      })
      room.on(RoomEvent.TranscriptionReceived, (segments: TranscriptionSegment[], participant?: Participant) => {
        const isLocal = participant?.identity === room?.localParticipant.identity
        if (!isLocal && firstResponseLatencyMs === null && segments.some((segment) => segment.text.trim())) {
          firstResponseLatencyMs = Math.round(performance.now() - voiceAttemptStartedAt)
        }
        for (const seg of segments) {
          upsertTranscriptEntry(seg.id, seg.text, isLocal)
        }
      })
      room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
        if (suppressDisconnect) {
          suppressDisconnect = false
          return
        }
        if (intentionalEnd) {
          resetToIdle()
        } else if (reason === DisconnectReason.ROOM_DELETED) {
          endCallGracefully('Call ended — thanks for chatting!')
        } else {
          console.warn('[Vistrow Voice widget] room disconnected unexpectedly:', reason)
          failCall('The call ended unexpectedly — please try again.')
        }
      })

      await room.connect(url, token)
      connectLatencyMs = Math.round(performance.now() - voiceAttemptStartedAt)
      trackEvent('call_connected')
      await room.localParticipant.setMicrophoneEnabled(true)
      // The agent usually joins the pre-created room BEFORE the visitor's
      // browser finishes connecting — ParticipantConnected never fires for
      // a participant that's already there, so without this check the UI
      // stayed stuck on "Waiting for the agent to join…" for the whole call.
      if (room.remoteParticipants.size > 0) {
        setStatus('Agent joined — say hello!')
        trackEvent('agent_joined')
        consecutiveCallFailures = 0
        callCooldownUntil = 0
        agentJoinLatencyMs ??= Math.round(performance.now() - voiceAttemptStartedAt)
        room.remoteParticipants.forEach((p: RemoteParticipant) => {
          applyAgentState(p.attributes?.['lk.agent.state'])
        })
        startCallTimer()
      } else {
        setStatus('Waiting for the agent to join…')
      }
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
    if (askName && requireName && !name) {
      formError.textContent = 'Please enter your name.'
      return
    }
    // An optional phone still gets format-checked the moment something was
    // actually typed into it - same "checked if provided, required only if
    // requirePhone" rule server/token_api.py's create_widget_token enforces.
    if (askPhone && (requirePhone || phoneInput.value.trim()) && !isValidPhone(phone)) {
      formError.textContent = requirePhone
        ? 'Enter a valid 10-digit phone number.'
        : 'Enter a valid 10-digit phone number, or leave it blank.'
      return
    }
    if (askEmail && requireEmail && !email) {
      formError.textContent = 'Please enter your email.'
      return
    }
    if (email && !isValidEmail(email)) {
      formError.textContent = 'Enter a valid email address, or leave it blank.'
      return
    }
    formError.textContent = ''
    if (selectedExperience === 'chat') {
      showChat(name, phone, email)
    } else {
      // Voice also keeps the in-call "type instead" fallback visible, so a
      // noisy room or accessibility need never forces the visitor to restart.
      void startCall(name, phone, email)
    }
  }

  button.addEventListener('click', handleButtonClick)
  greeting.addEventListener('click', handleButtonClick)
  chooseVoiceBtn.addEventListener('click', () => continueWith('voice'))
  chooseChatBtn.addEventListener('click', () => continueWith('chat'))
  greetingClose.addEventListener('click', (e) => {
    e.stopPropagation()
    rememberGreetingDismissal()
    trackEvent('greeting_dismissed')
    hideGreeting()
  })
  closeBtn.addEventListener('click', () => {
    // Already on the "conversation complete" screen — chatHistory is still
    // populated at this point (only cleared on a fresh conversation), so
    // without this check the length check below would re-trigger
    // showComplete() on every click and X would never actually close the
    // panel.
    if (completeEl.style.display === 'flex') resetToIdle()
    else if (room) endCall()
    else if (chatHistory.length > 1) showComplete(`Thanks for chatting with ${agentName}.`, true)
    else resetToIdle()
  })
  endChatBtn.addEventListener('click', () => {
    trackEvent('chat_ended')
    showComplete(`Thanks for chatting with ${agentName}.`, true)
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
  async function submitFeedback(rating: 'helpful' | 'not_helpful'): Promise<void> {
    const sessionId = selectedExperience === 'chat' ? chatSessionId : voiceSessionId
    if (!sessionId) return
    const body = JSON.stringify({ siteKey, sessionId, mode: selectedExperience, rating, comment: feedbackNote.value.trim() })
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(`${apiBase}/widget/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }).catch(() => null)
      if (response?.ok) {
        copyStatusEl.textContent = 'Feedback saved — thank you.'
        return
      }
      if (attempt === 0) await new Promise((resolve) => window.setTimeout(resolve, 1200))
    }
    copyStatusEl.textContent = 'Could not save feedback. Please try again.'
  }

  async function submitTelemetry(failureReason: string | null): Promise<void> {
    if (telemetrySent || !voiceSessionId) return
    telemetrySent = true
    await fetch(`${apiBase}/widget/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteKey,
        sessionId: voiceSessionId,
        mode: 'voice',
        connectLatencyMs,
        agentJoinLatencyMs,
        firstResponseLatencyMs,
        failureReason,
      }),
    }).catch(() => null)
  }

  feedbackUpBtn.addEventListener('click', () => {
    feedbackUpBtn.setAttribute('aria-pressed', 'true')
    feedbackDownBtn.setAttribute('aria-pressed', 'false')
    feedbackNote.style.display = 'none'
    trackEvent('feedback_submitted', { rating: 'helpful' })
    void submitFeedback('helpful')
  })
  feedbackDownBtn.addEventListener('click', () => {
    feedbackDownBtn.setAttribute('aria-pressed', 'true')
    feedbackUpBtn.setAttribute('aria-pressed', 'false')
    feedbackNote.style.display = 'block'
    feedbackSendBtn.style.display = 'flex'
    feedbackNote.focus()
    trackEvent('feedback_submitted', { rating: 'not_helpful' })
    void submitFeedback('not_helpful')
  })
  // Comment also auto-submits on blur (e.g. clicking another button) as a
  // safety net, but that has no visible affordance — confirmed live,
  // visitors had no way to tell a typed comment was ever sent. This button
  // is the actual visible "send" action; submitFeedback's own /widget/
  // feedback call is a plain idempotent UPDATE, so this button firing after
  // (or instead of) the blur handler is harmless either way.
  feedbackSendBtn.addEventListener('click', () => {
    void submitFeedback('not_helpful')
    feedbackSendBtn.textContent = 'Sent'
    feedbackSendBtn.setAttribute('disabled', 'true')
  })
  feedbackNote.addEventListener('blur', () => {
    if (feedbackDownBtn.getAttribute('aria-pressed') === 'true' && feedbackNote.value.trim()) {
      void submitFeedback('not_helpful')
    }
  })
  copyTranscriptBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(transcriptText())
      copyTranscriptBtn.textContent = 'Transcript copied'
      copyStatusEl.textContent = 'Transcript copied to clipboard'
      trackEvent('transcript_copied')
      window.setTimeout(() => {
        copyTranscriptBtn.innerHTML = `${COPY_ICON} Copy transcript`
      }, 1800)
    } catch {
      copyStatusEl.textContent = 'Could not copy the transcript'
    }
  })
  newConversationBtn.addEventListener('click', () => {
    feedbackUpBtn.setAttribute('aria-pressed', 'false')
    feedbackDownBtn.setAttribute('aria-pressed', 'false')
    feedbackNote.style.display = 'none'
    feedbackNote.value = ''
    feedbackSendBtn.style.display = 'none'
    feedbackSendBtn.textContent = 'Send'
    feedbackSendBtn.removeAttribute('disabled')
    callStartedAt = 0
    callStartedAtMonotonic = 0
    lastDisplayedCallSecond = 0
    if (selectedExperience === 'chat') {
      chatHistory.splice(0)
      chatMessagesEl.innerHTML = '<p class="av-transcript-empty">Ask anything - no call, just type.</p>'
      chatOpened = false
      chatSessionId = null
      chatStartedAt = null
    }
    voiceSessionId = null
    telemetrySent = false
    showWelcome()
  })
  shadow.getElementById('av-post-cta')?.addEventListener('click', () => trackEvent('post_call_cta_clicked'))
  shadow.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Escape' && !room) resetToIdle()
  })
  window.addEventListener('scroll', hideGreeting, { once: true, passive: true })
  trackEvent('loaded')
}

init()
