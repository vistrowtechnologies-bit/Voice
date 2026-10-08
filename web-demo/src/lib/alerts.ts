// Browser-side delivery for notifications: a soft chime and an operating-system pop-up.
// Both are opt-in per person (Settings -> Preferences) and both fail quietly - an alert
// that cannot play must never break the dashboard.

/** Fired on window after the person changes their notification preferences. */
export const PREFS_CHANGED_EVENT = 'vv-prefs-changed'

let audio: AudioContext | null = null

/** A short two-note chime, synthesised so there is no audio file to ship. */
export function playChime(): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    audio = audio ?? new Ctx()
    if (audio.state === 'suspended') void audio.resume()
    const now = audio.currentTime
    ;[880, 1318.5].forEach((freq, i) => {
      const osc = audio!.createOscillator()
      const gain = audio!.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + i * 0.14)
      gain.gain.exponentialRampToValueAtTime(0.16, now + i * 0.14 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.14 + 0.45)
      osc.connect(gain).connect(audio!.destination)
      osc.start(now + i * 0.14)
      osc.stop(now + i * 0.14 + 0.5)
    })
  } catch {
    /* no audio available */
  }
}

export const desktopAlertsSupported = () => typeof window !== 'undefined' && 'Notification' in window

/** Ask the browser for permission. Must be called from a click. */
export async function requestDesktopPermission(): Promise<NotificationPermission> {
  if (!desktopAlertsSupported()) return 'denied'
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

export function showDesktopAlert(title: string, body: string, tag: string, onClick?: () => void): void {
  try {
    if (!desktopAlertsSupported() || Notification.permission !== 'granted') return
    const n = new Notification(title, { body, tag, icon: '/favicon.png' })
    n.onclick = () => {
      window.focus()
      onClick?.()
      n.close()
    }
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}
