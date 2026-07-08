import { Room, RoomEvent, Track } from 'livekit-client'
import type { RemoteTrack } from 'livekit-client'

// Must run synchronously at the top of the script — document.currentScript
// only reflects the executing <script> tag during that tag's own
// synchronous evaluation (this is also why the build targets IIFE, not ESM:
// module scripts are deferred and document.currentScript is null by then).
const scriptEl = document.currentScript as HTMLScriptElement | null
const siteKey = scriptEl?.dataset.siteKey
const apiBase = scriptEl?.dataset.apiBase?.replace(/\/$/, '')
const position = scriptEl?.dataset.position === 'bottom-left' ? 'bottom-left' : 'bottom-right'
const label = scriptEl?.dataset.label || 'Talk to us'

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
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

const MIC_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11h-2z"/></svg>'
const MIC_OFF_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 11h-2a5 5 0 0 1-.2 1.4l1.5 1.5c.5-.9.7-1.9.7-2.9zM4.3 3 3 4.3l6 6V11a3 3 0 0 0 4.6 2.5l1.6 1.6A5 5 0 0 1 7 11H5a7 7 0 0 0 6 6.9V21h2v-3.1c.9-.1 1.7-.4 2.4-.9l3.3 3.3 1.3-1.3L4.3 3zM12 2a3 3 0 0 1 3 3v4.2L9 3.3A3 3 0 0 1 12 2z"/></svg>'
const END_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 9c-1.6 0-3.1.3-4.5.8-.4.2-.7.6-.7 1v2.9c0 .4-.2.8-.6 1-.9.5-1.8 1.1-2.5 1.8-.4.4-1 .4-1.4 0L.5 14.8c-.4-.4-.4-1 0-1.4C3.7 10 7.7 8 12 8s8.3 2 11.5 5.4c.4.4.4 1 0 1.4l-1.8 1.7c-.4.4-1 .4-1.4 0-.7-.7-1.6-1.3-2.5-1.8-.4-.2-.6-.6-.6-1v-2.9c0-.4-.3-.8-.7-1C15.1 9.3 13.6 9 12 9z"/></svg>'
const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"/></svg>'

const CSS = `
:host { all: initial; }
.av-root { position: fixed; ${position === 'bottom-left' ? 'left: 20px;' : 'right: 20px;'} bottom: 20px; z-index: 2147483000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }

@keyframes av-pulse-ring {
  0% { box-shadow: 0 0 0 0 rgba(168,85,247,.55); }
  70% { box-shadow: 0 0 0 16px rgba(168,85,247,0); }
  100% { box-shadow: 0 0 0 0 rgba(168,85,247,0); }
}
.av-button { width: 68px; height: 68px; border-radius: 9999px; background: #000; border: none; padding: 0; overflow: hidden; cursor: pointer; animation: av-pulse-ring 2.6s ease-out infinite; transition: transform .15s ease; }
.av-button:hover { transform: scale(1.06); }
.av-button video { width: 100%; height: 100%; object-fit: cover; }

.av-greeting { position: absolute; bottom: 8px; ${position === 'bottom-left' ? 'left: 78px;' : 'right: 78px;'} display: flex; align-items: center; gap: 8px; max-width: 220px; background: #17121f; border: 1px solid #2a2440; color: #f5f3ff; padding: 10px 12px; border-radius: 14px; font-size: 13px; line-height: 1.35; box-shadow: 0 12px 30px rgba(0,0,0,.4); cursor: pointer; animation: av-fade-in .25s ease; }
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
.av-error { font-size: 12px; color: #f87171; min-height: 15px; }
.av-submit { margin-top: 4px; background: linear-gradient(135deg,#a855f7,#7c3aed); border: none; border-radius: 10px; color: white; font-weight: 700; font-size: 13.5px; padding: 10px; cursor: pointer; }
.av-submit:disabled { opacity: .5; cursor: default; }

.av-body { padding: 20px 16px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.av-orb { position: relative; width: 96px; height: 96px; border-radius: 9999px; overflow: hidden; background: #000; transition: transform .15s ease-out; }
.av-orb video { width: 100%; height: 100%; object-fit: cover; }
.av-status { font-size: 12.5px; color: #b8b2cf; text-align: center; min-height: 32px; }
.av-controls { display: flex; align-items: center; gap: 14px; padding: 0 16px 16px; }
.av-ctrl-btn { width: 40px; height: 40px; border-radius: 9999px; border: 1px solid #2a2440; background: #201b3b; color: #b8b2cf; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.av-end-btn { width: 48px; height: 48px; border-radius: 9999px; background: #ef4444; color: white; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; }
audio { display: none; }
`

