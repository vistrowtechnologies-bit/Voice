import { useState } from 'react'
import { Icon } from './Icon'

// Fields an agent prompt can read as {{custom.<key>}}. Keys match what Meta
// lead imports already write, so a hand-added contact looks like an imported one.
export const LEAD_FIELD_PRESETS: { key: string; label: string; placeholder: string }[] = [
  { key: 'lead_source', label: 'Lead source', placeholder: 'Facebook ad, referral, website…' },
  { key: 'website_requirement', label: 'What they asked for', placeholder: 'business website, redesign…' },
  { key: 'business_type', label: 'Business type', placeholder: 'clinic, real estate, clothing store…' },
  { key: 'has_website', label: 'Has a website', placeholder: 'yes / no' },
  { key: 'budget', label: 'Budget', placeholder: '₹10,000–₹20,000' },
  { key: 'start_timeline', label: 'Wants it within', placeholder: 'within 30 days' },
  { key: 'platform', label: 'Platform', placeholder: 'fb or ig' },
  { key: 'campaign_name', label: 'Campaign', placeholder: 'Campaign or form name' },
]

type Row = { id: number; key: string; value: string }

export function normaliseFieldKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export function cleanCustomFields(rows: { key: string; value: string }[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const row of rows) {
    const key = normaliseFieldKey(row.key)
    const value = row.value.trim()
    if (key && value) out[key] = value
  }
  return out
}

let nextRowId = 1

/**
 * Key/value rows for a contact's custom fields. Calls onChange with the cleaned
 * record (blank keys/values dropped) on every edit, so the parent only ever
 * holds what will actually be saved.
 */
export function CustomFieldsEditor({
  initial,
  onChange,
}: {
  initial: Record<string, string>
  onChange: (fields: Record<string, string>) => void
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    Object.entries(initial || {}).map(([key, value]) => ({ id: nextRowId++, key, value: String(value ?? '') })),
  )

  const commit = (next: Row[]) => {
    setRows(next)
    onChange(cleanCustomFields(next))
  }

  const usedKeys = new Set(rows.map((r) => normaliseFieldKey(r.key)))
  const available = LEAD_FIELD_PRESETS.filter((p) => !usedKeys.has(p.key))
  const labelFor = (key: string) => LEAD_FIELD_PRESETS.find((p) => p.key === normaliseFieldKey(key))

  return (
    <div className="flex flex-col gap-2">
      {rows.length === 0 && (
        <p className="text-xs text-text-muted">
          No lead details yet. Add what you know and the agent can use it on the call.
        </p>
      )}
      {rows.map((row) => {
        const preset = labelFor(row.key)
        const key = normaliseFieldKey(row.key)
        return (
          <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] items-start gap-2">
            <div className="flex flex-col gap-0.5">
              <input
                value={row.key}
                onChange={(e) => commit(rows.map((r) => (r.id === row.id ? { ...r, key: e.target.value } : r)))}
                placeholder="field name"
                aria-label="Field name"
                className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
              />
              {key && (
                <code className="px-1 text-[10px] text-text-muted" title="Use this in an agent prompt">
                  {`{{custom.${key}}}`}
                </code>
              )}
            </div>
            <input
              value={row.value}
              onChange={(e) => commit(rows.map((r) => (r.id === row.id ? { ...r, value: e.target.value } : r)))}
              placeholder={preset?.placeholder || 'value'}
              aria-label={`${preset?.label || row.key || 'Field'} value`}
              className="rounded-lg border border-border bg-surface-high px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => commit(rows.filter((r) => r.id !== row.id))}
              aria-label="Remove field"
              className="rounded p-2 text-text-muted hover:bg-surface-high hover:text-text"
            >
              <Icon name="close" className="text-[18px]" />
            </button>
          </div>
        )
      })}
      <div className="flex flex-wrap items-center gap-1.5">
        {available.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => commit([...rows, { id: nextRowId++, key: p.key, value: '' }])}
            className="rounded-full border border-border bg-surface-high px-2.5 py-1 text-xs font-semibold text-text-muted hover:border-primary hover:text-text"
          >
            + {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => commit([...rows, { id: nextRowId++, key: '', value: '' }])}
          className="rounded-full border border-dashed border-border bg-surface-high px-2.5 py-1 text-xs font-semibold text-text-muted hover:border-primary hover:text-text"
        >
          + Other field
        </button>
      </div>
    </div>
  )
}
