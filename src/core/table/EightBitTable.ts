import {
  addressFromPagePosition,
  assertTableAddress,
  formatTableAddress,
  positionFromAddress,
  type HexPosition
} from './TableAddress.ts'
import { createTableEntryMap, setTableValue } from './TableDocument.ts'
import type { TableEntry } from './TableEntry.ts'

export { HEX_MATRIX_SIZE, type HexPosition } from './TableAddress.ts'
export const MIN_8_BIT_VALUE = 0x00
export const MAX_8_BIT_VALUE = 0xff

export function byteFromPosition(row: number, column: number): number {
  return addressFromPagePosition(0, row, column, '8-bit')
}

export function positionFromByte(byte: number): HexPosition {
  return positionFromAddress(byte, '8-bit')
}

export function toByteHex(byte: number): string {
  return formatTableAddress(byte, '8-bit')
}

export function createEightBitEntryMap(entries: readonly TableEntry[]): Map<number, TableEntry> {
  return createTableEntryMap(entries, '8-bit')
}

export function setEightBitValue(
  entries: readonly TableEntry[],
  byte: number,
  value: string
): TableEntry[] {
  return setTableValue(entries, byte, value, '8-bit')
}

export function assertByte(value: number): void {
  assertTableAddress(value, '8-bit')
}