function widgetHtml(label: string): string {
  return `
    <div class="av-root">
      <div id="av-greeting" class="av-greeting">
        <span id="av-greeting-text">👋 Talk to our AI assistant — instant answers, no waiting.</span>
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

        <div id="av-form" class="av-form">
          <p>Tell us who's calling so the assistant can greet you properly.</p>
          <label for="av-name">Name</label>
          <input id="av-name" type="text" autocomplete="name" placeholder="Your name" />
          <label for="av-phone">Phone number</label>
          <input id="av-phone" type="tel" autocomplete="tel" placeholder="+919812345678" />
          <p id="av-form-error" class="av-error"></p>
          <button id="av-submit" class="av-submit">Start the call</button>
        </div>

        <div id="av-call" style="display:none;">
          <div class="av-body">
            <div class="av-orb">
              <video id="av-orb-video" src="${apiBase}/agent-orb.mp4" autoplay loop muted playsinline></video>
            </div>
            <p id="av-status" class="av-status">Connecting…</p>
          </div>
          <div class="av-controls">
            <button id="av-mute" class="av-ctrl-btn">${MIC_ICON}</button>
            <button id="av-end" class="av-end-btn">${END_ICON}</button>
          </div>
          <audio id="av-audio" autoplay></audio>
        </div>
      </div>

      <button id="av-button" class="av-button" aria-label="${label}">
        <video src="${apiBase}/agent-orb.mp4" autoplay loop muted playsinline></video>
      </button>
    </div>
  `
}

function init(): void {
  if (!siteKey || !apiBase) {
    console.error(
      '[Arthale Voice widget] missing data-site-key or data-api-base on the <script> tag — widget not started.',
    )
    return
  }

  const host = document.createElement('div')
  host.id = 'arthale-voice-widget-host'
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
  const formError = shadow.getElementById('av-form-error') as HTMLParagraphElement
  const submitBtn = shadow.getElementById('av-submit') as HTMLButtonElement

  const callEl = shadow.getElementById('av-call') as HTMLDivElement
  const statusEl = shadow.getElementById('av-status') as HTMLParagraphElement
  const orbEl = shadow.getElementById('av-orb-video')?.parentElement as HTMLDivElement
  const timerEl = shadow.getElementById('av-timer') as HTMLSpanElement
  const muteBtn = shadow.getElementById('av-mute') as HTMLButtonElement
  const endBtn = shadow.getElementById('av-end') as HTMLButtonElement
  const audioEl = shadow.getElementById('av-audio') as HTMLAudioElement
  const greetingText = shadow.getElementById('av-greeting-text') as HTMLSpanElement

  let room: Room | null = null
  let micEnabled = true
  let stopVolumeReactivity: (() => void) | null = null
  let countdownInterval: number | null = null

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

  function showForm(): void {
    hideGreeting()
    formError.textContent = ''
    formEl.style.display = 'flex'
    callEl.style.display = 'none'
    panel.style.display = 'flex'
    button.style.display = 'none'
  }

  function resetToIdle(): void {
    stopVolumeReactivity?.()
    stopVolumeReactivity = null
    stopCountdown()
    room = null
    micEnabled = true
    muteBtn.innerHTML = MIC_ICON
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

  function endCall(): void {
    intentionalEnd = true
    room?.disconnect()
    resetToIdle()
  }

  function toggleMute(): void {
    if (!room) return
    micEnabled = !micEnabled
    room.localParticipant.setMicrophoneEnabled(micEnabled)
    muteBtn.innerHTML = micEnabled ? MIC_ICON : MIC_OFF_ICON
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
      console.warn('[Arthale Voice widget] volume reactivity unavailable:', err)
      return () => {}
    }
  }

  async function startCall(name: string, phone: string): Promise<void> {
    intentionalEnd = false
    formEl.style.display = 'none'
    callEl.style.display = 'block'
    setStatus('Connecting…')

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      console.error('[Arthale Voice widget] microphone permission error:', err)
      failCall('Microphone access was blocked — allow it in your browser and try again.')
      return
    }

    let token: string, url: string
    try {
      const res = await fetch(`${apiBase}/widget/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteKey, identity: randomId('visitor'), name, phone }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`${res.status} ${res.statusText}: ${body}`)
      }
      ;({ token, url } = (await res.json()) as { token: string; url: string })
    } catch (err) {
      console.error('[Arthale Voice widget] token request failed:', err)
      failCall('Could not reach the call server — please try again shortly.')
      return
    }

    try {
      room = new Room()
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) {
          track.attach(audioEl)
          stopVolumeReactivity = attachVolumeReactivity(track)
        }
      })
      room.on(RoomEvent.ParticipantConnected, () => setStatus('Agent joined — say hello!'))
      room.on(RoomEvent.Disconnected, () => {
        if (intentionalEnd) {
          resetToIdle()
        } else {
          console.warn('[Arthale Voice widget] room disconnected unexpectedly')
          failCall('The call ended unexpectedly — please try again.')
        }
      })

      await room.connect(url, token)
      await room.localParticipant.setMicrophoneEnabled(true)
      setStatus('Waiting for the agent to join…')
      startCountdown()
    } catch (err) {
      console.error('[Arthale Voice widget] LiveKit connect failed:', err)
      failCall('Could not connect the call — please try again.')
    }
  }

  function submitForm(): void {
    const name = nameInput.value.trim()
    const phone = phoneInput.value.trim()
    if (!name) {
      formError.textContent = 'Please enter your name.'
      return
    }
    if (!isValidPhone(phone)) {
      formError.textContent = 'Enter a valid phone number in international format, e.g. +919812345678.'
      return
    }
    formError.textContent = ''
    void startCall(name, phone)
  }

  button.addEventListener('click', showForm)
  greeting.addEventListener('click', showForm)
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
  endBtn.addEventListener('click', endCall)
  muteBtn.addEventListener('click', toggleMute)
}

init()
