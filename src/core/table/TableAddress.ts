import { keyLengthForMode, maxAddressForMode, type TableMode } from './TableMode.ts'

export type TableAddress = number

export const HEX_MATRIX_SIZE = 16
export const MIN_TABLE_ADDRESS = 0x0000
export const MAX_TABLE_PAGE = 0xff

export interface HexPosition {
  row: number
  column: number
}

export function addressFromKey(key: readonly number[], mode: TableMode): TableAddress {
  const expectedLength = keyLengthForMode(mode)
  if (key.length !== expectedLength) {
    throw new RangeError(`${mode} table keys must contain exactly ${expectedLength} byte(s).`)
  }

  key.forEach(assertKeyByte)
  return key.reduce((address, byte) => (address << 8) | byte, 0)
}

export function keyFromAddress(address: TableAddress, mode: TableMode): number[] {
  assertTableAddress(address, mode)
  return mode === '8-bit' ? [address] : [(address >> 8) & 0xff, address & 0xff]
}

export function addressFromPagePosition(
  page: number,
  row: number,
  column: number,
  mode: TableMode
): TableAddress {
  assertNibble(row, 'row')
  assertNibble(column, 'column')

  if (mode === '8-bit') {
    if (page !== 0) throw new RangeError('8-bit tables only use page 00.')
    return (row << 4) | column
  }

  assertTablePage(page)
  return (page << 8) | (row << 4) | column
}

export function positionFromAddress(address: TableAddress, mode: TableMode): HexPosition {
  assertTableAddress(address, mode)
  return { row: (address >> 4) & 0x0f, column: address & 0x0f }
}

export function pageFromAddress(address: TableAddress, mode: TableMode): number {
  assertTableAddress(address, mode)
  return mode === '8-bit' ? 0 : address >> 8
}

export function formatTableAddress(address: TableAddress, mode: TableMode): string {
  assertTableAddress(address, mode)
  return address
    .toString(16)
    .padStart(mode === '8-bit' ? 2 : 4, '0')
    .toUpperCase()
}

export function assertTableAddress(address: number, mode: TableMode): void {
  if (
    !Number.isInteger(address) ||
    address < MIN_TABLE_ADDRESS ||
    address > maxAddressForMode(mode)
  ) {
    const maximum = formatUnvalidatedMaximum(mode)
    throw new RangeError(`${mode} address must be an integer between 0 and ${maximum}.`)
  }
}

export function assertTablePage(page: number): void {
  if (!Number.isInteger(page) || page < 0 || page > MAX_TABLE_PAGE) {
    throw new RangeError('Table page must be an integer between 00 and FF.')
  }
}

function assertKeyByte(byte: number, index: number): void {
  if (!Number.isInteger(byte) || byte < 0 || byte > 0xff) {
    throw new RangeError(`Key byte at index ${index} must be an integer between 0 and 255.`)
  }
}

function assertNibble(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value >= HEX_MATRIX_SIZE) {
    throw new RangeError(`${name} must be an integer between 0 and 15.`)
  }
}

function formatUnvalidatedMaximum(mode: TableMode): string {
  return maxAddressForMode(mode).toString(16).toUpperCase()
}
