export const MIB = 1024 * 1024

export function createSyntheticInput(sizeMiB: number, alternating = false): Uint8Array {
  const input = new Uint8Array(sizeMiB * MIB)
  if (alternating) {
    for (let index = 0; index < input.length; index += 1) {
      input[index] = index % 2 === 0 ? 0xaa : 0x55
    }
  }
  return input
}

export function encodeWithDisplacement(query: string, displacement: number): Uint8Array {
  return Uint8Array.from(Array.from(query), (symbol) => {
    const codePoint = symbol.codePointAt(0)
    if (codePoint === undefined) throw new Error('Benchmark query contains an empty symbol.')
    return (codePoint + displacement) & 0xff
  })
}

export function placeCandidate(
  input: Uint8Array,
  candidate: Uint8Array,
  offsets: readonly number[]
): void {
  for (const offset of offsets) input.set(candidate, offset)
}
