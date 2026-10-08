export type ValueScanParseResult =
  | { readonly ok: true; readonly values: readonly number[] }
  | { readonly ok: false; readonly message: string }

const DECIMAL_VALUE = /^\d+$/
const HEX_VALUE = /^0x[0-9a-f]+$/i

export function parseValueScan(input: string, valueWidth: 1 | 2): ValueScanParseResult {
  const trimmed = input.trim()
  if (trimmed.length === 0) return { ok: false, message: 'Enter at least one numeric value.' }

  const tokens = trimmed.split(/[\s,]+/)
  const maximum = valueWidth === 1 ? 0xff : 0xffff
  const values: number[] = []
  for (const [index, token] of tokens.entries()) {
    if (!DECIMAL_VALUE.test(token) && !HEX_VALUE.test(token)) {
      return { ok: false, message: `Value ${index + 1} is not valid decimal or 0x-prefixed hex.` }
    }
    const value = HEX_VALUE.test(token) ? Number.parseInt(token.slice(2), 16) : Number(token)
    if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
      return { ok: false, message: `Value ${index + 1} must be between 0 and ${maximum}.` }
    }
    values.push(value)
  }
  return { ok: true, values }
}
