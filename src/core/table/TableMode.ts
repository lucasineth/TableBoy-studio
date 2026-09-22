export const TABLE_MODES = ['8-bit', '16-bit'] as const

export type TableMode = (typeof TABLE_MODES)[number]

export function keyLengthForMode(mode: TableMode): number {
  return mode === '8-bit' ? 1 : 2
}

export function maxAddressForMode(mode: TableMode): number {
  return mode === '8-bit' ? 0xff : 0xffff
}

export function addressCountForMode(mode: TableMode): number {
  return maxAddressForMode(mode) + 1
}
