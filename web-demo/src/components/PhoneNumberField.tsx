import { COMMON_DIAL_CODES } from '../lib/phone'

type Props = {
  label?: string
  dialCode: string
  number: string
  onDialCodeChange: (value: string) => void
  onNumberChange: (value: string) => void
  error?: string
}

export function PhoneNumberField({ label = 'Phone', dialCode, number, onDialCodeChange, onNumberChange, error }: Props) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-text-muted">
      {label && <span>{label}</span>}
      <span className={`flex overflow-hidden rounded-lg border bg-surface-high focus-within:border-primary ${error ? 'border-destructive' : 'border-border'}`}>
        <select
          aria-label="Country code"
          value={dialCode}
          onChange={(event) => onDialCodeChange(event.target.value)}
          className="border-r border-border bg-transparent px-2 py-2 text-sm text-text outline-none"
        >
          {COMMON_DIAL_CODES.map((item) => (
            <option key={`${item.code}-${item.dial}`} value={item.dial}>{item.code} {item.dial}</option>
          ))}
        </select>
        <input
          type="tel"
          inputMode="tel"
          value={number}
          onChange={(event) => onNumberChange(event.target.value)}
          placeholder="98123 45678"
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-text outline-none"
        />
      </span>
      {error && <span className="font-normal text-destructive">{error}</span>}
    </label>
  )
}
