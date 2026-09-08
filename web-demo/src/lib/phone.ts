// EnableX needs full E.164 (country code + number, e.g. +919812345678) - a
// bare local number gets far enough to hit their infra but then fails with a
// confusing raw 502 instead of a clean validation error, so callers should
// check this before ever placing a real call.
export function isE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value.trim())
}

export const COMMON_DIAL_CODES = [
  { code: 'IN', dial: '+91' },
  { code: 'US', dial: '+1' },
  { code: 'CA', dial: '+1' },
  { code: 'GB', dial: '+44' },
  { code: 'AE', dial: '+971' },
  { code: 'SG', dial: '+65' },
  { code: 'AU', dial: '+61' },
] as const

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
