import { useEffect, useMemo, useRef, useState } from 'react'
import { COUNTRY_OPTIONS, dialCodeFor } from '../lib/phone'
import { Icon } from './Icon'

// Phone number with a searchable country picker: flag, name and calling code,
// filtered as you type ("u" -> United Kingdom, United States, UAE...; "uk",
// "usa", "uae" work too), and a digit limit per country.

/** 🇮🇳 for "IN": two regional-indicator letters. Windows shows the letters. */
export function flagEmoji(code: string): string {
  return String.fromCodePoint(...code.toUpperCase().split('').map((c) => 127397 + c.charCodeAt(0)))
}

// National number lengths (digits after the country code) for the countries
// our customers use most. Others fall back to 6..(15 - code digits), the
// international maximum.
const LENGTHS: Record<string, [number, number]> = {
  IN: [10, 10], US: [10, 10], CA: [10, 10], GB: [10, 10], AE: [9, 9], SA: [9, 9], QA: [8, 8], KW: [8, 8],
  OM: [8, 8], BH: [8, 8], SG: [8, 8], AU: [9, 9], NZ: [8, 10], PK: [10, 10], BD: [10, 10], NP: [10, 10],
  LK: [9, 9], MY: [9, 10], DE: [10, 11], FR: [9, 9], NL: [9, 9], IE: [9, 9], ZA: [9, 9], KE: [9, 9],
}

export function phoneLengthFor(country: string): [number, number] {
  const known = LENGTHS[country.toUpperCase()]
  if (known) return known
  const codeDigits = dialCodeFor(country).replace(/\D/g, '').length
  return [6, 15 - codeDigits]
}

/** True when the number has the right digit count (and, for India, starts 6-9). */
export function isValidPhone(country: string, number: string): boolean {
  const digits = number.replace(/\D/g, '')
  const [min, max] = phoneLengthFor(country)
  if (digits.length < min || digits.length > max) return false
  return country.toUpperCase() !== 'IN' || /^[6-9]/.test(digits)
}

const ALIASES: Record<string, string[]> = {
  GB: ['uk', 'england', 'britain', 'great britain', 'scotland', 'wales'],
  US: ['usa', 'america', 'united states of america'],
  AE: ['uae', 'dubai', 'emirates', 'abu dhabi'],
  SA: ['ksa', 'saudi'],
  IN: ['bharat', 'hindustan'],
  KR: ['korea'],
  NL: ['holland'],
}
const POPULAR = ['IN', 'US', 'GB', 'AE', 'SG', 'AU', 'CA', 'SA']
const rank = (code: string) => (POPULAR.includes(code) ? POPULAR.indexOf(code) : POPULAR.length)

function matches(option: { code: string; name: string; dial: string }, query: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 1
  const name = option.name.toLowerCase()
  const digits = q.replace(/^\+/, '')
  if (/^\d+$/.test(digits)) return option.dial.replace('+', '').startsWith(digits) ? 2 : 0
  if (option.code.toLowerCase() === q || (ALIASES[option.code] ?? []).some((a) => a === q)) return 4
  if (name.startsWith(q)) return 3
  if ((ALIASES[option.code] ?? []).some((a) => a.startsWith(q))) return 3
  if (name.split(/[\s-]+/).some((w) => w.startsWith(q))) return 2
  return 0
}

