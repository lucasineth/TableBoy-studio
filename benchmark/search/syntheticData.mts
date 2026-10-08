const MIB = 1024 * 1024

export function createSyntheticBinary(sizeMiB: number): Uint8Array {
  const data = new Uint8Array(sizeMiB * MIB)
  let state = 0x6d2b79f5

  for (let index = 0; index < data.length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    data[index] = state & 0x7f
  }

  return data
}

export function createPattern(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => 0x80 + ((index * 37 + length) & 0x7f))
}

export function placePattern(
  data: Uint8Array,
  pattern: Uint8Array,
  offsets: readonly number[]
): void {
  for (const offset of offsets) data.set(pattern, offset)
}

export { MIB }
