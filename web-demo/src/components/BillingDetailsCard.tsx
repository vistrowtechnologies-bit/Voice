import { useEffect, useState } from 'react'
import { fetchBillingProfile, saveBillingProfile, type BillingProfile } from '../lib/api'
import { SectionCard } from './ui/SectionCard'

const EMPTY: BillingProfile = { legalName: '', gstin: '', address: '', city: '', state: '', pincode: '', billingEmail: '' }

/** The company details printed on this workspace's GST invoices. Applies to invoices opened from now on. */
export function BillingDetailsCard() {
  const [form, setForm] = useState<BillingProfile>(EMPTY)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => { fetchBillingProfile().then(setForm).catch(() => {}).finally(() => setLoaded(true)) }, [])
  const set = (key: keyof BillingProfile, value: string) => setForm((f) => ({ ...f, [key]: value }))

  const save = async () => {
    setBusy(true); setMessage(null)
    try {
      setForm(await saveBillingProfile(form))
      setMessage({ type: 'ok', text: 'Saved. These details will appear on your invoices.' })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Could not save.' })
    } finally { setBusy(false) }
  }

  const input = 'w-full rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary'
  const field = (label: string, key: keyof BillingProfile, props: { placeholder?: string; wide?: boolean } = {}) => (
    <label className={`flex flex-col gap-1 text-xs font-semibold text-text-muted ${props.wide ? 'sm:col-span-2' : ''}`}>
      {label}
      <input value={form[key]} onChange={(e) => set(key, e.target.value)} placeholder={props.placeholder} className={input} />
    </label>
  )

  return (
    <SectionCard title="Billing details" subtitle="Your company name, GSTIN and address as they should appear on GST invoices.">
      <div className="flex flex-col gap-4 px-4 pb-4 sm:px-5">
        {!loaded ? <p className="text-sm text-text-muted">Loading…</p> : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {field('Company or legal name', 'legalName', { wide: true })}
              {field('GSTIN (optional)', 'gstin', { placeholder: '27ABCDE1234F1Z5' })}
              {field('Billing email (optional)', 'billingEmail', { placeholder: 'accounts@yourcompany.com' })}
              {field('Address', 'address', { wide: true })}
              {field('City', 'city')}
              {field('State', 'state', { placeholder: 'e.g. Maharashtra' })}
              {field('Pincode', 'pincode')}
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => void save()} disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{busy ? 'Saving…' : 'Save details'}</button>
              {message && <p className={`text-xs font-semibold ${message.type === 'ok' ? 'text-emerald-600' : 'text-destructive'}`}>{message.text}</p>}
            </div>
          </>
        )}
      </div>
    </SectionCard>
  )
}