export function PhoneInput({
  country,
  number,
  onCountryChange,
  onNumberChange,
  invalid,
  autoFocus,
  placeholder,
  fieldClassName = 'rounded-xl bg-surface',
}: {
  country: string
  number: string
  onCountryChange: (code: string) => void
  onNumberChange: (digits: string) => void
  invalid?: boolean
  autoFocus?: boolean
  placeholder?: string
  /** Shape and fill of the field, to match the form around it. */
  fieldClassName?: string
}) {
  const [open, setOpenState] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [, max] = phoneLengthFor(country)

  // Every close clears the search, so reopening never starts from an old query.
  const setOpen = (next: boolean | ((o: boolean) => boolean)) =>
    setOpenState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next
      if (!value) setQuery('')
      return value
    })

  const results = useMemo(() => {
    if (!query.trim()) {
      const popular = POPULAR.map((c) => COUNTRY_OPTIONS.find((o) => o.code === c)).filter(Boolean) as typeof COUNTRY_OPTIONS
      return [...popular, ...COUNTRY_OPTIONS.filter((o) => !POPULAR.includes(o.code))]
    }
    return COUNTRY_OPTIONS.map((o) => ({ o, score: matches(o, query) }))
      .filter((x) => x.score > 0)
      // Among equally good matches, the countries most customers pick come first.
      .sort((a, b) => b.score - a.score || rank(a.o.code) - rank(b.o.code) || a.o.name.localeCompare(b.o.name))
      .map((x) => x.o)
  }, [query])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => setActive(0), [query])
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const choose = (code: string) => {
    onCountryChange(code)
    const [, m] = phoneLengthFor(code)
    if (number.length > m) onNumberChange(number.slice(0, m))
    setOpen(false)
    setQuery('')
  }

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      if (results[active]) choose(results[active].code)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const current = COUNTRY_OPTIONS.find((o) => o.code === country)
  const border = invalid ? 'border-destructive focus-within:ring-destructive/15' : 'border-border focus-within:border-primary focus-within:ring-primary/10'

  return (
    <div ref={rootRef} className="relative">
      <div className={`flex items-stretch overflow-hidden border transition focus-within:ring-4 ${fieldClassName} ${border}`}>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`Country: ${current?.name ?? country}`}
          onClick={() => setOpen((o) => !o)}
          onKeyDown={(e) => {
            // Typing a letter on the closed picker opens it already filtered.
            if (/^[a-z]$/i.test(e.key) && !e.metaKey && !e.ctrlKey) {
              e.preventDefault()
              setQuery(e.key)
              setOpen(true)
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              setOpen(true)
            }
          }}
          className="flex shrink-0 items-center gap-2 border-r border-border bg-transparent pl-3.5 pr-2.5 text-[15px] hover:bg-surface-high"
        >
          <span className="text-lg leading-none">{flagEmoji(country)}</span>
          <span className="font-semibold">{current?.dial ?? dialCodeFor(country)}</span>
          <Icon name="expand_more" className="text-[18px] text-text-muted" />
        </button>
        <input
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          autoFocus={autoFocus}
          placeholder={placeholder ?? (country === 'IN' ? '98765 43210' : 'Phone number')}
          value={number}
          onChange={(e) => onNumberChange(e.target.value.replace(/\D/g, '').slice(0, max))}
          className="min-w-0 flex-1 bg-transparent px-3.5 py-3 text-[15px] outline-none placeholder:text-text-muted"
        />
      </div>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_24px_48px_-20px_rgba(0,0,0,0.35)]">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Icon name="search" className="text-[18px] text-text-muted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onListKey}
              placeholder="Search country or code"
              aria-label="Search country"
              className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-text-muted"
            />
          </div>
          <ul ref={listRef} role="listbox" className="max-h-64 overflow-y-auto py-1">
            {results.length === 0 && <li className="px-4 py-3 text-sm text-text-muted">No country matches “{query}”</li>}
            {results.map((o, i) => (
              <li key={o.code}>
                {!query && i === POPULAR.length && <div className="mx-3 my-1 border-t border-border" />}
                <button
                  type="button"
                  role="option"
                  aria-selected={o.code === country}
                  data-index={i}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(o.code)}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${
                    i === active ? 'bg-primary/10' : 'bg-transparent'
                  }`}
                >
                  <span className="text-lg leading-none">{flagEmoji(o.code)}</span>
                  <span className="min-w-0 flex-1 truncate">{o.name}</span>
                  <span className="text-text-muted">{o.dial}</span>
                  {o.code === country && <Icon name="check" className="text-[16px] text-primary" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
