import type { TableEntry } from './TableEntry.ts'

export const HEX_MATRIX_SIZE = 16
export const MIN_8_BIT_VALUE = 0x00
export const MAX_8_BIT_VALUE = 0xff

export interface HexPosition {
  row: number
  column: number
}

export function byteFromPosition(row: number, column: number): number {
  assertNibble(row, 'row')
  assertNibble(column, 'column')
  return (row << 4) | column
}

export function positionFromByte(byte: number): HexPosition {
  assertByte(byte)
  return { row: byte >> 4, column: byte & 0x0f }
}

export function toByteHex(byte: number): string {
  assertByte(byte)
  return byte.toString(16).padStart(2, '0').toUpperCase()
}

export function createEightBitEntryMap(entries: readonly TableEntry[]): Map<number, TableEntry> {
  const entryMap = new Map<number, TableEntry>()

  entries.forEach((entry) => {
    if (entry.key.length === 1 && isByte(entry.key[0])) entryMap.set(entry.key[0], entry)
  })

  return entryMap
}

export function setEightBitValue(
  entries: readonly TableEntry[],
  byte: number,
  value: string
): TableEntry[] {
  assertByte(byte)
  const entryIndex = entries.findIndex((entry) => entry.key.length === 1 && entry.key[0] === byte)

  if (value.length === 0) {
    return entryIndex < 0 ? [...entries] : entries.filter((_, index) => index !== entryIndex)
  }

  if (entryIndex >= 0) {
    return entries.map((entry, index) => (index === entryIndex ? { ...entry, value } : entry))
  }

  return [...entries, { key: [byte], value }]
}

export function assertByte(value: number): void {
  if (!isByte(value)) throw new RangeError('Byte must be an integer between 0 and 255.')
}

function assertNibble(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value >= HEX_MATRIX_SIZE) {
    throw new RangeError(`${name} must be an integer between 0 and 15.`)
  }
}

function isByte(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_8_BIT_VALUE && value <= MAX_8_BIT_VALUE
}
