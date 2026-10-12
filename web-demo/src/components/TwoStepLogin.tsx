import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Icon } from './Icon'
import {
  apiMfaDisable,
  apiMfaEnable,
  apiMfaNewRecoveryCodes,
  apiMfaSetup,
  apiMfaStatus,
  useAuth,
  type MfaStatus,
} from '../lib/auth'

const inputCls = 'w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary'
const primaryBtn = 'flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-bg hover:opacity-90 disabled:opacity-50'
const quietBtn = 'flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-bold text-text-muted hover:border-primary hover:text-text disabled:opacity-50'

/** Settings → Sign-in & security: turn on two-step login with an
 * authenticator app, keep recovery codes, or turn it off. Required for the
 * platform owner to open the admin panel. */
export function TwoStepLoginCard() {
  const { setUser } = useAuth()
  const [status, setStatus] = useState<MfaStatus | null>(null)
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [code, setCode] = useState('')
  const [mode, setMode] = useState<'idle' | 'disable' | 'regenerate'>('idle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = () => apiMfaStatus().then(setStatus).catch(() => setStatus(null))
  useEffect(() => { void load() }, [])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const start = () => run(async () => {
    const { secret, otpauthUrl } = await apiMfaSetup()
    const qr = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 200 })
    setSetup({ secret, qr })
    setCode('')
  })

  const enable = () => run(async () => {
    const result = await apiMfaEnable(code.trim())
    setUser(result.user)
    setCodes(result.recoveryCodes)
    setSetup(null)
    setCode('')
    await load()
  })

  const disable = () => run(async () => {
    const result = await apiMfaDisable(code.trim())
    setUser(result.user)
    setMode('idle')
    setCode('')
    setCodes(null)
    await load()
  })

  const regenerate = () => run(async () => {
    const result = await apiMfaNewRecoveryCodes(code.trim())
    setCodes(result.recoveryCodes)
    setMode('idle')
    setCode('')
    await load()
  })

  const downloadCodes = () => {
    if (!codes) return
    const blob = new Blob([`Vistrow Voice recovery codes\nEach code works once.\n\n${codes.join('\n')}\n`], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'vistrow-voice-recovery-codes.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <Icon name="verified_user" className="text-[18px] text-primary" />
            Two-step login
            {status && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${status.enabled ? 'bg-success/15 text-success' : 'bg-surface-high text-text-muted'}`}>
                {status.enabled ? 'On' : 'Off'}
              </span>
            )}
          </h3>
          <p className="mt-1 text-xs text-text-muted">
            After your password (or Google/GitHub), sign-in also asks for a code from an authenticator app such as
            Google Authenticator, Microsoft Authenticator or 1Password. A stolen password alone can't get in.
          </p>
          {status?.required && !status.enabled && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber">
              <Icon name="shield" className="text-[15px]" />
              Required to open the admin panel.
            </p>
          )}
        </div>
        {status && !status.enabled && !setup && (
          <button type="button" onClick={start} disabled={busy} className={primaryBtn}>
            <Icon name="lock" className="text-[16px]" />
            Turn on
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <Icon name="error" className="text-[15px]" />
          {error}
        </p>
      )}

      {setup && (
        <div className="flex flex-col gap-4 rounded-xl border border-primary/25 bg-primary/5 p-4 sm:flex-row">
          <img src={setup.qr} alt="QR code to scan with your authenticator app" className="h-40 w-40 shrink-0 self-center rounded-lg bg-white p-1.5" />
          <div className="flex min-w-0 flex-1 flex-col gap-2.5 text-sm">
            <p><b>1.</b> Scan this code with your authenticator app.</p>
            <p className="text-xs text-text-muted">
              Can't scan? Enter this key instead:{' '}
              <code className="break-all rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] text-text">{setup.secret}</code>
            </p>
            <p><b>2.</b> Type the 6-digit code it shows.</p>
            <div className="flex flex-wrap gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                placeholder="123456"
                aria-label="Code from your authenticator app"
                className={`${inputCls} max-w-[10rem] font-mono tracking-widest`}
              />
              <button type="button" onClick={enable} disabled={busy || code.trim().length < 6} className={primaryBtn}>
                Verify and turn on
              </button>
              <button type="button" onClick={() => { setSetup(null); setCode(''); setError(null) }} className="bg-transparent px-2 text-xs font-semibold text-text-muted hover:text-text">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {codes && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber/40 bg-amber/5 p-4">
          <p className="text-sm font-bold">Save your recovery codes</p>
          <p className="text-xs text-text-muted">
            If you lose your phone, each of these signs you in once. This is the only time they're shown.
          </p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
            {codes.map((c) => (
              <code key={c} className="rounded bg-surface px-2 py-1 text-center font-mono text-xs">{c}</code>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={downloadCodes} className={quietBtn}>
              <Icon name="download" className="text-[15px]" /> Download
            </button>
            <button type="button" onClick={() => void navigator.clipboard?.writeText(codes.join('\n'))} className={quietBtn}>
              <Icon name="content_copy" className="text-[15px]" /> Copy
            </button>
            <button type="button" onClick={() => setCodes(null)} className={quietBtn}>I've saved them</button>
          </div>
        </div>
      )}

      {status?.enabled && !codes && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-text-muted">
            {status.recoveryCodesLeft} recovery code{status.recoveryCodesLeft === 1 ? '' : 's'} left.
          </p>
          {mode === 'idle' ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => { setMode('regenerate'); setError(null) }} className={quietBtn}>
                <Icon name="refresh" className="text-[15px]" /> New recovery codes
              </button>
              {!status.required && (
                <button type="button" onClick={() => { setMode('disable'); setError(null) }} className={quietBtn}>
                  Turn off
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="one-time-code"
                maxLength={12}
                placeholder="Code or recovery code"
                aria-label="Current code"
                className={`${inputCls} max-w-[13rem]`}
              />
              <button
                type="button"
                onClick={mode === 'disable' ? disable : regenerate}
                disabled={busy || code.trim().length < 6}
                className={primaryBtn}
              >
                {mode === 'disable' ? 'Turn off two-step login' : 'Make new codes'}
              </button>
              <button type="button" onClick={() => { setMode('idle'); setCode('') }} className="bg-transparent px-2 text-xs font-semibold text-text-muted hover:text-text">
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
