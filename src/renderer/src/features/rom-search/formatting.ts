import type { RelativeCharacterMapping } from '../../../../core/search/index.ts'

const HEX_INPUT = /^(?:0x)?[0-9a-f]+$/i

export interface ParsedHexOffset {
  readonly ok: true
  readonly value: number
}

export interface InvalidHexOffset {
  readonly ok: false
  readonly message: string
}

export function parseHexOffset(
  input: string,
  fallback: number,
  maximum: number,
  label: string
): ParsedHexOffset | InvalidHexOffset {
  const value = input.trim()
  if (value.length === 0) return { ok: true, value: fallback }
  if (!HEX_INPUT.test(value)) {
    return { ok: false, message: `${label} must be a hexadecimal offset.` }
  }

  const parsed = Number.parseInt(value.replace(/^0x/i, ''), 16)
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maximum) {
    return { ok: false, message: `${label} must be between 0 and ${formatHexOffset(maximum)}.` }
  }
  return { ok: true, value: parsed }
}

export function formatHexOffset(offset: number, documentSize = 0): string {
  const highestOffset = Math.max(0, documentSize - 1, offset)
  const width = Math.max(8, highestOffset.toString(16).length)
  return `0x${offset.toString(16).toUpperCase().padStart(width, '0')}`
}

export function formatHexBytes(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ')
}

export function formatMapping(
  mappings: readonly RelativeCharacterMapping[],
  valueWidth: 1 | 2
): string {
  const width = valueWidth * 2
  return mappings
    .map(
      ({ character, value }) =>
        `${displayCharacter(character)} = ${value.toString(16).toUpperCase().padStart(width, '0')}`
    )
    .join('   ')
}

export function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KiB`
  return `${(size / (1024 * 1024)).toFixed(2)} MiB`
}

function displayCharacter(character: string): string {
  return character === ' ' ? 'SPACE' : character
}
