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

const PHONE_ICON =
  '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.4 0 .8-.2 1L6.6 10.8z"/></svg>'
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
.av-button { width: 60px; height: 60px; border-radius: 9999px; background: #a855f7; color: white; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 8px 24px rgba(168,85,247,.45); transition: transform .15s ease, box-shadow .15s ease; }
.av-button:hover { transform: scale(1.06); box-shadow: 0 10px 28px rgba(168,85,247,.6); }
.av-panel { display: none; flex-direction: column; width: 280px; border-radius: 16px; background: #17121f; border: 1px solid #2a2440; color: #f5f3ff; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,.5); position: absolute; bottom: 74px; ${position === 'bottom-left' ? 'left: 0;' : 'right: 0;'} }
.av-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid #2a2440; }
.av-title { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.av-dot { width: 8px; height: 8px; border-radius: 9999px; background: #a855f7; }
.av-close { background: none; border: none; color: #9089b0; cursor: pointer; padding: 4px; display: flex; }
.av-body { padding: 20px 16px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.av-orb { width: 64px; height: 64px; border-radius: 9999px; border: 3px solid #a855f7; display: flex; align-items: center; justify-content: center; color: #a855f7; }
.av-status { font-size: 12.5px; color: #b8b2cf; text-align: center; min-height: 32px; }
.av-controls { display: flex; align-items: center; gap: 14px; padding: 0 16px 16px; }
.av-ctrl-btn { width: 40px; height: 40px; border-radius: 9999px; border: 1px solid #2a2440; background: #201b3b; color: #b8b2cf; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.av-end-btn { width: 48px; height: 48px; border-radius: 9999px; background: #ef4444; color: white; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; }
audio { display: none; }
`

function panelHtml(label: string): string {
  return `
    <div class="av-root">
      <div id="av-panel" class="av-panel">
        <div class="av-header">
          <div class="av-title"><span class="av-dot"></span>${label}</div>
          <button id="av-close" class="av-close">${CLOSE_ICON}</button>
        </div>
        <div class="av-body">
          <div class="av-orb">${MIC_ICON}</div>
          <p id="av-status" class="av-status">Connecting…</p>
        </div>
        <div class="av-controls">
          <button id="av-mute" class="av-ctrl-btn">${MIC_ICON}</button>
          <button id="av-end" class="av-end-btn">${END_ICON}</button>
        </div>
        <audio id="av-audio" autoplay></audio>
      </div>
      <button id="av-button" class="av-button" aria-label="${label}">${PHONE_ICON}</button>
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
  shadow.innerHTML = `<style>${CSS}</style>${panelHtml(label)}`

  const button = shadow.getElementById('av-button') as HTMLButtonElement
  const panel = shadow.getElementById('av-panel') as HTMLDivElement
  const statusEl = shadow.getElementById('av-status') as HTMLParagraphElement
  const closeBtn = shadow.getElementById('av-close') as HTMLButtonElement
  const muteBtn = shadow.getElementById('av-mute') as HTMLButtonElement
  const endBtn = shadow.getElementById('av-end') as HTMLButtonElement
  const audioEl = shadow.getElementById('av-audio') as HTMLAudioElement

  let room: Room | null = null
  let micEnabled = true

  function setStatus(text: string): void {
    statusEl.textContent = text
  }

  function resetToIdle(): void {
    room = null
    micEnabled = true
    muteBtn.innerHTML = MIC_ICON
    panel.style.display = 'none'
    button.style.display = 'flex'
  }

  function endCall(): void {
    room?.disconnect()
    resetToIdle()
  }

  function toggleMute(): void {
    if (!room) return
    micEnabled = !micEnabled
    room.localParticipant.setMicrophoneEnabled(micEnabled)
    muteBtn.innerHTML = micEnabled ? MIC_ICON : MIC_OFF_ICON
  }

  async function startCall(): Promise<void> {
    button.style.display = 'none'
    panel.style.display = 'flex'
    setStatus('Connecting…')

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      console.error('[Arthale Voice widget] microphone permission error:', err)
      setStatus('Microphone access was blocked — allow it in your browser and try again.')
      resetToIdle()
      return
    }

    let token: string, url: string
    try {
      const res = await fetch(`${apiBase}/widget/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteKey, identity: randomId('visitor') }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`${res.status} ${res.statusText}: ${body}`)
      }
      ;({ token, url } = (await res.json()) as { token: string; url: string })
    } catch (err) {
      console.error('[Arthale Voice widget] token request failed:', err)
      setStatus('Could not reach the call server — please try again shortly.')
      resetToIdle()
      return
    }

    try {
      room = new Room()
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) track.attach(audioEl)
      })
      room.on(RoomEvent.ParticipantConnected, () => setStatus('Agent joined — say hello!'))
      room.on(RoomEvent.Disconnected, () => resetToIdle())

      await room.connect(url, token)
      await room.localParticipant.setMicrophoneEnabled(true)
      setStatus('Waiting for the agent to join…')
    } catch (err) {
      console.error('[Arthale Voice widget] LiveKit connect failed:', err)
      setStatus('Could not connect the call — please try again.')
      resetToIdle()
    }
  }

  button.addEventListener('click', () => void startCall())
  closeBtn.addEventListener('click', endCall)
  endBtn.addEventListener('click', endCall)
  muteBtn.addEventListener('click', toggleMute)
}

init()
