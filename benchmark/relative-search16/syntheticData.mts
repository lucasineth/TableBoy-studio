import { writeUint16, type ByteOrder } from '../../src/core/bytes/index.ts'

export const MIB = 1024 * 1024

export function createSyntheticInput(sizeMiB: number): Uint8Array {
  const input = new Uint8Array(sizeMiB * MIB)
  let state = 0x6d2b79f5

  for (let index = 0; index < input.length; index += 1) {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    input[index] = state & 0xff
  }

  return input
}

export function encode16(query: string, displacement: number, byteOrder: ByteOrder): Uint8Array {
  const symbols = Array.from(query)
  const candidate = new Uint8Array(symbols.length * 2)

  symbols.forEach((symbol, index) => {
    const value = ((symbol.codePointAt(0) ?? 0) + displacement) & 0xffff
    candidate.set(writeUint16(value, byteOrder), index * 2)
  })

  return candidate
}

export function placeCandidate(
  input: Uint8Array,
  candidate: Uint8Array,
  offsets: readonly number[]
): void {
  for (const offset of offsets) input.set(candidate, offset)
}
