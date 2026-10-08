import { performance } from 'node:perf_hooks'

import { BinarySearchEngine, RelativeSearchEngine } from '../../src/core/search/index.ts'
import {
  createSyntheticInput,
  encodeWithDisplacement,
  MIB,
  placeCandidate
} from './syntheticData.mts'

type Scenario = 'none' | 'few' | 'many' | 'repeated'

interface QueryCase {
  readonly length: number
  readonly query: string
  readonly repeatedQuery: string
}

interface BenchmarkResult {
  readonly sizeMiB: number
  readonly queryLength: number
  readonly scenario: Scenario
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
const scenarios: Scenario[] = ['none', 'few', 'many', 'repeated']
const engine = new RelativeSearchEngine()

function candidateOffsets(scenario: Scenario, inputLength: number, queryLength: number): number[] {
  const finalOffset = inputLength - queryLength
  if (scenario === 'none') return []
  if (scenario === 'few') {
    return [Math.floor(inputLength / 5), Math.floor(inputLength / 2), finalOffset - 17]
  }
  if (scenario === 'repeated') return [Math.floor(inputLength / 4), finalOffset - 31]

  const offsets: number[] = []
  for (let offset = 1024; offset <= finalOffset; offset += 4096) offsets.push(offset)
  return offsets
}

function benchmarkCase(sizeMiB: number, queryCase: QueryCase, scenario: Scenario): BenchmarkResult {
  const query = scenario === 'repeated' ? queryCase.repeatedQuery : queryCase.query
  const input = createSyntheticInput(sizeMiB, scenario === 'repeated')
  const candidate = encodeWithDisplacement(query, 0x70)
  placeCandidate(input, candidate, candidateOffsets(scenario, input.length, candidate.length))

  const startedAt = performance.now()
  const results = engine.search(input, query, { maxResults: 100_000 })
  const durationMs = performance.now() - startedAt

  return {
    sizeMiB,
    queryLength: queryCase.length,
    scenario,
    results: results.length,
    durationMs,
    throughputMiBs: sizeMiB / (durationMs / 1000)
  }
}

function formatResults(results: readonly BenchmarkResult[]): void {
  console.log('size  query  scenario  results  duration(ms)  throughput(MiB/s)')
  for (const result of results) {
    console.log(
      `${String(result.sizeMiB).padStart(4)}  ${String(result.queryLength).padStart(5)}  ${result.scenario.padEnd(8)}  ${String(result.results).padStart(7)}  ${result.durationMs.toFixed(2).padStart(12)}  ${result.throughputMiBs.toFixed(2).padStart(17)}`
    )
  }
}

function createRelativeBuffer(input: Uint8Array): Uint8Array {
  const relative = new Uint8Array(Math.max(0, input.length - 1))
  for (let index = 0; index < relative.length; index += 1) {
    relative[index] = (input[index + 1] - input[index]) & 0xff
  }
  return relative
}

function createQuerySignature(query: string): Uint8Array {
  const values = Array.from(query, (symbol) => (symbol.codePointAt(0) ?? 0) & 0xff)
  return Uint8Array.from(
    { length: values.length - 1 },
    (_, index) => (values[index + 1] - values[index]) & 0xff
  )
}

function compareAlgorithms(): void {
  const sizeMiB = 64
  const query = 'SEARCH!!'
  const input = createSyntheticInput(sizeMiB)

  const directStartedAt = performance.now()
  const directResults = engine.search(input, query, { maxResults: 100_000 })
  const directDurationMs = performance.now() - directStartedAt

  const transformedStartedAt = performance.now()
  const relativeInput = createRelativeBuffer(input)
  const transformedResults = new BinarySearchEngine().search(
    relativeInput,
    createQuerySignature(query),
    { maxResults: 100_000 }
  )
  const transformedDurationMs = performance.now() - transformedStartedAt

  console.log('\nAlgorithm comparison (64 MiB, 8 symbols, no result)')
  console.log(
    JSON.stringify({
      directWindow: {
        results: directResults.length,
        durationMs: Number(directDurationMs.toFixed(2)),
        extraInputBufferMiB: 0
      },
      transformedInput: {
        results: transformedResults.length,
        durationMs: Number(transformedDurationMs.toFixed(2)),
        extraInputBufferMiB: Number((relativeInput.byteLength / MIB).toFixed(2))
      }
    })
  )
}

async function measureEventLoopImpact(): Promise<void> {
  const input = createSyntheticInput(64)
  let timerDelayMs = 0
  const scheduledAt = performance.now()
  const timer = new Promise<void>((resolve) => {
    setTimeout(() => {
      timerDelayMs = performance.now() - scheduledAt
      resolve()
    }, 0)
  })

  const startedAt = performance.now()
  engine.search(input, 'SEARCH!!', { maxResults: 100_000 })
  const durationMs = performance.now() - startedAt
  await timer

  console.log('\nEvent-loop probe (64 MiB, 8 symbols, no result)')
  console.log(
    JSON.stringify({
      searchDurationMs: Number(durationMs.toFixed(2)),
      zeroDelayTimerObservedAfterMs: Number(timerDelayMs.toFixed(2))
    })
  )
}

const results: BenchmarkResult[] = []
for (const sizeMiB of sizesMiB) {
  for (const queryCase of queries) {
    for (const scenario of scenarios) {
      results.push(benchmarkCase(sizeMiB, queryCase, scenario))
    }
  }
}

formatResults(results)
compareAlgorithms()
await measureEventLoopImpact()

const totalMiB = results.reduce((total, result) => total + result.sizeMiB, 0)
console.log(`\nTotal benchmark input scanned: ${totalMiB} MiB`)
