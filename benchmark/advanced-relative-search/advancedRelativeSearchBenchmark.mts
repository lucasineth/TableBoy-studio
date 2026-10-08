import { performance } from 'node:perf_hooks'

import { RelativeSearchEngine } from '../../src/core/search/index.ts'

const MIB = 1024 * 1024
const sizesMiB = [1, 16, 64]
const engine = new RelativeSearchEngine()

interface BenchmarkResult {
  readonly sizeMiB: number
  readonly mode: string
  readonly results: number
  readonly durationMs: number
  readonly throughputMiBs: number
}

function syntheticBytes(sizeMiB: number): Uint8Array {
  const bytes = new Uint8Array(sizeMiB * MIB)
  let state = 0x41c6ce57
  for (let index = 0; index < bytes.length; index += 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    bytes[index] = state >>> 24
  }
  return bytes
}

function run(
  sizeMiB: number,
  mode: string,
  input: Uint8Array,
  search: () => readonly unknown[]
): BenchmarkResult {
  const startedAt = performance.now()
  const results = search()
  const durationMs = performance.now() - startedAt
  return {
    sizeMiB,
    mode,
    results: results.length,
    durationMs,
    throughputMiBs: sizeMiB / (durationMs / 1000)
  }
}

const results: BenchmarkResult[] = []
for (const sizeMiB of sizesMiB) {
  const input = syntheticBytes(sizeMiB)
  const base = input.length - 64
  input.set([0x81, 0x82, 0x83, 0x84, 0x85], base)
  input.set([0x91, 0xee, 0x93, 0x94, 0x95], base + 16)
  input.set([0xa0, 0xaa, 0xb4, 0xbe, 0xc8], base + 32)

  results.push(
    run(sizeMiB, 'normal', input, () => engine.search(input, 'ABCDE', { maxResults: 100 })),
    run(sizeMiB, 'wildcard', input, () =>
      engine.search(input, 'A?CDE', { wildcards: true, maxResults: 100 })
    ),
    run(sizeMiB, 'custom-sequence', input, () =>
      engine.search(input, 'ABCDE', {
        characterSequence: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        maxResults: 100
      })
    ),
    run(sizeMiB, 'value-scan', input, () =>
      engine.searchValues(input, [10, 20, 30, 40, 50], { maxResults: 100 })
    )
  )
}

console.log('size  mode             results  duration(ms)  throughput(MiB/s)')
for (const result of results) {
  console.log(
    `${String(result.sizeMiB).padStart(4)}  ${result.mode.padEnd(16)} ${String(result.results).padStart(7)}  ${result.durationMs.toFixed(2).padStart(12)}  ${result.throughputMiBs.toFixed(2).padStart(17)}`
  )
}
