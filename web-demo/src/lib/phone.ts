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
  return `${dialCode}${input.replace(/\D/g, '')}`
}
