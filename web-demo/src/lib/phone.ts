// EnableX needs full E.164 (country code + number, e.g. +919812345678) — a
// bare local number gets far enough to hit their infra but then fails with a
// confusing raw 502 instead of a clean validation error, so callers should
// check this before ever placing a real call.
export function isE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value.trim())
}
