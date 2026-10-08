import { performance } from 'node:perf_hooks'

import type { ByteOrder } from '../../src/core/bytes/index.ts'
import { RelativeSearchEngine } from '../../src/core/search/index.ts'
import { createSyntheticInput, encode16, MIB, placeCandidate } from './syntheticData.mts'

type Scenario = 'none' | 'few' | 'many' | 'repeated'

interface QueryCase {
  readonly length: number
  readonly query: string
  readonly repeatedQuery: string
}

interface BenchmarkResult {
  readonly group: 'scale' | 'scenario'
  readonly sizeMiB: number
  readonly queryLength: number
  readonly scenario: Scenario
  readonly byteOrder: ByteOrder
  readonly alignment: 1 | 2
  readonly results: number
  readonly durationMs: number
  readonly throughputMiBs: number
}

const sizesMiB = [1, 4, 16, 32, 64]
const queries: QueryCase[] = [
  { length: 3, query: 'ABC', repeatedQuery: 'AAA' },
  { length: 5, query: 'HELLO', repeatedQuery: 'LEVEL' },
  { length: 8, query: 'SEARCH!!', repeatedQuery: 'ABBAABBA' },
  { length: 16, query: 'RELATIVE-SEARCH!', repeatedQuery: 'MISSISSIPPI-AAAA' }
]
const byteOrders: ByteOrder[] = ['little-endian', 'big-endian']
const alignments = [1, 2] as const
const scenarios: Scenario[] = ['none', 'few', 'many', 'repeated']
const engine = new RelativeSearchEngine()

function alignedOffset(offset: number, alignment: 1 | 2): number {
  const aligned = offset - (offset % alignment)
  return alignment === 1 && aligned % 2 === 0 ? aligned + 1 : aligned
}

function candidateOffsets(
  scenario: Scenario,
  inputLength: number,
  candidateLength: number,
  alignment: 1 | 2
): number[] {
  const finalOffset = inputLength - candidateLength
  if (scenario === 'none') return []
  if (scenario === 'few' || scenario === 'repeated') {
    return [
      alignedOffset(Math.floor(inputLength / 5), alignment),
      alignedOffset(Math.floor(inputLength / 2), alignment),
      alignedOffset(finalOffset - 32, alignment)
    ]
  }

  const offsets: number[] = []
  for (let offset = 65_536; offset <= finalOffset; offset += 65_536) {
    offsets.push(alignedOffset(offset, alignment))
  }
  return offsets
}

function runCase(
  group: BenchmarkResult['group'],
  input: Uint8Array,
  sizeMiB: number,
  queryCase: QueryCase,
  scenario: Scenario,
  byteOrder: ByteOrder,
  alignment: 1 | 2
): BenchmarkResult {
  const query = scenario === 'repeated' ? queryCase.repeatedQuery : queryCase.query
  const candidate = encode16(query, 0x8100, byteOrder)
  const workingInput = scenario === 'none' ? input : input.slice()
  placeCandidate(
    workingInput,
    candidate,
    candidateOffsets(scenario, workingInput.length, candidate.length, alignment)
  )

  const startedAt = performance.now()
  const results = engine.search(workingInput, query, {
    valueWidth: 2,
    byteOrder,
    alignment,
    maxResults: 100_000
  })
  const durationMs = performance.now() - startedAt

  return {
    group,
    sizeMiB,
    queryLength: queryCase.length,
    scenario,
    byteOrder,
    alignment,
    results: results.length,
    durationMs,
    throughputMiBs: sizeMiB / (durationMs / 1000)
  }
}

function formatResults(title: string, results: readonly BenchmarkResult[]): void {
  console.log(`\n${title}`)
  console.log('size  query  scenario  order  align  results  duration(ms)  throughput(MiB/s)')
  for (const result of results) {
    const order = result.byteOrder === 'little-endian' ? 'LE' : 'BE'
    console.log(
      `${String(result.sizeMiB).padStart(4)}  ${String(result.queryLength).padStart(5)}  ${result.scenario.padEnd(8)}  ${order.padStart(5)}  ${String(result.alignment).padStart(5)}  ${String(result.results).padStart(7)}  ${result.durationMs.toFixed(2).padStart(12)}  ${result.throughputMiBs.toFixed(2).padStart(17)}`
    )
  }
}

const scaleResults: BenchmarkResult[] = []
for (const sizeMiB of sizesMiB) {
  const input = createSyntheticInput(sizeMiB)
  for (const queryCase of queries) {
    for (const byteOrder of byteOrders) {
      for (const alignment of alignments) {
        scaleResults.push(runCase('scale', input, sizeMiB, queryCase, 'none', byteOrder, alignment))
      }
    }
  }
}

const scenarioSizeMiB = 16
const scenarioInput = createSyntheticInput(scenarioSizeMiB)
const scenarioQuery = queries[2]
const scenarioResults: BenchmarkResult[] = []
for (const scenario of scenarios) {
  for (const byteOrder of byteOrders) {
    for (const alignment of alignments) {
      scenarioResults.push(
        runCase(
          'scenario',
          scenarioInput,
          scenarioSizeMiB,
          scenarioQuery,
          scenario,
          byteOrder,
          alignment
        )
      )
    }
  }
}

formatResults('16-bit scaling matrix (no occurrence)', scaleResults)
formatResults('16-bit scenario matrix (16 MiB, 8 symbols)', scenarioResults)

const allResults = [...scaleResults, ...scenarioResults]
const totalMiB = allResults.reduce((total, result) => total + result.sizeMiB, 0)
const aggregate = (predicate: (result: BenchmarkResult) => boolean): number => {
  const selected = allResults.filter(predicate)
  return selected.reduce((total, result) => total + result.throughputMiBs, 0) / selected.length
}

console.log('\nAggregate throughput (arithmetic mean of cases)')
console.log(
  JSON.stringify({
    littleEndianMiBs: Number(
      aggregate((result) => result.byteOrder === 'little-endian').toFixed(2)
    ),
    bigEndianMiBs: Number(aggregate((result) => result.byteOrder === 'big-endian').toFixed(2)),
    alignment1MiBs: Number(aggregate((result) => result.alignment === 1).toFixed(2)),
    alignment2MiBs: Number(aggregate((result) => result.alignment === 2).toFixed(2)),
    totalInputScannedMiB: totalMiB,
    syntheticFixtureBytes:
      scenarioInput.length + sizesMiB.reduce((sum, size) => sum + size * MIB, 0)
  })
)
