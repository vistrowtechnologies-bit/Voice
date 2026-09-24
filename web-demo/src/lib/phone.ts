import { useAuth } from './auth'
import { COUNTRY_DIAL_CODES, PRIMARY_REGION_FOR_DIAL } from './countries'

// EnableX needs full E.164 (country code + number, e.g. +919812345678) - a
// bare local number gets far enough to hit their infra but then fails with a
// confusing raw 502 instead of a clean validation error, so callers should
// check this before ever placing a real call.
export function isE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value.trim())
}

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' })
  } catch {
    return null
  }
})()

/** "India" for "IN"; falls back to the code where Intl has no name. */
export function countryName(code: string): string {
  return regionNames?.of(code) ?? code
}

const DIAL_BY_COUNTRY = new Map(COUNTRY_DIAL_CODES)

/** "+91" for "IN" — what the dashboard pre-selects for this workspace. */
export function dialCodeFor(country: string | undefined): string {
  return DIAL_BY_COUNTRY.get((country || 'IN').toUpperCase()) ?? '+91'
}

/** The signed-in workspace's calling code — the default for every phone
 * input, so a UAE workspace types local numbers without picking +971 each time. */
export function useAccountDialCode(): string {
  const { user } = useAuth()
  return dialCodeFor(user?.accountCountry)
}

/** Every country, by name, for the workspace country picker. */
export const COUNTRY_OPTIONS = COUNTRY_DIAL_CODES
  .map(([code, dial]) => ({ code, dial, name: countryName(code) }))
  .sort((a, b) => a.name.localeCompare(b.name))

/** One entry per calling code, labelled by its main country, for the
 * code picker beside phone inputs (a +1 list of 25 countries would be noise). */
export const COMMON_DIAL_CODES = Object.entries(PRIMARY_REGION_FOR_DIAL)
  .map(([dial, code]) => ({ code, dial, name: countryName(code) }))
  .sort((a, b) => a.name.localeCompare(b.name))

/** Best guess of a new visitor's country from the browser, before they have
 * a workspace. Only a default — they can change it. */
export function guessCountry(): string {
  const tags = [...(navigator.languages ?? []), navigator.language]
  for (const tag of tags) {
    const region = tag?.split('-')[1]?.toUpperCase()
    if (region && DIAL_BY_COUNTRY.has(region)) return region
  }
  return 'IN'
}

/** Build the provider-safe number while still accepting a pasted E.164 value. */
export function composeE164(dialCode: string, localNumber: string): string {
  const input = localNumber.trim()
  if (input.startsWith('+')) return `+${input.slice(1).replace(/\D/g, '')}`
  let digits = input.replace(/\D/g, '')
  const countryDigits = dialCode.replace(/\D/g, '')

  // Pasting 919812345678 while +91 is selected must not become
  // +91919812345678. Accept that common operator workflow as-is.
  if (digits.startsWith(countryDigits) && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`
  }
  // Indian numbers are frequently copied with the domestic trunk prefix.
  if (dialCode === '+91' && digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1)
  }
  return `${dialCode}${digits}`
}

/** Split a stored number for the country-code selector. Unknown explicit
 * international codes stay intact in the number box so saving is lossless. */
export function splitE164(value: string, fallbackDial = '+91'): { dialCode: string; localNumber: string } {
  const input = value.trim()
  const match = [...COMMON_DIAL_CODES]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((item) => input.startsWith(item.dial))
  if (!match) return { dialCode: fallbackDial, localNumber: input }
  return { dialCode: match.dial, localNumber: input.slice(match.dial.length) }
}
